#!/usr/bin/env bash
#
# Shared set-up for the release script tests (bead B5.2). Loaded by every
# .bats file in this directory.
#
# Each test gets a fresh temporary directory holding:
#
#   bin/     the fake docker, gcloud, pulumi and curl, first on PATH, so a
#            script under test cannot reach a real tool even by accident
#   fake.log every fake invocation, recorded verbatim
#   fake-state  the fake cloud's serving/latest revision
#   base-key.json  a key file containing a marker string that must never
#                  appear in any output, log or command line
#   token          the token mint_token.sh would have written
#
# The scripts under test are always invoked through $RELEASE_DIR, never
# relative to the caller's working directory.

# KEY_MARKER stands in for key material. It is not a key, it is a tripwire:
# every test that touches the key file asserts this string reaches no output.
KEY_MARKER='KEY-MATERIAL-MUST-NEVER-BE-PRINTED-9f3a'

# DIGEST_HEX is a well-formed 64 character lowercase digest body.
DIGEST_HEX='deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

# setup_release_env is called by each .bats file's own setup(). It is not named
# setup() here on purpose: a file that calls `load helpers.bash` and then
# defines its own setup() would otherwise silently drop this one.
setup_release_env() {
  RELEASE_DIR=$(cd "$BATS_TEST_DIRNAME/.." && pwd)
  export RELEASE_DIR

  # The fakes are copied rather than symlinked: each one sources _fake.sh from
  # its own directory, which a symlink would move.
  FAKE_BIN=$BATS_TEST_TMPDIR/bin
  mkdir -p "$FAKE_BIN"
  cp -R "$BATS_TEST_DIRNAME/fakes/." "$FAKE_BIN/"
  chmod +x "$FAKE_BIN"/docker "$FAKE_BIN"/gcloud "$FAKE_BIN"/pulumi "$FAKE_BIN"/curl
  PATH="$FAKE_BIN:$PATH"
  export PATH

  FAKE_LOG=$BATS_TEST_TMPDIR/fake.log
  : >"$FAKE_LOG"
  export FAKE_LOG

  FAKE_STATE=$BATS_TEST_TMPDIR/fake-state
  export FAKE_STATE

  FAKE_SERVICE_URL='https://fractals-nextjs-staging-abc123.us-central1.run.app'
  export FAKE_SERVICE_URL

  KEY_FILE=$BATS_TEST_TMPDIR/base-key.json
  printf '{"type":"service_account","private_key":"%s"}\n' "$KEY_MARKER" >"$KEY_FILE"
  chmod 600 "$KEY_FILE"
  export KEY_FILE

  # The scripts read the base key's path from GT_BASE_KEY_FILE, the variable the
  # workflow sets (workflows/README.md), and build the ADC file Pulumi's own
  # calls need from it (lib.sh, adc_credentials). mint_token.sh takes --key-file
  # as well; the rest have only this.
  export GT_BASE_KEY_FILE="$KEY_FILE"

  # FAKE_ACCESS_TOKEN is the token the fake gcloud mints. It is unique per test,
  # so a leak can be traced to the file that leaked it and a search for its
  # value cannot match the fakes themselves.
  FAKE_ACCESS_TOKEN="fake-access-token-$RANDOM$RANDOM"
  export FAKE_ACCESS_TOKEN

  # TOKEN_FILE stands in for the token of an earlier mint: the one a deploy
  # script is handed. Its value differs from FAKE_ACCESS_TOKEN on purpose, so a
  # test can tell the token that was read from the token that was written.
  TOKEN_FILE=$BATS_TEST_TMPDIR/token
  printf 'fake-access-token-previous-%s\n' "$RANDOM" >"$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  export TOKEN_FILE

  # The app's Pulumi program lives in the app repo, not here. A temporary
  # directory stands in for it so the assertions on --cwd do not depend on where
  # the test suite happens to be run from.
  STACK_DIR=$BATS_TEST_TMPDIR/stack
  mkdir -p "$STACK_DIR"
  export GT_STACK_DIR="$STACK_DIR"

  APP=fractals-nextjs
  PROJECT=gt-fractals-m4xq
  IMAGE="us-central1-docker.pkg.dev/$PROJECT/apps/$APP"
  DIGEST="$IMAGE@sha256:$DIGEST_HEX"
  export APP PROJECT IMAGE DIGEST

  # The scripts read their inputs from GT_* variables and flags, never from bare
  # APP/PROJECT names, so that a stray variable in a runner cannot change what a
  # release deploys. The tests set the GT_* spellings for the scripts.
  export GT_APP="$APP" GT_PROJECT="$PROJECT"
}

# field OUTPUT KEY prints the value of the last `KEY=value` line in OUTPUT.
# That is how a script's stdout is meant to be read (see the README), so the
# flow test reads one script's output the way the workflow does.
field() {
  printf '%s\n' "$1" | sed -n "s/^$2=//p" | tail -1
}

# file_mode prints a file's permission bits. stat differs between the macOS
# runner and the Linux gate, so both spellings are tried.
file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }

# make_checkout DIR TAG creates a one-commit git checkout carrying TAG, which is
# what build_push.sh insists on building. Signing, hooks and the host's git
# configuration are switched off so the test does not depend on them.
make_checkout() {
  local dir=$1 tag=$2
  mkdir -p "$dir"
  printf 'FROM scratch\n' >"$dir/Dockerfile"

  local -a git=(git
    -c init.defaultBranch=main
    -c core.hooksPath=/dev/null
    -c commit.gpgsign=false
    -c user.name='release test'
    -c user.email='release@example.invalid'
    -C "$dir")
  "${git[@]}" init -q
  "${git[@]}" add -A
  "${git[@]}" commit -qm "release $tag"
  "${git[@]}" tag "$tag"
}

# assert_no_key_material TEXT fails when TEXT contains the key tripwire. It is
# the one assertion the bead names by hand: no script prints the contents of the
# key file (acceptance 2 of dv-cgu).
assert_no_key_material() {
  local text=$1
  if [[ $text == *"$KEY_MARKER"* ]]; then
    printf 'key material reached the output:\n%s\n' "$text" >&2
    return 1
  fi
}

# assert_no_token_value TEXT fails when TEXT contains the token minted for the
# job, on the same principle as assert_no_key_material.
assert_no_token_value() {
  local text=$1
  if [[ $text == *"$FAKE_ACCESS_TOKEN"* ]]; then
    printf 'the minted token reached the output:\n%s\n' "$text" >&2
    return 1
  fi
}

# deployer_adc_url prints the impersonation URL the ADC file has to carry for
# the app the tests release: exactly the account lib.sh's deployer_sa names, in
# the one form Go's ADC loader accepts for an impersonated_service_account
# credential (bead dv-dw4). The tests assert on this rather than on a hand-typed
# email so a change to deployer_sa fails there.
deployer_adc_url() {
  printf 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/deployer-%s@%s.iam.gserviceaccount.com:generateAccessToken' \
    "$APP" "$PROJECT"
}

# secrets_provider_url prints the gcpkms secrets provider URL every stack must
# be created with: the app project's key ring and key, which bootstrap creates
# as `pulumi` and `secrets` (internal/gcp/kms.go).
secrets_provider_url() {
  printf 'gcpkms://projects/%s/locations/us-central1/keyRings/pulumi/cryptoKeys/secrets' "$PROJECT"
}

# assert_in_log PATTERN fails when the fake tools were never asked for
# something matching PATTERN. The log records every call verbatim, so this is
# how a test states what a script is required to do.
assert_in_log() {
  if ! grep -q "$1" "$FAKE_LOG"; then
    printf 'the fake tools were never asked for %q; they saw:\n%s\n' "$1" "$(cat "$FAKE_LOG")" >&2
    return 1
  fi
}

# refute_in_log PATTERN fails when the fake tools *were* asked for something
# matching PATTERN. It is written as a function rather than `! grep` because a
# negated command does not trip the trap bats fails tests on, so `! grep` mid
# test asserts nothing at all.
refute_in_log() {
  if grep -q "$1" "$FAKE_LOG"; then
    printf 'the fake tools were asked for %q; they saw:\n%s\n' "$1" "$(cat "$FAKE_LOG")" >&2
    return 1
  fi
}

# release_scripts lists the scripts that are commands: every .sh in the release
# directory except lib.sh, which is sourced by them and has no interface of its
# own.
release_scripts() {
  local script
  for script in "$RELEASE_DIR"/*.sh; do
    [[ ${script##*/} == 'lib.sh' ]] && continue
    printf '%s\n' "$script"
  done
}

# assert_clean LABEL CMD... runs CMD, requires it to succeed, and then requires
# that neither its output nor the fake tools' invocation log contains key
# material or the minted token. It is how secrets.bats checks every script in
# one line each: the log records argv verbatim, so a script that passed a
# secret as an argument fails here.
# shellcheck disable=SC2154  # status and output are set by bats's run
assert_clean() {
  local label=$1
  shift

  run "$@"
  if [[ $status -ne 0 ]]; then
    printf '%s exited %s:\n%s\n' "$label" "$status" "$output" >&2
    return 1
  fi
  if ! assert_no_key_material "$output"; then
    printf '  (%s printed key material)\n' "$label" >&2
    return 1
  fi
  if ! assert_no_token_value "$output"; then
    printf '  (%s printed the token)\n' "$label" >&2
    return 1
  fi
  if ! assert_no_key_material "$(cat "$FAKE_LOG")"; then
    printf '  (%s handed key material to a tool)\n' "$label" >&2
    return 1
  fi
  if ! assert_no_token_value "$(cat "$FAKE_LOG")"; then
    printf '  (%s handed the token to a tool)\n' "$label" >&2
    return 1
  fi
}
