# Folio review workflow

Folio knowledge changes stay pending until merged into `main`. How that merge
happens depends on how the folio is bound — check `folio config` for a
`source` value (local mode) vs a `remote` value (GitHub mode).

## Rules

- Published truth is merged `main`.
- Amendments are pending knowledge; surface them when relevant, but do not silently adopt them.
- Prefer small topical amendments.
- Run `folio lint --strict` before syncing.
- In GitHub mode, use squash merges for final publication and preserve PR
  title/body where possible, with `(#N)` in the subject.

## Normal flow

```bash
folio switch -c <topic>
# edit Markdown leaves
folio lint --strict
folio sync -m "short message"
```

## GitHub mode (`remote` set)

`folio sync` pushes the amendment branch and opens or updates a draft PR.
Review the draft PR, then mark ready and squash merge when the content
should become canonical.

After merge, pull local main and verify lint:

```bash
cd ~/.config/folio/stores/.main
git pull --ff-only
folio lint --strict
```

## Local mode (`source` set)

`folio sync` commits and rebases the amendment onto `main` in the bound
repo, but does not push or open a PR — there is no remote. It prints the
merge command to run when the amendment is ready:

```bash
git -C <bound-repo-path> merge amend/<topic>
```

Merge with plain git (or open a PR by hand if the bound repo has its own
remote/review process). After merging, drop the amendment:

```bash
folio drop <topic> --force
folio lint --strict
```
