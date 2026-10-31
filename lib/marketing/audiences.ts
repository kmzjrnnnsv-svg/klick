import { PICKER_FRAMEWORKS } from "@/lib/marketing/workflows";

// „Was gilt für dich?“ auf /funktionen: je Art von Unternehmen, welche
// Rahmenwerke Pflicht sind, welche nur je nach Größe oder Tätigkeit gelten,
// welche über die Kund:innen ankommen und welche freiwillig sind. Orientierung
// nach Rechtsstand Oktober 2026, keine Rechtsberatung. Die Pflichten der
// Finanzgruppen hält tests/marketing-audiences im Einklang mit der Einrichtung
// in Klick (suggestFrameworks in lib/compliance/company-profile.ts).

export type AudienceLevel = "must" | "depends" | "indirect" | "voluntary";

export const AUDIENCE_LEVELS: readonly AudienceLevel[] = [
	"must",
	"depends",
	"indirect",
	"voluntary",
];

export type AudienceEntry = { slug: string; level: AudienceLevel; why: string };

export type Audience = {
	key: "it" | "product" | "payment" | "casp" | "bank";
	label: string;
	hint: string;
	entries: AudienceEntry[];
};

const LABELS = new Map<string, string>([
	...PICKER_FRAMEWORKS.map((f) => [f.slug, f.label] as const),
	["sanctions", "Sanktionen"],
	["dac8", "DAC8"],
	["awv", "AWV"],
]);

export function frameworkLabel(slug: string): string {
	return LABELS.get(slug) ?? slug;
}

const NIS2_SIZE =
	"ab 50 Beschäftigten oder mehr als 10 Mio. € Umsatz und Bilanzsumme";
const NIS2_FINANCE =
	"DORA geht vor. Es bleiben die Prüfung, ob du betroffen bist, und die Registrierung beim BSI.";
const DSGVO =
	"Du verarbeitest Daten von Kund:innen und Beschäftigten: Verzeichnis, Schutzmaßnahmen, Meldung von Datenpannen.";
const GWG =
	"Du bist Verpflichtete:r: Risikoanalyse, Sorgfaltspflichten, Verdachtsmeldungen.";
const AMLR =
	"EU-Geldwäscheverordnung ab 10.07.2027, sie ersetzt große Teile des GwG.";
const SANCTIONS = "Kund:innen und Zahlungen gegen die Sanktionslisten prüfen.";
const ISO =
	"Zertifizierbares Managementsystem, das die Nachweise der anderen Rahmenwerke bündelt.";
const SOC2 = "Prüfbericht, den Banken und große Kund:innen oft verlangen.";
const PCI_CARDS =
	"Wickelst du Kartenzahlungen ab oder speicherst Kartendaten, verlangen Acquirer und Kartenorganisationen PCI DSS; der Umfang folgt deinem Fragebogen (SAQ).";
const GRUNDSCHUTZ =
	"IT-Grundschutz des BSI: in Deutschland verbreitet, von öffentlichen Auftraggebern oft verlangt, zertifizierbar als ISO 27001 auf Basis von IT-Grundschutz.";

export const AUDIENCES: Audience[] = [
	{
		key: "it",
		label: "Software- und IT-Anbieter",
		hint: "SaaS, Hosting, Rechenzentrum oder IT-Dienstleistung für andere Unternehmen.",
		entries: [
			{ slug: "dsgvo", level: "must", why: DSGVO },
			{
				slug: "nis2",
				level: "depends",
				why: `Für Cloud, Rechenzentrum, Managed Services oder Online-Marktplatz ${NIS2_SIZE}. Manche Dienste wie DNS gelten unabhängig von der Größe.`,
			},
			{
				slug: "cra",
				level: "depends",
				why: "Nur wenn du Software als Produkt bereitstellst, auch Apps. Reine SaaS-Dienste fallen meist nicht darunter.",
			},
			{
				slug: "dora",
				level: "indirect",
				why: "Sind Banken, Zahlungsinstitute oder Krypto-Dienstleister deine Kund:innen, verlangen sie Vertragsklauseln nach Art. 30, Prüfrechte und Ausstiegspläne.",
			},
			{
				slug: "pci-dss",
				level: "depends",
				why: "Wenn du Kartendaten für andere speicherst, verarbeitest oder übermittelst, etwa als Shop- oder Zahlungsplattform: alle Anforderungen für Dienstleister.",
			},
			{
				slug: "eu-us-dpf",
				level: "depends",
				why: "Wenn Personendaten an Dienstleister in den USA gehen: prüfen, ob sie am Data Privacy Framework teilnehmen. US-Anbieter müssen selbst teilnehmen, um Daten aus der EU so zu empfangen.",
			},
			{
				slug: "tisax",
				level: "indirect",
				why: "Sind Autohersteller oder ihre Zulieferer deine Kund:innen, verlangen sie meist ein TISAX-Ergebnis.",
			},
			{ slug: "iso27001", level: "voluntary", why: ISO },
			{ slug: "soc2", level: "voluntary", why: SOC2 },
			{
				slug: "iso42001",
				level: "voluntary",
				why: "Wenn du KI anbietest oder in deinen Diensten nutzt: Managementsystem für KI, zertifizierbar, hilft beim EU AI Act.",
			},
			{ slug: "bsi-200-2", level: "voluntary", why: GRUNDSCHUTZ },
		],
	},
	{
		key: "product",
		label: "Hersteller",
		hint: "Software, Apps oder Geräte, die du auf den EU-Markt bringst.",
		entries: [
			{
				slug: "cra",
				level: "must",
				why: "Produkte mit digitalen Elementen: Meldepflichten seit 11.09.2026, alle übrigen Pflichten ab 11.12.2027.",
			},
			{ slug: "dsgvo", level: "must", why: DSGVO },
			{
				slug: "nis2",
				level: "depends",
				why: `In bestimmten Branchen, etwa Elektronik oder Maschinenbau, ${NIS2_SIZE}.`,
			},
			{
				slug: "dora",
				level: "indirect",
				why: "Setzen Finanzunternehmen dein Produkt für wichtige Funktionen ein, gelten deren Vertragsklauseln nach Art. 30 auch für dich.",
			},
			{
				slug: "pci-dss",
				level: "depends",
				why: "Wenn dein Produkt Kartenzahlungen annimmt, etwa ein Shop, eine App oder ein Kassensystem: der Umfang folgt deinem Fragebogen (SAQ).",
			},
			{
				slug: "tisax",
				level: "indirect",
				why: "Lieferst du an Autohersteller, verlangen sie meist ein TISAX-Ergebnis, mit Prototypenschutz, wenn du neue Modelle siehst.",
			},
			{ slug: "iso27001", level: "voluntary", why: ISO },
			{
				slug: "iso42001",
				level: "voluntary",
				why: "Wenn KI in deinem Produkt steckt: Managementsystem für KI, hilft beim Nachweis für den EU AI Act.",
			},
		],
	},
	{
		key: "payment",
		label: "Zahlungs- und E-Geld-Institut",
		hint: "Zahlungsdienste oder E-Geld mit Erlaubnis nach dem ZAG.",
		entries: [
			{
				slug: "zag",
				level: "must",
				why: "Erlaubnis der BaFin, Anfangskapital, Sicherung der Kundengelder.",
			},
			{
				slug: "zag-marisk",
				level: "must",
				why: "Mindestanforderungen an dein Risikomanagement.",
			},
			{
				slug: "dora",
				level: "must",
				why: "IKT-Risikomanagement, Vorfallmeldungen, Tests und IT-Dienstleister.",
			},
			{ slug: "gwg", level: "must", why: GWG },
			{ slug: "amlr", level: "must", why: AMLR },
			{
				slug: "tfr",
				level: "must",
				why: "Angaben zu Auftraggeber:in und Begünstigten bei jedem Transfer.",
			},
			{ slug: "sanctions", level: "must", why: SANCTIONS },
			{ slug: "dsgvo", level: "must", why: DSGVO },
			{ slug: "nis2", level: "depends", why: NIS2_FINANCE },
			{
				slug: "awv",
				level: "depends",
				why: "Meldungen zur Zahlungsbilanz, je nach Art und Höhe der Zahlungen.",
			},
			{ slug: "pci-dss", level: "depends", why: PCI_CARDS },
			{ slug: "iso27001", level: "voluntary", why: ISO },
			{ slug: "soc2", level: "voluntary", why: SOC2 },
		],
	},
	{
		key: "casp",
		label: "Krypto-Dienstleister",
		hint: "Verwahrung, Handel, Tausch oder Transfer von Kryptowerten für andere.",
		entries: [
			{
				slug: "micar",
				level: "must",
				why: "Zulassung als Kryptowerte-Dienstleister und laufende Pflichten.",
			},
			{
				slug: "dora",
				level: "must",
				why: "IKT-Risikomanagement, Vorfallmeldungen, Tests und IT-Dienstleister.",
			},
			{ slug: "gwg", level: "must", why: GWG },
			{ slug: "amlr", level: "must", why: AMLR },
			{
				slug: "tfr",
				level: "must",
				why: "Angaben zu Absender:in und Empfänger:in bei jedem Kryptotransfer, ohne Schwellenwert.",
			},
			{ slug: "sanctions", level: "must", why: SANCTIONS },
			{
				slug: "dac8",
				level: "must",
				why: "Steuerliche Meldungen zu Kryptowerte-Transaktionen, erstmals bis 31.07.2027.",
			},
			{ slug: "dsgvo", level: "must", why: DSGVO },
			{
				slug: "zag",
				level: "depends",
				why: "Wenn du zusätzlich Zahlungsdienste anbietest, etwa Auszahlungen in Euro.",
			},
			{ slug: "nis2", level: "depends", why: NIS2_FINANCE },
			{
				slug: "ccss",
				level: "voluntary",
				why: "Wenn du Kryptowerte verwahrst: Sicherheitsstandard für Wallets und Schlüssel.",
			},
			{ slug: "iso27001", level: "voluntary", why: ISO },
			{ slug: "soc2", level: "voluntary", why: SOC2 },
		],
	},
	{
		key: "bank",
		label: "Bank",
		hint: "Kreditinstitut mit Erlaubnis nach dem KWG.",
		entries: [
			{
				slug: "kwg",
				level: "must",
				why: "Erlaubnis und laufende Pflichten, dazu die Banken-MaRisk.",
			},
			{
				slug: "dora",
				level: "must",
				why: "IKT-Risikomanagement, Vorfallmeldungen, Tests und IT-Dienstleister.",
			},
			{ slug: "gwg", level: "must", why: GWG },
			{ slug: "amlr", level: "must", why: AMLR },
			{
				slug: "tfr",
				level: "must",
				why: "Angaben zu Auftraggeber:in und Begünstigten bei jedem Transfer.",
			},
			{ slug: "sanctions", level: "must", why: SANCTIONS },
			{ slug: "dsgvo", level: "must", why: DSGVO },
			{
				slug: "micar",
				level: "depends",
				why: "Wenn du Kryptowerte-Dienste anbietest: Anzeige bei der BaFin statt eigener Zulassung.",
			},
			{ slug: "nis2", level: "depends", why: NIS2_FINANCE },
			{
				slug: "awv",
				level: "depends",
				why: "Meldungen zur Zahlungsbilanz, je nach Art und Höhe der Zahlungen.",
			},
			{
				slug: "pci-dss",
				level: "depends",
				why: "Im Kartengeschäft, also bei Ausgabe oder Annahme von Karten, verlangen die Kartenorganisationen PCI DSS.",
			},
			{ slug: "iso27001", level: "voluntary", why: ISO },
			{ slug: "soc2", level: "voluntary", why: SOC2 },
		],
	},
];

export const AUDIENCE_DEFAULT: Audience["key"] = "it";

// Für die Anzeige: Kurznamen aufgelöst, Einträge nach Stufe gruppiert (leere
// Stufen fallen weg). Läuft auf dem Server, die Client-Komponente bekommt nur
// diese Daten und lädt den Katalog nicht.
export type AudienceView = {
	key: Audience["key"];
	label: string;
	hint: string;
	groups: {
		level: AudienceLevel;
		entries: { slug: string; label: string; why: string }[];
	}[];
};

export function audienceViews(): AudienceView[] {
	return AUDIENCES.map((a) => ({
		key: a.key,
		label: a.label,
		hint: a.hint,
		groups: AUDIENCE_LEVELS.map((level) => ({
			level,
			entries: a.entries
				.filter((e) => e.level === level)
				.map((e) => ({
					slug: e.slug,
					label: frameworkLabel(e.slug),
					why: e.why,
				})),
		})).filter((g) => g.entries.length > 0),
	}));
}
