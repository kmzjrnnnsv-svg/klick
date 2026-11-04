import { describe, expect, it } from "vitest";
import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";
import {
	exitComplete,
	type LifecycleInput,
	type LifecycleOptions,
	lifecycleItems,
	providerLifecycle,
	providerReminders,
	providerStage,
	stageStates,
} from "@/lib/compliance/supplier-lifecycle";

const TODAY = "2026-11-04";
const opts: LifecycleOptions = {
	today: TODAY,
	approvalPending: false,
	dora: false,
};

const base: LifecycleInput = {
	status: "onboarding",
	serviceDescription: "Lohnabrechnung für alle Mitarbeitenden",
	category: "software",
	substitutability: "difficult",
	ownerUserId: "u1",
	criticality: "standard",
	isIct: false,
	isOutsourcing: false,
	isMaterial: false,
	processesPersonalData: false,
	dueDiligence: null,
	riskAnalysisAt: null,
	contractRef: null,
	contractStart: null,
	contractEnd: null,
	noticePeriodDays: null,
	dpaSignedAt: null,
	contractClauses: null,
	dataLocations: [],
	subcontractors: null,
	exitStrategy: null,
	exitPlanTestedAt: null,
	rtoHours: null,
	nextAssessmentAt: null,
};

// vollständig erledigter Standard-Dienstleister im Betrieb
const done: LifecycleInput = {
	...base,
	status: "active",
	dueDiligence: { method: "rating", decision: "approved", assessedAt: TODAY },
	contractRef: "V-2026-01",
	contractStart: "2026-01-01",
	nextAssessmentAt: "2027-06-01",
};

describe("providerLifecycle", () => {
	it("Bedarf und Ausstieg folgen dem Status", () => {
		expect(providerStage({ ...base, status: "requested" }, opts)).toBe(
			"request",
		);
		expect(providerStage({ ...done, status: "exiting" }, opts)).toBe("exit");
		expect(providerStage({ ...done, status: "terminated" }, opts)).toBe("exit");
	});

	it("aktuelle Stufe = erste mit offenem Pflichtpunkt", () => {
		expect(providerStage({ ...base, category: null }, opts)).toBe("classify");
		expect(providerStage(base, opts)).toBe("review");
		expect(
			providerStage(
				{
					...base,
					dueDiligence: {
						method: "rating",
						decision: "open",
						assessedAt: TODAY,
					},
				},
				opts,
			),
		).toBe("approve");
		expect(
			providerStage(
				{
					...base,
					dueDiligence: { method: "questionnaire", decision: "accept" },
				},
				opts,
			),
		).toBe("contract");
		expect(providerStage(done, opts)).toBe("operate");
	});

	it("offene Freigabe hält in der Stufe Freigabe", () => {
		expect(providerStage(done, { ...opts, approvalPending: true })).toBe(
			"approve",
		);
	});

	it("Ablehnung (Status oder Bewertung) zeigt Freigabe mit Abgelehnt", () => {
		const a = providerLifecycle({ ...done, status: "declined" }, opts);
		expect(a.current).toBe("approve");
		expect(a.declined).toBe(true);
		const b = providerLifecycle(
			{
				...done,
				dueDiligence: { method: "questionnaire", decision: "reject" },
			},
			opts,
		);
		expect(b.declined).toBe(true);
	});

	it("Personendaten verlangen AV-Vertrag und Datenstandorte", () => {
		const p = { ...done, processesPersonalData: true };
		expect(providerStage(p, opts)).toBe("contract");
		expect(providerStage({ ...p, dpaSignedAt: "2026-01-02" }, opts)).toBe(
			"onboard",
		);
		expect(
			providerStage(
				{ ...p, dpaSignedAt: "2026-01-02", dataLocations: ["DE"] },
				opts,
			),
		).toBe("operate");
	});

	it("DORA-Klauseln nur Pflicht bei IKT und gewähltem DORA", () => {
		const ict = { ...done, isIct: true, dataLocations: ["DE"] };
		expect(providerStage(ict, opts)).toBe("operate");
		expect(providerStage(ict, { ...opts, dora: true })).toBe("contract");
		// alle Klauseln für nicht kritische (Abs. 3 nur bei kritisch)
		const clauses = Object.fromEntries(
			ART30_CLAUSES.filter((c) => !c.criticalOnly).map((c) => [c.code, true]),
		);
		expect(
			providerStage(
				{ ...ict, contractClauses: clauses },
				{ ...opts, dora: true },
			),
		).toBe("operate");
	});

	it("kritische Dienstleister: Risikoanalyse, Ausstieg, Unterauftragnehmer, Wiederanlauf, Test", () => {
		const crit = { ...done, criticality: "critical" as const };
		expect(providerStage(crit, opts)).toBe("review");
		// ein Risiko im Register zählt als Risikoanalyse
		expect(providerStage(crit, { ...opts, hasRisk: true })).toBe("onboard");
		const items = lifecycleItems(
			{ ...crit, riskAnalysisAt: "2026-02-01" },
			opts,
		);
		const open = items.filter((i) => i.required && !i.done).map((i) => i.key);
		expect(open).toEqual([
			"subcontractors",
			"exit_strategy",
			"targets",
			"exit_test",
		]);
		const ready = {
			...crit,
			riskAnalysisAt: "2026-02-01",
			subcontractors: [],
			exitStrategy: "Export als CSV, zweiter Anbieter vorgeprüft",
			rtoHours: 24,
			exitPlanTestedAt: "2026-03-01",
		};
		expect(providerStage(ready, opts)).toBe("operate");
		// Test älter als ein Jahr = wieder offen
		expect(
			providerStage({ ...ready, exitPlanTestedAt: "2025-10-01" }, opts),
		).toBe("operate");
		expect(
			lifecycleItems({ ...ready, exitPlanTestedAt: "2025-10-01" }, opts).find(
				(i) => i.key === "exit_test",
			)?.done,
		).toBe(false);
	});

	it("Betrieb: überfällige Bewertung und abgelaufener Vertrag bleiben offen", () => {
		const items = lifecycleItems(
			{ ...done, nextAssessmentAt: "2026-10-01", contractEnd: "2026-09-30" },
			opts,
		);
		const open = items.filter((i) => !i.done).map((i) => i.key);
		expect(open).toContain("next_review");
		expect(open).toContain("contract_valid");
	});

	it("Kündigungsfrist ist Empfehlung, keine Pflicht", () => {
		const notice = lifecycleItems(done, opts).find((i) => i.key === "notice");
		expect(notice?.required).toBe(false);
		expect(providerStage(done, opts)).toBe("operate");
	});

	it("Stufenleiste: davor erledigt, danach kommt noch", () => {
		const s = stageStates(providerLifecycle(base, opts));
		expect(s.request).toBe("done");
		expect(s.classify).toBe("done");
		expect(s.review).toBe("current");
		expect(s.contract).toBe("upcoming");
		expect(s.exit).toBe("upcoming");
		// im Ausstieg bleiben offene Punkte davor sichtbar
		const e = stageStates(
			providerLifecycle({ ...base, status: "exiting" }, opts),
		);
		expect(e.exit).toBe("current");
		expect(e.review).toBe("open");
		expect(e.request).toBe("done");
	});
});

describe("Ausstieg (L3)", () => {
	const exiting: LifecycleInput = {
		...done,
		status: "exiting",
		exit: {
			reason: "Wechsel zu anderem Anbieter",
			plannedEnd: "2026-12-31",
			requestedAt: "2026-11-01T10:00:00Z",
			requestedBy: "u1",
			items: { notice_given: "2026-11-02" },
		},
	};

	it("Checkliste erscheint erst im Ausstieg", () => {
		expect(lifecycleItems(done, opts).some((i) => i.stage === "exit")).toBe(
			false,
		);
		const items = lifecycleItems(exiting, opts).filter(
			(i) => i.stage === "exit",
		);
		expect(items.map((i) => i.key)).toEqual([
			"exit_notice_given",
			"exit_data_returned",
			"exit_deletion_confirmed",
			"exit_access_revoked",
			"exit_replacement_ready",
		]);
		expect(items[0]?.done).toBe(true);
		// Ersatz nur bei kritisch/wesentlich Pflicht
		expect(items[4]?.required).toBe(false);
		expect(providerStage(exiting, opts)).toBe("exit");
	});

	it("abschließen erst mit allen Pflichtpunkten", () => {
		expect(exitComplete(exiting)).toBe(false);
		const items = {
			notice_given: "2026-11-02",
			data_returned: "2026-11-10",
			deletion_confirmed: "2026-11-12",
			access_revoked: "2026-11-12",
		};
		const ready = {
			...exiting,
			exit: { ...(exiting.exit as NonNullable<LifecycleInput["exit"]>), items },
		};
		expect(exitComplete(ready)).toBe(true);
		// kritisch: Ersatz fehlt noch
		expect(exitComplete({ ...ready, criticality: "critical" })).toBe(false);
	});
});

describe("providerReminders (L3)", () => {
	const base2 = {
		status: "active" as const,
		criticality: "standard" as const,
		isMaterial: false,
		processesPersonalData: false,
		dpaSignedAt: null,
		contractEnd: "2027-01-31",
		noticePeriodDays: 90,
		exitPlanTestedAt: null,
	};

	it("Kündigungsfrist und Vertragsende nur an den Vorlauf-Tagen", () => {
		// Kündigung bis 02.11.2026 (90 Tage vor dem 31.01.2027)
		expect(providerReminders(base2, "2026-10-03")).toEqual([
			{ kind: "notice", date: "2026-11-02", days: 30 },
		]);
		expect(providerReminders(base2, "2026-10-04")).toEqual([]);
		expect(providerReminders(base2, "2026-11-02")).toEqual([
			{ kind: "contract_end", date: "2027-01-31", days: 90 },
		]);
		// ohne Kündigungsfrist nur das Vertragsende
		expect(
			providerReminders({ ...base2, noticePeriodDays: null }, "2027-01-24"),
		).toEqual([{ kind: "contract_end", date: "2027-01-31", days: 7 }]);
	});

	it("AV-Vertrag und Ausstiegstest am Monatsersten, nur im Betrieb", () => {
		const p = {
			...base2,
			contractEnd: null,
			processesPersonalData: true,
			criticality: "critical" as const,
			exitPlanTestedAt: "2025-06-01",
		};
		expect(providerReminders(p, "2026-11-01")).toEqual([
			{ kind: "dpa_missing" },
			{ kind: "exit_test", lastTest: "2025-06-01" },
		]);
		expect(providerReminders(p, "2026-11-02")).toEqual([]);
		expect(
			providerReminders({ ...p, exitPlanTestedAt: "2026-06-01" }, "2026-11-01"),
		).toEqual([{ kind: "dpa_missing" }]);
		for (const status of [
			"requested",
			"exiting",
			"terminated",
			"declined",
		] as const)
			expect(providerReminders({ ...p, status }, "2026-11-01")).toEqual([]);
	});
});
