#!/usr/bin/env bats
#
# The second acceptance item of dv-cgu: a bats test asserts no script prints the
# contents of the key file.
#
# Every script is run twice — once for real against the fakes, once as a dry run
# — and each time three things must hold: the script prints no key material and
# no token, and the fake tools' log (which records the argv of every call) shows
# no key material or token either. The key file contains a known marker string,
# so a leak anywhere in the output or in a command line is a literal match.
#
# The second half of the file is bead dv-dw4: the ADC file the release scripts
# build from the base key for Pulumi's gs:// backend and its gcpkms secrets
# provider. That file does hold key material — its source_credentials is the
# base key — so the tests here are about where it may live and where it may not
# be seen: mode 600 in a private directory, gone when the script exits, and
# never on a command line, in an echo or in the output. The pulumi fake records
# the file's non-secret fields (mode, credential type, impersonation URL,
# delegate count, whether source_credentials is there at all) and never its
# contents, which is how a test pins the account it names without reading a
# credential.

load helpers.bash

setup() {
  setup_release_env
  CHECKOUT=$BATS_TEST_TMPDIR/app
  make_checkout "$CHECKOUT" v1.0.0
  # The landing build reads origin/main to check that the commit it publishes is
  # one main carries (build_push_staging.sh), so the fixture has to be a
  # checkout that looks like the one a landing run gets.
  point_origin_main "$CHECKOUT"
}

@test "no script prints the contents of the key file" {
  assert_clean "build_push.sh" "$RELEASE_DIR/build_push.sh" \
    --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --token-file "$TOKEN_FILE"
  assert_clean "build_push_staging.sh" "$RELEASE_DIR/build_push_staging.sh" \
    --app "$APP" --source "$CHECKOUT" --token-file "$TOKEN_FILE"
  assert_clean "mint_token.sh" "$RELEASE_DIR/mint_token.sh" \
    --app "$APP" --key-file "$KEY_FILE" --token-file "$BATS_TEST_TMPDIR/minted.token"
  assert_clean "preview.sh" "$RELEASE_DIR/preview.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --preview-file "$BATS_TEST_TMPDIR/p.diff"
  assert_clean "up.sh" "$RELEASE_DIR/up.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"
  assert_clean "promote.sh" "$RELEASE_DIR/promote.sh" "$DIGEST" \
    --app "$APP" --token-file "$TOKEN_FILE"
  assert_clean "staged_digest.sh" "$RELEASE_DIR/staged_digest.sh" \
    --app "$APP" --env staging --token-file "$TOKEN_FILE"
  assert_clean "digest_for_tag.sh" "$RELEASE_DIR/digest_for_tag.sh" \
    --app "$APP" --tag v1.0.0 --token-file "$TOKEN_FILE"
  assert_clean "health.sh" "$RELEASE_DIR/health.sh" \
    --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 5 --interval 1
  assert_clean "wait_version.sh" "$RELEASE_DIR/wait_version.sh" \
    --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 5 --interval 1
  assert_clean "init_stack.sh" "$RELEASE_DIR/init_stack.sh" \
    --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"
}

@test "no script prints the contents of the key file in a dry run" {
  assert_clean "build_push.sh" "$RELEASE_DIR/build_push.sh" \
    --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "build_push_staging.sh" "$RELEASE_DIR/build_push_staging.sh" \
    --app "$APP" --source "$CHECKOUT" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "mint_token.sh" "$RELEASE_DIR/mint_token.sh" \
    --app "$APP" --key-file "$KEY_FILE" --token-file "$BATS_TEST_TMPDIR/minted.token" --dry-run
  assert_clean "preview.sh" "$RELEASE_DIR/preview.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "up.sh" "$RELEASE_DIR/up.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "promote.sh" "$RELEASE_DIR/promote.sh" "$DIGEST" \
    --app "$APP" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "staged_digest.sh" "$RELEASE_DIR/staged_digest.sh" \
    --app "$APP" --env staging --token-file "$TOKEN_FILE" --dry-run
  assert_clean "digest_for_tag.sh" "$RELEASE_DIR/digest_for_tag.sh" \
    --app "$APP" --tag v1.0.0 --token-file "$TOKEN_FILE" --dry-run
  assert_clean "health.sh" "$RELEASE_DIR/health.sh" \
    --url "$FAKE_SERVICE_URL" --health-path /api/health --dry-run
  assert_clean "wait_version.sh" "$RELEASE_DIR/wait_version.sh" \
    --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --dry-run
  assert_clean "init_stack.sh" "$RELEASE_DIR/init_stack.sh" \
    --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE" --dry-run
}

@test "the key file is the only file holding key material after a release" {
  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE" --token-file "$BATS_TEST_TMPDIR/minted.token"
  [ "$status" -eq 0 ]

  local leaked
  leaked=$(grep -rl "$KEY_MARKER" "$BATS_TEST_TMPDIR" 2>/dev/null | grep -v "^$KEY_FILE$" || true)
  if [[ -n $leaked ]]; then
    printf 'key material was copied into:\n%s\n' "$leaked" >&2
    return 1
  fi
}

@test "the minted token file is the only file holding the token" {
  local minted=$BATS_TEST_TMPDIR/minted.token

  run "$RELEASE_DIR/mint_token.sh" --app "$APP" --key-file "$KEY_FILE" --token-file "$minted"
  [ "$status" -eq 0 ]

  local leaked
  leaked=$(grep -rl "$FAKE_ACCESS_TOKEN" "$BATS_TEST_TMPDIR" 2>/dev/null | grep -v "^$minted$" || true)
  if [[ -n $leaked ]]; then
    printf 'the token was copied into:\n%s\n' "$leaked" >&2
    return 1
  fi
}

# ── The ADC file (bead dv-dw4) ────────────────────────────────────────────

@test "pulumi is handed a mode-600 impersonated ADC file for exactly the deployer account" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  # The fake records what the process was handed, out of the file it was pointed
  # at: the credential type, the account the URL mints from, no delegates, and
  # the base key as source_credentials. Its contents are never recorded.
  assert_in_log 'adc_env=present'
  assert_in_log 'adc_mode=600'
  assert_in_log 'adc_type=impersonated_service_account'
  assert_in_log "adc_url=$(deployer_adc_url)"
  assert_in_log 'adc_delegates=0'
  assert_in_log 'adc_source=present'

  # And none of it reached what the script printed, or any command line it ran.
  assert_no_key_material "$output"
  assert_no_key_material "$(cat "$FAKE_LOG")"
  assert_no_token_value "$output"
}

@test "the ADC file is in a private directory, mode 600, and gone when the script exits" {
  # TMPDIR is moved inside the test so the private directory the library creates
  # lands where this test can look for it: the ADC file holds the base key, so
  # what has to be true is that it is unreadable by anyone else while it exists
  # and removed afterwards, whatever the script's exit status.
  export TMPDIR=$BATS_TEST_TMPDIR/private
  mkdir -p "$TMPDIR"

  run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" \
    --token-file "$TOKEN_FILE" --preview-file "$BATS_TEST_TMPDIR/p.diff"

  [ "$status" -eq 0 ]
  assert_in_log 'adc_env=present'
  assert_in_log 'adc_mode=600'

  # Nothing the file lived in survives the run, so no copy of the key is left
  # behind for the next job on the runner to read.
  run find "$TMPDIR" -mindepth 1 -print
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "the ADC file is removed when the script fails too" {
  export TMPDIR=$BATS_TEST_TMPDIR/private
  mkdir -p "$TMPDIR"
  export FAKE_PULUMI_FAIL=preview

  run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" \
    --token-file "$TOKEN_FILE" --preview-file "$BATS_TEST_TMPDIR/p.diff"

  [ "$status" -ne 0 ]
  assert_in_log 'adc_env=present'

  run find "$TMPDIR" -mindepth 1 -print
  [ -z "$output" ]
}

@test "pulumi_env twice in one process leaves one ADC file, not two" {
  # The teardown template previews both environments in one step, so pulumi_env
  # runs twice in one shell. The credential belongs to the process: the second
  # call replaces the first's file rather than leaving a second copy of the key
  # in a directory nothing will remove.
  export TMPDIR=$BATS_TEST_TMPDIR/private
  mkdir -p "$TMPDIR"

  run env GT_APP="$APP" GT_PROJECT="$PROJECT" GT_STACK_DIR="$STACK_DIR" \
    GT_BASE_KEY_FILE="$KEY_FILE" TMPDIR="$TMPDIR" \
    "$(command -v bash)" -c '
      . "$1/lib.sh"
      for env_name in staging prod; do
        ENV_NAME=$env_name
        release_target
        pulumi_env "$2" >/dev/null
        printf "adc_dirs=%s\n" "$(find "$TMPDIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d " ")"
      done' _ "$RELEASE_DIR" "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  # After each pass exactly one private directory holds the key: the second pass
  # did not leave the first's copy behind.
  [ "$(printf '%s\n' "$output" | sort -u)" = 'adc_dirs=1' ]

  # And the process removed the one it did hold.
  run find "$TMPDIR" -mindepth 1 -print
  [ -z "$output" ]
}

@test "refuses a key whose type is not a service account" {
  local other=$BATS_TEST_TMPDIR/authorized-user.json
  printf '{"type":"authorized_user","private_key":"%s"}\n' "$KEY_MARKER" >"$other"
  chmod 600 "$other"

  run env GT_BASE_KEY_FILE="$other" "$RELEASE_DIR/up.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"not a service account key"* ]]
  [[ $output == *authorized_user* ]]
  # The refusal names the type, never the key it is in, and it happens before
  # any tool runs.
  assert_no_key_material "$output"
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses a key file that is not valid JSON without printing what is in it" {
  # A truncated or corrupted key: the parse failure is the one place a tool
  # could put key material into the log, so the test asserts the refusal names
  # the problem and none of the bytes it was given.
  local other=$BATS_TEST_TMPDIR/truncated.json
  printf '{"type":"service_account","private_key":"%s' "$KEY_MARKER" >"$other"
  chmod 600 "$other"

  run env GT_BASE_KEY_FILE="$other" "$RELEASE_DIR/up.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"not valid JSON"* ]]
  assert_no_key_material "$output"
  assert_no_key_material "$(cat "$FAKE_LOG")"
}

@test "a missing jq is a clear error" {
  # A PATH with the tools the script needs before it reaches jq, and no jq in
  # it. bash is named by its full path because the script's shebang resolves
  # bash through PATH too. grep is on the list because the stack settings check
  # runs before the key is read at all and reads the settings file with it
  # (lib.sh, require_stack_settings); the fixture has committed settings, so the
  # check passes and the script gets as far as jq.
  local limited=$BATS_TEST_TMPDIR/limited-bin
  mkdir -p "$limited"
  local tool
  for tool in dirname id stat mktemp chmod grep; do
    ln -sf "$(command -v "$tool")" "$limited/$tool"
  done

  run env PATH="$limited" "$(command -v bash)" "$RELEASE_DIR/up.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"jq is required and is not on PATH"* ]]
}
