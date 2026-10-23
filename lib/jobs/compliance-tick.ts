import type { EntityKind, NotificationKind } from "@/db/schema/enums";
import { previousBusinessDay } from "@/lib/custody/reconcile";

// Stündlicher Fachjob (ADR-011): sammelt fällige Dinge je Org und leitet
// daraus Benachrichtigungen, Eskalations-Aufgaben und Status-Übergänge ab.
//
// Dieser Teil ist pure und getestet (tests/compliance-tick.test.ts). Der
// Runner (lib/jobs/compliance-tick-runner.ts) lädt die Zeilen je Org in
// eigenem RLS-Kontext, ruft collectDueItems() auf und schreibt das Ergebnis.
//
// Fristen (Plan „Reine Funktionen"): 7-Tage-Horizont für Reviews, Nachweise
// und Dienstleister-Bewertungen; 2 h + überfällig für Vorfall-Uhren;
// Ausnahmen 30 Tage vor Ablauf; Dedupe 24 h über dedupeKey.

export const REVIEW_HORIZON_DAYS = 7;
export const EXCEPTION_HORIZON_DAYS = 30;
export const INCIDENT_SOON_HOURS = 2;
export const DEDUPE_HOURS = 24;
export const ACK_GRACE_DAYS = 7;
export const INSURANCE_WARN_DAYS = 60;
export const SUPPLIER_REMIND_DAYS = 14;

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type DueRows = {
	/** Org-Owner als Rückfall-Empfänger, wenn kein Owner gesetzt ist. */
	orgOwnerIds: readonly string[];
	controlReviews: readonly {
		code: string;
		title: string;
		nextReviewAt: Date | string | null;
		ownerUserId: string | null;
	}[];
	documentReviews: readonly {
		docNumber: string;
		title: string;
		nextReviewAt: Date | string | null;
		ownerUserId: string | null;
	}[];
	providerAssessments: readonly {
		id: string;
		name: string;
		nextAssessmentAt: Date | string | null;
		ownerUserId: string | null;
	}[];
	evidenceExpiring: readonly {
		id: string;
		title: string;
		validUntil: Date | string | null;
		createdByUserId: string | null;
	}[];
	approvals: readonly {
		id: string;
		kind: string;
		entityType: EntityKind;
		entityId: string;
		entityLabel: string | null;
		dueAt: Date | string | null;
		requestedByUserId: string | null;
		eligibleApproverIds: readonly string[];
	}[];
	exceptions: readonly {
		id: string;
		title: string;
		status: "requested" | "approved" | "expired" | "revoked";
		validUntil: Date | string | null;
		ownerUserId: string | null;
	}[];
	trainingAssignments: readonly {
		id: string;
		userId: string;
		requirementTitle: string;
		dueAt: Date | string | null;
		status: "due" | "overdue" | "done";
	}[];
	incidents: readonly {
		id: string;
		code: string;
		title: string;
		ownerUserId: string | null;
		status: string;
		clocks: readonly {
			label: string;
			dueAt: Date | string | null;
			reportedAt: Date | string | null;
		}[];
	}[];
	acknowledgements: readonly {
		docNumber: string;
		title: string;
		publishedAt: Date | string | null;
		missingUserIds: readonly string[];
	}[];
	/** Pflichten-Läufe (Kalender): Vorlauf → Aufgabe, überfällig → Status. */
	obligationRuns: readonly {
		id: string;
		code: string;
		title: string;
		dueAt: Date | string;
		status: "upcoming" | "due" | "done" | "overdue" | "waived";
		leadDays: number;
		ownerUserId: string | null;
	}[];
	/** Kommende Rechtsänderungen (vom Runner nach Rahmenwerken gefiltert). */
	legalChanges: readonly { date: string; title: string }[];
	/** Audittermine aus dem Turnus je Rahmenwerk (ohne die im Register). */
	auditCycles?: readonly {
		framework: string;
		kind: string;
		label: string;
		date: string;
	}[];
	nonconformities: readonly {
		id: string;
		code: string;
		title: string;
		status: string;
		dueAt: Date | string | null;
		// Frist für den Maßnahmenplan (Audits & Fristen); erfüllt, sobald die
		// Korrekturmaßnahme steht
		planDueAt?: Date | string | null;
		hasPlan?: boolean;
		effectivenessCheckAt: Date | string | null;
		effectivenessResult: string | null;
		ownerUserId: string | null;
	}[];
	tlpt: { designated: boolean; lastTlptAt: Date | string | null } | null;
	regulatorDeadlines: readonly {
		id: string;
		subject: string;
		deadline: Date | string | null;
		status: string;
		ownerUserId: string | null;
	}[];
	accessExpiring: readonly {
		memberId: string;
		userId: string;
		userName: string | null;
		accessUntil: Date | string;
	}[];
	/** Betroffenenanfragen (DSGVO Art. 12 Abs. 3): Monatsfrist, ggf. verlängert. */
	dataSubjectRequests: readonly {
		id: string;
		type: string;
		dueAt: Date | string;
		extendedUntil: Date | string | null;
		status: string;
		ownerUserId: string | null;
	}[];
	/** Versicherungen: Ablauf 60 Tage vorher und bei Ablauf. */
	insurancePolicies: readonly {
		id: string;
		type: string;
		insurer: string;
		validUntil: Date | string | null;
		ownerUserId: string | null;
	}[];
	/** Produkte (CRA): Hinweis vor Ende des Unterstützungszeitraums. */
	products?: readonly {
		id: string;
		code: string;
		name: string;
		supportUntil: Date | string | null;
		status: string;
		ownerUserId: string | null;
	}[];
	/** Ziele (B5): Messintervall — 7 Tage vorher, am Tag, danach wöchentlich. */
	objectives?: readonly {
		id: string;
		title: string;
		nextMeasureAt: string | null;
		approvalStatus: string;
		status: string;
		ownerUserId: string | null;
	}[];
	/** Assets (B2): Herstellerende, Ende der Sicherheitsupdates, Wartungsende. */
	assets?: readonly {
		id: string;
		name: string;
		status: string;
		endOfLifeAt: string | null;
		supportEndAt: string | null;
		maintenanceUntil: string | null;
		ownerUserId: string | null;
	}[];
	/** Sicherheitsbefunde (S5): SLA kritisch/hoch, Ablauf von Akzeptanzen. */
	securityFindings?: readonly {
		id: string;
		title: string;
		severity: string;
		status: string;
		dueAt: Date | string | null;
		acceptedUntil: Date | string | null;
		ownerUserId: string | null;
	}[];
	/** Lieferantenbewertungen (S6): Link verschickt, noch nicht eingereicht. */
	supplierAssessments?: readonly {
		id: string;
		code: string;
		title: string;
		providerId: string | null;
		status: string;
		dueAt: Date | string | null;
		// erster Portal-Link (Versand) bzw. letzter Zugriff des Lieferanten
		sentAt: Date | string | null;
		lastOpenedAt: Date | string | null;
		ownerUserId: string | null;
	}[];
	/** Sicherheitsaufträge (S7): Bericht nach Testende, Nachtest-Frist. */
	engagements?: readonly {
		id: string;
		code: string;
		title: string;
		status: string;
		endAt: Date | string | null;
		retestDueAt: Date | string | null;
		ownerUserId: string | null;
	}[];
	/** Verwahrung: Abstimmung, Backup-Tests, befristete Inhaberschaften. */
	custody?: {
		wallets: readonly {
			id: string;
			code: string;
			name: string;
			purpose: string;
			technology: string;
			status: string;
			nextBackupTestDue: string | null;
			ownerUserId: string | null;
		}[];
		holders: readonly {
			id: string;
			walletId: string;
			name: string;
			until: string | null;
			status: string;
		}[];
		lastReconciliationDay: string | null;
	};
	/** Offene Aufgaben (für Dedupe von Eskalationen/Ablauf-Aufgaben). */
	openTasks: readonly {
		entityType: string | null;
		entityId: string | null;
		sourceKind: string;
	}[];
};

export type PendingNotification = {
	kind: NotificationKind;
	recipients: string[];
	title: string;
	body?: string;
	link: string;
	/** Stabil je Sachverhalt — gleicher Key innerhalb DEDUPE_HOURS → kein Duplikat. */
	dedupeKey: string;
};

export type PendingTask = {
	title: string;
	description?: string;
	assigneeUserId: string | null;
	dueAt: string | null; // ISO-Datum
	priority: "low" | "normal" | "high" | "critical";
	entityType: EntityKind;
	entityId: string;
	sourceKind: "escalation" | "review" | "acknowledgement" | "obligation";
};

export type PendingAction =
	| { type: "expire_exception"; id: string }
	| { type: "mark_training_overdue"; id: string }
	| { type: "mark_run_due"; id: string }
	| { type: "mark_run_overdue"; id: string }
	| { type: "reopen_finding"; id: string };

export const LEGAL_CHANGE_MARKS = [180, 90, 30, 7] as const;
// Vorlauf für Audittermine aus dem Turnus (Planung, Unterlagen, Einladung)
export const AUDIT_CYCLE_MARKS = [90, 30, 7] as const;
// CRA Art. 13 Abs. 19 / Anhang II: Nutzer rechtzeitig über das Supportende
// informieren — Hinweise an den Verantwortlichen 1 Jahr, 6/3/1 Monat vorher.
export const SUPPORT_END_MARKS = [365, 180, 90, 30] as const;
export const ASSET_LIFECYCLE_MARKS = [180, 90, 30] as const;
export const TLPT_CYCLE_YEARS = 3;
export const ACCESS_EXPIRY_WARN_DAYS = 7;

export type TickResult = {
	notifications: PendingNotification[];
	tasks: PendingTask[];
	actions: PendingAction[];
};

function toDate(v: Date | string | null | undefined): Date | null {
	if (!v) return null;
	const d = v instanceof Date ? v : new Date(v);
	return Number.isNaN(d.getTime()) ? null : d;
}

function isoDay(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function daysUntil(now: Date, d: Date): number {
	return Math.ceil((d.getTime() - now.getTime()) / DAY);
}

function fmtDay(d: Date): string {
	return new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	}).format(d);
}

function fmtTime(d: Date): string {
	return new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	}).format(d);
}

function dueWording(now: Date, due: Date): string {
	const days = daysUntil(now, due);
	if (days < 0)
		return `seit ${Math.abs(days)} Tag${Math.abs(days) === 1 ? "" : "en"} überfällig`;
	if (days === 0) return "heute fällig";
	return `fällig in ${days} Tag${days === 1 ? "" : "en"} (${fmtDay(due)})`;
}

function berlinHour(d: Date): number {
	const hour = new Intl.DateTimeFormat("de-DE", {
		hour: "numeric",
		hourCycle: "h23",
		timeZone: "Europe/Berlin",
	})
		.formatToParts(d)
		.find((p) => p.type === "hour")?.value;
	return Number(hour ?? 0);
}

function recipientsOf(
	owner: string | null | undefined,
	fallback: readonly string[],
): string[] {
	return owner ? [owner] : [...fallback];
}

export function collectDueItems(now: Date, rows: DueRows): TickResult {
	const notifications: PendingNotification[] = [];
	const tasks: PendingTask[] = [];
	const actions: PendingAction[] = [];
	const horizon = new Date(now.getTime() + REVIEW_HORIZON_DAYS * DAY);
	const exceptionHorizon = new Date(
		now.getTime() + EXCEPTION_HORIZON_DAYS * DAY,
	);
	const soon = new Date(now.getTime() + INCIDENT_SOON_HOURS * HOUR);
	const hasOpenTask = (
		entityType: string,
		entityId: string,
		sourceKind: string,
	) =>
		rows.openTasks.some(
			(t) =>
				t.entityType === entityType &&
				t.entityId === entityId &&
				t.sourceKind === sourceKind,
		);

	// Reviews: Controls, Dokumente, Dienstleister (7-Tage-Horizont + überfällig)
	for (const c of rows.controlReviews) {
		const due = toDate(c.nextReviewAt);
		if (!due || due > horizon) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(c.ownerUserId, rows.orgOwnerIds),
			title: `Review fällig: ${c.code}`,
			body: `${c.title} — ${dueWording(now, due)}.`,
			link: `/controls/${encodeURIComponent(c.code)}`,
			dedupeKey: `review:control:${c.code}:${isoDay(due)}`,
		});
	}
	for (const d of rows.documentReviews) {
		const due = toDate(d.nextReviewAt);
		if (!due || due > horizon) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(d.ownerUserId, rows.orgOwnerIds),
			title: `Dokument-Review fällig: ${d.docNumber}`,
			body: `${d.title} — ${dueWording(now, due)}.`,
			link: `/dokumente/${encodeURIComponent(d.docNumber)}`,
			dedupeKey: `review:document:${d.docNumber}:${isoDay(due)}`,
		});
	}
	for (const p of rows.providerAssessments) {
		const due = toDate(p.nextAssessmentAt);
		if (!due || due > horizon) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(p.ownerUserId, rows.orgOwnerIds),
			title: `Dienstleister-Bewertung fällig: ${p.name}`,
			body: dueWording(now, due),
			link: `/dienstleister/${encodeURIComponent(p.id)}?tab=bewertungen`,
			dedupeKey: `review:provider:${p.id}:${isoDay(due)}`,
		});
	}

	// Nachweise mit Ablaufdatum
	for (const e of rows.evidenceExpiring) {
		const until = toDate(e.validUntil);
		if (!until || until > horizon) continue;
		notifications.push({
			kind: "evidence_expiring",
			recipients: recipientsOf(e.createdByUserId, rows.orgOwnerIds),
			title: `Nachweis läuft ab: ${e.title}`,
			body: dueWording(now, until),
			link: "/nachweise",
			dedupeKey: `evidence:${e.id}:${isoDay(until)}`,
		});
	}

	// Freigaben über SLA → approval_overdue + Eskalations-Aufgabe (einmal)
	for (const a of rows.approvals) {
		const due = toDate(a.dueAt);
		if (!due || due > now) continue;
		const label = a.entityLabel ?? `${a.entityType} ${a.entityId.slice(0, 8)}`;
		const recipients = [
			...new Set([
				...a.eligibleApproverIds,
				...(a.requestedByUserId ? [a.requestedByUserId] : []),
				...rows.orgOwnerIds,
			]),
		];
		notifications.push({
			kind: "approval_overdue",
			recipients,
			title: `Freigabe überfällig: ${label}`,
			body: `${a.kind} — SLA seit ${fmtTime(due)} überschritten.`,
			link: "/heute/freigaben",
			dedupeKey: `approval_overdue:${a.id}`,
		});
		// Eskalation hängt an der Entität der Freigabe (eine je Entität offen).
		if (!hasOpenTask(a.entityType, a.entityId, "escalation")) {
			tasks.push({
				title: `Freigabe eskalieren: ${label}`,
				description: `Die Freigabe (${a.kind}) hat ihr SLA überschritten. Entscheidung einholen oder Vertretung einrichten.`,
				assigneeUserId: rows.orgOwnerIds[0] ?? null,
				dueAt: isoDay(new Date(now.getTime() + 2 * DAY)),
				priority: "high",
				entityType: a.entityType,
				entityId: a.entityId,
				sourceKind: "escalation",
			});
		}
	}

	// Ausnahmen: 30 Tage vor Ablauf Aufgabe + Hinweis; abgelaufen → Status
	for (const x of rows.exceptions) {
		if (x.status !== "approved" && x.status !== "requested") continue;
		const until = toDate(x.validUntil);
		if (!until) continue;
		if (until <= now) {
			actions.push({ type: "expire_exception", id: x.id });
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(x.ownerUserId, rows.orgOwnerIds),
				title: `Ausnahme abgelaufen: ${x.title}`,
				body: `Gültig bis ${fmtDay(until)}. Verlängern (neue Ausnahme) oder Control umsetzen.`,
				link: "/risiken?tab=ausnahmen",
				dedupeKey: `exception_expired:${x.id}`,
			});
			continue;
		}
		if (until <= exceptionHorizon) {
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(x.ownerUserId, rows.orgOwnerIds),
				title: `Ausnahme läuft ab: ${x.title}`,
				body: dueWording(now, until),
				link: "/risiken?tab=ausnahmen",
				dedupeKey: `exception_expiring:${x.id}:${isoDay(until)}`,
			});
			if (!hasOpenTask("exception", x.id, "review")) {
				tasks.push({
					title: `Ausnahme prüfen: ${x.title}`,
					description: `Läuft am ${fmtDay(until)} ab — verlängern, zurückziehen oder Control umsetzen.`,
					assigneeUserId: x.ownerUserId ?? rows.orgOwnerIds[0] ?? null,
					dueAt: isoDay(until),
					priority: "normal",
					entityType: "exception",
					entityId: x.id,
					sourceKind: "review",
				});
			}
		}
	}

	// Schulungen: fällig/überfällig je Person
	for (const ta of rows.trainingAssignments) {
		if (ta.status === "done") continue;
		const due = toDate(ta.dueAt);
		if (!due) continue;
		if (due < now && ta.status === "due") {
			actions.push({ type: "mark_training_overdue", id: ta.id });
		}
		if (due > horizon) continue;
		notifications.push({
			kind: "review_due",
			recipients: [ta.userId],
			title: `Schulung fällig: ${ta.requirementTitle}`,
			body: dueWording(now, due),
			link: "/schulungen?tab=meine",
			dedupeKey: `training:${ta.id}:${isoDay(due)}`,
		});
	}

	// Vorfall-Uhren: < 2 h oder überfällig, solange nicht gemeldet
	for (const inc of rows.incidents) {
		if (inc.status === "closed") continue;
		for (const clock of inc.clocks) {
			if (clock.reportedAt) continue;
			const due = toDate(clock.dueAt);
			if (!due || due > soon) continue;
			const overdue = due <= now;
			notifications.push({
				kind: "incident_deadline",
				recipients: recipientsOf(inc.ownerUserId, rows.orgOwnerIds),
				title: `${overdue ? "Meldefrist überschritten" : "Meldefrist in < 2 h"}: ${inc.code}`,
				body: `${clock.label} — ${inc.title} (${fmtTime(due)}).`,
				link: `/vorfaelle/${encodeURIComponent(inc.id)}`,
				dedupeKey: `incident:${inc.id}:${clock.label}:${overdue ? "overdue" : "soon"}`,
			});
		}
	}

	// Kenntnisnahmen: nach ACK_GRACE_DAYS erinnern
	for (const ack of rows.acknowledgements) {
		const published = toDate(ack.publishedAt);
		if (!published) continue;
		if (now.getTime() - published.getTime() < ACK_GRACE_DAYS * DAY) continue;
		if (ack.missingUserIds.length === 0) continue;
		notifications.push({
			kind: "acknowledgement_due",
			recipients: [...ack.missingUserIds],
			title: `Kenntnisnahme offen: ${ack.docNumber}`,
			body: `${ack.title} — bitte auf „Heute" bestätigen.`,
			link: "/heute",
			dedupeKey: `ack:${ack.docNumber}:${isoDay(published)}`,
		});
	}

	// Pflichten-Läufe: im Vorlauf → Aufgabe + Hinweis; überfällig → Status + Hinweis
	for (const run of rows.obligationRuns) {
		if (run.status === "done" || run.status === "waived") continue;
		const due = toDate(run.dueAt);
		if (!due) continue;
		const endOfDue = new Date(due.getTime() + DAY - 1);
		if (endOfDue < now) {
			if (run.status !== "overdue")
				actions.push({ type: "mark_run_overdue", id: run.id });
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(run.ownerUserId, rows.orgOwnerIds),
				title: `Pflicht überfällig: ${run.title}`,
				body: `${run.code} — ${dueWording(now, due)}.`,
				link: "/kalender",
				dedupeKey: `run_overdue:${run.id}`,
			});
			continue;
		}
		const leadStart = new Date(due.getTime() - run.leadDays * DAY);
		if (now >= leadStart) {
			if (run.status === "upcoming")
				actions.push({ type: "mark_run_due", id: run.id });
			if (!hasOpenTask("obligation_run", run.id, "obligation")) {
				tasks.push({
					title: `${run.title} (${run.code})`,
					description: `Pflichten-Lauf fällig am ${fmtDay(due)}. Nachweis im Kalender eintragen.`,
					assigneeUserId: run.ownerUserId ?? rows.orgOwnerIds[0] ?? null,
					dueAt: isoDay(due),
					priority: "normal",
					entityType: "obligation_run",
					entityId: run.id,
					sourceKind: "obligation",
				});
			}
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(run.ownerUserId, rows.orgOwnerIds),
				title: `Pflicht fällig: ${run.title}`,
				body: `${run.code} — ${dueWording(now, due)}.`,
				link: "/kalender",
				dedupeKey: `run_due:${run.id}:${isoDay(due)}`,
			});
		}
	}

	// Rechtsänderungen: Hinweis an Org-Owner bei 180/90/30/7 Tagen Vorlauf
	for (const lc of rows.legalChanges) {
		const d = toDate(`${lc.date}T00:00:00Z`);
		if (!d) continue;
		const days = daysUntil(now, d);
		const mark = LEGAL_CHANGE_MARKS.find((m) => days === m);
		if (mark === undefined) continue;
		notifications.push({
			kind: "system",
			recipients: [...rows.orgOwnerIds],
			title: `Rechtsänderung in ${mark} Tagen: ${lc.title}`,
			body: `Gilt ab ${fmtDay(d)}. Rahmenwerke und Richtlinien prüfen.`,
			link: "/kalender?tab=rechtsaenderungen",
			dedupeKey: `legal:${lc.date}:${mark}`,
		});
	}

	// Audittermine aus dem Turnus: Hinweis an Org-Owner bei 90/30/7 Tagen
	for (const a of rows.auditCycles ?? []) {
		const d = toDate(`${a.date}T00:00:00Z`);
		if (!d) continue;
		const days = daysUntil(now, d);
		const mark = AUDIT_CYCLE_MARKS.find((m) => days === m);
		if (mark === undefined) continue;
		notifications.push({
			kind: "review_due",
			recipients: [...rows.orgOwnerIds],
			title: `${a.label} in ${mark} Tagen (${a.framework})`,
			body: `Termin laut Turnus: ${fmtDay(d)}. Audit im Register planen und offene Abweichungen prüfen.`,
			link: "/audits",
			dedupeKey: `audit_cycle:${a.framework}:${a.kind}:${a.date}:${mark}`,
		});
	}

	// Abweichungen: Maßnahmenplan, Frist und Wirksamkeitsprüfung
	for (const nc of rows.nonconformities) {
		if (nc.status === "closed") continue;
		const plan = toDate(nc.planDueAt ?? null);
		if (plan && !nc.hasPlan && nc.status === "open" && plan <= horizon) {
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(nc.ownerUserId, rows.orgOwnerIds),
				title: `Maßnahmenplan ${nc.code}: ${nc.title}`,
				body: `Ursache, Korrektur und Korrekturmaßnahme festlegen — ${dueWording(now, plan)}.`,
				link: `/abweichungen/${nc.id}`,
				dedupeKey: `nc_plan:${nc.id}:${isoDay(plan)}`,
			});
		}
		const due = toDate(nc.dueAt);
		if (due && due <= horizon) {
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(nc.ownerUserId, rows.orgOwnerIds),
				title: `Abweichung ${nc.code}: ${nc.title}`,
				body: dueWording(now, due),
				link: `/abweichungen/${nc.id}`,
				dedupeKey: `nc_due:${nc.id}:${isoDay(due)}`,
			});
		}
		const eff = toDate(nc.effectivenessCheckAt);
		if (eff && !nc.effectivenessResult && eff <= horizon) {
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(nc.ownerUserId, rows.orgOwnerIds),
				title: `Wirksamkeitsprüfung ${nc.code}`,
				body: `${nc.title} — ${dueWording(now, eff)}.`,
				link: `/abweichungen/${nc.id}`,
				dedupeKey: `nc_eff:${nc.id}:${isoDay(eff)}`,
			});
		}
	}

	// TLPT-Uhr (nur bei Benennung): Monatshinweis bei „bald"/„überfällig"/„nie"
	if (rows.tlpt?.designated) {
		const last = toDate(rows.tlpt.lastTlptAt);
		const month = isoDay(now).slice(0, 7);
		if (!last) {
			notifications.push({
				kind: "review_due",
				recipients: [...rows.orgOwnerIds],
				title: "TLPT: noch kein bedrohungsorientierter Penetrationstest",
				body: "Als benanntes Unternehmen ist ein TLPT alle drei Jahre fällig (DORA Art. 26).",
				link: "/testprogramm",
				dedupeKey: `tlpt:never:${month}`,
			});
		} else {
			const due = new Date(last);
			due.setFullYear(due.getFullYear() + TLPT_CYCLE_YEARS);
			const days = daysUntil(now, due);
			if (days <= 180) {
				notifications.push({
					kind: "review_due",
					recipients: [...rows.orgOwnerIds],
					title: days < 0 ? "TLPT überfällig" : "TLPT fällig",
					body: dueWording(now, due),
					link: "/testprogramm",
					dedupeKey: `tlpt:${days < 0 ? "overdue" : "soon"}:${month}`,
				});
			}
		}
	}

	// Aufsichtskontakte mit Frist
	for (const r of rows.regulatorDeadlines) {
		if (r.status !== "open") continue;
		const due = toDate(r.deadline);
		if (!due || due > horizon) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(r.ownerUserId, rows.orgOwnerIds),
			title: `Frist Aufsicht: ${r.subject}`,
			body: dueWording(now, due),
			link: "/organisation?tab=aufsicht",
			dedupeKey: `regulator:${r.id}:${isoDay(due)}`,
		});
	}

	// Betroffenenanfragen: 7 Tage vor Fristende und überfällig
	for (const r of rows.dataSubjectRequests) {
		if (r.status === "done" || r.status === "rejected") continue;
		const due = toDate(r.extendedUntil ?? r.dueAt);
		if (!due || due > horizon) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(r.ownerUserId, rows.orgOwnerIds),
			title: `Betroffenenanfrage (${r.type}) ${due < now ? "überfällig" : "fällig"}`,
			body: dueWording(now, due),
			link: "/datenschutz?tab=anfragen",
			dedupeKey: `dsr:${r.id}:${isoDay(due)}`,
		});
	}

	// Versicherungen: 60 Tage vor Ablauf und bei Ablauf
	for (const p of rows.insurancePolicies) {
		const until = toDate(p.validUntil);
		if (!until) continue;
		const days = daysUntil(now, until);
		if (days > INSURANCE_WARN_DAYS) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(p.ownerUserId, rows.orgOwnerIds),
			title: `Versicherung ${p.type} (${p.insurer}) ${days < 0 ? "abgelaufen" : "läuft ab"}`,
			body: dueWording(now, until),
			link: "/organisation?tab=versicherungen",
			dedupeKey: `insurance:${p.id}:${isoDay(until)}`,
		});
	}

	// Produkte: Supportende ankündigen (Marken) und bei Ablauf
	for (const p of rows.products ?? []) {
		if (p.status === "withdrawn" || p.status === "end_of_support") continue;
		const until = toDate(p.supportUntil);
		if (!until) continue;
		const days = daysUntil(now, until);
		const mark = SUPPORT_END_MARKS.find((m) => days === m);
		if (mark === undefined && days !== -1) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(p.ownerUserId, rows.orgOwnerIds),
			title:
				days < 0
					? `Support abgelaufen: ${p.code} ${p.name}`
					: `Supportende in ${mark} Tagen: ${p.code} ${p.name}`,
			body:
				days < 0
					? "Status auf „Supportende“ setzen oder den Zeitraum verlängern; Nutzer informieren."
					: `Unterstützungszeitraum endet am ${fmtDay(until)}. Nutzer informieren, Verlängerung oder Nachfolger planen.`,
			link: `/produkte/${p.id}?tab=einstufung`,
			dedupeKey: `product_support:${p.id}:${days < 0 ? "ended" : mark}`,
		});
	}

	// Ziele: Messung fällig (nur freigegebene, laufende Ziele)
	for (const o of rows.objectives ?? []) {
		if (o.approvalStatus !== "approved") continue;
		if (o.status === "achieved" || o.status === "dropped") continue;
		const at = toDate(o.nextMeasureAt);
		if (!at) continue;
		const days = daysUntil(now, at);
		const due = days === 7 || days === 0 || (days < 0 && -days % 7 === 0);
		if (!due) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(o.ownerUserId, rows.orgOwnerIds),
			title:
				days < 0
					? `Messung überfällig: ${o.title}`
					: days === 0
						? `Messung heute fällig: ${o.title}`
						: `Messung in 7 Tagen: ${o.title}`,
			body: `Nächste Messung am ${fmtDay(at)}. Wert unter Organisation → Ziele & KPIs eintragen.`,
			link: "/organisation?tab=ziele",
			dedupeKey: `objective_measure:${o.id}:${isoDay(now)}`,
		});
	}

	// Assets: Herstellerende, Supportende, Wartungsende — 180/90/30 Tage
	// vorher und am Tag danach (abgelaufen)
	for (const a of rows.assets ?? []) {
		if (a.status === "retired") continue;
		for (const [field, label] of [
			["endOfLifeAt", "Herstellerende"],
			["supportEndAt", "Ende der Sicherheitsupdates"],
			["maintenanceUntil", "Wartungsende"],
		] as const) {
			const at = toDate(a[field]);
			if (!at) continue;
			const days = daysUntil(now, at);
			const mark = ASSET_LIFECYCLE_MARKS.find((m) => days === m);
			if (mark === undefined && days !== -1) continue;
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(a.ownerUserId, rows.orgOwnerIds),
				title:
					days < 0
						? `${label} überschritten: ${a.name}`
						: `${label} in ${mark} Tagen: ${a.name}`,
				body:
					days < 0
						? "Ersatz, Verlängerung oder Ausmusterung entscheiden — oder das Risiko erfassen."
						: `${label} am ${fmtDay(at)}. Ersatz oder Verlängerung planen.`,
				link: "/assets?lebenszyklus=1",
				dedupeKey: `asset_lifecycle:${a.id}:${field}:${days < 0 ? "ended" : mark}`,
			});
		}
	}

	// Verwahrung: fehlende Abstimmung des letzten Geschäftstags (ab 10 Uhr
	// Berlin), Backup-Test 30 Tage vorher, am Tag und danach wöchentlich,
	// befristete Inhaberschaft 14 Tage vorher, am Tag und danach wöchentlich.
	if (rows.custody) {
		const c = rows.custody;
		const active = c.wallets.filter((w) => w.status === "active");
		const clientOwners = active
			.filter((w) => w.purpose === "client")
			.map((w) => w.ownerUserId)
			.filter((u): u is string => Boolean(u));
		const stichtag = previousBusinessDay(now);
		if (
			active.some((w) => w.purpose === "client") &&
			berlinHour(now) >= 10 &&
			(!c.lastReconciliationDay || c.lastReconciliationDay < stichtag)
		)
			notifications.push({
				kind: "review_due",
				recipients: [...new Set([...clientOwners, ...rows.orgOwnerIds])],
				title: `Abstimmung Kundenvermögen fehlt: ${fmtDay(new Date(`${stichtag}T12:00:00Z`))}`,
				body: "Bestand on-chain gegen Kundenbuch je Kryptowert erfassen (MiCAR Art. 70, 75).",
				link: "/verwahrung?tab=abstimmung",
				dedupeKey: `custody_recon:${stichtag}`,
			});
		for (const w of active) {
			if (w.technology === "sub_custodian") continue;
			const at = toDate(w.nextBackupTestDue);
			if (!at) continue;
			const d = daysUntil(now, at);
			if (d !== 30 && d !== 0 && !(d < 0 && -d % 7 === 0)) continue;
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(w.ownerUserId, rows.orgOwnerIds),
				title:
					d < 0
						? `Backup-Test überfällig: ${w.code} ${w.name}`
						: `Backup-Test ${d === 0 ? "heute" : "in 30 Tagen"} fällig: ${w.code} ${w.name}`,
				body: "Wiederherstellung aus dem Backup testen und als Zeremonie erfassen (CC-KEY-03).",
				link: `/verwahrung/${w.id}`,
				dedupeKey: `wallet_backup:${w.id}:${d}`,
			});
		}
		const byWallet = new Map(active.map((w) => [w.id, w]));
		for (const h of c.holders) {
			const w = byWallet.get(h.walletId);
			if (!w || h.status !== "active") continue;
			const at = toDate(h.until);
			if (!at) continue;
			const d = daysUntil(now, at);
			if (d !== 14 && d !== 0 && !(d < 0 && -d % 7 === 0)) continue;
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(w.ownerUserId, rows.orgOwnerIds),
				title:
					d < 0
						? `Inhaberschaft abgelaufen: ${h.name} (${w.code})`
						: `Inhaberschaft endet ${d === 0 ? "heute" : "in 14 Tagen"}: ${h.name} (${w.code})`,
				body: "Verlängern oder entziehen und den Schlüssel austauschen (CCSS 1.06).",
				link: `/verwahrung/${w.id}`,
				dedupeKey: `key_holder:${h.id}:${d}`,
			});
		}
	}

	// Sicherheitsbefunde: Akzeptanz abgelaufen → wieder offen; kritisch/hoch
	// drei Tage vor der SLA-Frist und danach wöchentlich, solange offen
	for (const f of rows.securityFindings ?? []) {
		if (f.status === "accepted") {
			const until = toDate(f.acceptedUntil);
			if (!until || daysUntil(now, until) > 0) continue;
			actions.push({ type: "reopen_finding", id: f.id });
			notifications.push({
				kind: "security_alert",
				recipients: recipientsOf(f.ownerUserId, rows.orgOwnerIds),
				title: `Akzeptanz abgelaufen: ${f.title}`,
				body: "Der Befund ist wieder offen — beheben oder erneut mit Begründung akzeptieren.",
				link: `/sicherheit/befunde/${f.id}`,
				dedupeKey: `sec_accept:${f.id}:${isoDay(until)}`,
			});
			continue;
		}
		if (f.severity !== "critical" && f.severity !== "high") continue;
		if (f.status !== "open" && f.status !== "in_progress") continue;
		const due = toDate(f.dueAt);
		if (!due) continue;
		const d = daysUntil(now, due);
		if (d !== 3 && !(d <= 0 && -d % 7 === 0)) continue;
		notifications.push({
			kind: f.severity === "critical" ? "security_alert" : "review_due",
			recipients: recipientsOf(f.ownerUserId, rows.orgOwnerIds),
			title: `${d > 0 ? "Frist läuft ab" : "Frist überschritten"}: ${f.title}`,
			body: dueWording(now, due),
			link: `/sicherheit/befunde/${f.id}`,
			dedupeKey: `sec_sla:${f.id}:${d}`,
		});
	}

	// Lieferantenbewertungen: 14 Tage nach Versand ohne Einreichung, danach
	// wöchentlich; zur erbetenen Frist (überschritten) ebenfalls
	for (const a of rows.supplierAssessments ?? []) {
		if (a.status !== "in_progress" && a.status !== "draft") continue;
		const sent = toDate(a.sentAt);
		if (!sent) continue;
		const since = -daysUntil(now, sent);
		const due = toDate(a.dueAt);
		const overdue = due ? daysUntil(now, due) : null;
		const remind =
			(since >= SUPPLIER_REMIND_DAYS &&
				(since - SUPPLIER_REMIND_DAYS) % 7 === 0) ||
			overdue === -1;
		if (!remind) continue;
		const opened = toDate(a.lastOpenedAt);
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(a.ownerUserId, rows.orgOwnerIds),
			title: `Lieferant hat noch nicht geantwortet: ${a.title}`,
			body: [
				`${a.code}: Link seit ${since} Tagen verschickt`,
				opened ? `zuletzt geöffnet am ${fmtDay(opened)}` : "noch nie geöffnet",
				overdue !== null && overdue < 0
					? `Frist ${fmtDay(due as Date)} überschritten`
					: null,
			]
				.filter(Boolean)
				.join(", ")
				.concat(". Nachfassen oder neuen Link schicken."),
			link: a.providerId
				? `/dienstleister/${encodeURIComponent(a.providerId)}?tab=bewertungen`
				: `/gap-analyse/${a.id}`,
			dedupeKey: `supplier_reminder:${a.id}:${since}`,
		});
	}

	// Sicherheitsaufträge: Testzeitraum vorbei ohne Bericht (dann wöchentlich);
	// Nachtest 7 Tage vorher und ab Fälligkeit wöchentlich
	for (const e of rows.engagements ?? []) {
		const link = `/sicherheit/auftraege/${e.id}`;
		if (e.status === "authorized" || e.status === "in_progress") {
			const end = toDate(e.endAt);
			if (!end) continue;
			const d = daysUntil(now, end);
			if (d > 0 || -d % 7 !== 0) continue;
			notifications.push({
				kind: "review_due",
				recipients: recipientsOf(e.ownerUserId, rows.orgOwnerIds),
				title: `Testzeitraum vorbei: ${e.code} ${e.title}`,
				body: `Ende war am ${fmtDay(end)}. Befunde erfassen, Management-Summary schreiben und den Bericht liefern — oder den Zeitraum verlängern.`,
				link: `${link}?tab=bericht`,
				dedupeKey: `engagement_report:${e.id}:${d}`,
			});
			continue;
		}
		if (e.status !== "delivered" && e.status !== "retest") continue;
		const due = toDate(e.retestDueAt);
		if (!due) continue;
		const d = daysUntil(now, due);
		if (d !== 7 && !(d <= 0 && -d % 7 === 0)) continue;
		notifications.push({
			kind: "review_due",
			recipients: recipientsOf(e.ownerUserId, rows.orgOwnerIds),
			title: `${d > 0 ? "Nachtest fällig" : "Nachtest überfällig"}: ${e.code} ${e.title}`,
			body: dueWording(now, due),
			link: `${link}?tab=nachtest`,
			dedupeKey: `engagement_retest:${e.id}:${d}`,
		});
	}

	// Zeitlich begrenzte Zugänge (Prüfer:innen): 7 Tage vorher und bei Ablauf
	for (const a of rows.accessExpiring) {
		const until = toDate(a.accessUntil);
		if (!until) continue;
		const days = daysUntil(now, until);
		if (days < 0) {
			notifications.push({
				kind: "security_alert",
				recipients: [...rows.orgOwnerIds],
				title: `Zugang abgelaufen: ${a.userName ?? a.userId}`,
				body: `Der zeitlich begrenzte Zugang endete am ${fmtDay(until)}. Mitglied entfernen oder verlängern.`,
				link: "/team",
				dedupeKey: `access_expired:${a.memberId}`,
			});
		} else if (days <= ACCESS_EXPIRY_WARN_DAYS) {
			notifications.push({
				kind: "system",
				recipients: [...rows.orgOwnerIds],
				title: `Zugang läuft ab: ${a.userName ?? a.userId}`,
				body: dueWording(now, until),
				link: "/team",
				dedupeKey: `access_expiring:${a.memberId}:${isoDay(until)}`,
			});
		}
	}

	return { notifications, tasks, actions };
}

// Dedupe-Filter: liefert nur Benachrichtigungen, deren dedupeKey nicht in
// den letzten DEDUPE_HOURS für denselben Empfänger gesendet wurde.
export function dedupeNotifications(
	pending: readonly PendingNotification[],
	recent: ReadonlySet<string>, // `${userId}:${dedupeKey}`
): PendingNotification[] {
	const out: PendingNotification[] = [];
	for (const n of pending) {
		const recipients = n.recipients.filter(
			(u) => !recent.has(`${u}:${n.dedupeKey}`),
		);
		if (recipients.length > 0) out.push({ ...n, recipients });
	}
	return out;
}
