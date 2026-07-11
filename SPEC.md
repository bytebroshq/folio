# Folio Knowledge Format

**Version 0.1 — Draft**

The Folio Knowledge Format is linked Markdown with a few strict conventions.

It favors plain files, stable names, concise prose, bracket links, and mechanical validation.

A folio is readable and editable in ordinary Markdown editors. It requires no specialized runtime or database.

The format is intended to remain usable in common Markdown tools, including tools that support Obsidian-style wikilinks.

---

## 1. Motivation

The Folio Knowledge Format exists to make Markdown easier to read, link, search, and validate.

Humans get tired reading. Machines get worse when context is noisy. The same fix helps both: write less, structure more, and keep links mechanical.

The format favors:

- **Plain text** — files stay readable without special tooling.
- **Readability** — short sections, explicit claims, low ceremony.
- **Concision** — brief notes over narrative buildup.
- **Grep-ability** — stable names, direct wording, and mechanical links.

As a byproduct, the format is friendly to LLM capture and retrieval. Concise, structured Markdown gives models less noise to parse and fewer tokens to spend.

The Folio Knowledge Format is not a general ontology. It does not define semantic types, relationship vocabularies, or a central schema registry.

---

## 2. Terminology

- **Folio** — A collection of Markdown leaves that follows this format.
- **Leaf** — One Markdown page in a folio.
- **Index** — The root `INDEX.md` file. An authored map of the folio.
- **Schema** — The root `SCHEMA.md` file. Authored convention notes for the folio.
- **Link** — A bracket link from one leaf to another, commonly called a wikilink. Example: `[[project-roadmap]]` or `[[project-roadmap|Roadmap]]`.

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

Folio favors flat or shallow structure. Organization SHOULD come first from filenames, frontmatter, `INDEX.md`, and links. Directories are allowed, but they add path overhead and make links more expensive to read, write, grep, and move.

For most folios, keep leaves at the root. For larger catalogs, one level of nesting is acceptable. Deeper nesting SHOULD be a last resort.

### 3.1 Reserved filenames

The following root filenames have defined meaning and MUST NOT be used as ordinary leaves:

| Filename | Purpose |
|---|---|
| `INDEX.md` | Folio map. See §7. |
| `SCHEMA.md` | Folio convention. See §8. |

The following root filenames SHOULD be avoided for ordinary leaves because other tools commonly assign meaning to them:

| Filename | Common purpose |
|---|---|
| `AGENTS.md` | Agent instructions. |
| `README.md` | Project or directory introduction. |
| `SPEC.md` | Format or project specification. |

All other `.md` files are leaves.

---

## 4. Leaf Documents

Every leaf is a UTF-8 Markdown file.

Frontmatter is optional. Folio does not prescribe a default metadata schema. A folio MAY use frontmatter for local filtering, grouping, or tooling; a leaf MAY omit it when the filename, heading, and body are enough.

```yaml
---
description: One-sentence summary for previews and index generation.
---
```

### 4.1 Optional metadata fields

Folio recognizes the following optional fields for local use. Where they overlap with OKF, §12 defines the compatibility relationship.

| Field | Purpose |
|---|---|
| `title` | Human-readable title. |
| `description` | Leaf description: one-sentence summary for previews and index synchronization. |
| `type` | Local classification for routing or filtering. |
| `tags` | Short labels for filtering and grouping. |
| `date` | Date of the original decision or capture, when useful. |
| `resource` | URI identifying an external asset the leaf describes, when one exists. |

Folio does not require these fields or validate their values. Additional fields MAY be used, and consumers SHOULD preserve unknown fields.

If a folio uses `type`, it defines that vocabulary in `SCHEMA.md`.

A leaf MAY declare a frontmatter `description` (a leaf description). When it does, its corresponding `INDEX.md` entry MUST carry an index-entry description with the same text after whitespace normalization. When a leaf has no leaf description, Folio imposes no description-sync requirement on its index entry.

A folio MAY define required frontmatter fields, tag meanings, sections, naming conventions, and placement conventions in its own `SCHEMA.md`.

### 4.2 Body

The body is Markdown.

A leaf SHOULD use one top-level `#` heading matching the human title.

Producers SHOULD prefer clear sections, lists, tables, and code blocks over long unstructured prose.

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

A leaf SHOULD preserve the useful result without narrating the whole path that produced it.

Prefer:

```md
## Decision

Use draft pull requests as the draft record.

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

Concise does not mean vague. Keep names, commands, paths, dates, and tradeoffs when they are useful.

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

For nested leaves, the target MAY include a folio-root-relative path without `.md`.

```text
[[clients/acme]] → clients/acme.md
```

Bare links are preferred. Path links are useful when a folio grows beyond a comfortable flat catalog, but they cost more tokens and create more path churn when pages move. At that point, you'd want to reach for a tool anyways.

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

`INDEX.md` is a map, not just a table of contents. It MAY be written or updated by humans, LLMs, or Folio tooling. The goal is useful descriptions and navigation, not proof of manual authorship.

An index SHOULD group leaves by useful headings:

```md
# Index

## Projects

- [[project-about]] — product identity and principles
- [[project-roadmap]] — product build path

## Patterns

- [[patterns-css-cascade]] — CSS cascade notes
```

An index entry is a list line with a single bracket link, optionally followed by an em dash (`—`) and an index-entry description:

```md
- [[leaf]]
- [[leaf]] — index-entry description
```

An index-entry description is navigation prose. It is independent unless the target leaf declares a leaf description; in that case the two descriptions MUST match after whitespace normalization. Lines that do not parse as index entries — prose, cross-reference notes without a wikilink, and headings — are legal in `INDEX.md`; they are simply not entries for the entry-level rules in §11.

Every leaf MUST appear in `INDEX.md`.

Index entries use the same bracket links throughout a folio.

`INDEX.md` MAY carry its own frontmatter `description` (a block description). It names the block itself, distinct from a leaf description and an index-entry description. Tooling MAY use it for previews, listings, or to advertise a block's coverage to other tooling. Nothing else in this specification depends on it.

---

## 8. Schema

`SCHEMA.md` is required.

It documents local conventions for the folio: naming, placement, tags, sections, and anti-patterns.

`SCHEMA.md` is not a machine schema registry. It is human-readable operating guidance for the folio.

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

Historical material MAY remain as ordinary leaves when it is still useful to read. Otherwise, version control or external archives are better places for archived material.

---

## 10. Distribution

A folio is a directory. It MAY be distributed as:

- a plain directory
- a git repository (recommended)
- a tarball or zip archive
- a subdirectory inside another project

Git is recommended for authoring because it provides history, attribution, diffs, branches, and review workflows. It is not required for format conformance.

---

## 11. Conformance

A directory conforms to Folio Knowledge Format v0.1 when it:

1. Contains root `INDEX.md`.
2. Contains root `SCHEMA.md`.
3. Uses kebab-case leaf filenames.
4. Uses bracket links for internal leaf relationships.
5. Uses only bare or folio-root-relative bracket-link targets.
6. Resolves every bracket link to an existing `.md` file.
7. Includes every leaf in `INDEX.md`.
8. Contains no stale or duplicate index entries.
9. Uses a matching index-entry description when a leaf declares a leaf description.
10. Uses well-formed YAML when frontmatter is present.

A conforming validator reports violations of these requirements as errors. It MAY report deep nesting, path-heavy catalogs, and oversized leaves as usability warnings.

A validator MUST be mechanical. It MUST NOT use semantic ranking, retrieval, or LLM inference to decide validity.

---

## 12. Interoperability

Folio Knowledge Format is an independent, opinionated linked-Markdown format. Its structural conventions remain its own: flat or shallow placement, bracket links, root `INDEX.md` and `SCHEMA.md`, complete indexing, and mechanical validation.

Folio can interoperate with [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md). The formats share some optional metadata names (`title`, `description`, `type`, `tags`, `resource`) with compatible meanings. The shared names do not make those fields required in Folio, and Folio's `date` differs from OKF's `timestamp`: `date` records when the captured fact occurred; `timestamp` records when the document last meaningfully changed.

Tools MAY offer explicit OKF validation, conversion, or import/export. Those tool behaviors are outside this format specification.
