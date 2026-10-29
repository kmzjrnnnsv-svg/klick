import type { FileText } from "@/lib/evidence/text";
import { diffLines } from "./diff";
import { compactDiff, type DisplayLine, diffStat, pairChanges } from "./trail";

// Vergleich zweier Fassungen (pure): Text in Klick und Inhalt der Datei je
// für sich, die Zähler zusammen. Den Text hochgeladener Dateien liest der
// isolierte Parser (lib/evidence/text.ts); fehlt er, sagt „hint“ warum.

// „locked“: vertrauliche Datei ohne frische Bestätigung (wie beim Download)
export type SideText = FileText | { status: "locked" };

export type ContentSide = {
	bodyMarkdown: string | null;
	file: { name: string; sha256: string | null } | null;
	// Text der Datei; null = keine Datei
	fileText: SideText | null;
};

export type LinesDiff = {
	lines: DisplayLine[];
	added: number;
	removed: number;
};

export type FileHint = "locked" | "pending" | "no_text" | "encrypted" | "error";

export type FileDiff =
	| { kind: "none" }
	| { kind: "added"; name: string }
	| { kind: "removed" }
	| {
			kind: "replaced";
			before: string;
			after: string;
			diff: LinesDiff | null;
			hint: FileHint | null;
			truncated: boolean;
	  };

export type ContentDiff = {
	text: LinesDiff | null;
	file: FileDiff;
	added: number;
	removed: number;
};

function linesDiff(
	before: string,
	after: string,
	context: number,
): LinesDiff | null {
	const lines = diffLines(before, after);
	const stat = diffStat(lines);
	if (stat.added + stat.removed === 0) return null;
	return { lines: pairChanges(compactDiff(lines, context)), ...stat };
}

const HINT_ORDER: FileHint[] = [
	"locked",
	"pending",
	"error",
	"encrypted",
	"no_text",
];

function hintOf(t: SideText | null): FileHint | null {
	if (!t || t.status === "ok") return null;
	if (t.status === "unsupported") return "no_text";
	return t.status;
}

export function contentDiff(
	before: ContentSide,
	after: ContentSide,
	context = 1,
): ContentDiff {
	const text = linesDiff(
		before.bodyMarkdown ?? "",
		after.bodyMarkdown ?? "",
		context,
	);
	let file: FileDiff = { kind: "none" };
	if (before.file && after.file) {
		if (before.file.sha256 !== after.file.sha256) {
			const a = before.fileText;
			const b = after.fileText;
			const diff =
				a?.status === "ok" && b?.status === "ok"
					? linesDiff(a.text, b.text, context)
					: null;
			const hints = [hintOf(a), hintOf(b)];
			file = {
				kind: "replaced",
				before: before.file.name,
				after: after.file.name,
				diff,
				hint: HINT_ORDER.find((h) => hints.includes(h)) ?? null,
				truncated:
					(a?.status === "ok" && a.truncated) ||
					(b?.status === "ok" && b.truncated),
			};
		}
	} else if (after.file) file = { kind: "added", name: after.file.name };
	else if (before.file) file = { kind: "removed" };
	const fileStat =
		file.kind === "replaced" && file.diff
			? file.diff
			: { added: 0, removed: 0 };
	return {
		text,
		file,
		added: (text?.added ?? 0) + fileStat.added,
		removed: (text?.removed ?? 0) + fileStat.removed,
	};
}
