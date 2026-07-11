# CLI draft workflow

## Non-negotiable boundary

- The bound checkout is the base store; it stays on `main`. Otherwise, surface to user.
- Edit only the draft worktree created by `folio draft`.

## Prefer Folio to Git

Use the Folio CLI for Folio work. Its verbs already own the Git steps:

- `draft` creates or resumes the isolated worktree.
- `proof` commits pending edits, lints, rebases, and pushes or shows the diff.
- `publish` lands reviewed work and cleans up.
- `drop` deletes the draft branch and worktree.
- `status` reports the bound store and every draft.
- `status --sync` fetches, fast-forwards the bound store when needed, and reports state; use it before drafting.

Use these verbs instead of recreating their steps with Git. Reach for Git only when the user requests the manual workflow, no Folio verb covers the job, or the CLI fails.

## Draft lifecycle

1. Run `folio status --sync` to bring the store current and orient to its state and existing drafts.
2. Run `folio draft <topic>`.
3. Edit only `~/.config/folio/stores/amendments/<topic>/`.
4. Run `folio proof <topic>`.
5. With `strategy: pr`, wait for human review and ready status.
6. Run `folio publish <topic>`.
7. Run `folio status` to confirm the resulting state.

## Conditions

- Pass the topic explicitly for interactive work.
- With `strategy: pr`, `proof` opens or updates a draft PR. A human marks it ready before `publish` squash-merges it.
- With `strategy: merge`, `proof` shows the rebased diff and `publish` squash-merges locally.
- `folio drop <topic> --force` deletes a draft branch and worktree.

## Rules

- Never push directly to the default branch.
- Never mark a draft PR ready.
- Keep one coherent change per draft.
- Treat drafts as pending knowledge, not published truth.
