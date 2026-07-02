# Folio

Folio is a local-first Markdown knowledgebase.

It combines:

- **Folio CLI** — bind a repo, create amendment worktrees, lint folios, and sync changes for review. See [`packages/cli`](packages/cli/README.md).
- **Folio Knowledge Format** — linked Markdown with concise pages, stable names, useful `INDEX.md` maps, `SCHEMA.md` conventions, and bracket links. See [`SPEC.md`](SPEC.md).
- **Folio skill** — publishable agent guidance for reading, writing, linting, and reviewing folios. See [`skills/folio`](skills/folio).
- **Web review surface** — in-progress UI for reviewing and publishing changes. See [`apps/web`](apps/web/README.md).

> Folio is in early stage development.

## Packages

- [`packages/cli`](packages/cli/README.md) — command-line workflow
- [`packages/core`](packages/core) — shared core logic
- [`packages/github`](packages/github) — GitHub integration helpers
- [`apps/web`](apps/web/README.md) — web review surface
- [`skills/folio`](skills/folio) — publishable Folio agent skill bundle

## Development

```bash
bun install
bun run lint
bunx tsc --noEmit
bun run --filter @folio/cli build
```

## License

Not yet declared.
