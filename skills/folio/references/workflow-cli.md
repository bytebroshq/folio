# Folio draft workflow — CLI

When the `folio` CLI is installed, the ritual is:

```bash
folio draft <topic>     # opens a draft worktree on the amend/<topic> branch
# edit leaves in the worktree; keep the delta small and topical
folio save -m "..."     # commits the change
folio proof             # lints, rebases onto the default branch, pushes, opens/updates a draft PR
# a human reviews and marks the PR ready on GitHub
folio publish           # squash-merges after human approval; cleans up the branch
```

## Strategy

`folio config` reports the binding: a `remote` value (e.g. `owner/repo`) means GitHub mode; a `source` value means local mode.

- **GitHub mode** — `proof` pushes the `amend/` branch and opens or updates a draft PR. `publish` squash-merges into the default branch.
- **Local mode** — no remote or PR. `proof` lints, rebases onto the default branch, and shows the diff. `publish` merges when the human says so.

## Rules

- The merged default branch is published truth. Never push to it directly.
- Folio drafts are pending knowledge; surface them as pending, don't adopt them silently as truth.
- One coherent change per draft; keep deltas small and topical.
- **Flipping a draft PR to ready is a human act.** The CLI never does it, and an agent must not do it via `gh`.
- Squash-merge on publish, preserving the PR title/body with `(#N)` in the subject.

## Abandon

```bash
folio drop              # deletes the amend/ branch and worktree
```

## After merge

```bash
folio status            # confirms the default branch is current
```
