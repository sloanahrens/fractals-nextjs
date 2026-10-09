#!/usr/bin/env bats
#
# The version check of the integration job (bead dv-5jrh).
#
# The integration tier's result is what the release bot reads as "this commit is
# green on staging" (docs/plans/2026-10-08-automated-release-design.md, section
# 2), so what the job has to prove is not that something answers on the URL --
# a health check does that -- but that the service is serving *the commit that
# was just deployed*. A revision that is up while the deploy is still moving
# traffic, or after a later landing superseded this one, is the state this check
# exists to catch, and it is invisible to a status code.
#
# The tests are about the three answers the script gives and what each one means
# to whoever reads the job. 0: the service reports this commit. 1: the timeout
# ran out and it reports another one -- a deploy that did not take, and the run
# is one to look at rather than to retry. 2: no usable answer at all, which is a
# different failure with a different cause (no service, no endpoint, or
# something answering that is not the version endpoint).
#
# The body is untrusted, so the tests also pin what it cannot do: it is never
# run, never converted into a "wrong commit" unless it actually looks like a
# commit, and never echoed in full -- a status of 200 with a body of any size or
# shape has to leave a bounded, single-line answer behind.

load helpers.bash

setup() {
  setup_release_env
}

# run_wait ARGS... runs the script with its two streams kept apart: WAIT_STDOUT
# is where the workflow reads observed= and attempts=, WAIT_STDERR is what the
# operator reads. Declared without `local` so the caller sees them.
run_wait() {
  WAIT_STATUS=0
  "$RELEASE_DIR/wait_version.sh" "$@" \
    >"$BATS_TEST_TMPDIR/wait.out" 2>"$BATS_TEST_TMPDIR/wait.err" ||
    WAIT_STATUS=$?
  WAIT_STDOUT=$(cat "$BATS_TEST_TMPDIR/wait.out")
  WAIT_STDERR=$(cat "$BATS_TEST_TMPDIR/wait.err")
}

# body_commit SHA makes the fake curl answer with a body reporting SHA, in the
# shape a real version endpoint uses: the commit it is running, plus the rest of
# what it reports. The body is built with printf rather than by interpolating
# into a quoted string so the JSON's own quotes are data and not shell syntax.
body_commit() {
  FAKE_HTTP_BODY=$(printf '{"commit":"%s","deployedAt":"2026-10-08T22:00:00Z"}' "$1")
  export FAKE_HTTP_BODY
}

@test "reports the commit when the service is already serving it" {
  body_commit "$DEPLOYED_SHA"

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA"

  [ "$WAIT_STATUS" -eq 0 ]
  [ "$(field "$WAIT_STDOUT" observed)" = "$DEPLOYED_SHA" ]
  [ "$(field "$WAIT_STDOUT" attempts)" = "1" ]
  # It gets the commit out of the body, from the endpoint it was pointed at, and
  # asks nothing else.
  assert_in_log "curl .*$VERSION_URL/api/version"
  [ "$(grep -c '^curl ' "$FAKE_LOG")" -eq 1 ]
}

@test "waits out the attempts while the service is not up yet" {
  # The revision is coming up: the first two attempts answer 503 -- through the
  # load balancer, with a body that is not the endpoint's -- and the commit
  # arrives on the third.
  export FAKE_HTTP_STATUSES='503 503 200'
  body_commit "$DEPLOYED_SHA"

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 10 --interval 1

  [ "$WAIT_STATUS" -eq 0 ]
  [ "$(field "$WAIT_STDOUT" attempts)" = "3" ]
  [ "$(field "$WAIT_STDOUT" observed)" = "$DEPLOYED_SHA" ]
  [ "$(grep -c '^curl ' "$FAKE_LOG")" -eq 3 ]
}

@test "polls the version path --path names, and defaults to /api/version" {
  body_commit "$DEPLOYED_SHA"

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA"
  assert_in_log "curl .*$VERSION_URL/api/version"

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --path /versionz
  [ "$WAIT_STATUS" -eq 0 ]
  assert_in_log "curl .*$VERSION_URL/versionz"
}

@test "exits 1 when the service keeps reporting another commit" {
  # A deploy that did not take, or one a later landing superseded: the service
  # answers, and the answer is a commit that is not ours.
  body_commit "$OTHER_SHA"

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 1 ]
  # The observed commit is the whole point of this exit code: the workflow
  # prints it, and it is what says whether the service is behind or ahead.
  [ "$(field "$WAIT_STDOUT" observed)" = "$OTHER_SHA" ]
  [ "$(field "$WAIT_STDOUT" attempts)" -ge 1 ]
  [[ $WAIT_STDERR == *"$OTHER_SHA"* ]]
  [[ $WAIT_STDERR == *"not $DEPLOYED_SHA"* ]]
}

@test "exits 2 when the service is unreachable" {
  export FAKE_HTTP_FAIL=1

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 2 ]
  [ -z "$(field "$WAIT_STDOUT" observed)" ]
  [[ $WAIT_STDERR == *"no usable answer"* ]]
  # It retried rather than treating the first refused connection as the answer:
  # a service that is not there yet is the normal state just after a deploy.
  [ "$(grep -c '^curl ' "$FAKE_LOG")" -ge 2 ]

  # The other shape of the same failure: curl answered, with the status it uses
  # when it got no response at all.
  unset FAKE_HTTP_FAIL
  export FAKE_HTTP_STATUS=000

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 2 ]
  [[ $WAIT_STDERR == *"status 000"* ]]
}

@test "exits 2 on a non-200, even when the body carries the commit" {
  # A 500 whose body happens to hold the commit is not the service reporting it:
  # an error page is not the version endpoint, and reading a commit out of one
  # would report a commit nothing deployed.
  export FAKE_HTTP_STATUS=500
  body_commit "$DEPLOYED_SHA"

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 2 ]
  [ -z "$(field "$WAIT_STDOUT" observed)" ]
  [[ $WAIT_STDERR == *"status 500"* ]]
}

@test "exits 2 when the body is not JSON" {
  export FAKE_HTTP_BODY='<html><body>502 Bad Gateway</body></html>'

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 2 ]
  [ -z "$(field "$WAIT_STDOUT" observed)" ]
  [[ $WAIT_STDERR == *"not JSON"* ]]
}

@test "exits 2 when the JSON carries no commit" {
  # The endpoint answered, and it does not report a commit at all -- a version
  # route that reports its own idea of "version", say. That is no answer to this
  # question, and it is not a wrong commit either.
  export FAKE_HTTP_BODY='{"version":"1.4.0","commit":{"sha":"'$DEPLOYED_SHA'"}}'

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 2 ]
  [ -z "$(field "$WAIT_STDOUT" observed)" ]
  [[ $WAIT_STDERR == *"no commit string"* ]]
}

@test "never runs what the body says" {
  # The body is text from the network. It is read as JSON and printed, never
  # evaluated, so a commit field that looks like a command is a commitment to
  # nothing: no shell, no substitution, and the job does not pass.
  export FAKE_HTTP_BODY='{"commit":"$(touch '"$BATS_TEST_TMPDIR"'/pwned)"}'

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 2 ]
  [ ! -e "$BATS_TEST_TMPDIR/pwned" ]
  [ -z "$(field "$WAIT_STDOUT" observed)" ]
  # It says what the body carried rather than swallowing it, and says it bounded
  # (COMMIT_RE did not match, so this is the excerpt path).
  [[ $WAIT_STDERR == *"not a commit"* ]]
}

@test "an oversized body is never echoed unbounded" {
  # An endpoint that answers with much more than a version endpoint should, and
  # with a commit field longer than anything a commit can be: whatever comes
  # back, the job log gets a bounded, single-line answer. The field is longer
  # than the bound on what can be printed (and so longer than a commit), so it
  # is refused as "not a commit" and never reaches an observed= line.
  local big
  big=$(printf 'a%.0s' {1..20000})
  export FAKE_HTTP_BODY="{\"commit\":\"$big\"}"

  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --timeout 1 --interval 1

  [ "$WAIT_STATUS" -eq 2 ]
  # stdout is the step line, the attempt notes and the two value lines; stderr
  # is one refusal. Twenty thousand characters of body fit in neither.
  [ "${#WAIT_STDOUT}" -lt 1000 ]
  [ "${#WAIT_STDERR}" -lt 1000 ]
  [ -z "$(field "$WAIT_STDOUT" observed)" ]
}

@test "a dry run makes no request" {
  run_wait --url "$VERSION_URL" --sha "$DEPLOYED_SHA" --dry-run

  [ "$WAIT_STATUS" -eq 0 ]
  [[ $WAIT_STDOUT == *"[dry-run] curl"* ]]
  [ ! -s "$FAKE_LOG" ]
  # A dry run asks nothing, so it reports nothing: an observed= line would be an
  # answer it never got.
  [ -z "$(field "$WAIT_STDOUT" observed)" ]
}

@test "refuses a url that is not https, or localhost" {
  body_commit "$DEPLOYED_SHA"

  # http to anything but localhost would put the handshake on the network in
  # clear text; a bare hostname is not a url at all.
  run_wait --url "http://fractals-nextjs-staging.example.com" --sha "$DEPLOYED_SHA"
  [ "$WAIT_STATUS" -ne 0 ]
  [[ $WAIT_STDERR == *"must be https"* ]]

  run_wait --url "fractals-nextjs-staging" --sha "$DEPLOYED_SHA"
  [ "$WAIT_STATUS" -ne 0 ]
  [[ $WAIT_STDERR == *"must be https"* ]]

  # A refused input asks nothing: no request reached the fake.
  [ ! -s "$FAKE_LOG" ]

  # http on localhost is what the suite itself uses.
  run_wait --url "http://localhost:8080" --sha "$DEPLOYED_SHA"
  [ "$WAIT_STATUS" -eq 0 ]
  [ "$(field "$WAIT_STDOUT" observed)" = "$DEPLOYED_SHA" ]
}

@test "refuses a sha that is not a full commit" {
  body_commit "$DEPLOYED_SHA"

  # A short sha, an upper-case one, and a branch name: the check is for the
  # commit that was deployed, and anything else is a value the service can never
  # report.
  local bad
  for bad in '0123456' '0123456789ABCDEF0123456789ABCDEF01234567' 'main'; do
    run_wait --url "$VERSION_URL" --sha "$bad"
    [ "$WAIT_STATUS" -ne 0 ]
    [[ $WAIT_STDERR == *"sha must be"* ]]
  done

  run_wait --url "$VERSION_URL"
  [ "$WAIT_STATUS" -ne 0 ]
  [[ $WAIT_STDERR == *"--sha (or GT_COMMIT_SHA) is required"* ]]
  # A refused input asks nothing and reports nothing.
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses a url that ends with a slash" {
  # The path is appended to the url, so a trailing slash would ask for
  # //api/version, which is a different path to whatever answers.
  run_wait --url "$VERSION_URL/" --sha "$DEPLOYED_SHA"

  [ "$WAIT_STATUS" -ne 0 ]
  [[ $WAIT_STDERR == *"must not end with a slash"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "reads the sha and the url from the environment the workflow sets" {
  body_commit "$DEPLOYED_SHA"

  run env GT_SERVICE_URL="$VERSION_URL" GT_COMMIT_SHA="$DEPLOYED_SHA" \
    "$RELEASE_DIR/wait_version.sh"

  [ "$status" -eq 0 ]
  [ "$(field "$output" observed)" = "$DEPLOYED_SHA" ]
}
