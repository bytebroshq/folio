---
name: folio
description: Use when reading, querying, writing, or maintaining Folio knowledgebase pages — concise Markdown context, decisions, rationale, constraints, cross-repo context, filing a decision, or getting oriented in a Folio repo. Works with or without the folio CLI.
metadata:
  folio-cli-version: 0.0.1
---

# Folio skill

Folio is a **Markdown knowledge format**: linked Markdown with a few strict
conventions. A folio is readable and writable with nothing but a text editor
and git — the `folio` CLI is an optional accelerator, not a requirement.

Full specification: <https://github.com/bytebroshq/folio/blob/main/SPEC.md>.

## Car vs. gas — know which repo you're in

Two different things are both called "folio," and confusing them is the most
common orientation failure:

- **The car** — `bytebroshq/folio`. The *tooling*: CLI source, FKF spec, and
  **this skill's own source**. Edited like any code repo (branch + PR); the
  folio CLI does not manage it.
- **The gas** — a knowledge collection (e.g. `jubalm/folio`). Markdown leaves
  governed by FKF. **This is what the CLI operates on.** You `folio bind` to
  a gas repo, never to the car.

If you're editing *knowledge*, you're in a gas repo and the CLI applies. If
you're editing *the CLI, spec, or skill*, you're in the car and plain git
applies. The CLI never binds to itself.

## The format

A folio (gas) is a directory of Markdown **leaves** plus two required root files:

- `INDEX.md` — the folio map, with useful descriptions (not a bare file list)
- `SCHEMA.md` — local conventions: naming, tags, placement, anti-patterns

Conventions:

- filenames are kebab-case; namespace prefixes prevent collisions (`project-*`, `people-*`, `patterns-*`)
- flat or shallow structure is preferred; organization comes from filenames, frontmatter, `INDEX.md`, and links — deep nesting is a last resort
- links between leaves use bracket syntax (wikilinks): `[[project-roadmap]]`; shallow folio-root-relative paths (`[[clients/acme]]`) only when directories are in use; never `./` or `../` markers
- frontmatter is optional; when used, prefer the spec's shared fields: `title`, `description`, `type`, `tags`, `date`, `resource`
- external URLs use regular Markdown links; leaf-to-leaf relationships never do

## Truth model

- Merged `main` is published truth.
- Amendments (branches / draft PRs) are **pending** knowledge: surface them
  when relevant, never silently adopt them as truth. **Branch existence is
  not pendingness** — squash-merged PRs leave their branch behind. Check PR
  state (open vs. merged vs. closed), not `git branch`.
- Keep deltas small and topical — one amendment per coherent change.

## How the CLI works (the model, not the verbs)

This section teaches the **operating model** — stable across releases. For
the current verb surface and flags, run `folio --help` (and
`folio <verb> --help`); that output is canonical and this file deliberately
does not duplicate it, so it cannot drift out of date.

### Three concepts in any bound folio

1. **Strategy** — *how* the CLI operates: GitHub mode (bound to a `remote`
   like `owner/repo`) or local mode (bound to a `source` filesystem path).
   This is the only difference that predicts what `proof`/`publish` will do.
2. **Local copy** — where main lives on disk: a managed clone
   (`stores/.main`) in GitHub mode, or the bound directory itself in local
   mode.
3. **Remote** — the GitHub repo backing it, if any. `None` in local mode.

`folio config` shows these. `folio status` orients you and is the command to
run first when unsure — it fetches (GitHub mode) and names the next action.

### The CLI is your API — treat its output as a contract

- **The CLI is canonical for its own behavior.** When you have a question
  about what a command does, what's bound, or what state you're in, ask the
  CLI. Do not reconstruct its model from prose output, leaf text, or the
  binary source.
- **Parse output literally; prefer machine-readable flags** like `--json`
  where they exist. Do not free-associate over prose rows.
- **Reach for the CLI, not git.** Every folio operation has a verb. Do not
  `cd` into the store, do not run raw `git branch` / `git log` / `git show`
  against the store to answer questions the CLI already answers
  (`folio status`, `folio list`, `folio config`). Raw git on the store is the
  single most reliable way to misread pending vs. published truth.
- **Never mark a PR ready** (`gh pr ready`) — flipping a draft PR to ready is
  a human-only act.

## Workflow

1. **Pick your path** — run `folio --version`. If it resolves, follow the CLI
   path below. If not, follow the manual path. The CLI path is preferred
   whenever available.
2. **Get oriented** — read `INDEX.md` and `SCHEMA.md`, then the relevant
   leaves. In CLI mode, also run `folio status` first; it fetches and reports
   state, then names the next verb.
3. **Check for open amendments/PRs** touching your topic; treat them as
   pending. Use the CLI's draft listing (or GitHub PR state), not `git branch`.
4. **To edit**, make an amendment via one of the paths below.

### CLI path (preferred when `folio` is installed)

The verbs exist to automate the amendment ritual. **For the verb surface,
flags, and exact output shape, run `folio --help` — it is canonical.** By
role:

- **Orient** — the command that reports current state and the next action.
- **Amend** — the loop: open an amendment on a topic, edit leaves in its
  worktree, save, proof (lint + rebase + push/draft PR), publish after a
  human marks the PR ready.
- **Establish the world** — bind to a remote or local path, or scaffold a
  new folio.

The manual recipe in `references/pr-workflow.md` is the same ritual by hand
and doubles as the *rationale* for why the verbs are shaped this way.

### Manual path (no CLI)

Branch, edit, lint by hand (`references/linting.md`), open a draft PR,
human-approved squash merge. Full recipe in `references/pr-workflow.md`.

## CLI freshness check

This skill was written against folio CLI **0.0.1** (frontmatter stamp).
Compare with `folio --version`. If the versions differ — or the flag is
unknown (older CLI) — verify verbs against `folio --help` instead of trusting
this file, and if the installed CLI offers `folio skill install`, point it at
this skill's directory to refresh these files from the CLI's embedded copy,
then re-read them before continuing.

To install the CLI:

```bash
curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
```

## References

- `references/writing.md` — writing contract: placement, leaf shape, style, index discipline
- `references/linting.md` — conformance rules and how to check them, with or without the CLI
- `references/pr-workflow.md` — amendment/publication ritual, manual and CLI forms
- `references/reorg.md` — consolidating, merging, or retiring leaves
