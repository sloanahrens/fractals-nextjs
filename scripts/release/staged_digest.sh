#!/usr/bin/env bash
#
# Read the image a stack is running out of Pulumi's own record of it, so a job
# that did not apply the stack can still check what it holds.
#
# This exists because a stack's *config* cannot carry a value from one job to
# the next. The staging job pins the released digest with
# `pulumi config set imageDigest`, which writes Pulumi.<stack>.yaml in that
# job's workspace -- a local file in a checkout no other job shares and that is
# never committed -- so the first real release (fractals-nextjs, 2026-10-08)
# failed in its prod job with `error: configuration key 'imageDigest' not found
# for stack 'staging'` when it tried to read the value back with
# `pulumi config get`.
#
# Stack *state* can carry it. State lives in the app's backend
# (gs://<project>-pulumi-state), which every job of a release can read, and the
# Cloud Run service the staging stack applied records the image it is running
# under .deployment.resources[].outputs.template.containers[0].image in the
# export `pulumi stack export` prints. That image is what the stack actually
# deployed, which is what prod has to compare its promotion against -- not a
# value both jobs happen to share.
#
# Usage:
#   staged_digest.sh --app APP --env staging|prod --token-file FILE
#                    [--project gt-APP] [--dry-run]
#
# Environment fallbacks: GT_APP, GT_ENV, GT_PROJECT, GT_TOKEN_FILE,
# GT_BASE_KEY_FILE, GT_STACK_DIR, GT_BACKEND_URL, DRY_RUN=1.
#
# Prints digest=<registry>@sha256:<64hex> on stdout, and nothing else there:
# stdout is what the workflow reads into $GITHUB_OUTPUT, so a stack that cannot
# answer has to leave it empty rather than print a line promote.sh would compare
# against. The export is never read with --show-secrets, the selection is by
# resource type, and every refusal goes to stderr naming what is wrong.

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
    '  --env staging|prod  stack to read, default staging (GT_ENV)' \
    '  --token-file FILE   token from mint_token.sh (GT_TOKEN_FILE)' \
    '  --project gt-APP    GCP project, default gt-APP (GT_PROJECT)' \
    '  --dry-run           print the read without running it' \
    '' \
    'Reads the image the stack is running out of `pulumi stack export`, from' \
    'the state backend every job of a release can read, and prints it as' \
    'digest=<registry>@sha256:<64hex>. A stack whose export holds no Cloud Run' \
    'service, more than one, or an image that is a tag is refused: an empty or' \
    'tag-shaped read would leave promote.sh with nothing to compare against.'
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
# The stack's committed settings, before a credential is read: a stack whose
# Pulumi.<env>.yaml does not name this project's secrets provider cannot be
# opened at all, and saying so needs no credentials (lib.sh,
# require_stack_settings).
require_stack_settings
pulumi_env "$TOKEN_FILE"

# SERVICE_TYPE is the one resource type in a stack's export whose image is the
# container the stack is running. An export holds every resource the program
# created, and more than one of them can carry an `image` key -- the registry
# repository among them -- so the type is what selects the service; the key
# alone would pick a resource the release does not deploy.
SERVICE_TYPE='gcp:cloudrunv2/service:Service'
# SERVICE_IMAGE is where a Cloud Run v2 service records the image it runs.
SERVICE_IMAGE='.outputs.template.containers[0].image'

# Nothing is printed on the way to the read, unlike the other scripts: the
# workflow reads this script's stdout into $GITHUB_OUTPUT, so every refusal
# below has to leave it empty, or a failed read would look like a digest. The
# one line a dry run prints says what would be read and carries no value, and
# what an operator needs from a refusal is in the refusal's own message, on
# stderr.
#
# The export is read through capture, so --dry-run prints the exact command and
# runs nothing (lib.sh, capture).
export_json=$(capture pulumi stack export --stack "$STACK" --cwd "$STACK_DIR") ||
  die "pulumi stack export failed for stack $STACK, so the image it is running could not be read from $BACKEND_URL"

if dry_run; then
  note "would read $SERVICE_IMAGE of the one $SERVICE_TYPE resource in that export and print that image (nothing is read in a dry run)"
  exit 0
fi

# How many Cloud Run services the export holds. Exactly one is needed: none
# means the stack has applied no service, so there is no image to promote
# against, and more than one is a state this flow cannot choose between -- a
# release that guessed would compare prod against a service staging is not
# running.
services=$(jq -r --arg type "$SERVICE_TYPE" \
  '[.deployment.resources[]? | select(.type == $type)] | length' <<<"$export_json" 2>/dev/null) ||
  die "stack $STACK's export is not the JSON pulumi stack export prints, so the image it is running could not be read"

[[ $services == 1 ]] ||
  die "stack $STACK's export holds $services resources of type $SERVICE_TYPE, and exactly one is needed to read the image it is running: none means the stack has applied no service, and more than one is a state this flow cannot choose between"

# The image of that one resource. A missing outputs path reads as empty rather
# than as an error, because "the service records no image" is a state to refuse
# by name, not a jq parse failure.
image=$(jq -r --arg type "$SERVICE_TYPE" \
  ".deployment.resources[]? | select(.type == \$type) | (${SERVICE_IMAGE} // \"\")" \
  <<<"$export_json" 2>/dev/null) ||
  die "stack $STACK's export could not be read for the image at ${SERVICE_IMAGE#.}"

[[ -n $image ]] ||
  die "stack $STACK's $SERVICE_TYPE resource records no image at ${SERVICE_IMAGE#.}, so there is nothing to promote against: this is the state of a stack whose service has never been applied"

require_digest "$image" "the image the $ENV_NAME stack is running"

printf 'digest=%s\n' "$image"
