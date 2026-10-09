#!/usr/bin/env bash
#
# Shared set-up for the release script tests (bead B5.2). Loaded by every
# .bats file in this directory.
#
# Each test gets a fresh temporary directory holding:
#
#   bin/     the fake docker, gcloud, pulumi, curl and date, first on PATH, so a
#            script under test cannot reach a real tool even by accident (date
#            is only ever the real one unless a test sets FAKE_DATE_BAD)
#   fake.log every fake invocation, recorded verbatim
#   fake-state  the fake cloud's serving/latest revision
#   base-key.json  a key file containing a marker string that must never
#                  appear in any output, log or command line
#   token          the token mint_token.sh would have written
#   stack/         the Pulumi project directory, holding the Pulumi.<env>.yaml
#                  settings file an app repo commits for each stack
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
  chmod +x "$FAKE_BIN"/docker "$FAKE_BIN"/gcloud "$FAKE_BIN"/pulumi "$FAKE_BIN"/curl "$FAKE_BIN"/date
  PATH="$FAKE_BIN:$PATH"
  export PATH

  FAKE_LOG=$BATS_TEST_TMPDIR/fake.log
  : >"$FAKE_LOG"
  export FAKE_LOG

  FAKE_STATE=$BATS_TEST_TMPDIR/fake-state
  export FAKE_STATE

  FAKE_SERVICE_URL='https://fractals-nextjs-staging-abc123.us-central1.run.app'
  export FAKE_SERVICE_URL

  # VERSION_URL is where wait_version.sh polls for the commit serving (bead
  # dv-5jrh). It is http on localhost on purpose: that is the one place the
  # script accepts a plain-http URL, because everywhere else the answer would
  # cross the network in clear text. Its port is not used by anything.
  VERSION_URL='http://localhost:8080'
  export VERSION_URL

  # DEPLOYED_SHA is the commit a release would be checking for, and OTHER_SHA
  # the commit a service running another revision reports back -- an older one,
  # or a newer landing that superseded this deploy. Both are well-formed 40
  # character hex git object names, which is what the script accepts.
  DEPLOYED_SHA='0123456789abcdef0123456789abcdef01234567'
  OTHER_SHA='fedcba9876543210fedcba9876543210fedcba98'
  export DEPLOYED_SHA OTHER_SHA

  # FAKE_HTTP_BODY is the body the fake curl hands back: the version endpoint's
  # answer, which is the deploy's own commit. The extra field is there because a
  # real endpoint answers with more than the commit it is asked about. A test
  # that wants another answer sets its own; secrets.bats, which runs every
  # script and expects each to succeed, gets this one.
  FAKE_HTTP_BODY=$(printf '{"commit":"%s","deployedAt":"2026-10-08T21:22:00Z"}' "$DEPLOYED_SHA")
  export FAKE_HTTP_BODY

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

  # PREVIOUS_DIGEST is a second well-formed digest: the image a stack was
  # running before the release a test is about. The pulumi fake's export fixture
  # records $DIGEST -- the image that builds -- so a test that wants the release
  # to be a change points FAKE_PULUMI_EXPORT_IMAGE at this one, and a test that
  # leaves the fixture alone is the release whose digest the stack already runs,
  # which applies nothing (deployed_at.bats, bead dv-iuqp).
  PREVIOUS_DIGEST="$IMAGE@sha256:$(printf 'ab%.0s' {1..32})"
  export PREVIOUS_DIGEST

  # The scripts read their inputs from GT_* variables and flags, never from bare
  # APP/PROJECT names, so that a stray variable in a runner cannot change what a
  # release deploys. The tests set the GT_* spellings for the scripts.
  export GT_APP="$APP" GT_PROJECT="$PROJECT"

  # The app repo commits a settings file per stack — deploy/Pulumi.<env>.yaml —
  # which is where `pulumi stack init --secrets-provider` records the stack's
  # secretsprovider and encryptedkey lines (workflows/README.md, "What an app
  # repo needs before its first release"). preview.sh, up.sh and promote.sh
  # refuse a stack whose committed file does not name this project's provider
  # (bead dv-8xi), so the stand-in project directory has to look like the
  # checkout a release runs in. A test about that refusal deletes or rewrites
  # one of these.
  write_stack_settings staging
  write_stack_settings prod
}

# FAKE_PULUMI_ENCRYPTED_KEY stands in for the stack's encrypted secrets key,
# which is committed with the settings file. It is exported so the fake's
# `stack init` writes the same value as the fixture; real keys are base64 and
# are not secrets.
: "${FAKE_PULUMI_ENCRYPTED_KEY:=AAABfakeEncryptedStackKey-0123456789abcdef}"
export FAKE_PULUMI_ENCRYPTED_KEY

# write_stack_settings ENV [PROVIDER] writes the settings file the app repo
# commits for one stack into $STACK_DIR: the two lines Pulumi writes, with the
# given secrets provider URL (this project's own by default). A test passes
# another project's URL to write the file a copied stack would have.
write_stack_settings() {
  local env_name=$1 provider=${2:-$(secrets_provider_url)}
  {
    printf 'config:\n'
    printf '  gcp:project: %s\n' "$PROJECT"
    printf 'encryptedkey: %s\n' "$FAKE_PULUMI_ENCRYPTED_KEY"
    printf 'secretsprovider: %s\n' "$provider"
  } >"$STACK_DIR/Pulumi.$env_name.yaml"
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

# point_origin_main DIR [REV] points DIR's origin/main remote-tracking ref at
# REV, which defaults to HEAD. It is what makes a checkout from make_checkout
# look like the checkout a landing build runs in: build_push_staging.sh reads
# refs/remotes/origin/main to check that the commit it is about to publish is one
# main carries, and a local repository has no such ref until something creates
# it. No remote is configured, so the ref is written directly rather than
# fetched.
point_origin_main() {
  local dir=$1 rev=${2:-HEAD} sha
  sha=$(git -C "$dir" rev-parse "$rev")
  git -c core.hooksPath=/dev/null -C "$dir" update-ref refs/remotes/origin/main "$sha"
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
