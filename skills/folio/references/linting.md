# Folio linting

Lint checks deterministic file conformance. It does not judge meaning, rank content, or use LLM inference.

## What lint checks

- Root `INDEX.md` and `SCHEMA.md` exist.
- Leaf filenames are kebab-case.
- Bracket links resolve and do not use `./` or `../`.
- `INDEX.md` has no stale or duplicate entries, and every leaf appears there.
- Index descriptions match a leaf's `description` frontmatter after whitespace normalization.
- Frontmatter is valid YAML.
- Leaves stay within the size limit.

Deep nesting and path-heavy catalogs are warnings, not format failures.

## Prefer `proof` over `lint`

Use `folio proof <topic>` for a draft; it commits, lints, rebases, and prepares review. Use `folio lint` only for read-only checks.

```sh
folio lint --strict        # check the bound base store; fail on errors
folio lint <topic>         # check a draft without preparing it
folio lint --json          # machine-readable output
folio lint --spec folio    # select the Folio profile
folio lint --spec okf      # select the OKF profile
```

## Without the CLI

Write a small temporary checker for the contract above; do not use semantic or LLM judgment.

1. Recursively collect Markdown files and identify reserved roots and leaves.
2. Validate leaf filenames.
3. Extract bracket links and verify their root-relative targets.
4. Compare `INDEX.md` entries with the leaf set for missing, stale, and duplicate entries.
5. Parse frontmatter and compare index descriptions after whitespace normalization.
6. Measure each leaf against the size limit.
7. Report errors separately from structural warnings.

Do not add the checker to the Folio repository unless the user asks. Fix errors and repeat the check.
