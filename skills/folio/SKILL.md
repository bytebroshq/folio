---
name: folio
description: Use when reading, querying, writing, or maintaining Folio knowledgebase pages — concise Markdown context, decisions, rationale, constraints, cross-repo context, filing a decision, or getting oriented in a Folio repo.
---

# Folio skill

Folio is a local-first Markdown knowledgebase managed with the `folio` CLI.

## CLI requisite

Check it is installed: `which folio`

## Installation

```
curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
```

Follow the install completion for next step to complete setup.

## Getting Started

`folio --help` - list commands and show path to store

## Workflow

1. Check relevant leaves through `INDEX.md` and `SCHEMA.md`.
2. Surface relevant open amendments/PRs as pending knowledge, but do not silently adopt them as truth.
3. Treat merged `main` as published truth.
4. If editing, use an amendment (`folio draft <topic>`) and keep deltas small.
5. Flow: `draft` → edit → `save` → `proof` → `publish` (publish only after a human marks the PR ready).

## Conventions

For the full format specification, see <https://github.com/bytebroshq/folio/blob/main/SPEC.md>.

- `INDEX.md` maps the folio with useful descriptions
- `SCHEMA.md` documents local conventions

- filenames are kebab-case
- organization comes first from filenames, frontmatter, `INDEX.md`, and links
- flat or shallow structure is preferred; deeper nesting should be a last resort
- frontmatter is optional, but useful for filtering, grouping, and tooling
- links use bracket syntax, commonly called wikilinks: `[[project-roadmap]]`
- shallow folio-root-relative path links are allowed when directories are useful: `[[clients/acme]]`
- avoid `./` and `../` path markers in bracket links

## Writing contract

See `references/writing.md`.

## Linting contract

See `references/linting.md`.

## PR workflow

See `references/pr-workflow.md`.

## Reorg / consolidation

When merging, retiring, or restructuring leaves, see `references/reorg.md`.
