#!/usr/bin/env bats
#
# The read the prod job makes of the staging stack (bead dv-yf4).
#
# A stack's config cannot carry a value between jobs: the staging job pins the
# digest with `pulumi config set imageDigest`, which writes a file in that job's
# own checkout, and the first real release (fractals-nextjs, 2026-10-08) failed
# in prod with `configuration key 'imageDigest' not found for stack 'staging'`
# when it read the value back with `pulumi config get`. staged_digest.sh reads
# the image the stack is running out of `pulumi stack export` instead, from the
# state backend every job can read.
#
# The tests are about the two things that makes that safe. First, the selection
# is by resource type: an export holds every resource the program created, and
# more than one of them carries an image key, so a reader that searched for the
# key would print something the release does not deploy -- the fixture's other
# image is a tag, so picking it fails loudly rather than quietly. Second, a
# stack that cannot answer is always a refusal and never an empty read: an empty
# digest is what makes promote.sh skip its comparison, so stdout -- which is
# what the workflow appends to $GITHUB_OUTPUT -- has to stay empty when the read
# fails, and the message has to say what was wrong.
#
# Each test's streams are read apart, which is why the helper below is not
# `run` on its own: bats merges stderr into $output, and "stdout is empty" is
# one of the acceptance items.

load helpers.bash

setup() {
  setup_release_env
}

# run_digest ARGS... runs the script with its two streams kept apart.
# DIGEST_STATUS is its exit status, DIGEST_STDOUT exactly what the workflow
# reads into $GITHUB_OUTPUT, and DIGEST_STDERR what an operator reads. Declared
# without `local` so the caller sees them.
run_digest() {
  DIGEST_STATUS=0
  "$RELEASE_DIR/staged_digest.sh" "$@" \
    >"$BATS_TEST_TMPDIR/digest.out" 2>"$BATS_TEST_TMPDIR/digest.err" ||
    DIGEST_STATUS=$?
  DIGEST_STDOUT=$(cat "$BATS_TEST_TMPDIR/digest.out")
  DIGEST_STDERR=$(cat "$BATS_TEST_TMPDIR/digest.err")
}

# set_export writes a stack export from stdin into the bats temporary directory
# and points the pulumi fake at it, so a test can hand the script the state it
# needs to refuse: a deployment with no service, or with two.
set_export() {
  cat >"$BATS_TEST_TMPDIR/export.json"
  export FAKE_PULUMI_EXPORT_FILE=$BATS_TEST_TMPDIR/export.json
}

@test "prints the digest of the one Cloud Run service, not another resource's image" {
  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -eq 0 ]
  # stdout is one line, exactly the one the workflow appends to $GITHUB_OUTPUT.
  # The built-in fixture's registry resource carries a tag-shaped image of its
  # own, so a reader that picked a resource by its image key would fail here
  # rather than print it.
  [ "$DIGEST_STDOUT" = "digest=$DIGEST" ]

  assert_in_log "pulumi stack export --stack staging --cwd $STACK_DIR token_env=present"
  # The export is state, and secrets in it are read in their encrypted form or
  # not at all: --show-secrets would put every secret of the stack in the job's
  # memory and one jq mistake away from its log.
  refute_in_log 'show-secrets'
  # Written without the leading dashes: grep reads a pattern that starts with one
  # as an option, fails, and a test that reads that failure as "the log does not
  # hold it" passes for the wrong reason (helpers.bash, refute_in_log).
  refute_in_log 'stack prod'
}

@test "reads the stack --env names" {
  run_digest --app "$APP" --project "$PROJECT" --env prod --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -eq 0 ]
  [ "$DIGEST_STDOUT" = "digest=$DIGEST" ]
  assert_in_log "pulumi stack export --stack prod --cwd $STACK_DIR"
}

@test "refuses a stack whose export holds no Cloud Run service" {
  set_export <<JSON
{"version":3,"deployment":{"resources":[
  {"type":"pulumi:pulumi:Stack","outputs":{"url":"https://example.invalid"}},
  {"type":"gcp:artifactregistry/repository:Repository","outputs":{"image":"$IMAGE:latest"}}
]}}
JSON

  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -ne 0 ]
  [ -z "$DIGEST_STDOUT" ]
  [[ $DIGEST_STDERR == *"holds 0 resources of type gcp:cloudrunv2/service:Service"* ]]
}

@test "refuses a stack whose export holds two Cloud Run services" {
  set_export <<JSON
{"version":3,"deployment":{"resources":[
  {"type":"gcp:cloudrunv2/service:Service","outputs":{"template":{"containers":[{"image":"$DIGEST"}]}}},
  {"type":"gcp:cloudrunv2/service:Service","outputs":{"template":{"containers":[{"image":"$IMAGE@sha256:$DIGEST_HEX"}]}}}
]}}
JSON

  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -ne 0 ]
  [ -z "$DIGEST_STDOUT" ]
  [[ $DIGEST_STDERR == *"holds 2 resources of type gcp:cloudrunv2/service:Service"* ]]
}

@test "refuses a service whose image is a tag" {
  export FAKE_PULUMI_EXPORT_IMAGE="$IMAGE:latest"

  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -ne 0 ]
  [ -z "$DIGEST_STDOUT" ]
  [[ $DIGEST_STDERR == *"immutable digest, not a tag"* ]]
  [[ $DIGEST_STDERR == *"$IMAGE:latest"* ]]
}

@test "refuses a service that records no image" {
  set_export <<JSON
{"version":3,"deployment":{"resources":[
  {"type":"gcp:cloudrunv2/service:Service","outputs":{"name":"fractals-nextjs-staging"}}
]}}
JSON

  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -ne 0 ]
  [ -z "$DIGEST_STDOUT" ]
  [[ $DIGEST_STDERR == *"records no image at outputs.template.containers[0].image"* ]]
}

@test "refuses a failed export" {
  export FAKE_PULUMI_FAIL=export

  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -ne 0 ]
  [ -z "$DIGEST_STDOUT" ]
  [[ $DIGEST_STDERR == *"pulumi stack export failed for stack staging"* ]]
}

@test "a dry run prints the read and reads nothing" {
  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE" --dry-run

  [ "$DIGEST_STATUS" -eq 0 ]
  [[ $DIGEST_STDERR == *"[dry-run] pulumi stack export --stack staging --cwd $STACK_DIR"* ]]
  [ ! -s "$FAKE_LOG" ]
  # A dry run reads no state, so it prints no digest: a line the workflow could
  # take would be an answer it did not read.
  [[ $DIGEST_STDOUT != *"digest="* ]]
}

@test "is refused when the stack settings file lacks the secrets provider" {
  rm -f "$STACK_DIR/Pulumi.staging.yaml"

  run_digest --app "$APP" --project "$PROJECT" --env staging --token-file "$TOKEN_FILE"

  [ "$DIGEST_STATUS" -ne 0 ]
  [ -z "$DIGEST_STDOUT" ]
  [[ $DIGEST_STDERR == *"Pulumi.staging.yaml does not exist"* ]]
  # Before any credential is read or any tool runs (lib.sh,
  # require_stack_settings).
  [ ! -s "$FAKE_LOG" ]
}
