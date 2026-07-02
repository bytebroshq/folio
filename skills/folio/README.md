# Folio skill

This directory is the source bundle for the Folio agent skill.

It is intentionally shaped as a publishable skill artifact:

- `SKILL.md` is the entry point.
- Supporting guidance lives in adjacent Markdown files.
- Links from `SKILL.md` are relative, so the directory can be copied, symlinked, packaged, or published by a skill registry.

Local install example:

```bash
mkdir -p ~/.agents/skills
ln -s /path/to/bytebroshq/folio/skills/folio ~/.agents/skills/folio
```

Future distribution can publish this same directory to a registry without changing the content contract.
