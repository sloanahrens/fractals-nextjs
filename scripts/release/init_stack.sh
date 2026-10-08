#!/usr/bin/env bash
#
# The one-time stack creation the first release needs: create an app's stack for
# one environment in its state backend, with the secrets provider every stack
# uses. `up.sh` refuses a stack that does not exist, and that is deliberate — a
# typo in an app or env name must not create a second stack quietly — so this is
# the script that creates the first one, once per environment, run by hand
# before the first release (workflows/README.md, "The first release";
# docs/design.md, section 6).
#
# It is idempotent in the way an operator needs: a stack that is already in the
# backend is reported, nothing is created, and the script exits 0, so running it
# twice changes nothing and running it in a scripted first release is safe.
#
# The secrets provider is the app's own Cloud KMS key —
# gcpkms://projects/<project>/locations/<region>/keyRings/pulumi/cryptoKeys/secrets
# (internal/gcp/kms.go, keyRingName and secretsKeyName) — and it is the same one
# `ensure_stack` passes, so a stack created here and one a release created with
# `--init-stack` are encrypted the same way.
#
# Usage:
#   init_stack.sh --app APP --env staging|prod --token-file FILE
#                 [--project gt-APP] [--dry-run]
#
# Environment fallbacks: GT_APP, GT_ENV, GT_PROJECT, GT_TOKEN_FILE,
# GT_BASE_KEY_FILE, GT_STACK_DIR, GT_BACKEND_URL, DRY_RUN=1.
#
# Prints stack=<name> and created=<yes|no|unknown> on stdout, so a workflow can
# read the result the way it reads every other script's output.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP=${GT_APP:-}
ENV_NAME=${GT_ENV:-staging}
PROJECT=${GT_PROJECT:-}
TOKEN_FILE=${GT_TOKEN_FILE:-}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --app APP --env staging|prod --token-file FILE [options]" \
    '' \
    '  --app APP           app name (GT_APP)' \
    '  --env staging|prod  stack to create, default staging (GT_ENV)' \
    '  --token-file FILE   token from mint_token.sh (GT_TOKEN_FILE)' \
    '  --project gt-APP    GCP project, default gt-APP (GT_PROJECT)' \
    '  --dry-run           print the creation without running it' \
    '' \
    'Creates the stack in the app state backend with the gcpkms key of the app' \
    'project as its secrets provider. A stack that already exists is left alone' \
    'and the script exits 0. Prints stack= and created= on stdout.'
}

# stack_in_listing is true when the stack is in a `pulumi stack ls --json`
# listing (the listing is its argument). That listing is a JSON array of objects
# with a "name" field; an older pulumi wrapped it in {"stacks": [...]}, and a
# name may be project-qualified ("<project>/<stack>"), so both shapes and both
# spellings are accepted. jq's -e turns the answer into the exit status, which
# is what the caller tests.
stack_in_listing() {
  jq -e --arg stack "$STACK" '
    (if type == "array" then . else (.stacks // []) end)
    | map(if type == "object" then ((.name // "") | split("/") | last) else "" end)
    | any(. == $stack)' <<<"$1" >/dev/null
}

while [[ $# -gt 0 ]]; do
  if common_flag "$@"; then shift; continue; fi
  case $1 in
  --app)
    APP=${2:-}
    shift 2
    ;;
  --env)
    ENV_NAME=${2:-}
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
  *) die "unknown argument: $1 (try --help)" ;;
  esac
done

release_target
pulumi_env "$TOKEN_FILE"

step "Creating the $STACK stack for $APP ($ENV_NAME)"
note "backend: $BACKEND_URL"
note "secrets provider: $(secrets_provider)"

# Read the stacks that are already in the backend. It goes through capture, so a
# dry run prints the command it would read and gets nothing back — which is what
# a dry run means: it then prints the init it would run and says it could not
# tell whether the stack is there.
listing=$(capture pulumi stack ls --json --cwd "$STACK_DIR") ||
  die "pulumi stack ls failed against $BACKEND_URL; nothing was created"

if [[ -n $listing ]] && stack_in_listing "$listing"; then
  note "stack $STACK already exists; nothing to create"
  printf 'stack=%s created=no\n' "$STACK"
  exit 0
fi

run pulumi stack init "$STACK" --cwd "$STACK_DIR" --secrets-provider "$(secrets_provider)"

if dry_run; then
  printf 'stack=%s created=unknown\n' "$STACK"
else
  printf 'stack=%s created=yes\n' "$STACK"
fi
