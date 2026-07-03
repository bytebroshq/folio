---
name: folio
description: Use when reading, querying, writing, or maintaining Folio knowledgebase pages — concise Markdown context, decisions, rationale, constraints, cross-repo context, filing a decision, or getting oriented in a Folio repo. Works with or without the folio CLI.
metadata:
  folio-cli-version: 0.0.1
---

# Folio skill

## What folio is

Folio is a Markdown knowledge format: linked **leaves**, plus `INDEX.md` (the map) and `SCHEMA.md` (the conventions), where the merged default branch is published truth. A **block** holds whatever knowledge its authors bound into it — this skill doesn't define what that is; the block does.

## Operating rules

- **The CLI is ground truth for its own state.** Run `folio status` for state and the next action; run `folio --help` for verbs. Its output is authoritative, not a claim to verify with git.
- **A block is ground truth for its own content.** Read `INDEX.md` and the relevant leaves; don't assume a block's scope from its name, repo, or this skill.
- **The merged default branch is published truth.** Draft PRs and unmerged branches are pending knowledge; surface them as pending, don't adopt as truth.

## Workflow

### Orient

Detect the CLI:

```
folio --version
```

- **Installed** — compare to the `folio-cli-version` stamp in this skill's frontmatter. On mismatch, defer to `folio --help` for current verbs; if available, `folio skill install` refreshes these files from the CLI's embedded copy.
- **Not installed** — the manual workflow is the default path (`references/workflow-manual.md`). The CLI is optional and unlocks the CLI workflow (`references/workflow-cli.md`):
  ```bash
  curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
  ```

Then read `INDEX.md` (scope) and `SCHEMA.md` (conventions), read the leaves relevant to your task, and check for pending amendments touching your topic.

### Make a change

Follow the path matching your setup:

- **CLI installed** → `references/workflow-cli.md`
- **Manual** → `references/workflow-manual.md`

Both paths follow the same ritual — open an amendment on a topic, edit, validate, publish after human review — and both carry one shared role boundary: **flipping a draft PR to ready is a human act.** The CLI never does it, and an agent must not do it via `gh`.

## Conventions

Leaf conventions — naming, links, frontmatter, style — live in the block's `SCHEMA.md`. Read it and follow it.

## References

- `references/workflow-cli.md` — amendment ritual via the CLI
- `references/workflow-manual.md` — amendment ritual via plain git
- `references/writing.md` — writing contract: placement, leaf shape, index discipline
- `references/linting.md` — conformance rules and how to check them
- `references/reorg.md` — consolidating, merging, or retiring leaves
