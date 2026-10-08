# deploy

The Pulumi program that deploys this app to Cloud Run through the
`gt.local/devops` library (devops plan, bead B4.5). The program is ten lines:
it reads a `Spec` from the stack config and hands it to `appdeploy.Run`, which
validates it, applies the deploy policy and creates the service
(`pkg/appdeploy` in the devops repo).

| File | What it is |
|---|---|
| `main.go` | The program, and `main` |
| `main_test.go` | Runs it under Pulumi's mock provider: no credential, no network |
| `Pulumi.yaml` | The Pulumi project, `fractals` |
| `Pulumi.staging.yaml`, `Pulumi.prod.yaml` | The `Spec` per environment |
| `go.mod` | Pins `gt.local/devops` to an exact version |

## How it is run

The release flow runs it, never a person: `scripts/release/preview.sh` and
`up.sh` run `pulumi` in this directory at a release tag, and the only value a
release changes is `imageDigest` (the digest `build_push.sh` printed). The
deployer service account token reaches the Pulumi process through the
environment, and nothing here holds a credential
(`scripts/release/README.md`).

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

`scripts/release/` is a verbatim copy of the devops repo's directory at
`v0.1.0`, the version `go.mod` pins — no runner clones that repo
(docs/design.md, section 5), so this repository carries the scripts it runs,
and the scripts and the library the app compiles against are one revision
(`workflows/README.md`, devops). Bump the pin and re-copy together:

```sh
diff -r scripts/release "$(go env GOMODCACHE)/gt.local/devops@<version>/scripts/release"
```

## Before the first release

Copying `deploy.yml` and `teardown.yml` from the devops repo into
`.forgejo/workflows/` and the Forgejo settings they assume (protected `v*` and
`teardown-v*` tags, the workflow-file branch rule, the `deploy` runner label)
are the human's steps; "What an app repo needs before its first release" and
"The human must configure in Forgejo" in the devops repo's `workflows/README.md`
list them.

Two disagreements on the devops side decide whether a release deploys the
service this program describes, and neither is fixed from this repository:
`manifests/fractals.yaml` names the app `fractals` where the release path and
this program use `fractals-nextjs` (bootstrap would create
`runtime-fractals`, and the service asks for `runtime-fractals-nextjs`), and
`scripts/release/lib.sh` names the stack `<app>-<env>` where the patrol reads
`<app>/<env>`. Both are filed as beads in the devops rig.
