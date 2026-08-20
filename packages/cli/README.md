# Folio CLI

A local-first CLI for working with a Folio knowledge repo.

Folio keeps your knowledgebase in git. You edit locally, isolate changes in drafts, and publish drafts as draft pull requests for review.

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

A fresh install has no bindings. Add named blocks:

```bash
folio bind bytebros --github bytebroshq/operations --path ~/notes/operations \
  --description "Durable ByteBros operating knowledge"
folio bind personal --path ~/notes/personal \
  --description "Personal knowledge"
```

All blocks remain active simultaneously. Use `folio map` for compact routing
metadata, then read the selected block's authored index.

```bash
folio map
folio bindings
```

Or scaffold a new local block (`index.md`, `leaves/`, git init) and bind it:

```bash
folio create personal --path ~/notes/personal
```

## Mental model

A binding records an alias, immutable state ID, description, checkout path,
optional GitHub repository, and explicit strategy. Alias renames preserve the
state ID and amendment worktrees; unbinding removes only the registry entry.

- **Location** (`path`) — where that block's checkout lives. Each binding has
  its own checkout and amendment namespace.
- **Strategy** (`strategy`) — what `publish` does. `merge` merges the draft
  into `main` locally; `pr` pushes the draft branch and review happens in a
  draft pull request on GitHub (needs a `remote` and `gh`).

The combinations:

| Bind                                            | remote | path      | strategy |
| ----------------------------------------------- | ------ | --------- | -------- |
| `folio bind alias --github owner/repo`              | set    | managed | pr    |
| `folio bind alias --github owner/repo --path ~/kb`  | set    | `~/kb`  | pr    |
| `folio bind alias --path ~/kb`                      | unset  | `~/kb`  | merge |

`folio config` prints the v2 YAML registry.

```text
~/.config/folio/
  config.yml
  stores/
    amendments/
      <binding-id>/         # isolated namespace for one binding
        my-topic/           # isolated worktree for one draft
```

You normally do not edit main directly. You open a qualified draft, edit files
in that draft, then proof and publish it.

## Basic workflow

Open a draft:

```bash
folio draft personal:my-topic
```

Edit files here:

```bash
~/.config/folio/stores/amendments/<binding-id>/my-topic/
```

Every draft mutation requires the qualified `binding:topic` identity. The binding
selects the repository and amendment worktree together; the same topic may
exist independently in multiple bindings. `$FOLIO_DRAFT`, when used, must
also contain the qualified identity.

Check state:

```bash
folio status                  # all bindings
folio status personal         # one binding
folio status personal --sync  # sync exactly one binding
folio drafts                  # all binding drafts
folio lint personal           # lint one main
folio lint personal:my-topic # lint one qualified draft
folio lint --all              # explicitly lint every binding main
folio update     # check/apply the latest stable Folio CLI release
```

`status` identifies each alias and continues through unavailable blocks:

```text
[personal] /path/to/personal
  main: up to date
  draft personal:my-draft dirty

[operations] /path/to/operations
  unavailable: checkout is missing
```

Sync exactly one binding:

```text
folio status personal --sync
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
folio proof personal:my-topic
```

Use `-m <message>` when the change needs an intentional, polished public summary. The message becomes the commit message; with PR strategy, its first line becomes the PR title and the full message becomes the PR body. On a subsequent proof, supplying `-m` intentionally replaces the existing PR title and body. Omit `-m` for routine follow-up proofs: Folio uses `amend: <topic>` for the commit and preserves existing PR metadata. When invoking Folio through a shell, pass messages containing Markdown code spans or shell substitutions as one shell-safe argument. Do not use double quotes for those messages: the invoking shell may evaluate backticks or `$()` before Folio starts.

```sh
# Bad: the invoking shell may evaluate the Markdown code span.
folio proof topic -m "Document `folio proof` behavior"

# Good: single quotes pass the message literally.
folio proof topic -m 'Document `folio proof` behavior'

# Good for a longer message.
message='Document `folio proof` behavior'
folio proof topic -m "$message"
```

Publish — merges into main (pr strategy: only once the PR is marked ready;
merge strategy: squash-merges locally):

```bash
folio publish personal:my-topic
```

List drafts:

```bash
folio drafts
folio drafts personal
```

Drop a draft:

```bash
folio drop personal:my-topic --force
```

## Commands

`<binding>` is a short, unique name for a configured Folio block (for example, `bytebros`).

```text
folio bind <binding> --github <owner/repo> [--path <path>] [--description <text>]
                                      add a named GitHub block binding
folio bind <binding> --path <path> [--description <text>]
                                      add a named local block binding
folio create <binding> --path <path> [--description <text>]
                                      scaffold a new folio and bind to it
folio bindings                       list configured bindings
folio binding rename <binding> <new-binding>
                                      rename a binding without moving state
folio unbind <binding>                  remove a binding, preserving files
folio map [<binding>] [--json]           show the LLM-oriented routing map
folio draft <binding>:<topic>            start or resume a draft (--force to restart)
folio proof <binding>:<topic>            commit, lint, rebase, and proof a draft
folio publish <binding>:<topic>          merge the draft into main
folio status [<binding>] [--sync]        status all or one; sync requires a binding
folio update [--version X.Y.Z] [--yes] check or install a stable CLI release
folio drafts [<binding>]                list drafts for all or one binding
folio drop <binding>:<topic> --force    delete a draft and its remote branch
folio web                            disabled; use `folio map`
folio config                         show config
folio config skill <path>            set the global installed-skill path
folio config amendments <path>       set the global amendments root
folio lint <binding>                   check one binding main
folio lint <binding>:<topic>            check one qualified draft
folio lint --all                       check every binding main
folio skill install <path>           download the matching Folio skill into <path>, remembering it
folio skill install --no-enrich      install without global routing enrichment
folio skill install                  re-run against the remembered path
```

Lint always requires an explicit scope. With `--json`, a binding or qualified
draft returns the lint result directly. `--all --json` returns an array of
binding-qualified results so unavailable blocks and their errors remain
attributable.

## Web

`folio web` is disabled in this breaking release because the web surface is
not maintained. Use `folio map` for agent routing and inspect GitHub directly
when review is needed.

## Config

Show config:

```bash
folio config
```

Fresh config starts as a v2 registry:

```yaml
version: 2
skill:
  path: null
amendments:
  path: ~/.config/folio/stores/amendments
bindings: {}
```

The v2 registry stores global skill and amendments settings plus named
bindings. Each binding stores `id`, `description`, `path`, optional `github`,
and `strategy`. Manual edits are supported, but invalid configuration fails
before repository actions.

`skill.path` is global and `amendments.path` is the configurable global root.
The CLI manages binding IDs and config version; aliases, descriptions, paths,
GitHub values, and strategies are human-editable.

`folio config skill <path>` and `folio config amendments <path>` update the
two global paths. Binding fields are intentionally not scalar `folio config`
keys: use the binding lifecycle commands or edit the validated YAML registry.

Rename or remove a binding:

```bash
folio binding rename personal notes
folio unbind notes
```

Neither operation deletes the checkout or amendment worktrees.

## Skill

`folio skill install <path>` downloads the checksum-verified skill archive
from the immutable release matching the CLI version, unpacks it into `<path>`,
and records `<path>` under the `skill` config key.
Once recorded, a bare re-run reuses it:

```bash
folio skill install ~/.claude/skills/folio   # first time — records the path
folio skill install                          # later — reuses it
```

The archive contains the authored skill unchanged, including `version.js`.
Run `./version.js --is-cli-match` from the installed skill directory to
verify that it and `folio` are the same release. By default, installation
locally enriches the skill description with a global routing map containing
all aliases, descriptions, and absolute index paths, wrapped in
`<contains>...</contains>`. Pass `--no-enrich` to omit that enrichment.
Package-manager installs that omit `version.js` remain usable without a
version lock.

## Development

Build the distributable JS file:

```bash
cd packages/cli
bun install
bun run build
```

Release CI builds `packages/cli/dist/folio.js` and `folio-skill.tar.gz` from an annotated `vX.Y.Z` tag and attaches them to the matching GitHub Release. The installer and skill command download immutable release assets, never a build from `main`. See [`RELEASE.md`](../../RELEASE.md).
