# Folio CLI

A local-first CLI for working with a Folio knowledge repo.

Folio keeps your knowledgebase in git. You edit locally, isolate changes in amendments, and publish amendments as draft pull requests for review.

## Install

Prerequisites:

- Node.js 22+
- git
- GitHub CLI: `gh auth login` (only required for a GitHub-backed folio; not needed for a local folio)

Install:

```bash
curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
```

By default, the installer places `folio` at:

```bash
~/.local/bin/folio
```

Use a custom install directory with `FOLIO_BIN_DIR`:

```bash
FOLIO_BIN_DIR="$HOME/bin" curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
```

If the install directory is not on `PATH`, the installer updates your shell rc when possible and prints the `export PATH=...` command for the current terminal.

A fresh install is not bound to any repo. Bind a GitHub-backed knowledge repo:

```bash
folio bind <owner/repo>
```

Example:

```bash
folio bind bytebroshq/knowledge
```

Or bind a local git repo in place — no GitHub, no `gh`:

```bash
folio bind ~/notes/my-folio
```

Or scaffold a brand new folio (INDEX.md, SCHEMA.md, git init) and bind to it:

```bash
folio create ~/notes/my-folio
```

## Mental model

Folio has one bound repo, in one of two modes:

- **GitHub mode** — bound with `folio bind <owner/repo>`. Folio manages a
  canonical clone; `folio sync` pushes amendment branches and opens draft PRs
  for review on GitHub.
- **Local mode** — bound with `folio bind <path>` or `folio create <path>`.
  The bound directory *is* the repo; there is no clone and no remote.
  `folio sync` commits and rebases the amendment onto `main` in place; you
  merge with plain `git merge` when ready.

`folio config` shows which mode is active: a `source` path means local, a
`remote` means GitHub.

```text
~/.config/folio/
  config.yml
  stores/
    .main/                 # canonical clone (GitHub mode only)
    amendments/
      my-topic/             # isolated worktree for one amendment
```

In local mode, `amendments/` holds worktrees of the bound repo directly —
there is no `.main` clone. You normally do not edit main directly. You
create an amendment, edit files in that amendment, then sync it.

## Basic workflow

Bind once:

```bash
folio bind <owner/repo>
```

Create an amendment:

```bash
folio switch -c my-topic
```

Edit files here:

```bash
~/.config/folio/stores/amendments/my-topic/
```

Check state:

```bash
folio status
folio status -u  # fetch and fast-forward main when an update is needed
folio status -x  # include draft PR context when relevant
```

`status` is concise and action-oriented:

```text
No drafts
Up to date

Bound to owner/repo · ~/.config/folio/stores/.main
```

When the bound source has moved:

```text
No drafts
Needs update, run `folio status -u`

Bound to owner/repo · ~/.config/folio/stores/.main
```

While drafting:

```text
On draft my-draft
Pending save, run `folio save`

Bound to owner/repo · ~/.config/folio/stores/amendments/my-draft
```

Local mode collapses repeated paths:

```text
No drafts
Up to date

Bound to /path/to/local-folio
```

Sync — commits, rebases, and (GitHub mode) publishes or updates the draft PR:

```bash
folio sync -m "describe the change"
```

In local mode, `sync` stops after commit + rebase and prints the `git merge`
command to run against the bound repo when the amendment is ready.

List amendments:

```bash
folio list
```

Switch amendments:

```bash
folio switch my-topic
```

Drop an amendment:

```bash
folio drop my-topic --force
```

## Commands

```text
folio bind <owner/repo> [--web]      bind this machine to a GitHub-backed knowledge repo
folio bind <path>                    bind in place to a local git repo
folio create <path>                  scaffold a new folio and bind to it
folio status [-u] [-x]               show current state; -u updates, -x includes PR context
folio list                           list local amendments
folio switch                         list local amendments
folio switch -c <topic>              create and enter an amendment
folio switch <topic>                 enter an existing amendment
folio sync [-m "message"]            commit, rebase, and (GitHub mode) push + open/update draft PR
folio drop <topic> --force           delete a local amendment (and its remote branch, in GitHub mode)
folio web                            open the web review surface (GitHub mode only)
folio config                         show config
folio config <key> <value>           set config
```

## Web

Folio Web reviews GitHub-backed folios; it has no role in local mode.

The CLI can open Folio Web for the bound repo:

```bash
folio web
```

Set the Web URL:

```bash
folio config web https://folio-web.bytebros.workers.dev
```

`folio bind --web <owner/repo>` binds locally, then opens the repo in Folio Web.

The CLI does not manage GitHub App installation or web auth. It opens the repo URL; the Web app handles login, setup, and review.

## Config

Show config:

```bash
folio config
```

Fresh config starts clean:

```yaml
remote:
store: git
active:
```

`config` also shows a `source` key (set in local mode) and resolved `path` /
`amendments` locations.

Set values:

```bash
folio config web https://folio-web.bytebros.workers.dev
```

Rebind to a different repo, GitHub or local:

```bash
folio bind <owner/repo> --force
folio bind <path> --force
```

Rebinding removes the local store and amendments for the previous binding.

## Development

Build the distributable JS file:

```bash
cd packages/cli
bun install
bun run build
```

The installer downloads the prebuilt file from:

```text
packages/cli/dist/folio.js
```
