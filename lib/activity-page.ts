// Org-weiter Aktivitätsstrom seitenweise (Leistung bei wachsenden Daten):
// Audit-Einträge und Kommentare sind zwei je für sich sortierte Listen, die
// Seite mischt sie nach Zeit. Geblättert wird über einen Cursor statt über
// einen Versatz — jede Seite kostet gleich viel, auch weit hinten. Rein,
// getestet (tests/activity-page.test.ts).

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityCursor = {
	/** Audit: nur Einträge mit kleinerer seq; null = von oben */
	auditSeq: bigint | null;
	/** Kommentare: nur (created_at, id) kleiner; null = von oben */
	comment: { at: string; id: string } | null;
};

export const START_CURSOR: ActivityCursor = { auditSeq: null, comment: null };

// Zeitpunkt exakt wie in Postgres (Mikrosekunden, UTC), sonst wiederholt
// oder überspringt die nächste Seite Kommentare derselben Millisekunde
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEQ = /^\d{1,19}$/;
const INT8_MAX = 9_223_372_036_854_775_807n;

export function encodeActivityCursor(c: ActivityCursor): string {
	const audit = c.auditSeq === null ? "-" : c.auditSeq.toString();
	const comment = c.comment ? `${c.comment.at}_${c.comment.id}` : "-";
	return `${audit}~${comment}`;
}

/** `?vor=` streng lesen; alles Unklare ist die erste Seite */
export function parseActivityCursor(
	v: string | string[] | undefined,
): ActivityCursor {
	const raw = Array.isArray(v) ? v[0] : v;
	if (!raw || raw.length > 120) return START_CURSOR;
	const [audit, comment, ...rest] = raw.split("~");
	if (rest.length > 0 || audit === undefined || comment === undefined)
		return START_CURSOR;
	let auditSeq: bigint | null = null;
	if (audit !== "-") {
		if (!SEQ.test(audit)) return START_CURSOR;
		auditSeq = BigInt(audit);
		if (auditSeq > INT8_MAX) return START_CURSOR;
	}
	let c: ActivityCursor["comment"] = null;
	if (comment !== "-") {
		const [at, id, ...more] = comment.split("_");
		if (more.length > 0 || !at || !id || !AT.test(at) || !UUID.test(id))
			return START_CURSOR;
		c = { at, id };
	}
	return { auditSeq, comment: c };
}

export type AuditRowKey = { seq: bigint; at: Date };
export type CommentRowKey = { id: string; createdAt: Date; cursorAt: string };

/**
 * Mischt zwei absteigend sortierte Listen (je bis zu `size + 1` Zeilen ab dem
 * Cursor) und nimmt die neuesten `size`. Aus jeder Liste wird ein Anfang
 * genommen, darum stimmt der nächste Cursor auch bei gleichen Zeitpunkten.
 */
export function takeActivityPage<
	A extends AuditRowKey,
	C extends CommentRowKey,
>(
	audit: readonly A[],
	comments: readonly C[],
	cursor: ActivityCursor,
	size = ACTIVITY_PAGE_SIZE,
): {
	audit: A[];
	comments: C[];
	next: ActivityCursor | null;
} {
	let i = 0;
	let j = 0;
	while (i + j < size && (i < audit.length || j < comments.length)) {
		const a = audit[i];
		const c = comments[j];
		if (a && (!c || a.at.getTime() >= c.createdAt.getTime())) i++;
		else j++;
	}
	const takenAudit = audit.slice(0, i);
	const takenComments = comments.slice(0, j);
	const more = audit.length + comments.length > i + j;
	const lastAudit = takenAudit.at(-1);
	const lastComment = takenComments.at(-1);
	const next: ActivityCursor | null = more
		? {
				auditSeq: lastAudit ? lastAudit.seq : cursor.auditSeq,
				comment: lastComment
					? { at: lastComment.cursorAt, id: lastComment.id }
					: cursor.comment,
			}
		: null;
	return { audit: takenAudit, comments: takenComments, next };
}
