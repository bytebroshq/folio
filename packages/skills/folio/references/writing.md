# Writing Folio leaves

## Place leaves deliberately

Put ordinary knowledge under `leaves/`. Prefer a flat layout; use shallow directories when they improve browsing. Every directory under `leaves/` that contains leaves needs an `index.md`.

- Check optional `conventions.md` for local `type` values, namespaces, and placement practices.
- Give every leaf a globally unique lowercase kebab-case filename.
- Use descriptive namespace prefixes when they prevent collisions, such as `project-`, `people-`, or `patterns-`.

## Shape a leaf

Every leaf requires non-empty `type`, `title`, and `description` frontmatter:

```yaml
---
type: Decision
title: Human title
description: One-sentence summary for navigation and retrieval.
tags: [topic, kind]
date: 2026-07-03
---
```

`type` values are block-local. Additional metadata is allowed. The leaf description is the source of truth for its structural index entry.

Use one `# Title` and concise, descriptive sections.

## Prefer durable notes to summaries

Write current decisions, constraints, rationale, open questions, and next reads. Keep one idea per paragraph.

- Use bullets for sets and tables for comparisons.
- Use code blocks only for exact commands, paths, or shapes.
- Keep names, dates, commands, paths, and tradeoffs when they make the note actionable.
- Omit transcript summaries, throat-clearing, and narrative buildup.

## Link and index leaves

Use bare wikilinks for relationships between leaves:

```md
[[project-roadmap]]
[[team-projects]]
```

Do not use paths, `.md`, `./`, or `../` in wikilinks. Use ordinary Markdown links for indexes, support files, and external URLs.

Every leaf appears exactly once in its structural index:

- a leaf directly below `leaves/` appears in root `index.md`
- a nested leaf appears in its directory's `index.md`

Use token-efficient list entries:

```md
- [[project-roadmap]] — Current project direction and planned milestones.
```

The text after the em dash must match the leaf's `description` after whitespace normalization. Use group entries to lead readers to nested indexes:

```md
- [Projects](leaves/projects/index.md) — Active project knowledge.
```

## Drafts are not truth

Treat unmerged drafts as pending knowledge. Keep one coherent change per draft. Follow `workflow-cli.md` when the CLI is available; otherwise follow `workflow-manual.md`.
