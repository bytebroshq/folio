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
- `map` routes a request to one block's authored index.
- `drafts [binding]` inventories drafts across all blocks or one block.
- `status [binding]` reports all blocks or one block; `status <binding> --sync` syncs exactly one.
- `lint` checks every main; `lint <binding>` checks one main; `lint <binding>:<topic>` checks one draft.

Use these verbs instead of recreating their steps with Git. Reach for Git only when the user requests the manual workflow, no Folio verb covers the job, or the CLI fails.

## Draft lifecycle

1. Run `folio map`, choose the relevant binding, and read that block's index.
2. Run `folio status <binding> --sync` to bring that block current.
3. Run `folio draft <binding>:<topic>`.
4. Edit only the binding-specific amendment worktree reported by Folio.
5. Run `folio proof <binding>:<topic>`.
6. With `strategy: pr`, wait for human review and ready status.
7. Run `folio publish <binding>:<topic>`.
8. Run `folio status <binding>` to confirm the resulting state.

### Proof messages

Use `folio proof <binding>:<topic> -m '<message>'` when you have an intentional, polished summary of the amendment. The message is used for the commit; with PR strategy, its first line is the PR title and the full message is the PR body. Supplying `-m` on a later proof intentionally replaces the existing PR title and body. For routine follow-up proofs, omit `-m`: Folio uses the default `amend: <topic>` commit message and preserves existing PR metadata. Single-quote shell messages containing Markdown code spans or shell substitutions, and escape any embedded single quotes.

```sh
# Bad: the invoking shell may evaluate the Markdown code span.
folio proof personal:topic -m "Document `folio proof` behavior"

# Good: single quotes pass the message literally.
folio proof personal:topic -m 'Document `folio proof` behavior'

# Good for a longer message.
message='Document `folio proof` behavior'
folio proof personal:topic -m "$message"
```

## Conditions

- Pass the qualified `binding:topic` identity explicitly for interactive work.
- With `strategy: pr`, `proof` opens or updates a draft PR. A human marks it ready before `publish` squash-merges it.
- With `strategy: merge`, `proof` shows the rebased diff and `publish` squash-merges locally.
- `folio drop <binding>:<topic> --force` deletes a draft branch and worktree.

## Rules

- Never push directly to the default branch.
- Never mark a draft PR ready.
- Never convert a ready PR back to draft unless the user explicitly asks. Ready is the human approval signal for publishing.
- Keep one coherent change per draft.
- Treat drafts as pending knowledge, not published truth.
