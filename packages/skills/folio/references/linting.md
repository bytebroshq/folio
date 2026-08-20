# Folio linting

Lint checks deterministic structural conformance. It does not judge meaning, rank content, or use LLM inference.

## What lint checks

- Root `index.md` and `leaves/` exist.
- Root-index `title` and `description` frontmatter exists.
- Leaves live below `leaves/` and have non-empty `type`, `title`, and `description` frontmatter.
- Leaf filenames are globally unique lowercase kebab-case names.
- Wikilinks resolve to leaves and use bare names only.
- Each directory containing leaves has an `index.md`.
- Every leaf appears once in its responsible structural index.
- Structural-index descriptions match leaf `description` frontmatter after whitespace normalization.
- Present frontmatter uses supported YAML syntax.
- Leaves stay within the size warning limit.

Deep nesting and Markdown outside `leaves/` may be warnings, not format failures.

## Prefer `proof` over `lint`

Use `folio proof <binding>:<topic>` for a draft; it commits, lints, rebases, and prepares review. Use `folio lint` with an explicit scope for read-only checks.

```sh
folio lint <binding>         # check one binding main
folio lint <binding>:<topic> # check one qualified draft
folio lint --all            # explicitly check every binding main
folio lint <binding> --json # direct machine-readable lint result
folio lint --all --json     # binding-qualified aggregate results
folio lint <binding> --spec folio # select the Folio profile
```

## Without the CLI

Use a mechanical checker, not semantic or LLM judgment:

1. Identify root `index.md`, `leaves/`, nested indexes, and leaves.
2. Validate leaf metadata and globally unique filenames.
3. Resolve bare wikilinks against leaf names.
4. Verify every leaf has one local structural-index entry.
5. Compare entry descriptions with leaf frontmatter after whitespace normalization.
6. Measure leaf size and report errors separately from usability warnings.

Do not add the checker to the Folio repository unless the user asks. Fix errors and repeat the check.
