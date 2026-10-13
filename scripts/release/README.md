# Release scripts

The scripts the deploy runner executes for steps 2 to 7 of the release flow in
`docs/design.md`, section 6, plus `init_stack.sh`: the one-time stack creation an
app needs before its first release, which no workflow runs. They are written for
a Forgejo job running as `gt-cloud` (bead B5.4) and are wired together by
`workflows/deploy.yml` (bead B5.3).

| Script | Step | What it does |
|---|---|---|
| `build_push.sh` | 2 | Builds the app's Dockerfile at the release tag, pushes it, prints `<registry>@sha256:<64hex>` |
| `build_push_staging.sh` | — | The landing build: builds the commit main is at, pushes it as `<image>:main-<12 hex of the commit>`, prints the digest |
| `mint_token.sh` | 3 | Mints a one-hour token for the app's deployer SA from the base key |
| `preview.sh` | 4 | Pins the digest in the stack config and writes the `pulumi preview` diff the release is read from |
| `up.sh` | 5 | Applies the previewed digest and records the deploy time, or applies nothing when the stack already runs it; prints the service URL |
| `health.sh` | 5 | Polls the declared health path on that URL; fails the job if it never answers |
| `wait_version.sh` | integration | Polls the app's version endpoint until it reports the commit that was just deployed; exits 1 on another commit, 2 on no usable answer |
| `promote.sh` | 6 | Deploys the staging digest to prod and records the deploy time, or applies nothing when prod already runs it; refuses anything that is not a digest |
| `staged_digest.sh` | 6 | Reads the image a stack is running out of `pulumi stack export`, which is what prod checks its promotion against |
| `digest_for_tag.sh` | up | Resolves a released tag to the digest it names in Artifact Registry, for the `up` flow (`workflows/up.yml`) |
| `init_stack.sh` | — | Creates an app's stack for one environment, with the project's `gcpkms` secrets provider; idempotent |
| `lib.sh` | — | The names and rules every script shares; sourced, never run |

`build_push_staging.sh` is `build_push.sh`'s sibling on the other half of the
model. Staging is deployed on every landing as well as on every release
(`workflows/staging.yml`): a change someone lands can be watched where it landed
instead of waiting for the next release. It builds the same app the same way and
publishes it under a name derived from the commit it built —
`<image>:main-<first 12 hex characters of HEAD>` — then prints the digest the
registry hands back, which is what the staging job applies. Between the two, the
only difference in what is affected is the name the image goes out under, and
here that name cannot be moved: a landing is published under a name only its own
commit can have.

Three refusals are the whole of what keeps a landing build from publishing
something nobody landed: a tree that is not clean, a ref that looks like a
release tag, and a HEAD that is not on main. The last one matters most, and it is
why this script has no `--allow-non-checkout`, which `build_push.sh` does have:
`main` only ever moves through the gated landing worker (the ci gate and `om`
review), so a commit that is on main is one that passed that gate, and a worker's
own branch — the one commit a landing run must never publish — is not. The check
is ancestry and not equality, so a queued run whose main has moved on is still
buildable; the workflow is what skips that run, and it skips it before the
checkout (`workflows/README.md`). It reads `origin/main` out of the checkout it
is given, with plain `git` and no fetch, so the check needs no network beyond the
checkout itself.

`--allow-non-checkout` waives `build_push.sh`'s tag check and nothing more. Both
builds hand the commit they built to `docker` (below), and a directory that is
not a git checkout has no commit to read, so it is refused before the build: a
rehearsal that waives the tag check still needs a checkout of it.

`init_stack.sh` is the one script of the flow that no release runs; it is run
once per environment, by hand, before the first one (`workflows/README.md`, "The
first release"). It prints `stack=` and `created=yes|no`, and it exits 0 whether
it created the stack or found it already there. Under `--dry-run` it prints
`created=unknown`, which is the honest answer: a dry run does not read the
backend, so it cannot know. `up.sh --init-stack` creates a stack the same way
(same `--secrets-provider`), so a release that has to create its own stack gets
one encrypted like every other.

When it creates a stack, `init_stack.sh` also prints the two lines Pulumi has
just written into the stack's settings file — `secretsprovider` and
`encryptedkey` — between `settings-begin <env>` and `settings-end <env>`
markers. **Those two lines are committed state.** `pulumi stack init
--secrets-provider gcpkms://...` records them in `<stack-dir>/Pulumi.<env>.yaml`,
the app repo commits that file, and `preview.sh`, `up.sh` and `promote.sh`
refuse a stack whose committed copy does not name the target project's own
provider — before any Pulumi call, so the refusal needs no credentials and a
`--dry-run` reaches it too. A checkout without the lines falls back to Pulumi's
passphrase provider, and every command in the flow then fails with `passphrase
must be set with PULUMI_CONFIG_PASSPHRASE`. That is what the first release's
rehearsal of 2026-10-08 hit, running `init_stack.sh` in a throwaway checkout:
the lines went with the checkout instead of into the file. So print them, and
commit them. The refusal names the file it read; the fix is always to run
`init_stack.sh` for the app and env and commit the block it prints.

`staged_digest.sh` is the read the prod job makes before it promotes. It is
a separate script because the digest has to come from the stack's *state* and
not its config: the staging job pins the released digest with
`pulumi config set imageDigest`, which writes `Pulumi.<stack>.yaml` in that
job's own checkout — a workspace no other job shares, and one nothing commits —
so the first real release (fractals-nextjs, 2026-10-08) failed in prod with
`configuration key 'imageDigest' not found for stack 'staging'`. State lives in
the backend every job of a release can read, and the Cloud Run service the stack
applied records the image it is running at
`.outputs.template.containers[0].image` in the JSON `pulumi stack export`
prints. The script prints `digest=` for that one image, selected by resource
type because an export holds every resource the program created and more than
one of them carries an `image` key, and refuses a stack whose export holds no
service, more than one, or an image that is a tag: an empty or tag-shaped read
would leave `promote.sh` with nothing to compare against. It never reads the
export with `--show-secrets`.

`digest_for_tag.sh` is the read the `up` flow makes of the registry (bead
dv-35th). A release's identity is a digest, and after a teardown the only thing
still naming the image a release pushed is the registry tag `vX.Y.Z`, so the
`up` workflow has to turn that name back into a digest — and it has to do it
once, at the start, because a tag is a name that can be moved: what reaches
`up.sh` and `promote.sh` is the immutable `<registry>@sha256:<64hex>` this
script prints, never the tag. It reads with the credential the rest of the flow
uses, the one-hour token `mint_token.sh` wrote, handed to
`gcloud artifacts docker images describe` as a *file* (`--access-token-file`),
so the token is on no command line and in no log. A tag the repository does not
hold, or one that resolves to no digest at all, is a refusal that names the tag
and leaves stdout empty — an empty value is one `promote.sh` would skip its
comparison for. It deploys nothing and changes nothing.

## The commit an image carries

Both builds hand the commit they built to `docker build` as `--build-arg
GIT_SHA=<40 hex commit>`: the tag's own commit for `build_push.sh`, and HEAD for
`build_push_staging.sh` — the same commit the landing image is named
`main-<12 hex>` after. The image therefore carries the identity of the commit it
was built from, and the service it becomes can report it: the integration tier
reads `/api/version` and fails when it does not name the commit just built
(`~/gt/docs/plans/2026-10-08-automated-release-design.md`, section 2). The value
is checked against `^[0-9a-f]{40}$` before it reaches `docker`, so a build that
cannot read a commit stops with that message instead of publishing an image
whose identity no service could confirm.

**An app repo has to declare it to receive it.** A build-arg reaches the image
only through the Dockerfile that consumes it, so the app's Dockerfile declares
`ARG GIT_SHA` (and passes it on to the serving process, e.g. `ENV GIT_SHA`). An
app whose Dockerfile declares nothing of the sort still builds: docker warns
that a build-arg was not consumed and builds the image without it, which is why
this half of the contract is the app repo's (bead `fr-k1c` for fractals,
`bv-ptr` for beaver).

The run summary (step 7) is the workflow's job: it records the tag, commit and
digest from the outputs below.

`wait_version.sh` is the check the integration job of `staging.yml` runs
(`docs/plans/2026-10-08-automated-release-design.md`, section 2). It polls the
app's version endpoint on the deployed service URL until the commit it reports
is the one the job deployed. Its three exit codes are the three answers a job
log has to tell apart: 0 the service reports the deployed commit, 1 the timeout
ran out while it reports another one — a deploy that did not take, or a landing
that superseded this one — and 2 no usable answer at all. It is `health.sh`'s
sibling, and it exists for the same reason health.sh does: the integration
result is what the release bot reads as "this commit is green on staging", and a
health check cannot say which commit is serving.

What it will not do is take a body's word for anything. Only a 200 counts,
because a 4xx or 5xx from a service still coming up is something to retry and
its body is an error page; the body is read as JSON by `jq` and never
evaluated; and only a value that looks like a commit (`^[0-9a-f]{7,64}$`) is
reported as a different commit, so an error page or a proxy's HTML is "no
answer" rather than a wrong commit. Both the body and the value are bounded
before either can reach a line (64 KiB of body is read, 80 characters of the
value can be printed), and control characters are dropped, so a service
answering with something huge or malformed cannot put it in the job log. The URL
must be `https`, or `http` on localhost, which is where the tests point it: this
check deploys nothing and holds no credential, and that is what lets the
integration job run against a service the deploy job has just changed.

## Interfaces

Every script takes flags and falls back to `GT_*` environment variables, so a
workflow can pass whatever is convenient. `--help` prints the full list.

| Output on stdout | From | Used by |
|---|---|---|
| `image=`, `tag=`, `digest=` | `build_push.sh` | the job outputs, and every later step |
| `image=`, `tag=` (`main-<12 hex>`), `digest=` | `build_push_staging.sh` | the staging job's outputs in `workflows/staging.yml` |
| `token_file=`, `deployer_sa=` | `mint_token.sh` | `preview.sh`, `up.sh`, `promote.sh` |
| `preview_file=`, `stack=` | `preview.sh` | the run record's preview attachment |
| `stack=`, `created=` | `init_stack.sh` | the operator creating the stacks for a first release |
| the `settings-begin`/`settings-end` block | `init_stack.sh` | the operator, who commits it into `Pulumi.<env>.yaml` |
| `url=` | `up.sh`, `promote.sh` | `health.sh` |
| `digest=` (the image the stack is running) | `staged_digest.sh` | the prod job's `--staging-digest` check |
| `digest=` (the image a released tag names) | `digest_for_tag.sh` | `workflows/up.yml`'s `up.sh` and `promote.sh` steps |
| `observed=`, `attempts=` | `wait_version.sh` | the integration job's own result, and the run record |

Names are derived from `--app`, `--env`, `--project` and `--region` in one place
(`release_target` in `lib.sh`), and they follow what bootstrap creates:
`<region>-docker.pkg.dev/<project>/apps/<app>` for the image,
`gs://<project>-pulumi-state` for the state backend, `<env>` for the Pulumi
stack, `gcpkms://projects/<project>/locations/<region>/keyRings/pulumi/cryptoKeys/secrets`
for the stacks' secrets provider (the key ring and key `internal/gcp/kms.go`
creates), and `deployer-<app>@<project>.iam.gserviceaccount.com` for the account
`mint_token.sh` impersonates. The stack is the bare environment name because
the app's Pulumi project is the name its manifest states as `pulumiProject`
(`fractals` for the app named `fractals-nextjs`), so its state lands at
`.pulumi/stacks/<pulumiProject>/<env>.json` -- the path the patrol reads an
app's state under (cmd/patrol's `readState`, beads dv-iou and dv-4fu).

A release writes at most two values into a stack's config, and the rest of the
app's `Spec` (`name`, `env`, `project`, `region`, `port`, `healthPath`) stays
with the app repo, in `Pulumi.<env>.yaml`, which is what the app's Pulumi
program reads (`examples/app/main.go`).

- `imageDigest` is the released image, pinned by `preview.sh` before its preview
  and again by `up.sh`/`promote.sh` before their apply.
- `deployedAt` is when the apply happened, written only by the script that
  applies: `up.sh` for staging, `promote.sh` for prod. The app's own Pulumi
  program reads it and passes it to the container as its `DEPLOYED_AT`
  environment variable, which is how a page can say truthfully when it was
  deployed. `preview.sh` does not write it — a preview applies nothing, so the
  preview diff does not show the key — and nothing else in this flow reads it.

Both are written by the release that changes what a stack runs. The script
compares the digest it was given with the image the live stack currently runs,
read out of `pulumi stack export` (the same read `staged_digest.sh` makes from
the state backend, bead dv-yf4). A first apply, where the stack holds no service
yet, is a change. When the two differ the release writes `deployedAt` and
applies the digest. When they are equal it applies nothing at all. The digest is
the release's identity, so a stack that already runs it has nothing for the
release to do; and applying anyway would render a container spec that differs
from the running revision — the job's config is its own, so it holds no
`deployedAt` for the app program to render (dv-yf4) — which creates the new
revision `dv-bte` exists to prevent and drops the deploy time the app was
showing (bead `dv-iuqp`). A release that changes nothing therefore leaves the
running revision, and the time it carries, exactly as they are.

`deployedAt` is the script's own reading of the clock in RFC 3339 UTC —
`2026-10-09T00:14:07Z` — and never an argument the caller passes or an
environment variable it sets: the time a release reports has to be the time the
release ran. The format is checked before it is set, so a clock that answers
with anything else stops the release instead of deploying without a time to
report.

## Credentials

Pulumi is given two credentials, because two different callers ask for them.

The **GCP provider** reads one: the one-hour token `mint_token.sh` minted, which
`lib.sh`'s `pulumi_env` puts in `GOOGLE_OAUTH_ACCESS_TOKEN` — in the environment
of the `pulumi` process, never in its argv.

**Pulumi itself** reads the other. `pulumi login gs://<project>-pulumi-state` and
the stacks' `gcpkms` secrets provider go through Application Default
Credentials, and Google defines ADC as the `GOOGLE_APPLICATION_CREDENTIALS`
file, the gcloud application-default file or the metadata server — an access
token in an environment variable is none of those. So `pulumi_env` also calls
`adc_credentials`, which writes the file Go's ADC loader accepts for an
impersonated account (`impersonated_service_account`): its `source_credentials`
is the base key, and its `service_account_impersonation_url` mints from exactly
the account `deployer_sa` names. `jq` builds it from the key at
`GT_BASE_KEY_FILE` — jq is given the key's *path*, never its contents on a
command line — with `umask 077` inside a `mktemp -d` directory, so it is mode
600 from creation, and the library's exit cleanup removes the file and its
directory whatever the script's exit status.

Two consequences worth stating plainly. A job's authority is the deployer
account for as long as the job runs, because the client libraries refresh the
impersonated token themselves; it is not widened by this, since the URL names
one account and the base key's single `serviceAccountTokenCreator` binding on
that account is still what authorizes the mint (`docs/design.md`, section 5).
And `jq` has to be on the runner: it reads the key's `type` — a key that is not a
service account is refused, because Go's ADC loader would not accept the file
built from one — and it builds the file. The deploy image installs it
(`ops/deploy-image`).

## What the scripts will not do

- **Never a tag where a digest belongs.** `preview.sh`, `up.sh` and
  `promote.sh` refuse `app:latest` and every other tag-shaped input; the digest
  `build_push.sh` printed is the release identity from step 2 onwards.
- **Never an image without the commit it was built from.** Both builds pass
  their commit as `--build-arg GIT_SHA`, and refuse anything that is not a full
  40 hex commit before `docker` runs, so a service asked what it is running
  answers with a commit that can be found in the repository.
- **Never a rebuild for prod.** `promote.sh` deploys the digest it is given, and
  refuses one that differs from `--staging-digest`. Prod gets the image staging
  proved, and `staged_digest.sh` reads that digest out of the stack's own state
  rather than out of a config file only the job that wrote it has.
- **Never a deploy time for a deployment that did not happen.** `up.sh` and
  `promote.sh` write `deployedAt` only when the release changes the image the
  stack runs, by comparing the digest they were given with the image the live
  stack runs (`pulumi stack export`, the read `staged_digest.sh` makes). A
  release whose digest the stack already runs applies nothing and writes nothing:
  no new revision is created, and the deploy time the running revision carries
  stays on the app (bead `dv-iuqp`). A first apply sets it. The value is the
  script's own clock, and a clock that does not answer with an RFC 3339 UTC
  timestamp stops the release rather than being written (`lib.sh`,
  `apply_digest`).
- **Never a commit that did not land.** `build_push_staging.sh` refuses a HEAD
  that is not on main, and a ref that looks like a release tag, so the landing
  path publishes what the gate let onto main and nothing else. It is also the one
  script with no `--allow-non-checkout`: on this path the git checks are not a
  convenience on top of the build, they are the check, so a source directory
  without a checkout is refused rather than waived.
- **Never a digest read out of a job's workspace.** `staged_digest.sh` reads the
  image a stack is running out of `pulumi stack export`, from the state backend,
  not with `pulumi config get imageDigest` — a stack's config is `pulumi config
  set`'s file in the checkout that ran it, and a fresh checkout has no such key
  (bead dv-yf4).
- **Never a stack without its committed settings.** `preview.sh`, `up.sh` and
  `promote.sh` refuse a `Pulumi.<env>.yaml` with no `secretsprovider` line, or
  one that names another project's key or the passphrase default, before any
  Pulumi call and before any credential is read (`lib.sh`,
  `require_stack_settings`). A stack whose settings are not in the repo is a
  stack no fresh checkout can open.
- **Never a secret on a command line.** The base key reaches gcloud through
  `CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE` (a path, not key material), the
  minted token reaches the Pulumi provider through `GOOGLE_OAUTH_ACCESS_TOKEN`,
  and `docker login` reads its password from stdin. No script prints key
  material or a token.
- **Never a credential outside a mode-600 file it removes.** Pulumi's ADC file
  holds the base key, so it lives 600 in a private directory and the library's
  exit cleanup removes it however the script ends — success, refusal or failure.
  `--dry-run` builds none: `preview.sh`, `up.sh`, `promote.sh` and
  `init_stack.sh` print their plan without reading the key or the token.
- **Never a mutation in `health.sh`.** It only curls. That is what makes "a
  failed health check leaves the environment as it was, with no automatic
  rollback" true rather than aspirational. `wait_version.sh` is the same kind of
  script: it reads the version endpoint and writes nothing but its own output.
- **Never a body's word for a commit.** `wait_version.sh` counts only a 200,
  reads the body as JSON and never evaluates it, and reports `observed=` only
  for a value shaped like a commit — so an error page, a proxy's HTML or
  anything else answering on that URL is exit 2, "no answer", rather than a
  commit the service is not running. A commit-shaped value that is not the
  expected one is exit 1, and the excerpt the refusal quotes is the evidence for
  whoever reads the job.
- **Nothing is installed.** No script writes outside the working directory
  except `mint_token.sh`'s token file, `build_push.sh`'s optional
  `--digest-file`, and the ADC file `lib.sh` writes into a private temporary
  directory and removes at exit.

Every script has `--dry-run`, which prints each action (including the exact
`pulumi`, `docker` and `gcloud` invocation) and runs none of them. `--dry-run`
still validates its inputs: a dry run of a release refuses exactly what a real
run would.

## Tests

`tests/` holds a bats suite with fake `docker`, `gcloud`, `pulumi`, `curl` and
`date` on `PATH` (see `tests/fakes/`). Nothing in it touches a cloud, a registry or the
network, and every file it writes is inside the bats temporary directory.

```sh
make scripts-test              # shellcheck scripts/release/*.sh && bats scripts/release/tests
bats scripts/release/tests     # the suite on its own
go test ./scripts/release/     # the same suite when bats is on PATH, plus bash -n and shellcheck
GT_BATS=/path/to/bats make test   # run the suite through the Go test without adding bats to PATH
```

`go test` skips the bats suite (with a message) when bats is not installed, so
the rig's gate does not depend on a test-only tool being present. `make
scripts-test` is the target that insists on it. **bats is not installed on this
host yet**: until it is, the suite runs only where a bats binary is available,
which is why `GT_BATS` exists.

## Reading the suite

Each acceptance item of bead B5.2 has a test named after it:

- `promote.bats`: "promote refuses a tag" and "promote accepts a digest in a dry
  run".
- `secrets.bats`: "no script prints the contents of the key file", which runs
  every script with a key file containing a marker string and asserts the marker
  reaches no output, no log and no command line.
- `health.bats`: "a failed health check leaves the previous revision as the only
  serving one", with a control test that shows the fake records a traffic shift
  when one is attempted, so the assertion is not vacuous.

Bead dv-dw4, the credentials Pulumi's own calls need, is the rest:

- `secrets.bats`: "pulumi is handed a mode-600 impersonated ADC file for exactly
  the deployer account" — the pulumi fake records the file's mode, credential
  type, impersonation URL, delegate count and whether `source_credentials` is
  there, and never its contents, so the URL is pinned to `deployer_sa`'s account
  without a test reading a key. Then "the ADC file is in a private directory,
  mode 600, and gone when the script exits" (and again when the script fails),
  "refuses a key whose type is not a service account", and "a missing jq is a
  clear error".
- `init_stack.bats`: "creates a missing stack with the project's gcpkms secrets
  provider", "skips a stack that is already there and exits 0", and "a stack a
  release creates itself gets the same secrets provider" — both creation paths
  pass the provider URL `secrets_provider_url` computes and neither passes a
  passphrase.

Bead dv-8xi, the committed stack settings, is the last:

- `settings.bats`: the answers a `Pulumi.<env>.yaml` can give, refused by all
  three of `preview.sh`, `up.sh` and `promote.sh` before any Pulumi call — the
  file is not there, it has no `secretsprovider` line, it names another
  project's key, it records the passphrase default — and then this project's own
  provider, which runs. A dry run refuses exactly what a real run refuses, and
  no refusal prints the file's `encryptedkey`.
- `init_stack.bats`: "prints the settings block of the stack it created", which
  compares the block line for line with the file Pulumi wrote, and "a dry run
  prints no settings block, because it creates nothing".

Bead dv-yf4, the digest the prod job reads back, is the last:

- `staged_digest.bats`: "prints the digest of the one Cloud Run service, not
  another resource's image" — the fake's export carries a registry resource with
  a tag-shaped `image` key of its own, so a reader that picked by key rather than
  by resource type fails loudly instead of printing the wrong thing — then the
  refusals, each with an empty stdout because stdout is what the workflow appends
  to `$GITHUB_OUTPUT`: no service, two services, an image that is a tag, a
  service that records no image, a failed export, and a stack whose committed
  settings lack this project's provider.

Bead dv-35th, the tag the `up` flow resolves:

- `digest_for_tag.bats`: a known tag prints one
  `<registry>@sha256:<64hex>` line, built from the digest the fake registry
  answered with and not from the tag; a tag the registry does not hold, a tag
  that resolves to no digest, and an answer that is not a digest each exit
  non-zero with a message naming the tag and an empty stdout; a tag that is not
  a release tag and a missing token file are refused before any read; and a dry
  run reads no registry and prints no digest.

Bead dv-5jrh, the commit the integration job checks for:

- `wait_version.bats`: the three answers, one test each — the service already
  reports the deployed commit; the commit arrives on the third attempt while the
  first two answer 503; another commit (exit 1, with `observed=` carrying it);
  and no answer (exit 2) for a service that is unreachable, a 500 whose body
  happens to hold the commit, a body that is not JSON, and JSON with no commit
  in it. What the body cannot do is tested too: a commit field holding
  `$(touch ...)` runs nothing, and twenty thousand characters of it leave
  neither stream longer than the refusal.

Bead dv-pj9, the landing build:

- `build_push_staging.bats`: the name a landing is published under is the
  commit's (`main-<12 hex>`), a commit *behind* main builds — the workflow is
  what skips that run, not this script — a commit main does not carry is refused
  without a single `docker` call, a release-shaped ref is refused in both the
  forms it arrives in (`refs/tags/v1.0.0` from a run and the branch
  `refs/heads/v1.0.0`), a checkout with no `origin/main` or no checkout at all is
  refused, and a dry run builds nothing while refusing exactly what a real run
  refuses. Its checkout fixtures are real repositories, so the ancestry check is
  exercised rather than described: `helpers.bash`'s `point_origin_main` writes
  the `origin/main` ref the check reads. `secrets.bats` runs this script with the
  rest.

Bead dv-lh6, the commit an image carries, is the last:

- `build_push.bats` and `build_push_staging.bats`: the build line the fake
  `docker` recorded names the exact `--build-arg GIT_SHA=<commit>` — the tag's
  commit for `build_push.sh`, and for `build_push_staging.sh` the HEAD commit
  its `main-<12 hex>` name is made from — and a dry run prints that same
  build-arg.
- `build_push.bats`: "refuses a source with no commit to record, before docker
  runs" — the plain directory `--allow-non-checkout` exists for has no commit
  to pass, so no `docker` is called at all.
- `build_push_staging.bats`: "refuses a HEAD that is not a commit, before docker
  runs", a repository with nothing committed: real git answers that one with the
  literal `HEAD` and a non-zero status, which is the malformed value the shape
  check is for, since a repository cannot hold a commit that is not 40 hex.

Beads dv-bte and dv-iuqp, the deploy time a release records, and the release
whose digest the stack already runs:

- `deployed_at.bats`: `up.sh` and `promote.sh` set `deployedAt` when the digest
  they are applying differs from the image the live stack runs, set it on a first
  apply, and when the two are equal apply nothing at all — no `pulumi up` reaches
  the fake, so no new revision is created and no deploy time is written (dv-iuqp)
  — with the fake's export fixture standing in for the stack's state. The skip
  still pins the digest and still prints `url=`, which is what the job's health
  check needs. Then the two ways it refuses rather than guess: a state with more
  than one Cloud Run service, and a clock that is not an RFC 3339 UTC timestamp —
  the fake `date` with `FAKE_DATE_BAD=1` — after which nothing is written and
  nothing is applied. A dry run reads no state, so it prints both halves of the
  plan — the deploy time and the apply a real run would make — and reaches no
  tool at all.
