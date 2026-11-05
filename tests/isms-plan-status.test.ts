import { describe, expect, it } from "vitest";
import {
	ISMS_ITEM_BY_KEY,
	ISMS_PROGRAMME,
} from "@/lib/compliance/catalog/isms-programme";
import {
	countStates,
	type IsmsFacts,
	ismsStatus,
	yearBefore,
} from "@/lib/isms-plan/status";
import de from "@/messages/de.json";

// Stand je Punkt des ISMS-Jahresplans (P2a): aus Dokumenten, Bestellung,
// Registern und Audits; ohne Quelle kein Stand.

const empty = (today = "2026-11-05"): IsmsFacts => ({
	today,
	documents: {},
	isbAppointed: false,
	risks: { total: 0, current: 0 },
	bia: { critical: 0, current: 0 },
	bcmPlans: { critical: 0, released: 0, overdue: 0 },
	exercises: { lastDone: null, planned: 0 },
	audits: {
		internal: { lastDone: null, next: null },
		external: { lastDone: null, next: null },
	},
	managementReview: { lastHeld: null, next: null },
	kpis: { approved: 0, measured: 0 },
	nonconformities: { open: 0, overdue: 0 },
	suppliers: { running: 0, overdue: 0 },
	trainings: { open: 0, overdue: 0 },
	incidents: { open: 0 },
	changes: { pending: 0 },
});

const item = (key: string) => {
	const i = ISMS_ITEM_BY_KEY.get(key);
	if (!i) throw new Error(key);
	return i;
};

describe("ismsStatus", () => {
	it("Dokumente: fehlt, Entwurf, gültig, Überprüfung fällig", () => {
		const f = empty();
		expect(ismsStatus(item("policy"), f)).toMatchObject({
			state: "open",
			code: "doc_missing",
		});
		f.documents["RL-ISMS-LEITLINIE"] = [{ valid: false, nextReviewAt: null }];
		expect(ismsStatus(item("policy"), f).code).toBe("doc_draft");
		f.documents["RL-ISMS-LEITLINIE"] = [
			{ valid: true, nextReviewAt: "2027-03-01" },
		];
		expect(ismsStatus(item("policy"), f)).toMatchObject({
			state: "ok",
			code: "doc_valid",
			date: "2027-03-01",
		});
		f.documents["RL-ISMS-LEITLINIE"] = [
			{ valid: true, nextReviewAt: "2026-10-01" },
		];
		expect(ismsStatus(item("policy"), f)).toMatchObject({
			state: "due",
			code: "doc_review_due",
			date: "2026-10-01",
		});
	});

	it("mehrere Vorlagen: erst alle gültig = erledigt", () => {
		const f = empty();
		f.documents["RL-ZUGANG"] = [{ valid: true, nextReviewAt: null }];
		expect(ismsStatus(item("it_policy"), f)).toMatchObject({
			state: "open",
			code: "docs_partial",
			n: 1,
			m: 4,
		});
		for (const c of ["RL-ENDGERAETE", "RL-NETZ", "RL-PATCH"])
			f.documents[c] = [{ valid: true, nextReviewAt: null }];
		expect(ismsStatus(item("it_policy"), f)).toMatchObject({
			state: "ok",
			code: "doc_valid_open",
		});
	});

	it("jährliche Termine: im letzten Jahr erledigt, geplant, überfällig", () => {
		const f = empty();
		expect(ismsStatus(item("management_review"), f).code).toBe("review_none");
		f.managementReview = { lastHeld: "2025-09-01", next: null };
		expect(ismsStatus(item("management_review"), f)).toMatchObject({
			state: "due",
			code: "review_due",
		});
		f.managementReview = { lastHeld: "2025-09-01", next: "2026-12-01" };
		expect(ismsStatus(item("management_review"), f).code).toBe(
			"review_planned",
		);
		f.managementReview = { lastHeld: "2026-06-01", next: null };
		expect(ismsStatus(item("management_review"), f).state).toBe("ok");
		f.audits.external = { lastDone: "2026-02-01", next: null };
		expect(ismsStatus(item("external_audit"), f).code).toBe("audit_done");
		expect(ismsStatus(item("internal_audit"), f).code).toBe("audit_none");
	});

	it("Register: Risiken, BIA, Abweichungen, Dienstleister", () => {
		const f = empty();
		f.risks = { total: 10, current: 7 };
		expect(ismsStatus(item("risk_analyses"), f)).toMatchObject({
			state: "due",
			n: 3,
			m: 10,
		});
		f.bia = { critical: 4, current: 4 };
		expect(ismsStatus(item("bia"), f).state).toBe("ok");
		f.nonconformities = { open: 5, overdue: 2 };
		expect(ismsStatus(item("measures"), f)).toMatchObject({
			state: "due",
			code: "nc_overdue",
		});
		expect(ismsStatus(item("suppliers"), f).code).toBe("suppliers_none");
		f.suppliers = { running: 3, overdue: 0 };
		expect(ismsStatus(item("suppliers"), f).state).toBe("ok");
		f.isbAppointed = true;
		expect(ismsStatus(item("isb_appointment"), f).state).toBe("ok");
	});

	it("ohne Quelle kein Stand", () => {
		expect(ismsStatus(item("projects"), empty())).toEqual({
			state: "none",
			code: "manual",
		});
	});

	it("jeder mögliche Code hat einen Text", () => {
		const codes = new Set<string>(["manual"]);
		const variants: Array<(f: IsmsFacts) => void> = [
			() => {},
			(f) => {
				f.isbAppointed = true;
				f.risks = { total: 2, current: 2 };
				f.bia = { critical: 2, current: 2 };
				f.bcmPlans = { critical: 2, released: 2, overdue: 0 };
				f.exercises = { lastDone: f.today, planned: 0 };
				f.audits.internal = { lastDone: f.today, next: null };
				f.managementReview = { lastHeld: f.today, next: null };
				f.kpis = { approved: 2, measured: 2 };
				f.suppliers = { running: 2, overdue: 0 };
				for (const c of ISMS_PROGRAMME.flatMap((i) => i.templates ?? []))
					f.documents[c] = [{ valid: true, nextReviewAt: "2099-01-01" }];
			},
			(f) => {
				f.risks = { total: 2, current: 0 };
				f.bia = { critical: 2, current: 1 };
				f.bcmPlans = { critical: 2, released: 1, overdue: 1 };
				f.exercises = { lastDone: "2020-01-01", planned: 0 };
				f.audits.internal = { lastDone: "2020-01-01", next: null };
				f.managementReview = { lastHeld: null, next: "2099-01-01" };
				f.kpis = { approved: 2, measured: 1 };
				f.nonconformities = { open: 2, overdue: 1 };
				f.suppliers = { running: 2, overdue: 1 };
				f.trainings = { open: 2, overdue: 1 };
				for (const c of ISMS_PROGRAMME.flatMap((i) => i.templates ?? []))
					f.documents[c] = [{ valid: true, nextReviewAt: "2020-01-01" }];
			},
			(f) => {
				f.bcmPlans = { critical: 2, released: 1, overdue: 0 };
				f.exercises = { lastDone: null, planned: 1 };
				f.documents["RL-ZUGANG"] = [{ valid: true, nextReviewAt: null }];
				f.documents["RL-ISMS-LEITLINIE"] = [
					{ valid: false, nextReviewAt: null },
				];
			},
		];
		for (const v of variants) {
			const f = empty();
			v(f);
			for (const i of ISMS_PROGRAMME) codes.add(ismsStatus(i, f).code);
		}
		const keys = Object.keys(de.IsmsPlan);
		for (const c of codes) expect(keys, c).toContain(`status_${c}`);
	});

	it("zählt Zustände", () => {
		const s = ISMS_PROGRAMME.map((i) => ismsStatus(i, empty()));
		const c = countStates(s);
		expect(c.ok + c.due + c.open + c.none).toBe(ISMS_PROGRAMME.length);
		expect(c.none).toBe(ISMS_PROGRAMME.filter((i) => !i.source).length);
	});

	it("rechnet ein Jahr zurück", () => {
		expect(yearBefore("2026-11-05")).toBe("2025-11-05");
		expect(yearBefore("2028-02-29")).toBe("2027-03-01");
	});
});
