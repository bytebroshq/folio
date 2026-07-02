# Folio linting guide

Run strict lint before syncing Folio changes:

```bash
folio lint --strict
```

Folio lint is mechanical and deterministic. It checks structure only:

- root `INDEX.md` exists
- root `SCHEMA.md` exists
- filenames are kebab-case
- bracket links resolve to existing `.md` files
- relative path markers in bracket links (`./`, `../`)
- stale index entries
- orphan leaves
- duplicate index entries
- frontmatter shape, when present
- oversized leaves

Flat or shallow structure is preferred, but nesting is not a format failure.
A linter may warn about deep nesting or path-heavy catalogs as usability issues.

Strict lint should fail on errors, not warnings.

It must not use semantic ranking, RAG, or LLM inference to decide validity.

Use `folio lint --json` for machine-readable output.
Use `folio lint --spec folio` to select the Folio Knowledge Format explicitly.
