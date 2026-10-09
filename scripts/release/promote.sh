#!/usr/bin/env bash
#
# Step 6 of the release flow (docs/design.md, section 6): deploy the digest that
# already runs in staging to prod. The release is authorized by the protected v*
# tag the run is at (docs/design.md, section 6.1).
#
# Promotion takes a digest and refuses a tag. That refusal is the point of the
# script: rebuilding or re-tagging between staging and prod would put an image
# in prod that no health check ran against. When the
# workflow passes the staging digest (--staging-digest), a mismatch is refused
# too, which is what makes "the same digest" a checked fact rather than a hope.
#
# The environment is always prod. Promotion means prod.
#
# Like up.sh it records the apply time as the stack's `deployedAt` config, and
# only when the promotion changes the image prod runs (lib.sh,
# set_deployed_at_config): a promotion that changes nothing is not a deployment
# and must not claim one.
#
# It refuses a prod stack whose committed Pulumi.prod.yaml does not name this
# project's gcpkms secrets provider, before it touches Pulumi at all: a stack
# without those settings falls back to a passphrase provider, and then no
# command in this flow can open it (lib.sh, require_stack_settings).
#
# Usage:
#   promote.sh <registry>@sha256:<64hex> --app APP --token-file FILE
#              [--project gt-APP] [--staging-digest DIGEST] [--init-stack] [--dry-run]
#
# The digest may also be given as --digest or GT_DIGEST.
# Environment fallbacks: GT_APP, GT_PROJECT, GT_DIGEST, GT_STAGING_DIGEST,
# GT_TOKEN_FILE, GT_BASE_KEY_FILE, GT_STACK_DIR, GT_BACKEND_URL, DRY_RUN=1.
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
PROJECT=${GT_PROJECT:-}
DIGEST=${GT_DIGEST:-}
# DIGEST_SOURCE records whether a flag or an argument supplied the digest, so
# giving it twice is refused instead of silently letting the last one win.
DIGEST_SOURCE=''
STAGING_DIGEST=${GT_STAGING_DIGEST:-}
TOKEN_FILE=${GT_TOKEN_FILE:-}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME DIGEST --app APP --token-file FILE [options]" \
    '' \
    '  DIGEST              the <registry>@sha256:<64hex> staging runs; a tag is refused' \
    '  --app APP           app name (GT_APP)' \
    '  --token-file FILE   token from mint_token.sh (GT_TOKEN_FILE)' \
    '  --project gt-APP    GCP project, default gt-APP (GT_PROJECT)' \
    '  --staging-digest D  refuse to promote a digest different from the staging one' \
    '  --init-stack        create the prod stack when it does not exist yet' \
    '  --dry-run           print the promotion without running it' \
    '' \
    'Prints url= on stdout. The protected v* tag the run is at is the release' \
    'authorization (docs/design.md, section 6.1).'
}

INIT_STACK=0
while [[ $# -gt 0 ]]; do
  if common_flag "$@"; then shift; continue; fi
  case $1 in
  --app)
    APP=${2:-}
    shift 2
    ;;
  --project)
    PROJECT=${2:-}
    shift 2
    ;;
  --digest)
    [[ -z $DIGEST_SOURCE ]] || die "digest given twice: $DIGEST and ${2:-}"
    DIGEST_SOURCE=flag
    DIGEST=${2:-}
    shift 2
    ;;
  --staging-digest)
    STAGING_DIGEST=${2:-}
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
  -*) die "unknown argument: $1 (try --help)" ;;
  *)
    [[ -z $DIGEST_SOURCE ]] || die "digest given twice: $DIGEST and $1"
    DIGEST_SOURCE=argument
    DIGEST=$1
    shift
    ;;
  esac
done

# The digest is checked first: "promote.sh app:latest" must be refused for what
# it is, whatever else about the invocation is wrong. The message a tag gets is
# the one an operator needs to read - what to pass instead, and why the tag they
# passed is not acceptable.
require_digest "$DIGEST" "the digest to promote"

# Promotion is a prod action and this script has no --env flag to say otherwise.
ENV_NAME=prod
release_target
# The prod stack's committed settings are required before Pulumi is given
# anything: a stack whose settings file does not name this project's secrets
# provider cannot be promoted to, and saying so here needs no credentials
# (lib.sh, require_stack_settings).
require_stack_settings

if [[ -n $STAGING_DIGEST ]]; then
  require_digest "$STAGING_DIGEST" "the staging digest"
  [[ $DIGEST == "$STAGING_DIGEST" ]] ||
    die "refusing to promote $DIGEST: staging runs $STAGING_DIGEST, and prod gets the digest staging proved"
fi

pulumi_env "$TOKEN_FILE"

step "Promoting $APP to $ENV_NAME (stack $STACK)"
note "digest: $DIGEST (nothing is rebuilt: this digest is already built and verified in staging)"
note "backend: $BACKEND_URL"

ensure_stack
set_digest_config "$DIGEST"
set_deployed_at_config "$DIGEST"
up_stack
