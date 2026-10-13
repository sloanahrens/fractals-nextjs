#!/usr/bin/env bats
#
# Resolving a released tag to the digest it names, for the `up` flow (bead
# dv-35th).
#
# The read exists so that `up` (workflows/up.yml) can redeploy an image a past
# release already built, without rebuilding it: the release's identity is the
# digest (docs/design.md, section 6), and after a teardown the only thing that
# still names that image is the registry tag `vX.Y.Z`. So the script turns the
# name into the digest once, and only the digest travels on to up.sh and
# promote.sh.
#
# Two things the tests are about. First, the tag is refused rather than passed
# on when the registry cannot answer for it -- not there, or answering with no
# digest -- because a tag that reaches up.sh is a name that can be moved, and
# an empty value is one promote.sh skips its comparison for. stdout is what the
# workflow appends to $GITHUB_OUTPUT, so a refusal has to leave it empty and
# say what is wrong on stderr. Second, the read is made with the credential the
# rest of the flow uses, and the token reaches gcloud as a *file*: a value on a
# command line is one a process listing shows.
#
# Each test's streams are read apart, which is why the helper below is not `run`
# on its own: bats merges stderr into $output, and "stdout is empty" is one of
# the acceptance items.

load helpers.bash

setup() {
  setup_release_env
}

# run_resolve ARGS... runs the script with its two streams kept apart.
# RESOLVE_STATUS is its exit status, RESOLVE_STDOUT exactly what the workflow
# reads into $GITHUB_OUTPUT, and RESOLVE_STDERR what an operator reads. Declared
# without `local` so the caller sees them.
run_resolve() {
  RESOLVE_STATUS=0
  "$RELEASE_DIR/digest_for_tag.sh" "$@" \
    >"$BATS_TEST_TMPDIR/resolve.out" 2>"$BATS_TEST_TMPDIR/resolve.err" ||
    RESOLVE_STATUS=$?
  RESOLVE_STDOUT=$(cat "$BATS_TEST_TMPDIR/resolve.out")
  RESOLVE_STDERR=$(cat "$BATS_TEST_TMPDIR/resolve.err")
}

@test "prints the digest the released tag names, as one line" {
  run_resolve --app "$APP" --tag v1.2.3 --token-file "$TOKEN_FILE"

  [ "$RESOLVE_STATUS" -eq 0 ]
  # stdout is one line, exactly the line the workflow appends to $GITHUB_OUTPUT:
  # the registry answers with a digest body and the script composes the registry
  # path this app's images live in, so what comes out is the immutable
  # <registry>@sha256:<64hex> the rest of the flow takes.
  [ "$RESOLVE_STDOUT" = "digest=$DIGEST" ]
  # And it is the digest the *registry* answered with, not one the script
  # invented: FAKE_AR_DIGEST_HEX is the body the fake gcloud prints.
  [ "$RESOLVE_STDOUT" = "digest=$IMAGE@sha256:$FAKE_AR_DIGEST_HEX" ]

  # The read named the image and the tag, and handed gcloud the token as a file
  # path -- not the token itself, and not the key.
  assert_in_log "gcloud artifacts docker images describe $IMAGE:v1.2.3 token_file=yes"
  assert_no_key_material "$(cat "$FAKE_LOG")"
  assert_no_token_value "$(cat "$FAKE_LOG")"
  assert_no_key_material "$RESOLVE_STDOUT$RESOLVE_STDERR"
  assert_no_token_value "$RESOLVE_STDOUT$RESOLVE_STDERR"
}

@test "resolves the tag it is given, not a fixed one" {
  run_resolve --app "$APP" --tag v9.9.9 --token-file "$TOKEN_FILE"

  [ "$RESOLVE_STATUS" -eq 0 ]
  [ "$RESOLVE_STDOUT" = "digest=$DIGEST" ]
  assert_in_log "gcloud artifacts docker images describe $IMAGE:v9.9.9"
  # Written without the leading dashes: grep reads a pattern that starts with
  # one as an option, fails, and a test that reads that failure as "the log does
  # not hold it" passes for the wrong reason (helpers.bash, refute_in_log).
  refute_in_log "describe $IMAGE:v1.2.3"
}

@test "refuses a tag the registry does not hold, naming the tag" {
  export FAKE_AR_MISSING=v1.2.3

  run_resolve --app "$APP" --tag v1.2.3 --token-file "$TOKEN_FILE"

  [ "$RESOLVE_STATUS" -ne 0 ]
  # Nothing on stdout: an empty $GITHUB_OUTPUT is a value the workflow's next
  # step refuses, while a line here would be a digest the script never read.
  [ -z "$RESOLVE_STDOUT" ]
  [[ $RESOLVE_STDERR == *"could not be read"* ]]
  [[ $RESOLVE_STDERR == *"$IMAGE:v1.2.3"* ]]
  [[ $RESOLVE_STDERR == *"the tag v1.2.3"* ]]
}

@test "refuses a tag that resolves to no digest" {
  export FAKE_AR_NO_DIGEST=1

  run_resolve --app "$APP" --tag v1.2.3 --token-file "$TOKEN_FILE"

  [ "$RESOLVE_STATUS" -ne 0 ]
  [ -z "$RESOLVE_STDOUT" ]
  [[ $RESOLVE_STDERR == *"no digest at all"* ]]
  [[ $RESOLVE_STDERR == *"the tag v1.2.3"* ]]
}

@test "refuses an answer that is not a digest" {
  export FAKE_AR_DIGEST_HEX="$IMAGE:v1.2.3"

  run_resolve --app "$APP" --tag v1.2.3 --token-file "$TOKEN_FILE"

  [ "$RESOLVE_STATUS" -ne 0 ]
  [ -z "$RESOLVE_STDOUT" ]
  [[ $RESOLVE_STDERR == *"not a digest"* ]]
  [[ $RESOLVE_STDERR == *"$IMAGE:v1.2.3"* ]]
}

@test "refuses a tag that is not a release tag, before it reads anything" {
  run_resolve --app "$APP" --tag up-v1.2.3 --token-file "$TOKEN_FILE"

  [ "$RESOLVE_STATUS" -ne 0 ]
  [ -z "$RESOLVE_STDOUT" ]
  [[ $RESOLVE_STDERR == *"release tag must look like v1.2.3"* ]]
  # Before any credential is read or any tool runs: the message is about the
  # input, and a read nothing needed is a call that could fail for its own
  # reason (lib.sh, require_release_tag).
  [ ! -s "$FAKE_LOG" ]
}

@test "refuses a missing token file, and reads nothing first" {
  run_resolve --app "$APP" --tag v1.2.3 --token-file "$BATS_TEST_TMPDIR/absent.token"

  [ "$RESOLVE_STATUS" -ne 0 ]
  [ -z "$RESOLVE_STDOUT" ]
  [[ $RESOLVE_STDERR == *"token file does not exist"* ]]
  [ ! -s "$FAKE_LOG" ]
}

@test "a dry run prints the read and reads nothing" {
  run_resolve --app "$APP" --tag v1.2.3 --token-file "$TOKEN_FILE" --dry-run

  [ "$RESOLVE_STATUS" -eq 0 ]
  [[ $RESOLVE_STDERR == *"[dry-run] gcloud artifacts docker images describe $IMAGE:v1.2.3"* ]]
  [ ! -s "$FAKE_LOG" ]
  # A dry run reads no registry, so it prints no digest: a line the workflow
  # could take would be an answer it did not read.
  [[ $RESOLVE_STDOUT != *"digest="* ]]
}
