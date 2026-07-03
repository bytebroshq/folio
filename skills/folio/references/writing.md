# Folio writing guide

## Placement

Folio favors flat or shallow structure. Prefer filenames, frontmatter, `INDEX.md`,
and links over directories.

Use deterministic namespace prefixes for collision prevention, e.g.:

- project pages: `project-*.md`
- people pages: `people-*.md`
- reusable patterns: `patterns-*.md`

Check `SCHEMA.md` for the folio's own prefix vocabulary before inventing one.

One level of nesting is acceptable when a catalog grows. Deeper nesting should be
a last resort because paths cost tokens, reduce grep-ability, and add link churn.

## Leaf shape

Frontmatter is optional. Use it when filtering, grouping, or tooling needs it,
preferring the spec's shared field names:

```yaml
---
title: Human Title
description: One-sentence summary for previews and index generation.
type: decision
tags: [topic, kind]
date: 2026-07-03
---
```

`type` values are folio-local — define the vocabulary in `SCHEMA.md`.

`description` is the source of truth for the leaf's `INDEX.md` entry text —
it must match that entry exactly (whitespace-normalized). A folio SHOULD
declare `description` as required in its own `SCHEMA.md`; the format itself
only recommends it.

Then use one `# Title` heading and concise sections.

## Writing style

Write Folio leaves like concise technical notes.

Principles:

- human-readable first
- LLM-friendly as a consequence
- brief enough to scan
- exact enough to act on
- one idea per paragraph
- bullets for sets
- tables for comparisons
- code blocks for exact commands, paths, or shapes
- direct headings
- preserve decisions, constraints, rationale, open questions, and next reads

Avoid transcript summaries, throat-clearing, and narrative buildup.

Prefer:

```md
## Decision

Use draft pull requests as the folio draft record.

## Rationale

- review happens before the change is published
- GitHub stores comments, diffs, commits, and authorship
- merged `main` stays canonical
```

Avoid:

```md
We discussed several possible options and eventually landed on the idea that PRs might be useful...
```

Concise does not mean vague. Keep names, commands, paths, dates, and tradeoffs
when they are useful.

## Links

Prefer bare bracket links:

```md
[[project-roadmap]]
[[team-projects]]
```

Use shallow folio-root-relative path links only when directories are useful:

```md
[[clients/acme]]
```

Avoid relative path markers like `[[../foo]]` and `[[./foo]]`.
Use regular Markdown links for external URLs only — never for leaf
relationships.

## Index

Every leaf MUST be represented in root `INDEX.md`. Update the relevant
section when adding, deleting, or materially reframing a page.

`INDEX.md` should contain useful descriptions, not just a generated file list.
It may be written by humans, LLMs, or Folio tooling.

An index entry takes the form `- [[leaf]] — description`. When the leaf
carries a `description` frontmatter field, use that description's exact text
after the em dash — description-sync lint checks the two match.

## Folio drafts

Never treat unmerged folio drafts as canonical truth. Keep each draft small
and topical. For the full ritual — manual or CLI — see
`references/workflow-cli.md` and `references/workflow-manual.md`.
