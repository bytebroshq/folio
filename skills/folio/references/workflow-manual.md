# Folio draft workflow — manual

When the `folio` CLI is not installed, the ritual uses plain git and the GitHub CLI (or the web). The CLI ritual (`workflow-cli.md`) follows the same shape verb-for-verb if the CLI is available later.

## Manual ritual

```bash
git switch -c amend/<topic> <default-branch>
# edit leaves; keep the delta small and topical
# hand-lint against references/linting.md
git add -A && git commit -m "short message"
git push -u origin amend/<topic>
gh pr create --draft --title "..." --body "..."   # or open the PR on the web
```

A human reviews and marks the PR ready on GitHub. After the squash merge:

```bash
git switch <default-branch> && git pull --ff-only
git branch -d amend/<topic>
```

No GitHub remote? Same discipline locally: branch, edit, lint, then merge into the default branch only on explicit human approval.

## Rules

- The merged default branch is published truth. Never push to it directly.
- Folio drafts are pending knowledge; surface them as pending, don't adopt them silently as truth.
- One coherent change per draft; keep deltas small and topical.
- **Flipping a draft PR to ready is a human act.** Never run `gh pr ready`; let the human do it on GitHub.
- Squash-merge on publish, preserving the PR title/body with `(#N)` in the subject.

## After merge

Run the lint checklist in `references/linting.md` against the merged result if anything seems off.
