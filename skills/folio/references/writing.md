# Folio writing guide

## Placement

Folio favors flat or shallow structure. Prefer filenames, frontmatter, `INDEX.md`,
and links over directories.

Use deterministic namespace prefixes for collision prevention:

- Folio product pages: `folio-*.md`
- Lituus pages: `lituus-*.md`
- people pages: `people-*.md`
- reusable patterns: `patterns-*.md`

One level of nesting is acceptable when a catalog grows. Deeper nesting should be
a last resort because paths cost tokens, reduce grep-ability, and add link churn.

## Leaf shape

Frontmatter is optional. Use it when filtering, grouping, or tooling needs it:

```yaml
---
title: Human Title
tags: [topic, kind]
---
```

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

Use draft pull requests as the amendment record.

## Rationale

- review happens before the change is published
- GitHub stores comments, diffs, commits, and authorship
- merged `main` stays canonical
```

Avoid:

```md
We discussed several possible options and eventually landed on the idea that PRs might be useful...
```

## Links

Prefer bare bracket links:

```md
[[folio-roadmap]]
[[lituus-projects]]
```

Use shallow folio-root-relative path links only when directories are useful:

```md
[[clients/acme]]
```

Avoid relative path markers like `[[../foo]]` and `[[./foo]]`.

## Index

Every leaf should be represented in root `INDEX.md` unless deliberately hidden
from the main map. Update the relevant section when adding, deleting, or
materially reframing a page.

`INDEX.md` should contain useful descriptions, not just a generated file list.
It may be written by humans, LLMs, or Folio tooling.

## Amendments

Prefer:

```bash
folio draft <topic>
# edit Markdown leaves
folio save -m "short message"
folio proof
```

Never treat unmerged amendments as canonical truth.
