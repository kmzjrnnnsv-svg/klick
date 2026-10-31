// Unternehmensprofil aus der geführten Einrichtung (D2–D5): Größenklasse,
// NIS2-Einstufung, Vorschlag der Rahmenwerke und Vorbelegung der
// Gap-Analyse. Pure, getestet (tests/company-profile.test.ts). Die
// Einstufung ist eine Orientierung nach Gesetzestext, kein Rechtsrat.

import type {
	AssessmentAnswer,
	CaspService,
	LicenceStage,
} from "@/db/schema/enums";
import type { EntityProfile } from "@/db/schema/platform";

export type SizeClass = "micro" | "small" | "medium" | "large";
export type Nis2Class = "essential" | "important" | "none" | "dora";
export type Sector = "casp" | "bank" | "payment" | "emi" | "other";

// NIS2-Sektoren (Anhang I = hohe Kritikalität, Anhang II = sonstige
// kritische Sektoren); „größenunabhängig“ = Einrichtungen, die unabhängig
// von der Größe erfasst sind (Art. 2 Abs. 2 NIS2: u. a. DNS, TLD,
// Vertrauensdienste, öffentliche elektronische Kommunikation).
export const NIS2_SECTORS = [
	{ key: "energy", annex: 1, label: "Energie" },
	{ key: "transport", annex: 1, label: "Verkehr" },
	{ key: "banking", annex: 1, label: "Bankwesen" },
	{ key: "fmi", annex: 1, label: "Finanzmarktinfrastruktur" },
	{ key: "health", annex: 1, label: "Gesundheit" },
	{ key: "water", annex: 1, label: "Trink- und Abwasser" },
	{
		key: "digital_infra",
		annex: 1,
		label: "Digitale Infrastruktur (Rechenzentren, CDN, Cloud)",
	},
	{
		key: "digital_infra_core",
		annex: 1,
		label: "DNS, TLD, Vertrauensdienste, öffentliche Kommunikation",
		sizeIndependent: true,
	},
	{
		key: "ict_b2b",
		annex: 1,
		label: "IKT-Dienste B2B (Managed Services, Managed Security)",
	},
	{ key: "public_admin", annex: 1, label: "Öffentliche Verwaltung" },
	{ key: "space", annex: 1, label: "Weltraum" },
	{ key: "postal", annex: 2, label: "Post- und Kurierdienste" },
	{ key: "waste", annex: 2, label: "Abfallbewirtschaftung" },
	{ key: "chemicals", annex: 2, label: "Chemie" },
	{ key: "food", annex: 2, label: "Lebensmittel" },
	{
		key: "manufacturing",
		annex: 2,
		label:
			"Verarbeitendes Gewerbe (Medizinprodukte, Elektronik, Maschinen, Fahrzeuge)",
	},
	{
		key: "digital_providers",
		annex: 2,
		label: "Digitale Dienste (Marktplätze, Suchmaschinen, soziale Netzwerke)",
	},
	{ key: "research", annex: 2, label: "Forschung" },
] as const satisfies readonly {
	key: string;
	annex: 1 | 2;
	label: string;
	sizeIndependent?: boolean;
}[];

const FINANCIAL_SECTORS: readonly Sector[] = ["casp", "bank", "payment", "emi"];

// KMU-Definition nach Empfehlung 2003/361/EG: Beschäftigte und Umsatz ODER
// Bilanzsumme.
export function sizeClass(p: {
	employees?: number | null;
	revenueEur?: number | null;
	totalAssetsEur?: number | null;
}): SizeClass | null {
	if (p.employees == null) return null;
	const money = (limitRevenue: number, limitAssets: number) =>
		(p.revenueEur == null && p.totalAssetsEur == null) ||
		(p.revenueEur != null && p.revenueEur <= limitRevenue) ||
		(p.totalAssetsEur != null && p.totalAssetsEur <= limitAssets);
	if (p.employees < 10 && money(2_000_000, 2_000_000)) return "micro";
	if (p.employees < 50 && money(10_000_000, 10_000_000)) return "small";
	if (p.employees < 250 && money(50_000_000, 43_000_000)) return "medium";
	return "large";
}

export type CompanyClassification = {
	size: SizeClass | null;
	nis2: Nis2Class;
	reasons: string[];
	// Vorschlag für die Preisgruppe (Admin → Organisationen)
	priceGroup: "small" | "standard" | "large" | null;
};

export function classifyCompany(
	entity: Pick<
		EntityProfile,
		"employees" | "revenueEur" | "totalAssetsEur" | "nis2Sector"
	>,
	sector: Sector,
): CompanyClassification {
	const size = sizeClass(entity);
	const reasons: string[] = [];
	const sizeLabel: Record<SizeClass, string> = {
		micro: "Kleinstunternehmen",
		small: "kleines Unternehmen",
		medium: "mittleres Unternehmen",
		large: "großes Unternehmen",
	};
	if (size)
		reasons.push(
			`${sizeLabel[size]} nach EU-Empfehlung 2003/361 (Beschäftigte, Umsatz oder Bilanzsumme)`,
		);
	let nis2: Nis2Class = "none";
	// Banken und Finanzmarktinfrastrukturen (NIS2 Anhang I) sind
	// Finanzunternehmen im Sinne von DORA — wie die Finanz-Tätigkeiten
	const financialNis2 =
		entity.nis2Sector === "banking" || entity.nis2Sector === "fmi";
	if (FINANCIAL_SECTORS.includes(sector) || financialNis2) {
		nis2 = "dora";
		reasons.push(
			"Finanzunternehmen: DORA geht für die IKT-Sicherheit als spezielleres Recht vor (Art. 4 NIS2)",
		);
	} else {
		const s = NIS2_SECTORS.find((x) => x.key === entity.nis2Sector);
		if (!s) {
			reasons.push("kein NIS2-Sektor angegeben");
		} else if ("sizeIndependent" in s && s.sizeIndependent) {
			nis2 = "essential";
			reasons.push(
				`${s.label}: unabhängig von der Größe erfasst (Art. 2 Abs. 2 NIS2)`,
			);
		} else if (!size) {
			reasons.push(`${s.label}: Größe fehlt für die Einstufung`);
		} else if (s.annex === 1 && size === "large") {
			nis2 = "essential";
			reasons.push(
				`${s.label} (Anhang I) und groß: besonders wichtige Einrichtung`,
			);
		} else if (size === "large" || size === "medium") {
			nis2 = "important";
			reasons.push(
				`${s.label} (Anhang ${s.annex === 1 ? "I" : "II"}) und ${sizeLabel[size]}: wichtige Einrichtung`,
			);
		} else {
			reasons.push(
				`${s.label}: unter den Schwellen (unter 50 Beschäftigte und höchstens 10 Mio. € Umsatz oder Bilanzsumme)`,
			);
		}
	}
	const priceGroup =
		size === null
			? null
			: size === "micro" || size === "small"
				? "small"
				: size === "medium"
					? "standard"
					: "large";
	return { size, nis2, reasons, priceGroup };
}

export type FrameworkSuggestion = {
	slug: string;
	reason: string;
	// vorgewählt (Pflicht nach Profil) oder nur angeboten
	recommended: boolean;
};

export type SetupProfile = {
	sector: Sector;
	licenceStage: LicenceStage;
	caspServices: readonly CaspService[];
	issuesTokens: "none" | "art" | "emt" | "other";
	hasProducts: boolean;
	entity: EntityProfile;
};

export function suggestFrameworks(p: SetupProfile): FrameworkSuggestion[] {
	const out: FrameworkSuggestion[] = [];
	const add = (slug: string, reason: string, recommended = true) => {
		if (!out.some((x) => x.slug === slug))
			out.push({ slug, reason, recommended });
	};
	const cls = classifyCompany(p.entity, p.sector);
	const financial = FINANCIAL_SECTORS.includes(p.sector) || cls.nis2 === "dora";
	if (financial)
		add(
			"dora",
			"Finanzunternehmen (Zahlungs-/E-Geld-Institut, Bank, Kryptowerte-Dienstleister): IKT-Risikomanagement nach DORA",
		);
	if (cls.nis2 === "essential" || cls.nis2 === "important")
		add(
			"nis2",
			cls.nis2 === "essential"
				? "besonders wichtige Einrichtung nach NIS2/BSIG"
				: "wichtige Einrichtung nach NIS2/BSIG",
		);
	if (
		p.sector === "casp" ||
		p.caspServices.length > 0 ||
		p.issuesTokens !== "none"
	)
		add(
			"micar",
			p.issuesTokens !== "none"
				? "Ausgabe von Kryptowerten bzw. E-Geld-Token"
				: "Kryptowerte-Dienstleistungen (Zulassung nach MiCAR + KMAG)",
		);
	if (p.sector === "payment" || p.sector === "emi") {
		add("zag", "Zahlungs- bzw. E-Geld-Institut nach ZAG");
		add(
			"zag-marisk",
			"Mindestanforderungen an das Risikomanagement (ZAG-MaRisk)",
		);
	}
	if (p.sector === "bank") add("kwg", "Kreditinstitut: KWG und Banken-MaRisk");
	if (financial) {
		add("gwg", "Verpflichtete:r nach § 2 GwG");
		add("amlr", "EU-Geldwäscheverordnung, gilt ab 10.07.2027");
		add("sanctions", "Sanktionsprüfung bei Kund:innen und Zahlungen");
	}
	// Geldtransferverordnung: alle Zahlungsdienstleister einschließlich
	// Kreditinstitute sowie Kryptowerte-Dienstleister
	if (FINANCIAL_SECTORS.includes(p.sector))
		add(
			"tfr",
			"Geldtransferverordnung: Angaben zu Auftraggeber:in und Begünstigten",
		);
	if (p.sector === "casp")
		add("dac8", "Meldepflichten für Kryptowerte-Transaktionen (DAC8, KStTG)");
	if (p.sector === "payment" || p.sector === "emi" || p.sector === "bank")
		add(
			"awv",
			"Meldungen im Außenwirtschaftsverkehr (Zahlungsstatistik)",
			false,
		);
	const pd = p.entity.personalData ?? [];
	if (
		pd.length > 0 ||
		p.entity.specialCategories ||
		(p.entity.employees ?? 0) > 0
	)
		add(
			"dsgvo",
			pd.length > 0
				? "Verarbeitung personenbezogener Daten (DSGVO/BDSG)"
				: "Daten von Beschäftigten (DSGVO/BDSG)",
		);
	if (p.hasProducts)
		add(
			"cra",
			"Produkte mit digitalen Elementen auf dem EU-Markt (Cyber Resilience Act)",
		);
	add(
		"iso27001",
		"Zertifizierbarer Rahmen für das ISMS — sinnvoll als gemeinsame Basis, freiwillig",
		financial || cls.nis2 !== "none",
	);
	if (p.caspServices.includes("custody"))
		add(
			"ccss",
			"Verwahrung von Kryptowerten: Sicherheitsstandard für Wallets und Schlüssel (CCSS), freiwillig",
		);
	if (financial || p.sector === "casp")
		add(
			"soc2",
			"Prüfbericht, den Banken und institutionelle Kunden häufig verlangen (SOC 2), freiwillig",
			false,
		);
	// Kartendaten: PCI DSS verlangen Acquirer und Kartenorganisationen
	// vertraglich; ohne Angabe nur angeboten, wo Kartenzahlungen üblich sind
	const cards = p.entity.cardData;
	if (cards === "outsourced" || cards === "own")
		add(
			"pci-dss",
			cards === "outsourced"
				? "Kartenzahlungen über einen Zahlungsdienstleister: PCI DSS mit kleinem Fragebogen (SAQ A)"
				: "Kartendaten in eigenen Systemen oder Terminals: PCI DSS, vertraglich über Acquirer und Kartenorganisationen",
		);
	else if (
		cards === undefined &&
		(p.sector === "payment" || p.sector === "emi" || p.sector === "bank")
	)
		add(
			"pci-dss",
			"Wenn ihr Kartenzahlungen abwickelt oder Kartendaten speichert: PCI DSS",
			false,
		);
	// IT-Grundschutz: in der öffentlichen Verwaltung meist vorgegeben, sonst
	// freiwillig neben ISO 27001 (Zertifikat „ISO 27001 auf Basis von
	// IT-Grundschutz“)
	const publicAdmin = p.entity.nis2Sector === "public_admin";
	add(
		"bsi-200-1",
		publicAdmin
			? "Öffentliche Verwaltung: Managementsystem nach BSI-Standard 200-1, oft vorgegeben"
			: "ISMS nach BSI-Standard 200-1, freiwillig, verbreitet in Deutschland",
		publicAdmin,
	);
	add(
		"bsi-200-2",
		publicAdmin
			? "Öffentliche Verwaltung: Vorgehen nach IT-Grundschutz (BSI-Standard 200-2)"
			: "Vorgehen nach IT-Grundschutz (BSI-Standard 200-2), freiwillig",
		publicAdmin,
	);
	if (publicAdmin)
		add(
			"bsi-200-3",
			"Risikoanalyse für hohen Schutzbedarf nach BSI-Standard 200-3",
		);
	if (publicAdmin || cls.nis2 !== "none")
		add(
			"bsi-200-4",
			"Business Continuity Management nach BSI-Standard 200-4, freiwillig",
			false,
		);
	return out;
}

// Vorbelegung der Gap-Analyse aus der Einrichtung: nur Hinweise mit
// „teilweise“, nie „ja“ — die Bewertung bleibt bei der Person.
export type SetupFacts = {
	functionsAssigned: number;
	functionsRequired: number;
	sites: number;
	ownDatacenter: boolean;
	itOperation: EntityProfile["itOperation"];
	providers: number;
	profileComplete: boolean;
};

export type Prefill = {
	answer: AssessmentAnswer;
	comment: string;
};

export const PREFILL_PREFIX = "Aus der Einrichtung:";

export function prefillFromSetup(
	f: SetupFacts,
	questionCodes: ReadonlySet<string>,
): Map<string, Prefill> {
	const out = new Map<string, Prefill>();
	const put = (code: string, comment: string) => {
		if (questionCodes.has(code))
			out.set(code, {
				answer: "partial",
				comment: `${PREFILL_PREFIX} ${comment}`,
			});
	};
	if (f.functionsAssigned > 0)
		put(
			"CC-GOV-02",
			`${f.functionsAssigned} von ${f.functionsRequired} Pflichtfunktionen besetzt; Bestellungsnachweise und Vertretungen fehlen noch.`,
		);
	if (f.profileComplete)
		put(
			"CC-GOV-04",
			"Unternehmensprofil erfasst (Größe, Tätigkeit, Standorte); Kontext, interessierte Parteien und Geltungsbereich festlegen.",
		);
	if (f.providers > 0)
		put(
			"CC-TPR-01",
			`${f.providers} Dienstleister erfasst; Verträge, Kritikalität und Bewertung ergänzen.`,
		);
	if (f.sites > 0)
		put(
			"CC-AST-01",
			`${f.sites} Standort(e) erfasst; Asset-Inventar mit Verantwortlichen ergänzen.`,
		);
	if (!f.ownDatacenter && f.itOperation === "cloud")
		put(
			"CC-PHY-02",
			"Kein eigenes Rechenzentrum: Versorgung und Verkabelung des Betriebs liegen beim Cloud-Anbieter (Testat als Nachweis); für Büros Standortrisiken prüfen.",
		);
	return out;
}
