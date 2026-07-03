# Folio linting guide

Lint rules are conformance rules from SPEC.md §11 — properties of the files
themselves, mechanical and deterministic. The CLI checks them fast; every one
of them can also be verified by hand. Lint MUST NOT use semantic ranking,
RAG, or LLM inference to decide validity.

## The rules

- root `INDEX.md` exists
- root `SCHEMA.md` exists
- filenames are kebab-case
- bracket links resolve to existing `.md` files
- no relative path markers in bracket links (`./`, `../`)
- no stale index entries (index links to deleted/renamed leaves)
- no orphan leaves (leaf missing from `INDEX.md` without deliberate reason)
- no duplicate index entries
- frontmatter is well-formed YAML, when present
- leaves are not oversized

Flat or shallow structure is preferred, but nesting is not a format failure —
a linter may warn about deep nesting or path-heavy catalogs as usability
issues. Strict lint fails on errors, not warnings.

## With the CLI

```bash
folio lint --strict        # fail on errors
folio lint --json          # machine-readable output
folio lint --spec folio    # select the Folio Knowledge Format profile explicitly
folio lint --spec okf      # lint an OKF bundle by its own rules instead
```

`folio proof` runs lint automatically before staging an amendment for review.

## By hand

From the folio root:

```bash
ls INDEX.md SCHEMA.md                              # reserved files exist
ls *.md | grep -E '[A-Z_ ]'                        # kebab-case violations (ignore reserved files)
grep -rno '\[\[[^]]*\]\]' --include='*.md' .       # list all wikilinks…
grep -rn '\[\[\.\.\?/' --include='*.md' .          # …relative path markers
```

Then check, leaf by leaf against the link list:

- every `[[target]]` has a matching `target.md` (folio-root-relative)
- every entry in `INDEX.md` points at an existing leaf, exactly once
- every leaf appears in `INDEX.md` (or its absence is deliberate)
- frontmatter blocks parse as YAML
- no leaf has grown past a comfortable read (split or reorg if so)
