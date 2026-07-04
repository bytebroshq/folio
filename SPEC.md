# Folio Knowledge Format

**Version 0.1 — Draft**

The Folio Knowledge Format is linked Markdown with a few strict conventions.

It favors plain files, stable names, concise prose, bracket links, and
mechanical validation.

A folio is readable without Folio tooling. The CLI improves authoring, linting,
and review.

The format is intended to stay usable in common Markdown tools, including tools
that support Obsidian-style wikilinks.

---

## 1. Motivation

The Folio Knowledge Format exists to make Markdown easier to read, link, search,
and validate.

Humans get tired reading. Machines get worse when context is noisy. The same fix
helps both: write less, structure more, and keep links mechanical.

The format favors:

- **Plain text** — files stay readable without special tooling.
- **Readability** — short sections, explicit claims, low ceremony.
- **Concision** — brief notes over narrative buildup.
- **Grep-ability** — stable names, direct wording, and mechanical links.

As a byproduct, the format is friendly to LLM capture and retrieval. Concise,
structured Markdown gives models less noise to parse and fewer tokens to spend.

The Folio Knowledge Format is not a general ontology. It does not define
semantic types, relationship vocabularies, or a central schema registry.

---

## 2. Terminology

- **Folio** — A collection of Markdown leaves that follows this format.
- **Leaf** — One Markdown page in a folio.
- **Index** — The root `INDEX.md` file. An authored map of the folio.
- **Schema** — The root `SCHEMA.md` file. Authored convention notes for the
  folio.
- **Link** — A bracket link from one leaf to another, commonly called a
  wikilink. Example: `[[project-roadmap]]` or `[[project-roadmap|Roadmap]]`.

---

## 3. Folio Structure

A folio is a directory of Markdown files.

```text
path/to/folio/
├── INDEX.md              # Required. Folio map.
├── SCHEMA.md             # Required. Folio convention.
├── <leaf>.md             # A leaf.
├── <namespace>-<leaf>.md # A namespaced leaf.
└── <group>/              # Nested leaf. Allowed but not preferred.
    └── <leaf>.md
```

Folio favors flat or shallow structure. Organization SHOULD come first from
filenames, frontmatter, `INDEX.md`, and links. Directories are allowed, but they
add path overhead and make links more expensive to read, write, grep, and move.

For most folios, keep leaves at the root. For larger catalogs, one level of
nesting is acceptable. Deeper nesting SHOULD be a last resort.

### 3.1 Reserved filenames

The following root filenames have defined meaning and MUST NOT be used as
ordinary leaves:

| Filename | Purpose |
|---|---|
| `INDEX.md` | Folio map. See §7. |
| `SCHEMA.md` | Folio convention. See §8. |

The following root filenames SHOULD be avoided for ordinary leaves because other
tools commonly assign meaning to them:

| Filename | Common purpose |
|---|---|
| `AGENTS.md` | Agent instructions. |
| `README.md` | Project or directory introduction. |
| `SPEC.md` | Format or project specification. |

All other `.md` files are leaves.

---

## 4. Leaf Documents

Every leaf is a UTF-8 Markdown file.

Frontmatter is recommended when a folio needs filtering, grouping, or tooling.
A leaf MAY omit frontmatter when the filename, heading, and body are enough.

```yaml
---
title: Human Title
tags: [project, decision]
---
```

### 4.1 Frontmatter

Recommended fields:

| Field | Purpose |
|---|---|
| `title` | Human-readable title. |
| `description` | One-sentence summary for previews and index generation. |
| `type` | Short string naming the kind of leaf. Used for routing and filtering. |
| `tags` | Short labels for filtering and grouping. |
| `date` | Date of the original decision or capture, when useful. |
| `resource` | URI identifying an external asset the leaf describes, when one exists. |

Leaves SHOULD carry `description`. A conformant folio treats a leaf's
`description` as the mechanical source for its `INDEX.md` entry text (§7);
index-sync linting (§11) depends on it. `description` is not otherwise
required by this specification — adoption is a folio-local convention that a
folio SHOULD declare in its own `SCHEMA.md`.

These names align with OKF frontmatter where the two formats overlap, so a
leaf that carries them is closer to portable across profiles. See §12.

`type` values are folio-local. A folio SHOULD define its `type` vocabulary in
`SCHEMA.md`. Consumers MUST NOT reject a leaf for an unknown `type`.

Additional fields MAY be used. Consumers SHOULD preserve unknown fields.

`SCHEMA.md` SHOULD document local frontmatter fields, tag meanings, required
sections, naming conventions, and placement conventions.

### 4.2 Body

The body is Markdown.

A leaf SHOULD use one top-level `#` heading matching the human title.

Producers SHOULD prefer clear sections, lists, tables, and code blocks over
long unstructured prose.

### 4.3 Writing style

Folio leaves SHOULD use concise technical prose.

This style is close to plain-language technical writing:

- short sentences
- one idea per paragraph
- direct verbs
- concrete nouns
- bullets for sets
- tables for comparisons
- code blocks for exact commands or shapes
- headings that describe the content below them

A leaf SHOULD preserve the useful result without narrating the whole path that
produced it.

Prefer:

```md
## Decision

Use draft pull requests as the amendment record.

## Rationale

- review happens before the change is published
- the review system already stores comments, diffs, commits, and authorship
- merged `main` stays canonical
```

Avoid:

```md
## Thoughts

We had a long discussion about whether we might want some kind of branch-based
workflow, and there were a few options, and after considering them it seemed
like maybe pull requests could work pretty well because the review system already has many
of the things we would need...
```

Concise does not mean vague. Keep names, commands, paths, dates, and tradeoffs
when they are useful.

---

## 5. Naming

Leaf filenames are kebab-case.

```text
project-roadmap.md
team-projects.md
patterns-css-cascade.md
```

Prefix names to avoid collisions:

```text
project-     # Project pages
people-      # People notes
patterns-    # Reusable implementation patterns
```

---

## 6. Links

Folio links use bracket-link syntax, commonly called "wikilinks".

```md
See [[project-roadmap]].
See [[team-projects|Team projects]].
```

For root leaves, the target is the filename without `.md`.

```text
[[project-roadmap]] → project-roadmap.md
```

For nested leaves, the target MAY include a folio-root-relative path without
`.md`.

```text
[[clients/acme]] → clients/acme.md
```

Bare links are preferred. Path links are useful when a folio grows beyond
a comfortable flat catalog, but they cost more tokens and create more path churn
when pages move. At that point, you'd want to reach for a tool anyways.

Relative path markers SHOULD NOT be used in bracket links.

Avoid:

```md
[[../projects]]
[[./projects]]
```

Broken links are structural issues. Traversal outside the folio can cause issues.

Use Markdown links for external URLs.

```md
[Example](https://example.com/)
```

DO NOT use Markdown links for folio leaf relationships. Use bracket links instead.

---

## 7. Index

`INDEX.md` is required.

It is the folio map. It gives humans and agents a quick overview of the graph.

`INDEX.md` is a map, not just a table of contents. It MAY be written
or updated by humans, LLMs, or Folio tooling. The goal is useful descriptions
and navigation, not proof of manual authorship.

An index SHOULD group leaves by useful headings:

```md
# Index

## Projects

- [[project-about]] — product identity and principles
- [[project-roadmap]] — product build path

## Patterns

- [[patterns-css-cascade]] — CSS cascade notes
```

An index entry SHOULD take the RECOMMENDED form:

```md
- [[leaf]] — description text
```

A list line with a single bracket link followed by an em dash (`—`) and
description text is an index entry. Lines that do not parse as this shape —
prose lines, cross-reference notes without a wikilink, headings — are still
legal in `INDEX.md`; they are simply not entries for the entry-level rules in
§11.

Every leaf MUST appear in `INDEX.md`.

Index entries use the same bracket links throughout a folio.

---

## 8. Schema

`SCHEMA.md` is required.

It documents local conventions for the folio: naming, placement, tags, sections,
and anti-patterns.

`SCHEMA.md` is not a machine schema registry. It is human-readable operating
guidance for the folio.

A minimal schema is valid:

```md
# SCHEMA

## Naming

- Use namespace prefixes.
- Use kebab-case filenames.

## Links

- Prefer bare bracket links.
- Use shallow path links only when the folio needs directories.
```

---

## 9. Historical Content

A folio SHOULD contain pages that belong in the active graph.

Historical material MAY remain as ordinary leaves when it is still useful to
read. Otherwise, version control or external archives are better places for
archived material.

---

## 10. Distribution

A folio is a directory. It MAY be distributed as:

- a plain directory
- a git repository (recommended)
- a tarball or zip archive
- a subdirectory inside another project

Git is recommended for authoring because it provides history, attribution,
diffs, branches, and review workflows. It is not required for format
conformance.

---

## 11. Conformance

A directory is conformant with Folio Knowledge Format v0.1 if:

1. It contains root `INDEX.md`.
2. It contains root `SCHEMA.md`.
3. Leaf filenames are kebab-case.
4. Internal leaf relationships use bracket links.
5. Bracket links are either bare targets or folio-root-relative paths.
6. Bracket links resolve to existing `.md` files.
7. `INDEX.md` does not contain stale leaf entries.

A strict Folio linter SHOULD report:

- missing reserved files
- relative path markers in bracket links
- broken links
- stale index entries
- orphan leaves
- duplicate index entries
- description/index description mismatches, when a leaf declares `description` (§4.1, §7)
- malformed frontmatter, when present
- oversized leaves

A linter MAY warn when a folio uses deep nesting or many path links. That is a
usability warning, not a conformance failure.

The linter MUST be mechanical. It MUST NOT use semantic ranking, retrieval, or
LLM inference to decide whether the folio is valid.

### 11.1 Lint profiles

A linter SHOULD organize its rules into named profiles. A profile is a rule
set plus the conventions those rules assume (reserved filenames, link syntax,
required frontmatter).

| Profile | Assumes | Requires |
|---|---|---|
| `folio` | This specification. The default. | Rules 1–7 above. |
| `okf` | OKF bundle conventions. | Parseable frontmatter with non-empty `type`; reserved `index.md` / `log.md` structure; tolerated broken links. |

Selection order:

1. An explicit flag: `folio lint --spec okf`.
2. Detection: a root `index.md` declaring `okf_version` selects `okf`.
3. Otherwise `folio` is the default.

Profiles are strict about their own rules and silent about the other
profile's rules. Running the `folio` profile against an OKF bundle is a user
error, not a conformance failure of the bundle.

A profile MAY add advisory checks beyond its conformance rules (for example,
the `okf` profile MAY warn on broken links even though OKF consumers must
tolerate them). Advisory output MUST be distinguishable from conformance
failures.

---

## 12. Compatibility

The Folio Knowledge Format is one linked Markdown format.

Other profiles, including OKF, MAY use different conventions: nested documents,
standard Markdown links, required `type` fields, lowercase `index.md`, or looser
link validation.

Folio tooling SHOULD support other profiles explicitly rather than weakening
Folio rules. Lint profiles (§11.1) are the mechanism: each profile enforces
its own conventions in full instead of a lowest common denominator.

Where field names overlap with OKF (`title`, `description`, `type`, `tags`,
`resource`), Folio uses the same names and meanings (§4.1). Folio's `date`
and OKF's `timestamp` differ: `date` records when the captured fact occurred;
`timestamp` records when the document last meaningfully changed.

Compatibility should be additive:

```bash
folio lint --spec folio
folio lint --spec okf
folio export okf
folio import okf
```

The Folio Knowledge Format remains the default profile unless configured otherwise.
