import { describe, expect, it } from "vitest";
import {
	collectDueItems,
	type DueRows,
	dedupeNotifications,
} from "@/lib/jobs/compliance-tick";

const NOW = new Date("2026-10-07T09:00:00Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;

const empty: DueRows = {
	orgOwnerIds: ["owner-1"],
	controlReviews: [],
	documentReviews: [],
	providerAssessments: [],
	evidenceExpiring: [],
	approvals: [],
	exceptions: [],
	trainingAssignments: [],
	incidents: [],
	acknowledgements: [],
	obligationRuns: [],
	legalChanges: [],
	nonconformities: [],
	tlpt: null,
	regulatorDeadlines: [],
	accessExpiring: [],
	dataSubjectRequests: [],
	insurancePolicies: [],
	openTasks: [],
};

describe("collectDueItems — Reviews", () => {
	it("meldet Control-Reviews im 7-Tage-Horizont und überfällige, nicht spätere", () => {
		const r = collectDueItems(NOW, {
			...empty,
			controlReviews: [
				{
					code: "CC-CRY-01",
					title: "Verschlüsselung",
					nextReviewAt: new Date(NOW.getTime() + 3 * DAY),
					ownerUserId: "u1",
				},
				{
					code: "CC-IAM-01",
					title: "Zugriff",
					nextReviewAt: new Date(NOW.getTime() - 2 * DAY),
					ownerUserId: null,
				},
				{
					code: "CC-LOG-01",
					title: "Logging",
					nextReviewAt: new Date(NOW.getTime() + 30 * DAY),
					ownerUserId: "u1",
				},
			],
		});
		expect(r.notifications.map((n) => n.title)).toEqual([
			"Review fällig: CC-CRY-01",
			"Review fällig: CC-IAM-01",
		]);
		// Ohne Owner → Org-Owner als Rückfall
		expect(r.notifications[1]?.recipients).toEqual(["owner-1"]);
		expect(r.notifications[1]?.body).toMatch(/überfällig/);
		expect(r.tasks).toHaveLength(0);
	});

	it("meldet Dokument-Reviews, Dienstleister-Bewertungen und ablaufende Nachweise", () => {
		const soon = new Date(NOW.getTime() + 2 * DAY);
		const r = collectDueItems(NOW, {
			...empty,
			documentReviews: [
				{
					docNumber: "RL-001",
					title: "ISMS",
					nextReviewAt: soon,
					ownerUserId: "u2",
				},
			],
			providerAssessments: [
				{
					id: "p1",
					name: "Hetzner",
					nextAssessmentAt: soon,
					ownerUserId: null,
				},
			],
			evidenceExpiring: [
				{
					id: "e1",
					title: "Pentest 2025",
					validUntil: soon,
					createdByUserId: "u3",
				},
			],
		});
		expect(r.notifications.map((n) => n.kind)).toEqual([
			"review_due",
			"review_due",
			"evidence_expiring",
		]);
		expect(r.notifications[0]?.link).toBe("/dokumente/RL-001");
	});
});

describe("collectDueItems — Freigaben", () => {
	it("eskaliert überfällige Freigaben einmal (Notification + Aufgabe)", () => {
		const r = collectDueItems(NOW, {
			...empty,
			approvals: [
				{
					id: "a1",
					kind: "document_publish",
					entityType: "document",
					entityId: "d1",
					entityLabel: "RL-001 ISMS-Leitlinie",
					dueAt: new Date(NOW.getTime() - HOUR),
					requestedByUserId: "req",
					eligibleApproverIds: ["appr"],
				},
				{
					id: "a2",
					kind: "risk_acceptance",
					entityType: "risk",
					entityId: "r1",
					entityLabel: null,
					dueAt: new Date(NOW.getTime() + HOUR),
					requestedByUserId: "req",
					eligibleApproverIds: [],
				},
			],
		});
		expect(r.notifications).toHaveLength(1);
		expect(r.notifications[0]?.kind).toBe("approval_overdue");
		expect(r.notifications[0]?.recipients.sort()).toEqual(
			["appr", "owner-1", "req"].sort(),
		);
		expect(r.tasks).toHaveLength(1);
		expect(r.tasks[0]).toMatchObject({
			entityType: "document",
			entityId: "d1",
			sourceKind: "escalation",
			priority: "high",
			assigneeUserId: "owner-1",
		});
	});

	it("legt keine zweite Eskalations-Aufgabe an, wenn eine offen ist", () => {
		const r = collectDueItems(NOW, {
			...empty,
			approvals: [
				{
					id: "a1",
					kind: "document_publish",
					entityType: "document",
					entityId: "d1",
					entityLabel: null,
					dueAt: new Date(NOW.getTime() - HOUR),
					requestedByUserId: "req",
					eligibleApproverIds: [],
				},
			],
			openTasks: [
				{ entityType: "document", entityId: "d1", sourceKind: "escalation" },
			],
		});
		expect(r.notifications).toHaveLength(1);
		expect(r.tasks).toHaveLength(0);
	});
});

describe("collectDueItems — Ausnahmen", () => {
	it("30 Tage vor Ablauf: Hinweis + Prüf-Aufgabe; abgelaufen: Status-Aktion", () => {
		const r = collectDueItems(NOW, {
			...empty,
			exceptions: [
				{
					id: "x1",
					title: "MFA-Ausnahme Lager-Terminal",
					status: "approved",
					validUntil: new Date(NOW.getTime() + 20 * DAY),
					ownerUserId: "u1",
				},
				{
					id: "x2",
					title: "Legacy-Protokoll",
					status: "approved",
					validUntil: new Date(NOW.getTime() - DAY),
					ownerUserId: null,
				},
				{
					id: "x3",
					title: "Schon widerrufen",
					status: "revoked",
					validUntil: new Date(NOW.getTime() - DAY),
					ownerUserId: null,
				},
				{
					id: "x4",
					title: "Weit weg",
					status: "approved",
					validUntil: new Date(NOW.getTime() + 90 * DAY),
					ownerUserId: null,
				},
			],
		});
		expect(r.actions).toEqual([{ type: "expire_exception", id: "x2" }]);
		expect(r.tasks).toHaveLength(1);
		expect(r.tasks[0]).toMatchObject({
			entityType: "exception",
			entityId: "x1",
			sourceKind: "review",
			assigneeUserId: "u1",
		});
		expect(r.notifications.map((n) => n.title)).toEqual([
			"Ausnahme läuft ab: MFA-Ausnahme Lager-Terminal",
			"Ausnahme abgelaufen: Legacy-Protokoll",
		]);
	});
});

describe("collectDueItems — Schulungen", () => {
	it("erinnert die Person und markiert überfällige Zuweisungen", () => {
		const r = collectDueItems(NOW, {
			...empty,
			trainingAssignments: [
				{
					id: "t1",
					userId: "u9",
					requirementTitle: "GwG-Grundschulung",
					dueAt: new Date(NOW.getTime() - 3 * DAY),
					status: "due",
				},
				{
					id: "t2",
					userId: "u9",
					requirementTitle: "Phishing",
					dueAt: new Date(NOW.getTime() + 60 * DAY),
					status: "due",
				},
				{
					id: "t3",
					userId: "u9",
					requirementTitle: "Erledigt",
					dueAt: new Date(NOW.getTime() - DAY),
					status: "done",
				},
			],
		});
		expect(r.actions).toEqual([{ type: "mark_training_overdue", id: "t1" }]);
		expect(r.notifications).toHaveLength(1);
		expect(r.notifications[0]?.recipients).toEqual(["u9"]);
	});
});

describe("collectDueItems — Vorfall-Uhren", () => {
	it("meldet Fristen < 2 h und überfällige, überspringt gemeldete und geschlossene", () => {
		const r = collectDueItems(NOW, {
			...empty,
			incidents: [
				{
					id: "i1",
					code: "INC-2026-001",
					title: "Ausfall Zahlungs-API",
					ownerUserId: "im",
					status: "open",
					clocks: [
						{
							label: "Erstmeldung",
							dueAt: new Date(NOW.getTime() - HOUR),
							reportedAt: new Date(NOW.getTime() - 2 * HOUR),
						},
						{
							label: "Zwischenbericht",
							dueAt: new Date(NOW.getTime() + 90 * 60_000),
							reportedAt: null,
						},
						{
							label: "Abschlussbericht",
							dueAt: new Date(NOW.getTime() + 20 * DAY),
							reportedAt: null,
						},
					],
				},
				{
					id: "i2",
					code: "INC-2026-002",
					title: "Geschlossen",
					ownerUserId: "im",
					status: "closed",
					clocks: [
						{
							label: "Erstmeldung",
							dueAt: new Date(NOW.getTime() - HOUR),
							reportedAt: null,
						},
					],
				},
				{
					id: "i3",
					code: "INC-2026-003",
					title: "Überfällig",
					ownerUserId: null,
					status: "contained",
					clocks: [
						{
							label: "Meldung",
							dueAt: new Date(NOW.getTime() - 5 * HOUR),
							reportedAt: null,
						},
					],
				},
			],
		});
		expect(r.notifications.map((n) => [n.kind, n.title])).toEqual([
			["incident_deadline", "Meldefrist in < 2 h: INC-2026-001"],
			["incident_deadline", "Meldefrist überschritten: INC-2026-003"],
		]);
		expect(r.notifications[1]?.recipients).toEqual(["owner-1"]);
	});
});

describe("collectDueItems — Kenntnisnahmen", () => {
	it("erinnert erst nach der Schonfrist und nur fehlende Personen", () => {
		const r = collectDueItems(NOW, {
			...empty,
			acknowledgements: [
				{
					docNumber: "RL-001",
					title: "ISMS-Leitlinie",
					publishedAt: new Date(NOW.getTime() - 10 * DAY),
					missingUserIds: ["u1", "u2"],
				},
				{
					docNumber: "RL-002",
					title: "Frisch",
					publishedAt: new Date(NOW.getTime() - 2 * DAY),
					missingUserIds: ["u1"],
				},
				{
					docNumber: "RL-003",
					title: "Alle bestätigt",
					publishedAt: new Date(NOW.getTime() - 30 * DAY),
					missingUserIds: [],
				},
			],
		});
		expect(r.notifications).toHaveLength(1);
		expect(r.notifications[0]).toMatchObject({
			kind: "acknowledgement_due",
			recipients: ["u1", "u2"],
			link: "/heute",
		});
	});
});

describe("dedupeNotifications", () => {
	it("entfernt Empfänger, die denselben Sachverhalt in 24 h schon bekamen", () => {
		const out = dedupeNotifications(
			[
				{
					kind: "review_due",
					recipients: ["a", "b"],
					title: "x",
					link: "/",
					dedupeKey: "k1",
				},
				{
					kind: "review_due",
					recipients: ["a"],
					title: "y",
					link: "/",
					dedupeKey: "k2",
				},
			],
			new Set(["a:k1", "a:k2"]),
		);
		expect(out).toHaveLength(1);
		expect(out[0]?.recipients).toEqual(["b"]);
	});
});

describe("collectDueItems — Pflichten, Rechtsänderungen, Abweichungen, TLPT, Zugänge", () => {
	it("Pflichten-Lauf im Vorlauf: Aufgabe + Status due; überfällig: Status overdue", () => {
		const r = collectDueItems(NOW, {
			...empty,
			obligationRuns: [
				{
					id: "run1",
					code: "OBL-DAC8",
					title: "DAC8-Meldung",
					dueAt: new Date(NOW.getTime() + 10 * DAY),
					status: "upcoming",
					leadDays: 60,
					ownerUserId: "u1",
				},
				{
					id: "run2",
					code: "OBL-ZAG-MONTHLY",
					title: "Monatsausweis",
					dueAt: new Date(NOW.getTime() - 2 * DAY),
					status: "due",
					leadDays: 7,
					ownerUserId: null,
				},
				{
					id: "run3",
					code: "OBL-X",
					title: "weit weg",
					dueAt: new Date(NOW.getTime() + 200 * DAY),
					status: "upcoming",
					leadDays: 14,
					ownerUserId: null,
				},
			],
		});
		expect(r.actions).toEqual([
			{ type: "mark_run_due", id: "run1" },
			{ type: "mark_run_overdue", id: "run2" },
		]);
		expect(r.tasks).toHaveLength(1);
		expect(r.tasks[0]).toMatchObject({
			entityType: "obligation_run",
			entityId: "run1",
			sourceKind: "obligation",
			assigneeUserId: "u1",
		});
		expect(r.notifications.map((n) => n.title)).toEqual([
			"Pflicht fällig: DAC8-Meldung",
			"Pflicht überfällig: Monatsausweis",
		]);
	});
	it("Rechtsänderung genau 180 Tage vorher, sonst still", () => {
		const in180 = new Date(NOW.getTime() + 180 * DAY)
			.toISOString()
			.slice(0, 10);
		const in100 = new Date(NOW.getTime() + 100 * DAY)
			.toISOString()
			.slice(0, 10);
		const r = collectDueItems(NOW, {
			...empty,
			legalChanges: [
				{ date: in180, title: "AMLR gilt" },
				{ date: in100, title: "Egal" },
			],
		});
		expect(r.notifications).toHaveLength(1);
		expect(r.notifications[0]?.dedupeKey).toBe(`legal:${in180}:180`);
		expect(r.notifications[0]?.recipients).toEqual(["owner-1"]);
	});
	it("Abweichung: Frist und fällige Wirksamkeitsprüfung melden", () => {
		const r = collectDueItems(NOW, {
			...empty,
			nonconformities: [
				{
					id: "nc1",
					code: "NC-2026-001",
					title: "Admin-Konten",
					status: "in_progress",
					dueAt: new Date(NOW.getTime() + 2 * DAY),
					effectivenessCheckAt: new Date(NOW.getTime() - DAY),
					effectivenessResult: null,
					ownerUserId: "o",
				},
				{
					id: "nc2",
					code: "NC-2026-002",
					title: "geschlossen",
					status: "closed",
					dueAt: new Date(NOW.getTime() - DAY),
					effectivenessCheckAt: null,
					effectivenessResult: "effective",
					ownerUserId: "o",
				},
			],
		});
		expect(r.notifications.map((n) => n.title)).toEqual([
			"Abweichung NC-2026-001: Admin-Konten",
			"Wirksamkeitsprüfung NC-2026-001",
		]);
	});
	it("TLPT nur bei Benennung; überfällig nach drei Jahren; Zugang abgelaufen → security_alert", () => {
		expect(
			collectDueItems(NOW, {
				...empty,
				tlpt: { designated: false, lastTlptAt: null },
			}).notifications,
		).toHaveLength(0);
		const r = collectDueItems(NOW, {
			...empty,
			tlpt: { designated: true, lastTlptAt: "2023-01-01" },
			accessExpiring: [
				{
					memberId: "m1",
					userId: "au",
					userName: "Prüferin",
					accessUntil: new Date(NOW.getTime() - DAY),
				},
				{
					memberId: "m2",
					userId: "au2",
					userName: "Prüfer",
					accessUntil: new Date(NOW.getTime() + 3 * DAY),
				},
			],
		});
		expect(r.notifications.map((n) => [n.kind, n.title])).toEqual([
			["review_due", "TLPT überfällig"],
			["security_alert", "Zugang abgelaufen: Prüferin"],
			["system", "Zugang läuft ab: Prüfer"],
		]);
	});

	it("Betroffenenanfrage: fällig in 7 Tagen und überfällig, Verlängerung verschiebt", () => {
		const now = new Date("2026-10-07T08:00:00Z");
		const res = collectDueItems(now, {
			...empty,
			dataSubjectRequests: [
				{
					id: "d1",
					type: "auskunft",
					dueAt: new Date("2026-10-10T08:00:00Z"),
					extendedUntil: null,
					status: "open",
					ownerUserId: "u1",
				},
				{
					id: "d2",
					type: "loeschung",
					dueAt: new Date("2026-10-01T08:00:00Z"),
					extendedUntil: new Date("2026-12-01T08:00:00Z"),
					status: "in_progress",
					ownerUserId: null,
				},
				{
					id: "d3",
					type: "auskunft",
					dueAt: new Date("2026-09-01T08:00:00Z"),
					extendedUntil: null,
					status: "done",
					ownerUserId: null,
				},
			],
		});
		const dsr = res.notifications.filter((n) => n.dedupeKey.startsWith("dsr:"));
		expect(dsr).toHaveLength(1);
		expect(dsr[0]?.recipients).toEqual(["u1"]);
		expect(dsr[0]?.link).toBe("/datenschutz?tab=anfragen");
	});

	it("Versicherung: 60 Tage vor Ablauf und abgelaufen, sonst still", () => {
		const now = new Date("2026-10-07T08:00:00Z");
		const res = collectDueItems(now, {
			...empty,
			insurancePolicies: [
				{
					id: "i1",
					type: "cyber",
					insurer: "A",
					validUntil: "2026-11-20",
					ownerUserId: "u1",
				},
				{
					id: "i2",
					type: "do",
					insurer: "B",
					validUntil: "2026-09-30",
					ownerUserId: null,
				},
				{
					id: "i3",
					type: "crime",
					insurer: "C",
					validUntil: "2027-06-30",
					ownerUserId: null,
				},
			],
		});
		const ins = res.notifications.filter((n) =>
			n.dedupeKey.startsWith("insurance:"),
		);
		expect(ins.map((n) => n.dedupeKey.split(":")[1])).toEqual(["i1", "i2"]);
		expect(ins[1]?.title).toContain("abgelaufen");
		expect(ins[1]?.recipients).toEqual([...empty.orgOwnerIds]);
	});

	it("Produkt: Supportende 365/180/90/30 Tage vorher und am Tag danach", () => {
		const now = new Date("2026-10-07T08:00:00Z");
		const prod = (id: string, supportUntil: string, status = "on_market") => ({
			id,
			code: id.toUpperCase(),
			name: "App",
			supportUntil,
			status,
			ownerUserId: "u1",
		});
		const res = collectDueItems(now, {
			...empty,
			products: [
				prod("p365", "2027-10-07"),
				prod("p90", "2027-01-05"),
				prod("p91", "2027-01-06"),
				prod("pend", "2026-10-06"),
				prod("pdone", "2027-01-05", "end_of_support"),
			],
		});
		const keys = res.notifications
			.filter((n) => n.dedupeKey.startsWith("product_support:"))
			.map((n) => n.dedupeKey);
		expect(keys).toEqual([
			"product_support:p365:365",
			"product_support:p90:90",
			"product_support:pend:ended",
		]);
	});
});

describe("collectDueItems — Lieferantenbewertungen", () => {
	it("erinnert 14 Tage nach Versand, dann wöchentlich und bei überschrittener Frist", () => {
		const sup = (
			id: string,
			sentDaysAgo: number,
			opts: { status?: string; dueAt?: string | null } = {},
		) => ({
			id,
			code: `LB-2026-${id}`,
			title: `Fragebogen ${id}`,
			providerId: `prov-${id}`,
			status: opts.status ?? "in_progress",
			dueAt: opts.dueAt ?? null,
			sentAt: new Date(NOW.getTime() - sentDaysAgo * DAY - HOUR),
			lastOpenedAt: null,
			ownerUserId: "u1",
		});
		const res = collectDueItems(NOW, {
			...empty,
			supplierAssessments: [
				sup("13", 13),
				sup("14", 14),
				sup("21", 21),
				sup("20", 20),
				sup("sub", 14, { status: "submitted" }),
				sup("due", 3, { dueAt: "2026-10-06" }),
			],
		});
		const hits = res.notifications.filter((n) =>
			n.dedupeKey.startsWith("supplier_reminder:"),
		);
		expect(hits.map((n) => n.dedupeKey).sort()).toEqual([
			"supplier_reminder:14:14",
			"supplier_reminder:21:21",
			"supplier_reminder:due:3",
		]);
		expect(hits.find((n) => n.dedupeKey.includes(":14:"))?.link).toBe(
			"/dienstleister/prov-14?tab=bewertungen",
		);
		expect(hits.find((n) => n.dedupeKey.includes(":due:"))?.body).toContain(
			"überschritten",
		);
	});

	it("fällige Dienstleister-Bewertung verlinkt die Detailseite", () => {
		const res = collectDueItems(NOW, {
			...empty,
			providerAssessments: [
				{
					id: "p1",
					name: "Hoster",
					nextAssessmentAt: "2026-10-09",
					ownerUserId: "u1",
				},
			],
		});
		expect(res.notifications[0]?.link).toBe(
			"/dienstleister/p1?tab=bewertungen",
		);
	});
});

describe("collectDueItems — Sicherheitsaufträge", () => {
	it("Bericht nach Testende (wöchentlich), Nachtest 7 Tage vorher und überfällig", () => {
		const eng = (
			id: string,
			status: string,
			endAt: string | null,
			retestDueAt: string | null,
		) => ({
			id,
			code: `SA-${id}`,
			title: "Pentest",
			status,
			endAt,
			retestDueAt,
			ownerUserId: "u1",
		});
		const res = collectDueItems(NOW, {
			...empty,
			engagements: [
				eng("end0", "in_progress", "2026-10-07", null),
				eng("end3", "in_progress", "2026-10-04", null),
				eng("end7", "authorized", "2026-09-30", null),
				eng("rt7", "delivered", null, "2026-10-14"),
				eng("rt6", "delivered", null, "2026-10-13"),
				eng("rtOver", "retest", null, "2026-09-30"),
				eng("closed", "closed", "2026-10-07", "2026-09-30"),
			],
		});
		const keys = res.notifications
			.map((n) => n.dedupeKey)
			.filter((k) => k.startsWith("engagement_"))
			.sort();
		expect(keys).toEqual([
			"engagement_report:end0:0",
			"engagement_report:end7:-7",
			"engagement_retest:rt7:7",
			"engagement_retest:rtOver:-7",
		]);
	});
});

describe("Asset-Lebenszyklus", () => {
	it("meldet Supportende 90 Tage vorher und am Tag danach, nicht dazwischen", () => {
		const now = new Date("2026-10-17T06:00:00Z");
		const asset = (supportEndAt: string) => ({
			id: "a1",
			name: "Fileserver",
			status: "active",
			endOfLifeAt: null,
			supportEndAt,
			maintenanceUntil: null,
			ownerUserId: "u1",
		});
		const at = (iso: string) =>
			collectDueItems(now, { ...empty, assets: [asset(iso)] }).notifications;
		expect(at("2027-01-15")[0]?.title).toBe(
			"Ende der Sicherheitsupdates in 90 Tagen: Fileserver",
		);
		expect(at("2026-10-16")[0]?.title).toBe(
			"Ende der Sicherheitsupdates überschritten: Fileserver",
		);
		expect(at("2026-12-01")).toHaveLength(0);
	});
});

describe("Ziele: Messintervall", () => {
	it("7 Tage vorher, am Tag und wöchentlich danach — nur freigegeben", () => {
		const now = new Date("2026-10-17T06:00:00Z");
		const at = (nextMeasureAt: string, approvalStatus = "approved") =>
			collectDueItems(now, {
				...empty,
				objectives: [
					{
						id: "o1",
						title: "Schulungsquote",
						nextMeasureAt,
						approvalStatus,
						status: "open",
						ownerUserId: "u1",
					},
				],
			}).notifications.map((n) => n.title);
		expect(at("2026-10-24")).toEqual(["Messung in 7 Tagen: Schulungsquote"]);
		expect(at("2026-10-17")).toEqual(["Messung heute fällig: Schulungsquote"]);
		expect(at("2026-10-10")).toEqual(["Messung überfällig: Schulungsquote"]);
		expect(at("2026-10-12")).toEqual([]);
		expect(at("2026-10-17", "proposed")).toEqual([]);
	});
});

describe("Verwahrung: Abstimmung, Backup-Test, Inhaberschaft", () => {
	const wallet = {
		id: "w1",
		code: "W-01",
		name: "Kunden Cold",
		purpose: "client",
		technology: "multisig",
		status: "active",
		nextBackupTestDue: null as string | null,
		ownerUserId: "u1",
	};
	const run = (now: Date, custody: NonNullable<DueRows["custody"]>) =>
		collectDueItems(now, { ...empty, orgOwnerIds: ["o1"], custody })
			.notifications;

	it("fehlende Abstimmung des letzten Geschäftstags erst ab 10 Uhr Berlin", () => {
		// Montag 26.10.2026 — Stichtag Freitag 23.10.
		const morning = new Date("2026-10-26T07:30:00Z"); // 08:30 Berlin
		const late = new Date("2026-10-26T10:30:00Z"); // 11:30 Berlin
		const c = {
			wallets: [wallet],
			holders: [],
			lastReconciliationDay: "2026-10-22",
		};
		expect(run(morning, c)).toHaveLength(0);
		const n = run(late, c);
		expect(n).toHaveLength(1);
		expect(n[0]?.dedupeKey).toBe("custody_recon:2026-10-23");
		expect(n[0]?.recipients.sort()).toEqual(["o1", "u1"]);
		expect(
			run(late, { ...c, lastReconciliationDay: "2026-10-23" }),
		).toHaveLength(0);
		// ohne Kundenwallet keine Erinnerung
		expect(
			run(late, { ...c, wallets: [{ ...wallet, purpose: "own" }] }),
		).toHaveLength(0);
	});

	it("Backup-Test 30 Tage vorher, am Tag, danach wöchentlich", () => {
		const now = new Date("2026-10-22T06:00:00Z");
		const at = (due: string) =>
			run(now, {
				wallets: [{ ...wallet, nextBackupTestDue: due }],
				holders: [],
				lastReconciliationDay: "2026-10-21",
			}).map((n) => n.title);
		expect(at("2026-11-21")).toEqual([
			"Backup-Test in 30 Tagen fällig: W-01 Kunden Cold",
		]);
		expect(at("2026-10-15")).toEqual([
			"Backup-Test überfällig: W-01 Kunden Cold",
		]);
		expect(at("2026-11-01")).toEqual([]);
	});

	it("befristete Inhaberschaft 14 Tage vorher und nach Ablauf", () => {
		const now = new Date("2026-10-22T06:00:00Z");
		const n = run(now, {
			wallets: [wallet],
			holders: [
				{
					id: "h1",
					walletId: "w1",
					name: "Max",
					until: "2026-11-05",
					status: "active",
				},
				{
					id: "h2",
					walletId: "w1",
					name: "Eva",
					until: "2026-10-15",
					status: "active",
				},
			],
			lastReconciliationDay: "2026-10-21",
		}).map((x) => x.title);
		expect(n).toEqual([
			"Inhaberschaft endet in 14 Tagen: Max (W-01)",
			"Inhaberschaft abgelaufen: Eva (W-01)",
		]);
	});
});
