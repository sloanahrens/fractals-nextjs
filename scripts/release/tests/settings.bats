#!/usr/bin/env bats
#
# The stack's committed settings, and the three scripts that refuse to run
# without them (bead dv-8xi).
#
# `pulumi stack init --secrets-provider gcpkms://...` records two lines —
# secretsprovider and encryptedkey — in <stack-dir>/Pulumi.<stack>.yaml, and
# Pulumi documents that file as committed state. A checkout without them falls
# back to the passphrase provider, and every pulumi command then fails with
# "passphrase must be set with PULUMI_CONFIG_PASSPHRASE": that is what the
# pre-release rehearsal of 2026-10-08 hit, when init_stack.sh ran in a throwaway
# checkout and the lines it printed went with it.
#
# So preview.sh, up.sh and promote.sh refuse a stack whose settings cannot work,
# before any pulumi call and before any credential is read. The tests here cover
# the answers a settings file can give — no line, another project's line, a
# passphrase, this project's line — for all three scripts, plus the dry run,
# which refuses exactly what a real run refuses.
#
# The refusal must also be readable and must not leak: it names the file and
# what to do about it, and it never prints the file's encryptedkey.

load helpers.bash

setup() {
  setup_release_env
}

# stack_scripts are the scripts that require the committed settings, in the
# order the flow runs them. build_push.sh, mint_token.sh and health.sh never
# open a stack, so they neither read nor need the file.
stack_scripts() { printf '%s\n' preview.sh up.sh promote.sh; }

# settings_env_for SCRIPT prints the environment whose stack that script uses:
# promotion is always prod, the other two default to staging.
settings_env_for() {
  if [[ $1 == promote.sh ]]; then printf 'prod'; else printf 'staging'; fi
}

# settings_file_for SCRIPT prints the settings file that script reads.
settings_file_for() {
  printf '%s/Pulumi.%s.yaml' "$STACK_DIR" "$(settings_env_for "$1")"
}

# run_stack_script SCRIPT [EXTRA...] runs one of the three against the fakes with
# the arguments it takes — promote.sh is given its digest as an argument, the
# other two as a flag — and any extra flags. It is a `run`, so the test reads
# $status and $output as usual.
run_stack_script() {
  local script=$1
  shift
  if [[ $script == promote.sh ]]; then
    run "$RELEASE_DIR/$script" "$DIGEST" --app "$APP" --token-file "$TOKEN_FILE" "$@"
  elif [[ $script == preview.sh ]]; then
    # preview.sh writes its diff where --preview-file says, and that default is
    # a relative path. Pointing it at the bats temporary directory keeps the
    # suite from leaving a preview-staging.diff behind in whatever directory it
    # was run from.
    run "$RELEASE_DIR/$script" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" \
      --preview-file "$BATS_TEST_TMPDIR/preview.diff" "$@"
  else
    run "$RELEASE_DIR/$script" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" "$@"
  fi
}

# remove_settings removes both stacks' settings files, which is the checkout a
# release runs in when the block init_stack.sh printed was never committed.
remove_settings() {
  rm -f "$STACK_DIR/Pulumi.staging.yaml" "$STACK_DIR/Pulumi.prod.yaml"
}

# write_settings_without_provider ENV writes the settings file of a stack whose
# block never made it into the repo: the app's config is there, the
# secretsprovider line is not.
write_settings_without_provider() {
  local env_name=$1
  {
    printf 'config:\n'
    printf '  gcp:project: %s\n' "$PROJECT"
    printf 'encryptedkey: %s\n' "$FAKE_PULUMI_ENCRYPTED_KEY"
  } >"$STACK_DIR/Pulumi.$env_name.yaml"
}

# refuse_checked SCRIPT fails the test when the last `run` did not refuse, and
# names the script so the failure says which one accepted the stack.
refuse_checked() {
  if [[ $status -eq 0 ]]; then
    printf '%s accepted a stack with no usable settings:\n%s\n' "$1" "$output" >&2
    return 1
  fi
}

@test "every script refuses a stack whose settings file was never committed" {
  local script
  while read -r script; do
    remove_settings
    : >"$FAKE_LOG"

    run_stack_script "$script"

    refuse_checked "$script"
    [[ $output == *"$(settings_file_for "$script") does not exist"* ]]
    # The refusal says what to do: run init_stack.sh for this app and env, and
    # commit the block it prints.
    [[ $output == *"init_stack.sh"* ]]
    [[ $output == *"PULUMI_CONFIG_PASSPHRASE"* ]]
    # It is reached before Pulumi is asked anything at all, so a release with no
    # settings cannot touch a stack or mint anything.
    [ ! -s "$FAKE_LOG" ]
  done < <(stack_scripts)
}

@test "every script refuses a settings file with no secretsprovider line" {
  local script
  while read -r script; do
    write_settings_without_provider "$(settings_env_for "$script")"
    : >"$FAKE_LOG"

    run_stack_script "$script"

    refuse_checked "$script"
    [[ $output == *"$(settings_file_for "$script") has no secretsprovider: line"* ]]
    [[ $output == *"init_stack.sh"* ]]
    # The failing half is all a log may see of the file: the encrypted key is
    # not read, printed or passed on.
    [[ $output != *"$FAKE_PULUMI_ENCRYPTED_KEY"* ]]
    [ ! -s "$FAKE_LOG" ]
  done < <(stack_scripts)
}

@test "every script refuses a settings file naming another project's key" {
  # What a stack file copied from another app's stack looks like: its provider
  # names that project's key ring, which this release has no binding on.
  local foreign='gcpkms://projects/gt-other-m4xq/locations/us-central1/keyRings/pulumi/cryptoKeys/secrets'

  local script
  while read -r script; do
    write_stack_settings "$(settings_env_for "$script")" "$foreign"
    : >"$FAKE_LOG"

    run_stack_script "$script"

    refuse_checked "$script"
    [[ $output == *"$(settings_file_for "$script") names a different secrets provider"* ]]
    # The message names the wrong URL and the one the stack needs, which is what
    # makes it fixable; the provider URL is the only value of the file a refusal
    # may carry.
    [[ $output == *"$foreign"* ]]
    [[ $output == *"$(secrets_provider_url)"* ]]
    [[ $output != *"$FAKE_PULUMI_ENCRYPTED_KEY"* ]]
    [ ! -s "$FAKE_LOG" ]
  done < <(stack_scripts)
}

@test "every script refuses a settings file recording the passphrase provider" {
  # The other half of "not this project's provider": a stack someone created
  # without --secrets-provider, so Pulumi recorded its default. The secrets are
  # behind a passphrase no checkout in this flow has.
  local script
  while read -r script; do
    write_stack_settings "$(settings_env_for "$script")" passphrase
    : >"$FAKE_LOG"

    run_stack_script "$script"

    refuse_checked "$script"
    [[ $output == *"$(settings_file_for "$script") names a different secrets provider"* ]]
    [[ $output == *"passphrase (want $(secrets_provider_url))"* ]]
    [ ! -s "$FAKE_LOG" ]
  done < <(stack_scripts)
}

@test "every script runs a stack whose settings file names this project's key" {
  local script
  while read -r script; do
    write_stack_settings "$(settings_env_for "$script")"
    : >"$FAKE_LOG"

    run_stack_script "$script"

    [ "$status" -eq 0 ]
    # The check is not a wall: with the settings in place the script reaches
    # Pulumi and pins the digest as it always did.
    assert_in_log "pulumi config set imageDigest $DIGEST --stack $(settings_env_for "$script") --cwd $STACK_DIR --plaintext"
  done < <(stack_scripts)
}

@test "a dry run refuses exactly what a real run refuses" {
  local script
  while read -r script; do
    remove_settings
    : >"$FAKE_LOG"

    run_stack_script "$script" --dry-run

    refuse_checked "$script"
    [[ $output == *"$(settings_file_for "$script") does not exist"* ]]
    [ ! -s "$FAKE_LOG" ]
  done < <(stack_scripts)
}

@test "promotion reads the prod stack's settings file, not staging's" {
  rm -f "$STACK_DIR/Pulumi.prod.yaml"

  run "$RELEASE_DIR/promote.sh" "$DIGEST" --app "$APP" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"Pulumi.prod.yaml does not exist"* ]]
  [[ $output != *"Pulumi.staging.yaml"* ]]
  [ ! -s "$FAKE_LOG" ]
}
