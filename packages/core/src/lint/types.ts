export type LintSeverity = "error" | "warn";

export interface LintIssue {
	check: string;
	severity: LintSeverity;
	file: string;
	line?: number;
	message: string;
}

export interface LintResult {
	spec: string;
	issues: LintIssue[];
}

export interface Wikilink {
	link: string;
	line: number;
}

export interface LintFileSet {
	allMdFiles: string[];
	rootMdFiles: string[];
	contentLeafFiles: string[];
}

export interface LintContext {
	storeDir: string;
	files: LintFileSet;
	spec: LintSpec;
}

export type LintCheck = (ctx: LintContext) => LintIssue[];

export interface LintSpec {
	id: string;
	label: string;
	requiredRootFiles: string[];
	structuralFiles: string[];
	leafFilenamePattern: RegExp;
	leafFilenameDescription: string;
	maxPreferredNestingDepth: number;
	pathLinkWarnThreshold: number;
	leafTokenWarn: number;
}

export interface LintOptions {
	spec?: string;
}
