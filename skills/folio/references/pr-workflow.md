# Folio PR workflow

Folio knowledge changes stay pending until merged into `main`. How that merge
happens depends on how the folio is bound — check `folio config` for a
`source` value (local mode) vs a `remote` value (GitHub mode).

## Rules

- Published truth is merged `main`.
- Amendments are pending knowledge; surface them when relevant, but do not silently adopt them.
- Prefer small topical amendments.
- Never run `gh pr ready` — flipping a draft PR to ready is a human-only act on GitHub.
- Use squash merges for final publication, preserving PR title/body with `(#N)` in the subject.

## Normal flow

```bash
folio draft <topic>
# edit Markdown leaves in ~/.config/folio/stores/amendments/<topic>/
folio save -m "short message"
folio proof     # lint + rebase; push + open/update draft PR (pr) or show diff (local)
```

## GitHub mode (`remote` set)

`folio proof` pushes the amendment branch and opens or updates a draft PR.
A human reviews the draft PR on GitHub and marks it ready. Once ready:

```bash
folio publish
```

## Local mode (`source` set)

`folio proof` lints, rebases onto `main`, and shows the diff — there is no
remote or PR. When the amendment should become canonical:

```bash
folio publish
```

## After merge

```bash
folio status --update   # fast-forward local main
folio lint --strict
```
