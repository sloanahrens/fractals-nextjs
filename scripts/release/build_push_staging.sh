#!/usr/bin/env bash
#
# The landing build (bead dv-pj9): build the commit at the head of main and push
# it to the app's Artifact Registry repository as
# <image>:main-<first 12 hex characters of the commit>.
#
# It is build_push.sh's sibling on the other half of the release model. A
# release builds a protected `v*` tag and deploys it to staging and then to the
# environment deploy.yml promotes to; staging is *also* deployed on every
# landing, from the commit that landed, so anyone watching staging -- the
# fractals steward above all -- sees a landed change without waiting for the
# next release (workflows/staging.yml). The two builds are the same build: the
# app's Dockerfile, pushed to the app's registry, with the digest the registry
# hands back as the identity that every later step deploys. Only the name the
# image is published under differs, and here it is derived from the commit
# rather than from a tag, because there is no tag to publish a landing under.
#
# The commit is the image's other half, and both halves come from the one read
# of it: it names the image (main-<12 hex>) and it travels to the build as
# --build-arg GIT_SHA=<commit>, so the deployed service can report the commit it
# was built from — the integration tier reads /api/version and fails when it
# does not name the commit just built
# (~/gt/docs/plans/2026-10-08-automated-release-design.md, section 2). An app
# whose Dockerfile declares no ARG GIT_SHA still builds: docker only warns that
# the build-arg went unconsumed (README, "The commit an image carries").
#
# This script never publishes a release and never touches one. What it refuses
# is the whole of that claim:
#
#   - a tree that is not clean: a landing build publishes the commit, not the
#     edits someone left in the checkout;
#   - a ref that looks like a release tag: the release path owns `v*` (a landing
#     run is not a release, and a dispatch inside Forgejo names any ref it likes
#     -- bead dv-csz);
#   - a HEAD that is not on main: main only ever moves through the gated landing
#     worker (the ci gate and om review), so what a landing run publishes is a
#     commit that passed that gate. A worker's own branch is exactly the commit
#     this refuses, which is what keeps a run started at a branch from deploying
#     one.
#
# There is deliberately no --allow-non-checkout, which build_push.sh has for a
# rehearsal that verified a tag some other way. Here the git checks are not a
# convenience check on top of the build; they are what makes "only what landed
# is published" true, so a source directory without a checkout is refused rather
# than waived.
#
# Usage:
#   build_push_staging.sh --app APP [--project gt-APP] [--region us-central1]
#                         [--source DIR] [--ref REF] [--token-file FILE]
#                         [--digest-file FILE] [--dry-run]
#
# --ref is the ref the run is at, which the workflow passes as $GITHUB_REF.
# Without it the ref is read from the checkout, so a script run by hand in the
# app repo checks the same thing the run does. Either way a ref that looks like
# a release tag is refused.
#
# --token-file is the file mint_token.sh wrote. When it is given, docker logs in
# to Artifact Registry with the token read from stdin (never from the command
# line, so it stays out of the process listing); without it the build relies on
# whatever docker credentials the runner already has.
#
# Every input can also come from the environment: GT_APP, GT_PROJECT,
# GT_REGION, GT_SOURCE, GT_REF, GT_TOKEN_FILE, GT_DIGEST_FILE, DRY_RUN=1.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP=${GT_APP:-}
PROJECT=''
REGION=''
SOURCE=${GT_SOURCE:-.}
REF=${GT_REF:-}
TOKEN_FILE=${GT_TOKEN_FILE:-}
DIGEST_FILE=${GT_DIGEST_FILE:-}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --app APP [options]" \
    '' \
    '  --app APP            app name, e.g. fractals-nextjs (GT_APP)' \
    '  --project gt-APP     GCP project, default gt-APP (GT_PROJECT)' \
    '  --region us-central1 (GT_REGION)' \
    '  --source DIR         checkout of main, default . (GT_SOURCE)' \
    '  --ref REF            ref the run is at, default from the checkout (GT_REF)' \
    '  --token-file FILE    token from mint_token.sh, for docker login (GT_TOKEN_FILE)' \
    '  --digest-file FILE   write the digest here as well (GT_DIGEST_FILE)' \
    '  --dry-run            print the build and push without running them' \
    '' \
    'Prints image=, tag= and digest= on stdout; the tag is main-<12 hex of the commit>'
}

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
  --region)
    REGION=${2:-}
    shift 2
    ;;
  --source)
    SOURCE=${2:-}
    shift 2
    ;;
  --ref)
    REF=${2:-}
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
  *) die "unknown argument: $1 (try --help)" ;;
  esac
done

# A build has no environment of its own: the image is built once and deployed to
# staging. release_target still derives the registry path from the project, and
# it needs an env only to name a stack this script never touches.
ENV_NAME=staging
release_target
[[ -d $SOURCE ]] || die "source directory does not exist: $SOURCE"
[[ -f $SOURCE/Dockerfile ]] || die "no Dockerfile in $SOURCE (an app repo provides one at its root)"

# Everything below reads the checkout with git, so a directory that is not one
# is refused before anything else: there is no commit to publish and no ref to
# check without it.
git -C "$SOURCE" rev-parse --git-dir >/dev/null 2>&1 ||
  die "$SOURCE is not a git checkout; a landing build takes the commit it publishes and the ref it is at from git"

if [[ -z $REF ]]; then
  REF=$(git -C "$SOURCE" rev-parse --abbrev-ref HEAD)
  note "ref read from the checkout: $REF"
fi
require_staging_ref "$REF"

step "Verifying $SOURCE is a clean checkout of a commit on main"
[[ -z $(git -C "$SOURCE" status --porcelain) ]] ||
  die "working tree of $SOURCE is not clean; a landing build publishes the commit, not local edits"

# The commit is read once here and used twice below: it names the image
# (main-<12 hex>) and it is the GIT_SHA the image is built with. A checkout
# whose HEAD cannot be read has nothing to publish under and nothing to record,
# so the read is allowed to fail and the refusal below is the one that speaks: a
# raw "fatal: ambiguous argument 'HEAD'" from git under `set -e` names neither
# the source directory nor what was wanted.
head_commit=$(git -C "$SOURCE" rev-parse HEAD || true)
[[ $head_commit =~ ^[0-9a-f]{40}$ ]] ||
  die "could not read the commit at HEAD of $SOURCE with git: ${head_commit:-nothing}"

# The commit has to be one main carries. origin/main is the checkout's own
# remote-tracking ref, as the workflow's checkout left it, and the check is a
# plain git ancestry read: no fetch, no network beyond the checkout, and so
# nothing that could fail for a reason a release would not also hit.
#
# The check is ancestry and not equality on purpose. A queued landing run whose
# main has already moved on is skipped by the workflow (a stale-main skip, with
# its own read of main), and a build here is allowed to be that older commit for
# as long as it is one main carries -- what must never happen is publishing a
# commit main does not have, which is a worker's own branch.
git -C "$SOURCE" rev-parse -q --verify refs/remotes/origin/main >/dev/null ||
  die "$SOURCE has no origin/main; the landing build needs the ref main is at to check that HEAD is on it (check out the repository, or fetch origin main)"
if ! git -C "$SOURCE" merge-base --is-ancestor "$head_commit" refs/remotes/origin/main; then
  die "HEAD of $SOURCE ($head_commit) is not on main: a landing build publishes what main carries, and only what the gate let onto main. Check out main, or leave the commit to a release"
fi
note "HEAD is on main ($head_commit)"

# The name a landing is published under. It is built from the commit, so two
# runs can never publish over each other under one movable name, and the digest
# is read back from the registry afterwards exactly as build_push.sh reads it:
# the published digest, not the name, is what the deploy steps receive.
TAG=main-${head_commit:0:12}

if [[ -n $TOKEN_FILE ]]; then
  step "Logging in to $REGISTRY_HOST"
  if ! dry_run; then
    [[ -f $TOKEN_FILE ]] || die "token file does not exist: $TOKEN_FILE (run mint_token.sh first)"
  fi
  run docker login --username oauth2accesstoken --password-stdin "$REGISTRY_HOST" <"$TOKEN_FILE"
fi

step "Building $IMAGE:$TAG"
run docker build --file "$SOURCE/Dockerfile" --tag "$IMAGE:$TAG" \
  --build-arg "GIT_SHA=$head_commit" "$SOURCE"

step "Pushing $IMAGE:$TAG"
run docker push "$IMAGE:$TAG"

# The registry's own record of the push is what the deploy steps get, read back
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
