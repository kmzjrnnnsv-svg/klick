import type { RoleFunction } from "@/db/schema/enums";

// Nachweisarten (Nachweis-Werkstatt): Nachweise, die Klick selbst aus seinen
// Registern erzeugt, statt dass jemand eine Datei hochlädt. Je Art: welche
// Anforderungen sie belegt, über welche Controls sie in die Prüfungsreife
// zählt (control_evidence), wo man sie ausfüllt, wer unterschreibt und wie
// lange sie gilt. `covers` nennt die Freitext-Hinweise (evidenceHints) im
// Katalog, die diese Art abdeckt — jeder „(P)“-Hinweis braucht eine Art
// (Test `evidence-kinds`). Statisch und pure, wie der übrige Katalog.

export type EvidenceSigner = {
	function: RoleFunction;
	// all = alle Inhaber:innen der Funktion, any = eine Person genügt
	mode: "all" | "any";
};

export type EvidenceKind = {
	code: string;
	title: string;
	// was der Nachweis zeigt, ein Satz
	purpose: string;
	// org = ein Nachweis je Organisation; je Datensatz z. B. ein Auditbericht
	// je Audit oder ein Bestellungsschreiben je Funktion
	scope: "org" | "per_entity";
	entityType?:
		| "audit"
		| "management_review"
		| "role_assignment"
		| "management_report";
	edit: { href: string; label: string };
	// Dokumentvorlage, deren Textbausteine einfließen (document-templates.ts)
	template?: string;
	requirements: readonly string[];
	controls: readonly string[];
	covers: readonly string[];
	signers: readonly EvidenceSigner[];
	// approve (Standard) = Freigabe, acknowledge = Kenntnisnahme
	signPurpose?: "approve" | "acknowledge";
	reviewMonths: number;
	// Pflichtdokument der Norm („(P)“)
	mandatory: boolean;
};

const GL_ALL: EvidenceSigner[] = [{ function: "management_body", mode: "all" }];
const GL_ANY: EvidenceSigner[] = [{ function: "management_body", mode: "any" }];

export const EVIDENCE_KINDS: readonly EvidenceKind[] = [
	{
		code: "NW-KONTEXT",
		title: "Kontextanalyse",
		purpose:
			"Interne und externe Themen, die das ISMS beeinflussen, bewertet und mit Risiken verknüpft.",
		scope: "org",
		edit: { href: "/organisation?tab=kontext", label: "Kontext pflegen" },
		requirements: ["iso27001:4.1"],
		controls: ["CC-GOV-04"],
		covers: ["Kontextanalyse (SWOT/PESTEL)", "Kontextanalyse"],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-PARTEIEN",
		title: "Interessierte Parteien und ihre Anforderungen",
		purpose:
			"Wer Anforderungen an das ISMS stellt, welche davon verbindlich sind und wie sie erfüllt werden.",
		scope: "org",
		edit: { href: "/organisation?tab=kontext", label: "Parteien pflegen" },
		requirements: ["iso27001:4.2"],
		controls: ["CC-GOV-04"],
		covers: ["Stakeholder- und Rechtsregister", "Stakeholder-Register"],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-SCOPE",
		title: "Geltungsbereich des ISMS",
		purpose:
			"Grenzen, Standorte, Schnittstellen und Ausschlüsse mit Begründung, freigegeben von der Geschäftsleitung.",
		scope: "org",
		edit: {
			href: "/organisation?tab=geltungsbereich",
			label: "Geltungsbereich bearbeiten",
		},
		template: "KZ-SCOPE",
		requirements: ["iso27001:4.3"],
		controls: ["CC-GOV-04"],
		covers: ["(P) Scope-Dokument"],
		signers: GL_ALL,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-PROZESSLANDKARTE",
		title: "Prozesslandkarte",
		purpose:
			"Die Prozesse des ISMS mit Verantwortlichen, Kritikalität und Abhängigkeiten.",
		scope: "org",
		edit: { href: "/prozesse", label: "Prozesse pflegen" },
		requirements: ["iso27001:4.4"],
		// ISMS-Dokumentation; die anderen Träger von 4.4 belegen eigene Arten
		controls: ["CC-GOV-08"],
		covers: ["Prozesslandkarte"],
		signers: [],
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-LEITLINIE",
		title: "Informationssicherheitsleitlinie, unterschrieben",
		purpose:
			"Die freigegebene Leitlinie in der gültigen Fassung mit den Unterschriften der Geschäftsleitung.",
		scope: "org",
		edit: { href: "/dokumente", label: "Leitlinie bearbeiten" },
		template: "RL-ISMS-LEITLINIE",
		requirements: ["iso27001:5.2", "dora:Art.9(4)(a)", "nis2:Art.20(1)"],
		controls: ["CC-GOV-01", "CC-GOV-03"],
		covers: [
			"(P) Leitlinie, von GL unterschrieben",
			"Unterschriebene Leitlinie",
		],
		signers: GL_ALL,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-BESCHLUESSE",
		title: "Beschlüsse der Geschäftsleitung",
		purpose:
			"Beschlussregister mit Gegenstand, Datum, Teilnehmenden und Bezug zu den Rahmenwerken.",
		scope: "org",
		edit: { href: "/beschluesse", label: "Beschlüsse öffnen" },
		requirements: ["iso27001:5.1", "dora:Art.5(2)", "nis2:Art.20(1)"],
		controls: ["CC-GOV-03"],
		covers: ["Freigabeprotokolle", "Beschlüsse der Geschäftsleitung"],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-ROLLEN",
		title: "Rollenregister",
		purpose:
			"Pflichtfunktionen mit Inhaber:in, Vertretung, Bestelldatum und Prüfung der Funktionstrennung.",
		scope: "org",
		edit: { href: "/organisation?tab=rollen", label: "Rollen besetzen" },
		template: "BE-ROLLEN",
		requirements: ["iso27001:5.3"],
		controls: ["CC-GOV-02"],
		covers: ["Rollenbeschreibungen ISB", "Rollenregister"],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-ORGANIGRAMM",
		title: "Organigramm",
		purpose:
			"Aufbau der Funktionen mit Berichtswegen, Besetzung und Vertretung; Unabhängigkeitsfunktionen berichten direkt an die Leitung.",
		scope: "org",
		edit: { href: "/organisation?tab=rollen", label: "Berichtswege pflegen" },
		requirements: [
			"iso27001:5.3",
			"dora:Art.6(1-4)",
			"zag-marisk:AT4.3.1",
			"zag-marisk:AT4.4.1",
		],
		controls: ["CC-GOV-02", "CC-GOV-19"],
		covers: ["Organigramm", "Organigramm mit drei Linien"],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-BESTELLUNG",
		title: "Bestellungsschreiben",
		purpose:
			"Bestellung je Funktion mit Aufgaben, Befugnissen, Berichtsweg und Ressourcen, unterschrieben von Geschäftsleitung und bestellter Person.",
		scope: "per_entity",
		entityType: "role_assignment",
		edit: { href: "/organisation?tab=rollen", label: "Funktion öffnen" },
		requirements: [
			"iso27001:5.3",
			"zag-marisk:AT4.4.1",
			"gwg:§7",
			"amlr:Art.11",
			"dsgvo:Art.37-39",
		],
		controls: ["CC-GOV-02", "CC-AML-03", "CC-PRV-06"],
		covers: ["Bestellungsschreiben", "Bestellung", "Bestellung DSB"],
		// dazu die bestellte Person (Generator: extraSigners)
		signers: GL_ANY,
		reviewMonths: 24,
		mandatory: false,
	},
	{
		code: "NW-RACI",
		title: "RACI je Prozess",
		purpose:
			"Wer je Prozess verantwortlich, rechenschaftspflichtig, beteiligt und informiert ist.",
		scope: "org",
		edit: { href: "/prozesse", label: "RACI pflegen" },
		requirements: ["iso27001:5.3"],
		controls: ["CC-GOV-02"],
		covers: ["RACI", "RACI je Prozess"],
		signers: [],
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-RISIKOMETHODIK",
		title: "Methodik der Risikobeurteilung",
		purpose:
			"Rechenweg, Stufen, Schadensarten und Akzeptanzkriterien, wie sie in Klick eingestellt sind.",
		scope: "org",
		edit: { href: "/einstellungen?tab=risk", label: "Methodik einstellen" },
		template: "KZ-RISIKOMETHODIK",
		requirements: ["iso27001:6.1.2", "dora:Art.6(1-4)"],
		controls: ["CC-RSK-01"],
		covers: ["(P) Risikobeurteilungsmethodik", "Risikoappetit-Beschluss"],
		signers: GL_ALL,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-RISIKOBEURTEILUNG",
		title: "Ergebnisse der Risikobeurteilung",
		purpose:
			"Risikoregister mit Bewertung, Klasse und Verantwortlichen zum Stichtag.",
		scope: "org",
		edit: { href: "/risiken", label: "Risiken bewerten" },
		requirements: [
			"iso27001:6.1.1",
			"iso27001:6.1.2",
			"iso27001:8.2",
			"nis2:Art.21(2)(a)",
		],
		controls: ["CC-RSK-01", "CC-RSK-02"],
		covers: [
			"(P) Ergebnisse",
			"(P) Ergebnisse der Risikobeurteilung",
			"(P) aktuelle Ergebnisse der Risikobeurteilung",
			"Risiko- und Chancenregister",
			"Risikoregister",
			"Risikomatrix",
		],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-SOA",
		title: "Erklärung zur Anwendbarkeit (SoA)",
		purpose:
			"Alle Maßnahmen aus Anhang A mit Anwendbarkeit, Begründung und Umsetzungsstand.",
		scope: "org",
		edit: {
			href: "/rahmenwerke/iso27001?tab=soa",
			label: "Anwendbarkeit prüfen",
		},
		template: "BE-SOA",
		requirements: ["iso27001:6.1.3"],
		controls: ["CC-RSK-03"],
		covers: ["(P) Erklärung zur Anwendbarkeit (SoA)"],
		signers: GL_ALL,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-BEHANDLUNGSPLAN",
		title: "Risikobehandlungsplan",
		purpose:
			"Maßnahmen je Risiko mit Verantwortlichen, Frist und Stand; akzeptierte Restrisiken mit Freigabe.",
		scope: "org",
		edit: { href: "/risiken?tab=massnahmen", label: "Maßnahmen planen" },
		template: "PL-RISIKOBEHANDLUNG",
		requirements: ["iso27001:6.1.3", "iso27001:8.3"],
		controls: ["CC-RSK-03"],
		covers: [
			"(P) Risikobehandlungsplan",
			"(P) aktuelle Ergebnisse der Risikobehandlung",
			"Massnahmenstatus",
		],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-ZIELE",
		title: "Informationssicherheitsziele mit Kennzahlen",
		purpose:
			"Freigegebene Ziele mit Kennzahl, Zielwert, Schwellen, Messintervall und letztem Messwert.",
		scope: "org",
		edit: { href: "/organisation?tab=ziele", label: "Ziele pflegen" },
		template: "KZ-ZIELE",
		requirements: ["iso27001:6.2"],
		controls: ["CC-GOV-05"],
		covers: ["(P) Zielkatalog mit KPIs"],
		signers: GL_ALL,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-KOMPETENZ",
		title: "Kompetenz- und Schulungsnachweise",
		purpose:
			"Pflichtschulungen je Rolle, Teilnahme je Person mit Datum und Quote, Schulung der Geschäftsleitung.",
		scope: "org",
		edit: { href: "/schulungen?tab=matrix", label: "Schulungen öffnen" },
		template: "PL-SCHULUNG",
		requirements: [
			"iso27001:7.2",
			"iso27001:7.3",
			"dora:Art.5(4)",
			"dora:Art.13(6)",
			"nis2:Art.20(2)",
			"nis2:Art.21(2)(g)",
		],
		controls: ["CC-HR-03", "CC-GOV-16"],
		covers: [
			"(P) Qualifikationsnachweise",
			"Awareness-Nachweise",
			"Schulungsplan",
			"Teilnahmenachweise",
			"Kompetenzmatrix",
			"Schulungsnachweise der Geschäftsleitung",
		],
		signers: [],
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-KOMMUNIKATION",
		title: "Kommunikationsmatrix",
		purpose:
			"Worüber, wann, mit wem, wer und wie kommuniziert wird – intern, extern und gegenüber Behörden.",
		scope: "org",
		edit: {
			href: "/organisation?tab=kommunikation",
			label: "Kommunikation pflegen",
		},
		template: "KZ-KOMMUNIKATION",
		requirements: ["iso27001:7.4"],
		controls: ["CC-GOV-09"],
		covers: ["Kommunikationsmatrix", "Behördenliste"],
		signers: [],
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-DOKUMENTENLENKUNG",
		title: "Regel zur Lenkung dokumentierter Information",
		purpose:
			"Wie Dokumente erstellt, geprüft, freigegeben, verteilt, versioniert und archiviert werden.",
		scope: "org",
		edit: { href: "/dokumente", label: "Regel bearbeiten" },
		template: "VA-DOKUMENTENLENKUNG",
		requirements: ["iso27001:7.5"],
		controls: ["CC-GOV-08"],
		covers: ["(P) Dokumentenlenkungsregel"],
		signers: GL_ANY,
		reviewMonths: 24,
		mandatory: true,
	},
	{
		code: "NW-RICHTLINIEN",
		title: "Richtlinienverzeichnis mit Versionen",
		purpose:
			"Alle gelenkten Dokumente mit Version, Freigabe, nächster Prüfung und Prüfsumme.",
		scope: "org",
		edit: { href: "/dokumente", label: "Dokumente öffnen" },
		requirements: ["iso27001:7.5", "iso27001:5.2"],
		controls: ["CC-GOV-08", "CC-GOV-01"],
		covers: [
			"Richtlinienverzeichnis mit Versionen",
			"Dokumentenregister",
			"Versionshistorie mit Freigaben",
		],
		signers: [],
		reviewMonths: 6,
		mandatory: false,
	},
	{
		code: "NW-KENNTNISNAHME",
		title: "Kenntnisnahme der Richtlinien",
		purpose:
			"Wer welche Fassung zur Kenntnis genommen hat – Quote je Dokument und gesamt, offene Personen.",
		scope: "org",
		edit: { href: "/dokumente", label: "Kenntnisnahmen ansehen" },
		requirements: ["iso27001:7.3", "iso27001:5.2"],
		controls: ["CC-HR-03", "CC-GOV-01"],
		covers: ["Kenntnisnahme-Quote"],
		signers: [],
		reviewMonths: 6,
		mandatory: false,
	},
	{
		code: "NW-MESSUNG",
		title: "Überwachungs- und Messergebnisse",
		purpose:
			"Kennzahlen mit Verlauf, Ergebnisse der Wirksamkeitstests und Stand der Pflichten.",
		scope: "org",
		edit: { href: "/organisation?tab=ziele", label: "Messwerte erfassen" },
		requirements: ["iso27001:9.1", "nis2:Art.21(2)(f)"],
		controls: ["CC-GOV-05", "CC-TST-01"],
		covers: ["(P) Messergebnisse", "KPI-Report"],
		signers: GL_ANY,
		reviewMonths: 6,
		mandatory: true,
	},
	{
		code: "NW-AUDITPROGRAMM",
		title: "Auditprogramm",
		purpose:
			"Dreijahresprogramm mit Audits je Bereich, Abdeckung aller Anforderungen und Unabhängigkeit.",
		scope: "org",
		edit: { href: "/audits?tab=programm", label: "Programm planen" },
		template: "VA-AUDITPROGRAMM",
		requirements: ["iso27001:9.2", "dora:Art.6(6)"],
		controls: ["CC-GOV-06"],
		covers: ["(P) Auditprogramm", "(P) Auditprogramm und -berichte"],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-AUDITBERICHT",
		title: "Auditbericht",
		purpose:
			"Ein internes Audit: Umfang, Kriterien, Auditor:innen, Prüfpfad, Feststellungen und Ergebnis.",
		scope: "per_entity",
		entityType: "audit",
		edit: { href: "/audits?tab=audits", label: "Audit öffnen" },
		requirements: ["iso27001:9.2", "dora:Art.6(6)"],
		controls: ["CC-GOV-06"],
		covers: ["Auditberichte"],
		signers: [
			{ function: "internal_audit", mode: "any" },
			{ function: "management_body", mode: "any" },
		],
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-FINDINGS",
		title: "Findings-Register",
		purpose:
			"Alle Feststellungen aus Audits mit Schwere, Status, Frist und verknüpfter Abweichung.",
		scope: "org",
		edit: { href: "/audits?tab=findings", label: "Findings öffnen" },
		requirements: ["iso27001:9.2", "iso27001:10.2"],
		controls: ["CC-GOV-06", "CC-GOV-07"],
		covers: ["Findings-Tracking"],
		signers: [],
		reviewMonths: 6,
		mandatory: false,
	},
	{
		code: "NW-GL-BERICHT",
		title: "Bericht an die Geschäftsleitung",
		purpose:
			"Bericht einer Funktion (ISB, IKT-Risiko, GWB, Compliance, DSB, Auslagerung) mit Kennzahlen aus Klick, von der Geschäftsleitung zur Kenntnis genommen.",
		scope: "per_entity",
		entityType: "management_report",
		edit: { href: "/berichte", label: "Berichte öffnen" },
		requirements: [
			"nis2:Art.20(1)",
			"dora:Art.5(2)",
			"gwg:§7",
			"zag-marisk:AT4.4.2",
			"dsgvo:Art.37-39",
		],
		controls: ["CC-GOV-03", "CC-AML-03", "CC-GOV-13", "CC-PRV-06"],
		covers: [
			"Berichtsprotokolle",
			"Jahresbericht",
			"Berichte der DSB",
			"Bericht der Geldwäschebeauftragten",
			"Bericht der Compliance-Funktion",
		],
		signers: GL_ANY,
		signPurpose: "acknowledge",
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-MANAGEMENTBEWERTUNG",
		title: "Protokoll der Managementbewertung",
		purpose:
			"Pflicht-Inputs, Zusammenfassung, Entscheidungen und Maßnahmen einer Managementbewertung.",
		scope: "per_entity",
		entityType: "management_review",
		edit: {
			href: "/managementbewertung",
			label: "Managementbewertung öffnen",
		},
		template: "BE-MANAGEMENTBEWERTUNG",
		requirements: ["iso27001:9.3", "iso27001:5.1"],
		controls: ["CC-GOV-05", "CC-GOV-03"],
		covers: ["(P) Protokoll Management-Review", "Management-Bewertung"],
		signers: GL_ALL,
		reviewMonths: 12,
		mandatory: true,
	},
	{
		code: "NW-TESTPROGRAMM",
		title: "Testprogramm und Testberichte",
		purpose:
			"Jahresplan der Wirksamkeits- und Resilienztests je Testart mit Ergebnis und Folgemaßnahmen.",
		scope: "org",
		edit: { href: "/testprogramm", label: "Testprogramm öffnen" },
		template: "RL-TESTPROGRAMM",
		requirements: ["dora:Art.24", "nis2:Art.21(2)(f)"],
		controls: ["CC-TST-01"],
		covers: ["Testprogramm", "Jahresplan", "Testberichte je Testart"],
		signers: GL_ANY,
		reviewMonths: 12,
		mandatory: false,
	},
	{
		code: "NW-ABWEICHUNGEN",
		title: "Nichtkonformitäten und Korrekturmaßnahmen",
		purpose:
			"Abweichungsregister mit Ursache, Korrektur, Korrekturmaßnahme, Frist, Priorität und Wirksamkeit.",
		scope: "org",
		edit: { href: "/abweichungen", label: "Abweichungen öffnen" },
		template: "VA-ABWEICHUNGEN",
		requirements: ["iso27001:10.2", "iso27001:10.1"],
		controls: ["CC-GOV-07"],
		covers: [
			"(P) Nachweis Nichtkonformitäten und Korrekturen",
			"Verbesserungslog",
			"Abweichungsregister",
		],
		signers: [],
		reviewMonths: 6,
		mandatory: true,
	},
	{
		code: "NW-WIRKSAMKEIT",
		title: "Wirksamkeitsprüfungen",
		purpose:
			"Geprüfte Wirksamkeit von Korrekturmaßnahmen und Controls mit Methode, Datum und Ergebnis.",
		scope: "org",
		edit: { href: "/testprogramm", label: "Testprogramm öffnen" },
		requirements: ["iso27001:10.2", "nis2:Art.21(2)(f)"],
		controls: ["CC-GOV-07", "CC-TST-01"],
		covers: ["Wirksamkeitsprüfungen"],
		signers: [],
		reviewMonths: 12,
		mandatory: false,
	},
];

export const EVIDENCE_KIND_BY_CODE: ReadonlyMap<string, EvidenceKind> = new Map(
	EVIDENCE_KINDS.map((k) => [k.code, k]),
);

// Arten, die eine Anforderung belegen (Reihenfolge wie im Katalog)
export function evidenceKindsForRequirement(key: string): EvidenceKind[] {
	return EVIDENCE_KINDS.filter((k) => k.requirements.includes(key));
}

export function evidenceKindsForControl(code: string): EvidenceKind[] {
	return EVIDENCE_KINDS.filter((k) => k.controls.includes(code));
}

// Freitext-Hinweis → Art, die ihn abdeckt (für klickbare Hinweise)
export function evidenceKindForHint(hint: string): EvidenceKind | undefined {
	return EVIDENCE_KINDS.find((k) => k.covers.includes(hint));
}

// Arten für die aktiven Rahmenwerke einer Org
export function evidenceKindsForFrameworks(
	frameworks: readonly string[],
): EvidenceKind[] {
	const set = new Set(frameworks);
	return EVIDENCE_KINDS.filter((k) =>
		k.requirements.some((r) => set.has(r.slice(0, r.indexOf(":")))),
	);
}
