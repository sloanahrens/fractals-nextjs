#!/usr/bin/env bash
#
# Shared helpers for the release scripts (docs/plan.md, bead B5.2). This file is
# sourced by every script in this directory; it is never executed on its own.
#
# Two things live here, and nothing else:
#
#   1. The names. Every script derives the project, registry, image, stack and
#      backend URL the same way from the same inputs, so a release cannot build
#      an image one script would not push and another would not deploy. The
#      derivations follow docs/design.md sections 5 and 6 and the bootstrap
#      code that creates the resources: the registry repository is `apps`
#      (internal/gcp/registry.go), the state bucket is `<project>-pulumi-state`
#      (internal/gcp/state_bucket.go), the deployer account is `deployer-<app>`
#      (docs/plan.md, bead B1.10) and a service account's name is
#      `<name>-<env>` (internal/gcp/cloudrun.go, ServiceName).
#
#   2. The rules that keep credentials out of logs. No script ever puts a
#      secret on a command line: the base key reaches gcloud through
#      CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE (a path, not the key), the minted
#      token reaches the Pulumi provider through GOOGLE_OAUTH_ACCESS_TOKEN, and
#      docker login reads its password from stdin. run() and capture() are the
#      only ways a script executes an external command, so --dry-run prints
#      every action before it happens and a script cannot quietly shell out.
#
# Nothing here reads, echoes or returns the contents of a key or a token file.

# Silencing xtrace here covers every script that sources this file: the minted
# token is read into GOOGLE_OAUTH_ACCESS_TOKEN during a run, and xtrace prints
# the expansion of the command it traces. Belt to the braces of never putting a
# secret on a command line in the first place.
set +x

# ──────────────────────────────────────────────────────────────────────────
# Output and dry-run
# ──────────────────────────────────────────────────────────────────────────

# die prints a one-line error to stderr and stops the script. Every refusal in
# the release path goes through it, so a failed release says which input was
# wrong and never continues half-way through a deploy.
die() { printf '%s: error: %s\n' "${SCRIPT_NAME:-release}" "$*" >&2; exit 1; }

# warn is die's non-fatal sibling: the run continues, but the operator is told
# something they should look at.
warn() { printf '%s: warning: %s\n' "${SCRIPT_NAME:-release}" "$*" >&2; }

# note prints an indented line meant for a human reading the job log.
note() { printf '  %s\n' "$*"; }

# step prints a section heading: one per action the script takes.
step() { printf '\n== %s\n' "$*"; }

# dry_run is true when --dry-run was given (or DRY_RUN=1 is set).
dry_run() { [[ ${DRY_RUN:-0} == 1 ]]; }

# run executes a command, or prints it under --dry-run. Everything that touches
# a cloud, a registry or the network goes through it. `set -x` is deliberately
# never used: run() prints the action, not the shell's expansion of it.
run() {
  if dry_run; then
    printf '  [dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

# capture runs a command and prints its stdout, or prints nothing under
# --dry-run (callers must then treat empty output as "there is no value yet",
# which is what a dry run means). Its own commentary goes to stderr so the
# caller can use the printed stdout as a value.
capture() {
  if dry_run; then
    printf '  [dry-run] %s\n' "$*" >&2
    return 0
  fi
  "$@"
}

# need NAME VALUE refuses to continue when a required input is empty. It names
# the input, because "unbound variable" under `set -u` does not say which flag
# the operator forgot.
need() {
  local name=$1 value=${2:-}
  [[ -n $value ]] || die "$name is required (pass the flag, or set the environment variable it falls back to)"
}

# default_of VAR DEFAULT prints the value of the variable named VAR, or DEFAULT
# when it is empty. Flag parsing fills the variables; this supplies what the
# operator did not pass and what the environment did not set.
default_of() { local v=${!1:-}; printf '%s' "${v:-$2}"; }

# parse_common_flag handles the flags every script in this directory accepts.
# It returns 0 when it consumed "$@", 1 when the flag belongs to the caller.
# Usage: parse_common_flag "$@" && shift N
common_flag() {
  case ${1:-} in
  --dry-run) DRY_RUN=1 ;;
  -h | --help) usage; exit 0 ;;
  *) return 1 ;;
  esac
  return 0
}

# ──────────────────────────────────────────────────────────────────────────
# Names derived from --app, --env, --project and --region
# ──────────────────────────────────────────────────────────────────────────

# release_target validates the app/env/project/region the caller parsed and
# derives everything else: the image reference, the registry host, the Pulumi
# stack name and the state backend. It is the single place those names are
# built, so build_push.sh pushes to exactly the image preview.sh and promote.sh
# deploy (docs/design.md, section 6).
release_target() {
  APP=${APP:-$(default_of GT_APP '')}
  ENV_NAME=${ENV_NAME:-$(default_of GT_ENV 'staging')}
  PROJECT=${PROJECT:-$(default_of GT_PROJECT '')}
  REGION=${REGION:-$(default_of GT_REGION 'us-central1')}
  STACK_DIR=${STACK_DIR:-$(default_of GT_STACK_DIR '.')}
  BACKEND_URL=${BACKEND_URL:-$(default_of GT_BACKEND_URL '')}

  need "--app (or GT_APP)" "$APP"
  [[ $APP =~ ^[a-z][a-z0-9-]{1,28}$ ]] ||
    die "app name must match ^[a-z][a-z0-9-]{1,28}$ (pkg/appdeploy Spec.Name), got: $APP"

  case $ENV_NAME in
  staging | prod) ;;
  *) die "env must be staging or prod, got: $ENV_NAME" ;;
  esac

  PROJECT=${PROJECT:-gt-$APP}
  [[ $PROJECT == gt-* ]] || die "project must start with gt- (docs/plan.md), got: $PROJECT"

  # Region is pinned by the plan and by the manifest of every app; a release
  # that could pick another one would build an image the app's registry does
  # not hold. The check is here rather than in each script.
  [[ $REGION == us-central1 ]] || die "region must be us-central1, got: $REGION"

  REGISTRY_HOST="$REGION-docker.pkg.dev"
  IMAGE="$REGISTRY_HOST/$PROJECT/apps/$APP"
  STACK="$APP-$ENV_NAME"
  BACKEND_URL=${BACKEND_URL:-gs://$PROJECT-pulumi-state}

  [[ -d $STACK_DIR ]] || die "stack directory does not exist: $STACK_DIR"
}

# ──────────────────────────────────────────────────────────────────────────
# Digests and tags
# ──────────────────────────────────────────────────────────────────────────

# is_digest is true for an immutable image reference: a repository path, an @,
# and a sha256 followed by 64 lowercase hex characters. A tag (anything with a
# `:tag` end) is not a digest.
is_digest() { [[ ${1:-} =~ ^[^:@]+@sha256:[0-9a-f]{64}$ ]]; }

# require_digest REF refuses a tag and anything that is not a digest. The whole
# point of the release flow is that the digest built in step 2 is what reaches
# staging and then prod (docs/design.md, section 6); a tag can be moved between
# the build and the deploy, a digest cannot.
#
# The refusal names what is wrong, because the two failures need different
# fixes: a tag needs the digest from build_push.sh, a malformed digest needs
# the operator to look at where they copied it from.
require_digest() {
  local ref=${1:-} what=${2:-image reference}
  is_digest "$ref" && return 0

  if [[ $ref != *@sha256:* ]]; then
    die "$what must be an immutable digest, not a tag: $ref (a tag can be moved after the build; pass the <registry>@sha256:... that build_push.sh printed)"
  fi
  die "$what must be <registry-path>@sha256:<64 lowercase hex>, got: $ref"
}

# require_release_tag TAG refuses anything that is not a release tag. The deploy
# workflow triggers on protected `v*` tags (docs/design.md, section 6), and a
# mutable name like `latest` or a branch name must never be built as a release.
require_release_tag() {
  local tag=${1:-}
  [[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] ||
    die "release tag must look like v1.2.3, got: $tag"
}

# ──────────────────────────────────────────────────────────────────────────
# Credentials
# ──────────────────────────────────────────────────────────────────────────

# require_key_file FILE checks the base key is where the operator said it is,
# without reading it. The file must be a regular file, and it must not be
# readable by anyone but its owner: the release runner holds it, nothing else on
# the machine should (docs/design.md, section 5; bead B3.3 writes it 600).
require_key_file() {
  local file=${1:-} mode
  need "--key-file (or GT_BASE_KEY_FILE)" "$file"
  [[ -f $file ]] || die "base key file does not exist: $file"
  [[ -r $file ]] || die "base key file is not readable by $(id -un): $file"

  # stat differs between the macOS runner and the Linux gate, so try GNU first
  # and fall back to BSD. An unreadable or unparsable mode is a warning, not a
  # refusal: a release must not fail because of a stat quirk, but it must not
  # stay quiet about a world-readable key either.
  mode=$(stat -c %a "$file" 2>/dev/null || stat -f %Lp "$file" 2>/dev/null || true)
  if [[ -z $mode ]]; then
    warn "cannot read the permissions of $file; it must be mode 600"
  elif (( (0$mode & 007) != 0 )); then
    die "base key file is readable by group or other: $file (mode $mode, want 600)"
  fi
}

# deployer_sa prints the deployer service account of the app in PROJECT, the
# only identity the base key can mint a token for (docs/design.md, section 5;
# the account is created by bootstrap, bead B1.10).
deployer_sa() { printf 'deployer-%s@%s.iam.gserviceaccount.com' "$APP" "$PROJECT"; }

# pulumi_env makes the minted token available to the Pulumi GCP provider and
# points Pulumi at the app's state bucket. The token travels in the environment
# of the pulumi process, never in its argv, so it cannot be read out of a
# process listing or a printed command line. It is never echoed.
pulumi_env() {
  local token_file=${1:-}
  need "--token-file (or GT_TOKEN_FILE)" "$token_file"
  export PULUMI_BACKEND_URL="$BACKEND_URL"

  if dry_run; then
    note "would run the provider with the token from $token_file (not read in a dry run)"
    return 0
  fi
  [[ -f $token_file ]] || die "token file does not exist: $token_file (run mint_token.sh first)"
  GOOGLE_OAUTH_ACCESS_TOKEN=$(<"$token_file")
  [[ -n $GOOGLE_OAUTH_ACCESS_TOKEN ]] || die "token file is empty: $token_file"
  export GOOGLE_OAUTH_ACCESS_TOKEN
}

# ──────────────────────────────────────────────────────────────────────────
# Pulumi stacks
# ──────────────────────────────────────────────────────────────────────────

# set_digest_config pins the released digest in the stack's config. The app's
# Pulumi program reads it as `imageDigest` (examples/app/main.go), so this one
# value is all a release changes; name, env, project, region, port and
# healthPath stay with the app repo in Pulumi.<env>.yaml. The value is
# plaintext on purpose: an image digest is public.
set_digest_config() {
  local digest=$1
  require_digest "$digest" "digest"
  run pulumi config set imageDigest "$digest" --stack "$STACK" --cwd "$STACK_DIR" --plaintext
}

# ensure_stack creates the stack when --init-stack was given and the stack does
# not exist yet, so the first release of an app works. It is opt-in: a typo in
# the app or env must fail loudly rather than silently create a second stack.
ensure_stack() {
  [[ ${INIT_STACK:-0} == 1 ]] || return 0
  run pulumi stack init "$STACK" --cwd "$STACK_DIR"
}

# preview_stack writes the release's preview diff to PREVIEW_FILE and prints a
# json-free, human-readable rendering of it. Nothing is applied.
preview_stack() {
  local preview_file=$1
  note "preview diff: $preview_file"
  if dry_run; then
    printf '  [dry-run] pulumi preview --diff --stack %s --cwd %s > %s\n' \
      "$STACK" "$STACK_DIR" "$preview_file"
    return 0
  fi
  if ! pulumi preview --diff --stack "$STACK" --cwd "$STACK_DIR" >"$preview_file"; then
    # A half-written diff must never reach the run summary: delete it, so the job
    # fails without leaving something a human could read as "the plan".
    rm -f "$preview_file"
    die "pulumi preview failed for stack $STACK; nothing was applied"
  fi
  note "wrote $(wc -l <"$preview_file" | tr -d ' ') lines of diff"
}

# up_stack applies the stack and prints the service URL the health check uses.
# --skip-preview is right here and only here: the workflow already ran
# preview.sh over this exact digest, and an implicit second preview would be a
# second plan.
up_stack() {
  run pulumi up --yes --skip-preview --stack "$STACK" --cwd "$STACK_DIR"
  if dry_run; then
    note "service URL: unknown in a dry run"
    return 0
  fi

  local url
  url=$(pulumi stack output url --stack "$STACK" --cwd "$STACK_DIR") || url=""
  [[ -n $url ]] || die "stack $STACK exported no url output, so there is nothing to health check"
  printf 'url=%s\n' "$url"
}
