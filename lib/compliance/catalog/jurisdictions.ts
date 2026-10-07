// Länder & Korridore — Seed für `jurisdictions` (Businessplan 16.1/16.2/16.7/
// 18.5/23.7; Anforderungskatalog Abschnitt 6/8). Rechtsstand Oktober 2026:
// EU-Hochrisikoliste (DelVO (EU) 2016/1675 i. d. F. 2025), FATF-Listen
// (Juni 2025: VAE seit 2024 gestrichen; EU-Streichung 05.08.2025), EU-
// Sanktionen (Russland Art. 5b VO 833/2014, Belarus). Listen ändern sich
// laufend — Änderung der EU-Liste erzeugt eine Aufgabe an die GWB.
// Kein Rechtsrat; gegen Primärquellen prüfen.

export type FatfStatus = "none" | "grey" | "black";
export type OrgStance = "allowed" | "enhanced_dd" | "blocked";
export type CorridorStatus =
	| "none"
	| "evaluating"
	| "pilot"
	| "active"
	| "suspended";

export type CatalogJurisdiction = {
	iso2: string;
	name: string;
	euHighRisk: boolean;
	fatfStatus: FatfStatus;
	euSanctions: boolean;
	usSanctions: boolean;
	orgStance: OrgStance;
	corridorStatus: CorridorStatus;
	legalNotes?: string;
	corridorNotes?: string;
};

export const JURISDICTIONS: readonly CatalogJurisdiction[] = [
	// ── Heimat / EU ─────────────────────────────────────────────────────────
	{
		iso2: "DE",
		name: "Deutschland",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "allowed",
		corridorStatus: "active",
		legalNotes: "Heimatmarkt; BaFin/Bundesbank; GwG, ZAG, KMAG.",
	},
	{
		iso2: "AT",
		name: "Österreich",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "allowed",
		corridorStatus: "none",
		legalNotes: "EU-Passporting (MiCAR Art. 65, ZAG §§ 38–39).",
	},
	{
		iso2: "FR",
		name: "Frankreich",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "allowed",
		corridorStatus: "none",
		legalNotes:
			"Sitz des EURC/USDC-Emittenten (Circle, E-Geld-Institut, ACPR).",
	},
	{
		iso2: "NL",
		name: "Niederlande",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "allowed",
		corridorStatus: "none",
	},
	// ── Korridore (Businessplan 16.4 / 23) ─────────────────────────────────
	{
		iso2: "GB",
		name: "Vereinigtes Königreich",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "allowed",
		corridorStatus: "evaluating",
		legalNotes:
			"FCA-Kryptoregime (Zulassungspflicht ab 25.10.2027); UK Travel Rule seit 09/2023.",
		corridorNotes:
			"Partner-VASP mit FCA-Registrierung; Reverse Solicitation prüfen.",
	},
	{
		iso2: "AE",
		name: "Vereinigte Arabische Emirate",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "pilot",
		legalNotes:
			"Von der EU-Hochrisikoliste gestrichen (DelVO 2025, Anwendung 05.08.2025); FATF-Grey-List 2024 verlassen. Weiterhin verstärkte Sorgfalt nach eigener Länderpolitik (Bargeld-/Goldhandel, Secondary-Sanctions-Risiko).",
		corridorNotes:
			"Partner: CBUAE-Lizenz (Zahlungen) oder VARA/ADGM/DIFC (Krypto); Dirham-Token (EMT) nur mit zugelassenem Emittenten.",
	},
	{
		iso2: "BH",
		name: "Bahrain",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "evaluating",
		legalNotes: "CBB Crypto-Asset Module; Travel Rule umgesetzt.",
	},
	{
		iso2: "CH",
		name: "Schweiz",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "allowed",
		corridorStatus: "evaluating",
		legalNotes:
			"FINMA/SRO-Aufsicht; Travel Rule ohne Schwelle; kein EU-Passporting.",
	},
	{
		iso2: "BR",
		name: "Brasilien",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "evaluating",
		legalNotes: "BCB-Regime für VASPs (Lei 14.478/2022); Pix als Fiat-Schiene.",
	},
	{
		iso2: "US",
		name: "Vereinigte Staaten",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "none",
		legalNotes:
			"Keine aktive Kundenansprache (keine US-Lizenz); OFAC-Screening wegen USD-Stablecoins und Bankpartnern.",
	},
	// ── FATF Grey List (Beispiele; Liste prüfen) ───────────────────────────
	{
		iso2: "KE",
		name: "Kenia",
		euHighRisk: true,
		fatfStatus: "grey",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "evaluating",
		legalNotes:
			"FATF Grey List seit 02/2024, EU-Hochrisikoliste seit 2025; verstärkte Sorgfalt § 15 GwG. M-Pesa-Korridor nur mit lizenziertem Partner.",
	},
	{
		iso2: "KW",
		name: "Kuwait",
		euHighRisk: true,
		fatfStatus: "grey",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "none",
		legalNotes: "FATF Grey List seit 06/2025; EU-Hochrisikoliste.",
	},
	{
		iso2: "NG",
		name: "Nigeria",
		euHighRisk: true,
		fatfStatus: "grey",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "none",
		legalNotes: "FATF Grey List; Krypto-Nutzung hoch, Regulierung im Umbruch.",
	},
	{
		iso2: "TR",
		name: "Türkei",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: false,
		usSanctions: false,
		orgStance: "enhanced_dd",
		corridorStatus: "none",
		legalNotes:
			"FATF Grey List 06/2024 verlassen; Länderrisiko weiter erhöht (eigene Einstufung).",
	},
	// ── Blockiert: FATF Black List / EU-Embargos ───────────────────────────
	{
		iso2: "IR",
		name: "Iran",
		euHighRisk: true,
		fatfStatus: "black",
		euSanctions: true,
		usSanctions: true,
		orgStance: "blocked",
		corridorStatus: "none",
		legalNotes: "FATF Black List; EU-/US-Sanktionen; keine Geschäftsbeziehung.",
	},
	{
		iso2: "KP",
		name: "Nordkorea",
		euHighRisk: true,
		fatfStatus: "black",
		euSanctions: true,
		usSanctions: true,
		orgStance: "blocked",
		corridorStatus: "none",
		legalNotes:
			"FATF Black List; UN-/EU-Embargo; Lazarus-Adressen in Analytics sperren.",
	},
	{
		iso2: "MM",
		name: "Myanmar",
		euHighRisk: true,
		fatfStatus: "black",
		euSanctions: true,
		usSanctions: true,
		orgStance: "blocked",
		corridorStatus: "none",
		legalNotes: "FATF Black List (Call for Action); EU-Sanktionen.",
	},
	{
		iso2: "RU",
		name: "Russland",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: true,
		usSanctions: true,
		orgStance: "blocked",
		corridorStatus: "none",
		legalNotes:
			"Art. 5b VO (EU) 833/2014: Verbot von Kryptowerte-Dienstleistungen für russische Personen; FATF-Mitgliedschaft suspendiert.",
	},
	{
		iso2: "BY",
		name: "Belarus",
		euHighRisk: false,
		fatfStatus: "none",
		euSanctions: true,
		usSanctions: true,
		orgStance: "blocked",
		corridorStatus: "none",
		legalNotes: "EU-Sanktionen (VO (EG) 765/2006); keine Geschäftsbeziehung.",
	},
	{
		iso2: "SY",
		name: "Syrien",
		euHighRisk: true,
		fatfStatus: "grey",
		euSanctions: true,
		usSanctions: true,
		orgStance: "blocked",
		corridorStatus: "none",
		legalNotes:
			"EU-Hochrisikoliste; Sanktionslage 2025/2026 im Wandel — vor Änderung der Stance prüfen.",
	},
];

export const JURISDICTION_BY_ISO2: ReadonlyMap<string, CatalogJurisdiction> =
	new Map(JURISDICTIONS.map((j) => [j.iso2, j]));
