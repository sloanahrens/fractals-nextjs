#!/usr/bin/env bash
#
# Step 4 of the release flow (docs/design.md, section 6): the preview whose diff
# is the record of what the release does.
#
# It pins the released digest in the stack's config, then runs `pulumi preview`
# and writes the diff to a file the workflow puts in the log and the run summary.
# Nothing is applied: the diff printed here is the plan up.sh will execute,
# because up.sh runs over the same digest and the same stack (bead B5.2).
#
# It refuses a stack whose committed Pulumi.<env>.yaml does not name this
# project's gcpkms secrets provider, before it touches Pulumi at all: a stack
# without those settings falls back to a passphrase provider, and then no
# command in this flow can open it (lib.sh, require_stack_settings).
#
# Usage:
#   preview.sh --app APP --digest <registry>@sha256:<64hex> --token-file FILE
#              [--image NAME=<registry>@sha256:<64hex>]... [--env staging|prod]
#              [--preview-file FILE] [--init-stack] [--dry-run]
#
# --digest is the primary image (the only image of a list of one, else app),
# pinned as imageDigest and as image.<name>; each --image pins another image of
# GT_IMAGES as image.<NAME> (see up.sh).
#
# Environment fallbacks: GT_APP, GT_ENV, GT_PROJECT, GT_DIGEST, GT_TOKEN_FILE,
# GT_BASE_KEY_FILE, GT_PREVIEW_FILE, GT_STACK_DIR, GT_BACKEND_URL, DRY_RUN=1.
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
PREVIEW_FILE=${GT_PREVIEW_FILE:-}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --app APP --digest DIGEST --token-file FILE [options]" \
    '' \
    '  --app APP           app name (GT_APP)' \
    '  --digest DIGEST     image digest to preview, from build_push.sh (GT_DIGEST)' \
    '  --image NAME=DIGEST digest of another image in GT_IMAGES; repeatable' \
    '  --token-file FILE   token from mint_token.sh (GT_TOKEN_FILE)' \
    '  --env staging|prod  stack to preview, default staging (GT_ENV)' \
    '  --project gt-APP    GCP project, default gt-APP (GT_PROJECT)' \
    '  --preview-file FILE diff output, default preview-STACK.diff (GT_PREVIEW_FILE)' \
    '  --init-stack        create the stack when it does not exist yet' \
    '  --dry-run           print the preview without running it' \
    '' \
    'Prints preview_file= on stdout. Apply nothing: up.sh does that.'
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
  --image)
    add_image_flag "${2:-}"
    shift 2
    ;;
  --preview-file)
    PREVIEW_FILE=${2:-}
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
require_extra_images
PREVIEW_FILE=${PREVIEW_FILE:-preview-$STACK.diff}
# The stack's committed settings are required before Pulumi is given anything:
# a stack whose settings file does not name this project's secrets provider
# cannot be previewed, and saying so here needs no credentials (lib.sh,
# require_stack_settings).
require_stack_settings
pulumi_env "$TOKEN_FILE"

step "Previewing $APP $ENV_NAME (stack $STACK)"
note "digest: $DIGEST"
note "backend: $BACKEND_URL"

ensure_stack
set_digest_config "$DIGEST"
set_extra_image_configs
preview_stack "$PREVIEW_FILE"

printf 'preview_file=%s\nstack=%s\n' "$PREVIEW_FILE" "$STACK"
