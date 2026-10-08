#!/usr/bin/env bats
#
# The health check of step 5 (bead B5.2). The third acceptance item of dv-cgu
# lives here: a failed health check leaves the previous revision as the only
# serving revision. The test states that as "nothing in the fake cloud changed",
# which is only worth asserting because the fake does record changes — hence the
# control test at the end.

load helpers.bash

setup() {
  setup_release_env
  export FAKE_HTTP_STATUS=200
}

@test "passes when the health path answers 2xx" {
  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 5 --interval 1

  [ "$status" -eq 0 ]
  [[ $output == *"health=ok"* ]]
  [[ $output == *"status=200"* ]]
  grep -q "curl .*$FAKE_SERVICE_URL/api/health" "$FAKE_LOG"
}

@test "retries while the path is not ready" {
  export FAKE_HTTP_STATUSES='503 200'

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 10 --interval 1

  [ "$status" -eq 0 ]
  [[ $output == *"attempts=2"* ]]
  [ "$(grep -c '^curl ' "$FAKE_LOG")" -eq 2 ]
}

@test "fails when the path never answers, and says nothing was changed" {
  export FAKE_HTTP_STATUS=500

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 1 --interval 1

  [ "$status" -ne 0 ]
  [[ $output == *"health check failed"* ]]
  [[ $output == *"status 500"* ]]
  [[ $output == *"no automatic rollback"* ]]
}

@test "a failed health check leaves the previous revision as the only serving one" {
  printf 'serving_revision=rev-00001\nlatest_revision=rev-00002\n' >"$FAKE_STATE"
  export FAKE_HTTP_STATUS=500

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 1 --interval 1

  [ "$status" -ne 0 ]
  grep -q '^serving_revision=rev-00001$' "$FAKE_STATE"
  refute_in_log '^MUTATION'
  # The health check does not even hold a cloud credential: it only curls.
  refute_in_log '^gcloud'
}

@test "a passing health check changes nothing either" {
  printf 'serving_revision=rev-00001\nlatest_revision=rev-00002\n' >"$FAKE_STATE"

  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 5 --interval 1

  [ "$status" -eq 0 ]
  grep -q '^serving_revision=rev-00001$' "$FAKE_STATE"
  refute_in_log '^MUTATION'
}

@test "the fake records a traffic shift when one is attempted" {
  # The control for the two tests above: if the fake could not show a shift,
  # asserting that there was none would prove nothing.
  printf 'serving_revision=rev-00001\nlatest_revision=rev-00002\n' >"$FAKE_STATE"

  run gcloud run services update-traffic fractals-nextjs-staging --to-latest --region us-central1

  [ "$status" -eq 0 ]
  grep -q '^serving_revision=rev-00002$' "$FAKE_STATE"
  grep -q '^MUTATION gcloud run services update-traffic' "$FAKE_LOG"
}

@test "refuses a url that is not a url" {
  run "$RELEASE_DIR/health.sh" --url "fractals-nextjs-staging" --health-path /api/health

  [ "$status" -ne 0 ]
  [[ $output == *"must start with http:// or https://"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses a health path that is not a path" {
  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path "api/health"

  [ "$status" -ne 0 ]
  [[ $output == *"health path must start with /"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses when the health path is missing" {
  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL"

  [ "$status" -ne 0 ]
  [[ $output == *"--health-path (or GT_HEALTH_PATH) is required"* ]]
}

@test "a dry run makes no request" {
  run "$RELEASE_DIR/health.sh" --url "$FAKE_SERVICE_URL" --health-path /api/health --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] curl"* ]]
  [ ! -s "$FAKE_LOG" ]
}
