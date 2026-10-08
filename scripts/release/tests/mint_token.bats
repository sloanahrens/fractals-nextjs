#!/usr/bin/env bats
#
# Step 3 of the release flow (bead B5.2): mint a one-hour token for the app's
# deployer account from the base key. This is the only script that touches key
# material, so the tests here are mostly about what does *not* happen to it.

load helpers.bash

setup() {
  setup_release_env
}

@test "mints a token for the deployer account into a 600 file" {
  local out=$BATS_TEST_TMPDIR/out.token

  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --project "$PROJECT" --key-file "$KEY_FILE" --token-file "$out"

  [ "$status" -eq 0 ]
  [[ $output == *"token_file=$out"* ]]
  [[ $output == *"deployer_sa=deployer-$APP@$PROJECT.iam.gserviceaccount.com"* ]]
  [ "$(cat "$out")" = "$FAKE_ACCESS_TOKEN" ]
  [ "$(file_mode "$out")" = '600' ]

  grep -q 'gcloud auth print-access-token' "$FAKE_LOG"
  grep -q -- "--impersonate-service-account=deployer-$APP@$PROJECT.iam.gserviceaccount.com" "$FAKE_LOG"
  grep -q -- '--lifetime=3600' "$FAKE_LOG"
}

@test "tightens a token file the caller supplied with wider permissions" {
  local out=$BATS_TEST_TMPDIR/loose.token
  printf 'a token from an earlier mint\n' >"$out"
  chmod 644 "$out"

  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE" --token-file "$out"

  [ "$status" -eq 0 ]
  [ "$(file_mode "$out")" = '600' ]
  [ "$(cat "$out")" = "$FAKE_ACCESS_TOKEN" ]
}

@test "hands the key to gcloud through the environment, never through argv" {
  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE" --token-file "$BATS_TEST_TMPDIR/out.token"

  [ "$status" -eq 0 ]
  grep -q 'key_env=yes key_argv=no' "$FAKE_LOG"
}

@test "prints neither the key material nor the token" {
  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE" --token-file "$BATS_TEST_TMPDIR/out.token"

  [ "$status" -eq 0 ]
  assert_no_key_material "$output"
  assert_no_key_material "$(cat "$FAKE_LOG")"
  assert_no_token_value "$output"
  assert_no_token_value "$(cat "$FAKE_LOG")"
}

@test "refuses a token lifetime longer than an hour" {
  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE" --ttl 7200

  [ "$status" -ne 0 ]
  [[ $output == *"between 1 and 3600"* ]]
}

@test "refuses a key file that group or other can read" {
  chmod 644 "$KEY_FILE"

  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"readable by group or other"* ]]
}

@test "refuses a key file that is not there" {
  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$BATS_TEST_TMPDIR/no-such-key.json"

  [ "$status" -ne 0 ]
  [[ $output == *"does not exist"* ]]
}

@test "a dry run prints the gcloud command and writes no token" {
  local out=$BATS_TEST_TMPDIR/never.token

  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE" --token-file "$out" --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] env CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE=$KEY_FILE"* ]]
  [[ $output == *'gcloud auth print-access-token'* ]]
  [[ $output == *"token_file=$out"* ]]
  [ ! -e "$out" ]
  [ ! -s "$FAKE_LOG" ]
}
