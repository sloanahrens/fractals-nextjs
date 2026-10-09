#!/usr/bin/env bash
#
# Step 5 of the release flow (docs/design.md, section 6): apply the previewed
# digest, then hand the service URL to health.sh.
#
# preview.sh already ran `pulumi preview` over this exact digest, so this runs
# `pulumi up` with --skip-preview: a second, implicit preview would be a second
# plan. It deploys the digest it was given and nothing else; the digest is the
# release's identity and it is pinned in stack config before the up.
#
# It also records the apply time as the stack's `deployedAt` config, so a
# deployed app can show when it was deployed -- and only when this apply changes
# the image the stack runs, so a no-op apply creates no new revision and claims
# no new deployment (lib.sh, set_deployed_at_config).
#
# It refuses a stack whose committed Pulumi.<env>.yaml does not name this
# project's gcpkms secrets provider, before it touches Pulumi at all: a stack
# without those settings falls back to a passphrase provider, and then no
# command in this flow can open it (lib.sh, require_stack_settings).
#
# Usage:
#   up.sh --app APP --digest <registry>@sha256:<64hex> --token-file FILE
#         [--env staging|prod] [--init-stack] [--dry-run]
#
# Prints url=<service url> on stdout, which is what health.sh checks.
# Environment fallbacks: GT_APP, GT_ENV, GT_PROJECT, GT_DIGEST, GT_TOKEN_FILE,
# GT_BASE_KEY_FILE, GT_STACK_DIR, GT_BACKEND_URL, DRY_RUN=1.
#
# GT_BASE_KEY_FILE is the base key lib.sh builds Pulumi's own credential from:
# the gs:// state backend and the gcpkms secrets provider authenticate through
# Application Default Credentials, which the provider's token is not (lib.sh,
# adc_credentials).

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP=${GT_APP:-}
ENV_NAME=${GT_ENV:-staging}
PROJECT=${GT_PROJECT:-}
DIGEST=${GT_DIGEST:-}
TOKEN_FILE=${GT_TOKEN_FILE:-}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --app APP --digest DIGEST --token-file FILE [options]" \
    '' \
    '  --app APP           app name (GT_APP)' \
    '  --digest DIGEST     image digest to apply, from build_push.sh (GT_DIGEST)' \
    '  --token-file FILE   token from mint_token.sh (GT_TOKEN_FILE)' \
    '  --env staging|prod  stack to apply, default staging (GT_ENV)' \
    '  --project gt-APP    GCP project, default gt-APP (GT_PROJECT)' \
    '  --init-stack        create the stack when it does not exist yet' \
    '  --dry-run           print the up without running it' \
    '' \
    'Prints url= on stdout. Run health.sh on that URL before serving traffic.'
}

INIT_STACK=0
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
  --digest)
    DIGEST=${2:-}
    shift 2
    ;;
  --token-file)
    TOKEN_FILE=${2:-}
    shift 2
    ;;
  --init-stack)
    INIT_STACK=1
    shift
    ;;
  *) die "unknown argument: $1 (try --help)" ;;
  esac
done

# The digest is checked before anything else so that the failure names the
# input that is wrong, whatever else the caller got wrong too.
require_digest "$DIGEST" "digest"
release_target
# The stack's committed settings are required before Pulumi is given anything:
# a stack whose settings file does not name this project's secrets provider
# cannot be applied, and saying so here needs no credentials (lib.sh,
# require_stack_settings).
require_stack_settings
pulumi_env "$TOKEN_FILE"

step "Applying $APP $ENV_NAME (stack $STACK)"
note "digest: $DIGEST"
note "backend: $BACKEND_URL"

ensure_stack
set_digest_config "$DIGEST"
set_deployed_at_config "$DIGEST"
up_stack
