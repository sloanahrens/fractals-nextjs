#!/usr/bin/env bash
#
# The functions the k8s-test, k8s-up and k8s-teardown workflows call (docs/plan.md
# "Shared Interfaces"; docs/design/jobhost.md, section 8.1; docs/plans/jobhost-plan.md,
# Task 10). This file is sourced, after lib.sh, and never executed on its own:
#
#   . scripts/release/lib.sh
#   . scripts/release/k8s_lib.sh
#   k8s_cluster_up
#
# It is the Kubernetes counterpart of the Cloud Run scripts beside it, and it
# keeps their rules: every external command goes through run() or capture(), so
# DRY_RUN=1 prints each one instead of running it; no credential is ever put on a
# command line or printed (the minted token reaches gcloud as a file and the
# Pulumi provider through the environment, lib.sh pulumi_env); and the app's
# Pulumi programs are the app repo's, not this one's.
#
# Nine functions, in the order a run calls them:
#
#   k8s_resolve_images TAG   the digest of each image the release TAG pushed
#   k8s_cluster_up           create the ephemeral cluster, arm the reaper job
#   k8s_workload_up          deploy the app's components onto it
#   k8s_forward_and_test     forward the app's service and run integration-k8s
#   k8s_print_forwards       tell a person how to reach what k8s-up deployed
#   k8s_record               write the phase 3 proof record
#   k8s_workload_down        destroy the workload stack
#   k8s_assert_no_disks      fail when a volume's disk is left in the project
#   k8s_cluster_down         destroy the cluster, disarm the reaper job
#
# The destroy half is ordered, and the order is the point: the workload goes
# first so its volume claims release their disks, the disks are checked while the
# cluster that could still delete them exists, and only then does the cluster go.
# A persistent disk outlives a deleted cluster and bills until someone finds it
# (design, section 2), so k8s_cluster_down looks first, releases any it finds
# through the cluster, and names any that still remain as orphans.
#
# Inputs, from the workflow's env: GT_APP, GT_PROJECT, GT_BASE_KEY_FILE and
# TOKEN_FILE (the token mint_token.sh wrote), GT_IMAGES when the app releases
# more than `app`, and GT_IMAGE_DIGESTS (NAME=DIGEST pairs, the images= line
# k8s_resolve_images wrote). The two Pulumi programs are found at
# K8S_CLUSTER_DIR (default deploy/cluster) and K8S_WORKLOAD_DIR (default
# deploy/k8s), both on the stack `ephemeral`, which lives in the app's state
# bucket with the same Cloud KMS key as staging and prod.
#
# Results go to $GITHUB_OUTPUT as key=value lines (k8s_output), because Pulumi
# prints its own lines on stdout and a step cannot tell them from ours.

# lib.sh is where die, run, capture and the names live. Sourcing it here when the
# caller has not keeps this file usable on its own in a shell; sourcing it twice
# is avoided because it installs the one EXIT trap.
if ! declare -F die >/dev/null; then
  # shellcheck source=lib.sh
  . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
fi

# K8S_STACK is the one stack the cluster and the workload programs both use, and
# K8S_ENV the environment name the workload's namespace carries: <app>-ephemeral.
K8S_STACK=ephemeral

# K8S_FORWARD_LOCAL is the local port the app's service is forwarded to, the same
# one `jobhost open` uses, so an app's integration-k8s names one URL everywhere.
K8S_FORWARD_LOCAL=18080

# K8S_FORWARD_WAIT_SECONDS bounds the wait for the forward to accept connections.
K8S_FORWARD_WAIT_SECONDS=${K8S_FORWARD_WAIT_SECONDS:-60}

# The facility services the workload creates beside the app's own, which the
# search for the app's service skips (cmd/jobhost/open.go, facilityServices).
K8S_FACILITY_SERVICES='temporal temporal-ui minio minio-console postgres'

# ──────────────────────────────────────────────────────────────────────────
# Internals
# ──────────────────────────────────────────────────────────────────────────

# k8s_output KEY VALUE appends one key=value line to $GITHUB_OUTPUT. Keys are
# [a-z_]+, the shape the workflows copy into step outputs, and a dry run writes
# nothing.
k8s_output() {
  dry_run && return 0
  printf '%s=%s\n' "$1" "$2" >>"${GITHUB_OUTPUT:-/dev/null}"
}

# k8s_elapsed START prints the whole seconds since START, never less than one:
# the proof record wants a positive duration and a step that took under a second
# still took time.
k8s_elapsed() {
  local seconds=$(($(now_s) - $1))
  ((seconds >= 1)) || seconds=1
  printf '%s' "$seconds"
}

# k8s_target DIR names the stack of the Pulumi program in DIR and gives pulumi the
# credentials to open it. release_target derives the project, the registry and the
# state bucket exactly as the Cloud Run scripts do; it only knows staging and
# prod, so it is asked about staging for the names and the stack is then set to
# `ephemeral`. TOKEN_FILE is read from the environment.
k8s_target() {
  local dir=$1
  [[ -d $dir ]] || die "the Pulumi program directory does not exist: $dir (an app repo has deploy/cluster and deploy/k8s)"
  ENV_NAME=staging
  STACK_DIR=$dir
  release_target
  STACK=$K8S_STACK
  ENV_NAME=$K8S_STACK
  need "TOKEN_FILE" "${TOKEN_FILE:-}"
  require_stack_settings
  pulumi_env "$TOKEN_FILE"
}

k8s_cluster_dir() { printf '%s' "${K8S_CLUSTER_DIR:-deploy/cluster}"; }
k8s_workload_dir() { printf '%s' "${K8S_WORKLOAD_DIR:-deploy/k8s}"; }

# k8s_reaper_job prints the name of the app's Cloud Scheduler reaper job, the one
# bootstrap creates paused (internal/gcp/scheduler.go, reaperJobPrefix).
k8s_reaper_job() { printf 'reap-%s' "$APP"; }

# k8s_reaper_schedule EXPIRY prints the reaper job's cron spec for the cluster's
# expiry. EXPIRY is the gt-expires-at value pkg/cluster exports,
# 2026-10-19t18-00-00z, or the same time as RFC 3339. The spec is computed by
# cmd/reaperschedule, which asks internal/gcp.ReaperScheduleAt: the shell does
# no time arithmetic of its own, because an off-by-a-minute or off-by-a-year
# schedule deletes the cluster early or never. The binary is GT_REAPER_SCHEDULE,
# and it is required: a cluster that cannot be armed is not created.
k8s_reaper_schedule() {
  local expiry=${1:-} re='^([0-9]{4})-([0-9]{2})-([0-9]{2})[tT]([0-9]{2})[-:]([0-9]{2})[-:]([0-9]{2})[zZ]$' label
  [[ $expiry =~ $re ]] ||
    die "the cluster's expiry is not a time this workflow can schedule: '$expiry' (want 2026-10-19t18-00-00z or 2026-10-19T18:00:00Z)"
  label=$(printf '%s' "$expiry" | tr 'TZ:' 'tz-')
  "$GT_REAPER_SCHEDULE" "$label" ||
    die "reaperschedule refused the expiry $label: the reaper is not armed (see the message above)"
}

# k8s_require_reaper_schedule refuses to continue unless GT_REAPER_SCHEDULE names
# an executable. It runs before any cluster is created, so a workflow that is not
# provisioned for the reaper fails with nothing to clean up.
k8s_require_reaper_schedule() {
  dry_run && return 0
  [[ -n ${GT_REAPER_SCHEDULE:-} && -x $GT_REAPER_SCHEDULE ]] ||
    die "GT_REAPER_SCHEDULE must name the reaperschedule binary (cmd/reaperschedule): the reaper cannot be armed without it, so no cluster is created"
}

# k8s_expiry_rfc3339 LABEL prints the expiry as RFC 3339, the form the proof
# record carries.
k8s_expiry_rfc3339() {
  local label=${1:-} re='^([0-9]{4})-([0-9]{2})-([0-9]{2})[tT]([0-9]{2})[-:]([0-9]{2})[-:]([0-9]{2})[zZ]$'
  [[ $label =~ $re ]] || die "the cluster's expiry is not a time: '$label'"
  printf '%s-%s-%sT%s:%s:%sZ' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" \
    "${BASH_REMATCH[4]}" "${BASH_REMATCH[5]}" "${BASH_REMATCH[6]}"
}

# k8s_gcloud ARGS... runs gcloud as the deployer: the token reaches it as a file,
# never as a value on the command line.
k8s_gcloud() {
  run gcloud "$@" --project "$PROJECT" --access-token-file="$TOKEN_FILE"
}

# k8s_pairs prints the NAME=DIGEST pairs of GT_IMAGE_DIGESTS, one per line, after
# checking each: the name is one GT_IMAGES lists, the digest is a digest, and it
# is for that image's repository (the check require_extra_images makes). Call it
# after release_target.
k8s_pairs() {
  local -a entries
  local pair name ref list=" ${IMAGE_NAMES[*]} "
  read -ra entries <<<"${GT_IMAGE_DIGESTS:-}"
  ((${#entries[@]} > 0)) || die "GT_IMAGE_DIGESTS is empty: pass the images= line k8s_resolve_images wrote"
  for pair in "${entries[@]}"; do
    [[ $pair == *=* ]] || die "GT_IMAGE_DIGESTS takes NAME=DIGEST pairs, got: $pair"
    name=${pair%%=*}
    [[ $list == *" $name "* ]] || die "GT_IMAGE_DIGESTS names $name, which is not in GT_IMAGES (${IMAGE_NAMES[*]})"
    require_digest "${pair#*=}" "the digest of image $name"
    ref=$(image_ref "$name")
    [[ ${pair#*=} == "$ref@"* ]] ||
      die "the digest of image $name is for another repository: ${pair#*=} (expected ${ref}@sha256:...)"
    printf '%s\n' "$pair"
  done
}

# k8s_cluster_output NAME prints one output of the cluster stack. A dry run has no
# stack to read, so it prints a placeholder that is plainly one.
k8s_cluster_output() {
  if dry_run; then
    printf '<%s>' "$1"
    return 0
  fi
  pulumi stack output "$1" --stack "$STACK" --cwd "$STACK_DIR" ||
    die "the cluster stack exported no $1 output"
}

# ──────────────────────────────────────────────────────────────────────────
# Images
# ──────────────────────────────────────────────────────────────────────────

# k8s_resolve_images TAG reads, for each image in GT_IMAGES, the digest the
# registry holds under the release tag TAG, and writes images=NAME=DIGEST ... to
# $GITHUB_OUTPUT. A tag the registry cannot answer for, or answers for with
# something that is not a digest, is refused: a tag is a name that can be moved,
# and only a digest reaches the cluster (design, section 5).
#
# TAG is the release the k8s tag names (k8s-test-v1.2.3 runs the images of
# v1.2.3), already stripped of its prefix by the workflow.
k8s_resolve_images() {
  local tag=${1:-} name ref digest dir
  local image_pairs=''
  require_release_tag "$tag"
  dir=$(k8s_workload_dir)
  k8s_target "$dir"

  step "Resolving the images of $tag"
  for name in "${IMAGE_NAMES[@]}"; do
    ref=$(image_ref "$name")
    digest=$(capture gcloud artifacts docker images describe "$ref:$tag" \
      --format='value(image_summary.digest)' --access-token-file="$TOKEN_FILE") ||
      die "the registry could not be read for $ref:$tag: the tag $tag is not in $PROJECT, or the deployer account cannot read it"
    if dry_run; then
      note "would resolve $ref:$tag (nothing is read in a dry run)"
      continue
    fi
    digest=${digest//[[:space:]]/}
    [[ -n $digest ]] || die "the registry answered for $ref:$tag with no digest, so the tag names no image of $name"
    [[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] ||
      die "the registry answered for $ref:$tag with something that is not a digest: '$digest'"
    note "$name: $ref@$digest"
    image_pairs="${image_pairs:+$image_pairs }$name=$ref@$digest"
  done
  k8s_output images "$image_pairs"
}

# ──────────────────────────────────────────────────────────────────────────
# The cluster
# ──────────────────────────────────────────────────────────────────────────

# k8s_cluster_up creates the ephemeral cluster with `pulumi up` on the cluster
# stack, then arms the third time-to-live layer: the reaper's Cloud Scheduler job
# gets the cluster's expiry as its schedule and is resumed. The schedule is set
# first, so the job is never resumed on the placeholder bootstrap gave it (a
# job resumed with its schedule unset would delete the cluster at the next
# quarter hour; bead dv-1c28).
#
# The job is armed after the cluster exists because the expiry is a stack output.
# A `pulumi up` that fails half-way leaves a cluster the job does not yet cover;
# the cluster-down job still runs (if: always()), and so does the local reap.
k8s_cluster_up() {
  local start expires cron job
  k8s_target "$(k8s_cluster_dir)"
  k8s_require_reaper_schedule
  start=$(now_s)

  step "Creating the ephemeral cluster (stack $STACK)"
  run pulumi up --yes --skip-preview --stack "$STACK" --cwd "$STACK_DIR"

  expires=$(k8s_cluster_output expiresAt)
  job=$(k8s_reaper_job)
  if dry_run; then
    cron='<expiry as a cron time>'
  else
    cron=$(k8s_reaper_schedule "$expires")
  fi

  step "Arming the reaper job $job for the cluster's expiry ($expires)"
  k8s_gcloud scheduler jobs update http "$job" --location "$REGION" --schedule "$cron"
  k8s_gcloud scheduler jobs resume "$job" --location "$REGION"

  k8s_output cluster "$APP-ephemeral"
  k8s_output expires_at "$expires"
  k8s_output cluster_create_s "$(k8s_elapsed "$start")"
}

# k8s_cluster_down destroys the cluster stack, then pauses the reaper job. It
# starts by looking for volume disks: a cluster deleted with a disk behind it
# leaves the disk billing with nothing to find it by, so a disk found is released
# through the cluster first (k8s_release_volumes), whatever job calls this.
#
# A disk still there after that does not stop the destroy. The cluster bills more
# than a disk, and an abort would leave both billing; the disk is recorded as an
# orphan instead (k8s_orphans, and k8s_record in the record job) with an URGENT
# line, and the patrol's orphan_resource finding covers it.
#
# The job is paused only after the destroy succeeded. A destroy that fails leaves
# the reaper armed for the cluster's expiry, which is the point of the layer.
k8s_cluster_down() {
  local start job disks
  k8s_target "$(k8s_cluster_dir)"
  start=$(now_s)

  # A disk left here is released through the cluster, which is the only thing
  # that still can. If one remains after that it is recorded as an orphan and the
  # cluster is destroyed anyway: it bills far more than a disk does, and
  # aborting would leave both.
  step "Checking $PROJECT lists no volume disk of $APP-ephemeral"
  if ! disks=$(k8s_disks_left); then
    k8s_orphans "unknown (the disks of $PROJECT could not be listed)"
    disks=''
  elif [[ -n $disks ]]; then
    warn "disks remain: $disks"
    k8s_release_volumes
    if ! disks=$(k8s_disks_left); then
      k8s_orphans "unknown (the disks of $PROJECT could not be listed)"
      disks=''
    fi
  fi
  if [[ -n $disks ]]; then
    k8s_orphans "$disks"
  elif [[ -z ${K8S_ORPHAN_DISKS:-} ]]; then
    note "no volume disk"
  fi

  step "Destroying the ephemeral cluster (stack $STACK)"
  run pulumi destroy --yes --skip-preview --stack "$STACK" --cwd "$STACK_DIR"

  job=$(k8s_reaper_job)
  step "Pausing the reaper job $job"
  k8s_gcloud scheduler jobs pause "$job" --location "$REGION"

  k8s_output cluster_destroy_s "$(k8s_elapsed "$start")"
  [[ -n ${K8S_ORPHAN_DISKS:-} ]] || k8s_output orphan_disks ''
}

# ──────────────────────────────────────────────────────────────────────────
# The workload
# ──────────────────────────────────────────────────────────────────────────

# k8s_workload_up deploys the app's components onto the cluster: the workload
# stack is told its target is gke, which cluster stack to read the endpoint from
# (a stack reference), and each image's digest, then `pulumi up` runs. The
# program reads `target`, `clusterStack` and `image.<name>` from its stack
# config; that is the contract with the app repo (workflows/README.md).
k8s_workload_up() {
  local start pair pairs name cluster_project
  k8s_target "$(k8s_workload_dir)"
  start=$(now_s)

  cluster_project=$(sed -n 's/^name:[[:space:]]*//p' "$(k8s_cluster_dir)/Pulumi.yaml" 2>/dev/null | head -1)
  [[ $cluster_project =~ ^[A-Za-z0-9_.-]+$ ]] ||
    die "$(k8s_cluster_dir)/Pulumi.yaml names no project, so the workload cannot reference the cluster stack"

  # Every pair is checked before pulumi is given anything: a stack half
  # configured with a bad digest is worse than one not touched. The check is a
  # command substitution, so a refusal ends that subshell and `|| exit 1` ends
  # this step.
  pairs=$(k8s_pairs) || exit 1

  step "Deploying the workload onto the cluster (stack $STACK)"
  run pulumi config set target gke --stack "$STACK" --cwd "$STACK_DIR" --plaintext
  run pulumi config set clusterStack "organization/$cluster_project/$K8S_STACK" --stack "$STACK" --cwd "$STACK_DIR" --plaintext
  while IFS= read -r pair; do
    name=${pair%%=*}
    set_image_config "$name" "${pair#*=}"
  done <<<"$pairs"
  run pulumi up --yes --skip-preview --stack "$STACK" --cwd "$STACK_DIR"

  k8s_output deploy_s "$(k8s_elapsed "$start")"
}

# k8s_workload_down destroys the workload stack, which releases the volume claims
# and with them the disks. It does not check for disks itself: the job that calls
# it asserts that next, and k8s_cluster_down asserts it again.
k8s_workload_down() {
  local start
  k8s_target "$(k8s_workload_dir)"
  start=$(now_s)

  step "Destroying the workload (stack $STACK)"
  run pulumi destroy --yes --skip-preview --stack "$STACK" --cwd "$STACK_DIR"

  k8s_output workload_destroy_s "$(k8s_elapsed "$start")"
}

# ──────────────────────────────────────────────────────────────────────────
# Disks
# ──────────────────────────────────────────────────────────────────────────

# k8s_volume_disk_filter prints the gcloud filter for the disks this app's cluster's
# volumes leave: GKE's persistent disk driver labels every volume disk
# goog-k8s-cluster-name=<cluster>, and the filter adds the cluster's region
# (cluster names are unique per location, not per project). It is not a filter on
# the disks' names (name~^pvc-, which this replaced) because that listed every
# pvc- disk of the project, so another cluster's volumes blocked this cluster, and
# missed a disk the driver named any other way. The label is not on the nodes'
# boot disks, so the list is empty once the claims are gone while the nodes still
# exist. cmd/jobhost's reaper asks the same question (reap.go, diskFilterFor).
k8s_volume_disk_filter() {
  printf 'labels.goog-k8s-cluster-name=%s-ephemeral AND (zone:%s OR region:%s)' "$APP" "$REGION" "$REGION"
}

# k8s_disks_list [all] prints the names of the project's disks, one per line: the
# cluster's volume disks by default, every disk with `all`. Needs release_target
# and TOKEN_FILE; a dry run prints the command and no names.
k8s_disks_list() {
  local scope=${1:-volumes}
  if [[ $scope == all ]]; then
    capture gcloud compute disks list --project "$PROJECT" --access-token-file="$TOKEN_FILE" --format='value(name)'
  else
    capture gcloud compute disks list --project "$PROJECT" --access-token-file="$TOKEN_FILE" \
      --filter="$(k8s_volume_disk_filter)" --format='value(name)'
  fi
}

# k8s_disks_left prints the volume disks the cluster's volumes left, on one line
# separated by spaces (empty when there are none). It fails only when the list
# could not be read.
k8s_disks_left() {
  local disks
  disks=$(k8s_disks_list) || return 1
  disks=${disks//[[:space:]]/ }
  disks=${disks# }
  printf '%s' "${disks% }"
}

# k8s_assert_no_disks_here is the assertion with the target already set. The
# workload-down job calls it (through k8s_assert_no_disks) to fail at the step
# that should have released the disk; k8s_cluster_down does not fail on a disk,
# it releases and then records one (k8s_release_volumes).
k8s_assert_no_disks_here() {
  local disks
  step "Checking $PROJECT lists no volume disk of $APP-ephemeral"
  disks=$(k8s_disks_left) || die "could not list the disks of $PROJECT"
  [[ -z $disks ]] ||
    die "disks are left in $PROJECT: $disks (a disk outlives its cluster and bills until deleted; k8s_cluster_down releases them through the cluster before it goes)"
  note "no volume disk"
}

# k8s_release_volumes runs when disks remain after the workload is gone: it takes
# the namespaces the job host created (managed-by=pulumi, the label pkg/jobhost
# puts on every one) down through the cluster, waits for their volume claims to go,
# and leaves the caller to look again. It is best effort and never fails the
# caller: if the cluster cannot be reached the disks stay where they are and the
# caller records them.
k8s_release_volumes() {
  step "Releasing the volumes through the cluster: namespaces, then claims"
  # A subshell, because k8s_kubeconfig dies when the cluster stack has no
  # outputs to read, and that must not end k8s_cluster_down before the destroy.
  # The subshell's own EXIT trap removes the kubeconfig on every way out of it.
  (
    trap k8s_kubeconfig_cleanup EXIT
    k8s_kubeconfig
    # && and not set -e: a subshell on the left of || has errexit off.
    run kubectl delete namespaces -l managed-by=pulumi --wait=false &&
      run kubectl wait --for=delete pvc --all --all-namespaces --timeout=600s
  ) || warn "the volumes could not be released through the cluster"
  return 0
}

# k8s_orphans DISKS records volume disks that outlive the cluster: an ::error::
# annotation and an URGENT line on the job's log, the disk names as the step
# output orphan_disks (the record job reads them, k8s_record), and
# K8S_ORPHAN_DISKS for the rest of this process. The patrol's orphan_resource
# finding is the other half; this line names the disks the run left.
k8s_orphans() {
  K8S_ORPHAN_DISKS=$1
  printf '::error::URGENT: %s volume disk(s) orphaned in %s, billing until deleted: %s\n' \
    "$(wc -w <<<"$1" | tr -d ' ')" "$PROJECT" "$1"
  k8s_output orphan_disks "$1"
}

# k8s_assert_no_disks fails when the project still lists a disk a volume left.
# The workload-down job runs it right after the destroy, so the failure names the
# step that should have released the disk.
k8s_assert_no_disks() {
  k8s_target "$(k8s_workload_dir)"
  k8s_assert_no_disks_here
}

# ──────────────────────────────────────────────────────────────────────────
# The test
# ──────────────────────────────────────────────────────────────────────────

# k8s_kubeconfig writes a kubeconfig for the cluster from the cluster stack's
# outputs and points KUBECONFIG at it. The user is the job's own token, read from
# its file into a private mode-600 file in a private directory, removed when the
# step ends (the same handling as the ADC file in lib.sh): the token is on no
# command line, and a gke-gcloud-auth-plugin is not needed on the runner. The token
# is in that file because kubectl has to read it from somewhere, and an exec
# credential plugin would need the plugin on the runner; the file is the smaller
# exposure: nobody but the job's own user can read it, it lives for the step, and
# k8s_kubeconfig_cleanup removes it on every exit path (on_exit), die included.
K8S_KUBE_DIR=''
k8s_kubeconfig() {
  local endpoint ca name
  endpoint=$(k8s_cluster_output endpoint)
  ca=$(k8s_cluster_output caCert)
  name=$(k8s_cluster_output name)
  if dry_run; then
    note "would write a kubeconfig for $name from the cluster stack's outputs"
    return 0
  fi

  K8S_KUBE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/gt-kube-${APP}.XXXXXX") ||
    die "could not create a private directory for the kubeconfig"
  chmod 700 "$K8S_KUBE_DIR"
  (umask 077 && jq -n --arg server "https://$endpoint" --arg ca "$ca" --arg name "$name" \
    --rawfile token "$TOKEN_FILE" \
    '{apiVersion:"v1", kind:"Config", "current-context":$name,
      clusters:[{name:$name, cluster:{server:$server, "certificate-authority-data":$ca}}],
      users:[{name:$name, user:{token:($token|rtrimstr("\n"))}}],
      contexts:[{name:$name, context:{cluster:$name, user:$name}}]}' \
    >"$K8S_KUBE_DIR/config" 2>/dev/null) || die "jq could not build the kubeconfig"
  chmod 600 "$K8S_KUBE_DIR/config"
  export KUBECONFIG="$K8S_KUBE_DIR/config"
  on_exit k8s_kubeconfig_cleanup
}

k8s_kubeconfig_cleanup() {
  [[ -n $K8S_KUBE_DIR ]] || return 0
  rm -rf "$K8S_KUBE_DIR"
  K8S_KUBE_DIR=''
}

# k8s_app_service prints the name and the first port of the app's own Service in
# NAMESPACE: the first one that is not a facility's, and the ui only when it is
# the only one (cmd/jobhost/open.go makes the same choice for the kind cluster).
# K8S_FORWARD_SERVICE and K8S_FORWARD_PORT name them outright.
k8s_app_service() {
  local namespace=$1 json
  if [[ -n ${K8S_FORWARD_SERVICE:-} && -n ${K8S_FORWARD_PORT:-} ]]; then
    printf '%s %s\n' "$K8S_FORWARD_SERVICE" "$K8S_FORWARD_PORT"
    return 0
  fi
  json=$(capture kubectl -n "$namespace" get services -o json) || die "could not read the services of $namespace"
  printf '%s' "$json" | jq -r --arg facilities "$K8S_FACILITY_SERVICES" '
    ($facilities | split(" ")) as $skip
    | [.items[] | select(.spec.ports | length > 0)
        | {name: .metadata.name, port: .spec.ports[0].port}
        | select(.name as $n | $skip | index($n) | not)] as $own
    | (($own | map(select(.name != "ui")) | first) // ($own | first))
    | select(. != null) | "\(.name) \(.port)"' ||
    die "could not read the services of $namespace"
}

# k8s_forward_and_test forwards the app's Service to a fixed local port with
# `kubectl port-forward` in the background, waits for it to accept connections,
# runs the app's `make integration-k8s` against it, and stops the forward. The
# forward's pid is kept and killed whether the tests passed or not, and the exit
# status of the tests is the function's. The test's result and its seconds go to
# the step outputs.
k8s_forward_and_test() {
  local start namespace service port found log pid='' ready=no deadline status=0
  k8s_target "$(k8s_cluster_dir)"
  k8s_kubeconfig
  namespace="$APP-$K8S_STACK"
  start=$(now_s)

  if dry_run; then
    note "would forward the app's service in $namespace to 127.0.0.1:$K8S_FORWARD_LOCAL and run make integration-k8s"
    run make integration-k8s "JOBHOST_URL=http://127.0.0.1:$K8S_FORWARD_LOCAL"
    return 0
  fi

  found=$(k8s_app_service "$namespace") || exit 1
  read -r service port <<<"$found"
  [[ -n ${service:-} && -n ${port:-} ]] || die "$namespace has no service of the app to forward"

  step "Forwarding svc/$service of $namespace to 127.0.0.1:$K8S_FORWARD_LOCAL"
  log=$(mktemp "${TMPDIR:-/tmp}/gt-forward-${APP}.XXXXXX") || die "could not create the forward's log"
  # The one command here that does not go through run(): it has to run in the
  # background to be stoppable, so its pid is kept and killed below. lib.sh
  # makes the same exception for the build (docker_build_bounded).
  kubectl -n "$namespace" port-forward "svc/$service" "$K8S_FORWARD_LOCAL:$port" >"$log" 2>&1 &
  pid=$!

  deadline=$(($(now_s) + K8S_FORWARD_WAIT_SECONDS))
  while ((deadline > $(now_s))); do
    if grep -q "Forwarding from 127.0.0.1:$K8S_FORWARD_LOCAL" "$log" 2>/dev/null; then
      ready=yes
      break
    fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done

  if [[ $ready == yes ]]; then
    step "Running make integration-k8s"
    run make integration-k8s "JOBHOST_URL=http://127.0.0.1:$K8S_FORWARD_LOCAL" || status=$?
  else
    print_last_lines "$log" 20
    warn "the forward to svc/$service was not accepting connections within ${K8S_FORWARD_WAIT_SECONDS}s"
    status=1
  fi

  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -f "$log"

  k8s_output test_s "$(k8s_elapsed "$start")"
  k8s_output test_passed "$([[ $status -eq 0 ]] && echo yes || echo no)"
  return "$status"
}

# k8s_print_forwards EXPIRES_AT prints, for a person, how to reach what k8s-up
# deployed: when the cluster goes away, the gcloud command that fetches
# credentials for it, and one kubectl port-forward per service on the ports
# `jobhost open` uses on the kind cluster (the app 18080, the ui 13000, the
# Temporal UI 18233, the MinIO console 19001). The services are the ones the
# namespace holds, so an app without Temporal is not told about a Temporal UI.
k8s_print_forwards() {
  local expires=${1:-unknown} name namespace json lines local_port service port
  k8s_target "$(k8s_cluster_dir)"
  k8s_kubeconfig
  name=$(k8s_cluster_output name)
  namespace="$APP-$K8S_STACK"

  step "Reaching $name"
  printf 'The cluster %s expires at %s and is deleted then if nothing else has.\n' "$name" "$expires"
  printf 'Tag k8s-teardown-vX.Y.Z to take it down sooner.\n\n'
  printf 'Credentials:\n  gcloud container clusters get-credentials %s --location %s --project %s\n\n' "$name" "$REGION" "$PROJECT"
  if dry_run; then
    note "would list the services of $namespace and print a port-forward for each"
    return 0
  fi

  json=$(capture kubectl -n "$namespace" get services -o json) || die "could not read the services of $namespace"
  lines=$(printf '%s' "$json" | jq -r --arg facilities "$K8S_FACILITY_SERVICES" '
    ($facilities | split(" ")) as $skip
    | [.items[] | select(.spec.ports | length > 0) | {name: .metadata.name, port: .spec.ports[0].port}] as $all
    | [$all[] | select(.name as $n | $skip | index($n) | not)] as $own
    | (([$own[] | select(.name != "ui")] | first) // ($own | first)) as $app
    | ( (if $app then [{local: 18080, s: $app}] else [] end)
      + [$own[] | select(.name == "ui" and ($app.name != "ui")) | {local: 13000, s: .}]
      + [$all[] | select(.name == "temporal-ui") | {local: 18233, s: .}]
      + [$all[] | select(.name == "minio-console") | {local: 19001, s: .}] )
    | .[] | "\(.local) \(.s.name) \(.s.port)"') || die "could not read the services of $namespace"
  [[ -n $lines ]] || die "$namespace has no service to forward"

  printf 'Forwards:\n'
  while read -r local_port service port; do
    printf '  kubectl -n %s port-forward svc/%s %s:%s\n' "$namespace" "$service" "$local_port" "$port"
  done <<<"$lines"
}

# ──────────────────────────────────────────────────────────────────────────
# The record
# ──────────────────────────────────────────────────────────────────────────

# k8s_record writes the phase 3 proof record to K8S_PROOF_FILE (default
# proof.json), in the shape proof/phase3-gke/schema.json defines. It runs after
# the cluster is gone, because the record carries what was left behind: the
# project's disks, counted over every disk now that the nodes' boot disks are
# gone with the cluster.
#
# The workflow measures what a workflow can: the images, the expiry, the five
# timings, the disks. Four things it cannot measure are read from the
# environment when a person has them, and are left failing the record's checks
# when not, so a record nobody completed does not pass as one that was:
#
#   K8S_POD_VCPU_H, K8S_POD_GIB_H   pod usage, from the cluster's metrics
#   K8S_COST_USD                    the run's cost, from billing
#   K8S_PATROL_QUIET                true when the patrol reported nothing
#   K8S_TTL_FIRED_DATE              YYYY-MM-DD of the one deliberate firing
#
# K8S_ORPHAN_DISKS, the cluster-down job's orphan_disks output, names the volume
# disks the destroy left behind; the record counts them in disks_after and says so.
#
# The timings arrive as K8S_CLUSTER_CREATE_S, K8S_DEPLOY_S, K8S_TEST_S,
# K8S_WORKLOAD_DESTROY_S and K8S_CLUSTER_DESTROY_S (the step outputs the other
# functions wrote), and the expiry as K8S_EXPIRES_AT.
k8s_record() {
  local out=${K8S_PROOF_FILE:-proof.json} images_json disks count expires cluster
  k8s_target "$(k8s_workload_dir)"
  need "K8S_EXPIRES_AT" "${K8S_EXPIRES_AT:-}"
  expires=$(k8s_expiry_rfc3339 "$K8S_EXPIRES_AT")
  cluster="$APP-ephemeral"

  step "Counting the disks left in $PROJECT"
  disks=$(k8s_disks_list all) || die "could not list the disks of $PROJECT"
  count=$(printf '%s\n' "$disks" | grep -c . || true)
  # The orphans k8s_cluster_down named. They are in the count above (disks_after
  # fails the record's check while any is left); this line is the URGENT one the
  # record job's log carries for whoever reads the run.
  if [[ -n ${K8S_ORPHAN_DISKS:-} ]]; then
    printf '::error::URGENT: the run left orphaned volume disk(s) in %s: %s\n' "$PROJECT" "$K8S_ORPHAN_DISKS"
  fi

  images_json=$(k8s_pairs | jq -R -s 'split("\n") | map(select(length > 0))
    | map(split("=") | {key: .[0], value: (.[1] | sub("^.*@"; ""))}) | from_entries') ||
    die "could not read GT_IMAGE_DIGESTS into the record"

  if dry_run; then
    note "would write the phase 3 record to $out"
    return 0
  fi

  jq -n \
    --arg app "$APP" --arg project "$PROJECT" --arg cluster "$cluster" --arg expires "$expires" \
    --argjson images "$images_json" \
    --argjson create "${K8S_CLUSTER_CREATE_S:-0}" --argjson deploy "${K8S_DEPLOY_S:-0}" \
    --argjson test "${K8S_TEST_S:-0}" --argjson wdestroy "${K8S_WORKLOAD_DESTROY_S:-0}" \
    --argjson cdestroy "${K8S_CLUSTER_DESTROY_S:-0}" \
    --argjson vcpu "${K8S_POD_VCPU_H:-0}" --argjson gib "${K8S_POD_GIB_H:-0}" \
    --argjson cost "${K8S_COST_USD:-null}" --argjson quiet "${K8S_PATROL_QUIET:-false}" \
    --arg fired "${K8S_TTL_FIRED_DATE:-}" --argjson disks "$count" \
    --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{app:$app, project:$project, cluster:$cluster, expires_at:$expires, images:$images,
      timings:{cluster_create_s:$create, deploy_s:$deploy, test_s:$test,
               workload_destroy_s:$wdestroy, cluster_destroy_s:$cdestroy},
      pod_hours:{vcpu_h:$vcpu, gib_h:$gib}, cost_usd:$cost, disks_after:$disks,
      patrol_quiet:$quiet, ttl_fired_once:{date:$fired, cluster:$cluster}, recorded_at:$now}' \
    >"$out" || die "could not write the proof record to $out"
  note "wrote $out"
}
