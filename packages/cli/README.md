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

Or clone it somewhere you choose instead of the managed default:

```bash
folio bind bytebroshq/knowledge ~/notes/knowledge
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

A binding has two independent knobs:

- **Location** (`path`) — where the checkout lives. By default folio manages
  a clone at `~/.config/folio/stores/.main`; a custom `path` puts the
  checkout in a directory you own, and folio never deletes or rewrites it.
- **Strategy** (`strategy`) — what `publish` does. `merge` merges the draft
  into `main` locally; `pr` pushes the draft branch and review happens in a
  draft pull request on GitHub (needs a `remote` and `gh`).

The combinations:

| Bind                                            | remote | path      | strategy |
| ----------------------------------------------- | ------ | --------- | -------- |
| `folio bind owner/repo`                         | set    | (managed) | pr       |
| `folio bind owner/repo ~/kb`                    | set    | `~/kb`    | pr       |
| `folio bind ~/kb` (or `folio create ~/kb`)      | unset  | `~/kb`    | merge    |
| local bind + `folio config strategy pr`         | set    | `~/kb`    | pr       |

`folio config` reports all three keys.

```text
~/.config/folio/
  config.yml
  stores/
    .main/                 # managed clone (default location only)
    amendments/
      my-topic/             # isolated worktree for one amendment
```

With a custom `path`, `amendments/` holds worktrees of that checkout
directly — there is no `.main` clone. You normally do not edit main
directly. You open a draft, edit files in that draft, then proof and
publish it.

## Basic workflow

Bind once:

```bash
folio bind <owner/repo>
```

Open a draft:

```bash
folio draft my-topic
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

An in-place binding collapses repeated paths:

```text
No drafts
Up to date

Bound to /path/to/local-folio
```

Save, then proof — lints, rebases, and (pr strategy) pushes + opens or
updates the draft PR; under merge strategy it shows the diff vs main:

```bash
folio save -m "describe the change"
folio proof
```

Publish — merges into main (pr strategy: only once the PR is marked ready):

```bash
folio publish
```

List drafts:

```bash
folio list
```

Drop a draft:

```bash
folio drop my-topic --force
```

## Commands

```text
folio bind <owner/repo> [--web]      bind to a GitHub-backed knowledge repo (managed clone)
folio bind <owner/repo> <path>       bind to a GitHub-backed knowledge repo, cloned into <path>
folio bind <path>                    bind in place to a local git repo
folio bind ... --remote|--local      force how an ambiguous target is read
folio create <path>                  scaffold a new folio and bind to it
folio draft <topic>                  start or resume a draft (--force to restart)
folio save [-m "message"]            save changes in the active draft
folio proof                          lint + rebase; push + draft PR (pr) or show diff (merge)
folio publish                        merge the draft into main (pr: only once PR is ready)
folio status [-u] [-x]               show current state; -u updates, -x includes PR context
folio list                           list drafts
folio drop <topic> --force           delete a draft (and its remote branch, when a remote is bound)
folio web                            open the web review surface (needs a remote)
folio config                         show config
folio config <key> <value>           set config
```

## Web

Folio Web reviews GitHub-backed folios; it needs a `remote` configured.

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

Binding sets the three binding keys — `remote` (owner/repo, when
GitHub-backed), `path` (checkout location, blank for the managed clone), and
`strategy` (`merge` or `pr`). `config` also shows the resolved checkout and
`amendments` locations.

Set values:

```bash
folio config web https://folio-web.bytebros.workers.dev
```

`strategy` can be switched between `merge` and `pr`; `pr` requires a
`remote` (set one with `folio config remote <owner/repo>` if the checkout's
git origin points at GitHub). `path` cannot be set here — location is a
bind-time decision, so changing it means `folio bind`.

Rebind to a different repo, GitHub or local:

```bash
folio bind <owner/repo> --force
folio bind <path> --force
```

Rebinding drops the amendments for the previous binding. The managed clone
may be re-cloned; a custom `path` directory is yours and is never deleted.

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
