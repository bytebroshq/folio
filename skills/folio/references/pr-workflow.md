# Folio amendment & publication workflow

Folio knowledge changes stay pending until merged into `main`. This ritual
works with plain git; the CLI automates it verb-for-verb.

## Rules

- Published truth is merged `main`. Never push to `main` directly.
- Amendments are pending knowledge; surface them when relevant, but do not silently adopt them.
- Prefer small topical amendments — one coherent change per branch/PR.
- Never run `gh pr ready` — flipping a draft PR to ready is a human-only act.
- Squash-merge for final publication, preserving PR title/body with `(#N)` in the subject.

## Manual ritual (no CLI)

```bash
git switch -c amend/<topic> main
# edit leaves; keep the delta small and topical
# hand-lint: see references/linting.md checklist
git add -A && git commit -m "short message"
git push -u origin amend/<topic>
gh pr create --draft --title "..." --body "..."   # or open the PR on the web
```

A human reviews and marks the PR ready on GitHub. After the squash merge:

```bash
git switch main && git pull --ff-only
git branch -d amend/<topic>
```

No GitHub remote? Same discipline locally: branch, edit, lint, then merge to
`main` only on explicit human approval.

## CLI ritual

Check `folio config` for binding: a `remote` value means GitHub mode, a
`source` value means local mode.

| step | manual | CLI |
|---|---|---|
| open amendment | `git switch -c amend/<topic>` | `folio draft <topic>` |
| record edits | `git add && git commit` | `folio save -m "..."` |
| validate + stage for review | hand-lint, rebase, push, draft PR | `folio proof` |
| publish after human approval | squash merge + branch cleanup | `folio publish` |
| abandon | delete branch | `folio drop` |

In GitHub mode, `folio proof` pushes the amendment branch and opens or
updates a draft PR. In local mode there is no remote or PR: `proof` lints,
rebases onto `main`, and shows the diff; `publish` merges when the human
says so.

## After merge

```bash
folio status --update   # or: git switch main && git pull --ff-only
folio lint --strict     # or the manual checklist
```
