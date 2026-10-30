#!/usr/bin/env bats
#
# The functions the k8s-test, k8s-up and k8s-teardown workflows call (bead
# dv-60ph; docs/plans/jobhost-plan.md, Task 10), run against fake pulumi, gcloud,
# kubectl and make on PATH. Nothing here reaches a cloud or a cluster; what each
# test asserts is what the library asked the fakes for, and in what order.
#
# Three things the tests are about. First, the order of the destroy half: the
# workload goes first, the project's volume disks are checked while the cluster
# that could still release them exists, and only then does the cluster go; a disk
# that is left stops the cluster destroy rather than being orphaned by it. Second,
# the reaper job: its schedule is set to the cluster's expiry before it is
# resumed, never after, and it is paused only once the cluster is gone. Third,
# credentials: the token is a file everywhere, and no function prints it.

load helpers.bash

setup() {
  setup_release_env

  # The app repo's two Pulumi programs, as the library finds them. Each is a
  # directory holding the stack's committed settings, and the cluster's also the
  # project file the workload's stack reference is built from.
  K8S_CLUSTER_DIR=$BATS_TEST_TMPDIR/deploy/cluster
  K8S_WORKLOAD_DIR=$BATS_TEST_TMPDIR/deploy/k8s
  mkdir -p "$K8S_CLUSTER_DIR" "$K8S_WORKLOAD_DIR"
  local dir
  for dir in "$K8S_CLUSTER_DIR" "$K8S_WORKLOAD_DIR"; do
    {
      printf 'config:\n  gcp:project: %s\n' "$PROJECT"
      printf 'encryptedkey: %s\n' "$FAKE_PULUMI_ENCRYPTED_KEY"
      printf 'secretsprovider: %s\n' "$(secrets_provider_url)"
    } >"$dir/Pulumi.ephemeral.yaml"
  done
  printf 'name: jobhost-cluster\nruntime: go\n' >"$K8S_CLUSTER_DIR/Pulumi.yaml"
  export K8S_CLUSTER_DIR K8S_WORKLOAD_DIR

  GITHUB_OUTPUT=$BATS_TEST_TMPDIR/github-output
  : >"$GITHUB_OUTPUT"
  export GITHUB_OUTPUT

  # Two images, so the registry path carries the image name (lib.sh, image_ref).
  GT_IMAGES='api worker'
  API_REF="$IMAGE/api"
  WORKER_REF="$IMAGE/worker"
  API_DIGEST="$API_REF@sha256:$DIGEST_HEX"
  WORKER_DIGEST="$WORKER_REF@sha256:$(printf 'cd%.0s' {1..32})"
  GT_IMAGE_DIGESTS="api=$API_DIGEST worker=$WORKER_DIGEST"
  export GT_IMAGES GT_IMAGE_DIGESTS

  # Anything a function creates in a temporary directory lands here, so a test
  # can tell that it was removed.
  mkdir -p "$BATS_TEST_TMPDIR/tmp"
  export TMPDIR=$BATS_TEST_TMPDIR/tmp

  export K8S_PROOF_FILE=$BATS_TEST_TMPDIR/proof.json

  # The reaper's schedule comes from the reaperschedule binary, never from shell
  # arithmetic; the fake on PATH stands in for it.
  GT_REAPER_SCHEDULE=$FAKE_BIN/reaperschedule
  export GT_REAPER_SCHEDULE
}

# k8s FUNCTION ARGS... runs one library function the way a workflow step does:
# in bash with errexit, pipefail and nounset, after lib.sh and k8s_lib.sh.
k8s() {
  run bash -c 'set -euo pipefail; . "$RELEASE_DIR/lib.sh"; . "$RELEASE_DIR/k8s_lib.sh"; "$@"' _ "$@"
}

# output_of KEY prints the last value the functions wrote for KEY to $GITHUB_OUTPUT.
output_of() {
  sed -n "s/^$1=//p" "$GITHUB_OUTPUT" | tail -1
}

# line_of PATTERN prints the number of the first line of the fakes' log matching
# PATTERN, or fails when none does. Two of them compare to say which came first.
line_of() {
  local n
  n=$(grep -n -m1 -- "$1" "$FAKE_LOG" | cut -d: -f1)
  [[ -n $n ]] || {
    printf 'the fake tools were never asked for %q; they saw:\n%s\n' "$1" "$(cat "$FAKE_LOG")" >&2
    return 1
  }
  printf '%s' "$n"
}

# assert_before FIRST SECOND fails unless the log has FIRST on an earlier line
# than SECOND.
assert_before() {
  local a b
  a=$(line_of "$1")
  b=$(line_of "$2")
  if ((a >= b)); then
    printf '%q (line %s) was not before %q (line %s):\n%s\n' "$1" "$a" "$2" "$b" "$(cat "$FAKE_LOG")" >&2
    return 1
  fi
}

# assert_token_not_shown TEXT fails when TEXT holds the job's token or the key
# tripwire. The token is the content of $TOKEN_FILE.
assert_token_not_shown() {
  local token
  token=$(<"$TOKEN_FILE")
  if [[ $1 == *"$token"* ]]; then
    printf 'the job'"'"'s token reached:\n%s\n' "$1" >&2
    return 1
  fi
  assert_no_key_material "$1"
}

# ── k8s_resolve_images ──────────────────────────────────────────────────────

@test "k8s_resolve_images writes the digest of every image the release tag names" {
  k8s k8s_resolve_images v1.2.3

  [ "$status" -eq 0 ]
  [ "$(output_of images)" = "api=$API_REF@sha256:$FAKE_AR_DIGEST_HEX worker=$WORKER_REF@sha256:$FAKE_AR_DIGEST_HEX" ]
  # Each image was read at its own path, with the token as a file.
  assert_in_log "gcloud artifacts docker images describe $API_REF:v1.2.3 token_file=yes"
  assert_in_log "gcloud artifacts docker images describe $WORKER_REF:v1.2.3 token_file=yes"
}

@test "k8s_resolve_images refuses a name that is not a release tag" {
  k8s k8s_resolve_images latest

  [ "$status" -ne 0 ]
  [[ $output == *"release tag must look like v1.2.3"* ]]
  [ -z "$(output_of images)" ]
  refute_in_log "gcloud artifacts"
}

@test "k8s_resolve_images refuses a tag the registry does not hold, and writes nothing" {
  FAKE_AR_MISSING=v1.2.3 k8s k8s_resolve_images v1.2.3

  [ "$status" -ne 0 ]
  [[ $output == *"the tag v1.2.3 is not in $PROJECT"* ]]
  [ -z "$(output_of images)" ]
}

@test "k8s_resolve_images refuses a tag that resolves to no digest" {
  FAKE_AR_NO_DIGEST=1 k8s k8s_resolve_images v1.2.3

  [ "$status" -ne 0 ]
  [[ $output == *"with no digest"* ]]
  [ -z "$(output_of images)" ]
}

# ── k8s_cluster_up ──────────────────────────────────────────────────────────

@test "k8s_cluster_up creates the cluster, then schedules the reaper at the expiry, then resumes it" {
  k8s k8s_cluster_up

  [ "$status" -eq 0 ]
  assert_in_log "pulumi up --yes --skip-preview --stack ephemeral --cwd $K8S_CLUSTER_DIR token_env=present adc_env=present"
  # 2026-10-19t18-00-00z is minute 0, hour 18, day 19, month 10.
  assert_in_log "MUTATION gcloud scheduler jobs update http reap-$APP --location us-central1 --schedule 0 18 19 10 \* --project $PROJECT --access-token-file="
  assert_in_log "MUTATION gcloud scheduler jobs resume reap-$APP --location us-central1 --project $PROJECT --access-token-file="
  assert_before "pulumi up" "scheduler jobs update"
  assert_before "scheduler jobs update" "scheduler jobs resume"

  [ "$(output_of cluster)" = "$APP-ephemeral" ]
  [ "$(output_of expires_at)" = '2026-10-19t18-00-00z' ]
  [ "$(output_of cluster_create_s)" -ge 1 ]
}

@test "k8s_cluster_up asks reaperschedule for the schedule of the expiry it was given" {
  k8s k8s_cluster_up

  [ "$status" -eq 0 ]
  assert_in_log "reaperschedule 2026-10-19t18-00-00z"
  assert_before "reaperschedule 2026-10-19t18-00-00z" "scheduler jobs update"
}

@test "k8s_cluster_up creates no cluster when GT_REAPER_SCHEDULE names no executable" {
  GT_REAPER_SCHEDULE=$BATS_TEST_TMPDIR/missing k8s k8s_cluster_up

  [ "$status" -ne 0 ]
  [[ $output == *"GT_REAPER_SCHEDULE must name the reaperschedule binary"* ]]
  refute_in_log "pulumi up"
  refute_in_log "scheduler"
}

@test "k8s_cluster_up does not resume the reaper when reaperschedule refuses the expiry" {
  FAKE_CLUSTER_EXPIRES_AT=2026-10-21t18-00-00z k8s k8s_cluster_up

  [ "$status" -ne 0 ]
  [[ $output == *"reaperschedule refused the expiry 2026-10-21t18-00-00z"* ]]
  assert_in_log "pulumi up"
  refute_in_log "scheduler jobs update"
  refute_in_log "scheduler jobs resume"
  [ -z "$(output_of expires_at)" ]
}

@test "k8s_cluster_up arms nothing when the expiry is not a time" {
  FAKE_CLUSTER_EXPIRES_AT=tomorrow k8s k8s_cluster_up

  [ "$status" -ne 0 ]
  [[ $output == *"not a time this workflow can schedule"* ]]
  refute_in_log "reaperschedule"
  refute_in_log "scheduler"
}

@test "k8s_cluster_up arms nothing when the cluster cannot be created" {
  FAKE_PULUMI_FAIL=up k8s k8s_cluster_up

  [ "$status" -ne 0 ]
  refute_in_log "scheduler"
}

@test "k8s_cluster_up refuses a stack whose settings do not name this project's key" {
  printf 'secretsprovider: gcpkms://projects/gt-other/locations/us-central1/keyRings/pulumi/cryptoKeys/secrets\n' \
    >"$K8S_CLUSTER_DIR/Pulumi.ephemeral.yaml"

  k8s k8s_cluster_up

  [ "$status" -ne 0 ]
  [[ $output == *"names a different secrets provider"* ]]
  refute_in_log "pulumi up"
}

# ── k8s_workload_up ─────────────────────────────────────────────────────────

@test "k8s_workload_up points the stack at the cluster, pins every digest, and deploys" {
  k8s k8s_workload_up

  [ "$status" -eq 0 ]
  assert_in_log "pulumi config set target gke --stack ephemeral --cwd $K8S_WORKLOAD_DIR --plaintext"
  assert_in_log "pulumi config set clusterStack organization/jobhost-cluster/ephemeral --stack ephemeral --cwd $K8S_WORKLOAD_DIR --plaintext"
  assert_in_log "pulumi config set image.api $API_DIGEST --stack ephemeral --cwd $K8S_WORKLOAD_DIR --plaintext"
  assert_in_log "pulumi config set image.worker $WORKER_DIGEST --stack ephemeral --cwd $K8S_WORKLOAD_DIR --plaintext"
  assert_in_log "pulumi up --yes --skip-preview --stack ephemeral --cwd $K8S_WORKLOAD_DIR"
  # Every pin is made before the apply that reads it.
  assert_before "config set image.worker" "pulumi up"
  [ "$(output_of deploy_s)" -ge 1 ]
}

@test "k8s_workload_up refuses a tag where a digest belongs, before it touches the stack" {
  GT_IMAGE_DIGESTS="api=$API_REF:v1.2.3 worker=$WORKER_DIGEST" k8s k8s_workload_up

  [ "$status" -ne 0 ]
  [[ $output == *"must be an immutable digest, not a tag"* ]]
  refute_in_log "pulumi config set"
  refute_in_log "pulumi up"
}

@test "k8s_workload_up refuses another image's digest under a name" {
  GT_IMAGE_DIGESTS="api=$WORKER_DIGEST worker=$WORKER_DIGEST" k8s k8s_workload_up

  [ "$status" -ne 0 ]
  [[ $output == *"for another repository"* ]]
  refute_in_log "pulumi up"
}

@test "k8s_workload_up refuses an image GT_IMAGES does not list" {
  GT_IMAGE_DIGESTS="api=$API_DIGEST cron=$IMAGE/cron@sha256:$DIGEST_HEX" k8s k8s_workload_up

  [ "$status" -ne 0 ]
  [[ $output == *"names cron, which is not in GT_IMAGES"* ]]
  refute_in_log "pulumi up"
}

@test "k8s_workload_up refuses to run with no images" {
  GT_IMAGE_DIGESTS='' k8s k8s_workload_up

  [ "$status" -ne 0 ]
  [[ $output == *"GT_IMAGE_DIGESTS is empty"* ]]
}

# ── k8s_forward_and_test ────────────────────────────────────────────────────

@test "k8s_forward_and_test runs integration-k8s through the forward and stops the forward" {
  k8s k8s_forward_and_test

  [ "$status" -eq 0 ]
  # The app's own service, not a facility's and not the ui, on the fixed port.
  assert_in_log "kubectl -n $APP-ephemeral port-forward svc/api 18080:8081"
  assert_in_log "make integration-k8s JOBHOST_URL=http://127.0.0.1:18080 forward=up"
  # The forward was stopped, and only after the tests had run.
  assert_before "make integration-k8s" "kubectl port-forward stopped"
  [ "$(output_of test_passed)" = yes ]
  [ "$(output_of test_s)" -ge 1 ]
}

@test "k8s_forward_and_test hands kubectl the job's token in a private file and removes it" {
  k8s k8s_forward_and_test

  [ "$status" -eq 0 ]
  assert_in_log "port-forward svc/api 18080:8081 kubeconfig=present kubeconfig_mode=600 kubeconfig_token_is_the_jobs=yes"
  # Nothing of the kubeconfig's directory is left behind, and the token is in
  # neither the output nor any recorded command line.
  [ -z "$(ls -A "$TMPDIR")" ]
  assert_token_not_shown "$output"
  assert_token_not_shown "$(cat "$FAKE_LOG")"
}

@test "k8s_forward_and_test stops the forward and passes the failure on when the tests fail" {
  FAKE_MAKE_FAIL=1 k8s k8s_forward_and_test

  [ "$status" -eq 3 ]
  assert_in_log "kubectl port-forward stopped"
  [ "$(output_of test_passed)" = no ]
  # The failure path removes the kubeconfig too: nothing holding the token stays.
  [ -z "$(ls -A "$TMPDIR")" ]
}

@test "k8s_forward_and_test leaves no kubeconfig behind when it dies after writing one" {
  FAKE_FORWARD_NEVER_READY=1 K8S_FORWARD_WAIT_SECONDS=5 k8s k8s_forward_and_test

  [ "$status" -ne 0 ]
  assert_in_log "port-forward svc/api 18080:8081 kubeconfig=present kubeconfig_mode=600"
  [ -z "$(ls -A "$TMPDIR")" ]
  assert_token_not_shown "$(cat "$FAKE_LOG")"
}

@test "k8s_forward_and_test fails without running the tests when the forward never listens" {
  FAKE_FORWARD_NEVER_READY=1 K8S_FORWARD_WAIT_SECONDS=5 k8s k8s_forward_and_test

  [ "$status" -ne 0 ]
  [[ $output == *"was not accepting connections within 5s"* ]]
  refute_in_log "make integration-k8s"
  assert_in_log "kubectl port-forward stopped"
}

@test "k8s_forward_and_test forwards the service K8S_FORWARD_SERVICE names" {
  K8S_FORWARD_SERVICE=gateway K8S_FORWARD_PORT=9090 k8s k8s_forward_and_test

  [ "$status" -eq 0 ]
  assert_in_log "port-forward svc/gateway 18080:9090"
}

@test "k8s_forward_and_test fails when the namespace has no service of the app" {
  printf '{"items":[{"metadata":{"name":"temporal"},"spec":{"ports":[{"port":7233}]}}]}\n' >"$BATS_TEST_TMPDIR/services.json"

  FAKE_KUBECTL_SERVICES="$BATS_TEST_TMPDIR/services.json" k8s k8s_forward_and_test

  [ "$status" -ne 0 ]
  [[ $output == *"has no service of the app to forward"* ]]
  refute_in_log "port-forward"
}

# ── k8s_print_forwards ──────────────────────────────────────────────────────

@test "k8s_print_forwards says when the cluster goes and how to reach each service" {
  k8s k8s_print_forwards 2026-10-19t18-00-00z

  [ "$status" -eq 0 ]
  [[ $output == *"expires at 2026-10-19t18-00-00z"* ]]
  [[ $output == *"gcloud container clusters get-credentials $APP-ephemeral --location us-central1 --project $PROJECT"* ]]
  # The app, the ui, the Temporal UI and the MinIO console, on the kind ports.
  [[ $output == *"kubectl -n $APP-ephemeral port-forward svc/api 18080:8081"* ]]
  [[ $output == *"kubectl -n $APP-ephemeral port-forward svc/ui 13000:3000"* ]]
  [[ $output == *"kubectl -n $APP-ephemeral port-forward svc/temporal-ui 18233:8080"* ]]
  [[ $output == *"kubectl -n $APP-ephemeral port-forward svc/minio-console 19001:9001"* ]]
  # It forwards nothing itself and shows no credential.
  refute_in_log "port-forward"
  assert_token_not_shown "$output"
}

@test "k8s_print_forwards names only the services the namespace has" {
  printf '{"items":[{"metadata":{"name":"web"},"spec":{"ports":[{"port":8080}]}}]}\n' >"$BATS_TEST_TMPDIR/services.json"

  FAKE_KUBECTL_SERVICES="$BATS_TEST_TMPDIR/services.json" k8s k8s_print_forwards 2026-10-19t18-00-00z

  [ "$status" -eq 0 ]
  [[ $output == *"port-forward svc/web 18080:8080"* ]]
  [[ $output != *"13000"* && $output != *"18233"* && $output != *"19001"* ]]
}

# ── k8s_record ──────────────────────────────────────────────────────────────

@test "k8s_record writes the fields the phase 3 record defines" {
  K8S_EXPIRES_AT=2026-10-19t18-00-00z K8S_CLUSTER_CREATE_S=412 K8S_DEPLOY_S=96 K8S_TEST_S=118 \
    K8S_WORKLOAD_DESTROY_S=21 K8S_CLUSTER_DESTROY_S=187 K8S_POD_VCPU_H=0.21 K8S_POD_GIB_H=0.42 \
    K8S_COST_USD=0.18 K8S_PATROL_QUIET=true K8S_TTL_FIRED_DATE=2026-10-19 \
    k8s k8s_record

  [ "$status" -eq 0 ]
  local example=$RELEASE_DIR/../../proof/phase3-gke/example.json
  # The same shape as the definition's own example: every key at the top and in
  # each object, so a field renamed on either side fails here.
  [ "$(jq -S 'keys' "$K8S_PROOF_FILE")" = "$(jq -S 'keys' "$example")" ]
  for obj in timings pod_hours ttl_fired_once; do
    [ "$(jq -S ".$obj | keys" "$K8S_PROOF_FILE")" = "$(jq -S ".$obj | keys" "$example")" ]
  done

  [ "$(jq -r .app "$K8S_PROOF_FILE")" = "$APP" ]
  [ "$(jq -r .project "$K8S_PROOF_FILE")" = "$PROJECT" ]
  [ "$(jq -r .cluster "$K8S_PROOF_FILE")" = "$APP-ephemeral" ]
  [ "$(jq -r .expires_at "$K8S_PROOF_FILE")" = '2026-10-19T18:00:00Z' ]
  [ "$(jq -r .images.api "$K8S_PROOF_FILE")" = "sha256:$DIGEST_HEX" ]
  [ "$(jq -r .images.worker "$K8S_PROOF_FILE")" = "sha256:$(printf 'cd%.0s' {1..32})" ]
  [ "$(jq -r .timings.cluster_create_s "$K8S_PROOF_FILE")" = 412 ]
  [ "$(jq -r .cost_usd "$K8S_PROOF_FILE")" = 0.18 ]
  [ "$(jq -r .patrol_quiet "$K8S_PROOF_FILE")" = true ]
  [ "$(jq -r .ttl_fired_once.cluster "$K8S_PROOF_FILE")" = "$APP-ephemeral" ]
  [ "$(jq -r .disks_after "$K8S_PROOF_FILE")" = 0 ]
}

@test "k8s_record counts every disk the project still lists" {
  FAKE_DISKS_ALL='gk3-a gk3-b pvc-1' K8S_EXPIRES_AT=2026-10-19t18-00-00z k8s k8s_record

  [ "$status" -eq 0 ]
  [ "$(jq -r .disks_after "$K8S_PROOF_FILE")" = 3 ]
  # Unfiltered: the filter is for the check made while the cluster exists.
  refute_in_log "compute disks list.*--filter"
}

@test "k8s_record leaves what only a person can measure failing the record" {
  K8S_EXPIRES_AT=2026-10-19t18-00-00z k8s k8s_record

  [ "$status" -eq 0 ]
  [ "$(jq -r .cost_usd "$K8S_PROOF_FILE")" = null ]
  [ "$(jq -r .patrol_quiet "$K8S_PROOF_FILE")" = false ]
  [ "$(jq -r .ttl_fired_once.date "$K8S_PROOF_FILE")" = '' ]
  [ "$(jq -r .pod_hours.vcpu_h "$K8S_PROOF_FILE")" = 0 ]
}

@test "k8s_record refuses to run without the cluster's expiry" {
  k8s k8s_record

  [ "$status" -ne 0 ]
  [[ $output == *"K8S_EXPIRES_AT is required"* ]]
  [ ! -e "$K8S_PROOF_FILE" ]
}

# ── the destroy half ────────────────────────────────────────────────────────

@test "k8s_workload_down destroys the workload stack" {
  k8s k8s_workload_down

  [ "$status" -eq 0 ]
  assert_in_log "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_WORKLOAD_DIR"
  refute_in_log "--cwd $K8S_CLUSTER_DIR"
  [ "$(output_of workload_destroy_s)" -ge 1 ]
}

@test "k8s_assert_no_disks passes when the project lists no volume disk" {
  k8s k8s_assert_no_disks

  [ "$status" -eq 0 ]
  # This cluster's volume disks, by the driver's label and the cluster's region:
  # not a name filter, so another cluster's pvc- disks are not this one's and a
  # disk of any name is.
  assert_in_log "compute disks list --project $PROJECT --access-token-file=.* --filter=labels.goog-k8s-cluster-name=$APP-ephemeral AND (zone:us-central1 OR region:us-central1) --format=value(name)"
  refute_in_log "name~"
}

@test "k8s_assert_no_disks fails naming the disks that are left" {
  FAKE_DISKS='pvc-aaa pvc-bbb' k8s k8s_assert_no_disks

  [ "$status" -ne 0 ]
  [[ $output == *"disks are left in $PROJECT: pvc-aaa pvc-bbb"* ]]
}

@test "k8s_cluster_down checks for disks, then destroys the cluster, then pauses the reaper" {
  k8s k8s_cluster_down

  [ "$status" -eq 0 ]
  assert_in_log "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_CLUSTER_DIR"
  assert_in_log "MUTATION gcloud scheduler jobs pause reap-$APP --location us-central1 --project $PROJECT --access-token-file="
  assert_before "compute disks list" "pulumi destroy"
  assert_before "pulumi destroy" "scheduler jobs pause"
  [ "$(output_of cluster_destroy_s)" -ge 1 ]
}

@test "k8s_cluster_down releases the volumes through the cluster when a disk is left, then destroys" {
  FAKE_DISKS='pvc-aaa' FAKE_DISKS_AFTER_RELEASE='' k8s k8s_cluster_down

  [ "$status" -eq 0 ]
  assert_in_log "kubectl delete namespaces -l managed-by=pulumi --wait=false kubeconfig=present kubeconfig_mode=600"
  assert_in_log "kubectl wait --for=delete pvc --all --all-namespaces --timeout=600s"
  assert_before "compute disks list" "kubectl delete namespaces"
  assert_before "kubectl wait --for=delete pvc" "pulumi destroy"
  assert_before "pulumi destroy" "scheduler jobs pause"
  # The disk was released, so nothing is recorded as an orphan.
  [[ $output != *URGENT* ]]
  [ -z "$(output_of orphan_disks)" ]
  # And the kubeconfig the release used is gone.
  [ -z "$(ls -A "$TMPDIR")" ]
}

# A cluster that bills is worse than a disk that bills: when the release does not
# free the disk, the cluster is still destroyed and the reaper still paused, and
# the disk is named as an orphan for the record job and the patrol.
@test "k8s_cluster_down destroys the cluster and records the orphan when a disk survives the release" {
  FAKE_DISKS='pvc-aaa pvc-bbb' k8s k8s_cluster_down

  [ "$status" -eq 0 ]
  assert_in_log "kubectl delete namespaces"
  assert_in_log "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_CLUSTER_DIR"
  assert_in_log "MUTATION gcloud scheduler jobs pause reap-$APP"
  [[ $output == *"::error::URGENT: 2 volume disk(s) orphaned in $PROJECT, billing until deleted: pvc-aaa pvc-bbb"* ]]
  [ "$(output_of orphan_disks)" = 'pvc-aaa pvc-bbb' ]
  [ -z "$(ls -A "$TMPDIR")" ]
}

@test "k8s_cluster_down still destroys the cluster when the cluster cannot release the volumes" {
  FAKE_DISKS='pvc-aaa' FAKE_KUBECTL_FAIL_DELETE=1 k8s k8s_cluster_down

  [ "$status" -eq 0 ]
  [[ $output == *"the volumes could not be released through the cluster"* ]]
  assert_in_log "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_CLUSTER_DIR"
  [ "$(output_of orphan_disks)" = pvc-aaa ]
  [ -z "$(ls -A "$TMPDIR")" ]
}

@test "k8s_cluster_down destroys the cluster and flags the disks as unknown when they cannot be listed" {
  FAKE_DISKS_FAIL=1 k8s k8s_cluster_down

  [ "$status" -eq 0 ]
  [[ $output == *"::error::URGENT:"*"could not be listed"* ]]
  assert_in_log "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_CLUSTER_DIR"
}

@test "k8s_record names the orphaned disks the cluster-down job reported" {
  K8S_ORPHAN_DISKS='pvc-aaa' FAKE_DISKS_ALL='pvc-aaa' K8S_EXPIRES_AT=2026-10-19t18-00-00z k8s k8s_record

  [ "$status" -eq 0 ]
  [[ $output == *"::error::URGENT: the run left orphaned volume disk(s) in $PROJECT: pvc-aaa"* ]]
  [ "$(jq -r .disks_after "$K8S_PROOF_FILE")" = 1 ]
}

@test "k8s_cluster_down leaves the reaper armed when the destroy fails" {
  FAKE_PULUMI_FAIL=destroy k8s k8s_cluster_down

  [ "$status" -ne 0 ]
  refute_in_log "scheduler jobs pause"
}

@test "the destroy half runs workload, then the disk check, then the cluster" {
  k8s k8s_workload_down
  [ "$status" -eq 0 ]
  k8s k8s_assert_no_disks
  [ "$status" -eq 0 ]
  k8s k8s_cluster_down
  [ "$status" -eq 0 ]

  assert_before "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_WORKLOAD_DIR" "compute disks list"
  assert_before "compute disks list" "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_CLUSTER_DIR"
  assert_before "pulumi destroy --yes --skip-preview --stack ephemeral --cwd $K8S_CLUSTER_DIR" "scheduler jobs pause"
}

# ── dry runs and credentials ────────────────────────────────────────────────

@test "a dry run prints the cluster up and runs, records and reads nothing" {
  DRY_RUN=1 k8s k8s_cluster_up

  [ "$status" -eq 0 ]
  [[ $output == *"[dry-run] pulumi up --yes --skip-preview --stack ephemeral"* ]]
  [[ $output == *"[dry-run] gcloud scheduler jobs resume reap-$APP"* ]]
  # The clock was read for the timing and nothing else was asked of any tool.
  refute_in_log "pulumi"
  refute_in_log "gcloud"
  refute_in_log "kubectl"
  [ ! -s "$GITHUB_OUTPUT" ]
}

@test "no function prints the token or the key, and none puts them on a command line" {
  local fn
  for fn in k8s_cluster_up k8s_workload_up k8s_forward_and_test k8s_print_forwards k8s_workload_down k8s_assert_no_disks k8s_cluster_down; do
    k8s "$fn"
    [ "$status" -eq 0 ]
    assert_token_not_shown "$output"
  done
  K8S_EXPIRES_AT=2026-10-19t18-00-00z k8s k8s_record
  [ "$status" -eq 0 ]
  assert_token_not_shown "$output"
  k8s k8s_resolve_images v1.2.3
  [ "$status" -eq 0 ]
  assert_token_not_shown "$output"

  assert_token_not_shown "$(cat "$FAKE_LOG")"
}
