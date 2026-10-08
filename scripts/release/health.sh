#!/usr/bin/env bash
#
# The health check of step 5 (docs/design.md, section 6): poll the app's health
# path on the service URL until it answers, and fail the job if it never does.
#
# This script is deliberately the smallest one in the directory. It reads one
# URL and writes nothing: no cloud call, no token, no revision, no traffic
# shift. That is what makes the design's promise hold — a failed health check
# stops the run and leaves the environment as it was, with no automatic
# rollback (docs/design.md, section 6) — because there is nothing here that
# could change what is serving. Recovery is redeploying the previous digest
# through the same flow, by hand, at a protected v* tag (docs/design.md,
# section 6.1).
#
# Usage:
#   health.sh --url https://... --health-path /api/health
#             [--timeout 120] [--interval 5] [--attempt-timeout 10] [--dry-run]
#
# Exits 0 when the path answers with a 2xx, 1 when the timeout runs out.
# Environment fallbacks: GT_SERVICE_URL, GT_HEALTH_PATH, GT_HEALTH_TIMEOUT,
# GT_HEALTH_INTERVAL, DRY_RUN=1.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

URL=${GT_SERVICE_URL:-}
HEALTH_PATH=${GT_HEALTH_PATH:-}
TIMEOUT=${GT_HEALTH_TIMEOUT:-120}
INTERVAL=${GT_HEALTH_INTERVAL:-5}
ATTEMPT_TIMEOUT=${GT_ATTEMPT_TIMEOUT:-10}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --url URL --health-path /path [options]" \
    '' \
    '  --url URL               service URL from up.sh (GT_SERVICE_URL)' \
    '  --health-path /path     path declared in the app spec, must start with / (GT_HEALTH_PATH)' \
    '  --timeout SECONDS       give up after this long, default 120 (GT_HEALTH_TIMEOUT)' \
    '  --interval SECONDS      wait between attempts, default 5 (GT_HEALTH_INTERVAL)' \
    '  --attempt-timeout SEC   per-request timeout, default 10 (GT_ATTEMPT_TIMEOUT)' \
    '  --dry-run               print the check without making a request' \
    '' \
    'Read-only: it never changes a revision or a traffic split.'
}

while [[ $# -gt 0 ]]; do
  if common_flag "$@"; then shift; continue; fi
  case $1 in
  --url)
    URL=${2:-}
    shift 2
    ;;
  --health-path)
    HEALTH_PATH=${2:-}
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
need "--health-path (or GT_HEALTH_PATH)" "$HEALTH_PATH"

case $URL in
http://* | https://*) ;;
*) die "url must start with http:// or https://, got: $URL" ;;
esac
[[ $URL != */ ]] || die "url must not end with a slash, got: $URL"
[[ $HEALTH_PATH == /* ]] || die "health path must start with /, got: $HEALTH_PATH"

for value in "$TIMEOUT" "$INTERVAL" "$ATTEMPT_TIMEOUT"; do
  [[ $value =~ ^[0-9]+$ ]] || die "timeout, interval and attempt-timeout must be whole seconds, got: $value"
done
((TIMEOUT >= 1)) || die "timeout must be at least 1 second"

TARGET="$URL$HEALTH_PATH"

if dry_run; then
  step "Health check plan"
  run curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --max-time "$ATTEMPT_TIMEOUT" "$TARGET"
  note "would poll $TARGET every ${INTERVAL}s for up to ${TIMEOUT}s, and exit non-zero if no 2xx arrives"
  exit 0
fi

step "Checking $TARGET (every ${INTERVAL}s, up to ${TIMEOUT}s)"
started=$SECONDS
attempt=0
status=''

while :; do
  attempt=$((attempt + 1))
  # A refused connection or a timeout is a retry, not a crash: curl's exit code
  # is dropped and only the HTTP status decides.
  status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --max-time "$ATTEMPT_TIMEOUT" "$TARGET" 2>/dev/null || true)

  case $status in
  2??)
    printf 'health=ok url=%s status=%s attempts=%s seconds=%s\n' \
      "$TARGET" "$status" "$attempt" "$((SECONDS - started))"
    exit 0
    ;;
  esac

  note "attempt $attempt: ${status:-no response}"
  ((SECONDS - started + INTERVAL <= TIMEOUT)) || break
  sleep "$INTERVAL"
done

die "health check failed: last status ${status:-no response} from $TARGET after $((SECONDS - started))s. Nothing was changed: the previous revision is still the one serving, and there is no automatic rollback (docs/design.md, section 6). Redeploy the previous digest through the same flow."
