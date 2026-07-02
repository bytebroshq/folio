import type { LintSpec } from "./types";

export const folioSpec: LintSpec = {
	id: "folio",
	label: "Folio Knowledge Format",
	requiredRootFiles: ["INDEX.md", "SCHEMA.md"],
	structuralFiles: [
		"INDEX.md",
		"SCHEMA.md",
		"AGENTS.md",
		"README.md",
		"SPEC.md",
	],
	leafFilenamePattern: /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
	leafFilenameDescription: "kebab-case filename, e.g. folio-roadmap.md",
	maxPreferredNestingDepth: 1,
	pathLinkWarnThreshold: 10,
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
