// Zusammenfassung aus Klick für die Managementbewertung (B6): je Pflicht-Input
// (catalog/management-review-inputs.ts) ein Abschnitt mit Kennzahlen und den
// wichtigsten Einträgen des Zeitraums. Pure, getestet
// (tests/management-review-digest.test.ts); Daten lädt loadReviewDigest
// (queries-review-digest.ts). Beim Abhalten wird das Ergebnis als
// Schnappschuss in management_reviews.digest gespeichert.

import type { ReviewInput } from "@/lib/compliance/catalog/management-review-inputs";
import type { IndicatorState } from "@/lib/compliance/indicators";

export type DigestTone = "ok" | "warn" | "alert" | "info";
export type DigestFact = { label: string; value: string; tone: DigestTone };
export type DigestItem = { title: string; href?: string; note?: string };
export type DigestSection = {
	key: string;
	title: string;
	href?: string;
	facts: DigestFact[];
	items: DigestItem[];
};
export type ReviewDigest = {
	from: string;
	to: string;
	generatedAt: string;
	sections: DigestSection[];
};

export type DigestData = {
	previous: {
		resolutions: {
			number: string;
			subject: string;
			date: string;
		}[];
		tasksOpen: number;
		tasksDone: number;
		tasksOverdue: number;
		decisionsOpen: { code: string; question: string; dueAt: string | null }[];
		decisionsDecided: number;
	};
	context: {
		changedIssues: { title: string; scope: string }[];
		regulatory: { date: string; title: string; legalBasis: string }[];
	};
	nonconformities: {
		open: number;
		overdue: number;
		closedInPeriod: number;
		newInPeriod: number;
		ineffective: number;
		items: { id: string; code: string; title: string; dueAt: string | null }[];
	};
	objectives: {
		title: string;
		indicatorType: "kpi" | "kri" | "kci" | null;
		state: IndicatorState;
		latest: number | null;
		unit: string | null;
	}[];
	objectivesProposed: number;
	audits: {
		performed: { id: string; title: string; performedAt: string }[];
		findingsNew: number;
		findingsOpen: {
			critical: number;
			major: number;
			minor: number;
			observation: number;
		};
	};
	feedback: {
		complaints: number;
		complaintsOpen: number;
		dsr: number;
		dsrOverdue: number;
		regulatorContacts: number;
	};
	risks: {
		total: number;
		zones: { acceptable: number; tolerable: number; unacceptable: number };
		aboveAppetite: { id: string; code: string; title: string }[];
		acceptedInPeriod: number;
		treatmentsOpen: number;
		treatmentsOverdue: number;
		treatmentsDone: number;
		proposals: number;
	};
	incidents: {
		total: number;
		major: number;
		reported: number;
		items: {
			id: string;
			code: string;
			title: string;
			classification: string | null;
		}[];
	};
	security: { openCritical: number; openHigh: number; overdue: number };
	providers: {
		total: number;
		critical: number;
		red: number;
		yellow: number;
		overdueAssessments: number;
		items: { id: string; name: string; note: string }[];
	};
	trainings: { assigned: number; done: number; overdue: number };
	obligations: { done: number; overdue: number };
	readiness: { framework: string; score: number | null }[];
};

const n = (v: number) => String(v);
const pct = (a: number, b: number) =>
	b === 0 ? "—" : `${Math.round((a / b) * 100)} %`;
const tone = (bad: number, alertFrom = 1, warnFrom = 1): DigestTone =>
	bad >= alertFrom ? "alert" : bad >= warnFrom ? "warn" : "ok";
const de = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
// Markdown: Pipes und Zeilenumbrüche aus Freitext entschärfen
const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

const STATE_LABEL: Record<IndicatorState, string> = {
	ok: "im Ziel",
	warn: "Frühwarnung",
	alert: "Alarm",
	overdue_measurement: "Messung überfällig",
	no_data: "keine Messung",
};

function sectionFor(
	key: string,
	d: DigestData,
	frameworkName: (slug: string) => string,
): Pick<DigestSection, "facts" | "items"> | null {
	switch (key) {
		case "previous_actions":
			return {
				facts: [
					{
						label: "Beschlüsse im Zeitraum",
						value: n(d.previous.resolutions.length),
						tone: "info",
					},
					{
						label: "Maßnahmen offen / erledigt",
						value: `${d.previous.tasksOpen} / ${d.previous.tasksDone}`,
						tone: d.previous.tasksOpen > 0 ? "warn" : "ok",
					},
					{
						label: "Maßnahmen überfällig",
						value: n(d.previous.tasksOverdue),
						tone: tone(d.previous.tasksOverdue),
					},
					{
						label: "Offene Managementanfragen",
						value: n(d.previous.decisionsOpen.length),
						tone: d.previous.decisionsOpen.length > 0 ? "warn" : "ok",
					},
				],
				items: [
					...d.previous.decisionsOpen.map((q) => ({
						title: `${q.code} ${q.question}`,
						href: "/beschluesse?tab=anfragen",
						note: q.dueAt ? `Frist ${de(q.dueAt)}` : "offen",
					})),
					...d.previous.resolutions.map((r) => ({
						title: `${r.number} ${r.subject}`,
						href: "/beschluesse",
						note: de(r.date),
					})),
				],
			};
		case "context_changes":
		case "party_expectations":
			return {
				facts: [
					{
						label: "Kontext-Themen geändert",
						value: n(d.context.changedIssues.length),
						tone: "info",
					},
					{
						label: "Rechtsänderungen in den nächsten 180 Tagen",
						value: n(d.context.regulatory.length),
						tone: d.context.regulatory.length > 0 ? "warn" : "ok",
					},
				],
				items:
					key === "context_changes"
						? d.context.changedIssues.map((i) => ({
								title: i.title,
								href: "/organisation?tab=kontext",
								note: i.scope === "internal" ? "intern" : "extern",
							}))
						: d.context.regulatory.map((r) => ({
								title: r.title,
								href: "/kalender?tab=rechtsaenderungen",
								note: `${de(r.date)} · ${r.legalBasis}`,
							})),
			};
		case "nonconformities": {
			const nc = d.nonconformities;
			return {
				facts: [
					{
						label: "Offen",
						value: n(nc.open),
						tone: nc.open > 0 ? "warn" : "ok",
					},
					{ label: "Überfällig", value: n(nc.overdue), tone: tone(nc.overdue) },
					{ label: "Neu im Zeitraum", value: n(nc.newInPeriod), tone: "info" },
					{
						label: "Abgeschlossen im Zeitraum",
						value: n(nc.closedInPeriod),
						tone: "info",
					},
					{
						label: "Korrektur nicht wirksam",
						value: n(nc.ineffective),
						tone: tone(nc.ineffective),
					},
				],
				items: nc.items.map((x) => ({
					title: `${x.code} ${x.title}`,
					href: `/abweichungen/${x.id}`,
					note: x.dueAt ? `fällig ${de(x.dueAt)}` : undefined,
				})),
			};
		}
		case "monitoring_results":
			return {
				facts: [
					...d.readiness.map((r) => ({
						label: `Prüfungsreife ${frameworkName(r.framework)}`,
						value: r.score === null ? "—" : `${r.score} %`,
						tone:
							r.score === null
								? ("info" as const)
								: r.score >= 80
									? ("ok" as const)
									: r.score >= 50
										? ("warn" as const)
										: ("alert" as const),
					})),
					{
						label: "Pflichten-Läufe erledigt / überfällig",
						value: `${d.obligations.done} / ${d.obligations.overdue}`,
						tone: tone(d.obligations.overdue),
					},
					{
						label: "Schulungsquote",
						value: pct(d.trainings.done, d.trainings.assigned),
						tone: tone(d.trainings.overdue, 5),
					},
					{
						label: "Sicherheitsbefunde kritisch / hoch offen",
						value: `${d.security.openCritical} / ${d.security.openHigh}`,
						tone:
							d.security.openCritical > 0
								? "alert"
								: tone(d.security.openHigh, 99, 1),
					},
				],
				items: [],
			};
		case "audit_results": {
			const f = d.audits.findingsOpen;
			return {
				facts: [
					{
						label: "Audits durchgeführt",
						value: n(d.audits.performed.length),
						tone: "info",
					},
					{
						label: "Neue Findings",
						value: n(d.audits.findingsNew),
						tone: "info",
					},
					{
						label: "Offene Findings kritisch / schwer / leicht",
						value: `${f.critical} / ${f.major} / ${f.minor}`,
						tone: f.critical + f.major > 0 ? "alert" : tone(f.minor, 99, 1),
					},
				],
				items: d.audits.performed.map((a) => ({
					title: a.title,
					href: `/audits/${a.id}`,
					note: de(a.performedAt),
				})),
			};
		}
		case "objectives": {
			const alerts = d.objectives.filter((o) => o.state === "alert").length;
			const warns = d.objectives.filter(
				(o) => o.state === "warn" || o.state === "overdue_measurement",
			).length;
			return {
				facts: [
					{
						label: "Freigegebene Ziele",
						value: n(d.objectives.length),
						tone: d.objectives.length > 0 ? "ok" : "warn",
					},
					{
						label: "im Ziel",
						value: n(d.objectives.filter((o) => o.state === "ok").length),
						tone: "ok",
					},
					{
						label: "Frühwarnung / überfällig",
						value: n(warns),
						tone: tone(warns, 99, 1),
					},
					{ label: "Alarm", value: n(alerts), tone: tone(alerts) },
					{
						label: "Vorschläge zur Freigabe",
						value: n(d.objectivesProposed),
						tone: d.objectivesProposed > 0 ? "warn" : "ok",
					},
				],
				items: d.objectives.map((o) => ({
					title: `${o.indicatorType ? `${o.indicatorType.toUpperCase()} · ` : ""}${o.title}`,
					href: "/organisation?tab=ziele",
					note: `${STATE_LABEL[o.state]}${o.latest !== null ? ` · ${o.latest}${o.unit ? ` ${o.unit}` : ""}` : ""}`,
				})),
			};
		}
		case "party_feedback":
			return {
				facts: [
					{
						label: "Beschwerden (offen)",
						value: `${d.feedback.complaints} (${d.feedback.complaintsOpen})`,
						tone: d.feedback.complaintsOpen > 0 ? "warn" : "ok",
					},
					{
						label: "Betroffenenanfragen (überfällig)",
						value: `${d.feedback.dsr} (${d.feedback.dsrOverdue})`,
						tone: tone(d.feedback.dsrOverdue),
					},
					{
						label: "Aufsichtskontakte",
						value: n(d.feedback.regulatorContacts),
						tone: "info",
					},
				],
				items: [],
			};
		case "risk_assessment": {
			const r = d.risks;
			return {
				facts: [
					{ label: "Risiken gesamt", value: n(r.total), tone: "info" },
					{
						label: "akzeptabel / tolerierbar / nicht tolerierbar",
						value: `${r.zones.acceptable} / ${r.zones.tolerable} / ${r.zones.unacceptable}`,
						tone: r.zones.unacceptable > 0 ? "alert" : "ok",
					},
					{
						label: "Akzeptiert im Zeitraum",
						value: n(r.acceptedInPeriod),
						tone: "info",
					},
					{
						label: "Maßnahmen offen / überfällig / erledigt",
						value: `${r.treatmentsOpen} / ${r.treatmentsOverdue} / ${r.treatmentsDone}`,
						tone: tone(r.treatmentsOverdue),
					},
					{
						label: "Offene Risikovorschläge",
						value: n(r.proposals),
						tone: r.proposals > 0 ? "warn" : "ok",
					},
				],
				items: r.aboveAppetite.map((x) => ({
					title: `${x.code} ${x.title}`,
					href: `/risiken/${x.id}`,
					note: "über dem Risikoappetit",
				})),
			};
		}
		case "improvement":
		case "ict_framework":
			return {
				facts: [
					{
						label: "Vorfälle im Zeitraum",
						value: n(d.incidents.total),
						tone: "info",
					},
					{
						label: "davon schwerwiegend",
						value: n(d.incidents.major),
						tone: tone(d.incidents.major),
					},
					{
						label: "gemeldet an Behörden",
						value: n(d.incidents.reported),
						tone: "info",
					},
					...(key === "ict_framework"
						? [
								{
									label: "Sicherheitsbefunde über SLA",
									value: n(d.security.overdue),
									tone: tone(d.security.overdue),
								},
							]
						: []),
				],
				items: d.incidents.items.map((i) => ({
					title: `${i.code} ${i.title}`,
					href: `/vorfaelle/${i.id}`,
					note: i.classification ?? undefined,
				})),
			};
		case "third_parties": {
			const p = d.providers;
			return {
				facts: [
					{ label: "Dienstleister", value: n(p.total), tone: "info" },
					{
						label: "kritisch / wesentlich",
						value: n(p.critical),
						tone: "info",
					},
					{
						label: "Bewertung rot / gelb",
						value: `${p.red} / ${p.yellow}`,
						tone: p.red > 0 ? "alert" : tone(p.yellow, 99, 1),
					},
					{
						label: "Wiedervorlage überfällig",
						value: n(p.overdueAssessments),
						tone: tone(p.overdueAssessments),
					},
				],
				items: p.items.map((x) => ({
					title: x.name,
					href: `/dienstleister/${x.id}`,
					note: x.note,
				})),
			};
		}
		case "compliance_report":
			return {
				facts: [
					{
						label: "Rechtsänderungen in den nächsten 180 Tagen",
						value: n(d.context.regulatory.length),
						tone: d.context.regulatory.length > 0 ? "warn" : "ok",
					},
					{
						label: "Pflichten-Läufe überfällig",
						value: n(d.obligations.overdue),
						tone: tone(d.obligations.overdue),
					},
				],
				items: d.context.regulatory.map((r) => ({
					title: r.title,
					href: "/kalender?tab=rechtsaenderungen",
					note: `${de(r.date)} · ${r.legalBasis}`,
				})),
			};
		default:
			return null;
	}
}

export function reviewDigest(
	data: DigestData,
	opts: {
		from: string;
		to: string;
		inputs: readonly ReviewInput[];
		now: Date;
		frameworkName?: (slug: string) => string;
		// höchstens so viele Einträge je Abschnitt
		maxItems?: number;
	},
): ReviewDigest {
	const max = opts.maxItems ?? 8;
	const sections: DigestSection[] = [];
	for (const input of opts.inputs) {
		const s = sectionFor(input.key, data, opts.frameworkName ?? ((x) => x));
		if (!s) continue;
		sections.push({
			key: input.key,
			title: input.title,
			href: input.href,
			facts: s.facts,
			items: s.items.slice(0, max),
		});
	}
	return {
		from: opts.from,
		to: opts.to,
		generatedAt: opts.now.toISOString(),
		sections,
	};
}

// Zeitraum: seit der letzten abgeschlossenen Bewertung, sonst zwölf Monate
export function digestPeriod(
	lastDoneHeldAt: string | null,
	today: string,
): { from: string; to: string } {
	if (lastDoneHeldAt && lastDoneHeldAt < today)
		return { from: lastDoneHeldAt, to: today };
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCFullYear(d.getUTCFullYear() - 1);
	return { from: d.toISOString().slice(0, 10), to: today };
}

// Ist ein gespeicherter Schnappschuss ein Digest? (json-Spalte, alte Zeilen)
export function asDigest(v: unknown): ReviewDigest | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Partial<ReviewDigest>;
	return typeof o.from === "string" &&
		typeof o.to === "string" &&
		Array.isArray(o.sections)
		? (o as ReviewDigest)
		: null;
}

export function digestMarkdown(
	d: ReviewDigest,
	head: { orgName: string; heldAt?: string | null },
): string {
	const lines: string[] = [];
	lines.push(`# Managementbewertung – Zusammenfassung aus Klick`, "");
	lines.push(`**Organisation:** ${cell(head.orgName)}  `);
	if (head.heldAt) lines.push(`**Bewertung am:** ${de(head.heldAt)}  `);
	lines.push(`**Zeitraum:** ${de(d.from)} – ${de(d.to)}  `);
	lines.push(`**Erstellt:** ${de(d.generatedAt)}`, "");
	const mark: Record<DigestTone, string> = {
		ok: "",
		info: "",
		warn: " ⚠",
		alert: " ✖",
	};
	for (const s of d.sections) {
		lines.push(`## ${s.title}`, "");
		if (s.facts.length > 0) {
			lines.push("| Kennzahl | Wert |", "|---|---|");
			for (const f of s.facts)
				lines.push(`| ${cell(f.label)} | ${cell(f.value)}${mark[f.tone]} |`);
			lines.push("");
		}
		for (const i of s.items)
			lines.push(`- ${cell(i.title)}${i.note ? ` — ${cell(i.note)}` : ""}`);
		if (s.items.length > 0) lines.push("");
	}
	return `${lines.join("\n").trimEnd()}\n`;
}
