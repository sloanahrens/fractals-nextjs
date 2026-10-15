#!/usr/bin/env bash
#
# The version check of the integration job (docs/plans/2026-10-08-automated-release-design.md,
# section 2): poll the deployed app's version endpoint until it reports the
# commit that was just deployed, and fail the job when it never does.
#
# A health check is not enough, and that is the whole of this script's reason to
# exist. A revision that answers on its health path can still be the previous
# one -- a deploy that has not finished moving traffic, or a landing that
# superseded this one -- so "the service is up" says nothing about which commit
# is serving. The integration job's result is what the release bot reads as
# "this commit is green on staging" (docs/plans/2026-10-08-..., section 2), so
# the job has to tie together two facts that a periodic sweep would let drift:
# the commit it deployed, and the commit the service reports.
#
# Like health.sh, this script only reads: no cloud call, no token, no revision,
# no traffic shift, nothing written outside its own temporary directory. That is
# what lets the integration job run against a service the deploy job has just
# changed without changing it any further.
#
# Usage:
#   wait_version.sh --url https://... --sha <40 hex> [--path /api/version]
#                   [--timeout 300] [--interval 5] [--attempt-timeout 10]
#                   [--dry-run]
#
# Exits 0 when the service reports --sha, 1 when the timeout runs out while it
# reports another commit, and 2 when the timeout runs out with no usable answer
# at all (unreachable, not a 200, or a body that is not JSON carrying a commit).
# The two failures are different things to the reader of a job log: a wrong
# commit is a deploy that did not take, and no answer is a service -- or a
# version endpoint -- that is not there.
#
# Prints observed=<commit> and attempts=<n> on stdout, in the key=value style of
# the other scripts' outputs. observed= is empty when no usable answer arrived.
# A refused input exits non-zero through lib.sh's die, prints no observed= line,
# and says which input was wrong on stderr.
#
# Environment fallbacks: GT_SERVICE_URL, GT_COMMIT_SHA, GT_VERSION_PATH,
# GT_VERSION_TIMEOUT, GT_VERSION_INTERVAL, GT_ATTEMPT_TIMEOUT, DRY_RUN=1.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

URL=${GT_SERVICE_URL:-}
SHA=${GT_COMMIT_SHA:-}
VERSION_PATH=${GT_VERSION_PATH:-/api/version}
TIMEOUT=${GT_VERSION_TIMEOUT:-300}
INTERVAL=${GT_VERSION_INTERVAL:-5}
ATTEMPT_TIMEOUT=${GT_ATTEMPT_TIMEOUT:-10}

# MAX_BODY_BYTES is how much of a response body is ever read. The body comes
# from a service over the network, and an endpoint that is not the one this
# script was pointed at can answer with anything: a body that is huge, or
# endless, must not be held in memory, put in a log line, or written to a file
# without a bound.
MAX_BODY_BYTES=65536
# MAX_VALUE_CHARS is how much of the body's commit field can reach an output
# line. A commit is 40 characters, so anything longer is not one; the bound is
# generous because the value is what the service chose to report.
MAX_VALUE_CHARS=80
# MAX_EXCERPT_CHARS is how much of a commit field that is not a commit is quoted
# back to the operator as evidence. It is bounded for the same reason.
MAX_EXCERPT_CHARS=48
# COMMIT_RE is what a reported commit has to look like before it counts as a
# commit the service is running. Without it, "the service reports another
# commit" would include whatever text an unrelated endpoint on that URL answers
# with -- an error page, a proxy's HTML -- and the job would report a wrong
# commit where it should report no answer at all.
COMMIT_RE='^[0-9a-f]{7,64}$'

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --url URL --sha SHA [options]" \
    '' \
    '  --url URL               service URL from up.sh (GT_SERVICE_URL)' \
    '  --sha SHA               commit that was just deployed, 40 lowercase hex (GT_COMMIT_SHA)' \
    '  --path /path            version endpoint on that URL, default /api/version (GT_VERSION_PATH)' \
    '  --timeout SECONDS       give up after this long, default 300 (GT_VERSION_TIMEOUT)' \
    '  --interval SECONDS      wait between attempts, default 5 (GT_VERSION_INTERVAL)' \
    '  --attempt-timeout SEC   per-request timeout, default 10 (GT_ATTEMPT_TIMEOUT)' \
    '  --dry-run               print the poll without making a request' \
    '' \
    'Exits 0 when the service reports SHA, 1 when it reports another commit,' \
    '2 when it never gives an answer. Prints observed=<commit> and attempts=<n>.' \
    'Read-only: it changes nothing, and holds no credential.'
}

while [[ $# -gt 0 ]]; do
  if common_flag "$@"; then shift; continue; fi
  case $1 in
  --url)
    URL=${2:-}
    shift 2
    ;;
  --sha)
    SHA=${2:-}
    shift 2
    ;;
  --path)
    VERSION_PATH=${2:-}
    shift 2
    ;;
  --timeout)
    TIMEOUT=${2:-}
    shift 2
    ;;
  --interval)
    INTERVAL=${2:-}
    shift 2
    ;;
  --attempt-timeout)
    ATTEMPT_TIMEOUT=${2:-}
    shift 2
    ;;
  *) die "unknown argument: $1 (try --help)" ;;
  esac
done

need "--url (or GT_SERVICE_URL)" "$URL"
need "--sha (or GT_COMMIT_SHA)" "$SHA"

# The URL is https, and http only on localhost, which is where the tests point
# it. The check is not about the endpoint's own security: a plain-http URL
# anywhere else would put the version handshake on the network in clear text,
# and the integration job runs against a Cloud Run URL that is always https.
if [[ ! $URL =~ ^https://[^[:space:]]+$ ]] &&
  [[ ! $URL =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?(/[^[:space:]]*)?$ ]]; then
  die "url must be https://..., and http:// only on localhost where the tests point it, got: $URL"
fi
[[ $URL != */ ]] || die "url must not end with a slash, got: $URL"
[[ $VERSION_PATH == /* ]] || die "version path must start with /, got: $VERSION_PATH"
[[ $VERSION_PATH != *[[:space:]]* ]] || die "version path must not contain whitespace, got: $VERSION_PATH"
[[ $SHA =~ ^[0-9a-f]{40}$ ]] ||
  die "sha must be the full 40 character lowercase git commit that was deployed, got: $SHA"

for seconds in "$TIMEOUT" "$INTERVAL" "$ATTEMPT_TIMEOUT"; do
  [[ $seconds =~ ^[0-9]+$ ]] || die "timeout, interval and attempt-timeout must be whole seconds, got: $seconds"
done
((TIMEOUT >= 1)) || die "timeout must be at least 1 second"
((INTERVAL >= 1)) || die "interval must be at least 1 second"

require_tools

TARGET="$URL$VERSION_PATH"

# body_cleanup removes the body file and its directory. It is registered with
# on_exit rather than with a trap of its own (lib.sh), and it is safe to call at
# any time: with nothing to remove it does nothing.
body_cleanup() {
  [[ -n ${BODY_DIR:-} ]] || return 0
  rm -f "$BODY_FILE"
  rmdir "$BODY_DIR" 2>/dev/null || true
  BODY_DIR=''
}

# The body goes to a file rather than into a variable, because that is where
# curl's own --output puts it, and because reading a file is what lets the body
# be bounded (MAX_BODY_BYTES) while the status of the same request is read
# separately from --write-out. The directory is private, and the file is removed
# however the script ends: the body is not a credential, but it is network input
# this script wrote, so it does not outlive the script.
BODY_DIR=$(mktemp -d "${TMPDIR:-/tmp}/gt-wait-version.XXXXXX") ||
  die "could not create a private directory for the response body"
chmod 700 "$BODY_DIR"
BODY_FILE="$BODY_DIR/body"
on_exit body_cleanup

# report CODE MESSAGE prints the two lines the workflow reads -- observed= and
# attempts= -- then the message on stderr, and exits with CODE. It is die's
# sibling with the exit code the caller chooses, because the two ways this wait
# can fail are different failures and the job's reader has to tell them apart.
report() {
  local code=$1
  shift
  printf 'observed=%s\nattempts=%s\n' "$observed" "$attempt"
  printf '%s: error: %s\n' "$SCRIPT_NAME" "$*" >&2
  exit "$code"
}

if dry_run; then
  step "Version wait plan"
  run curl --silent --show-error --output "$BODY_FILE" --write-out '%{http_code}' \
    --max-time "$ATTEMPT_TIMEOUT" "$TARGET"
  note "would poll $TARGET every ${INTERVAL}s for up to ${TIMEOUT}s until its commit field is $SHA, and write it to the file above"
  note "exit 1 if the service reports a commit that is not $SHA, 2 if it never gives an answer (nothing is requested in a dry run)"
  exit 0
fi

step "Waiting for $TARGET to report commit $SHA (every ${INTERVAL}s, up to ${TIMEOUT}s)"
started=$(now_s)
attempt=0
observed=''
last_reason='no attempt was made'

while :; do
  attempt=$((attempt + 1))
  # A refused connection or a timeout is a retry, not a crash: curl's exit code
  # is dropped and only the status of a request that completed decides.
  status=$(curl --silent --show-error --output "$BODY_FILE" --write-out '%{http_code}' \
    --max-time "$ATTEMPT_TIMEOUT" "$TARGET" 2>/dev/null || true)

  value=''
  reason='no response'
  if [[ -n $status ]]; then
    reason="status $status"
  fi

  # Only a 200 is an answer. A 4xx or a 5xx from a service that is coming up is
  # something to retry, and its body is an error page -- a commit read out of
  # one would be a commit nothing deployed.
  if [[ $status == 200 ]]; then
    body=$(head -c "$MAX_BODY_BYTES" "$BODY_FILE" 2>/dev/null) || body=''
    if [[ -z $body ]]; then
      reason='a 200 with an empty body'
    elif ! value=$(jq -r 'if type == "object" then (.commit | select(type == "string")) else empty end' \
      <<<"$body" 2>/dev/null); then
      reason='a 200 whose body is not JSON'
    else
      # The value is untrusted text from the network, and it is bounded here
      # before it can reach anything: control characters (which would break the
      # one-line key=value output) are dropped, and what is left is cut to
      # MAX_VALUE_CHARS. Nothing evaluates it -- jq read it as JSON, and every
      # print below passes it to printf as an argument.
      value=$(LC_ALL=C tr -cd '[:print:]' <<<"$value") || value=''
      value=${value:0:$MAX_VALUE_CHARS}
      if [[ -z $value ]]; then
        reason='a 200 whose JSON carries no commit string'
      elif [[ $value == "$SHA" ]]; then
        observed=$value
        note "attempt $attempt: the service reports commit $value"
        printf 'observed=%s\nattempts=%s\n' "$observed" "$attempt"
        exit 0
      elif [[ $value =~ $COMMIT_RE ]]; then
        reason="commit $value"
      else
        reason="a commit field that is not a commit: ${value:0:$MAX_EXCERPT_CHARS}"
      fi
    fi
  fi

  # Only a commit-shaped value is a commit the service is running, and only that
  # is worth reporting as such: it is what exit 1 is for.
  if [[ $value =~ $COMMIT_RE ]]; then
    observed=$value
  fi
  last_reason=$reason

  note "attempt $attempt: $reason"
  (($(now_s) - started + INTERVAL <= TIMEOUT)) || break
  sleep "$INTERVAL"
done

if [[ -n $observed ]]; then
  report 1 "timed out after $(($(now_s) - started))s: $TARGET reports commit $observed, not $SHA, after $attempt attempt(s). The service is not serving the commit that was just deployed, so its result does not describe this commit."
fi

report 2 "timed out after $(($(now_s) - started))s with no usable answer from $TARGET after $attempt attempt(s): the last one was $last_reason. An unreachable service, a non-200 and a body with no commit in it are the same thing to this job -- it cannot say the deployed commit is the one serving."
