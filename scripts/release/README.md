# Release scripts

The six scripts the deploy runner executes for steps 2 to 7 of the release flow
in `docs/design.md`, section 6. They are written for a Forgejo job running as
`gt-cloud` (bead B5.4) and are wired together by `workflows/deploy.yml` (bead
B5.3).

| Script | Step | What it does |
|---|---|---|
| `build_push.sh` | 2 | Builds the app's Dockerfile at the release tag, pushes it, prints `<registry>@sha256:<64hex>` |
| `mint_token.sh` | 3 | Mints a one-hour token for the app's deployer SA from the base key |
| `preview.sh` | 4 | Pins the digest in the stack config and writes the `pulumi preview` diff the release is read from |
| `up.sh` | 5 | Applies the previewed digest; prints the service URL |
| `health.sh` | 5 | Polls the declared health path on that URL; fails the job if it never answers |
| `promote.sh` | 6 | Deploys the staging digest to prod, refusing anything that is not a digest |
| `lib.sh` | — | The names and rules every script shares; sourced, never run |

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
| `url=` | `up.sh`, `promote.sh` | `health.sh` |

Names are derived from `--app`, `--env`, `--project` and `--region` in one place
(`release_target` in `lib.sh`), and they follow what bootstrap creates:
`<region>-docker.pkg.dev/<project>/apps/<app>` for the image,
`gs://<project>-pulumi-state` for the state backend, `<app>-<env>` for the
Pulumi stack, and `deployer-<app>@<project>.iam.gserviceaccount.com` for the
account `mint_token.sh` impersonates.

A release changes one value per stack: `imageDigest`. The rest of the app's
`Spec` (`name`, `env`, `project`, `region`, `port`, `healthPath`) stays with the
app repo, in `Pulumi.<env>.yaml`, which is what the app's Pulumi program reads
(`examples/app/main.go`).

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
- **Never a mutation in `health.sh`.** It only curls. That is what makes "a
  failed health check leaves the environment as it was, with no automatic
  rollback" true rather than aspirational.
- **Nothing is installed.** No script writes outside the working directory
  except `mint_token.sh`'s token file and `build_push.sh`'s optional
  `--digest-file`.

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
