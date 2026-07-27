import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lint } from "../index";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "folio-v02-"));
	mkdirSync(join(dir, "leaves"));
	writeFileSync(
		join(dir, "index.md"),
		"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n",
	);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(path: string, content: string) {
	const file = join(dir, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

function leaf(title = "Project roadmap", description = "Project direction.") {
	return `---\ntype: Project\ntitle: ${title}\ndescription: ${description}\n---\n\n# ${title}\n`;
}

function issues(check: string) {
	return lint(dir).issues.filter((issue) => issue.check === check);
}

describe("Folio v0.2 lint", () => {
	test("accepts a flat, fully indexed block", () => {
		write("leaves/project-roadmap.md", leaf());
		write(
			"index.md",
			"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n\n- [[project-roadmap]] — Project direction.\n",
		);
		expect(lint(dir).issues).toEqual([]);
	});

	test("requires leaves and root index metadata", () => {
		rmSync(join(dir, "leaves"), { recursive: true });
		writeFileSync(join(dir, "index.md"), "# Index\n");
		expect(issues("structure").map((issue) => issue.message)).toContain(
			"missing required leaves/ directory",
		);
		expect(issues("frontmatter")).toHaveLength(1);
	});

	test("requires every leaf's metadata", () => {
		write("leaves/project-roadmap.md", "# Roadmap\n");
		write(
			"index.md",
			"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n\n- [[project-roadmap]] — Project direction.\n",
		);
		expect(issues("frontmatter").map((issue) => issue.message)).toContain(
			"missing required YAML frontmatter (type, title, description)",
		);
	});

	test("requires nested indexes and indexes leaves locally", () => {
		write("leaves/projects/project-roadmap.md", leaf());
		write(
			"index.md",
			"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n",
		);
		expect(issues("structure")).toHaveLength(1);
		expect(issues("orphan")).toHaveLength(1);
	});

	test("accepts a nested leaf indexed by its directory", () => {
		write("leaves/projects/project-roadmap.md", leaf());
		write(
			"leaves/projects/index.md",
			"# Projects\n\n- [[project-roadmap]] — Project direction.\n",
		);
		write(
			"index.md",
			"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n\n- [Projects](leaves/projects/index.md) — Projects.\n",
		);
		expect(lint(dir).issues).toEqual([]);
	});

	test("rejects duplicate leaf names and qualified links", () => {
		write("leaves/a/project-roadmap.md", leaf());
		write("leaves/b/project-roadmap.md", leaf());
		write(
			"leaves/a/index.md",
			"# A\n\n- [[a/project-roadmap]] — Project direction.\n",
		);
		write(
			"leaves/b/index.md",
			"# B\n\n- [[b/project-roadmap]] — Project direction.\n",
		);
		write(
			"index.md",
			"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n\n- [A](leaves/a/index.md) — A.\n- [B](leaves/b/index.md) — B.\n",
		);
		expect(issues("duplicate-leaf-name")).toHaveLength(2);
		expect(issues("path-link")).toHaveLength(2);
	});

	test("requires synchronized structural descriptions", () => {
		write("leaves/project-roadmap.md", leaf());
		write(
			"index.md",
			"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n\n- [[project-roadmap]] — Different direction.\n",
		);
		expect(issues("description-sync")).toHaveLength(1);
	});

	test("rejects Markdown links to leaves", () => {
		write("leaves/project-roadmap.md", leaf());
		write(
			"index.md",
			"---\ntitle: Team knowledge\ndescription: Team context.\n---\n\n# Index\n\n- [Roadmap](leaves/project-roadmap.md) — Project direction.\n",
		);
		expect(issues("markdown-leaf-link")).toHaveLength(1);
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
