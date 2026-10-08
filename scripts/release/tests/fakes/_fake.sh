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
