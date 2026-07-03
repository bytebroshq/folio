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

## Workflow

1. Get oriented: read `INDEX.md` and `SCHEMA.md`, then the relevant leaves.
2. Check for open amendments/PRs touching your topic; treat them as pending.
3. To edit, make an amendment and follow one of the paths below.

## Editing: two paths

**With the CLI** (check `which folio`) — the ritual, automated:

```bash
folio draft <topic>   # amendment branch + draft worktree
# edit leaves in the draft store
folio save -m "short message"
folio proof           # lint + rebase; push + draft PR (GitHub mode) or diff (local)
folio publish         # only after a human marks the PR ready
```

**Without the CLI** — the same ritual by hand: branch, edit, lint manually,
draft PR, human-approved squash merge. Full recipe in
`references/pr-workflow.md`; manual lint checklist in `references/linting.md`.

Either way: never run `gh pr ready` — flipping a draft PR to ready is a
human-only act.

## CLI freshness check

This skill was written against folio CLI **0.0.1** (frontmatter stamp).
Before relying on CLI specifics, compare with `folio --version`. If the
versions differ — or the flag is unknown (older CLI) — verify verbs against
`folio --help` instead of trusting this file, and if the installed CLI
offers `folio skill install`, point it at this skill's directory to refresh
these files from the CLI's embedded copy, then re-read them before
continuing.

To install the CLI:

```bash
curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
```

## References

- `references/writing.md` — writing contract: placement, leaf shape, style, index discipline
- `references/linting.md` — conformance rules and how to check them, with or without the CLI
- `references/pr-workflow.md` — amendment/publication ritual, manual and CLI forms
- `references/reorg.md` — consolidating, merging, or retiring leaves
