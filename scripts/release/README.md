# Release scripts

The scripts the deploy runner executes for steps 2 to 7 of the release flow in
`docs/design.md`, section 6, plus `init_stack.sh`: the one-time stack creation an
app needs before its first release, which no workflow runs. They are written for
a Forgejo job running as `gt-cloud` (bead B5.4) and are wired together by
`workflows/deploy.yml` (bead B5.3).

| Script | Step | What it does |
|---|---|---|
| `build_push.sh` | 2 | Builds the app's Dockerfile at the release tag, pushes it, prints `<registry>@sha256:<64hex>` |
| `mint_token.sh` | 3 | Mints a one-hour token for the app's deployer SA from the base key |
| `preview.sh` | 4 | Pins the digest in the stack config and writes the `pulumi preview` diff the release is read from |
| `up.sh` | 5 | Applies the previewed digest; prints the service URL |
| `health.sh` | 5 | Polls the declared health path on that URL; fails the job if it never answers |
| `promote.sh` | 6 | Deploys the staging digest to prod, refusing anything that is not a digest |
| `init_stack.sh` | — | Creates an app's stack for one environment, with the project's `gcpkms` secrets provider; idempotent |
| `lib.sh` | — | The names and rules every script shares; sourced, never run |

`init_stack.sh` is the one script that is not part of a release; it is run once
per environment, by hand, before the first one (`workflows/README.md`, "The
first release"). It prints `stack=` and `created=yes|no`, and it exits 0 whether
it created the stack or found it already there. Under `--dry-run` it prints
`created=unknown`, which is the honest answer: a dry run does not read the
backend, so it cannot know. `up.sh --init-stack` creates a stack the same way
(same `--secrets-provider`), so a release that has to create its own stack gets
one encrypted like every other.

The run summary (step 7) is the workflow's job: it records the tag, commit and
digest from the outputs below.

## Interfaces

Every script takes flags and falls back to `GT_*` environment variables, so a
workflow can pass whatever is convenient. `--help` prints the full list.

| Output on stdout | From | Used by |
|---|---|---|
| `image=`, `tag=`, `digest=` | `build_push.sh` | the job outputs, and every later step |
| `token_file=`, `deployer_sa=` | `mint_token.sh` | `preview.sh`, `up.sh`, `promote.sh` |
| `preview_file=`, `stack=` | `preview.sh` | the run record's preview attachment |
| `stack=`, `created=` | `init_stack.sh` | the operator creating the stacks for a first release |
| `url=` | `up.sh`, `promote.sh` | `health.sh` |

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
  proved.
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
