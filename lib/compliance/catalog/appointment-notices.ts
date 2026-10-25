import type { LicenceStage, RoleFunction } from "@/db/schema/enums";

// Anzeigen an Behörden nach einer Bestellung oder Abberufung — pure, mit
// Test (tests/appointment-notices.test.ts). Klick legt daraus Aufgaben mit
// Frist an (lib/compliance/appointment-service.ts). Behörden, Fristen und
// Grundlagen nach Modellwissen: vor der ersten Anzeige prüfen.

export type AppointmentNotice = {
	key: string;
	functions: readonly RoleFunction[];
	// gilt, wenn eines dieser Rahmenwerke aktiv ist
	frameworks: readonly string[];
	// ab Lizenzstufe (Ziffer von licenceStage)
	fromStage?: number;
	authority: string;
	legalBasis: string;
	// before: bis zur Wirksamkeit (Frist = „Wirksam ab“); after: nach der
	// Bestellung binnen `days` Tagen
	timing: "before" | "after";
	days: number;
	title: { appoint: string; revoke: string };
	hint: string;
};

export const APPOINTMENT_NOTICES: readonly AppointmentNotice[] = [
	{
		key: "gwg-aml-officer",
		functions: ["aml_officer"],
		frameworks: ["gwg", "amlr"],
		fromStage: 1,
		authority: "BaFin",
		legalBasis: "§ 7 Abs. 4 GwG",
		timing: "before",
		days: 0,
		title: {
			appoint: "Bestellung der Geldwäschebeauftragten der BaFin anzeigen",
			revoke: "Entpflichtung der Geldwäschebeauftragten der BaFin anzeigen",
		},
		hint: "Die Anzeige geht vorab an die BaFin, also vor dem Datum „Wirksam ab“. Das gilt auch für die Stellvertretung.",
	},
	{
		key: "dsgvo-dpo",
		functions: ["dpo"],
		frameworks: ["dsgvo"],
		authority: "Datenschutz-Aufsichtsbehörde",
		legalBasis: "Art. 37 Abs. 7 DSGVO",
		timing: "after",
		days: 14,
		title: {
			appoint: "Kontaktdaten der Datenschutzbeauftragten mitteilen",
			revoke: "Neue Kontaktdaten der Datenschutzbeauftragten mitteilen",
		},
		hint: "Mitteilung an die zuständige Aufsichtsbehörde; die Kontaktdaten stehen auch in der Datenschutzerklärung.",
	},
	{
		key: "management-change",
		functions: ["management_body"],
		frameworks: ["zag", "zag-marisk", "kwg", "micar"],
		fromStage: 2,
		authority: "BaFin und Deutsche Bundesbank",
		legalBasis: "§ 28 Abs. 1 ZAG · § 24 Abs. 1 KWG · Art. 69 MiCAR",
		timing: "before",
		days: 0,
		title: {
			appoint: "Bestellung in die Geschäftsleitung anzeigen",
			revoke: "Ausscheiden aus der Geschäftsleitung anzeigen",
		},
		hint: "Die Absicht wird vorab angezeigt, der Vollzug unverzüglich; neue Mitglieder nehmen ihre Tätigkeit erst danach auf.",
	},
	{
		key: "nis2-contact",
		functions: ["nis2_responsible"],
		frameworks: ["nis2"],
		authority: "BSI",
		legalBasis: "§ 33 BSIG",
		timing: "after",
		days: 14,
		title: {
			appoint: "Kontaktstelle beim BSI aktualisieren",
			revoke: "Kontaktstelle beim BSI aktualisieren",
		},
		hint: "Die Registrierungsdaten beim BSI nennen eine erreichbare Kontaktstelle.",
	},
];

const stageOf = (s: LicenceStage | string) =>
	Number.parseInt(String(s).charAt(0), 10) || 0;

function plusDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export type DueNotice = {
	key: string;
	title: string;
	description: string;
	dueAt: string;
};

// Welche Anzeigen fällig werden: Funktion × aktive Rahmenwerke × Stufe.
// before: Frist = „Wirksam ab“, nie vor heute; after: heute + Tage.
export function noticesFor(input: {
	fn: RoleFunction;
	event: "appoint" | "revoke";
	frameworks: readonly string[];
	stage: LicenceStage | string;
	effectiveFrom: string | null;
	today: string;
}): DueNotice[] {
	const active = new Set(input.frameworks);
	return APPOINTMENT_NOTICES.filter(
		(n) =>
			n.functions.includes(input.fn) &&
			n.frameworks.some((f) => active.has(f)) &&
			stageOf(input.stage) >= (n.fromStage ?? 0),
	).map((n) => {
		const effective =
			input.effectiveFrom && input.effectiveFrom > input.today
				? input.effectiveFrom
				: input.today;
		return {
			key: n.key,
			title: n.title[input.event],
			description: `${n.authority} · ${n.legalBasis}. ${n.hint}`,
			dueAt: n.timing === "before" ? effective : plusDays(input.today, n.days),
		};
	});
}
