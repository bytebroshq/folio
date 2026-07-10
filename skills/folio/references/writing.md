# Writing Folio leaves

## Place leaves deliberately

Keep the Folio flat or shallow. Prefer clear filenames, frontmatter, `INDEX.md`, and links over directories.

- Check `SCHEMA.md` before choosing a filename prefix or `type` value.
- Use stable prefixes when the Folio defines them, such as `project-`, `people-`, or `patterns-`.
- Add one directory level only when a catalog needs it. Avoid deeper paths.

## Shape a leaf

Use frontmatter when filtering, grouping, or tooling needs it:

```yaml
---
title: Human Title
description: One-sentence summary for previews and index generation.
type: decision
tags: [topic, kind]
date: 2026-07-03
---
```

`type` values are Folio-local; define them in `SCHEMA.md`. If a leaf has `description` frontmatter, it is the source of truth for the matching `INDEX.md` description.

Use one `# Title` and concise, descriptive sections.

## Prefer durable notes to summaries

Write current decisions, constraints, rationale, open questions, and next reads. Keep one idea per paragraph.

- Use bullets for sets and tables for comparisons.
- Use code blocks only for exact commands, paths, or shapes.
- Keep names, dates, commands, paths, and tradeoffs when they make the note actionable.
- Omit transcript summaries, throat-clearing, and narrative buildup.

Prefer:

```md
## Decision

Use draft pull requests as the Folio draft record.

## Rationale

- Review happens before the change is published.
- GitHub stores comments, diffs, commits, and authorship.
- Merged `main` stays canonical.
```

Avoid:

```md
We discussed several possible options and eventually landed on the idea that PRs might be useful...
```

## Link and index leaves

Use bare bracket links for leaves:

```md
[[project-roadmap]]
[[team-projects]]
```

Use shallow Folio-root-relative paths only when a directory is useful:

```md
[[clients/acme]]
```

Never use `[[../foo]]` or `[[./foo]]`. Use regular Markdown links only for external URLs.

Every leaf belongs in root `INDEX.md`. Add, remove, or reframe its entry whenever the leaf changes materially. Write useful descriptions, not a generated file list:

```md
- [[leaf]] — description
```

When the leaf has `description` frontmatter, the text after the em dash must match it after whitespace normalization.

## Drafts are not truth

Treat unmerged drafts as pending knowledge. Keep one coherent change per draft. Follow `workflow-cli.md` when the CLI is available; otherwise follow `workflow-manual.md`.
