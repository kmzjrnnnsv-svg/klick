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
	severity: string;
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
	const cls = followUpClass(input.severity);
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
