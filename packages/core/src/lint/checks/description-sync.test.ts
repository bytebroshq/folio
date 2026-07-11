import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lint } from "../index";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "folio-description-sync-"));
	writeFileSync(join(dir, "SCHEMA.md"), "# SCHEMA\n");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function write(name: string, content: string) {
	writeFileSync(join(dir, name), content);
}

function descriptionSyncIssues(spec?: string) {
	return lint(dir, spec ? { spec } : {}).issues.filter(
		(issue) => issue.check === "description-sync",
	);
}

describe("descriptionSyncCheck", () => {
	test("no issue when leaf description matches index entry exactly", () => {
		write(
			"project-roadmap.md",
			"---\ndescription: Product build path.\n---\n\n# Roadmap\n",
		);
		write(
			"INDEX.md",
			"# Index\n\n- [[project-roadmap]] — Product build path.\n",
		);

		expect(descriptionSyncIssues()).toEqual([]);
	});

	test("errors when leaf description and index entry text differ", () => {
		write(
			"project-roadmap.md",
			"---\ndescription: Product build path.\n---\n\n# Roadmap\n",
		);
		write(
			"INDEX.md",
			"# Index\n\n- [[project-roadmap]] — A totally different summary.\n",
		);

		const issues = descriptionSyncIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]?.severity).toBe("error");
		expect(issues[0]?.message).toContain("Product build path.");
		expect(issues[0]?.message).toContain("A totally different summary.");
	});

	test("errors when index entry has no description text", () => {
		write(
			"project-roadmap.md",
			"---\ndescription: Product build path.\n---\n\n# Roadmap\n",
		);
		write("INDEX.md", "# Index\n\n- [[project-roadmap]]\n");

		const issues = descriptionSyncIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]?.message).toContain("Product build path.");
	});

	test("no issue when leaf has no description field", () => {
		write("project-roadmap.md", "# Roadmap\n\nNo frontmatter here.\n");
		write(
			"INDEX.md",
			"# Index\n\n- [[project-roadmap]] — Whatever the index says.\n",
		);

		expect(descriptionSyncIssues()).toEqual([]);
	});

	test("no issue when leaf has a description but no matching index entry", () => {
		write(
			"project-roadmap.md",
			"---\ndescription: Product build path.\n---\n\n# Roadmap\n",
		);
		// Mentioned in prose, not as a list-entry per the §7 grammar.
		write("INDEX.md", "# Index\n\nSee also [[project-roadmap]] for details.\n");

		expect(descriptionSyncIssues()).toEqual([]);
	});

	test("ASCII hyphens are not treated as the index-entry delimiter", () => {
		write(
			"project-roadmap.md",
			"---\ndescription: Product build path.\n---\n\n# Roadmap\n",
		);
		write(
			"INDEX.md",
			"# Index\n\n- [[project-roadmap]] -- Product build path.\n",
		);

		expect(descriptionSyncIssues()).toEqual([]);
	});

	test("whitespace differences are normalized before comparing", () => {
		write(
			"project-roadmap.md",
			"---\ndescription: '  Product   build  path.  '\n---\n\n# Roadmap\n",
		);
		write(
			"INDEX.md",
			"# Index\n\n- [[project-roadmap]] — Product build path.\n",
		);

		expect(descriptionSyncIssues()).toEqual([]);
	});

	test.each([
		">",
		"|",
		">-",
		">+",
		"|-",
		"|+",
	])("supports %s multiline descriptions", (style) => {
		write(
			"project-roadmap.md",
			`---\ndescription: ${style}\n  Product build\n  path.\n---\n\n# Roadmap\n`,
		);
		write(
			"INDEX.md",
			"# Index\n\n- [[project-roadmap]] — Product build path.\n",
		);

		expect(descriptionSyncIssues()).toEqual([]);
	});
});
