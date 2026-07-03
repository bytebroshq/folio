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

## The format

A folio is a directory of Markdown **leaves** plus two required root files:

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
  when relevant, never silently adopt them as truth.
- Keep deltas small and topical — one amendment per coherent change.

## The CLI, when installed

The CLI binds to a folio (a knowledge collection) and operates on it. Its
output **is** the contract: read it literally, prefer machine-readable flags
(`--json` where available), and treat it as the source of truth for the
CLI's own behavior. The CLI exposes three stable concepts:

1. **Strategy** — GitHub mode (bound to a `remote` like `owner/repo`) or
   local mode (bound to a `source` path). Determines what publishing does.
2. **Local copy** — where main lives on disk (managed clone in GitHub mode,
   the bound directory in local mode).
3. **Remote** — the GitHub repo, if any.

`folio status` orients you: it fetches (GitHub mode) and names the next
action. Run it first when unsure. For the current verb surface and flags,
run `folio --help` — it is canonical, and this file deliberately does not
duplicate it so it cannot drift as verbs change. Verbs exist to:

- **orient** — report current state and the next action
- **amend** — open a draft on a topic, edit leaves in its worktree, save,
  proof (lint + rebase + push/draft PR), publish
- **establish** — bind to a remote or local path, or scaffold a new folio

The draft → ready → publish flow has one human role boundary: **flipping a
draft PR to ready is a human act** (review lives there). The CLI never does
it, and an agent must not do it via `gh`.

## Workflow

1. **Get oriented** — read `INDEX.md` and `SCHEMA.md`, then the relevant
   leaves. If the CLI is installed (`folio --version`), run `folio status`
   first; it reports state and names the next verb.
2. **Check for open amendments/PRs** touching your topic; treat them as
   pending.
3. **To edit**, make an amendment — via the CLI (preferred when installed)
   or by hand. Both follow the same ritual; the manual recipe in
   `references/pr-workflow.md` doubles as the rationale for why the verbs
   are shaped as they are.

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
