#!/usr/bin/env bats
#
# Every release script has to be safe to run blind: it must explain itself with
# --help, refuse what it does not understand, and be executable. These tests
# cover every command in the directory, so a new script that forgets one is
# caught here rather than during a release.
#
# lib.sh is excluded: it is sourced by the commands, not run as one.

load helpers.bash

setup() {
  setup_release_env
}

@test "every script has --help that names --dry-run" {
  local script
  while read -r script; do
    run "$script" --help
    if [[ $status -ne 0 ]]; then
      printf '%s --help exited %s:\n%s\n' "$script" "$status" "$output" >&2
      return 1
    fi
    if [[ $output != *usage:* ]]; then
      printf '%s --help printed no usage line:\n%s\n' "$script" "$output" >&2
      return 1
    fi
    if [[ $output != *--dry-run* ]]; then
      printf '%s --help does not mention --dry-run:\n%s\n' "$script" "$output" >&2
      return 1
    fi
  done < <(release_scripts)
}

# A flag parser that consumes nothing loops forever, so this test asserts that
# each script names what it did not understand and stops.
@test "an unknown flag is refused by every script" {
  local script
  while read -r script; do
    run "$script" --definitely-not-a-flag
    if [[ $status -eq 0 ]]; then
      printf '%s accepted an unknown flag:\n%s\n' "$script" "$output" >&2
      return 1
    fi
    if [[ $output != *"unknown argument"* ]]; then
      printf '%s did not explain the unknown flag:\n%s\n' "$script" "$output" >&2
      return 1
    fi
  done < <(release_scripts)
}

@test "the boolean flags are consumed rather than spun on" {
  # --init-stack and --allow-non-checkout take no value; a parser that reads
  # them without shifting loops until something kills it.
  local checkout=$BATS_TEST_TMPDIR/flag-checkout
  make_checkout "$checkout" v1.0.0

  run "$RELEASE_DIR/build_push.sh" --app "$APP" --tag v1.0.0 --source "$checkout" --allow-non-checkout --dry-run
  [ "$status" -eq 0 ]

  run "$RELEASE_DIR/up.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --init-stack --dry-run
  [ "$status" -eq 0 ]

  run "$RELEASE_DIR/preview.sh" --app "$APP" --digest "$DIGEST" --token-file "$TOKEN_FILE" --init-stack --dry-run
  [ "$status" -eq 0 ]

  run "$RELEASE_DIR/promote.sh" "$DIGEST" --app "$APP" --token-file "$TOKEN_FILE" --init-stack --dry-run
  [ "$status" -eq 0 ]
}

@test "every script is executable" {
  local script
  while read -r script; do
    if [[ ! -x $script ]]; then
      printf '%s is not executable\n' "$script" >&2
      return 1
    fi
  done < <(release_scripts)
}

@test "the directory holds the flow's scripts, the landing build, the reads the jobs make of the service, the stack and the registry, and init_stack.sh" {
  local got
  # Sorted under LC_ALL=C because the order is a character-set question, not a
  # human one. A glob expands in the shell's collation order, and build_push.sh
  # and build_push_staging.sh are the one pair in this list that the order
  # decides: '.' collates before '_' in C, and after it in a UTF-8 locale, so
  # the same directory lists build_push.sh first in the gate container (no
  # UTF-8 locale) and build_push_staging.sh first in a developer's shell. The
  # listing is a set, and naming the order takes the locale out of it (bead
  # dv-pj9; the landing gate rejected the locale-dependent spelling).
  got=$(while read -r script; do printf '%s\n' "${script##*/}"; done < <(release_scripts) | LC_ALL=C sort | tr '\n' ' ')

  [ "$got" = 'build_push.sh build_push_staging.sh digest_for_tag.sh health.sh init_stack.sh mint_token.sh preview.sh promote.sh staged_digest.sh up.sh wait_version.sh ' ]
}
