import { describe, expect, it } from "vitest";
import {
	type ActivityCursor,
	encodeActivityCursor,
	parseActivityCursor,
	START_CURSOR,
	takeActivityPage,
} from "@/lib/activity-page";

// /aktivitaet seitenweise: Cursor lesen, zwei Listen mischen, Seite für
// Seite ohne Doppelte und ohne Lücken — auch bei gleichen Zeitpunkten.

const iso = (ms: number) => `${new Date(ms).toISOString().slice(0, 23)}000Z`;

function audit(n: number, at: (i: number) => number) {
	// seq absteigend wie in der Abfrage
	return Array.from({ length: n }, (_, i) => ({
		seq: BigInt(1000 - i),
		at: new Date(at(i)),
	}));
}

function comments(n: number, at: (i: number) => number) {
	return Array.from({ length: n }, (_, i) => {
		const ms = at(i);
		return {
			id: `00000000-0000-4000-8000-${String(n - i).padStart(12, "0")}`,
			createdAt: new Date(ms),
			cursorAt: iso(ms),
		};
	});
}

// Nachbau der Abfrage: je Liste höchstens size + 1 ab dem Cursor
function query(
	all: { a: ReturnType<typeof audit>; c: ReturnType<typeof comments> },
	cursor: ActivityCursor,
	size: number,
) {
	const a = all.a
		.filter((r) => cursor.auditSeq === null || r.seq < cursor.auditSeq)
		.slice(0, size + 1);
	const c = all.c
		.filter((r) => {
			if (!cursor.comment) return true;
			if (r.cursorAt !== cursor.comment.at)
				return r.cursorAt < cursor.comment.at;
			return r.id < cursor.comment.id;
		})
		.slice(0, size + 1);
	return takeActivityPage(a, c, cursor, size);
}

function walk(
	all: { a: ReturnType<typeof audit>; c: ReturnType<typeof comments> },
	size: number,
) {
	const seen: string[] = [];
	let cursor: ActivityCursor | null = START_CURSOR;
	let pages = 0;
	while (cursor && pages < 100) {
		// über die URL, wie im Browser
		const parsed = parseActivityCursor(encodeActivityCursor(cursor));
		const page = query(all, parsed, size);
		expect(page.audit.length + page.comments.length).toBeLessThanOrEqual(size);
		for (const r of page.audit) seen.push(`a${r.seq}`);
		for (const r of page.comments) seen.push(`c${r.id}`);
		cursor = page.next;
		pages++;
	}
	return { seen, pages };
}

describe("Cursor", () => {
	it("Rundreise und erste Seite bei Unklarem", () => {
		const c: ActivityCursor = {
			auditSeq: 12345n,
			comment: {
				at: "2026-11-01T09:12:34.567891Z",
				id: "0b0e3f6a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
			},
		};
		expect(parseActivityCursor(encodeActivityCursor(c))).toEqual(c);
		expect(parseActivityCursor(encodeActivityCursor(START_CURSOR))).toEqual(
			START_CURSOR,
		);
		for (const bad of [
			undefined,
			"",
			"abc",
			"1~2~3",
			"-1~-",
			"99999999999999999999~-",
			"9223372036854775808~-",
			"12~2026-11-01T09:12:34Z_0b0e3f6a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
			"12~2026-11-01T09:12:34.567891Z_kein-uuid",
			"12~2026-11-01T09:12:34.567891Z'; drop table x;--_0b0e3f6a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
		])
			expect(parseActivityCursor(bad)).toEqual(START_CURSOR);
		expect(parseActivityCursor(["7~-", "8~-"]).auditSeq).toBe(7n);
	});
});

describe("takeActivityPage", () => {
	it("mischt nach Zeit, neueste zuerst", () => {
		const a = audit(3, (i) => 10_000 - i * 20);
		const c = comments(3, (i) => 9_990 - i * 20);
		const page = takeActivityPage(a, c, START_CURSOR, 4);
		expect(page.audit.map((r) => r.seq)).toEqual([1000n, 999n]);
		expect(page.comments).toHaveLength(2);
		expect(page.next?.auditSeq).toBe(999n);
		expect(page.next?.comment?.id).toBe(c[1]?.id);
	});

	it("letzte Seite hat keinen Cursor", () => {
		const page = takeActivityPage(
			audit(2, (i) => 100 - i),
			comments(1, () => 50),
			START_CURSOR,
			5,
		);
		expect(page.next).toBeNull();
	});

	it("ohne Einträge aus einer Liste bleibt deren Cursor stehen", () => {
		const cursor: ActivityCursor = { auditSeq: 500n, comment: null };
		const page = takeActivityPage(
			[],
			comments(3, (i) => 100 - i),
			cursor,
			2,
		);
		expect(page.next?.auditSeq).toBe(500n);
	});

	it("alle Seiten ergeben jeden Eintrag genau einmal", () => {
		for (const size of [1, 3, 7, 50]) {
			const all = {
				a: audit(23, (i) => 1_000_000 - i * 7),
				c: comments(17, (i) => 1_000_000 - i * 11),
			};
			const { seen } = walk(all, size);
			expect(seen).toHaveLength(40);
			expect(new Set(seen).size).toBe(40);
		}
	});

	it("auch wenn viele Einträge denselben Zeitpunkt haben", () => {
		// eine Transaktion schreibt viele Audit-Einträge mit gleichem `at`
		const all = {
			a: audit(30, () => 5_000),
			c: comments(12, () => 5_000),
		};
		for (const size of [1, 4, 10]) {
			const { seen } = walk(all, size);
			expect(new Set(seen).size).toBe(42);
			expect(seen).toHaveLength(42);
		}
	});
});
