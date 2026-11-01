# Forking this app

This repository is the fractals explorer: a Next.js app that draws the
Mandelbrot set and its relatives in the browser, fits the container contract
(a root `Dockerfile`, a server listening on `$PORT` 8080, `/api/health`, no
baked secrets), and carries the workflows and the Pulumi program that build,
deploy and tear it down. The repository is offered as a template on the code
host, so a fork starts from the whole working app rather than from a library.

## What a fork supplies

A fork's part is the values that belong to its own deployment, in
`deploy/params.json`, plus the settings on its code host (the last section).
That file is committed, and it is the customer's input — a fork edits it, and
the files listed beside each value below must agree with it. The app's code,
its tests, the container contract and the shape of the workflows stay as they
are.

The committed `deploy/params.json` holds one deployment's own values; a fork
replaces them. The examples below are placeholders, not values to copy.

The ten keys are fixed; invent none. Every key is written in code font here
exactly as the params file spells it. Each key is one value except
`pulumiEncryptedKey`, an object with one string per stack.

| Key | What it is for | What consumes it |
|---|---|---|
| `projectId` | The Google Cloud project that holds the deployed service, the KMS key ring and the stacks' state. | The release workflows (`.forgejo/workflows/deploy.yml`, `up.yml`, `teardown.yml` and `staging.yml`) as `GT_PROJECT`, and both Pulumi stack files as `fractals:project`. |
| `baseKeyFile` | The path, on the release runner, to the base key file a release exchanges for a short-lived token. | The release workflows as `GT_BASE_KEY_FILE`. |
| `stagingUrl` | The address the staging service answers on. | `.forgejo/workflows/health.yml` as `GT_STAGING_URL`, and the live-URL list in `README.md`. |
| `prodUrl` | The address the production service answers on. | `.forgejo/workflows/health.yml` as `GT_PROD_URL`, and the live-URL list in `README.md`. |
| `registryUrl` | The code host's registry, as a host with an optional port and no scheme or path. | The deploy generator, which reads it when it renders a deployment's files; nothing the app builds or runs reads it. |
| `goModuleRegistryUrl` | The full URL of the Go module proxy on that registry, which serves the deploy library the Pulumi program imports. | `Makefile`, which gives it to `GOPROXY` for `make deploy-check`. |
| `secretsProvider` | The Pulumi secrets provider: the KMS key a release encrypts stack secrets under. | `deploy/Pulumi.staging.yaml` and `deploy/Pulumi.prod.yaml` as `secretsprovider`. |
| `pulumiEncryptedKey` | The stack secrets as that provider encrypted them, one string per stack. Only the key that encrypted them decrypts them, so a fork supplies its own. | `deploy/Pulumi.staging.yaml` and `deploy/Pulumi.prod.yaml` as `encryptedkey`, one value per stack. |
| `readmeLiveUrls` | The addresses `README.md` shows as live, as a list. | `README.md`, which lists them. |
| `twitterCreator` | Optional. The handle the page credits on a social card. Empty or absent means the page emits no creator tag. | `next.config.js`, which reads it at build time through `src/lib/deploymentParamsFile.js` and compiles the handle into the server; the image itself carries no params file. |

A fork's params file, in the shape the file takes (placeholders throughout):

```json
{
  "projectId": "my-gcp-project",
  "baseKeyFile": "/path/on/the/runner/base-key.json",
  "stagingUrl": "https://app-staging.example.com",
  "prodUrl": "https://app-prod.example.com",
  "registryUrl": "registry.example.com:3000",
  "goModuleRegistryUrl": "https://registry.example.com/api/packages/your-owner/go",
  "secretsProvider": "gcpkms://projects/my-gcp-project/locations/my-region/keyRings/my-ring/cryptoKeys/my-key",
  "pulumiEncryptedKey": {
    "staging": "<your staging stack's ciphertext>",
    "prod": "<your prod stack's ciphertext>"
  },
  "readmeLiveUrls": [
    "https://app-staging.example.com",
    "https://app-prod.example.com"
  ],
  "twitterCreator": "@your-handle"
}
```

No credential is committed here: `baseKeyFile` is a path the runner owns, and
`pulumiEncryptedKey` holds only ciphertext that only the fork's own
`secretsProvider` key can decrypt.

## What this repository does with the values

There is no generator in this repository. The workflow files, the Pulumi stack
files and `README.md` are committed and still name their values themselves,
and the `Makefile` reads its own value when it runs. So changing a value means
changing it in `deploy/params.json` and in the files the table names.
`src/__tests__/deploy-params.test.ts` fails the gate while any of those files
disagrees with the params file.

## What stays the same

The app and its tests, the container contract, and the shape of the workflows
and the Pulumi program: a fork changes values, not the release machinery. The
scripts a release runs are a pinned copy of the deploy library's own and are
not edited in a fork (`deploy/README.md`).

## Settings on the code host

The template flag itself, the protected `v*` and `teardown-v*` tags, the
branch rule covering `.forgejo/workflows/` and the `deploy` runner label are
settings on the code host, not files in this repository. `deploy/README.md`
says which of them the workflows assume.
