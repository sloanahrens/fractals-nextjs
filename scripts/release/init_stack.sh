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
# read the result the way it reads every other script's output. When it creates
# a stack it also prints the two settings lines Pulumi wrote into the stack's
# settings file — the secrets provider and the stack's encrypted key — between
# `settings-begin <env>` and `settings-end <env>` markers, for the operator to
# commit: that file is committed state, and preview.sh, up.sh and promote.sh
# refuse a stack whose committed copy does not name this project's provider
# (lib.sh, require_stack_settings).

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
    'and the script exits 0. Prints stack= and created= on stdout, and a' \
    'settings-begin/settings-end block holding the two lines the stack settings' \
    'file must carry -- commit them to Pulumi.<env>.yaml.'
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

# print_stack_settings prints the two lines `pulumi stack init` has just written
# into the stack's settings file — the secrets provider URL and the stack's
# encrypted secrets key — between settings-begin/settings-end markers, and says
# the file is committed state.
#
# Printing them is what this script is for in a first release. The pre-release
# rehearsal of 2026-10-08 ran it in a throwaway checkout, so the lines the
# operator needed went with the checkout: the app repo's Pulumi.<env>.yaml never
# got them, and every pulumi command in the flow afterwards failed with
# "passphrase must be set with PULUMI_CONFIG_PASSPHRASE". A block in the log is
# a block the operator can paste into the file they commit (lib.sh,
# require_stack_settings, refuses the release until it is there).
#
# encryptedkey is printed here and nowhere else. It is the stack's secrets key
# in exactly the encrypted form Pulumi documents as committable state, and the
# file it belongs in is the one this script just created.
print_stack_settings() {
  local file=$STACK_DIR/Pulumi.$STACK.yaml provider key
  provider=$(grep -m1 '^secretsprovider:' "$file" 2>/dev/null || true)
  key=$(grep -m1 '^encryptedkey:' "$file" 2>/dev/null || true)

  if [[ -z $provider || -z $key ]]; then
    warn "$file does not hold both the secretsprovider and encryptedkey lines Pulumi writes; commit them from that file before the next release, or every pulumi command will fail with \"passphrase must be set with PULUMI_CONFIG_PASSPHRASE\""
    return 0
  fi

  note "commit these two lines to $file: a stack's settings are committed state, and a checkout without them falls back to a passphrase provider"
  printf 'settings-begin %s\n%s\n%s\nsettings-end %s\n' "$ENV_NAME" "$provider" "$key" "$ENV_NAME"
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
  note "would print the stack's settings lines from $STACK_DIR/Pulumi.$STACK.yaml for committing"
  printf 'stack=%s created=unknown\n' "$STACK"
else
  print_stack_settings
  printf 'stack=%s created=yes\n' "$STACK"
fi
