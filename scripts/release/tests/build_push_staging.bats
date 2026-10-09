#!/usr/bin/env bats
#
# The landing build (bead dv-pj9): build the commit main is at, push it under a
# name derived from that commit, print the digest.
#
# The tests care about the two mistakes this script can make, and they are the
# two the release build is not exposed to. It can publish something main does
# not carry — a worker's branch, which is the commit a landing run must never
# put in staging — and it can be pointed at the release path's ref, which is a
# tag the human pushes and the release flow owns. Everything else here is the
# shape the workflow reads: the tag is main-<12 hex of the commit>, and the
# digest is the registry's answer rather than a value the script made up.
#
# The checkout fixtures are real repositories: make_checkout commits once and
# tags the commit, and point_origin_main writes the origin/main ref the ancestry
# check reads, so a test can ask what the script does when main does not carry
# the commit it was pointed at.

load helpers.bash

setup() {
  setup_release_env
  CHECKOUT=$BATS_TEST_TMPDIR/app
  make_checkout "$CHECKOUT" v1.0.0
  point_origin_main "$CHECKOUT"
  HEAD_COMMIT=$(git -C "$CHECKOUT" rev-parse HEAD)
  SHORT_COMMIT=${HEAD_COMMIT:0:12}
}

# commit_after_main adds a commit to the checkout on top of main, which is what
# a worker's own branch looks like to this script: a clean tree, at a commit
# origin/main does not carry.
commit_after_main() {
  printf 'FROM alpine\nLABEL rev=2\n' >"$CHECKOUT/Dockerfile"
  git -C "$CHECKOUT" -c commit.gpgsign=false -c user.name=test -c user.email=test@example.invalid \
    commit -qam 'work main does not have'
}

@test "builds HEAD's commit as main-<12 hex> and prints its digest" {
  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  [[ $output == *"image=$IMAGE"* ]]
  [[ $output == *"tag=main-$SHORT_COMMIT"* ]]
  [[ $output == *"digest=$IMAGE@sha256:$DIGEST_HEX"* ]]

  grep -q "docker build --file $CHECKOUT/Dockerfile --tag $IMAGE:main-$SHORT_COMMIT $CHECKOUT" "$FAKE_LOG"
  grep -q "docker push $IMAGE:main-$SHORT_COMMIT" "$FAKE_LOG"
}

@test "a commit behind main is built: a queued landing is skipped by the workflow, not here" {
  # The check is ancestry, not equality: this script publishes what main
  # carries, and a landing run whose main has moved on is skipped by the
  # workflow's own read of main (workflows/staging.yml). The newer commit is
  # made on a side branch so that main, and HEAD, stay where they are.
  git -C "$CHECKOUT" checkout -q -b newer
  printf 'FROM alpine\nLABEL rev=2\n' >"$CHECKOUT/Dockerfile"
  git -C "$CHECKOUT" -c commit.gpgsign=false -c user.name=test -c user.email=test@example.invalid \
    commit -qam 'a newer landing'
  point_origin_main "$CHECKOUT"
  git -C "$CHECKOUT" checkout -q main

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT" \
    --ref refs/heads/main --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"tag=main-$SHORT_COMMIT"* ]]
}

@test "refuses a working tree with uncommitted changes" {
  printf 'FROM alpine\n' >>"$CHECKOUT/Dockerfile"

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"not clean"* ]]
}

@test "refuses a commit that is not on main" {
  commit_after_main

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"is not on main"* ]]
  # Nothing was built and nothing was pushed: the refusal is before the first
  # docker call, so a branch never reaches the registry.
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses a ref that looks like a release tag" {
  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" \
    --source "$CHECKOUT" --ref refs/tags/v1.0.0

  [ "$status" -ne 0 ]
  [[ $output == *"looks like a release tag"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses a branch named like a release tag" {
  # A branch is exactly the ref a worker can push, and a branch name is not a
  # prefix: it is the name the ref matches against.
  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" \
    --source "$CHECKOUT" --ref refs/heads/v1.0.0

  [ "$status" -ne 0 ]
  [[ $output == *"looks like a release tag"* ]]
}

@test "reads the ref from the checkout when --ref is not given" {
  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  [[ $output == *"ref read from the checkout: main"* ]]
}

@test "refuses a checkout with no origin/main" {
  git -C "$CHECKOUT" update-ref -d refs/remotes/origin/main

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"no origin/main"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses a source directory that is not a git checkout" {
  mkdir -p "$BATS_TEST_TMPDIR/plain"
  printf 'FROM scratch\n' >"$BATS_TEST_TMPDIR/plain/Dockerfile"

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$BATS_TEST_TMPDIR/plain"

  [ "$status" -ne 0 ]
  [[ $output == *"not a git checkout"* ]]
}

@test "refuses a source directory without a Dockerfile" {
  mkdir -p "$BATS_TEST_TMPDIR/empty"

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$BATS_TEST_TMPDIR/empty"

  [ "$status" -ne 0 ]
  [[ $output == *"no Dockerfile"* ]]
}

@test "writes the digest to --digest-file as well" {
  local digest_file=$BATS_TEST_TMPDIR/digest.txt

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT" \
    --digest-file "$digest_file"

  [ "$status" -eq 0 ]
  [ "$(cat "$digest_file")" = "$IMAGE@sha256:$DIGEST_HEX" ] || {
    printf 'digest file holds %q, want %q\n' "$(cat "$digest_file")" "$IMAGE@sha256:$DIGEST_HEX" >&2
    return 1
  }
}

@test "logs in to the registry with the token on stdin, not on the command line" {
  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT" \
    --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  grep -q "docker login password-on-stdin bytes=" "$FAKE_LOG"
  grep -q -- "--username oauth2accesstoken --password-stdin us-central1-docker.pkg.dev" "$FAKE_LOG"
  assert_no_key_material "$output"
  assert_no_token_value "$output"
  assert_no_token_value "$(cat "$FAKE_LOG")"
}

@test "a dry run prints the build and push without running them" {
  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT" \
    --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] docker build"* ]]
  [[ $output == *"[dry-run] docker push"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a dry run refuses exactly what a real run refuses" {
  commit_after_main

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"is not on main"* ]]
}
