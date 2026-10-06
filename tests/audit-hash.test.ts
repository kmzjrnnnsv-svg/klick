import { describe, expect, it } from "vitest";
import {
	type AuditRowForHash,
	canonicalJson,
	chainKey,
	computeAuditHash,
	type HashedAuditRow,
	verifyChain,
} from "@/lib/audit-hash";

const base = (over: Partial<AuditRowForHash> = {}): AuditRowForHash => ({
	id: "00000000-0000-0000-0000-000000000001",
	organizationId: "org-1",
	actorUserId: "user-1",
	action: "risk.updated",
	target: "risk:1",
	before: { status: "open", likelihood: 3 },
	after: { likelihood: 3, status: "in_treatment" },
	ip: "10.0.0.1",
	userAgent: "vitest",
	outcome: "success",
	at: new Date("2026-10-06T12:00:00Z"),
	...over,
});

function chain(n: number): HashedAuditRow[] {
	const rows: HashedAuditRow[] = [];
	let prev: string | null = null;
	for (let i = 0; i < n; i++) {
		const row = base({ id: `0000000${i}`, action: `a.${i}` });
		const hash = computeAuditHash(prev, row);
		rows.push({ ...row, seq: i + 1, prevHash: prev, hash });
		prev = hash;
	}
	return rows;
}

describe("canonicalJson", () => {
	it("sortiert Schlüssel und normalisiert Dates/undefined", () => {
		const a = canonicalJson({
			b: 1,
			a: { d: new Date("2026-01-01T00:00:00Z"), c: undefined },
		});
		const b = canonicalJson({ a: { d: "2026-01-01T00:00:00.000Z" }, b: 1 });
		expect(a).toBe(b);
	});
});

describe("computeAuditHash", () => {
	it("ist deterministisch und unabhängig von der Schlüsselreihenfolge", () => {
		const h1 = computeAuditHash(null, base());
		const h2 = computeAuditHash(
			null,
			base({ after: { status: "in_treatment", likelihood: 3 } }),
		);
		expect(h1).toBe(h2);
		expect(h1).toMatch(/^[0-9a-f]{64}$/);
	});
	it("ändert sich mit prevHash und Inhalt", () => {
		expect(computeAuditHash("x", base())).not.toBe(
			computeAuditHash(null, base()),
		);
		expect(computeAuditHash(null, base({ action: "y" }))).not.toBe(
			computeAuditHash(null, base()),
		);
	});
	it("chainKey: platform für Plattform-Ereignisse", () => {
		expect(chainKey(null)).toBe("platform");
		expect(chainKey("o")).toBe("o");
	});
});

describe("verifyChain", () => {
	it("akzeptiert eine intakte Kette", () => {
		expect(verifyChain(chain(5))).toEqual({ ok: true, checked: 5 });
	});
	it("erkennt einen manipulierten Eintrag", () => {
		const rows = chain(5);
		rows[2].action = "manipuliert";
		const res = verifyChain(rows);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.brokenAtSeq).toBe("3");
			expect(res.reason).toBe("hash_mismatch");
		}
	});
	it("erkennt einen entfernten Eintrag", () => {
		const rows = chain(5);
		rows.splice(1, 1);
		const res = verifyChain(rows);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.reason).toBe("prev_mismatch");
	});
	it("leere Kette ist gültig", () => {
		expect(verifyChain([])).toEqual({ ok: true, checked: 0 });
	});
});
