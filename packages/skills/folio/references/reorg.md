# Folio reorganization

Use a reorganization to consolidate overlapping leaves, remove superseded context, or rename a topic. Follow the normal draft lifecycle in `workflow-cli.md`; this guide owns the content work inside that draft.

## When to reorganize

- Multiple leaves cover the same subject.
- A leaf presents a retired artifact as current.
- An `INDEX.md` description no longer describes its leaf.
- Readers or agents repeatedly find stale context first.

## Target state

- Keep the smallest useful set of leaves; each surviving leaf has one clear job.
- Leaves describe current truth, not the migration or design-session history that produced it.
- Fold shipped scratch or redesign leaves into the canonical leaf, then delete them.
- Name a retired artifact only when needed, once, as retired or superseded.

## Reorganization lifecycle

1. Run `folio status --sync`.
2. Map the topic: read its `INDEX.md` entries and search all leaves that mention it.
3. Decide the surviving canonical leaves before editing.
4. Run `folio draft <topic-reorg>`.
5. In that worktree, merge current material into the canonical leaves and delete superseded leaves.
6. Update `INDEX.md` and every inbound wikilink for deleted or renamed leaves.
7. Search touched leaves for stale names and framing: old repository names, `prototype`, `transition`, `→`, and dual-home language. Remove each hit or reduce it to one retired/superseded note.
8. Run `folio proof <topic-reorg>`.
9. Follow the normal human-review and publish steps.

## Rules

- Keep the entire reorganization in one draft.
- Do not retain a transition narrative in a current leaf.
- Do not leave two leaves presenting alternative current homes for the same thing.
- Treat broken links, stale index entries, and orphan leaves as reorganization failures.
