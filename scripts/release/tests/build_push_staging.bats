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
# shape the workflow reads: the tag is main-<12 hex of the commit>, the digest
# is the registry's answer rather than a value the script made up, and the
# commit itself travels to the build as GIT_SHA (bead dv-lh6), which the
# assertions on the build line pin to the commit the name was made from.
#
# The checkout fixtures are real repositories: make_checkout commits once and
# tags the commit, and point_origin_main writes the origin/main ref the ancestry
# check reads, so a test can ask what the script does when main does not carry
# the commit it was pointed at.

load helpers.bash

setup_file() {
  make_checkout "$BATS_FILE_TMPDIR/app" v1.0.0
  point_origin_main "$BATS_FILE_TMPDIR/app"
}

setup() {
  setup_release_env
  CHECKOUT=$BATS_TEST_TMPDIR/app
  copy_checkout "$BATS_FILE_TMPDIR/app" "$CHECKOUT"
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

  # The exact build line: the commit the image is named after is the commit the
  # image carries, so a service reporting GIT_SHA reports the landing's commit.
  grep -q "docker build --file $CHECKOUT/Dockerfile --tag $IMAGE:main-$SHORT_COMMIT --build-arg GIT_SHA=$HEAD_COMMIT $CHECKOUT" "$FAKE_LOG"
  grep -q "docker push $IMAGE:main-$SHORT_COMMIT" "$FAKE_LOG"
}

# add_dockerfiles NAME... commits a Dockerfile.NAME per name and moves
# origin/main onto that commit, so the checkout is still one main carries, as
# the ancestry check requires, and the named images have their own files.
add_dockerfiles() {
  local name
  for name in "$@"; do
    printf 'FROM scratch\nLABEL part=%s\n' "$name" >"$CHECKOUT/Dockerfile.$name"
  done
  git -C "$CHECKOUT" add -A
  git -C "$CHECKOUT" -c commit.gpgsign=false -c user.name=test -c user.email=test@example.invalid \
    commit -qm "images: $*"
  point_origin_main "$CHECKOUT"
  HEAD_COMMIT=$(git -C "$CHECKOUT" rev-parse HEAD)
  SHORT_COMMIT=${HEAD_COMMIT:0:12}
}

@test "GT_IMAGES builds one image per name, each at its own path, and prints each digest" {
  add_dockerfiles ui

  GT_IMAGES="app ui" run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  grep -q "docker build --file $CHECKOUT/Dockerfile --tag $IMAGE/app:main-$SHORT_COMMIT --build-arg GIT_SHA=$HEAD_COMMIT $CHECKOUT" "$FAKE_LOG"
  grep -q "docker build --file $CHECKOUT/Dockerfile.ui --tag $IMAGE/ui:main-$SHORT_COMMIT --build-arg GIT_SHA=$HEAD_COMMIT $CHECKOUT" "$FAKE_LOG"
  grep -q "docker push $IMAGE/ui:main-$SHORT_COMMIT" "$FAKE_LOG"
  # The app image keeps digest= and the path it has always had; the other image
  # is the images= line the deploy steps pass on as GT_IMAGE_DIGESTS.
  [[ $output == *"digest=$IMAGE/app@sha256:$DIGEST_HEX"* ]]
  [[ $output == *"image.ui=$IMAGE/ui@sha256:$DIGEST_HEX"* ]]
  [[ $output == *$'\nimages=ui='"$IMAGE/ui@sha256:$DIGEST_HEX"* ]]
}

@test "refuses --digest-file when the list has no app image to take the digest from" {
  add_dockerfiles engine ui
  local digest_file=$BATS_TEST_TMPDIR/digest.txt

  GT_IMAGES="engine ui" run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" \
    --source "$CHECKOUT" --digest-file "$digest_file"

  [ "$status" -ne 0 ]
  [[ $output == *"--digest-file holds the digest of the app image"* ]]
  [[ $output == *"lists none"* ]]
  [ ! -e "$digest_file" ]
  [ ! -s "$FAKE_LOG" ]
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

@test "refuses a HEAD that is not a commit, before docker runs" {
  # The commit is what the image is named after and what it carries, so a source
  # with no commit to read is refused (bead dv-lh6). A repository with nothing
  # committed is exactly that: `git rev-parse HEAD` prints the literal `HEAD`
  # and fails, and the file it would commit is excluded so the tree is clean and
  # this is the check under test rather than the clean-tree one. --ref is passed
  # because the ref read is not the subject here.
  local unborn=$BATS_TEST_TMPDIR/unborn
  mkdir -p "$unborn"
  git -c init.defaultBranch=main -C "$unborn" init -q
  printf 'FROM scratch\n' >"$unborn/Dockerfile"
  printf 'Dockerfile\n' >"$unborn/.git/info/exclude"

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$unborn" \
    --ref refs/heads/main

  [ "$status" -ne 0 ]
  [[ $output == *"could not read the commit at HEAD"* ]]
  [[ $output != *"not clean"* ]]
  [ ! -s "$FAKE_LOG" ]
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
  [[ $output == *"--build-arg GIT_SHA=$HEAD_COMMIT"* ]]
  [[ $output == *"[dry-run] docker push"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a dry run refuses exactly what a real run refuses" {
  commit_after_main

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"is not on main"* ]]
}

# ── The bound on the build (bead dv-96nw) ──────────────────────────────────
#
# A build that stops writing output and never returns is what held the one
# deploy runner for 50 minutes on 2026-10-15 and queued every later run of every
# workflow of that repository behind it. The script now runs the build under a
# bound and retries it once, and these are the four behaviours that has to have:
# a build inside its bound is not retried, one past it is stopped and retried,
# one that fails by itself is not retried, and the default bound is the one the
# job's own bound is sized around.
#
# The clock is the fake one (tests/fakes/_fake.sh), so none of this waits: the
# fake docker moves it by FAKE_DOCKER_BUILD_SECONDS, as the fake curl moves it
# by FAKE_CURL_SECONDS, and the script's own bound is what decides. The numbers
# in GT_BUILD_BOUND_SECONDS below are the test's, not the script's, wherever the
# point is the behaviour rather than the default.

@test "a build that runs past its bound is stopped, shown and retried once" {
  # The build outlives its bound and never returns: nothing in the fake ends it,
  # so the script's bound has to, twice. The clock is moved past the bound in
  # one go, which is why this test takes no measurable time and does not depend
  # on what the default bound is -- the assertion below pins that separately.
  export GT_BUILD_BOUND_SECONDS=60
  export FAKE_DOCKER_BUILD_SECONDS=100000
  export FAKE_DOCKER_BUILD_HANGS=1

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"the build of $IMAGE:main-$SHORT_COMMIT ran past its 60s bound and was stopped"* ]]
  [[ $output == *"retrying the build once"* ]]
  [[ $output == *"ran past its 60s bound on both attempts"* ]]

  # The diagnostic the bead asks for: which containers were there when it was
  # stopped, and what they were running. Without it a stopped build says only
  # that it stopped.
  grep -q "docker ps --quiet" "$FAKE_LOG"
  grep -q "docker top " "$FAKE_LOG"
  [[ $output == *"next build"* ]]

  # Twice and no more: the second attempt failed the job, and a loop that kept
  # going would spend the job's whole bound rather than reporting it.
  [ "$(grep -c '^docker build ' "$FAKE_LOG")" -eq 2 ]
}

@test "a build that moves the clock the instant it starts still meets its bound at once" {
  # run_under_bound reads the clock for its start BEFORE it launches the build.
  # Read after, a build that moves the clock as soon as it starts (this fake does)
  # wins the race under load, the start already holds the jump, and the bound is
  # only ever reached by waiting it out one check at a time (bead dv-lqrk: a
  # 0.7 s test took 25-71 s two times in three under load, and under the gate's
  # load it was the 10-minute kill). FAKE_DATE_DELAY decides the race: every clock
  # read waits 0.3 s of real time, long enough for the fake docker to have moved
  # the clock first. With the start read first, the bound is met on the first
  # check; with it read after, the loop needs about 60 checks, each of them a fake
  # sleep that the log records.
  export GT_BUILD_BOUND_SECONDS=60
  export FAKE_DOCKER_BUILD_SECONDS=100000
  export FAKE_DOCKER_BUILD_HANGS=1
  export FAKE_DATE_DELAY=0.3

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"ran past its 60s bound on both attempts"* ]]

  # One fake sleep after each stop, two attempts. A handful is the bound being
  # met by the clock; sixty or more is it being waited out.
  waits=$(grep -c '^sleep ' "$FAKE_LOG")
  [ "$waits" -le 4 ] || {
    echo "the bound was waited out, not met: $waits fake sleeps (want at most 4)" >&2
    return 1
  }
}

@test "a build that finishes inside its bound is built once and not retried" {
  export GT_BUILD_BOUND_SECONDS=60
  export FAKE_DOCKER_BUILD_SECONDS=30

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -eq 0 ]
  [[ $output == *"digest=$IMAGE@sha256:$DIGEST_HEX"* ]]
  [ "$(grep -c '^docker build ' "$FAKE_LOG")" -eq 1 ]
  [[ $output != *"retrying the build once"* ]]
}

@test "a build that fails by itself is not retried: it is not a stall" {
  # A Dockerfile that does not build fails the same way twice, so the second
  # attempt would spend the job's bound printing the same error. What the reader
  # gets instead is the end of what the build wrote, which is the part a log's
  # reader needs next to the refusal.
  export FAKE_DOCKER_BUILD_STATUS=1
  export FAKE_DOCKER_BUILD_LINES=60

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"the build of $IMAGE:main-$SHORT_COMMIT failed (exit 1)"* ]]
  [[ $output == *"the last 50 lines it wrote"* ]]
  [[ $output == *"build line 60"* ]]
  [[ $output != *"retrying the build once"* ]]
  [ "$(grep -c '^docker build ' "$FAKE_LOG")" -eq 1 ]
}

@test "the build's default bound is the eight minutes the job's bound is sized around" {
  # The default is a number two files depend on: the build job is bounded at 20
  # minutes so that two attempts at this bound, plus the checkout and the token,
  # fit inside it (workflows/staging.yml). A default raised past ten would put
  # the second attempt outside the job that runs it, which is why this is
  # asserted rather than left to a comment. The clock is moved past any bound a
  # build could name, so the assertion is about the number the script prints and
  # not about how long anything took.
  export FAKE_DOCKER_BUILD_SECONDS=1000000
  export FAKE_DOCKER_BUILD_HANGS=1

  run "$RELEASE_DIR/build_push_staging.sh" --app "$APP" --project "$PROJECT" --source "$CHECKOUT"

  [ "$status" -ne 0 ]
  [[ $output == *"ran past its 480s bound"* ]]
  [[ $output != *"ran past its 600s bound"* ]]
}

@test "a hung build the script's bound misses ends itself, so it fails this check and not the file's budget" {
  # The two checks above leave the fake hanging on purpose, because the bound is
  # what they are about. That left the fake with no ending of its own: when the
  # bound did not stop one (dv-honu.7's third rejection, 495 s in a gate that had
  # run nothing else here), the file ran until the suite's budget killed it and
  # the failure said nothing about the build. So the fake has a real-time cap,
  # one second here, and this is the check that it ends itself on it. It is the
  # only real wait in this file; the hang the cap ends is the fake's, so the
  # clock the test owns is not involved.
  export FAKE_DOCKER_BUILD_HANGS=1
  export FAKE_DOCKER_HANG_CAP_SECONDS=1

  local started=$SECONDS
  run "$FAKE_BIN/docker" build --tag "fake:hang" --file Dockerfile .

  [ "$status" -ne 0 ]
  [[ $output == *"fake docker: hung build was never stopped by the script's bound"* ]]
  # A few seconds for a one second cap: the loop checks every 50 ms, and a
  # loaded machine can stretch a second. It cannot stretch it by a minute.
  [ $((SECONDS - started)) -le 10 ]
}
