import { describe, expect, it } from "vitest";
import { missingForFinalize } from "@/lib/evidence-authoring/content";
import { TEMPLATE_BY_KEY } from "@/lib/evidence-authoring/templates";
import {
	EVIDENCE_MAX_ROWS,
	reviewEvidenceContent,
} from "@/lib/identity/review-evidence";
import {
	canClose,
	decisionError,
	inReviewScope,
	mayDecide,
	reviewProgress,
	reviewTestResult,
} from "@/lib/identity/review-rules";

// Teil D I2: Zugriffsprüfung — Umfang, Entscheidung, Abschluss, Nachweis

const acc = {
	enabled: true,
	kind: "member" as const,
	isAdmin: false,
	isTopAdmin: false,
	missing: false,
};

describe("Umfang", () => {
	it("nur aktive, noch gemeldete Konten", () => {
		expect(inReviewScope(acc, "all")).toBe(true);
		expect(inReviewScope({ ...acc, enabled: false }, "all")).toBe(false);
		expect(inReviewScope({ ...acc, missing: true }, "all")).toBe(false);
	});
	it("Admins bzw. Mitglieder ohne Gäste", () => {
		expect(inReviewScope(acc, "admins")).toBe(false);
		expect(inReviewScope({ ...acc, isTopAdmin: true }, "admins")).toBe(true);
		expect(inReviewScope({ ...acc, kind: "guest" }, "members")).toBe(false);
		expect(inReviewScope({ ...acc, kind: "guest" }, "all")).toBe(true);
	});
});

describe("Entscheidung", () => {
	it("bestätigen ohne Notiz, anpassen und entziehen nur mit", () => {
		expect(decisionError({ decision: "confirm", note: null })).toBeNull();
		expect(decisionError({ decision: "revoke", note: "  " })).toBe(
			"identity_note_required",
		);
		expect(decisionError({ decision: "adjust", note: "Rolle weg" })).toBeNull();
		expect(decisionError({ decision: "delete", note: "x" })).toBe(
			"identity_decision",
		);
	});
	it("eingetragene Prüfer:in oder Inhaber:in", () => {
		expect(
			mayDecide({ reviewerUserId: "u1", userId: "u1", isOwner: false }),
		).toBe(true);
		expect(
			mayDecide({ reviewerUserId: "u1", userId: "u2", isOwner: false }),
		).toBe(false);
		expect(
			mayDecide({ reviewerUserId: "u1", userId: "u2", isOwner: true }),
		).toBe(true);
	});
});

describe("Abschluss", () => {
	it("erst ohne offene, Ergebnis teilweise bei Änderungen", () => {
		const open = reviewProgress([{ decision: "confirm" }, { decision: null }]);
		expect(canClose(open)).toBe(false);
		expect(canClose(reviewProgress([]))).toBe(false);
		const done = reviewProgress([
			{ decision: "confirm" },
			{ decision: "revoke" },
		]);
		expect(done).toEqual({
			total: 2,
			open: 0,
			confirm: 1,
			adjust: 0,
			revoke: 1,
		});
		expect(canClose(done)).toBe(true);
		expect(reviewTestResult(done)).toBe("partial");
		expect(reviewTestResult(reviewProgress([{ decision: "confirm" }]))).toBe(
			"pass",
		);
	});
});

describe("Nachweis aus der Prüfung", () => {
	const template = TEMPLATE_BY_KEY.get("rezertifizierung");
	const review = {
		title: "Zugriffsprüfung Q4 2026",
		provider: "entra",
		startedAt: new Date("2026-11-01T08:00:00Z"),
		closedAt: new Date("2026-11-04T08:00:00Z"),
	};

	it("ist vollständig und entzogene stehen zuerst", () => {
		const items = [
			{
				snapshot: { name: "Anna", email: "anna@x.de", kind: "member" as const },
				decision: "confirm" as const,
				note: null,
			},
			{
				snapshot: { name: "Bob", email: "bob@x.de", kind: "member" as const },
				decision: "revoke" as const,
				note: "weg",
			},
		];
		const content = reviewEvidenceContent({
			review,
			progress: reviewProgress(items),
			items,
			me: "Olga",
			today: "2026-11-04",
		});
		expect(template).toBeDefined();
		if (!template) return;
		expect(missingForFinalize(template, content)).toEqual([]);
		const rows = (content.blocks.accounts as { rows: string[][] }).rows;
		expect(rows[0]?.[0]).toBe("bob@x.de");
		expect(rows[0]?.[3]).toBe("entzogen");
		expect(content.blocks.result).toMatchObject({ value: "partial" });
	});

	it("höchstens 500 Zeilen, der Rest steht in der Zusammenfassung", () => {
		const items = Array.from({ length: EVIDENCE_MAX_ROWS + 3 }, (_, i) => ({
			snapshot: { name: `P${i}`, email: `p${i}@x.de` },
			decision: "confirm" as const,
			note: null,
		}));
		const content = reviewEvidenceContent({
			review,
			progress: reviewProgress(items),
			items,
			me: "Olga",
			today: "2026-11-04",
		});
		expect((content.blocks.accounts as { rows: unknown[] }).rows).toHaveLength(
			EVIDENCE_MAX_ROWS,
		);
		expect((content.blocks.summary as { text: string }).text).toContain(
			"3 weitere",
		);
	});
});
