# Folio reorg guide

Playbook for consolidating or restructuring leaves (merging pages, retiring
stale ones, renaming). Distilled from the folio-leaves reorg (9 → 6 leaves).

## When to reorg

Signals a topic's leaves have drifted:

- multiple leaves cover overlapping ground (design notes vs shipped truth)
- leaves frame superseded artifacts as current (old prototypes, dead repos)
- INDEX.md descriptions no longer match what the leaves actually say
- readers (or agents) keep pulling stale context from the wrong leaf

## Principles

- **One amendment.** A reorg is a single coherent change; do it as one
  amendment / one draft PR, not a trickle of per-file edits.
- **Current truth only.** Leaves describe what is true now. Design-session
  history, migration narratives, and "two homes during transition" framing
  belong in git/PR records, not in the leaf body.
- **Merge down, don't fork.** Fold design/redesign scratch leaves into the
  canonical leaf once shipped, then delete the scratch leaf.
- **Retired means retired.** If an old artifact must be mentioned, name it
  once as retired/superseded — never present it alongside the current one as
  a parallel option.

## Procedure

1. Map the topic: list every leaf touching it via `INDEX.md` and grep.
2. Decide the target set of leaves (fewer, each with one clear job).
3. `folio draft <topic-reorg>` (one amendment for the whole reorg).
4. Rewrite/merge/delete leaves. For each surviving leaf, sweep for stale
   framing: old repo names, "prototype", "transition", migration arrows
   (`old → new`), dual-home language.
5. Update `INDEX.md`: remove deleted leaves, reframe descriptions of changed
   ones.
6. Fix all inbound wikilinks to deleted/renamed leaves.
7. `folio save -m "..."` then `folio proof` — lint must be clean (broken
   links, stale index entries, orphans are the common reorg failures).
8. Draft PR stays draft; a human marks it ready on GitHub. Never run
   `gh pr ready`.

## Stale-framing sweep

After the structural work, grep the touched leaves for leftovers:

```bash
grep -rn -e 'prototype' -e 'transition' -e '→' -e '<old-repo-name>' <leaves>
```

Every hit should either be deleted or rewritten as a one-line "retired,
superseded by X" note. Repeat until clean — stale framing tends to survive
in tables and asides even after the prose is fixed.
