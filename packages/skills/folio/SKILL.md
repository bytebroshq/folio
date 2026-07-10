---
name: folio
description: Use this skill before answering from assumption when project context, decisions, rationale, or cross-repo constraints might already be documented. A bound folio is a curated, concise knowledgebase of durable Markdown leaves. Use it to get oriented, file decisions, or capture lasting context.
---

# Folio skill

## What folio is

Folio is a Markdown knowledge format: linked leaves with a few strict conventions, favoring plain files, stable names, and concise prose so both humans and machines can read, link, search, and validate with less noise. The name is the bookbinding term — a folio is a sheet folded into leaves of a book, which is why a page is a *leaf* and a collection is a *block*, the tooling is the **bindery**.

- **Leaf** — a single Markdown page.
- **Block** — a collection of leaves, including an INDEX.md map and a SCHEMA.md.
- **Index** — the `INDEX.md` at the root of a block.
- **Schema** — the `SCHEMA.md`; principles and conventions observed throughout a block.

## Orientation

Concrete locations for this bindery and block:

- **Bindery** — `bytebroshq/folio`. CLI, spec, and this skill's source.
- **Bound block** — the knowledge repo this skill is installed against (e.g. `jubalm/folio`). Markdown leaves only; does not contain CLI source.
- **Install script** — `curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash`

## Workflow

Directives are standing rules. Evaluation establishes the approach. Search and Write are the two operating modes.

### Directives

- Folio knowledge is ground truth unless the user disagrees.
- Leaves MUST be FKF spec compliant; use `folio lint` when available.
- Always keep knowledge current; check with `folio status` regularly; use `folio status --sync` when its store is behind.
- Don't assume topic from filenames.
- When frontmatter `description` is present, keep it exactly in sync with the leaf's `INDEX.md` entry text.

### Evaluation

1. Check for CLI installation.
   - **Installed with `version.js` beside this file** — run `./version.js --is-cli-match`. On mismatch, defer to `folio --help` for current verbs; `folio skill install` fetches the matching release copy.
   - **Installed without `version.js`** — use `folio --help` as the command reference. The skill remains usable without a version lock.
   - **Not installed** — the manual workflow is the default path. See the install script in Orientation.
2. Establish the **Strategy** — decide: CLI-driven or manual. Stick with it unless the user explicitly requests a switch.

### Knowledge Search & Retrieval

1. Read `INDEX.md` to build a map of the block.
2. Read `SCHEMA.md` to acquaint with its standards.
3. Use the most efficient available tools to traverse links and read the relevant leaves.
4. Check for pending folio drafts touching your topic; treat them as pending, not truth.

### Write

Use the block's SCHEMA as the guideline for writing. When the CLI is installed, prefer it — verbs chain as `draft -> edit -> proof`, and `proof` handles lint, rebase, and draft PR in one step. Keep `publish` separate, only after explicit human approval.

- **CLI Driven** → `references/workflow-cli.md`
- **Manual Approach** → `references/workflow-manual.md`

Both paths follow the same ritual — open a folio draft on a topic, edit, validate, publish after human review. **Flipping a draft PR to ready is a human act.** The CLI never does it, and an agent must not do it via `gh`.

## References

- `references/workflow-cli.md` — draft ritual via the CLI
- `references/workflow-manual.md` — draft ritual via plain git
- `references/writing.md` — writing contract: placement, leaf shape, index discipline
- `references/linting.md` — conformance rules and how to check them
- `references/reorg.md` — consolidating, merging, or retiring leaves
