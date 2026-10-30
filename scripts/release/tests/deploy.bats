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

@test "preview pins the app digest as imageDigest and as image.app" {
  run "$RELEASE_DIR/preview.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" \
    --token-file "$TOKEN_FILE" --preview-file "$PREVIEW_FILE"

  [ "$status" -eq 0 ]
  assert_in_log "pulumi config set imageDigest $DIGEST --stack staging --cwd $STACK_DIR --plaintext token_env=present"
  assert_in_log "pulumi config set image.app $DIGEST --stack staging --cwd $STACK_DIR --plaintext token_env=present"
}

@test "preview pins a one-image list's digest under that image's name, not image.app" {
  # The key is image.<primary>, and the primary image of a list of one is the
  # one it names. Pinning image.app here would be a key no image of this app
  # answers to: engine reads image.engine, and nothing reads image.app.
  GT_IMAGES="engine" run "$RELEASE_DIR/preview.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" \
    --token-file "$TOKEN_FILE" --preview-file "$PREVIEW_FILE"

  [ "$status" -eq 0 ]
  assert_in_log "pulumi config set imageDigest $DIGEST --stack staging --cwd $STACK_DIR --plaintext token_env=present"
  assert_in_log "pulumi config set image.engine $DIGEST --stack staging --cwd $STACK_DIR --plaintext token_env=present"
  refute_in_log "pulumi config set image.app"
}

@test "preview refuses an --image digest for another image's repository" {
  # A digest is immutable but it does not say which image it belongs to. An
  # engine digest taken from ui's repository would pin an image the engine
  # container never ran, so the repository is checked, as the build's read-back
  # checks it.
  GT_IMAGES="app engine" run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" \
    --image "engine=$IMAGE/ui@sha256:$DIGEST_HEX" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"another repository"* ]]
  [[ $output == *"expected $IMAGE/engine@sha256:"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "preview refuses --image for the image --digest already pins" {
  # On a list of one the primary image is that image; --digest names it, so
  # --image of the same name would pin one key twice (the fixed "app" refusal
  # was right only while app was always the primary image).
  GT_IMAGES="engine" run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" \
    --image "engine=$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"pinning it twice"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "preview and up pin each named image the list holds as image.<name>" {
  local engine="$IMAGE/engine@sha256:$DIGEST_HEX"
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

  GT_IMAGES="app engine" run "$RELEASE_DIR/preview.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" \
    --image "engine=$engine" --token-file "$TOKEN_FILE" --preview-file "$PREVIEW_FILE"
  [ "$status" -eq 0 ]
  assert_in_log "pulumi config set image.engine $engine --stack staging --cwd $STACK_DIR --plaintext token_env=present"

  : >"$FAKE_LOG"
  GT_IMAGES="app engine" run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" \
    --image "engine=$engine" --token-file "$TOKEN_FILE"
  [ "$status" -eq 0 ]
  assert_in_log "pulumi config set image.engine $engine --stack staging --cwd $STACK_DIR --plaintext token_env=present"
}

@test "GT_IMAGE_DIGESTS pins the same images as --image does, as the workflows pass them" {
  local engine="$IMAGE/engine@sha256:$DIGEST_HEX" ui="$IMAGE/ui@sha256:$DIGEST_HEX"

  GT_IMAGES="app engine ui" GT_IMAGE_DIGESTS="engine=$engine ui=$ui" run "$RELEASE_DIR/preview.sh" \
    --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE" --preview-file "$PREVIEW_FILE"

  [ "$status" -eq 0 ]
  assert_in_log "pulumi config set image.engine $engine --stack staging --cwd $STACK_DIR --plaintext"
  assert_in_log "pulumi config set image.ui $ui --stack staging --cwd $STACK_DIR --plaintext"
}

@test "preview refuses an --image that names no image in the list, or a tag" {
  GT_IMAGES="app engine" run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" \
    --image "ui=$IMAGE/ui@sha256:$DIGEST_HEX" --token-file "$TOKEN_FILE"
  [ "$status" -ne 0 ]
  [[ $output == *"ui is not in GT_IMAGES"* ]]

  GT_IMAGES="app engine" run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" \
    --image "engine=$IMAGE/engine:latest" --token-file "$TOKEN_FILE"
  [ "$status" -ne 0 ]
  [[ $output == *"immutable digest, not a tag"* ]]
  [ ! -s "$FAKE_LOG" ]
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
  # The fixture has to record another image than the one being applied, or this
  # is the release that applies nothing, which deployed_at.bats covers.
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

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
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

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
