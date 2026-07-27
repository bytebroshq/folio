import type { LintSpec } from "./types";

export const folioSpec: LintSpec = {
	id: "folio",
	label: "Folio Knowledge Format",
	requiredRootFiles: ["index.md"],
	structuralFiles: ["index.md", "conventions.md"],
	ignoredDirs: [".git", "node_modules", "dist", "build", ".wrangler"],
	leafFilenamePattern: /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
	leafFilenameDescription: "kebab-case filename, e.g. folio-roadmap.md",
	maxPreferredNestingDepth: 2,
	pathLinkWarnThreshold: 0,
	leafTokenWarn: 10_000,
};

const specs = new Map<string, LintSpec>([[folioSpec.id, folioSpec]]);

export function getLintSpec(id = "folio"): LintSpec {
	const spec = specs.get(id);
	if (!spec) {
		throw new Error(
			`Unknown lint spec '${id}'. Available specs: ${listLintSpecs().join(", ")}`,
		);
	}
	return spec;
}

export function listLintSpecs(): string[] {
	return [...specs.keys()].sort();
}
