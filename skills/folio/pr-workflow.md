# Folio PR workflow

Folio knowledge changes are draft PRs until merged.

## Rules

- Published truth is merged `main`.
- Amendments are pending knowledge; surface them when relevant, but do not silently adopt them.
- Prefer small topical amendments.
- Run `folio lint --strict` before syncing.
- Use squash merges for final publication.
- Preserve PR title/body in the squash merge where possible, with `(#N)` in the subject.

## Normal flow

```bash
folio switch -c <topic>
# edit Markdown leaves
folio lint --strict
folio sync -m "short message"
```

Review the draft PR, then mark ready and squash merge when the content should become canonical.

## After merge

Pull local main and verify lint:

```bash
cd ~/.config/folio/stores/.main
git pull --ff-only
folio lint --strict
```
