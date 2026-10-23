import {
	type AuditCycle,
	type AuditRegime,
	type FollowUpClass,
	type FollowUpRule,
	regimeFor,
} from "./catalog/audit-regimes";

// Audittermine und Nacharbeitsfristen je Rahmenwerk (pure). Eigene
// Festlegungen der Organisation überschreiben die Werte des Regimes;
// jedes Rahmenwerk behält seine eigenen Termine und Fristen.

export type OrgAuditSetting = {
	cycles?: { kind: AuditCycle["kind"]; everyMonths: number }[];
	classes?: Partial<Record<FollowUpClass, FollowUpRule>>;
	// Zertifikat bzw. letztes Audit dieser Art, ISO-Datum
	anchors?: Partial<Record<AuditCycle["kind"], string>>;
};

export type OrgAuditSettings = Record<string, OrgAuditSetting>;

export function effectiveRegime(
	framework: string,
	settings: OrgAuditSettings = {},
): AuditRegime {
	const base = regimeFor(framework);
	const own = settings[framework];
	if (!own) return base;
	const cycles = base.cycles.map((c) => {
		const o = own.cycles?.find((x) => x.kind === c.kind);
		return o ? { ...c, everyMonths: o.everyMonths } : c;
	});
	for (const o of own.cycles ?? [])
		if (!cycles.some((c) => c.kind === o.kind))
			cycles.push({ kind: o.kind, label: o.kind, everyMonths: o.everyMonths });
	const classes = { ...base.classes };
	for (const k of ["major", "minor", "observation"] as const) {
		const rule = own.classes?.[k];
		if (rule) classes[k] = { ...classes[k], rule };
	}
	return { ...base, cycles, classes };
}

// Schwere eines Findings → Klasse der Nacharbeit
export function followUpClass(severity: string): FollowUpClass {
	if (severity === "critical" || severity === "major") return "major";
	if (severity === "minor") return "minor";
	return "observation";
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (d: Date, days: number) =>
	new Date(d.getTime() + days * 86_400_000);
const plusMonths = (iso: string, months: number) => {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + months);
	return isoDay(d);
};

export type FollowUpDue = {
	framework: string;
	classLabel: string;
	planDue: string | null;
	closeDue: string | null;
};

// Fristen einer Feststellung je beteiligtem Rahmenwerk; `earliest` ist die
// Frist, nach der die eine Abweichung geführt wird (die früheste, damit sie
// alle Rahmenwerke erfüllt) — die Einzelwerte bleiben sichtbar.
export function followUpDue(input: {
	// Schwere eines Findings oder direkt die Klasse (manuelle Abweichung)
	severity?: string;
	cls?: FollowUpClass;
	frameworks: readonly string[];
	settings?: OrgAuditSettings;
	// nächstes Audit je Rahmenwerk (für „bis zum nächsten Audit“)
	nextAudit?: Record<string, string | undefined>;
	now?: Date;
}): {
	cls: FollowUpClass;
	perFramework: FollowUpDue[];
	earliest: { planDue: string | null; closeDue: string | null };
} {
	const now = input.now ?? new Date();
	const cls = input.cls ?? followUpClass(input.severity ?? "");
	const fws = input.frameworks.length > 0 ? input.frameworks : ["_default"];
	const perFramework = fws.map((fw) => {
		const regime = effectiveRegime(fw, input.settings);
		const { label, rule } = regime.classes[cls];
		let close =
			rule.closeDays === null ? null : isoDay(plusDays(now, rule.closeDays));
		const next = input.nextAudit?.[fw];
		if (rule.untilNextAudit && next && (!close || next < close)) close = next;
		return {
			framework: fw,
			classLabel: label,
			planDue:
				rule.planDays === null ? null : isoDay(plusDays(now, rule.planDays)),
			closeDue: close,
		};
	});
	const min = (xs: (string | null)[]) =>
		xs.filter((x): x is string => Boolean(x)).sort()[0] ?? null;
	return {
		cls,
		perFramework,
		earliest: {
			planDue: min(perFramework.map((p) => p.planDue)),
			closeDue: min(perFramework.map((p) => p.closeDue)),
		},
	};
}

export type PlannedAudit = {
	framework: string;
	kind: AuditCycle["kind"];
	label: string;
	date: string;
};

// Kommende Audits je Rahmenwerk ab dem Anker (Zertifikat bzw. letztes
// Audit der Art). Überwachung jährlich ab Zertifikat, Rezertifizierung
// nach 36 Monaten — ohne Anker kein Termin (Hinweis „Termin festlegen“).
export function upcomingAudits(
	framework: string,
	settings: OrgAuditSettings = {},
	today: string,
	horizonMonths = 36,
): { planned: PlannedAudit[]; missingAnchors: AuditCycle["kind"][] } {
	const regime = effectiveRegime(framework, settings);
	const anchors = settings[framework]?.anchors ?? {};
	const cert = anchors.certification ?? anchors.recertification;
	const until = plusMonths(today, horizonMonths);
	const planned: PlannedAudit[] = [];
	const missingAnchors: AuditCycle["kind"][] = [];
	for (const c of regime.cycles) {
		if (c.everyMonths <= 0) continue;
		const anchor =
			c.kind === "surveillance" || c.kind === "recertification"
				? cert
				: anchors[c.kind];
		if (!anchor) {
			missingAnchors.push(c.kind);
			continue;
		}
		for (let i = 1; i <= 24; i += 1) {
			const date = plusMonths(anchor, c.everyMonths * i);
			if (date > until) break;
			// im Rezertifizierungsjahr ersetzt die Rezertifizierung die Überwachung
			if (
				c.kind === "surveillance" &&
				regime.cycles.some(
					(r) =>
						r.kind === "recertification" &&
						r.everyMonths > 0 &&
						(c.everyMonths * i) % r.everyMonths === 0,
				)
			)
				continue;
			if (date >= today)
				planned.push({ framework, kind: c.kind, label: c.label, date });
		}
	}
	planned.sort((a, b) => a.date.localeCompare(b.date));
	return { planned, missingAnchors };
}

// Geplantes oder durchgeführtes Audit aus dem Register (`audits`)
export type RegisteredAudit = {
	frameworkIds: readonly string[];
	date: string | null;
	type: string;
	status: string;
};

const EXTERNAL_KINDS: ReadonlySet<AuditCycle["kind"]> = new Set([
	"certification",
	"surveillance",
	"recertification",
	"regulator",
	"attestation",
]);

const daysBetween = (a: string, b: string) =>
	Math.abs(
		(new Date(`${a}T00:00:00Z`).getTime() -
			new Date(`${b}T00:00:00Z`).getTime()) /
			86_400_000,
	);

// Turnus-Termine aller Rahmenwerke, ohne die, für die schon ein Audit im
// Register geplant ist (gleiches Rahmenwerk, höchstens 60 Tage daneben)
export function cycleDates(
	frameworks: readonly string[],
	settings: OrgAuditSettings,
	today: string,
	registered: readonly RegisteredAudit[] = [],
	horizonMonths = 36,
): {
	planned: PlannedAudit[];
	missing: { framework: string; kind: AuditCycle["kind"] }[];
} {
	const planned: PlannedAudit[] = [];
	const missing: { framework: string; kind: AuditCycle["kind"] }[] = [];
	for (const fw of frameworks) {
		const r = upcomingAudits(fw, settings, today, horizonMonths);
		for (const kind of r.missingAnchors) missing.push({ framework: fw, kind });
		for (const p of r.planned) {
			const covered = registered.some(
				(a) =>
					a.date &&
					a.frameworkIds.includes(fw) &&
					(a.type === "internal") === (p.kind === "internal") &&
					daysBetween(a.date, p.date) <= 60,
			);
			if (!covered) planned.push(p);
		}
	}
	planned.sort((a, b) => a.date.localeCompare(b.date));
	return { planned, missing };
}

// Nächstes externes Audit je Rahmenwerk („bis zum nächsten Audit“): aus dem
// Register (extern, Zertifizierung, Aufsicht) oder dem Turnus; ohne externes
// das nächste interne
export function nextAuditFor(
	frameworks: readonly string[],
	settings: OrgAuditSettings,
	today: string,
	registered: readonly RegisteredAudit[] = [],
): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	for (const fw of frameworks) {
		const open = registered.filter(
			(a) =>
				a.date &&
				a.date >= today &&
				a.frameworkIds.includes(fw) &&
				(a.status === "planned" || a.status === "in_progress"),
		);
		const cycles = upcomingAudits(fw, settings, today).planned;
		const pick = (external: boolean) =>
			[
				...open
					.filter((a) => (a.type !== "internal") === external)
					.map((a) => a.date as string),
				...cycles
					.filter((c) => EXTERNAL_KINDS.has(c.kind) === external)
					.map((c) => c.date),
			].sort()[0];
		out[fw] = pick(true) ?? pick(false);
	}
	return out;
}

// Rahmenwerke einer Feststellung: die des Audits plus das der Anforderung
export function findingFrameworks(
	auditFrameworks: readonly string[],
	requirementFramework: string | null,
): string[] {
	return [
		...new Set([
			...auditFrameworks,
			...(requirementFramework ? [requirementFramework] : []),
		]),
	];
}

// Nacharbeit einer neuen Abweichung: Fristen je Rahmenwerk mit dem nächsten
// Audit aus Register und Turnus; `dueAt` ist die früheste Umsetzungsfrist
export function followUpForNonconformity(input: {
	severity?: string;
	cls?: FollowUpClass;
	frameworks: readonly string[];
	settings: OrgAuditSettings;
	registered?: readonly RegisteredAudit[];
	now?: Date;
}): {
	followUp: {
		cls: FollowUpClass;
		planDue: string | null;
		perFramework: FollowUpDue[];
	};
	dueAt: string | null;
} {
	const now = input.now ?? new Date();
	const d = followUpDue({
		severity: input.severity,
		cls: input.cls,
		frameworks: input.frameworks,
		settings: input.settings,
		nextAudit: nextAuditFor(
			input.frameworks,
			input.settings,
			isoDay(now),
			input.registered,
		),
		now,
	});
	return {
		followUp: {
			cls: d.cls,
			planDue: d.earliest.planDue,
			perFramework: d.perFramework,
		},
		dueAt: d.earliest.closeDue,
	};
}
