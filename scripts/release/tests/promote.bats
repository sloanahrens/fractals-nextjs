#!/usr/bin/env bats
#
# Step 6 of the release flow (bead B5.2). Promotion is the step where a mistake
# reaches production, so the tests here are about what it refuses: a tag, a
# digest that is not the one staging runs, a second, contradictory digest.

load helpers.bash

setup() {
  setup_release_env
}

# The acceptance item of dv-cgu in its own words: promote.sh app:latest fails.
# The refusal names the digest-shaped input to pass instead, and it is reached
# before any other input is validated, so a bare tag is refused for being a tag.
@test "promote refuses a tag given on its own" {
  run "$RELEASE_DIR/promote.sh" "app:latest"

  [ "$status" -ne 0 ]
  [[ $output == *"immutable digest, not a tag: app:latest"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "promote refuses a tag" {
  run "$RELEASE_DIR/promote.sh" "$APP:latest" --app "$APP" --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"immutable digest, not a tag"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "promote refuses a tag given through --digest too" {
  run "$RELEASE_DIR/promote.sh" --app "$APP" --digest "v1.0.0" --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"immutable digest, not a tag"* ]]
}

@test "promote accepts a digest in a dry run" {
  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:$DIGEST_HEX" --app "$APP" --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"pulumi config set imageDigest $IMAGE@sha256:$DIGEST_HEX"* ]]
  [[ $output == *"--stack prod"* ]]
  [[ $output == *"[dry-run] pulumi up --yes --skip-preview --stack prod"* ]]
  [[ $output != *"--stack staging"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "promote accepts a bare repository digest in a dry run" {
  run "$RELEASE_DIR/promote.sh" "fractals-nextjs@sha256:$DIGEST_HEX" --app "$APP" --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -eq 0 ]
}

@test "promote refuses a digest that is not the one staging runs" {
  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:$DIGEST_HEX" --app "$APP" \
    --staging-digest "$IMAGE@sha256:0000000000000000000000000000000000000000000000000000000000000000" \
    --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"prod gets the digest staging proved"* ]]
}

@test "promote accepts the staging digest and an unset staging digest" {
  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:$DIGEST_HEX" --app "$APP" --staging-digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  [ "$status" -eq 0 ]

  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:$DIGEST_HEX" --app "$APP" --token-file "$TOKEN_FILE" --dry-run
  [ "$status" -eq 0 ]
}

@test "promote deploys the digest to prod and rebuilds nothing" {
  # Another image in the fixture than the one being promoted, so this is a
  # promotion that changes what prod runs and not the apply-nothing case
  # (deployed_at.bats).
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:$DIGEST_HEX" --app "$APP" --project "$PROJECT" --token-file "$TOKEN_FILE" --init-stack

  [ "$status" -eq 0 ]
  assert_in_log "pulumi stack init prod --cwd $STACK_DIR"
  assert_in_log "pulumi up --yes --skip-preview --stack prod --cwd $STACK_DIR token_env=present"
  # Nothing is rebuilt: promotion deploys the image staging already proved.
  refute_in_log '^docker '
}

@test "promote has no environment flag: promotion is prod" {
  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:$DIGEST_HEX" --app "$APP" --env staging --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"unknown argument: --env"* ]]
}

@test "promote refuses a digest given twice" {
  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:$DIGEST_HEX" --app "$APP" --digest "$IMAGE@sha256:$DIGEST_HEX" --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"digest given twice"* ]]
}

@test "promote refuses a digest with uppercase hex" {
  run "$RELEASE_DIR/promote.sh" "$IMAGE@sha256:DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF" \
    --app "$APP" --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -ne 0 ]
  [[ $output == *"64 lowercase hex"* ]]
}
