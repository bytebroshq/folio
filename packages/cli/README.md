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

# Or pin an immutable release:
FOLIO_VERSION=v0.3.4 curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
```

By default, the installer places `folio` at:

```bash
~/.local/bin/folio
```

Use a custom install directory with `FOLIO_BIN_DIR`:

```bash
FOLIO_BIN_DIR="$HOME/bin" curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash

# Or pin an immutable release:
FOLIO_VERSION=v0.3.4 curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
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

Every draft verb — `proof`, `publish`, `drop`, `lint` — takes the topic
explicitly. This is what makes concurrent drafts safe: each process names
its own draft, so one agent's work can never land in another agent's
worktree. Resolution order is: explicit argument, then `$FOLIO_DRAFT`,
then an error. Set `FOLIO_DRAFT` once in a script or hook that wraps the
whole ritual in a single process; interactive agents should keep passing
the topic explicitly — env doesn't survive between tool calls, and the
topic in the command self-documents the transcript.

Check state:

```bash
folio status
folio status --sync  # fast-forward the bound store when it is behind
folio update     # check/apply the latest stable Folio CLI release
```

`status` is the fleet dashboard · one line per open draft, plus main's
own state:

```text
Up to date

Drafts:
  my-draft                       dirty
  another-draft                  proofed · PR #42 ready

Bound to owner/repo · ~/.config/folio/stores/.main
```

When the bound source has moved:

```text
Needs sync, run `folio status --sync`
No drafts

Bound to owner/repo · ~/.config/folio/stores/.main
```

An in-place binding collapses repeated paths:

```text
Up to date
No drafts

Bound to /path/to/local-folio
```

Proof — commits dirty work, then lints, rebases, and (pr strategy) pushes
and opens or updates the draft PR; under merge strategy it shows the diff
vs main. Chain them with `&&`, naming the topic once:

```bash
folio proof my-topic
```

Publish — merges into main (pr strategy: only once the PR is marked ready;
merge strategy: squash-merges locally):

```bash
folio publish my-topic
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
folio proof <topic>                  commit dirty work, lint, rebase; push + draft PR (pr) or show diff (merge)
folio publish <topic>                merge the draft into main (squash for merge strategy)
folio status [--sync]                fleet dashboard; --sync fast-forwards the bound store
folio update [--version X.Y.Z] [--yes] check or install a stable CLI release
folio list                           list drafts
folio drop <topic> --force           delete a draft (and its remote branch, when a remote is bound)
folio web                            open the web review surface (needs a remote)
folio config                         show config
folio config <key> <value>           set config
folio lint [<topic>]                 check folio integrity (a draft, or main if omitted)
folio skill install <path>           write the embedded folio skill into <path>, remembering it
folio skill install                  re-run against the remembered path
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

`skill` holds the path where `folio skill install` last wrote the skill
(see [Skill](#skill)) — set by `skill install`, not meant to be hand-edited
here.

Rebind to a different repo, GitHub or local:

```bash
folio bind <owner/repo> --force
folio bind <path> --force
```

Rebinding drops the amendments for the previous binding. The managed clone
may be re-cloned; a custom `path` directory is yours and is never deleted.

## Skill

`folio skill install <path>` unpacks the CLI's embedded copy of the folio
skill into `<path>`, and records `<path>` under the `skill` config key.
Once recorded, a bare re-run reuses it:

```bash
folio skill install ~/.claude/skills/folio   # first time — records the path
folio skill install                          # later — reuses it
```

If a bound block's `INDEX.md` carries frontmatter with a `description` — the
block's "scent," one authored sentence naming what it covers (SPEC.md §7) —
install stamps it onto the written `SKILL.md`'s own frontmatter
`description` as a trailing `Bound folio: <scent>` clause. Agent harnesses
that keep a skill's description always-in-context then have a better chance
of firing the skill on a topic mention, whatever block happens to be bound.
No scent (unbound, or an `INDEX.md` without one) means no suffix.

Stamping is idempotent — installing twice in a row produces byte-identical
output — and re-stamping always replaces any prior `Bound folio: ...`
clause rather than appending to it.

`folio bind` re-stamps automatically after a successful bind, if a skill was
previously installed and its `SKILL.md` still exists at the recorded path.
`folio status` is a stateless drift check: if the installed description's
scent no longer matches the bound block's live `INDEX.md`, it prints:

```text
Skill description out of date, run `folio skill install`
```

Silent when there's no `skill` config key, no installed `SKILL.md`, or the
two already agree.

## Development

Build the distributable JS file:

```bash
cd packages/cli
bun install
bun run build
```

Release CI builds `packages/cli/dist/folio.js` from an annotated `vX.Y.Z` tag and attaches it to the matching GitHub Release. The installer downloads that immutable release asset, never a build from `main`. See [`RELEASE.md`](../../RELEASE.md).
