# Folio Knowledge Format

**Version 0.2 — Draft**

The Folio Knowledge Format is token-conscious linked Markdown for humans and agents.

It favors concise leaves, globally unique names, bare wikilinks, useful indexes, and mechanical validation. A small amount of required metadata makes blocks easier to search and route without loading every leaf.

A folio remains readable and editable in ordinary Markdown tools. Specialized tooling can lint, traverse, or transform it, but no runtime or database is required.

---

## 1. Motivation

Markdown knowledgebases become expensive to navigate when filenames collide, links repeat long paths, indexes grow without structure, and readers must open documents to discover what they contain.

Folio addresses those costs with a few strong conventions:

- **Concise leaves** reduce reading and retrieval noise.
- **Required descriptions** let indexes route readers before they load a leaf.
- **Bare wikilinks** keep relationships short and stable when files move.
- **Unique names** make those links deterministic across the block.
- **Progressive indexes** let large blocks disclose detail in stages.
- **A content boundary** separates knowledge from repository support files.
- **Mechanical validation** catches structural drift without semantic inference.

These choices are agent-friendly because they save context and reduce ambiguity. They also improve human scanning, navigation, and maintenance.

Folio is not a general ontology. It does not define a universal taxonomy, a central schema registry, or a required domain organization.

---

## 2. Terminology

- **Folio** — The format described by this specification.
- **Block** — A collection of leaves rooted at a directory containing `index.md` and `leaves/`.
- **Leaf** — A Markdown knowledge document under `leaves/`, excluding structural `index.md` files.
- **Leaf name** — The globally unique filename stem of a leaf. For `project-alpha-roadmap.md`, the leaf name is `project-alpha-roadmap`.
- **Index** — An authored Markdown map. The block has a root `index.md`; nested leaf directories have their own `index.md` files.
- **Root index** — The required `index.md` at the block root.
- **Nested index** — An `index.md` inside a subdirectory of `leaves/`.
- **Conventions** — Optional block-specific guidance in root `conventions.md`.
- **Wikilink** — A bracket link to a leaf name, such as `[[project-alpha-roadmap]]` or `[[project-alpha-roadmap|Roadmap]]`.

---

## 3. Block Structure

A block has a required root index and a dedicated leaf directory.

```text
path/to/block/
├── index.md
├── conventions.md          # Optional block-specific conventions.
├── leaves/
│   ├── knowledge-about.md
│   └── projects/
│       ├── index.md
│       ├── project-alpha-roadmap.md
│       └── project-beta-roadmap.md
├── README.md               # Optional repository support file; not Folio knowledge.
└── AGENTS.md               # Optional repository support file; not Folio knowledge.
```

`index.md` and `leaves/` are required. An empty block MAY retain `leaves/` with a non-Markdown placeholder so version control preserves the directory.

All ordinary knowledge documents MUST live under `leaves/`. Markdown outside `leaves/` is block or repository support material and is not part of the Folio knowledge graph unless this specification gives it a defined role.

Repository-level files such as `README.md` and `AGENTS.md` MAY coexist with a block. Folio assigns them no semantics. In particular, Folio neither endorses nor discourages `AGENTS.md`; an agent harness may interpret it independently.

### 3.1 Organization

Folio favors flat organization inside `leaves/`. Directories MAY group larger blocks, and deeper nesting remains valid when it improves human navigation.

Every directory below `leaves/` that contains leaves at any depth MUST contain a nested `index.md`. The root index serves as the structural index for `leaves/` itself, so a separate `leaves/index.md` SHOULD NOT be used.

Directories SHOULD be shallow and named in kebab-case. Validators MAY warn about deep nesting as a usability concern.

Filesystem placement organizes browsing. It does not determine a leaf's wikilink target.

### 3.2 Defined filenames

The following filenames have defined Folio meaning:

| Location | Filename | Purpose |
|---|---|---|
| Block root | `index.md` | Required block map. |
| Block root | `conventions.md` | Optional block-specific conventions. |
| Below `leaves/` | `index.md` | Required map for a directory containing leaves. |

An `index.md` with a defined role is structural and is not a leaf.

---

## 4. Leaf Documents

Every leaf is a UTF-8 Markdown file with YAML frontmatter and a Markdown body.

```yaml
---
type: Project
title: Project alpha roadmap
description: Current direction and planned milestones.
---
```

### 4.1 Required metadata

Every leaf MUST have these non-empty string fields:

| Field | Purpose |
|---|---|
| `type` | Block-defined classification for filtering and routing. |
| `title` | Human-readable leaf name. |
| `description` | Concise summary for indexes, previews, and retrieval. |

Folio does not define a global `type` vocabulary. A block MAY document its vocabulary in `conventions.md`.

A leaf's `description` MUST match the description in its structural index entry after whitespace normalization.

### 4.2 Additional metadata

Leaves MAY use additional fields. Consumers SHOULD preserve unknown fields when editing or transforming a leaf.

Folio recognizes these common optional fields with meanings aligned where practical with other Markdown knowledge formats:

| Field | Purpose |
|---|---|
| `tags` | Short labels for filtering and grouping. |
| `date` | Date of the original decision or capture, when useful. |
| `resource` | URI identifying an external asset the leaf describes. |
| `sources` | Materials from which the leaf derives. |

Blocks MAY define additional fields and local value conventions. Folio does not require a machine schema file or central registry.

### 4.3 Body

The body is Markdown.

A leaf SHOULD use one top-level `#` heading matching its `title`. Producers SHOULD prefer clear sections, lists, tables, and code blocks over long unstructured prose.

### 4.4 Writing style

Leaves SHOULD use concise technical prose:

- short sentences
- one idea per paragraph
- direct verbs
- concrete nouns
- bullets for sets
- tables for comparisons
- code blocks for exact commands or shapes
- headings that describe the content below them

A leaf SHOULD preserve the useful result without narrating the entire path that produced it.

Prefer:

```md
## Decision

Use draft pull requests as the draft record.

## Rationale

- review happens before publication
- comments, diffs, commits, and authorship stay together
- merged `main` remains canonical
```

Avoid narrative buildup that does not add durable context.

---

## 5. Naming

Leaf filenames MUST be lowercase kebab-case.

```text
project-alpha-roadmap.md
team-projects.md
patterns-css-cascade.md
```

Every leaf filename stem MUST be unique across the block, regardless of its directory.

Invalid:

```text
leaves/projects/alpha/roadmap.md
leaves/projects/beta/roadmap.md
```

Valid:

```text
leaves/projects/alpha/project-alpha-roadmap.md
leaves/projects/beta/project-beta-roadmap.md
```

Namespace prefixes are encouraged when they prevent likely collisions:

```text
project-
people-
patterns-
```

A leaf MAY move between directories without changing its leaf name or inbound wikilinks.

---

## 6. Links

### 6.1 Leaf relationships

Internal relationships between leaves MUST use bare wikilinks.

```md
See [[project-alpha-roadmap]].
See [[project-alpha-roadmap|Roadmap]].
```

The target is a leaf name: the filename without `.md`. Aliases after `|` are optional and do not affect resolution or conformance.

Wikilink targets MUST NOT contain:

- a directory path
- `.md`
- `./` or `../`

Avoid:

```md
[[projects/alpha/project-alpha-roadmap]]
[[project-alpha-roadmap.md]]
[[../project-alpha-roadmap]]
```

A wikilink resolves block-wide to exactly one leaf. Broken links and duplicate leaf names are structural errors.

### 6.2 Structural and external navigation

Use standard Markdown links for:

- links between structural indexes
- links to `conventions.md` or repository support files
- external URLs and resources

```md
[Projects](leaves/projects/index.md)
[Conventions](conventions.md)
[Example](https://example.com/)
```

Do not use standard Markdown links for relationships between leaves.

Links shown as examples inside fenced code blocks do not create graph relationships.

---

## 7. Indexes

Indexes provide progressive disclosure. A reader starts at the root index, chooses a relevant group, and loads only the leaves needed.

An index is an authored map, not a generated file listing. Humans, agents, or Folio tooling MAY maintain it.

### 7.1 Root index

The root `index.md` is required. It MUST begin with YAML frontmatter containing non-empty `title` and `description` fields.

```yaml
---
title: Team knowledge
description: Team decisions, implementation patterns, and operating context.
---
```

The root index lists:

- leaves directly under `leaves/`
- immediate nested indexes that lead to grouped leaves

Example:

```md
# Index

## Overview

- [[knowledge-about]] — Product identity and principles.

## Areas

- [Projects](leaves/projects/index.md) — Active project knowledge.
- [Patterns](leaves/patterns/index.md) — Reusable implementation patterns.
```

### 7.2 Nested indexes

Each directory below `leaves/` containing leaves at any depth MUST have an `index.md`.

A nested index lists:

- leaves directly inside its directory
- immediate child indexes that lead to deeper leaves

```md
# Projects

- [[project-alpha-roadmap]] — Current project alpha direction and planned milestones.
- [[project-beta-roadmap]] — Current project beta direction and planned milestones.
- [Archived projects](archived/index.md) — Historical projects still useful to read.
```

Nested indexes do not require frontmatter. Their top-level heading SHOULD name the group they map.

### 7.3 Leaf entries

A leaf entry is a list line containing one wikilink followed by an em dash and the leaf description:

```md
- [[project-alpha-roadmap]] — Current project direction and planned milestones.
```

A wikilink alias MAY be used without changing the target or metadata contract:

```md
- [[project-alpha-roadmap|Roadmap]] — Current project direction and planned milestones.
```

Aliases are optional and are not synchronized with leaf titles.

Every leaf MUST appear in the structural index responsible for its directory:

- a leaf directly under `leaves/` appears in the root index
- a leaf in a nested directory appears in that directory's `index.md`

A leaf MUST NOT have duplicate structural entries. Its index description MUST match its frontmatter `description` after whitespace normalization.

### 7.4 Group entries

A group entry is a list line containing a relative Markdown link to an immediate child index, optionally followed by an em dash and a useful description:

```md
- [Projects](leaves/projects/index.md) — Active project knowledge.
```

From a nested index, the path is relative to that index:

```md
- [Frontend](frontend/index.md) — Frontend implementation patterns.
```

Every nested index MUST be reachable from the root through group entries.

### 7.5 Additional index content

Indexes MAY contain headings, concise orientation prose, and cross-references. Only list entries matching the leaf-entry or group-entry forms satisfy structural indexing requirements.

Additional thematic maps MAY exist as ordinary leaves. They supplement structural indexes but do not replace them.

---

## 8. Conventions

Root `conventions.md` is optional.

It documents block-specific choices that are not universal Folio requirements, such as:

- local `type` values
- additional metadata fields
- filename namespaces
- domain-specific placement practices
- recurring body sections
- local terminology

`conventions.md` is concise human-readable guidance, not a machine schema registry. It MUST NOT weaken Folio conformance requirements.

When present, the root index SHOULD link to it with a standard Markdown link so readers can discover it during orientation.

Universal requirements belong in this specification and validators, not repeated in every block's conventions.

---

## 9. Historical Content

A block SHOULD contain leaves that belong in its active knowledge graph.

Historical material MAY remain as ordinary leaves when it is still useful to read. Otherwise, version control or an external archive is a better home.

---

## 10. Distribution

A block is a directory. It MAY be distributed as:

- a plain directory
- a git repository
- a tarball or zip archive
- a subdirectory inside another project

Git is recommended for authoring because it provides history, attribution, diffs, branches, and review workflows. Git is not required for format conformance.

Repository support files and non-Markdown assets MAY coexist with the block. They remain outside the Folio graph unless linked as external resources from leaves.

---

## 11. Conformance

A directory conforms to Folio Knowledge Format v0.2 when it:

1. Contains root `index.md` with non-empty `title` and `description` frontmatter.
2. Contains a `leaves/` directory.
3. Keeps every ordinary knowledge document under `leaves/`.
4. Gives every leaf parseable YAML frontmatter with non-empty string `type`, `title`, and `description` fields.
5. Uses globally unique lowercase kebab-case leaf names.
6. Uses only bare wikilinks for relationships between leaves.
7. Resolves every wikilink to exactly one leaf.
8. Uses standard Markdown links for structural indexes, support files, and external resources.
9. Gives every nested leaf directory a reachable `index.md`.
10. Lists every leaf exactly once in the structural index responsible for its directory.
11. Contains no stale or duplicate structural index entries.
12. Matches every leaf description to its structural index-entry description after whitespace normalization.
13. Uses well-formed YAML wherever frontmatter is present.

A conforming validator reports violations of these requirements as errors. It MAY report deep nesting, oversized leaves, unrecognized metadata practices, and Markdown outside the Folio graph as usability warnings.

A validator MUST be mechanical. It MUST NOT use semantic ranking, retrieval, or LLM inference to decide validity.

---

## 12. Interoperability

Folio is an independent, opinionated linked-Markdown format. It is influenced by and metadata-aligned with [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), but Folio conformance does not imply OKF conformance.

The formats share field names such as `type`, `title`, `description`, `tags`, `resource`, and `sources` with compatible intent. Folio intentionally differs through its dedicated `leaves/` boundary, bare wikilinks, globally unique leaf names, progressive structural indexes, and graph-integrity requirements.

Tools MAY provide explicit OKF import, export, or validation. Such tooling can translate Folio wikilinks and layout into another format without weakening Folio's native conventions.

---

## 13. Versioning and Legacy Layouts

This document specifies Folio Knowledge Format **Version 0.2 — Draft**.

A block does not declare the format version in its own metadata. Format versions describe this specification; CLI and package versions are independent.

Earlier draft blocks may use root `INDEX.md`, required `SCHEMA.md`, root-level leaves, optional metadata, or path-qualified wikilinks. Those conventions are not conforming v0.2 structure.

Implementations SHOULD detect recognizable earlier draft layouts and report concrete migration guidance. They SHOULD NOT silently move or rewrite user knowledge.
