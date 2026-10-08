#!/usr/bin/env bats
#
# Step 2 of the release flow (bead B5.2): build from the tag, push it, print the
# digest. The tests care most about the two mistakes this script can make:
# publishing an image that is not the tag, and putting a credential where a
# process listing or a job log can read it.

load helpers.bash

setup() {
  setup_release_env
  CHECKOUT=$BATS_TEST_TMPDIR/app
  make_checkout "$CHECKOUT" v1.0.0
}

@test "builds the tagged commit and prints its digest" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  [[ $output == *"image=$IMAGE"* ]]
  [[ $output == *"tag=v1.0.0"* ]]
  [[ $output == *"digest=$IMAGE@sha256:$DIGEST_HEX"* ]]

  grep -q "docker build --file $CHECKOUT/Dockerfile --tag $IMAGE:v1.0.0 $CHECKOUT" "$FAKE_LOG"
  grep -q "docker push $IMAGE:v1.0.0" "$FAKE_LOG"
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

@test "logs in to the registry with the token on stdin, not on the command line" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  grep -q "docker login password-on-stdin bytes=" "$FAKE_LOG"
  grep -q -- "--username oauth2accesstoken --password-stdin us-central1-docker.pkg.dev" "$FAKE_LOG"
  assert_no_key_material "$output"
  assert_no_token_value "$output"
  assert_no_token_value "$(cat "$FAKE_LOG")"
}

@test "a dry run prints the build and push without running them" {
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] docker build"* ]]
  [[ $output == *"[dry-run] docker push"* ]]
  [ ! -s "$FAKE_LOG" ]
}
