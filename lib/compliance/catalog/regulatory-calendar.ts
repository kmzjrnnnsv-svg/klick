// Kommende Rechtsänderungen (Businessplan 19.2, Anforderungskatalog 7.2).
// Der compliance-tick benachrichtigt sechs Monate vorher; /kalender zeigt
// die Liste. Daten teils Entwurfsstand — vor Verlass gegen Primärquelle prüfen.

export type RegulatoryChange = {
	date: string; // ISO-Datum
	title: string;
	frameworks: readonly string[];
	legalBasis: string;
	description: string;
	status: "in_force_date" | "expected" | "draft";
};

export const REGULATORY_CALENDAR: readonly RegulatoryChange[] = [
	{
		date: "2026-12-31",
		title: "BAIT formell aufgehoben",
		frameworks: ["zag-marisk", "dora"],
		legalBasis: "BaFin-Aufsichtsmitteilung zu DORA",
		description:
			"Für DORA-Institute seit 17.01.2025 nicht mehr anwendbar; die formelle Aufhebung schließt die Übergangsphase. Mapping-Hinweise auf Richtlinien prüfen.",
		status: "in_force_date",
	},
	{
		date: "2027-01-11",
		title: "CRD VI: Drittlands-Zweigstellen und Art. 21c",
		frameworks: ["kwg"],
		legalBasis: "RL (EU) 2024/1619 Art. 21c",
		description:
			"Anwendungsbeginn der Vorgaben zu Drittlandsinstituten — relevant für Korridor-Partner außerhalb der EU.",
		status: "in_force_date",
	},
	{
		date: "2027-04-09",
		title:
			"Instant-Payments-VO: Verification of Payee für alle Zahlungsdienstleister",
		frameworks: ["zag"],
		legalBasis: "VO (EU) 2024/886",
		description:
			"Empfängerüberprüfung (VoP) verpflichtend für Zahlungsinstitute und E-Geld-Institute; Prozesse Zahlungsannahme/Auszahlung anpassen.",
		status: "in_force_date",
	},
	{
		date: "2027-07-10",
		title: "AMLR gilt — GwG-Teile werden abgelöst",
		frameworks: ["gwg", "amlr", "tfr"],
		legalBasis: "VO (EU) 2024/1624 Art. 90",
		description:
			"Einheitliche Sorgfaltspflichten, Schwelle 1 000 € für Krypto-Transfers (Art. 19), Self-hosted-Adressen (Art. 40). Rahmenwerk „AMLR“ aktivieren, GwG-Anforderungen mit effectiveUntil laufen aus.",
		status: "in_force_date",
	},
	{
		date: "2027-07-31",
		title: "DAC8: erste Meldung für das Kalenderjahr 2026",
		frameworks: ["dac8"],
		legalBasis: "KStTG § 17 · RL (EU) 2023/2226",
		description:
			"Erstmalige Meldung der Kryptowerte-Transaktionen an das BZSt; Datenerhebung läuft seit 01.01.2026.",
		status: "in_force_date",
	},
	{
		date: "2027-10-25",
		title: "UK: FCA-Regime für Kryptowerte vollständig anwendbar",
		frameworks: ["micar"],
		legalBasis: "FSMA 2023 (Cryptoassets) Order",
		description:
			"Für den UK-Korridor: Zulassung oder Partner mit FCA-Erlaubnis erforderlich.",
		status: "expected",
	},
	{
		date: "2028-01-01",
		title: "Registrierkassenpflicht (Entwurf)",
		frameworks: ["kassen"],
		legalBasis: "KassenSichV-E / § 146a AO",
		description:
			"Geplante allgemeine Registrierkassenpflicht — relevant für die Händlerkasse. Entwurfsstand, Termin kann sich verschieben.",
		status: "draft",
	},
	{
		date: "2028-06-30",
		title: "PSD3 / PSR: Anwendungsbeginn (voraussichtlich)",
		frameworks: ["zag"],
		legalBasis: "PSD3 (RL-Entwurf) · PSR (VO-Entwurf)",
		description:
			"Zusammenführung von Zahlungs- und E-Geld-Regime, neue Betrugsregeln und Datenzugang. Termin abhängig vom Trilog — regelmäßig prüfen.",
		status: "expected",
	},
];

export function upcomingLegalChanges(
	now: Date,
	horizonDays = 180,
	frameworks?: readonly string[],
): RegulatoryChange[] {
	const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
	const set = frameworks ? new Set(frameworks) : null;
	return REGULATORY_CALENDAR.filter((c) => {
		const d = new Date(`${c.date}T00:00:00Z`);
		if (d < now || d > horizon) return false;
		return !set || c.frameworks.some((f) => set.has(f));
	}).sort((a, b) => a.date.localeCompare(b.date));
}
