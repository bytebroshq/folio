---
name: folio
description: Use when reading, querying, writing, or maintaining Folio knowledgebase pages — concise Markdown context, decisions, rationale, constraints, cross-repo context, filing a decision, or getting oriented in a Folio repo.
---

# Folio skill

Folio is a local-first Markdown knowledgebase. Use this skill whenever the user asks to read, update, capture, or reason from Folio pages.

This skill is distributed with the Folio monorepo so the agent contract can travel with the tool. It is compatible with skill systems that load a directory containing `SKILL.md` plus referenced Markdown files.

## Format model

The Folio Knowledge Format is linked Markdown with a few strict conventions:

- a folio is a collection of Markdown leaves
- `INDEX.md` maps the folio with useful descriptions
- `SCHEMA.md` documents local conventions
- filenames are kebab-case
- organization comes first from filenames, frontmatter, `INDEX.md`, and links
- flat or shallow structure is preferred; deeper nesting should be a last resort
- frontmatter is optional, but useful for filtering, grouping, and tooling
- links use bracket syntax, commonly called wikilinks: `[[project-roadmap]]`
- shallow folio-root-relative path links are allowed when directories are useful: `[[clients/acme]]`
- avoid `./` and `../` path markers in bracket links

The canonical local main folio is usually:

```text
~/.config/folio/stores/.main/
```

Amendments are worktrees under:

```text
~/.config/folio/stores/amendments/<topic>/
```

## Reading contract

1. Check relevant leaves plus `INDEX.md` and `SCHEMA.md`.
2. Surface relevant open amendments/PRs as pending knowledge, but do not silently adopt them as truth.
3. Treat merged `main` as published truth.
4. If editing, use an amendment branch/worktree when practical and keep deltas small.

## Writing contract

See `writing.md`.

## Linting contract

See `linting.md`.

## PR workflow

See `pr-workflow.md`.
