import { CORRIDOR_FRAMEWORK_METAS } from "./corridors";
import type { CatalogFrameworkMeta } from "./types";

// Rahmenwerk-Stammdaten (Rechtsstand Oktober 2026). Die Anforderungs-Indizes
// kommen je Phase dazu (P1: ISO/DORA/NIS2, P4: Finanz-Rahmenwerke, P5: Rest).
export const FRAMEWORKS: CatalogFrameworkMeta[] = [
	{
		slug: "iso27001",
		name: "ISO/IEC 27001:2022",
		version: "2022",
		authority: "ISO/IEC",
		jurisdiction: "global",
		description:
			"Managementsystem für Informationssicherheit (Klauseln 4–10) und 93 Annex-A-Controls. Freiwillig, aber das beste Gerüst, um DORA-Nachweise zu bündeln.",
		recommendedApproach:
			"Zuerst zertifizieren, dann das DORA-Delta schließen — rund zwei Drittel der DORA-Kapitel-II-Nachweise sind damit erledigt.",
		sourceUrl: "https://www.iso.org/standard/27001",
		sortOrder: 10,
		phase: "P1",
		exclusion: {
			label: "Ausschluss in der SoA",
			basis: "ISO/IEC 27001:2022 6.1.3 d (nur Anhang A, nie die Klauseln 4–10)",
			codePrefixes: ["A."],
		},
	},
	{
		slug: "dora",
		name: "DORA — Digital Operational Resilience Act",
		version: "VO (EU) 2022/2554",
		authority: "EU / BaFin",
		jurisdiction: "eu",
		legalBasis: "Verordnung (EU) 2022/2554",
		legalBasisRefs: [
			"RTS 2024/1774",
			"RTS 2024/1772",
			"RTS 2025/301",
			"ITS 2025/302",
			"RTS 2024/1773",
			"ITS 2024/2956",
			"RTS 2025/532",
			"RTS 2025/1190",
		],
		description:
			"Seit 17.01.2025 unmittelbar geltender IKT-Pflichtenkatalog für Zahlungsinstitute, E-Geld-Institute und CASPs: Risikomanagement, Vorfälle, Tests, Drittparteien, Informationsaustausch.",
		sourceUrl: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj",
		sortOrder: 20,
		phase: "P1",
	},
	{
		slug: "nis2",
		name: "NIS2 / BSIG",
		version: "RL (EU) 2022/2555 · NIS2UmsuCG",
		authority: "EU / BSI",
		jurisdiction: "de",
		legalBasis: "Richtlinie (EU) 2022/2555; BSIG",
		description:
			"Cybersicherheitspflichten für wichtige und besonders wichtige Einrichtungen. Für DORA-Finanzunternehmen gilt DORA als lex specialis (§ 28 Abs. 6 BSIG) — es bleiben Betroffenheitsprüfung und Registrierung (§ 33 BSIG).",
		sourceUrl: "https://eur-lex.europa.eu/eli/dir/2022/2555/oj",
		sortOrder: 30,
		phase: "P1",
	},
	{
		slug: "micar",
		name: "MiCAR + KMAG",
		version: "VO (EU) 2023/1114",
		authority: "EU / BaFin",
		jurisdiction: "eu",
		legalBasis: "Verordnung (EU) 2023/1114; Kryptomärkteaufsichtsgesetz",
		legalBasisRefs: [
			"DelVO 2025/305",
			"DelVO 2025/299",
			"DelVO 2025/1140",
			"DelVO 2025/1141",
			"DelVO 2025/1142",
			"DelVO 2025/414",
		],
		description:
			"Zulassung und Pflichten von Kryptowerte-Dienstleistern (Titel V), Token-Emission (Titel II–IV), Marktmissbrauch (Titel VI).",
		sourceUrl: "https://eur-lex.europa.eu/eli/reg/2023/1114/oj",
		sortOrder: 40,
		appliesFromStage: "1_agent",
		phase: "P4",
	},
	{
		slug: "zag",
		name: "ZAG / PSD2",
		version: "ZAG; RL (EU) 2015/2366; RTS (EU) 2018/389",
		authority: "BaFin / Bundesbank",
		jurisdiction: "de",
		legalBasis: "Zahlungsdiensteaufsichtsgesetz",
		description:
			"Erlaubnis, Kapital, Kundengeldsicherung, Organisation, Anzeigen, Meldungen, starke Kundenauthentifizierung. IT- und Vorfallthemen seit 2025 über DORA.",
		sourceUrl: "https://www.gesetze-im-internet.de/zag_2018/",
		sortOrder: 50,
		appliesFromStage: "1_agent",
		phase: "P4",
	},
	{
		slug: "zag-marisk",
		name: "ZAG-MaRisk",
		version: "BaFin-Rundschreiben 07/2024",
		authority: "BaFin",
		jurisdiction: "de",
		legalBasis: "§ 27 ZAG",
		description:
			"Mindestanforderungen an das Risikomanagement von Zahlungs- und E-Geld-Instituten (AT/BT). Schlanker als die Bank-MaRisk; BAIT/ZAIT entfallen für DORA-Institute.",
		sortOrder: 60,
		appliesFromStage: "2_casp_zag",
		phase: "P4",
	},
	{
		slug: "gwg",
		name: "GwG (Geldwäschegesetz)",
		version: "GwG + GwGMeldV",
		authority: "BaFin / FIU",
		jurisdiction: "de",
		legalBasis: "Geldwäschegesetz",
		description:
			"Risikoanalyse, interne Sicherungsmaßnahmen, Sorgfaltspflichten, Verdachtsmeldungen, Aufbewahrung. Große Teile werden am 10.07.2027 von der AMLR verdrängt.",
		sourceUrl: "https://www.gesetze-im-internet.de/gwg_2017/",
		successorSlug: "amlr",
		sortOrder: 70,
		phase: "P4",
	},
	{
		slug: "amlr",
		name: "AMLR — EU-Geldwäscheverordnung",
		version: "VO (EU) 2024/1624",
		authority: "EU / AMLA",
		jurisdiction: "eu",
		legalBasis: "Verordnung (EU) 2024/1624; AMLD6",
		description:
			"Unmittelbar geltendes EU-Geldwäscherecht ab 10.07.2027: harmonisierte Sorgfaltspflichten, Compliance-Manager in der Leitung, Krypto-Korrespondenzbeziehungen, Self-hosted-Adressen.",
		sourceUrl: "https://eur-lex.europa.eu/eli/reg/2024/1624/oj",
		sortOrder: 80,
		phase: "P4",
	},
	{
		slug: "tfr",
		name: "Geldtransferverordnung (Travel Rule)",
		version: "VO (EU) 2023/1113",
		authority: "EU / BaFin",
		jurisdiction: "eu",
		legalBasis: "Verordnung (EU) 2023/1113; EBA/GL/2024/11",
		description:
			"Begleitdaten bei Geld- und Kryptowertetransfers: Originator/Begünstigter ohne Schwellenwert, Self-hosted-Adressen ab 1.000 €, Aufbewahrung 5 Jahre.",
		sourceUrl: "https://eur-lex.europa.eu/eli/reg/2023/1113/oj",
		sortOrder: 90,
		phase: "P4",
	},
	{
		slug: "sanctions",
		name: "Sanktionsrecht (EU / AWG / OFAC)",
		authority: "EU / Bundesbank / BAFA",
		jurisdiction: "eu",
		legalBasis: "VO (EU) 833/2014; AWG § 18; FATF-Listen",
		description:
			"Listenabgleich, Hochrisikoländer, Embargos — täglich automatisiert, nachgewiesen.",
		sortOrder: 100,
		phase: "P4",
	},
	{
		slug: "dsgvo",
		name: "DSGVO / BDSG",
		version: "VO (EU) 2016/679",
		authority: "EU / Datenschutzaufsicht",
		jurisdiction: "eu",
		legalBasis: "Verordnung (EU) 2016/679; BDSG",
		description:
			"Verarbeitungsverzeichnis, Rechtsgrundlagen, TOMs, Meldung von Datenpannen, DSFA, Betroffenenrechte.",
		sourceUrl: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
		sortOrder: 110,
		phase: "P5",
	},
	{
		slug: "dac8",
		name: "DAC8 (KStTG)",
		version: "KStTG",
		authority: "BZSt",
		jurisdiction: "de",
		legalBasis: "Kryptowerte-Steuertransparenzgesetz",
		description:
			"Steuerliche Meldepflichten für Kryptowerte-Dienstleister, Erstmeldung 31.07.2027.",
		sortOrder: 120,
		appliesFromStage: "2_casp_zag",
		phase: "P4",
	},
	{
		slug: "awv",
		name: "AWV / Zahlungsverkehrsstatistik",
		authority: "Bundesbank",
		jurisdiction: "de",
		legalBasis: "AWV § 67; FinDAG § 16",
		description:
			"Meldungen im Außenwirtschaftsverkehr und Zahlungsverkehrsstatistik.",
		sortOrder: 130,
		appliesFromStage: "2_casp_zag",
		phase: "P4",
	},
	{
		slug: "kassen",
		name: "Kassenrecht (KassenSichV / GoBD)",
		authority: "BMF",
		jurisdiction: "de",
		legalBasis: "KassenSichV; § 146a AO; DSFinV-K; GoBD",
		description:
			"Produkt-Anforderungen an die Händlerkasse (TSE, DSFinV-K-Export, Belegausgabe).",
		sortOrder: 140,
		phase: "P4",
	},
	{
		slug: "kwg",
		name: "KWG / Banken-MaRisk",
		authority: "BaFin / EZB",
		jurisdiction: "de",
		legalBasis: "Kreditwesengesetz; MaRisk; CRD VI",
		description:
			"Erlaubnis und laufende Pflichten eines CRR-Instituts — erst mit Lizenzstufe 4 relevant.",
		sortOrder: 150,
		appliesFromStage: "4_bank",
		phase: "P5",
	},
	{
		slug: "cra",
		name: "Cyber Resilience Act",
		version: "VO (EU) 2024/2847",
		authority: "EU / Marktüberwachung (BSI)",
		jurisdiction: "eu",
		legalBasis: "Verordnung (EU) 2024/2847",
		description:
			"Cybersicherheit von Produkten mit digitalen Elementen (Software, Apps, Geräte): Meldepflichten seit 11.09.2026, alle übrigen Pflichten ab 11.12.2027. Reine SaaS-Dienste fallen meist unter NIS2 statt CRA.",
		recommendedApproach:
			"Erst das Produktregister füllen (Rolle, Anwendungsbereich, Einstufung) — daraus leitet Klick ab, welche Pflichten gelten und welches Konformitätsverfahren nötig ist.",
		sourceUrl: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj",
		sortOrder: 160,
		phase: "P6",
	},
	{
		slug: "soc2",
		name: "SOC 2 (Trust Services Criteria)",
		version: "AICPA TSC",
		authority: "AICPA",
		jurisdiction: "global",
		description:
			"Prüfungsbericht über Kontrollen zu Sicherheit, Verfügbarkeit, Vertraulichkeit, Verarbeitungsintegrität und Datenschutz — von Banken, institutionellen Kunden und Partnern häufig verlangt. Freiwillig.",
		recommendedApproach:
			"Mit Typ I (Ausgestaltung zum Stichtag) beginnen, dann Typ II über 6–12 Monate. Die Common Criteria decken sich weitgehend mit ISO 27001; optionale Kategorien nur wählen, wenn Kunden sie verlangen.",
		sourceUrl:
			"https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2",
		sortOrder: 170,
		phase: "P6",
		exclusion: {
			label: "Kategorie nicht im Prüfungsumfang",
			basis: "AICPA TSC: Security (CC) gilt immer, A, C, PI und P sind wählbar",
			sections: ["A1", "C1", "PI1", "P"],
		},
	},
	{
		slug: "ccss",
		name: "CCSS (CryptoCurrency Security Standard)",
		version: "C4",
		authority: "CryptoCurrency Certification Consortium",
		jurisdiction: "global",
		description:
			"Sicherheitsstandard für Systeme, die Kryptowerte verwahren oder Schlüssel verwalten: Schlüsselerzeugung, Wallets, Aufbewahrung, Nutzung, Kompromittierung, Schlüsselinhaber:innen, Prüfungen, Proof of Reserves, Logs. Drei Stufen, freiwillig.",
		recommendedApproach:
			"Für Verwahrung mindestens Stufe II anstreben; Wallet-Register und Schlüsselzeremonien sind die zentralen Nachweise und decken zugleich MiCAR Art. 75 ab.",
		sourceUrl: "https://cryptoconsortium.org/",
		sortOrder: 180,
		phase: "P6",
	},
	{
		slug: "bsi-200-1",
		name: "BSI-Standard 200-1",
		version: "2017",
		authority: "BSI",
		jurisdiction: "de",
		description:
			"Managementsysteme für Informationssicherheit: Verantwortung der Leitung, Ressourcen, Leitlinie, Sicherheitsorganisation mit ISB, Dokumentation und kontinuierliche Verbesserung. Kompatibel zu ISO 27001, Grundlage für „ISO 27001 auf der Basis von IT-Grundschutz“. Freiwillig, in der öffentlichen Verwaltung oft vorgegeben.",
		recommendedApproach:
			"Zusammen mit 200-2 wählen: 200-1 beschreibt das Managementsystem, 200-2 den Weg dorthin. Mit ISO 27001 teilt sich fast jede Maßnahme.",
		sourceUrl:
			"https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/BSI-Standards/bsi-standards_node.html",
		sortOrder: 185,
		phase: "P6",
	},
	{
		slug: "bsi-200-2",
		name: "BSI-Standard 200-2 (IT-Grundschutz-Methodik)",
		version: "2017",
		authority: "BSI",
		jurisdiction: "de",
		description:
			"Vorgehen nach IT-Grundschutz: Initiierung, Organisation, Strukturanalyse, Schutzbedarfsfeststellung, Modellierung mit den Bausteinen des Kompendiums, IT-Grundschutz-Check, Umsetzung und Aufrechterhaltung, in drei Absicherungsvarianten.",
		recommendedApproach:
			"Mit der Basis-Absicherung beginnen, wenn schnell breite Grundsicherheit nötig ist; Kern-Absicherung für wenige besonders schützenswerte Prozesse; Standard-Absicherung als Ziel für die Zertifizierung.",
		sourceUrl:
			"https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/BSI-Standards/bsi-standards_node.html",
		sortOrder: 190,
		phase: "P6",
		variants: [
			{
				key: "standard",
				label: "Standard-Absicherung",
				hint: "Ganzer Informationsverbund, Basis- und Standard-Anforderungen; Ziel für die Zertifizierung",
			},
			{
				key: "basis",
				label: "Basis-Absicherung",
				hint: "Einstieg: breit, nur Basis-Anforderungen, ohne Schutzbedarf und Risikoanalyse",
			},
			{
				key: "kern",
				label: "Kern-Absicherung",
				hint: "Nur die Kronjuwelen, dafür vollständig mit Risikoanalyse",
			},
		],
		variantLabel: "Absicherungsvariante",
	},
	{
		slug: "bsi-200-3",
		name: "BSI-Standard 200-3 (Risikoanalyse)",
		version: "2017",
		authority: "BSI",
		jurisdiction: "de",
		description:
			"Risikoanalyse auf der Basis von IT-Grundschutz für Zielobjekte mit hohem Schutzbedarf oder ohne passenden Baustein: Gefährdungsübersicht aus den 47 elementaren Gefährdungen, Einstufung nach Häufigkeit und Schaden, Behandlung, Konsolidierung.",
		recommendedApproach:
			"Die Risikomethodik in Klick auf die Matrix von 200-3 stellen (vier Stufen) und die elementaren Gefährdungen im Risiko-Assistenten als Ausgangspunkt nehmen.",
		sourceUrl:
			"https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/BSI-Standards/bsi-standards_node.html",
		sortOrder: 195,
		phase: "P6",
	},
	{
		slug: "bsi-200-4",
		name: "BSI-Standard 200-4 (Business Continuity Management)",
		version: "2023",
		authority: "BSI",
		jurisdiction: "de",
		description:
			"Aufbau eines Business-Continuity-Managementsystems in drei Stufen (reaktiv, Aufbau, Standard): Leitlinie, BCM-Organisation und BAO, Business-Impact-Analyse, Strategien, Notfallvorsorge, Notfallhandbuch, Übungen. Kompatibel zu ISO 22301.",
		recommendedApproach:
			"Mit dem reaktiven BCMS beginnen (Alarmierung, Krisenstab, Notfallhandbuch für die wichtigsten Prozesse), dann die BIA auf alle Prozesse ausweiten. Deckt zugleich DORA Art. 11 und ISO 27001 A.5.29/A.5.30 mit ab.",
		sourceUrl:
			"https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/BSI-Standards/bsi-standards_node.html",
		sortOrder: 200,
		phase: "P6",
	},
	...CORRIDOR_FRAMEWORK_METAS,
];

export const FRAMEWORK_SLUGS = FRAMEWORKS.map((f) => f.slug);
