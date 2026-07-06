# Folio draft workflow — CLI

When the `folio` CLI is installed, the ritual is:

```bash
folio draft cubby-org-model                                  # opens a draft worktree on amend/cubby-org-model
# edit leaves in the worktree; keep the delta small and topical
folio save cubby-org-model -m "..." && folio proof cubby-org-model
# a human reviews and marks the PR ready on GitHub
folio publish cubby-org-model                                 # squash-merges after human approval; cleans up the branch
```

Every draft verb — `save`, `proof`, `publish`, `drop`, `lint` — takes its
topic explicitly. This is what makes concurrent drafts safe: nothing is
shared between processes, so one agent's draft can never be hijacked by
another's. Chain steps with `&&`, naming the topic once per command; verbs
stay single-purpose (`proof` saves any pending edits in the worktree it's
already given before it lints, but there's no combined "save and publish"
verb — publish still requires its own explicit run).

## FOLIO_DRAFT

A script or hook that wraps the whole ritual in one process can set
`FOLIO_DRAFT` once instead of repeating the topic every call:

```bash
export FOLIO_DRAFT=cubby-org-model
folio save -m "..." && folio proof
```

Resolution order: explicit argument, then `$FOLIO_DRAFT`, then an error
that names the fix. Interactive agents should keep passing the topic
explicitly — env doesn't survive between tool calls, and the topic in the
command self-documents the transcript.

## Strategy

`folio config` reports the binding as three keys: `remote` (owner/repo, if GitHub-backed), `path` (where the checkout lives), and `strategy` — which names what `publish` does.

- **`strategy: pr`** — `proof` pushes the `amend/` branch and opens or updates a draft PR. `publish` squash-merges into the default branch.
- **`strategy: merge`** — no PR. `proof` lints, rebases onto the default branch, and shows the diff. `publish` merges when the human says so.

## Multiplayer semantics

Drafts are independent worktrees; multiple agents can draft, save, and
proof concurrently without interfering. `proof` rebases onto the default
branch each time, so publish order across drafts doesn't matter — when one
draft lands, the others simply re-proof against the new default branch. A
rebase conflict touching the same leaf surfaces to exactly one agent, with
the worktree path to resolve it in.

## Rules

- The merged default branch is published truth. Never push to it directly.
- Folio drafts are pending knowledge; surface them as pending, don't adopt them silently as truth.
- One coherent change per draft; keep deltas small and topical.
- **Flipping a draft PR to ready is a human act.** The CLI never does it, and an agent must not do it via `gh`.
- Squash-merge on publish, preserving the PR title/body with `(#N)` in the subject.

## Abandon

```bash
folio drop cubby-org-model --force   # deletes the amend/ branch and worktree
```

## After merge

```bash
folio status            # fleet dashboard: every open draft, plus the default branch's state
```
