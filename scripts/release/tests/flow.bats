#!/usr/bin/env bats
#
# The six scripts have to compose: each one's stdout is the next one's input,
# and the digest built in step 2 is the digest prod runs (docs/design.md,
# section 6, steps 2 to 7). The other files test each script on its own; this
# one runs the whole flow through the fakes, in order, reading the output the
# way workflows/deploy.yml (bead B5.3) will.

load helpers.bash

setup() {
  setup_release_env
  CHECKOUT=$BATS_TEST_TMPDIR/app
  make_checkout "$CHECKOUT" v1.0.0
  PREVIEW_FILE=$BATS_TEST_TMPDIR/preview.diff
  MINTED=$BATS_TEST_TMPDIR/minted.token
  export PREVIEW_FILE MINTED
}

@test "the six scripts carry one release from tag to prod" {
  # Step 2: build the tag and read the digest the rest of the flow uses.
  run "$RELEASE_DIR/build_push.sh" --app "$APP" --project "$PROJECT" --tag v1.0.0 --source "$CHECKOUT" --token-file "$TOKEN_FILE"
  [ "$status" -eq 0 ]
  local digest
  digest=$(field "$output" digest)
  [ "$digest" = "$IMAGE@sha256:$DIGEST_HEX" ]

  # Step 3: mint the one-hour token every later step runs with.
  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --project "$PROJECT" --key-file "$KEY_FILE" --token-file "$MINTED"
  [ "$status" -eq 0 ]
  local token_file
  token_file=$(field "$output" token_file)
  [ "$token_file" = "$MINTED" ]
  [ "$(field "$output" deployer_sa)" = "deployer-$APP@$PROJECT.iam.gserviceaccount.com" ]

  # Step 4: the preview diff, recorded in the run record.
  run "$RELEASE_DIR/preview.sh" --app "$APP" --project "$PROJECT" --digest "$digest" --token-file "$token_file" --preview-file "$PREVIEW_FILE"
  [ "$status" -eq 0 ]
  [ "$(field "$output" preview_file)" = "$PREVIEW_FILE" ]
  grep -q 'Previewing update' "$PREVIEW_FILE"

  # Step 5: apply the previewed digest, then check the path it declares.
  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$digest" --token-file "$token_file"
  [ "$status" -eq 0 ]
  local url
  url=$(field "$output" url)
  [ "$url" = "$FAKE_SERVICE_URL" ]

  run "$RELEASE_DIR/health.sh" --url "$url" --health-path /api/health --timeout 5 --interval 1
  [ "$status" -eq 0 ]
  [[ $output == *"health=ok"* ]]

  # Step 6: prod gets the digest staging proved, not a fresh build.
  run "$RELEASE_DIR/promote.sh" "$digest" --app "$APP" --project "$PROJECT" --staging-digest "$digest" --token-file "$token_file"
  [ "$status" -eq 0 ]
  [ "$(field "$output" url)" = "$FAKE_SERVICE_URL" ]

  # Step 7's summary material: the tag, the digest and the two stacks. The
  # stacks are the bare environment names -- the name the patrol reads an app's
  # state under (scripts/release/tests/stack_name.bats).
  assert_in_log "pulumi config set imageDigest $digest --stack staging --cwd $STACK_DIR --plaintext"
  assert_in_log "pulumi config set imageDigest $digest --stack prod --cwd $STACK_DIR --plaintext"

  # One build for the whole release: prod gets the digest staging proved.
  [ "$(grep -c '^docker build ' "$FAKE_LOG")" -eq 1 ]

  # And the flow printed no secret, from the first step to the last.
  assert_no_key_material "$(cat "$FAKE_LOG")"
  assert_no_token_value "$(cat "$FAKE_LOG")"
}

@test "the flow stops at the health check and never reaches prod" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"
  [ "$status" -eq 0 ]
  local url
  url=$(field "$output" url)

  export FAKE_HTTP_STATUS=500
  run "$RELEASE_DIR/health.sh" --url "$url" --health-path /api/health --timeout 1 --interval 1
  [ "$status" -ne 0 ]

  # A failed health check means no promotion: the prod stack was never touched.
  refute_in_log "--stack prod"
}
