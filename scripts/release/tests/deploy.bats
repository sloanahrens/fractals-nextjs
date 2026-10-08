#!/usr/bin/env bats
#
# Steps 4 and 5 of the release flow (bead B5.2): preview.sh writes the diff the
# release is read from, up.sh applies it. Both pin the same digest in stack
# config, and both must hand the token to the provider without putting it
# anywhere a log could reach it.

load helpers.bash

setup() {
  setup_release_env
  PREVIEW_FILE=$BATS_TEST_TMPDIR/preview.diff
  export PREVIEW_FILE
}

@test "preview writes the diff, pins the digest and prints the file" {
  run "$RELEASE_DIR/preview.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" \
    --token-file "$TOKEN_FILE" --preview-file "$PREVIEW_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"preview_file=$PREVIEW_FILE"* ]]
  [[ $output == *"stack=staging"* ]]
  [ -s "$PREVIEW_FILE" ]
  grep -q 'Previewing update' "$PREVIEW_FILE"

  assert_in_log "pulumi config set imageDigest $DIGEST --stack staging --cwd $STACK_DIR --plaintext token_env=present"
  assert_in_log "pulumi preview --diff --stack staging --cwd $STACK_DIR token_env=present"
}

@test "preview refuses a tag where a digest belongs" {
  run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$APP:latest" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"immutable digest, not a tag"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "preview refuses a malformed digest" {
  run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$APP@sha256:nothex" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"64 lowercase hex"* ]]
}

@test "up applies the previewed digest and prints the service URL" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"url=$FAKE_SERVICE_URL"* ]]
  assert_in_log "pulumi up --yes --skip-preview --stack staging --cwd $STACK_DIR token_env=present"
}

@test "up refuses a tag where a digest belongs" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "v1.0.0" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"immutable digest, not a tag"* ]]
}

@test "up deploys to the prod stack when --env says so" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --env prod --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  assert_in_log "pulumi up --yes --skip-preview --stack prod --cwd $STACK_DIR token_env=present"
}

@test "the digest reaches the provider through the environment, not argv" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  assert_no_token_value "$output"
  assert_no_token_value "$(cat "$FAKE_LOG")"
  assert_no_key_material "$(cat "$FAKE_LOG")"
}

@test "up creates the stack only when --init-stack is given" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"
  [ "$status" -eq 0 ]
  refute_in_log 'pulumi stack init'

  : >"$FAKE_LOG"
  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --init-stack
  [ "$status" -eq 0 ]
  assert_in_log "pulumi stack init staging --cwd $STACK_DIR"
}

@test "refuses a token file that is not there" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$BATS_TEST_TMPDIR/no-token"

  [ "$status" -ne 0 ]
  [[ $output == *"token file does not exist"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a failed preview leaves no diff for the run record" {
  export FAKE_PULUMI_FAIL=preview

  run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --preview-file "$PREVIEW_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"pulumi preview failed"* ]]
  [ ! -e "$PREVIEW_FILE" ]
}

@test "up fails when the stack exports no url" {
  export FAKE_PULUMI_NO_URL=1

  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"exported no url output"* ]]
}

@test "dry runs print the plan and run nothing" {
  run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] pulumi config set imageDigest"* ]]
  [ ! -e "$PREVIEW_FILE" ]

  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] pulumi up --yes --skip-preview"* ]]

  [ ! -s "$FAKE_LOG" ]
}
