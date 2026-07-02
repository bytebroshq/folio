# Folio skill

This directory is the source copy of the Folio agent skill.

It is intentionally shaped as a portable skill bundle:

- `SKILL.md` is the entry point.
- Supporting guidance lives in adjacent Markdown files.
- Links from `SKILL.md` are relative, so the directory can be copied or symlinked into a skill loader.

Local install example:

```bash
mkdir -p ~/.agents/skills
ln -s /path/to/bytebroshq/folio/.agents/skills/folio ~/.agents/skills/folio
```

Future distribution can publish this same directory to a skill registry without changing the content contract.
