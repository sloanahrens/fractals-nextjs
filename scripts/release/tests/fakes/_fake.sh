#!/usr/bin/env bash
#
# Shared plumbing for the fake docker, gcloud, pulumi and curl on the test
# PATH (docs/plan.md, bead B5.2: "bats tests use fake docker, gcloud and pulumi
# on PATH"). Sourced by each fake; not a command itself.
#
# Two rules every fake follows, because the tests use them to prove things
# about the real scripts:
#
#   1. Log every invocation, verbatim, to $FAKE_LOG. A test asserts on what the
#      script asked for, not on what it printed.
#   2. Never read, print or log key or token *material*. Fakes record whether a
#      credential arrived (through the environment, from stdin) and never its
#      value, so a test can tell "the script passed the secret on a command
#      line" from "the script passed it safely" — and a leaked value shows up as
#      a leaked value in the log.

# fake_log records one invocation. Callers pass the words they want recorded,
# never a credential value.
fake_log() { printf '%s\n' "$*" >>"${FAKE_LOG:-/dev/null}"; }

# fake_state returns the path of the fake cloud's small state file: the
# revision that is serving and the revision the last deploy created.
fake_state_file() { printf '%s' "${FAKE_STATE:-$(dirname "${FAKE_LOG:-/tmp/fake.log}")/fake-state}"; }

# fake_state_set NAME VALUE writes one field of the fake cloud's state.
fake_state_set() {
  local file
  file=$(fake_state_file)
  mkdir -p "$(dirname "$file")"
  touch "$file"
  # Replace the field if it is there, append it if it is not.
  if grep -q "^$1=" "$file"; then
    sed -i.bak "s|^$1=.*|$1=$2|" "$file"
    rm -f "$file.bak"
  else
    printf '%s=%s\n' "$1" "$2" >>"$file"
  fi
}

# fake_state_get NAME prints one field of the fake cloud's state, or nothing.
fake_state_get() {
  local file
  file=$(fake_state_file)
  [[ -f $file ]] || return 0
  sed -n "s|^$1=||p" "$file" | head -1
}

# fake_state_is_mutating MARKER... records a call that would change the cloud.
# The tests assert on the absence of a MUTATION line, which is only meaningful
# because the fakes do record them (see the control test in health.bats).
fake_mutation() { fake_log "MUTATION $*"; }

# fake_stdin_bytes counts what arrived on stdin without logging it. It exists so
# a fake can prove a secret came through stdin ("token on stdin, 32 bytes")
# rather than on a command line.
fake_stdin_bytes() { wc -c | tr -d ' '; }

# The fake clock. The scripts that poll (health.sh, wait_version.sh) decide when
# to stop from the time they read, so a test that lets real time pass makes its
# result depend on how fast the machine is. Instead a test runs on a clock it
# owns: FAKE_CLOCK_FILE holds the current time in whole seconds since the epoch,
# the fake date answers `date +%s` from it, the fake sleep advances it by the
# time it was asked to wait (and waits not at all), and the fake curl advances
# it by FAKE_CURL_SECONDS, the time a request took. Every count of attempts and
# every elapsed time a script reports is then arithmetic, the same on a slow
# machine as on a fast one.
#
# fake_clock_now prints the fake time. fake_clock_advance SECONDS moves it on.
fake_clock_now() { cat "${FAKE_CLOCK_FILE:?FAKE_CLOCK_FILE is not set}"; }
fake_clock_advance() {
  local now
  now=$(fake_clock_now)
  printf '%s\n' $((now + $1)) >"$FAKE_CLOCK_FILE"
}
