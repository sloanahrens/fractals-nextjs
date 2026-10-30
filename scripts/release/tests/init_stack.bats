#!/usr/bin/env bats
#
# init_stack.sh and the stack creation a release can do itself (bead dv-dw4):
# the one-time creation of an app's stack, which the first release needs because
# up.sh refuses a stack that does not exist.
#
# What the tests pin is the pair of facts a stack's creation decides: the stack
# is created when it is missing and left alone when it is there, and every stack
# is created with the app project's gcpkms key as its secrets provider — never a
# passphrase, and never a different provider than the release's own
# --init-stack path uses.

load helpers.bash

setup() {
  setup_release_env
}

@test "creates a missing stack with the project's gcpkms secrets provider" {
  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env staging --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"stack=staging"* ]]
  [[ $output == *"created=yes"* ]]
  assert_in_log "pulumi stack init staging --cwd $STACK_DIR --secrets-provider $(secrets_provider_url)"
  refute_in_log 'passphrase'
}

@test "creates the prod stack with the same provider" {
  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env prod --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"stack=prod"* ]]
  assert_in_log "pulumi stack init prod --cwd $STACK_DIR --secrets-provider $(secrets_provider_url)"
  refute_in_log 'passphrase'
}

@test "skips a stack that is already there and exits 0" {
  export FAKE_PULUMI_STACKS="[{\"name\":\"staging\",\"url\":\"gs://$PROJECT-pulumi-state\"}]"

  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env staging --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"stack staging already exists"* ]]
  [[ $output == *"created=no"* ]]
  # It asked the backend and created nothing: a second stack with this name
  # cannot exist, and nothing was changed.
  assert_in_log "pulumi stack ls --json --cwd $STACK_DIR"
  refute_in_log 'pulumi stack init'
}

@test "recognizes a stack the backend names project-qualified" {
  export FAKE_PULUMI_STACKS="[{\"name\":\"$PROJECT/staging\"}]"

  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env staging --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"created=no"* ]]
  refute_in_log 'pulumi stack init'
}

@test "a listing that names another stack does not count as this one" {
  export FAKE_PULUMI_STACKS='[{"name":"prod","url":"gs://gt-x-pulumi-state"}]'

  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env staging --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"created=yes"* ]]
  assert_in_log "pulumi stack init staging --cwd $STACK_DIR"
}

@test "a stack a release creates itself gets the same secrets provider" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" \
    --token-file "$TOKEN_FILE" --init-stack

  [ "$status" -eq 0 ]
  assert_in_log "pulumi stack init staging --cwd $STACK_DIR --secrets-provider $(secrets_provider_url)"
  refute_in_log 'passphrase'
}

# ── The committed settings the block carries (bead dv-8xi) ────────────────
#
# `pulumi stack init --secrets-provider` writes the stack's settings file, and
# Pulumi documents that file as committed state. The first release of
# 2026-10-08 lost those lines because init_stack.sh ran in a throwaway
# checkout, so the script now prints them: a block in the log is a block the
# operator can paste into the file they commit, which is what
# preview.sh, up.sh and promote.sh refuse to run without
# (tests/settings.bats).

@test "prints the settings block of the stack it created" {
  # A first release: the app repo has no settings file for this stack yet, so
  # the two lines can only come from the file Pulumi has just written.
  local file=$STACK_DIR/Pulumi.staging.yaml
  rm -f "$file"

  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env staging --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"created=yes"* ]]

  local provider key block expected
  provider=$(grep -m1 '^secretsprovider:' "$file")
  key=$(grep -m1 '^encryptedkey:' "$file")
  # The stack must have been created with this project's own key, which is what
  # the block is then telling the operator to commit.
  [ "$provider" = "secretsprovider: $(secrets_provider_url)" ]

  # The block holds the file's own two lines, in the file's order, between the
  # markers naming the environment: it can be pasted in without reordering.
  block=$(printf '%s\n' "$output" | sed -n '/^settings-begin staging$/,/^settings-end staging$/p')
  expected="settings-begin staging
$provider
$key
settings-end staging"
  [ "$block" = "$expected" ]

  # And it says what the two lines are for.
  [[ $output == *"commit these two lines"* ]]
  [[ $output == *"$file"* ]]
}

@test "prints the prod block for the prod stack" {
  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env prod --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"settings-begin prod"* ]]
  [[ $output == *"settings-end prod"* ]]
  [[ $output != *"settings-begin staging"* ]]
}

@test "a dry run prints no settings block, because it creates nothing" {
  rm -f "$STACK_DIR/Pulumi.staging.yaml"

  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env staging --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"created=unknown"* ]]
  [[ $output != *"settings-begin staging"* ]]
  [[ $output != *"settings-end staging"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses an env that is not staging or prod" {
  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --env preview --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"env must be staging or prod"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a cloud run app refuses the ephemeral env" {
  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --env ephemeral --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"env must be staging or prod"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a kubernetes app creates its ephemeral stack with the project's gcpkms secrets provider" {
  GT_PLATFORM=kubernetes run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env ephemeral --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  [[ $output == *"stack=ephemeral"* ]]
  [[ $output == *"created=yes"* ]]
  assert_in_log "pulumi stack init ephemeral --cwd $STACK_DIR --secrets-provider $(secrets_provider_url)"
  refute_in_log 'passphrase'
}

@test "a kubernetes app refuses staging and prod" {
  GT_PLATFORM=kubernetes run "$RELEASE_DIR/init_stack.sh" --app "$APP" --env staging --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"env must be ephemeral for a kubernetes app"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a platform that is neither cloudrun nor kubernetes is refused" {
  GT_PLATFORM=lambda run "$RELEASE_DIR/init_stack.sh" --app "$APP" --env staging --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"platform must be cloudrun or kubernetes, got: lambda"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "requires a token file" {
  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --env staging

  [ "$status" -ne 0 ]
  [[ $output == *"--token-file"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a dry run prints the creation and creates nothing" {
  run "$RELEASE_DIR/init_stack.sh" --app "$APP" --project "$PROJECT" \
    --env staging --token-file "$TOKEN_FILE" --dry-run

  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] pulumi stack ls --json"* ]]
  [[ $output == *"[dry-run] pulumi stack init staging --cwd $STACK_DIR --secrets-provider $(secrets_provider_url)"* ]]
  [[ $output == *"created=unknown"* ]]
  [ ! -s "$FAKE_LOG" ]
}
