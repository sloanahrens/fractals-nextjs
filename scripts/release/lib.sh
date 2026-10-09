#!/usr/bin/env bash
#
# Shared helpers for the release scripts (docs/plan.md, bead B5.2). This file is
# sourced by every script in this directory; it is never executed on its own.
#
# Three things live here, and nothing else:
#
#   1. The names. Every script derives the project, registry, image, stack,
#      secrets provider and backend URL the same way from the same inputs, so a
#      release cannot build an image one script would not push and another
#      would not deploy. The derivations follow docs/design.md sections 5 and 6
#      and the bootstrap code that creates the resources: the registry
#      repository is `apps` (internal/gcp/registry.go), the state bucket is
#      `<project>-pulumi-state` (internal/gcp/state_bucket.go), the key ring and
#      key the stacks encrypt their secrets with are `pulumi`/`secrets`
#      (internal/gcp/kms.go), the deployer account is `deployer-<app>`
#      (docs/plan.md, bead B1.10) and a service account's name is
#      `<name>-<env>` (internal/gcp/cloudrun.go, ServiceName).
#
#   2. The rules that keep credentials out of logs. No script ever puts a
#      secret on a command line: the base key reaches gcloud through
#      CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE (a path, not the key), the minted
#      token reaches the Pulumi provider through GOOGLE_OAUTH_ACCESS_TOKEN,
#      docker login reads its password from stdin, and the Application Default
#      Credentials file Pulumi's own calls need is built from the base key by
#      jq reading the key file (adc_credentials) rather than from anything in
#      the environment. run() and capture() are the only ways a script executes
#      an external command, so --dry-run prints every action before it happens
#      and a script cannot quietly shell out.
#
#   3. The cleanup. A script that has to remove something at exit registers it
#      with on_exit rather than setting a trap of its own: this file installs
#      the one EXIT trap, so no script's cleanup can clobber another's.
#
# Nothing here prints, echoes or hands out the contents of a key or a token
# file. Two functions read one: require_key_file reads a key's "type" field to
# refuse anything that is not a service account, and adc_credentials copies the
# key into the ADC file it builds. Neither the key nor the token ever reaches
# stdout, stderr, a command line or a run() echo.

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
# Tools, and cleanup at exit
# ──────────────────────────────────────────────────────────────────────────

# required_tools are the external commands every script in this directory needs
# wherever it runs. jq is the only one: it is what reads the base key's type and
# what builds the ADC file, so a script that mints a token or talks to Pulumi
# cannot work without it. The deploy image installs it (ops/deploy-image).
required_tools=(jq)

# require_tools refuses to continue when a required command is not on PATH. It
# names the tool and where it comes from, because "jq: command not found" from
# inside a subshell is not a message an operator can act on.
require_tools() {
  local tool
  for tool in "${required_tools[@]}"; do
    command -v "$tool" >/dev/null 2>&1 ||
      die "$tool is required and is not on PATH (the deploy image installs it; see ops/deploy-image)"
  done
}

# _GT_CLEANUP_TASKS holds the functions on_exit registered, in order.
_GT_CLEANUP_TASKS=()

# on_exit NAME registers a function to run when the script exits, whatever its
# status. It exists so a script never sets an EXIT trap of its own: this file
# installs the one trap, and a task registered here cannot replace or be
# replaced by another's. A name that is already registered stays where it is, so
# registering one twice is the same as registering it once — which is what a
# caller that runs twice in one process needs (adc_credentials, and the teardown
# template that calls it once per environment). A task must never fail the exit;
# its failure is swallowed so the script's own status survives.
on_exit() {
  local task
  for task in ${_GT_CLEANUP_TASKS[@]+"${_GT_CLEANUP_TASKS[@]}"}; do
    if [[ $task == "$1" ]]; then
      return 0
    fi
  done
  _GT_CLEANUP_TASKS+=("$1")
}

_gt_cleanup_run() {
  local status=$? task
  for task in ${_GT_CLEANUP_TASKS[@]+"${_GT_CLEANUP_TASKS[@]}"}; do
    "$task" || true
  done
  return "$status"
}

trap _gt_cleanup_run EXIT

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
  # The stack is the bare environment name, not "$APP-$ENV_NAME". Pulumi names
  # a stack's state object "<project>/<stack>" inside the backend
  # (.pulumi/stacks/<project>/<stack>.json), and the app's Pulumi project is the
  # name the manifest states as pulumiProject -- "fractals" for the app named
  # fractals-nextjs, which its own deploy/Pulumi.yaml declares (manifests/
  # fractals.yaml; beads dv-iou, dv-4fu). It is not the app's name, which is
  # what APP here is: an app's name is its repository's, while its Pulumi
  # project is a name the app repo chose. The patrol reads an app's state at
  # exactly that path -- it asks for the stack "<pulumiProject>/<env>"
  # (cmd/patrol's readState, pkg/patrol/state/bucket.go), as the manifest
  # comments say -- so the stack name here is what makes a released app's state
  # land where the patrol looks for it. Naming it "<app>-<env>" would write
  # .pulumi/stacks/<pulumiProject>/<app>-<env>.json, an object the patrol never
  # asks for, and the app would be reported as having no state recorded.
  # cmd/patrol's TestAppStackNameMatchesReleaseScripts sources this function and
  # fails if this name and the patrol's disagree, and the deploy, flow and
  # promote suites assert the stack the scripts pass to pulumi.
  STACK="$ENV_NAME"
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

# require_staging_ref REF refuses a ref that looks like a release tag. The
# landing build (build_push_staging.sh, workflows/staging.yml) publishes what
# landed on main, and a protected `v*` tag is the release path's ref: a release
# builds the tag and owns it, so a landing run must not be the thing that builds
# a commit under a release's name (bead dv-pj9).
#
# The check is the tag-shape require_release_tag matches, applied to the last
# segment of the ref, because the ref arrives in whichever form the caller has
# it: `refs/heads/main` from a workflow, `main` from a checkout. Matching the
# shape rather than a `refs/tags/` prefix is the point -- a *branch* named
# `v1.2.3` is a ref a worker can push, and it is refused here for the same
# reason `deploy.yml` refuses a run at any ref that is not a protected release
# tag (docs/design.md, section 6.1; bead dv-csz).
require_staging_ref() {
  local ref=${1:-} name
  name=${ref##*/}
  [[ $name =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] || return 0
  die "ref looks like a release tag, which the release path owns and a landing build must not publish: $ref"
}

# ──────────────────────────────────────────────────────────────────────────
# Credentials
# ──────────────────────────────────────────────────────────────────────────

# require_key_file FILE checks the base key is where the operator said it is and
# that it is the kind of key the release path needs. Three things must hold: the
# file is a regular file, it is not readable by anyone but its owner (the
# release runner holds it, nothing else on the machine should; docs/design.md,
# section 5; bead B3.3 writes it 600), and it is a service account key. The last
# one is not a formality: the ADC file is built by impersonating the deployer
# from this key, and Go's ADC loader accepts a service_account source
# credential, not an authorized_user or an external_account one, so an ADC file
# built from any other type would be a credential Pulumi quietly refuses to use.
#
# Only the key's "type" field is read. The type is named in the refusal because
# it is the one field an operator has to look at again, and the key material is
# never printed.
require_key_file() {
  local file=${1:-} mode type
  need "--key-file (or GT_BASE_KEY_FILE)" "$file"
  require_tools
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

  type=$(jq -r 'if type == "object" then (.type // "") else "" end' "$file" 2>/dev/null) ||
    die "base key file is not valid JSON: $file"
  [[ $type == service_account ]] ||
    die "base key file is not a service account key (its type is ${type:-missing}): $file"
}

# deployer_sa prints the deployer service account of the app in PROJECT, the
# only identity the base key can mint a token for (docs/design.md, section 5;
# the account is created by bootstrap, bead B1.10).
deployer_sa() { printf 'deployer-%s@%s.iam.gserviceaccount.com' "$APP" "$PROJECT"; }

# KMS_RING and KMS_KEY name the key ring and the key inside it that bootstrap
# creates in every app project and that the stacks encrypt their secret values
# with (internal/gcp/kms.go, keyRingName and secretsKeyName). The names are the
# same in every project, as the registry's and the state bucket's are.
KMS_RING=pulumi
KMS_KEY=secrets

# secrets_provider prints the secrets provider every stack is created with, in
# the form pulumi's --secrets-provider takes. It is deliberately neither the
# default (a passphrase, which would be a secret this repo has nowhere to keep)
# nor the state backend's own encryption: a stack's secrets are encrypted with
# the app's own Cloud KMS key, so the deployer's single binding on that key is
# all it takes to read them, and nothing outside the project can.
secrets_provider() {
  printf 'gcpkms://projects/%s/locations/%s/keyRings/%s/cryptoKeys/%s' \
    "$PROJECT" "$REGION" "$KMS_RING" "$KMS_KEY"
}

# adc_credentials builds the Application Default Credentials file Pulumi's own
# calls authenticate with, and points GOOGLE_APPLICATION_CREDENTIALS at it. The
# base key it impersonates from is GT_BASE_KEY_FILE.
#
# Why Pulumi needs a second credential: Google defines ADC as the
# GOOGLE_APPLICATION_CREDENTIALS file, the gcloud application-default file or
# the metadata server, and an access token in an environment variable is none of
# those. The GCP provider reads the minted token from GOOGLE_OAUTH_ACCESS_TOKEN,
# but `pulumi login gs://<project>-pulumi-state` and the gcpkms secrets provider
# go through Go's ADC loader, which on the deploy runner finds no file and no
# metadata server: without this the first pulumi command of a release fails with
# no default credentials.
#
# Go's loader accepts an impersonated_service_account credential, which is what
# `gcloud auth application-default login --impersonate-service-account` writes,
# so the file built here has that shape: its source_credentials is the base key
# itself and its impersonation URL mints from the app's deployer account. The
# authority a job holds is therefore the deployer account for as long as the job
# runs, because the client libraries refresh the impersonated token themselves —
# and no longer and no wider than that: the URL names one account, and the base
# key's single serviceAccountTokenCreator binding is still what authorizes it
# (docs/design.md, section 5).
#
# The file is a credential and is treated as one. It is created with umask 077
# inside a private mktemp directory, so it is mode 600 from creation; jq is
# given the key's *path* (--slurpfile) and never its contents on a command line;
# nothing here prints any of it; and the lib's exit cleanup removes the file and
# its directory however the script ends.
adc_credentials() {
  local key_file=${GT_BASE_KEY_FILE:-} sa url
  require_key_file "$key_file"

  # A process can ask more than once: the teardown template previews both
  # environments in one step, and each pass calls pulumi_env. The credential
  # belongs to the process, so an earlier file is removed before a new one is
  # written — one copy of the key on disk at a time, and none left behind when
  # the step ends.
  adc_cleanup

  sa=$(deployer_sa)
  url="https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/$sa:generateAccessToken"

  ADC_DIR=$(mktemp -d "${TMPDIR:-/tmp}/gt-adc-${APP}.XXXXXX") ||
    die "could not create a private directory for the ADC file"
  chmod 700 "$ADC_DIR"
  ADC_FILE="$ADC_DIR/adc.json"

  # jq's stderr is dropped for the same reason require_key_file drops it: a
  # parse diagnostic is the one place a jq that quotes its input could put key
  # material into a job log, and the file has already been read as valid JSON of
  # the right type by then, so the diagnostic would be about a race, not about
  # the operator's input.
  (umask 077 && jq -n --arg url "$url" --slurpfile source "$key_file" \
    '{type:"impersonated_service_account",
      service_account_impersonation_url:$url,
      delegates:[],
      source_credentials:$source[0]}' >"$ADC_FILE" 2>/dev/null) ||
    die "jq could not build the ADC file from $key_file"
  chmod 600 "$ADC_FILE"

  export GOOGLE_APPLICATION_CREDENTIALS="$ADC_FILE"
  on_exit adc_cleanup
}

# adc_cleanup removes the ADC file and its private directory. It is registered
# with on_exit rather than with a trap of its own, so it cannot clobber a trap a
# script set for itself, and it is safe to call at any time: with no file to
# remove it does nothing, which is what lets adc_credentials call it before
# writing a second one.
adc_cleanup() {
  [[ -n ${ADC_FILE:-} ]] || return 0
  rm -f "$ADC_FILE"
  rmdir "$ADC_DIR" 2>/dev/null || true
  ADC_FILE=''
}

# pulumi_env makes the credentials Pulumi needs available and points Pulumi at
# the app's state bucket. There are two, for two callers:
#
#   - GOOGLE_OAUTH_ACCESS_TOKEN is the minted token, and it is what the GCP
#     provider reads. It travels in the environment of the pulumi process, never
#     in its argv, so it cannot be read out of a process listing or a printed
#     command line. It is never echoed.
#   - GOOGLE_APPLICATION_CREDENTIALS is the impersonated ADC file, and it is
#     what the gs:// state backend and the gcpkms secrets provider read
#     (adc_credentials).
#
# A dry run reads neither: it prints what it would do.
pulumi_env() {
  local token_file=${1:-}
  need "--token-file (or GT_TOKEN_FILE)" "$token_file"
  export PULUMI_BACKEND_URL="$BACKEND_URL"

  if dry_run; then
    note "would run the provider with the token from $token_file (not read in a dry run)"
    note "would build the ADC file for the gs:// backend and gcpkms secrets provider from ${GT_BASE_KEY_FILE:-the base key} (not read in a dry run)"
    return 0
  fi
  [[ -f $token_file ]] || die "token file does not exist: $token_file (run mint_token.sh first)"
  GOOGLE_OAUTH_ACCESS_TOKEN=$(<"$token_file")
  [[ -n $GOOGLE_OAUTH_ACCESS_TOKEN ]] || die "token file is empty: $token_file"
  export GOOGLE_OAUTH_ACCESS_TOKEN

  adc_credentials
}

# ──────────────────────────────────────────────────────────────────────────
# Pulumi stacks
# ──────────────────────────────────────────────────────────────────────────

# require_stack_settings refuses to continue unless the stack's committed
# settings file says the stack's secrets are encrypted with this project's own
# key. Call it after release_target (it reads STACK, STACK_DIR and PROJECT) and
# before pulumi_env: it reads one file and needs no credentials, so a stack
# whose settings cannot work is refused before anything is minted or built.
#
# `pulumi stack init --secrets-provider gcpkms://...` records two lines in
# <stack-dir>/Pulumi.<stack>.yaml -- secretsprovider and encryptedkey -- and
# Pulumi documents that file as committed state. A checkout that does not have
# them falls back to the passphrase provider, and every pulumi command then
# fails with "passphrase must be set with PULUMI_CONFIG_PASSPHRASE". That is
# what the pre-release rehearsal of 2026-10-08 hit: init_stack.sh ran in a
# throwaway checkout, so the lines it printed went with the checkout and the
# file the app repo commits never got them.
#
# Two refusals, because they need different fixes: a file with no
# secretsprovider line at all, and one that names some other project's key. The
# second is not pedantry -- a stack file copied from another app's stack is a
# stack whose secrets this release cannot read, and the release would fail
# later, once a stack had already been touched.
#
# Only the secretsprovider line is read from the file, and only its value --
# the provider URL -- is ever printed. encryptedkey is the stack's secrets key
# in encrypted form; this check has no use for it, so it is not read, compared
# or printed. init_stack.sh is the one place that prints it, for the operator to
# commit (see there).
require_stack_settings() {
  local file=$STACK_DIR/Pulumi.$STACK.yaml want got
  want=$(secrets_provider)

  [[ -f $file ]] ||
    die "$file does not exist: the stack's settings file is committed state, and without it Pulumi falls back to a passphrase provider (every pulumi command then fails with \"passphrase must be set with PULUMI_CONFIG_PASSPHRASE\"). Create the $STACK stack with scripts/release/init_stack.sh --app $APP --env $ENV_NAME and commit the settings-begin/settings-end block it prints into $file"
  [[ -r $file ]] || die "$file is not readable by $(id -un)"

  # grep only: one line out of the file, and nothing else in it is read. The
  # value is the text after the key's colon, with the line's whitespace removed.
  got=$(grep -m1 '^secretsprovider:' "$file" 2>/dev/null || true)
  got=${got#*:}
  got=${got//[[:space:]]/}

  [[ -n $got ]] ||
    die "$file has no secretsprovider: line, so Pulumi would use a passphrase provider and every pulumi command would fail with \"passphrase must be set with PULUMI_CONFIG_PASSPHRASE\". Create the $STACK stack with scripts/release/init_stack.sh --app $APP --env $ENV_NAME and commit the settings-begin/settings-end block it prints into $file"

  [[ $got == "$want" ]] ||
    die "$file names a different secrets provider than this project's: $got (want $want). A stack whose secrets are encrypted with another project's KMS key -- or with a passphrase -- is one this release cannot open. Run scripts/release/init_stack.sh --app $APP --env $ENV_NAME in a checkout of this app and commit the settings-begin/settings-end block it prints into $file"
}

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
# the app or env must fail loudly rather than silently create a second stack. It
# creates the stack with the same secrets provider init_stack.sh uses, so a
# release that creates a stack itself gets one whose secrets are encrypted the
# way every other stack's are.
ensure_stack() {
  [[ ${INIT_STACK:-0} == 1 ]] || return 0
  run pulumi stack init "$STACK" --cwd "$STACK_DIR" --secrets-provider "$(secrets_provider)"
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
