# Manual draft workflow

Use this workflow only when the `folio` CLI is unavailable. If the CLI is available, use `workflow-cli.md` instead.

## Non-negotiable boundary

- The default branch is published truth; never commit or push a draft directly to it.
- Work on one `amend/<topic>` branch per coherent change.

## Draft lifecycle

1. Bring the default branch current.

   ```sh
   git switch <default-branch>
   git pull --ff-only
   ```

2. Create the draft branch.

   ```sh
   git switch -c amend/<topic>
   ```

3. Edit only the topical leaves for that draft.
4. Run the checklist in `references/linting.md`.
5. Commit the draft.

   ```sh
   git add -A
   git commit -m "<short message>"
   ```

6. Push the branch and open a draft PR.

   ```sh
   git push -u origin amend/<topic>
   gh pr create --draft --title "<title>" --body "<body>"
   ```

7. Wait for human review and ready status. Never run `gh pr ready`.
8. After the human squash-merges the PR, update the default branch and delete the local draft branch.

   ```sh
   git switch <default-branch>
   git pull --ff-only
   git branch -d amend/<topic>
   ```

## Conditions

- Without a GitHub remote, use the same branch, edit, lint, and review discipline. Squash-merge into the default branch only with explicit human approval.
- If another draft lands before this one, rebase this draft onto the updated default branch, rerun the checklist, and push the result before merge.

## Rules

- Treat drafts as pending knowledge, not published truth.
- Keep one coherent change per draft.
- A human marks draft PRs ready.
- Squash-merge approved drafts.
