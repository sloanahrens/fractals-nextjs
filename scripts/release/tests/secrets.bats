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

load helpers.bash

setup() {
  setup_release_env
  CHECKOUT=$BATS_TEST_TMPDIR/app
  make_checkout "$CHECKOUT" v1.0.0
}

@test "no script prints the contents of the key file" {
  assert_clean "build_push.sh" "$RELEASE_DIR/build_push.sh" \
    --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --token-file "$TOKEN_FILE"
  assert_clean "mint_token.sh" "$RELEASE_DIR/mint_token.sh" \
    --app "$APP" --key-file "$KEY_FILE" --token-file "$BATS_TEST_TMPDIR/minted.token"
  assert_clean "preview.sh" "$RELEASE_DIR/preview.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --preview-file "$BATS_TEST_TMPDIR/p.diff"
  assert_clean "up.sh" "$RELEASE_DIR/up.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE"
  assert_clean "promote.sh" "$RELEASE_DIR/promote.sh" "$DIGEST" \
    --app "$APP" --token-file "$TOKEN_FILE"
  assert_clean "health.sh" "$RELEASE_DIR/health.sh" \
    --url "$FAKE_SERVICE_URL" --health-path /api/health --timeout 5 --interval 1
}

@test "no script prints the contents of the key file in a dry run" {
  assert_clean "build_push.sh" "$RELEASE_DIR/build_push.sh" \
    --app "$APP" --tag v1.0.0 --source "$CHECKOUT" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "mint_token.sh" "$RELEASE_DIR/mint_token.sh" \
    --app "$APP" --key-file "$KEY_FILE" --token-file "$BATS_TEST_TMPDIR/minted.token" --dry-run
  assert_clean "preview.sh" "$RELEASE_DIR/preview.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "up.sh" "$RELEASE_DIR/up.sh" \
    --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "promote.sh" "$RELEASE_DIR/promote.sh" "$DIGEST" \
    --app "$APP" --token-file "$TOKEN_FILE" --dry-run
  assert_clean "health.sh" "$RELEASE_DIR/health.sh" \
    --url "$FAKE_SERVICE_URL" --health-path /api/health --dry-run
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
