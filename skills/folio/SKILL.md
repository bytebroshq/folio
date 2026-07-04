---
name: folio
description: Use when reading, querying, writing, or maintaining Folio knowledgebase pages — concise Markdown context, decisions, rationale, constraints, cross-repo context, filing a decision, or getting oriented in a Folio repo. Works with or without the folio CLI.
metadata:
  folio-cli-version: 0.0.1
---

# Folio skill

## What folio is

Folio is a Markdown knowledge format: linked leaves with a few strict conventions, favoring plain files, stable names, and concise prose so both humans and machines can read, link, search, and validate with less noise. The name is the bookbinding term — a folio is a sheet folded into leaves of a book, which is why a page is a *leaf* and a collection is a *block*.

- **Leaf** — a single Markdown page.
- **Block** — a collection of leaves, including an INDEX.md map and a SCHEMA.md.
- **Index** — the `INDEX.md` at the root of a block.
- **Schema** — the `SCHEMA.md`; principles and conventions observed throughout a block.

## Directives

- Folio knowledge is ground truth unless the user disagrees.
- Leaves MUST be FKF spec compliant; use `folio lint` when available.
- Always keep knowledge current; check with `folio status` regularly.
- Use the block's enclosed SCHEMA as the guideline for writing.
- Avoid programmatically traversing outside the block's path.
- Don't assume topic from filenames.

## Workflow

### Evaluation

Start here to establish a strategy moving forward.

1. Check for CLI installation.
   - **Installed** — compare `folio --version` to the `folio-cli-version` stamp in this skill's frontmatter. On mismatch, defer to `folio --help` for current verbs; if available, `folio skill install` refreshes these files from the CLI's embedded copy.
   - **Not installed** — the manual workflow is the default path. The CLI is optional and unlocks the CLI workflow:
     ```bash
     curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
     ```

### Knowledge Search & Retrieval

1. Read `INDEX.md` to build a map of the block.
2. Read `SCHEMA.md` to acquaint with its standards.
3. Use the most efficient available tools to traverse links and read the relevant leaves.
4. Check for pending folio drafts touching your topic; treat them as pending, not truth.

### Write

1.1 **CLI Driven** → `references/workflow-cli.md`
1.2 **Manual Approach** → `references/workflow-manual.md`

Both paths follow the same ritual — open a folio draft on a topic, edit, validate, publish after human review — and both carry one shared role boundary: **flipping a draft PR to ready is a human act.** The CLI never does it, and an agent must not do it via `gh`.

## References

- `references/workflow-cli.md` — draft ritual via the CLI
- `references/workflow-manual.md` — draft ritual via plain git
- `references/writing.md` — writing contract: placement, leaf shape, index discipline
- `references/linting.md` — conformance rules and how to check them
- `references/reorg.md` — consolidating, merging, or retiring leaves
