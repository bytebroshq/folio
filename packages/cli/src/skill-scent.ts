/**
 * Skill scent: the bound block's INDEX.md may carry frontmatter with a
 * `description` field — one authored sentence naming what the block covers
 * (SPEC.md §7). The CLI stamps that sentence into the installed skill's own
 * frontmatter `description` as a "Bound folio: <scent>" suffix, so agent
 * harnesses that keep a skill's description always-in-context pick up topic
 * mentions for whatever block is currently bound.
 *
 * Deliberately mechanical — small line-level string handling, no YAML
 * library. @folio/core's lint checks do the same for leaf frontmatter, but
 * don't export the helper publicly, so this stays CLI-local rather than
 * growing that package's surface for a single call site.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SUFFIX_RE = /[ \t]*Bound folio:.*$/;
const SUFFIX_CAPTURE_RE = /Bound folio:[ \t]*(.*)$/;

function fieldLineRe(field: string): RegExp {
	return new RegExp(`^${field}:[ \\t]*(.*)$`, "m");
}

function unquote(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		try {
			return JSON.parse(value);
		} catch {
			return value.slice(1, -1);
		}
	}
	if (value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1);
	}
	return value;
}

/** Locate the frontmatter block's line range, or null if there isn't one. */
function frontmatterRange(
	lines: string[],
): { start: number; end: number } | null {
	if (lines[0]?.trim() !== "---") return null;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") return { start: 1, end: i };
	}
	return null;
}

/**
 * Extract a single-line frontmatter field's raw text value, unquoting one
 * layer. Not a YAML parser — matches a `field: value` line inside the
 * frontmatter block.
 */
function frontmatterField(content: string, field: string): string | undefined {
	const lines = content.split("\n");
	const range = frontmatterRange(lines);
	if (!range) return undefined;

	const re = fieldLineRe(field);
	for (let i = range.start; i < range.end; i++) {
		const match = (lines[i] as string).match(re);
		if (match) return unquote(match[1].trim());
	}
	return undefined;
}

/**
 * The block's "scent": INDEX.md's frontmatter `description`, one authored
 * sentence naming what the block covers. Null when the block has no
 * INDEX.md, no frontmatter, or an empty/absent description field.
 */
export function readIndexDescription(repoRoot: string): string | null {
	const indexPath = join(repoRoot, "INDEX.md");
	if (!existsSync(indexPath)) return null;

	const value = frontmatterField(
		readFileSync(indexPath, "utf-8"),
		"description",
	);
	return value && value.trim() !== "" ? value.trim() : null;
}

/** Strip any existing "Bound folio: ..." suffix, returning the stock text. */
export function stripScent(description: string): string {
	return description.replace(SUFFIX_RE, "").trimEnd();
}

/** The scent currently stamped into a description, if any. */
export function extractScent(description: string): string | null {
	const match = description.match(SUFFIX_CAPTURE_RE);
	const scent = match?.[1]?.trim();
	return scent && scent !== "" ? scent : null;
}

/**
 * Idempotently apply (or clear) the scent suffix on a description. Always
 * strips any prior suffix first, so re-stamping never appends twice.
 */
export function stampScent(description: string, scent: string | null): string {
	const stock = stripScent(description);
	return scent ? `${stock} Bound folio: ${scent}` : stock;
}

/** The raw `description` frontmatter value of an installed SKILL.md, if any. */
export function readSkillDescription(skillPath: string): string | undefined {
	if (!existsSync(skillPath)) return undefined;
	return frontmatterField(readFileSync(skillPath, "utf-8"), "description");
}

/**
 * Re-stamp an installed SKILL.md's frontmatter `description` in place from
 * `repoRoot`'s current INDEX scent (null scent clears any suffix). No-op
 * when the file doesn't exist or has no frontmatter `description` field.
 * Normalizes the rewritten value to a quoted YAML scalar — valid regardless
 * of whether the stock text was a plain or quoted scalar going in.
 */
export function restampSkillFile(skillPath: string, repoRoot: string): void {
	if (!existsSync(skillPath)) return;

	const content = readFileSync(skillPath, "utf-8");
	const lines = content.split("\n");
	const range = frontmatterRange(lines);
	if (!range) return;

	const re = fieldLineRe("description");
	let descLine = -1;
	for (let i = range.start; i < range.end; i++) {
		if (re.test(lines[i] as string)) {
			descLine = i;
			break;
		}
	}
	if (descLine === -1) return;

	const current = unquote(
		(lines[descLine] as string).replace(/^description:[ \t]*/, "").trim(),
	);
	const scent = readIndexDescription(repoRoot);
	const next = stampScent(current, scent);
	if (next === current) return;

	lines[descLine] = `description: ${JSON.stringify(next)}`;
	writeFileSync(skillPath, lines.join("\n"), "utf-8");
}
