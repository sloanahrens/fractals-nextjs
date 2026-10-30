#!/usr/bin/env bats
#
# Step 2 of the release flow (bead B5.2): build from the tag, push it, print the
# digest. The tests care most about the two mistakes this script can make:
# publishing an image that is not the tag, and putting a credential where a
# process listing or a job log can read it.
#
# The build also carries the commit it built, as GIT_SHA (bead dv-lh6): the
# assertions on the build line name that build-arg with the tag's own commit, so
# a build that passed some other commit, or none, fails here rather than in the
# integration tier that reads it back off /api/version.

load helpers.bash

setup_file() {
  make_checkout "$BATS_FILE_TMPDIR/app" v1.0.0
}

setup() {
  setup_release_env
  CHECKOUT=$BATS_TEST_TMPDIR/app
  copy_checkout "$BATS_FILE_TMPDIR/app" "$CHECKOUT"
  HEAD_COMMIT=$(git -C "$CHECKOUT" rev-parse HEAD)
}

@test "builds the tagged commit and prints its digest" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  [[ $output == *"image=$IMAGE"* ]]
  [[ $output == *"tag=v1.0.0"* ]]
  [[ $output == *"digest=$IMAGE@sha256:$DIGEST_HEX"* ]]

  # The exact build line: the tag's commit is the build-arg, so the image cannot
  # say it came from a commit it did not.
  grep -q "docker build --file $CHECKOUT/Dockerfile --tag $IMAGE:v1.0.0 --build-arg GIT_SHA=$HEAD_COMMIT $CHECKOUT" "$FAKE_LOG"
  grep -q "docker push $IMAGE:v1.0.0" "$FAKE_LOG"
}

# add_dockerfiles NAME... commits a Dockerfile.NAME per name and moves the tag
# onto that commit, so the checkout is still exactly the tag the script verifies.
add_dockerfiles() {
  local name
  for name in "$@"; do
    printf 'FROM scratch\nLABEL part=%s\n' "$name" >"$CHECKOUT/Dockerfile.$name"
  done
  git -C "$CHECKOUT" add -A
  git -C "$CHECKOUT" -c commit.gpgsign=false -c user.name=test -c user.email=test@example.invalid \
    commit -qm "images: $*"
  git -C "$CHECKOUT" tag -f v1.0.0 >/dev/null
  HEAD_COMMIT=$(git -C "$CHECKOUT" rev-parse HEAD)
}

@test "the default image list builds one image at the old path and names it image.app" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  # The path does not move: a list of one is today's path, and digest= is the
  # line the workflows read the app image's digest from.
  [[ $output == *"image=$IMAGE"$'\n'* ]]
  [[ $output == *"digest=$IMAGE@sha256:$DIGEST_HEX"* ]]
  [[ $output == *"image.app=$IMAGE@sha256:$DIGEST_HEX"* ]]
  [ "$(grep -c 'docker build' "$FAKE_LOG")" -eq 1 ]
}

@test "GT_IMAGES builds one image per name from its own Dockerfile, each at its own path" {
  add_dockerfiles engine ui

  GT_IMAGES="engine ui" run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  grep -q "docker build --file $CHECKOUT/Dockerfile.engine --tag $IMAGE/engine:v1.0.0 --build-arg GIT_SHA=$HEAD_COMMIT $CHECKOUT" "$FAKE_LOG"
  grep -q "docker build --file $CHECKOUT/Dockerfile.ui --tag $IMAGE/ui:v1.0.0 --build-arg GIT_SHA=$HEAD_COMMIT $CHECKOUT" "$FAKE_LOG"
  grep -q "docker push $IMAGE/engine:v1.0.0" "$FAKE_LOG"
  grep -q "docker push $IMAGE/ui:v1.0.0" "$FAKE_LOG"
  [[ $output == *"image.engine=$IMAGE/engine@sha256:$DIGEST_HEX"* ]]
  [[ $output == *"image.ui=$IMAGE/ui@sha256:$DIGEST_HEX"* ]]
  # The list has no app image, so there is no app digest to print.
  [[ $output != *$'\ndigest='* ]]
}

@test "a list that includes app builds it from the plain Dockerfile and keeps digest=" {
  add_dockerfiles ui

  GT_IMAGES="app ui" run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  grep -q "docker build --file $CHECKOUT/Dockerfile --tag $IMAGE/app:v1.0.0 " "$FAKE_LOG"
  [[ $output == *"digest=$IMAGE/app@sha256:$DIGEST_HEX"* ]]
  [[ $output == *"image.app=$IMAGE/app@sha256:$DIGEST_HEX"* ]]
  [[ $output == *"image.ui=$IMAGE/ui@sha256:$DIGEST_HEX"* ]]
  # images= is the line a workflow copies into its step outputs (its key has no
  # dot) and hands to the later jobs as GT_IMAGE_DIGESTS: every image but app.
  [[ $output == *$'\nimages=ui='"$IMAGE/ui@sha256:$DIGEST_HEX"* ]]
}

@test "a missing Dockerfile for a named image fails naming it, before any build" {
  add_dockerfiles engine

  GT_IMAGES="engine ui" run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"no Dockerfile.ui in $CHECKOUT"* ]]
  ! grep -q 'docker build' "$FAKE_LOG"
}

@test "refuses an image name that is not a name, and a name given twice" {
  GT_IMAGES="engine Engine" run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT"
  [ "$status" -ne 0 ]
  [[ $output == *"GT_IMAGES"* && $output == *"Engine"* ]]

  GT_IMAGES="ui ui" run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT"
  [ "$status" -ne 0 ]
  [[ $output == *"twice"* ]]
}

@test "refuses a tag that is not a release tag" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag latest --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"release tag must look like v1.2.3"* ]]
}

@test "refuses a working tree with uncommitted changes" {
  printf 'FROM alpine\n' >>"$CHECKOUT/Dockerfile"

  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"not clean"* ]]
}

@test "refuses a commit that is not the tag" {
  printf 'FROM scratch\nLABEL rev=2\n' >"$CHECKOUT/Dockerfile"
  git -C "$CHECKOUT" -c commit.gpgsign=false -c user.name=test -c user.email=test@example.invalid \
    commit -qam 'after the tag'

  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"not tag v1.0.0"* ]]
}

@test "refuses a source directory without a Dockerfile" {
  mkdir -p "$BATS_TEST_TMPDIR/empty"

  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$BATS_TEST_TMPDIR/empty" --allow-non-checkout

  [ "$status" -ne 0 ]
  [[ $output == *"no Dockerfile"* ]]
}

@test "refuses a source with no commit to record, before docker runs" {
  # The commit can only be missing, not malformed: `git rev-parse HEAD` either
  # answers 40 hex or fails, which is why the refusal is tested here. A plain
  # directory is what --allow-non-checkout is for, and it waives the tag check
  # and not this one — an image with no commit to carry is not built (dv-lh6).
  local plain=$BATS_TEST_TMPDIR/plain
  mkdir -p "$plain"
  printf 'FROM scratch\n' >"$plain/Dockerfile"

  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$plain" --allow-non-checkout

  [ "$status" -ne 0 ]
  [[ $output == *"cannot read the commit to build"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "writes the digest to --digest-file as well" {
  local digest_file=$BATS_TEST_TMPDIR/digest.txt

  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --digest-file "$digest_file"

  [ "$status" -eq 0 ]
  [ -f "$digest_file" ] || {
    printf 'no digest file at %s; the script printed:\n%s\n' "$digest_file" "$output" >&2
    return 1
  }
  [ "$(cat "$digest_file")" = "$IMAGE@sha256:$DIGEST_HEX" ] || {
    printf 'digest file holds %q, want %q\n' "$(cat "$digest_file")" "$IMAGE@sha256:$DIGEST_HEX" >&2
    return 1
  }
}

@test "refuses --digest-file when the list has no app image to take the digest from" {
  # The file holds the digest of the primary image, and a list of several
  # images with no app has no primary: the digests to deploy are the
  # image.<name>= lines, so writing one of them to the app digest's file would
  # pick a winner the list does not name.
  add_dockerfiles engine ui
  local digest_file=$BATS_TEST_TMPDIR/digest.txt

  GT_IMAGES="engine ui" run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 \
    --source "$CHECKOUT" --digest-file "$digest_file"

  [ "$status" -ne 0 ]
  [[ $output == *"--digest-file holds the digest of the app image"* ]]
  [[ $output == *"lists none"* ]]
  [ ! -e "$digest_file" ]
  ! grep -q 'docker build' "$FAKE_LOG"
}

@test "logs in to the registry with the token on stdin, not on the command line" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  grep -q "docker login password-on-stdin bytes=" "$FAKE_LOG"
  grep -q -- "--username oauth2accesstoken --password-stdin us-central1-docker.pkg.dev" "$FAKE_LOG"
  assert_no_key_material "$output"
  assert_no_token_value "$output"
  assert_no_token_value "$(cat "$FAKE_LOG")"
}

@test "a build that runs past its bound is stopped and retried once, as the landing build's is" {
  # The release build is the landing build under another name, so the step that
  # can stop writing output is the same step and it is bounded the same way
  # (bead dv-96nw). build_push_staging.bats is where the behaviour is tested in
  # full -- the diagnostic, the retry, the build that fails by itself, the
  # default bound -- and this is the half that says the release path goes
  # through the same helper rather than a `docker build` of its own.
  export GT_BUILD_BOUND_SECONDS=60
  export FAKE_DOCKER_BUILD_SECONDS=100000
  export FAKE_DOCKER_BUILD_HANGS=1

  run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"the build of $IMAGE:v1.0.0 ran past its 60s bound"* ]]
  [[ $output == *"ran past its 60s bound on both attempts"* ]]
  [ "$(grep -c '^docker build ' "$FAKE_LOG")" -eq 2 ]
}

@test "a dry run prints the build and push without running them" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] docker build"* ]]
  [[ $output == *"--build-arg GIT_SHA=$HEAD_COMMIT"* ]]
  [[ $output == *"[dry-run] docker push"* ]]
  [ ! -s "$FAKE_LOG" ]
}
