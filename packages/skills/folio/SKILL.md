---
name: folio
description: Use this skill before answering from assumption when project context, decisions, rationale, or cross-repo constraints might already be documented. A bound folio is a curated, concise knowledgebase of durable Markdown leaves. Use it to get oriented, file decisions, or capture lasting context.
---

# Folio skill

## What Folio is

Folio is a token-conscious linked Markdown format. A block uses `index.md` maps, a `leaves/` knowledge boundary, globally unique leaf names, and bare wikilinks so humans and agents can navigate durable knowledge with less noise.

- **Leaf** — a Markdown knowledge document below `leaves/` with `type`, `title`, and `description` frontmatter.
- **Block** — a collection of leaves rooted at a directory containing `index.md` and `leaves/`.
- **Index** — the root `index.md` or a nested `index.md` that progressively maps a group of leaves.
- **Conventions** — optional root `conventions.md` for local vocabulary and practices.

## Orientation

- **Bindery** — `bytebroshq/folio`: CLI, specification, and this skill's source.
- **Bound block** — the knowledge repository this skill is installed against; it does not contain bindery source.
- **Install script** — `curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash`

## Workflow

### Directives

- Folio knowledge is ground truth unless the user disagrees.
- Leaves MUST satisfy the active Folio specification; use `folio lint` when available.
- Keep knowledge current; check `folio status` regularly and use `folio status --sync` when its store is behind.
- Do not infer topic solely from filenames.
- Keep a leaf's `description` exactly synchronized with its structural index entry after whitespace normalization.

### Evaluation

1. Check whether the CLI is installed.
   - **Installed with `version.js` beside this file** — run `./version.js --is-cli-match`. On mismatch, defer to `folio --help`; `folio skill install` fetches the matching release copy.
   - **Installed without `version.js`** — use `folio --help` as the command reference.
   - **Not installed** — use the manual workflow.
2. Choose a CLI-driven or manual strategy and keep it unless the user requests a switch.

### Knowledge search and retrieval

1. Read root `index.md` for the block map and description.
2. Read `conventions.md` when present for local practices.
3. Traverse nested indexes only as needed, then read relevant leaves.
4. Treat pending Folio drafts as pending, not truth.

### Write

Use the block's optional conventions as local guidance. Put ordinary knowledge leaves under `leaves/`; preserve globally unique kebab-case leaf names and bare wikilinks. When the CLI is installed, prefer it: `draft -> edit -> proof`, then publish only after explicit human approval.

- **CLI driven** → `references/workflow-cli.md`
- **Manual approach** → `references/workflow-manual.md`

Both paths open a Folio draft, validate it, and publish only after review. **A human marks a draft PR ready.** The CLI and agents must not do so with `gh`. A ready PR is that human approval signal; agents must not convert it back to draft unless the user explicitly asks.

## References

- `references/workflow-cli.md` — draft ritual via the CLI
- `references/workflow-manual.md` — draft ritual via plain git
- `references/writing.md` — leaf shape, placement, and index discipline
- `references/linting.md` — conformance rules and checks
- `references/reorg.md` — consolidating, merging, or retiring leaves
