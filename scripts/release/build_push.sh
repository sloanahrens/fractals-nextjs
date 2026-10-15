#!/usr/bin/env bash
#
# Step 2 of the release flow (docs/design.md, section 6): build the app's image
# from a release tag and push it to the app's Artifact Registry repository.
#
# The digest this prints is the release's identity from here on. Steps 4 to 6
# deploy that digest, never a tag, so the image the preview was read against is
# the image that runs (bead B5.2).
#
# The image is built with --build-arg GIT_SHA=<the tag's commit>, so the image
# carries the identity of the commit it was built from and the service it
# becomes can report it: the integration tier reads /api/version and fails when
# it does not name the commit just built
# (~/gt/docs/plans/2026-10-08-automated-release-design.md, section 2). An app
# whose Dockerfile declares no ARG GIT_SHA still builds — docker only warns that
# a build-arg nothing consumed went unused (README, "The commit an image
# carries").
#
# Usage:
#   build_push.sh --app APP --tag vX.Y.Z [--project gt-APP] [--region us-central1]
#                 [--source DIR] [--token-file FILE] [--digest-file FILE]
#                 [--allow-non-checkout] [--dry-run]
#
# --token-file is the file mint_token.sh wrote. When it is given, docker logs in
# to Artifact Registry with the token read from stdin (never from the command
# line, so it stays out of the process listing); without it the build relies on
# whatever docker credentials the runner already has.
#
# Every input can also come from the environment: GT_APP, GT_PROJECT,
# GT_REGION, GT_SOURCE, GT_TOKEN_FILE, GT_DIGEST_FILE, DRY_RUN=1.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP=${GT_APP:-}
TAG=''
PROJECT=''
REGION=''
SOURCE=${GT_SOURCE:-.}
TOKEN_FILE=${GT_TOKEN_FILE:-}
DIGEST_FILE=${GT_DIGEST_FILE:-}
ALLOW_NON_CHECKOUT=0

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --app APP --tag vX.Y.Z [options]" \
    '' \
    '  --app APP            app name, e.g. fractals-nextjs (GT_APP)' \
    '  --tag vX.Y.Z         release tag to build; refuses anything else (GT_TAG)' \
    '  --project gt-APP     GCP project, default gt-APP (GT_PROJECT)' \
    '  --region us-central1 (GT_REGION)' \
    '  --source DIR         app checkout, default . (GT_SOURCE)' \
    '  --token-file FILE    token from mint_token.sh, for docker login (GT_TOKEN_FILE)' \
    '  --digest-file FILE   write the digest here as well (GT_DIGEST_FILE)' \
    '  --allow-non-checkout skip the tag check on a plain directory' \
    '  --dry-run            print the build and push without running them' \
    '' \
    'Prints image=, tag= and digest= on stdout; the digest is the release identity.'
}

while [[ $# -gt 0 ]]; do
  if common_flag "$@"; then shift; continue; fi
  case $1 in
  --app)
    APP=${2:-}
    shift 2
    ;;
  --tag)
    TAG=${2:-}
    shift 2
    ;;
  --project)
    PROJECT=${2:-}
    shift 2
    ;;
  --region)
    REGION=${2:-}
    shift 2
    ;;
  --source)
    SOURCE=${2:-}
    shift 2
    ;;
  --token-file)
    TOKEN_FILE=${2:-}
    shift 2
    ;;
  --digest-file)
    DIGEST_FILE=${2:-}
    shift 2
    ;;
  --allow-non-checkout)
    ALLOW_NON_CHECKOUT=1
    shift
    ;;
  *) die "unknown argument: $1 (try --help)" ;;
  esac
done

# A build has no environment of its own: the image is built once and deployed to
# staging and then prod. release_target still derives the registry path from the
# project, and it needs an env only to name a stack this script never touches.
ENV_NAME=staging
release_target
require_release_tag "$TAG"
[[ -d $SOURCE ]] || die "source directory does not exist: $SOURCE"
[[ -f $SOURCE/Dockerfile ]] || die "no Dockerfile in $SOURCE (an app repo provides one at its root)"

# The build must be the tag's commit, not whatever happened to be checked out.
# A branch that moved between the tag push and this run would otherwise publish
# an image labelled v1.2.3 that is not v1.2.3.
#
# GIT_SHA is that same commit, and it is taken from the one read that this check
# already makes, so the commit the tag was verified against is the commit the
# image carries.
GIT_SHA=''
if git -C "$SOURCE" rev-parse --git-dir >/dev/null 2>&1; then
  step "Verifying $SOURCE is at tag $TAG"
  [[ -z $(git -C "$SOURCE" status --porcelain) ]] ||
    die "working tree of $SOURCE is not clean; a release builds the tag, not local edits"
  tag_commit=$(git -C "$SOURCE" rev-parse -q --verify "refs/tags/$TAG^{commit}" || true)
  [[ -n $tag_commit ]] || die "tag $TAG does not exist in $SOURCE"
  head_commit=$(git -C "$SOURCE" rev-parse HEAD)
  [[ $head_commit == "$tag_commit" ]] ||
    die "HEAD of $SOURCE is $head_commit, not tag $TAG ($tag_commit)"
  GIT_SHA=$tag_commit
  note "HEAD is $TAG ($GIT_SHA)"
elif [[ $ALLOW_NON_CHECKOUT != 1 ]]; then
  die "$SOURCE is not a git checkout; pass --allow-non-checkout only if the tag was verified some other way"
else
  note "$SOURCE is not a git checkout; the tag check is waived by --allow-non-checkout"
fi

# A source that is not a git checkout has no commit to read, and
# --allow-non-checkout waives the tag check and not this one: the image is built
# to carry the commit, so a build that cannot name it is refused before docker
# runs. The shape is checked rather than trusted too, because this value is the
# only thing that says which commit the image is, and a truncated or empty one
# would put an image in the registry under a claim no service could verify.
[[ $GIT_SHA =~ ^[0-9a-f]{40}$ ]] ||
  die "cannot read the commit to build in $SOURCE (got: ${GIT_SHA:-nothing}): the image records it as GIT_SHA, and only a full 40 hex commit may reach the build. Build from a git checkout of tag $TAG"

if [[ -n $TOKEN_FILE ]]; then
  step "Logging in to $REGISTRY_HOST"
  if ! dry_run; then
    [[ -f $TOKEN_FILE ]] || die "token file does not exist: $TOKEN_FILE (run mint_token.sh first)"
  fi
  run docker login --username oauth2accesstoken --password-stdin "$REGISTRY_HOST" <"$TOKEN_FILE"
fi

# The build runs under a bound and gets one automatic retry, exactly as the
# landing build's does (bead dv-96nw, and scripts/release/build_push_staging.sh
# states the incident): it is the same build, so the step that can stop writing
# output is the same step, and a release that meets it should end the same way a
# landing does — with a diagnostic, a second attempt and a failed job rather
# than a runner held until someone notices.
step "Building $IMAGE:$TAG"
docker_build_bounded "$IMAGE:$TAG" "$SOURCE" "GIT_SHA=$GIT_SHA"

step "Pushing $IMAGE:$TAG"
run docker push "$IMAGE:$TAG"

# The registry's own record of the push is the release identity. It is read back
# rather than assumed, so a push that did not land cannot hand the workflow a
# digest for an image that is not there.
step "Reading the pushed digest"
digest=$(capture docker inspect --format '{{index .RepoDigests 0}}' "$IMAGE:$TAG" || true)
if [[ -z $digest ]]; then
  note "no digest available in a dry run"
  printf 'image=%s\ntag=%s\ndigest=%s\n' "$IMAGE" "$TAG" ''
  exit 0
fi
is_digest "$digest" || die "docker inspect returned something that is not a digest: $digest"
[[ $digest == "$IMAGE@"* ]] ||
  die "docker inspect returned a digest for another repository: $digest (expected $IMAGE)"

if [[ -n $DIGEST_FILE ]]; then
  printf '%s\n' "$digest" >"$DIGEST_FILE"
  note "wrote the digest to $DIGEST_FILE"
fi

printf 'image=%s\ntag=%s\ndigest=%s\n' "$IMAGE" "$TAG" "$digest"
