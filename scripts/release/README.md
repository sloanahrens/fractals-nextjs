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
| `up.sh` | 5 | Applies the previewed digest; prints the service URL |
| `health.sh` | 5 | Polls the declared health path on that URL; fails the job if it never answers |
| `promote.sh` | 6 | Deploys the staging digest to prod, refusing anything that is not a digest |
| `staged_digest.sh` | 6 | Reads the image a stack is running out of `pulumi stack export`, which is what prod checks its promotion against |
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

The run summary (step 7) is the workflow's job: it records the tag, commit and
digest from the outputs below.

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

A release changes one value per stack: `imageDigest`. The rest of the app's
`Spec` (`name`, `env`, `project`, `region`, `port`, `healthPath`) stays with the
app repo, in `Pulumi.<env>.yaml`, which is what the app's Pulumi program reads
(`examples/app/main.go`).

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
- **Never a rebuild for prod.** `promote.sh` deploys the digest it is given, and
  refuses one that differs from `--staging-digest`. Prod gets the image staging
  proved, and `staged_digest.sh` reads that digest out of the stack's own state
  rather than out of a config file only the job that wrote it has.
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
  rollback" true rather than aspirational.
- **Nothing is installed.** No script writes outside the working directory
  except `mint_token.sh`'s token file, `build_push.sh`'s optional
  `--digest-file`, and the ADC file `lib.sh` writes into a private temporary
  directory and removes at exit.

Every script has `--dry-run`, which prints each action (including the exact
`pulumi`, `docker` and `gcloud` invocation) and runs none of them. `--dry-run`
still validates its inputs: a dry run of a release refuses exactly what a real
run would.

## Tests

`tests/` holds a bats suite with fake `docker`, `gcloud`, `pulumi` and `curl` on
`PATH` (see `tests/fakes/`). Nothing in it touches a cloud, a registry or the
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

Bead dv-pj9, the landing build, is the last:

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
