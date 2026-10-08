#!/usr/bin/env bash
#
# Step 3 of the release flow (docs/design.md, section 6): mint a one-hour access
# token for the app's deployer service account, using the base key.
#
# The base key can do exactly one thing: create tokens for the deployer
# accounts it has a binding on (docs/design.md, section 5). This script is that
# one thing, and it is the only script that touches the key.
#
# How the key is used, and why:
#   - gcloud reads it through CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE, so what
#     appears on the command line is a path, not key material.
#   - The token gcloud prints goes straight into a file with mode 600. It is
#     never printed, never passed as an argument, and never echoed into a log.
#   - A dry run prints the command it would run and creates no token file.
#
# Usage:
#   mint_token.sh --app APP --key-file FILE [--project gt-APP] [--token-file FILE]
#                 [--ttl 3600] [--dry-run]
#
# Prints token_file=<path> and deployer_sa=<email> on stdout, for the workflow
# to pass to preview.sh and up.sh. Environment fallbacks: GT_APP, GT_PROJECT,
# GT_BASE_KEY_FILE, GT_TOKEN_FILE, GT_TTL.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP=${GT_APP:-}
PROJECT=${GT_PROJECT:-}
KEY_FILE=${GT_BASE_KEY_FILE:-}
TOKEN_FILE=${GT_TOKEN_FILE:-}
TTL=${GT_TTL:-3600}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --app APP --key-file FILE [options]" \
    '' \
    '  --app APP          app name (GT_APP)' \
    '  --key-file FILE    base service account key, mode 600 (GT_BASE_KEY_FILE)' \
    '  --project gt-APP   GCP project, default gt-APP (GT_PROJECT)' \
    '  --token-file FILE  where to write the token, default a fresh temp file (GT_TOKEN_FILE)' \
    '  --ttl SECONDS      token lifetime, at most 3600 (GT_TTL)' \
    '  --dry-run          print the gcloud command without running it' \
    '' \
    'Prints token_file= and deployer_sa= on stdout. The token itself is never printed.'
}

while [[ $# -gt 0 ]]; do
  if common_flag "$@"; then shift; continue; fi
  case $1 in
  --app)
    APP=${2:-}
    shift 2
    ;;
  --key-file)
    KEY_FILE=${2:-}
    shift 2
    ;;
  --project)
    PROJECT=${2:-}
    shift 2
    ;;
  --token-file)
    TOKEN_FILE=${2:-}
    shift 2
    ;;
  --ttl)
    TTL=${2:-}
    shift 2
    ;;
  *) die "unknown argument: $1 (try --help)" ;;
  esac
done

# This script has no environment of its own; release_target needs one to name a
# stack it never touches.
ENV_NAME=staging
release_target
require_key_file "$KEY_FILE"

# One hour is the whole authority a deploy gets (docs/design.md, section 5).
# A longer token would outlive the job that needs it and could not be justified
# by the base key's narrow binding.
[[ $TTL =~ ^[0-9]+$ ]] || die "ttl must be whole seconds, got: $TTL"
((TTL >= 1 && TTL <= 3600)) || die "ttl must be between 1 and 3600 seconds, got: $TTL"

SA=$(deployer_sa)

if [[ -z $TOKEN_FILE ]]; then
  TOKEN_FILE=$(mktemp "${TMPDIR:-/tmp}/gt-release-${APP}.XXXXXX")
  note "token file: $TOKEN_FILE"
fi

step "Minting a ${TTL}s token for $SA"
note "base key: $KEY_FILE (read by gcloud from the environment, never from argv)"

mint() {
  # --lifetime only applies to an impersonated token, which is exactly what
  # this is. The override makes gcloud authenticate as the base SA.
  CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE="$KEY_FILE" \
    gcloud auth print-access-token \
    --impersonate-service-account="$SA" \
    --lifetime="$TTL"
}

if dry_run; then
  run env CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE="$KEY_FILE" \
    gcloud auth print-access-token --impersonate-service-account="$SA" --lifetime="$TTL"
  printf 'token_file=%s\ndeployer_sa=%s\n' "$TOKEN_FILE" "$SA"
  exit 0
fi

# umask 077 before the redirect: the file exists 600 from the moment it is
# created, so there is no window where another process could read the token. The
# chmod afterwards covers a token file the caller supplied that already existed
# with wider permissions.
(umask 077 && mint >"$TOKEN_FILE") || die "gcloud could not mint a token for $SA"
chmod 600 "$TOKEN_FILE"

[[ -s $TOKEN_FILE ]] || die "gcloud returned an empty token for $SA"
note "token written to $TOKEN_FILE (mode 600)"

printf 'token_file=%s\ndeployer_sa=%s\n' "$TOKEN_FILE" "$SA"
