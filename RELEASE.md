# CLI releases

Folio publishes an immutable, versioned CLI and embedded-skill bundle.

## What a release contains

A release is an **annotated** `vX.Y.Z` Git tag and its GitHub Release. The
release attaches the Node executable (`folio.js`) and `SHA256SUMS`. CI builds
both from the tagged commit; `dist/` is generated for releases and is not
committed.

Before publishing, CI rejects a tag unless all of these agree:

- the tag is `vX.Y.Z`;
- `packages/cli/package.json` is `X.Y.Z`;
- `folio --version` reports `X.Y.Z`; and
- the embedded skill has `metadata.folio-cli-version: X.Y.Z`.

## Publishing a release

First merge a normal release-preparation PR that bumps the CLI package version
and includes its user-facing release notes. Then, from the up-to-date `main`
checkout, create the tag that declares the exact commit to release:

```sh
git switch main
git pull --ff-only
git tag -a v0.3.4 -m "folio 0.3.4"
git push origin v0.3.4
```

Pushing a `v*` tag triggers the **Release Folio CLI** GitHub Action. It builds
and verifies the artifact, generates `SHA256SUMS`, creates the GitHub Release,
and uploads both assets. There is no manual build or upload step. Do not create
a GitHub Release separately: the pushed annotated tag is the release trigger.

## Installation and updates

The installer resolves the latest stable GitHub Release, or an explicit
`FOLIO_VERSION=vX.Y.Z`, and downloads only that release's assets. It verifies
the checksum before atomically replacing the binary; it never installs an
executable from mutable `main`.

`folio update` checks the latest stable release. In a terminal it shows the
version change and asks before applying it; without a TTY it reports only.
`folio update --yes` applies it without the prompt, and `--version X.Y.Z`
selects an explicit stable release. Updating preserves bindings and config,
then refreshes the skill at the recorded skill path.

## Skill synchronization

`folio skill install` owns only files listed in its `.folio-skill-manifest.json`
manifest. It overwrites current bundled files on an explicit install and
removes obsolete managed files only if they still match their recorded hash.
It preserves unrelated files and locally modified obsolete Folio files, with a
message. This addresses [#24](https://github.com/bytebroshq/folio/issues/24).

## Scope

GitHub Release assets are the distribution channel. npm publication,
prerelease channels, background binary updates, and Windows support are out of
scope for now.
