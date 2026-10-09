#!/usr/bin/env bats
#
# What a release does when it applies a digest, and the deploy time it records
# (beads dv-bte and dv-iuqp): up.sh and promote.sh compare the digest they are
# about to apply with the image the live stack runs, read out of `pulumi stack
# export` -- the same read staged_digest.sh makes (staged_digest.bats).
#
# When the two differ the release writes the stack's `deployedAt` config and
# applies the digest, so a deployed app can show a truthful "deployed <time>"
# (dv-bte). When they are equal it applies nothing at all, and writes no
# deployedAt either (dv-iuqp). dv-bte's point is that a timestamp is a claim: an
# apply that changes nothing creates no new Cloud Run revision, so it must not
# stamp a new deployment on the app. dv-iuqp is the other half of it: the only
# way a release keeps that promise is by not applying, because the deployedAt it
# would write lives in this job's stack config alone (dv-yf4) -- so the apply
# renders a container spec with no DEPLOYED_AT in it, which differs from the
# revision Cloud Run runs, creates exactly the revision dv-bte exists to
# prevent, and drops the deploy time the app was showing.
#
# The other half is where the value comes from: the script's own clock, never an
# argument or an environment variable. `date` is on the fake PATH with the rest
# of the tools (helpers.bash), so FAKE_DATE_BAD=1 is a clock that answers with
# something that is not a timestamp, and a release that cannot say when it
# deployed must not deploy.

load helpers.bash

setup() {
  setup_release_env
}

# set_export writes a stack export from stdin into the bats temporary directory
# and points the pulumi fake at it, so a test can hand the scripts the states
# the comparison has to answer for: a stack that has applied nothing, or a state
# it must refuse rather than guess about.
set_export() {
  cat >"$BATS_TEST_TMPDIR/export.json"
  export FAKE_PULUMI_EXPORT_FILE=$BATS_TEST_TMPDIR/export.json
}

# deployed_at_lines STACK prints the fake-log lines where STACK's deployedAt was
# set, in the order they happened.
deployed_at_lines() {
  local stack=${1:-staging}
  grep "config set deployedAt .*--stack $stack --cwd $STACK_DIR --plaintext" "$FAKE_LOG" || true
}

# assert_deployed_at_set [STACK] asserts exactly one deployedAt was set on STACK
# (staging by default), that its value is an RFC 3339 UTC timestamp, and that it
# was set before the apply -- which is what "before the apply" in the bead means
# and what makes the value the deploy's own time rather than a later guess.
assert_deployed_at_set() {
  local stack=${1:-staging} lines value set_line up_line
  lines=$(deployed_at_lines "$stack")

  if [[ -z $lines ]]; then
    printf 'no deployedAt was set on stack %s; the fake tools saw:\n%s\n' "$stack" "$(cat "$FAKE_LOG")" >&2
    return 1
  fi
  if [[ $(printf '%s\n' "$lines" | wc -l | tr -d ' ') -ne 1 ]]; then
    printf 'deployedAt was set on stack %s more than once:\n%s\n' "$stack" "$lines" >&2
    return 1
  fi

  value=$(sed -n 's/^pulumi config set deployedAt \([^ ]*\) .*/\1/p' <<<"$lines")
  if [[ ! $value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    printf 'deployedAt was set to %q, which is not an RFC 3339 UTC timestamp\n' "$value" >&2
    return 1
  fi

  set_line=$(grep -n "config set deployedAt .*--stack $stack " "$FAKE_LOG" | head -1 | cut -d: -f1)
  up_line=$(grep -n "^pulumi up " "$FAKE_LOG" | head -1 | cut -d: -f1)
  if [[ -z $up_line ]] || ((set_line >= up_line)); then
    printf 'deployedAt was not set before the apply; the fake tools saw:\n%s\n' "$(cat "$FAKE_LOG")" >&2
    return 1
  fi
}

@test "up sets deployedAt when the digest changes the image the stack runs" {
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  # The comparison really happened: it read the stack's state, not just its
  # config, and it asked for the staging stack.
  assert_in_log "pulumi stack export --stack staging --cwd $STACK_DIR token_env=present"
  # The export is state, and secrets in it are read in their encrypted form or
  # not at all: --show-secrets would put every secret of the stack one jq
  # mistake away from the job log (staged_digest.bats pins the same thing for
  # the read the prod job makes).
  refute_in_log 'show-secrets'
  assert_deployed_at_set staging
}

@test "up applies nothing when the stack already runs the digest" {
  # The fake's built-in export records $DIGEST, which is what up.sh is applying:
  # there is no image to change and so no deployment to make. The release skips
  # the apply, which is the one way to be sure it creates no new revision: an
  # apply here would render the container spec this job's config can produce,
  # which has no deployedAt in it -- the key does not survive from job to job
  # (dv-yf4) -- and Cloud Run would create a revision for the difference, taking
  # the app's deploy time with it (bead dv-iuqp).
  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  # Without this the test would pass for a script that never looked at all.
  assert_in_log "pulumi stack export --stack staging --cwd $STACK_DIR"
  [[ $output == *"nothing to apply: the staging stack already runs $DIGEST"* ]]
  # No apply reached the fake, so no new revision was made; and no deploy time
  # was written, because this release is not a deployment.
  refute_in_log '^pulumi up '
  refute_in_log 'config set deployedAt'
  # The digest is still pinned and the URL still printed: the stack's config
  # goes on naming the image it runs, and health.sh has a service to check.
  assert_in_log "pulumi config set imageDigest $DIGEST --stack staging --cwd $STACK_DIR --plaintext"
  [[ $output == *"url=$FAKE_SERVICE_URL"* ]]
}

@test "up sets deployedAt on a first apply, when the stack has applied no service" {
  set_export <<JSON
{"version":3,"deployment":{"resources":[
  {"type":"pulumi:pulumi:Stack","outputs":{"url":"https://example.invalid"}}
]}}
JSON

  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  assert_deployed_at_set staging
}

@test "up refuses a clock that is not an RFC 3339 UTC timestamp" {
  export FAKE_DATE_BAD=1
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"not an RFC 3339 UTC timestamp"* ]]
  [[ $output == *"a moment ago"* ]]
  # Nothing was written and nothing was applied: a release that cannot say when
  # it deployed does not deploy.
  refute_in_log 'config set deployedAt'
  refute_in_log '^pulumi up '
}

@test "up refuses a failed export without applying" {
  # A read that cannot answer must stop the release rather than be treated as
  # "nothing is running": an empty answer there would set a deploy time for an
  # apply whose image was never compared.
  export FAKE_PULUMI_FAIL=export

  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"pulumi stack export failed for stack staging"* ]]
  refute_in_log 'config set deployedAt'
  refute_in_log '^pulumi up '
}

@test "up refuses a stack whose export holds two Cloud Run services" {
  set_export <<JSON
{"version":3,"deployment":{"resources":[
  {"type":"gcp:cloudrunv2/service:Service","outputs":{"template":{"containers":[{"image":"$DIGEST"}]}}},
  {"type":"gcp:cloudrunv2/service:Service","outputs":{"template":{"containers":[{"image":"$PREVIOUS_DIGEST"}]}}}
]}}
JSON

  run "$RELEASE_DIR/up.sh" --app "$APP" --project "$PROJECT" --digest "$DIGEST" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"holds 2 resources of type gcp:cloudrunv2/service:Service"* ]]
  refute_in_log 'config set deployedAt'
  refute_in_log '^pulumi up '
}

@test "promote sets deployedAt when the digest changes the image prod runs" {
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

  run "$RELEASE_DIR/promote.sh" "$DIGEST" --app "$APP" --project "$PROJECT" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  assert_in_log "pulumi stack export --stack prod --cwd $STACK_DIR"
  assert_deployed_at_set prod
}

@test "promote applies nothing when prod already runs the digest" {
  # A promotion of the digest prod already runs: no image changes, so nothing is
  # promoted and nothing is applied (bead dv-iuqp; the same reasoning as up's).
  run "$RELEASE_DIR/promote.sh" "$DIGEST" --app "$APP" --project "$PROJECT" --token-file "$TOKEN_FILE"

  [ "$status" -eq 0 ]
  assert_in_log "pulumi stack export --stack prod --cwd $STACK_DIR"
  [[ $output == *"nothing to apply: the prod stack already runs $DIGEST"* ]]
  refute_in_log '^pulumi up '
  refute_in_log 'config set deployedAt'
  [[ $output == *"url=$FAKE_SERVICE_URL"* ]]
}

@test "promote refuses a clock that is not an RFC 3339 UTC timestamp" {
  export FAKE_DATE_BAD=1
  export FAKE_PULUMI_EXPORT_IMAGE="$PREVIOUS_DIGEST"

  run "$RELEASE_DIR/promote.sh" "$DIGEST" --app "$APP" --project "$PROJECT" --token-file "$TOKEN_FILE"

  [ "$status" -ne 0 ]
  [[ $output == *"not an RFC 3339 UTC timestamp"* ]]
  refute_in_log 'config set deployedAt'
  refute_in_log '^pulumi up '
}

@test "a dry run reads no state and plans both halves of the decision" {
  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --dry-run
  [ "$status" -eq 0 ]
  [[ $output == *"would set deployedAt"* ]]
  [[ $output == *"only, if the image the staging stack runs differs"* ]]
  [[ $output == *"[dry-run] pulumi up --yes --skip-preview"* ]]

  run "$RELEASE_DIR/promote.sh" "$DIGEST" --app "$APP" --token-file "$TOKEN_FILE" --dry-run
  [ "$status" -eq 0 ]
  [[ $output == *"would set deployedAt"* ]]
  [[ $output == *"only, if the image the prod stack runs differs"* ]]
  [[ $output == *"[dry-run] pulumi up --yes --skip-preview"* ]]

  # A dry run reads nothing, so it cannot know which branch a real run would
  # take: it prints the deploy time and the apply that branch would make, and
  # reaches no tool at all.
  [ ! -s "$FAKE_LOG" ]
}
