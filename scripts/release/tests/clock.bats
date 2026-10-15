#!/usr/bin/env bats
#
# How long the polling scripts wait, on a clock the test owns (bead dv-ab7m).
#
# health.sh and wait_version.sh retry until a timeout runs out, and they decide
# whether one more attempt fits from the time they read. These tests run them on
# the fake clock (fakes/_fake.sh): the fake curl takes FAKE_CURL_SECONDS of it
# per request, the fake sleep moves it on by the interval and waits not at all.
# So the number of attempts a script makes, and the seconds it reports, follow
# from the three numbers -- timeout, interval, request time -- and from nothing
# else: not how busy the machine is, not where in a wall-clock second a request
# happened to start.
#
# The rule under test, for both scripts: after an attempt, wait the interval and
# try again only if the time already spent plus one interval still fits in the
# timeout.

load helpers.bash

setup() {
  setup_release_env
}

# attempts_logged prints how many requests the fake curl saw.
attempts_logged() { grep -c '^curl ' "$FAKE_LOG"; }

# sleeps_logged prints how many times the script waited.
sleeps_logged() { grep -c '^sleep ' "$FAKE_LOG"; }

@test "health: instant failures with a 1s budget and a 1s interval make exactly two attempts" {
  export FAKE_HTTP_STATUS=500

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 1 --interval 1

  [ "$status" -ne 0 ]
  [ "$(attempts_logged)" -eq 2 ]
  [ "$(sleeps_logged)" -eq 1 ]
  [[ $output == *"after 1s"* ]]
}

@test "health: a request that itself takes the whole budget leaves no room for a second" {
  export FAKE_HTTP_STATUS=500 FAKE_CURL_SECONDS=1

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 1 --interval 1

  [ "$status" -ne 0 ]
  [ "$(attempts_logged)" -eq 1 ]
  [ "$(sleeps_logged)" -eq 0 ]
  [[ $output == *"after 1s"* ]]
}

@test "health: attempts every interval until the next one would not fit" {
  # t=0, 2, 4: after the third attempt 4 + 2 > 5, so it stops there.
  export FAKE_HTTP_STATUS=500

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 5 --interval 2

  [ "$status" -ne 0 ]
  [ "$(attempts_logged)" -eq 3 ]
  [ "$(sleeps_logged)" -eq 2 ]
  [[ $output == *"after 4s"* ]]
}

@test "health: reports the seconds a passing check really took on the clock" {
  export FAKE_HTTP_STATUSES="500 500 200"

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 30 --interval 5

  [ "$status" -eq 0 ]
  [[ $output == *"attempts=3"* ]]
  [[ $output == *"seconds=10"* ]]
  [ "$(sleeps_logged)" -eq 2 ]
}

@test "wait_version: an unreachable service with a 1s budget and a 1s interval is tried exactly twice" {
  export FAKE_HTTP_FAIL=1

  run "$RELEASE_DIR/wait_version.sh" --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$status" -eq 2 ]
  [ "$(attempts_logged)" -eq 2 ]
  [ "$(sleeps_logged)" -eq 1 ]
  [[ $output == *"after 1s"* ]]
}

@test "wait_version: a first request that takes the whole budget is the only attempt" {
  export FAKE_HTTP_FAIL=1 FAKE_CURL_SECONDS=1

  run "$RELEASE_DIR/wait_version.sh" --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$status" -eq 2 ]
  [ "$(attempts_logged)" -eq 1 ]
  [ "$(sleeps_logged)" -eq 0 ]
}

@test "wait_version: slow requests are counted against the timeout, not just the waits" {
  # Each request takes 1s and each wait 1s: attempt 1 ends at t=1, wait to t=2,
  # attempt 2 ends at t=3, and 3 + 1 > 3 stops it. Two attempts, not three.
  export FAKE_HTTP_FAIL=1 FAKE_CURL_SECONDS=1

  run "$RELEASE_DIR/wait_version.sh" --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 3 --interval 1

  [ "$status" -eq 2 ]
  [ "$(attempts_logged)" -eq 2 ]
  [[ $output == *"after 3s"* ]]
}

@test "wait_version: the service that starts answering mid-wait is found on the attempt after it" {
  export FAKE_HTTP_STATUSES="503 503 200" FAKE_CURL_SECONDS=0
  body_commit() { export FAKE_HTTP_BODY; FAKE_HTTP_BODY=$(printf '{"commit":"%s"}' "$1"); }
  body_commit "$DEPLOYED_SHA"

  run "$RELEASE_DIR/wait_version.sh" --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 60 --interval 5

  [ "$status" -eq 0 ]
  [[ $output == *"attempts=3"* ]]
  [ "$(sleeps_logged)" -eq 2 ]
}

@test "the fake clock moves only when a fake moves it" {
  [ "$(date +%s)" -eq 1800000000 ]
  sleep 7
  [ "$(date +%s)" -eq 1800000007 ]
  FAKE_CURL_SECONDS=3 curl --silent http://localhost:1/ >/dev/null || true
  [ "$(date +%s)" -eq 1800000010 ]
}
