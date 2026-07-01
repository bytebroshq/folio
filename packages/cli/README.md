# @folio/cli

Knowledge management over git. A Bun/Node CLI — works from anywhere.

Part of the [bytebroshq/folio](https://github.com/bytebroshq/folio) monorepo. Replaces the [bash prototype](https://github.com/jubalm/folio-cli).

## Prerequisites

- [Bun](https://bun.sh) or Node.js 22+
- `git`
- `gh` (GitHub CLI, [authenticated](https://cli.github.com))

## Install

### Via Bun (recommended)

```bash
cd packages/cli
bun link
```

Makes `folio` available globally. Run `bun link` again after pulling changes.

### Via npm

```bash
cd packages/cli
npm link
```

### Direct wrapper (temporary)

If you already have the bash `folio` on PATH, the setup script installs a wrapper to `~/.config/folio/bin/folio`:

```bash
cd packages/cli
cp ../../scripts/cli-install.sh  # TODO
# Or: exec bun run src/index.ts "$@"
```

See the [global wrapper in `~/.config/folio/bin/folio`](../../../.config/folio/bin/folio) for an example.

## Commands

```
folio bind <ns/repo> [--web]     One-time: clone + auth check (+ open Web)
folio switch                      List amendments (* = active)
folio switch -c <topic>           Create + switch to a new amendment
folio switch <topic>              Switch to an existing amendment (rebases onto main)
folio status                      On main | amendment: <topic> — dirty/clean/PR
folio sync [-m "msg"]             Push: commit → rebase → force-push → draft PR
folio drop <topic> --force        Abandon an amendment (close PR + delete branches)
folio config                      Show global config
folio config <key> [<value>]      Get or set a config value
folio list                        List all amendments with status and PR
folio web [--no-open|--print-url] Open Folio Web or print URL
```

## Quick start

```bash
# One-time setup
folio bind jubalm/folio

# See what's going on
folio status
folio list

# Start an amendment
folio switch -c my-topic
# edit leaves in ~/.config/folio/stores/amendments/my-topic/leaves/
folio sync -m "why this matters"   # submits a draft PR

# Later, abandon or switch
folio drop my-topic --force
```

## Web integration

Configure a Folio Web URL for rich review:

```bash
folio config web https://folio-web.bytebros.workers.dev
folio web                          # opens browser to repo page
```

The Web handles auth and GitHub App install flow on first visit. The CLI stays intentionally dumb — its job ends at opening the URL.

## Performance vs bash prototype

- Batch PR lookup: single `gh pr list` call instead of one per amendment
- Lazy fetch: `git fetch` only runs on commands that need it (`sync`, `switch -c`, `switch <topic>`)
- Listing commands (`switch`, `list`, `status`) skip network when possible

## How it works

Amendments are git worktrees of a single canonical clone at `~/.config/folio/stores/.main/`. Each amendment lives in `stores/amendments/<topic>/` and syncs as its own draft PR. Rebase-always keeps history linear.
