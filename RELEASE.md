# CLI release policy

This document defines the target release contract for the Folio CLI and its
embedded agent skill. Implementation is tracked in [#33](https://github.com/bytebroshq/folio/issues/33).

## Release unit

A Folio CLI release is one immutable, SemVer-versioned bundle:

- an annotated `vX.Y.Z` Git tag and corresponding GitHub Release;
- the Node CLI executable built from that tag;
- the Folio skill embedded into that executable; and
- a `SHA256SUMS` file for release assets.

The CLI package version, `folio --version` output, and the embedded skill's
`metadata.folio-cli-version` must be identical. A release is rejected if any
of these values differ.

## Installation

The installer must resolve either the latest stable GitHub Release or an
explicit version (`FOLIO_VERSION=vX.Y.Z`). It downloads only that release's
asset, verifies its checksum, and atomically replaces the installed binary.
It must never install an executable from a mutable branch such as `main`.

`folio update --check` reports whether a newer stable release exists.
`folio update [--version X.Y.Z]` performs the same verified, atomic install.
Neither command changes user configuration or bindings.

## Skill synchronization

The skill is released with the CLI, but installation of the skill remains an
explicit action. `folio skill status` reports the CLI version, installed skill
version, and target path. When they differ, `folio update` may recommend
`folio skill install`; it must not overwrite an agent skill directory without
an explicit command.

`folio skill install` synchronizes managed files using a manifest. It removes
only files recorded as Folio-managed by a prior install and no longer present
in the new bundle; unrelated user files are preserved. This addresses #24.

## Delivery workflow

1. A release PR bumps the CLI version, regenerates the embedded bundle, and
   adds release notes.
2. Required CI runs lint and tests, builds the release asset, verifies the
   version contract, and smoke-tests installation from the packaged asset.
3. After the release PR merges, automation (or a protected approval) creates
   the tag, GitHub Release, executable asset, checksums, and release notes.
4. The installer and `folio update` consume those immutable release assets.

## Initial scope

GitHub Release assets are the initial distribution channel. npm publication,
auto-updates, and automatic skill-directory writes are explicitly out of
scope.
