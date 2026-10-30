#!/usr/bin/env bash
#
# Resolve a released tag to the image digest it names, for the `up` flow (bead
# dv-35th; the design is docs/specs/2026-10-12-fractals-down-up-design.md).
#
# The release flow's identity is a digest and never a tag (docs/design.md,
# section 6): build_push.sh builds an image once, prints the digest it pushed,
# and every step after it deploys that value. After a teardown there is no
# build job and no digest anywhere in the flow -- what survives is the registry
# tag `vX.Y.Z` the release pushed -- so `up` has to ask the registry what image
# that name holds now and deploy *that* digest.
#
# Why the tag cannot be passed on instead: a tag is a name, and a name can be
# moved to another image. build_push.sh never re-pushes a tag and the human
# turns on the registry's immutable tags (the design's human step 5), but this
# script cannot read either of those facts from the registry -- so it resolves
# the name to a digest once, here, and only the digest travels on to up.sh and
# promote.sh. That is the same rule the rest of the flow follows: what is
# checked is what is deployed.
#
# The read uses the credential the rest of the release path uses: the one-hour
# token mint_token.sh wrote, which gcloud reads from the file named here. No
# new secret is introduced, and the token itself never reaches a command line,
# this script's memory or a log.
#
# Usage:
#   digest_for_tag.sh --app APP --tag vX.Y.Z --token-file FILE
#                     [--project gt-APP] [--region us-central1] [--dry-run]
#
# Prints digest=<registry>@sha256:<64 lowercase hex> on stdout and nothing else
# there: stdout is what the workflow reads into $GITHUB_OUTPUT, so a tag that
# cannot be resolved has to leave that stream empty and say what is wrong on
# stderr. It reads and prints; it deploys nothing and changes nothing.
#
# Environment fallbacks: GT_APP, GT_TAG, GT_PROJECT, GT_REGION, GT_TOKEN_FILE,
# GT_BASE_KEY_FILE, GT_STACK_DIR, GT_BACKEND_URL, DRY_RUN=1.

set -euo pipefail
SCRIPT_NAME=${0##*/}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP=${GT_APP:-}
TAG=${GT_TAG:-}
PROJECT=${GT_PROJECT:-}
REGION=${GT_REGION:-}
TOKEN_FILE=${GT_TOKEN_FILE:-}

usage() {
  printf '%s\n' \
    "usage: $SCRIPT_NAME --app APP --tag vX.Y.Z --token-file FILE [options]" \
    '' \
    '  --app APP           app name (GT_APP)' \
    '  --tag vX.Y.Z        released tag to resolve; a release tag, not an image name (GT_TAG)' \
    '  --token-file FILE   token from mint_token.sh (GT_TOKEN_FILE)' \
    '  --project gt-APP    GCP project, default gt-APP (GT_PROJECT)' \
    '  --region us-central1 (GT_REGION)' \
    '  --dry-run           print the read without running it' \
    '' \
    'Prints digest=<registry>@sha256:<64hex>: the image the released tag vX.Y.Z' \
    'names in Artifact Registry. A tag that is not there, or one that resolves' \
    'to no digest at all, is refused with a message naming the tag.'
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
  --token-file)
    TOKEN_FILE=${2:-}
    shift 2
    ;;
  *) die "unknown argument: $1 (try --help)" ;;
  esac
done

# The tag is checked before anything else, and as a *release* tag: the two
# failures need different fixes, and "the image named up-v1.2.3 does not exist"
# would send the operator looking in the registry for a mistake they made in
# the workflow. The shape is require_release_tag's, so the version the workflow
# strips off its own `up-` tag is what this accepts and nothing looser.
require_release_tag "$TAG"
# release_target derives IMAGE (the registry path this app's releases push to),
# so the read below asks about exactly the image build_push.sh pushes.
release_target
# The digest this script prints is the app image's: the image of a list of one,
# else `app`. Its path is $IMAGE for the default list and $IMAGE/app for a list
# of several (lib.sh, "Named images"); a list with neither has no digest here.
primary=$(primary_image) ||
  die "GT_IMAGES (${IMAGE_NAMES[*]}) lists no app image, and this script resolves the digest of that one"
IMAGE=$(image_ref "${IMAGE_NAMES[$primary]}")
need "--token-file (or GT_TOKEN_FILE)" "$TOKEN_FILE"

# Nothing is printed on the way to the read, unlike the other scripts: the
# workflow reads this script's stdout into $GITHUB_OUTPUT, so every refusal
# below has to leave it empty, and a note here would be a line the workflow
# printed as if it were the answer. What an operator needs from a refusal is in
# the refusal's own message, on stderr.
if ! dry_run; then
  [[ -f $TOKEN_FILE ]] || die "token file does not exist: $TOKEN_FILE (run mint_token.sh first)"
fi

# The read. --access-token-file is gcloud's own flag for a minted access token,
# and what it names is a *path*: gcloud reads the file, so the token is on no
# command line and never in this script's memory. The format is the `value`
# one, so what comes back is the bare body of the image summary's digest field
# (`sha256:<64 hex>`), which is already what the rest of the flow passes
# around -- there is no JSON here to select a field out of.
released=$(capture gcloud artifacts docker images describe "$IMAGE:$TAG" \
  --format='value(image_summary.digest)' --access-token-file="$TOKEN_FILE") ||
  die "the registry could not be read for $IMAGE:$TAG: the tag $TAG is not in $PROJECT, or the deployer account cannot read it (a tag no release pushed is a name with no image behind it; cut a release with a v* tag to build one)"

if dry_run; then
  note "would print the image the tag $TAG names as $IMAGE@sha256:<64 hex> (nothing is read in a dry run)"
  exit 0
fi

# gcloud prints one line; a trailing newline is all the trimming needed, and
# anything else it might have printed is a value this script refuses rather
# than a value it passes on.
released=${released//[[:space:]]/}
[[ -n $released ]] ||
  die "the registry answered for $IMAGE:$TAG with no digest at all, so the tag $TAG names no image this flow can deploy"
[[ $released =~ ^sha256:[0-9a-f]{64}$ ]] ||
  die "the registry answered for the tag $TAG with something that is not a digest: '${released}' (want sha256:<64 lowercase hex>, so that a tag cannot be what reaches up.sh and promote.sh)"

printf 'digest=%s@%s\n' "$IMAGE" "$released"
