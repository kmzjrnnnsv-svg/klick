import type { BcmPlanContent } from "@/db/schema/bcm";
import type { AlertChannel } from "@/db/schema/enums";

// Notfall- und Wiederanlaufplan je Prozess (BSI 200-4 Kap. 8, ISO 22301
// 8.4.4, DORA Art. 11 Abs. 6): Vorschlag aus Prozess, BIA und Kette,
// Bereinigung vor dem Speichern, Hinweise. Pure, ohne Datenbank.

export const PLAN_LIMITS = {
	text: 2000,
	short: 300,
	items: 30,
} as const;

export function emptyPlan(): BcmPlanContent {
	return {
		trigger: "",
		activatedBy: "",
		immediate: [],
		alert: [],
		emergencyMode: "",
		recovery: [],
		returnToNormal: "",
		contacts: [],
	};
}

export type PlanSeed = {
	process: { name: string; rtoHours: number | null };
	// verantwortliche Stelle (RACI A) als function:<key> oder Konto-ID
	accountable: string | null;
	// verknüpfte Assets mit erreichbarem Wiederanlauf (Kette, N2)
	assets: { id: string; name: string; rtoHours: number | null }[];
	providers: { name: string }[];
};

// Vorschlag für einen neuen Plan: Alarmierung über Notfallmanagement,
// Krisenstab, verantwortliche Stelle und Geschäftsleitung; Wiederanlauf in
// der Reihenfolge der Assets nach ihrem Wiederanlauf; Dienstleister als
// Kontakte. Texte sind Vorschläge zum Anpassen.
export function seedPlan(s: PlanSeed): BcmPlanContent {
	const rto = s.process.rtoHours;
	const alert: BcmPlanContent["alert"] = [
		{ who: "function:bcm_manager", channel: "phone", withinMinutes: 15 },
		{ who: "function:crisis_team", channel: "phone", withinMinutes: 30 },
	];
	if (s.accountable)
		alert.push({ who: s.accountable, channel: "phone", withinMinutes: 30 });
	alert.push({
		who: "function:management_body",
		channel: "phone",
		withinMinutes: 60,
	});
	const recovery: BcmPlanContent["recovery"] = [...s.assets]
		.sort(
			(a, b) =>
				(a.rtoHours ?? Number.POSITIVE_INFINITY) -
					(b.rtoHours ?? Number.POSITIVE_INFINITY) ||
				a.name.localeCompare(b.name, "de"),
		)
		.map((a) => ({
			text: `„${a.name}“ wiederherstellen und prüfen`,
			who: "",
			targetHours: a.rtoHours,
			assetId: a.id,
		}));
	// ohne verknüpfte Assets ein allgemeiner Schritt, damit der Plan nicht leer
	// beginnt (Assets verknüpfen macht ihn genauer)
	if (recovery.length === 0)
		recovery.push({
			text: "Benötigte Systeme und Daten wiederherstellen und prüfen",
			who: "",
			targetHours: rto,
			assetId: null,
		});
	return {
		trigger:
			rto !== null
				? `Ausfall oder schwere Störung von „${s.process.name}“, die absehbar länger als ${rto} Stunden dauert.`
				: `Ausfall oder schwere Störung von „${s.process.name}“.`,
		activatedBy: "Notfallmanagement oder Geschäftsleitung nach Lagebild",
		immediate: [
			{ text: "Lage feststellen und Notfall ausrufen" },
			{ text: "Personen schützen, Schaden begrenzen" },
			{ text: "Alarmierungskette starten" },
			{ text: "Betroffene Kund:innen und Dienstleister informieren" },
		],
		alert,
		emergencyMode: "",
		recovery,
		returnToNormal:
			"Daten abgleichen, Normalbetrieb bestätigen, Erkenntnisse festhalten und den Plan anpassen.",
		contacts: s.providers.map((p) => ({
			name: p.name,
			role: "Dienstleister",
			phone: "",
			mail: "",
		})),
	};
}

const clip = (s: string | null | undefined, n: number) =>
	(s ?? "").trim().slice(0, n);

const CHANNELS: readonly AlertChannel[] = [
	"phone",
	"sms",
	"mail",
	"teams",
	"other",
];

// Bereinigen: Text kürzen, leere Zeilen weg, Zahlen begrenzen
export function normalizePlan(c: BcmPlanContent): BcmPlanContent {
	const hours = (v: number | null) =>
		v === null || !Number.isFinite(v)
			? null
			: Math.min(100_000, Math.max(0, Math.round(v)));
	return {
		trigger: clip(c.trigger, PLAN_LIMITS.text),
		activatedBy: clip(c.activatedBy, PLAN_LIMITS.short),
		immediate: c.immediate
			.map((x) => ({ text: clip(x.text, PLAN_LIMITS.short) }))
			.filter((x) => x.text)
			.slice(0, PLAN_LIMITS.items),
		alert: c.alert
			.map((x) => ({
				who: clip(x.who, 120),
				channel: CHANNELS.includes(x.channel) ? x.channel : "other",
				withinMinutes:
					x.withinMinutes === null || !Number.isFinite(x.withinMinutes)
						? null
						: Math.min(10_080, Math.max(0, Math.round(x.withinMinutes))),
			}))
			.filter((x) => x.who)
			.slice(0, PLAN_LIMITS.items),
		emergencyMode: clip(c.emergencyMode, PLAN_LIMITS.text),
		recovery: c.recovery
			.map((x) => ({
				text: clip(x.text, PLAN_LIMITS.short),
				who: clip(x.who, 120),
				targetHours: hours(x.targetHours),
				assetId: x.assetId || null,
			}))
			.filter((x) => x.text)
			.slice(0, PLAN_LIMITS.items),
		returnToNormal: clip(c.returnToNormal, PLAN_LIMITS.text),
		contacts: c.contacts
			.map((x) => ({
				name: clip(x.name, 120),
				role: clip(x.role, 120),
				phone: clip(x.phone, 60),
				mail: clip(x.mail, 200),
			}))
			.filter((x) => x.name)
			.slice(0, PLAN_LIMITS.items),
	};
}

export type PlanIssue =
	| "no_trigger"
	| "no_alert"
	| "no_recovery"
	| "recovery_over_rto"
	| "review_due";

// Hinweise: was für einen brauchbaren Plan fehlt; Wiederanlauf-Schritt über
// dem RTO des Prozesses; Überprüfung fällig
export function planIssues(
	c: BcmPlanContent,
	p: { rtoHours: number | null },
	reviewAt: string | null,
	today: string,
): PlanIssue[] {
	const out: PlanIssue[] = [];
	if (!c.trigger.trim()) out.push("no_trigger");
	if (c.alert.length === 0) out.push("no_alert");
	if (c.recovery.length === 0) out.push("no_recovery");
	const latest = Math.max(...c.recovery.map((r) => r.targetHours ?? 0), 0);
	if (p.rtoHours !== null && latest > p.rtoHours) out.push("recovery_over_rto");
	if (reviewAt && reviewAt < today) out.push("review_due");
	return out;
}

// Freigabe nur ohne Lücken, die den Plan unbrauchbar machen
export function releasable(issues: readonly PlanIssue[]): boolean {
	return !issues.some(
		(i) => i === "no_trigger" || i === "no_alert" || i === "no_recovery",
	);
}

// Überprüfung zwölf Monate nach der Freigabe (ISO-Datum)
export function reviewDate(from: Date): string {
	const d = new Date(from);
	d.setUTCFullYear(d.getUTCFullYear() + 1);
	return d.toISOString().slice(0, 10);
}
