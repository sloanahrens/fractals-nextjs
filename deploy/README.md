# deploy

The Pulumi program that deploys this app to Cloud Run through the
`gt.local/devops` library. It reads a `Spec` from the stack config and hands it
to `appdeploy.Run`, which validates it, applies the deploy policy and creates
the service (`pkg/appdeploy` in the devops repo).

`scripts/release/` is a verbatim copy of the devops repo's own directory, pinned
to the `gt.local/devops` version `go.mod` names. Do not edit it here: its
cross-references — the design docs it cites, its `make scripts-test` target, its
bead ids — are the devops repo's and resolve there, not in this repository,
where nothing builds or runs it (`release_test.go` included).

| File | What it is |
|---|---|
| `main.go` | The program, and `main` |
| `main_test.go` | Runs it under Pulumi's mock provider: no credential, no network |
| `Pulumi.yaml` | The Pulumi project, `fractals` |
| `Pulumi.staging.yaml`, `Pulumi.prod.yaml` | The `Spec` per environment |
| `go.mod` | Pins `gt.local/devops` to an exact version |

## How it is run

The release flow runs it, never a person: `scripts/release/preview.sh` and
`up.sh` run `pulumi` in this directory at a release tag, and the values a
release writes are `imageDigest` (the digest `build_push.sh` printed) and
`deployedAt` (the time it applied that digest). The deployer service account
token reaches the Pulumi process through the environment, and nothing here
holds a credential (`scripts/release/README.md`).

## The deploy time the page shows

`deployedAt` is optional and the program reads it as `DEPLOYED_AT`, the
variable `src/lib/version.ts` shows as "Deployed <time>". Two rules come with
it, both tested in `main_test.go`:

- **Absent means no variable at all.** A stack that holds no `deployedAt` has
  never recorded a deploy — it has not been released, or the release found the
  digest unchanged and recorded nothing — and the app then says nothing about
  a deploy time rather than showing an empty one. That second case is why an
  unchanged digest can leave the app with no `DEPLOYED_AT`: `apply_digest` in
  `scripts/release/lib.sh` applies nothing when the stack already runs the
  digest the release was given, so no revision is created and the deploy time
  the live revision carries stays on the app.
- **A present value has to be an RFC 3339 timestamp in UTC**, such as
  `2026-10-09T00:14:07Z`, which is what `lib.sh`'s `set_deployed_at_config`
  writes and checks before writing. Anything else fails the deploy with a
  message naming `deployedAt`, before the provider is asked to create
  anything: a config set by hand is a value no release stands behind, and a
  page claiming a deploy that did not happen is worse than one claiming
  none.

Two names are settled elsewhere and both are load-bearing:

- **The Pulumi project is `fractals`, not the repository's name.** The patrol
  finds this app's stacks by that name in the app's state bucket
  (`.pulumi/stacks/fractals/<env>.json`), and the reviewed manifest,
  `manifests/fractals.yaml` in the devops repo, states it beside `app:`. A
  program that named its project otherwise writes state the patrol never reads.
- **The app's name is the repository's name, `fractals-nextjs`.** That is
  `spec.Name` in the config files, which the library turns into the service
  name `<name>-<env>` — `fractals-nextjs-staging` — and it is what the deploy
  workflow's `GT_APP` defaults to.

The stacks are `staging` and `prod`, the two environments the manifest deploys
to, so the config files are named for them. Create each one once by hand,
before the first release (`workflows/README.md` in the devops repo).

## Building and testing it here

This is a module of its own, so the Node gates never build it and it never
needs Node. Its one external requirement, `gt.local/devops`, comes from the
Forgejo Go registry, so a build needs the proxy set the way the devops repo's
`consume.yml` sets it:

```sh
make deploy-check          # go test ./... and go vet ./..., with the proxy set
cd deploy && go test .     # the same by hand, with GOPROXY/GOPRIVATE in the environment
```

`make deploy-check` is **not part of `make gate`**: the landing gate runs in a
Node image with no Go toolchain and no route to the Forgejo registry, so the
Go half of this app is checked by hand or on a runner that has both. Everything
that decides what a release does is in these files, and the mock test asserts
it: the service name, its labels, image, scaling, runtime account, port,
health path and memory limit, and that no config file holds a secret.

## scripts/release

`scripts/release/` is a verbatim copy of the devops repo's directory at the
version `go.mod` pins — no runner clones that repo (the devops repo's
`docs/design.md`, section 5), so this repository carries the scripts it runs,
and the scripts and the library the app compiles against are one revision
(`workflows/README.md`, devops). Bump the pin and re-copy together:

```sh
VERSION=$(cd deploy && go list -m -f '{{.Version}}' gt.local/devops)
diff -r scripts/release "$(go env GOMODCACHE)/gt.local/devops@$VERSION/scripts/release"
```

## The release workflows

`.forgejo/workflows/` holds all three. `deploy.yml` runs at a protected `v*` tag
and builds the app, previews and rolls staging, then rolls prod once staging
answers. `staging.yml` follows `main` on every landing: it builds the commit
`main` is at, rolls staging onto that digest, and runs the integration tier
(`make integration`) against the service it deployed — a run `main` has already
moved past is skipped rather than reporting success, so a superseded landing
deploys nothing. `teardown.yml` runs at a protected `teardown-v*` tag and takes
the stacks down. All three come from the devops repo's templates and are
refreshed in the same pass as `scripts/release/` (the devops repo's
`workflows/README.md`).

What is left for a person is the Forgejo configuration the workflows assume
(protected `v*` and `teardown-v*` tags, the branch rule covering
`.forgejo/workflows/`, the `deploy` runner label); "What an app repo needs
before its first release" and "The human must configure in Forgejo" in the
devops repo's `workflows/README.md` list them.
