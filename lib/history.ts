// Feld-Historie aus dem Audit-Log: jede Mutation schreibt before/after; hier
// wird daraus eine Timeline mit Diff je Feld. Reine Funktionen, getestet.

export type FieldChange = {
	field: string;
	before: unknown;
	after: unknown;
};

export type HistoryItem = {
	id: string;
	at: Date;
	actorUserId: string | null;
	action: string;
	changes: FieldChange[];
};

export type AuditRowLike = {
	id: string;
	at: Date;
	actorUserId: string | null;
	action: string;
	before: unknown;
	after: unknown;
};

const IGNORED_FIELDS = new Set([
	"updatedAt",
	"createdAt",
	"id",
	"organizationId",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stable(v: unknown): string {
	if (v instanceof Date) return v.toISOString();
	if (v === undefined) return "undefined";
	return JSON.stringify(v, (_k, val) =>
		val instanceof Date ? val.toISOString() : val,
	);
}

export function diffRecords(before: unknown, after: unknown): FieldChange[] {
	const b = isRecord(before) ? before : {};
	const a = isRecord(after) ? after : {};
	const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
	const out: FieldChange[] = [];
	for (const key of [...keys].sort()) {
		if (IGNORED_FIELDS.has(key)) continue;
		const bv = b[key] ?? null;
		const av = a[key] ?? null;
		if (stable(bv) === stable(av)) continue;
		out.push({ field: key, before: bv, after: av });
	}
	return out;
}

export function toHistoryItems(rows: readonly AuditRowLike[]): HistoryItem[] {
	return rows.map((r) => ({
		id: r.id,
		at: r.at,
		actorUserId: r.actorUserId,
		action: r.action,
		changes: diffRecords(r.before, r.after),
	}));
}

export type ActivityEntry =
	| { type: "history"; at: Date; item: HistoryItem }
	| {
			type: "comment";
			at: Date;
			comment: {
				id: string;
				authorUserId: string | null;
				bodyMarkdown: string;
				parentId: string | null;
				editedAt: Date | null;
			};
	  };

// Ein Strom: Kommentare und Feld-Historie gemischt, neueste zuerst.
export function mergeActivity(
	history: readonly HistoryItem[],
	comments: readonly ActivityEntry[],
): ActivityEntry[] {
	const entries: ActivityEntry[] = [
		...history.map((item) => ({ type: "history" as const, at: item.at, item })),
		...comments,
	];
	return entries.sort((x, y) => y.at.getTime() - x.at.getTime());
}

// Zeigt Werte menschenlesbar (Timeline-Diff). Keine Rohobjekte im UI.
export function formatValue(v: unknown): string {
	if (v === null || v === undefined || v === "") return "—";
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	if (typeof v === "boolean") return v ? "ja" : "nein";
	if (typeof v === "number") return String(v);
	if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 79)}…` : v;
	if (Array.isArray(v))
		return v.length === 0 ? "—" : v.map(formatValue).join(", ");
	return JSON.stringify(v).slice(0, 80);
}
