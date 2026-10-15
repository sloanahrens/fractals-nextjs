#!/usr/bin/env bash
#
# One read-only pass over a deployed app: the health path, the explorer page,
# the version route and the static social card. It answers the one question a
# service that is "up" has not answered yet -- is it serving the things a
# visitor asks it for -- and it is what to type at a service a deploy has just
# moved, from a machine with a shell, curl and nothing checked out.
#
# It is not the integration tier. `make integration` reads what the pages say
# (the view a link carries, the picture the head names) and installs
# node_modules to do it; this reads status codes only, has no opinion about a
# body, and holds no credential. The two do not overlap: a 2xx from here says a
# path is served, not that what it serves is right.
#
# It lives in scripts/, not in scripts/release/ beside the checks it resembles.
# That directory is a copy of the devops repository's release scripts, refreshed
# byte for byte, and its bats suite pins the set of files in it (tests/
# usage.bats): a check this app wants, living there, would either be deleted by
# the next refresh or would need the vendored test edited to survive it. What it
# does share with that directory is called rather than copied -- the health path
# is health.sh's, where "wait out a revision that is still coming up" already
# lives, and a health check that failed here should fail the way a release's
# does.
#
# Usage:
#   smoke.sh --url https://... [--health-path /api/health]
#            [--health-timeout 30] [--health-interval 5] [--attempt-timeout 10]
#            [--dry-run]
#
# Exits 0 when every path answered 2xx or 3xx, and 1 when any did not, with the
# reason for each path that did not printed on stdout: a caller that captured
# only stdout still has it.
#
# Environment fallbacks: GT_SERVICE_URL, GT_HEALTH_PATH, GT_HEALTH_TIMEOUT,
# GT_HEALTH_INTERVAL, GT_ATTEMPT_TIMEOUT, DRY_RUN=1.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# Both of these are read by the script wherever it was invoked from: smoke.sh is
# run through its own path, never relative to the caller's working directory.
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HEALTH_SH="$DIR/release/health.sh"

URL=${GT_SERVICE_URL:-}
# /api/health is this app's own health route, the one the container contract
# names (CLAUDE.md, and the deploy program's spec), so it is the default of a
# check of this app. --health-path is for a service that answers elsewhere.
HEALTH_PATH=${GT_HEALTH_PATH:-/api/health}
# The health wait is health.sh's, and it is the short one here: a smoke check is
# typed at a service that is already serving, so the 120s a release gives a
# fresh revision would be a stall, not patience. The paths after it get one
# attempt each. Against a service that answers, the run is a second or two; the
# defaults are chosen so that even a host that swallows every request -- the one
# case where each path waits out its timeout -- stays near a minute.
HEALTH_TIMEOUT=${GT_HEALTH_TIMEOUT:-30}
HEALTH_INTERVAL=${GT_HEALTH_INTERVAL:-5}
ATTEMPT_TIMEOUT=${GT_ATTEMPT_TIMEOUT:-10}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --url URL [options]" \
    '' \
    '  --url URL               service URL to check (GT_SERVICE_URL)' \
    '  --health-path /path     health route, default /api/health (GT_HEALTH_PATH)' \
    '  --health-timeout SEC    give up on the health path after this long, default 30 (GT_HEALTH_TIMEOUT)' \
    '  --health-interval SEC   wait between health attempts, default 5 (GT_HEALTH_INTERVAL)' \
    '  --attempt-timeout SEC   per-request timeout, default 10 (GT_ATTEMPT_TIMEOUT)' \
    '  --dry-run               print the checks without making a request' \
    '' \
    'Checks the health path, then /, /api/version and /og-card-2.png, and fails' \
    'when any of them answers outside 2xx and 3xx. Reads only: it changes' \
    'nothing and holds no credential.'
}

# die prints a one-line error to stderr and stops. Every refusal here goes
# through it, so a run that cannot happen says which input was wrong rather than
# checking half a service.
die() { printf '%s: error: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

# note prints an indented line for a human reading the run, and step a heading:
# one per group of checks.
note() { printf '  %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }

# dry_run is true when --dry-run was given (or DRY_RUN=1 is set). run executes a
# command, or prints it under --dry-run: a dry run makes no request at all,
# which is what makes it safe to point at anything.
dry_run() { [[ ${DRY_RUN:-0} == 1 ]]; }
run() {
  if dry_run; then
    printf '  [dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

# need NAME VALUE refuses to continue when a required input is empty, and names
# it: "unbound variable" under `set -u` does not say which flag was forgotten.
need() {
  local name=$1 value=${2:-}
  [[ -n $value ]] ||
    die "$name is required (pass the flag, or set the environment variable it falls back to)"
}

while [[ $# -gt 0 ]]; do
  case $1 in
  --dry-run) DRY_RUN=1 ;;
  -h | --help)
    usage
    exit 0
    ;;
  --url)
    URL=${2:-}
    shift 2
    ;;
  --health-path)
    HEALTH_PATH=${2:-}
    shift 2
    ;;
  --health-timeout)
    HEALTH_TIMEOUT=${2:-}
    shift 2
    ;;
  --health-interval)
    HEALTH_INTERVAL=${2:-}
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

case $URL in
http://* | https://*) ;;
*) die "url must start with http:// or https://, got: $URL" ;;
esac
[[ $URL != */ ]] || die "url must not end with a slash, got: $URL"
[[ $HEALTH_PATH == /* ]] || die "health path must start with /, got: $HEALTH_PATH"

for value in "$HEALTH_TIMEOUT" "$HEALTH_INTERVAL" "$ATTEMPT_TIMEOUT"; do
  [[ $value =~ ^[0-9]+$ ]] || die "timeouts and intervals must be whole seconds, got: $value"
done
((HEALTH_TIMEOUT >= 1)) || die "health timeout must be at least 1 second"
((HEALTH_INTERVAL >= 1)) || die "health interval must be at least 1 second"
((ATTEMPT_TIMEOUT >= 1)) || die "attempt timeout must be at least 1 second"

[[ -x $HEALTH_SH ]] || die "the health helper is not executable: $HEALTH_SH"

# curl is what every check here runs, and it has to be answered for now: the
# status capture below drops curl's exit code on purpose, because a refused
# connection is a finding rather than a crash, so a machine without curl would
# report every path as "no response" and blame the service for it.
command -v curl >/dev/null 2>&1 || die "curl is required and is not on PATH"

# PATHS is what a visitor is served, and nothing else. This app has one page --
# src/app/page.tsx, the Fractal Explorer -- so `/` is that page; /api/version is
# the route a deploy is read back by; and /og-card-2.png is the static social
# card the page's head names (src/app/layout.tsx), which the Dockerfile serves
# out of public/. /api/og is deliberately not here: it answers a redirect to a
# pre-built picture, which the integration tier checks, and this script is about
# a service answering at all.
PATHS=(/ /api/version /og-card-2.png)

# checks counts the paths asked, failed counts the ones that did not answer, and
# FAILURES holds one line per failure, in the order they were found. The lines
# are printed together at the end rather than as they are found: a path that
# failed is a note in the run's list of paths, and the reasons read better
# together than interleaved with the paths that passed.
checks=0
failed=0
FAILURES=()

# smoke_fail PATH REASON records one failure with its reason. The reasons reach
# stdout rather than die, which writes to stderr: what this script is asked for
# is a non-zero exit with the reason printed, and a caller that captured stdout
# alone still has it.
smoke_fail() {
  FAILURES+=("$1: $2")
  failed=$((failed + 1))
}

# check_health asks health.sh, which retries and is where the app's health
# contract is already written down. Its output is passed through on success --
# its health=ok line is the run's evidence -- and on failure its own last line,
# which says what it saw, becomes this script's reason: one failure with one
# explanation, rather than a health check reported twice.
check_health() {
  local -a args=(--url "$URL" --health-path "$HEALTH_PATH"
    --timeout "$HEALTH_TIMEOUT" --interval "$HEALTH_INTERVAL"
    --attempt-timeout "$ATTEMPT_TIMEOUT")
  local out
  dry_run && args+=(--dry-run)
  checks=$((checks + 1))

  if out=$("$HEALTH_SH" "${args[@]}" 2>&1); then
    printf '%s\n' "$out"
    return 0
  fi

  # A failed health check ends with health.sh's own error line, and that line is
  # this script's reason for failing the path. Everything before it -- the
  # attempts it made and the status each one saw -- is printed here, so the
  # section that asked the question says what came back, and the reason itself
  # is printed once, with the run's other failures.
  smoke_fail "$HEALTH_PATH" "$(printf '%s\n' "$out" | tail -n 1)"
  printf '%s\n' "$out" | sed '$d'
  return 1
}

# check_path asks one path of the service and reports what it answered. Only the
# status is read: a body is the integration tier's subject, and a smoke check
# that parsed one would be a second, worse copy of those tests.
check_path() {
  local path=$1 status
  checks=$((checks + 1))

  if dry_run; then
    run curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --max-time "$ATTEMPT_TIMEOUT" "$URL$path"
    return 0
  fi

  # A refused connection or a timeout is not a crash: curl's exit code is
  # dropped for the same reason health.sh drops it, and what it wrote to
  # --write-out is the finding. curl reports `000` when no response arrived at
  # all -- refused, unresolved, or timed out -- which is not a status any server
  # sent, so it is reported as no answer rather than as a status of zero.
  status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --max-time "$ATTEMPT_TIMEOUT" "$URL$path" 2>/dev/null || true)
  status=${status:-000}

  if [[ $status == 000 ]]; then
    note "$path -> no response"
    smoke_fail "$path" "no response within ${ATTEMPT_TIMEOUT}s"
    return 1
  fi

  note "$path -> $status"
  case $status in
  2?? | 3??) return 0 ;;
  *) smoke_fail "$path" "answered $status, and only a 2xx or a 3xx is a pass" ;;
  esac
  return 1
}

step "Smoke check of $URL"
step "Health path"
check_health || true

step "Paths"
for path in "${PATHS[@]}"; do
  check_path "$path" || true
done

if dry_run; then
  printf 'smoke=dry-run url=%s checks=%s\n' "$URL" "$checks"
  exit 0
fi

if ((failed > 0)); then
  step "What did not answer"
  for failure in "${FAILURES[@]}"; do
    printf '%s: FAIL %s\n' "$SCRIPT_NAME" "$failure"
  done
  printf 'smoke=failed url=%s checks=%s failed=%s\n' "$URL" "$checks" "$failed"
  exit 1
fi

printf 'smoke=ok url=%s checks=%s\n' "$URL" "$checks"
