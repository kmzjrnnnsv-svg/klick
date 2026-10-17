import type {
	SupplierCriterion,
	SupplierMethod,
	SupplierThreshold,
} from "@/db/schema/platform";

// Interne Lieferantenbewertung — Vorlage. Basis sind 14 Kriterien in zwei
// Bereichen (Allgemein 40 %, Sicherheit 60 %), bewertet von 1 (sehr
// kritisch / nicht erfüllt) bis 5 (unkritisch / vollständig erfüllt).
// Zusatzkriterien greifen je Rahmenwerk oder Partnerart (DORA Art. 28–30,
// Auslagerung nach MaRisk AT 9 / § 25b KWG / § 26 ZAG / Art. 73 MiCAR,
// Krypto- und Bankpartner, NIS2-Lieferkette). Die Bereichswerte normieren
// über die Gewichte der bewerteten Kriterien, Zusatzkriterien fügen sich
// also ein. Jede Org kann Gewichte, Anker und Schwellen anpassen.

const c = (
	code: string,
	area: SupplierCriterion["area"],
	title: string,
	weight: number,
	anchors: SupplierCriterion["anchors"],
	extra: Partial<SupplierCriterion> = {},
): SupplierCriterion => ({
	code,
	area,
	title,
	weight,
	anchors,
	enabled: true,
	...extra,
});

export const BASE_CRITERIA: readonly SupplierCriterion[] = [
	// ── Allgemein ──
	c("SC-G-01", "general", "Geschäftsprozessabhängigkeit", 0.25, [
		"essenzielle und kritische Prozesse",
		"wichtige Prozesse zur Aufgabenerfüllung",
		"mehrere oder wichtige Prozesse",
		"geringe Abhängigkeit / einzelne unkritische Prozesse",
		"keine Abhängigkeit",
	]),
	c("SC-G-02", "general", "Verfügbarkeit – Auswirkungen eines Ausfalls", 0.15, [
		"Arbeitsfähigkeit nicht vorhanden",
		"deutliche Einschränkungen / alternative Prozesse nötig",
		"spürbare Auswirkungen",
		"vereinzelt geringe Auswirkungen",
		"keine spürbaren Auswirkungen",
	]),
	c(
		"SC-G-03",
		"general",
		"Informationsverarbeitung – Vertraulichkeit der verarbeiteten Informationen",
		0.15,
		[
			"streng vertrauliche / geheime Informationen",
			"vertrauliche Informationen",
			"eingeschränkt interne Informationen",
			"interne Informationen",
			"keine vertraulichen Informationen",
		],
	),
	c("SC-G-04", "general", "Systemzugriff – Umfang der Berechtigungen", 0.15, [
		"vollumfängliche Berechtigungen / Adminrechte",
		"umfangreiche Berechtigungen auf vielen Systemen",
		"mehrere Berechtigungen / Benutzerzugänge",
		"einzelne Berechtigungen / Benutzerzugänge",
		"kein Zugriff",
	]),
	c("SC-G-05", "general", "Lieferantenabhängigkeit", 0.1, [
		"Monopolstellung / kein Alternativanbieter",
		"wenige Alternativen",
		"mehrere Anbieter",
		"viele Anbieter",
		"jederzeit austauschbar",
	]),
	c(
		"SC-G-06",
		"general",
		"Lieferantenstandort – politische, Sanktions- und Lieferkettenrisiken",
		0.1,
		["Hochrisikoland", "sonstige Staaten", "USA", "EWR", "Deutschland / EU"],
	),
	c(
		"SC-G-07",
		"general",
		"Substituierbarkeit – Dauer eines Lieferantenwechsels",
		0.1,
		[
			"länger als ein Jahr",
			"innerhalb eines Jahres",
			"innerhalb von sechs Monaten",
			"innerhalb eines Monats",
			"innerhalb weniger Tage",
		],
	),
	// ── Sicherheit ──
	c(
		"SC-S-01",
		"security",
		"ISO/IEC-27001-Zertifizierung mit relevantem Scope",
		0.1,
		[
			"kein ausreichender Nachweis",
			"einzelne Maßnahmen nachgewiesen",
			"ISMS nachgewiesen",
			"Zertifizierungsprozess läuft",
			"gültiges Zertifikat mit passendem Scope",
		],
	),
	c("SC-S-02", "security", "SLAs sind vereinbart", 0.2, [
		"keine SLAs",
		"Standard-SLAs des Dienstleisters",
		"eigene Standard-SLAs",
		"individuelle SLAs",
		"individuelle SLAs inklusive Sicherheitskennzahlen",
	]),
	c("SC-S-03", "security", "Zugriffsmanagement / IAM", 0.2, [
		"nicht ausreichend umgesetzt",
		"personalisiert oder protokolliert",
		"personalisiert und protokolliert",
		"personalisiert, zeitlich begrenzt und protokolliert",
		"personalisiert, zeitlich begrenzt, MFA und protokolliert",
	]),
	c(
		"SC-S-04",
		"security",
		"Meldepflichten für Informationssicherheitsvorfälle",
		0.1,
		[
			"keine Regelung",
			"",
			"Standard-Vertragsklausel",
			"",
			"individuelle Regelungen und Fristen",
		],
	),
	c(
		"SC-S-05",
		"security",
		"Regelungen bei Vertragsende – Export, Rückgabe und Löschung",
		0.1,
		[
			"keine Regelung",
			"",
			"Standard-Vertragsklausel",
			"",
			"individuelle Regelungen",
		],
	),
	c(
		"SC-S-06",
		"security",
		"Vertragliche Regelungen zum Verbleib der Daten in EU/EWR",
		0.1,
		["Regelung nicht vorhanden", "", "", "", "Regelung vorhanden"],
	),
	c(
		"SC-S-07",
		"security",
		"Einhaltung von Datenschutzvorgaben / AV-Vertrag / TOMs",
		0.2,
		[
			"nur allgemeine Datenschutzverpflichtung",
			"",
			"AV-Vertrag geschlossen",
			"",
			"Regelungen vollständig vorhanden",
		],
	),
];

const DORA = ["dora"];
const OUTSOURCING = ["kwg", "zag", "zag-marisk", "micar"];
const CRYPTO_PARTNERS = ["bank", "issuer", "exchange", "custodian"];

export const ADDON_CRITERIA: readonly SupplierCriterion[] = [
	// DORA Art. 28–30
	c(
		"SC-D-01",
		"general",
		"Konzentrationsrisiko (DORA Art. 29)",
		0.1,
		[
			"mehrere kritische Funktionen beim selben Anbieter, kein Ausweichen",
			"hohe Konzentration, Ausweichen nur mit großem Aufwand",
			"einzelne kritische Funktion beim Anbieter",
			"geringe Konzentration",
			"keine Konzentration",
		],
		{ frameworks: DORA },
	),
	c(
		"SC-D-02",
		"security",
		"Vertragsklauseln nach DORA Art. 30",
		0.15,
		[
			"Pflichtklauseln fehlen",
			"einzelne Klauseln vereinbart",
			"Mehrzahl der Klauseln vereinbart",
			"alle Klauseln nach Art. 30 Abs. 2 vereinbart",
			"alle Klauseln inklusive Art. 30 Abs. 3 (kritische Funktionen)",
		],
		{ frameworks: DORA },
	),
	c(
		"SC-D-03",
		"general",
		"Exit-Strategie und Ausstiegsplan",
		0.1,
		[
			"kein Ausstiegsplan",
			"Ausstieg grob beschrieben",
			"Ausstiegsplan dokumentiert",
			"Ausstiegsplan dokumentiert, Alternative bewertet",
			"Ausstiegsplan getestet",
		],
		{ frameworks: DORA },
	),
	c(
		"SC-D-04",
		"security",
		"Unterauftragnehmer und Kette",
		0.1,
		[
			"unbekannt",
			"teilweise bekannt",
			"bekannt, ohne Zustimmungsvorbehalt",
			"bekannt, Änderungen anzeigepflichtig",
			"bekannt, Zustimmungsvorbehalt und gleiche Pflichten",
		],
		{ frameworks: [...DORA, "nis2"] },
	),
	// Auslagerung
	c(
		"SC-O-01",
		"security",
		"Weisungs-, Informations- und Prüfrechte (Auslagerung)",
		0.15,
		[
			"keine Rechte vereinbart",
			"",
			"Informationsrechte, Prüfrechte eingeschränkt",
			"",
			"uneingeschränkte Weisungs- und Prüfrechte, auch für die Aufsicht",
		],
		{ frameworks: OUTSOURCING, outsourcingOnly: true },
	),
	c(
		"SC-O-02",
		"security",
		"Weiterverlagerung und Kündigungsrechte (Auslagerung)",
		0.1,
		[
			"nicht geregelt",
			"",
			"Weiterverlagerung anzeigepflichtig, Kündigung ordentlich",
			"",
			"Zustimmungsvorbehalt und außerordentliches Kündigungsrecht",
		],
		{ frameworks: OUTSOURCING, outsourcingOnly: true },
	),
	// Krypto- und Bankpartner
	c(
		"SC-K-01",
		"general",
		"Erlaubnis oder Registrierung des Partners",
		0.15,
		[
			"keine Erlaubnis, nicht reguliert",
			"Erlaubnis beantragt",
			"Registrierung in einem Drittstaat",
			"Erlaubnis in der EU, Pass nicht geprüft",
			"Erlaubnis in der EU (MiCAR/CRR/ZAG), geprüft",
		],
		{ partnerTypes: CRYPTO_PARTNERS },
	),
	c(
		"SC-K-02",
		"security",
		"Geldwäsche-Programm des Partners",
		0.15,
		[
			"kein Nachweis",
			"Richtlinie vorhanden",
			"Richtlinie und Geldwäschebeauftragte:r",
			"geprüft (Fragebogen, Berichte)",
			"geprüft, Travel Rule und Sanktions-Screening nachgewiesen",
		],
		{ partnerTypes: CRYPTO_PARTNERS },
	),
	c(
		"SC-K-03",
		"security",
		"Trennung von Kundenvermögen / Reservenachweis",
		0.15,
		[
			"keine Trennung",
			"vertraglich zugesagt",
			"getrennte Konten/Wallets",
			"getrennt, regelmäßige Bestätigung",
			"getrennt, unabhängig geprüft (Testat, Proof of Reserves)",
		],
		{ partnerTypes: ["custodian", "issuer", "bank"] },
	),
	// NIS2-Lieferkette (Software/IKT)
	c(
		"SC-N-01",
		"security",
		"Sichere Entwicklung und Schwachstellenmanagement",
		0.1,
		[
			"kein Nachweis",
			"Patches nach Bedarf",
			"definierte Patchfristen",
			"sichere Entwicklung und Schwachstellenmeldung",
			"SBOM, koordinierte Offenlegung und feste Fristen",
		],
		{ frameworks: ["nis2", "cra"], partnerTypes: ["ict"] },
	),
];

export const SUPPLIER_THRESHOLDS: readonly SupplierThreshold[] = [
	{
		min: 0,
		level: "Kritisch",
		traffic: "red",
		status: "Kritisch / Eskalation",
		recommendation: "Keine Beauftragung / Alternative suchen",
		months: 6,
	},
	{
		min: 2,
		level: "Eingeschränkt",
		traffic: "red",
		status: "Kritisch / Eskalation",
		recommendation: "Managemententscheidung erforderlich",
		months: 12,
	},
	{
		min: 3,
		level: "Angemessen",
		traffic: "amber",
		status: "Maßnahmenbedarf",
		recommendation: "Freigabe mit Maßnahmen",
		months: 12,
	},
	{
		min: 3.5,
		level: "Hoch",
		traffic: "green",
		status: "Freigabe",
		recommendation: "Freigabe",
		months: 24,
	},
	{
		min: 4.25,
		level: "Sehr hoch",
		traffic: "green",
		status: "Freigabe",
		recommendation: "Freigabe",
		months: 36,
	},
];

export function defaultSupplierMethod(): SupplierMethod {
	return {
		areaWeights: { general: 0.4, security: 0.6 },
		criteria: [...BASE_CRITERIA, ...ADDON_CRITERIA].map((x) => ({
			...x,
			anchors: [...x.anchors] as SupplierCriterion["anchors"],
		})),
		thresholds: SUPPLIER_THRESHOLDS.map((t) => ({ ...t })),
		criticalMaxMonths: 12,
	};
}

// Maßnahmenkatalog: Geltung je Ergebnis (Ampel) und optional nur bei
// bestimmten Umständen.
export type SupplierMeasure = {
	code: string;
	text: string;
	hint: string;
	traffic: readonly ("green" | "amber" | "red")[];
	when?: "personalData" | "outsourcing" | "critical" | "cryptoPartner";
	frameworks?: readonly string[];
};

const ALL = ["green", "amber", "red"] as const;
const AR = ["amber", "red"] as const;
const R = ["red"] as const;

export const SUPPLIER_MEASURES: readonly SupplierMeasure[] = [
	{
		code: "SM-01",
		text: "Vertraulichkeitsvereinbarung abschließen; Ausnahme nur mit Freigabe der Geschäftsleitung",
		hint: "Bei Zugang zu vertraulichen Informationen oder Räumen.",
		traffic: AR,
	},
	{
		code: "SM-02",
		text: "Standardvertrag des Lieferanten um eigene Bedingungen ergänzen (Mitarbeiterverpflichtung, Unterauftragnehmer)",
		hint: "Bei unzureichenden Standardbedingungen.",
		traffic: AR,
	},
	{
		code: "SM-03",
		text: "Zertifizierung nachweisen lassen (ISO/IEC 27001, SOC 2, C5)",
		hint: "Bei hoher Informationssicherheitsrelevanz.",
		traffic: R,
	},
	{
		code: "SM-04",
		text: "Vertrag zur Auftragsverarbeitung mit technischen und organisatorischen Maßnahmen abschließen",
		hint: "Bei Verarbeitung personenbezogener Daten.",
		traffic: ALL,
		when: "personalData",
	},
	{
		code: "SM-05",
		text: "Regelmäßige Penetrationstests und Schwachstellenanalysen vereinbaren",
		hint: "Für technisch exponierte oder besonders kritische Leistungen.",
		traffic: R,
	},
	{
		code: "SM-06",
		text: "Meldung von Sicherheitsvorfällen mit festen Fristen vereinbaren",
		hint: "Bei Informationssicherheits- oder Datenschutzrelevanz.",
		traffic: AR,
	},
	{
		code: "SM-07",
		text: "Jährliche Audits oder SOC-2-Berichte bzw. Lieferantenaudits vereinbaren",
		hint: "Bei hohem Kontrollbedarf.",
		traffic: R,
	},
	{
		code: "SM-08",
		text: "Regelmäßige Sicherheitsschulungen der eingesetzten Mitarbeitenden verlangen",
		hint: "Bei relevantem System-, Daten- oder Raumzugang.",
		traffic: R,
	},
	{
		code: "SM-09",
		text: "Zugänge nach Least Privilege über die interne IT einrichten",
		hint: "Bei technischem Zugriff auf Systeme oder Daten.",
		traffic: ALL,
	},
	{
		code: "SM-10",
		text: "Haftung und Schadensersatz vertraglich regeln",
		hint: "Vertragliche Grundabsicherung.",
		traffic: ALL,
	},
	{
		code: "SM-11",
		text: "Meldepflicht bei wesentlichen Änderungen (Personal, Infrastruktur, Unterauftragnehmer) vereinbaren",
		hint: "Bei wesentlichen Änderungen der Leistungserbringung.",
		traffic: AR,
	},
	{
		code: "SM-12",
		text: "Compliance-Nachweise regelmäßig vorlegen lassen (Zertifikate, Pentest- oder Auditberichte)",
		hint: "Bei kritischen Lieferanten.",
		traffic: R,
	},
	{
		code: "SM-13",
		text: "Exit-Strategie festlegen und alternativen Dienstleister bewerten",
		hint: "Bei hoher Abhängigkeit oder geringer Substituierbarkeit.",
		traffic: R,
	},
	{
		code: "SM-14",
		text: "Notfallmanagement (BCM) für die betroffenen Prozesse nachweisen lassen",
		hint: "Bei geschäftskritischen Leistungen.",
		traffic: R,
	},
	{
		code: "SM-15",
		text: "Geeignetes Backup-Konzept nachweisen lassen",
		hint: "Bei relevanter Datenhaltung oder Systembereitstellung.",
		traffic: R,
	},
	// Regulatorische Ergänzungen
	{
		code: "SM-D1",
		text: "Fehlende Vertragsklauseln nach DORA Art. 30 nachverhandeln",
		hint: "IKT-Dienstleister; bei kritischen oder wichtigen Funktionen auch Abs. 3.",
		traffic: ALL,
		frameworks: ["dora"],
	},
	{
		code: "SM-D2",
		text: "Ausstiegsplan dokumentieren und testen (DORA Art. 28 Abs. 8)",
		hint: "Bei Unterstützung kritischer oder wichtiger Funktionen.",
		traffic: ALL,
		when: "critical",
		frameworks: ["dora"],
	},
	{
		code: "SM-D3",
		text: "Vorhaben an die Aufsicht melden und Informationsregister aktualisieren",
		hint: "Neue Vereinbarung über kritische oder wichtige Funktionen (DORA Art. 28 Abs. 3).",
		traffic: ALL,
		when: "critical",
		frameworks: ["dora"],
	},
	{
		code: "SM-O1",
		text: "Wesentliche Auslagerung anzeigen und Auslagerungsbeauftragte:n einbinden",
		hint: "§ 24 Abs. 1 Nr. 19 KWG / § 26 ZAG / Art. 73 MiCAR.",
		traffic: ALL,
		when: "outsourcing",
		frameworks: ["kwg", "zag", "zag-marisk", "micar"],
	},
	{
		code: "SM-K1",
		text: "Geldwäsche-Fragebogen und Erlaubnisnachweis des Partners einholen",
		hint: "Bank-, Emittenten-, Börsen- oder Verwahrpartner.",
		traffic: ALL,
		when: "cryptoPartner",
	},
];

export const SUPPLIER_MEASURE_BY_CODE = new Map(
	SUPPLIER_MEASURES.map((m) => [m.code, m]),
);

// Kritikalität mit den Beschreibungen der Vorlage (Bedeutung, Auswirkung
// bei Ausfall, Ersatzbarkeit, Daten-/Systemzugriff) — Klick führt die drei
// DORA-nahen Stufen; „Mittel“ und „Niedrig“ fallen auf „standard“.
export const CRITICALITY_HELP: Record<
	"critical" | "important" | "standard",
	string
> = {
	critical:
		"Geschäftskritisch: Stillstand oder schwerwiegende Folgen bei Ausfall, nicht kurzfristig ersetzbar, Zugriff auf zentrale oder besonders schützenswerte Daten und Systeme. Unterstützt eine kritische oder wichtige Funktion.",
	important:
		"Hohe Bedeutung: erhebliche Prozessbeeinträchtigung bei Ausfall, nur mit hohem Aufwand ersetzbar, Zugriff auf relevante Daten oder Systeme.",
	standard:
		"Relevante oder geringe Bedeutung: spürbare bis geringe Einschränkungen, mit vertretbarem Aufwand oder kurzfristig ersetzbar, begrenzter oder kein Zugriff.",
};
