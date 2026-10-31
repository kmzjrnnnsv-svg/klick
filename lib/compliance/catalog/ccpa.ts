import { buildIndex, type Spec } from "./spec";
import type { CatalogSection } from "./types";

// California Consumer Privacy Act (CCPA, Cal. Civ. Code § 1798.100 ff.) in
// der Fassung des California Privacy Rights Act (CPRA, in Kraft seit
// 01.01.2023) mit den Verordnungen der California Privacy Protection Agency
// (CPPA, Cal. Code Regs. tit. 11, § 7000 ff.), einschließlich der 2025
// beschlossenen Regeln zu Risikobewertungen, Cybersecurity-Audits und
// automatisierten Entscheidungen (ADMT, in Kraft ab 01.01.2026 mit
// gestaffelten Fristen). Gilt für Firmen weltweit, die in Kalifornien
// Geschäfte machen und eine Schwelle erreichen; anders als die DSGVO setzt
// es meist auf Widerspruch statt Einwilligung. Eigene Formulierung nach
// Modellwissen, gegen leginfo.legislature.ca.gov und cppa.ca.gov prüfen
// (Paragraphen der Verordnung, inflationsangepasste Beträge, Fristen).

export const CCPA_SECTIONS: CatalogSection[] = [
	{ code: "SC", title: "Anwendungsbereich und Schwellen", sortOrder: 10 },
	{ code: "NT", title: "Hinweise und Datenschutzerklärung", sortOrder: 20 },
	{ code: "RT", title: "Rechte der Verbraucher:innen", sortOrder: 30 },
	{
		code: "OO",
		title: "Widerspruch, sensible Daten und Minderjährige",
		sortOrder: 40,
	},
	{
		code: "VP",
		title: "Dienstleister, Auftragnehmer und Dritte",
		sortOrder: 50,
	},
	{
		code: "SE",
		title: "Sicherheit, Datensparsamkeit und Haftung",
		sortOrder: 60,
	},
	{
		code: "RA",
		title: "Risikobewertung, Cybersecurity-Audit und ADMT",
		sortOrder: 70,
	},
	{ code: "RK", title: "Aufzeichnungen und Schulung", sortOrder: 80 },
];

// Verordnung der CPPA von 2025: in Kraft ab 01.01.2026; ADMT-Pflichten ab
// 01.01.2027; erste Audit-Bescheinigung ab 01.04.2028 (gestaffelt nach Umsatz)
const REGS_2025 = "2026-01-01";
const ADMT_FROM = "2027-01-01";
const AUDIT_FROM = "2028-04-01";

const S: Spec[] = [
	{
		code: "SC.1",
		section: "SC",
		title: "Betroffenheit und Schwellen prüfen",
		text: "Prüfen, ob die Firma in Kalifornien Geschäfte macht und eine Schwelle nach § 1798.140(d) erreicht: Jahresumsatz über 25 Millionen US-Dollar (inflationsangepasst), Kauf, Verkauf oder Weitergabe der Daten von mindestens 100.000 Verbraucher:innen oder Haushalten im Jahr oder mindestens die Hälfte des Umsatzes aus Verkauf oder Weitergabe von Daten. Die Prüfung wird jährlich wiederholt.",
		domain: "compliance",
		controls: ["CC-GOV-10", "CC-GOV-04"],
		questions: [
			"Wie prüft ihr jedes Jahr, ob ihr eine der drei Schwellen erreicht?",
		],
		evidence: ["Dokumentierte Betroffenheitsprüfung mit Zahlen"],
	},
	{
		code: "SC.2",
		section: "SC",
		title: "Kategorien und sensible Daten erfassen",
		text: "Erfassen, welche Kategorien personenbezogener Informationen die Firma erhebt, woher sie stammen, wofür sie genutzt werden und an wen sie gehen. Sensible Daten (etwa Ausweis- und Kontonummern mit Zugangsdaten, genauer Standort, Gesundheit, Herkunft, Religion, Inhalte privater Nachrichten) sind gesondert gekennzeichnet.",
		domain: "compliance",
		controls: ["CC-PRV-01", "CC-AST-02"],
		related: ["dsgvo:Art.30"],
	},
	{
		code: "SC.3",
		section: "SC",
		title: "Beschäftigte und Geschäftskontakte einbeziehen",
		text: "Seit dem 1. Januar 2023 gelten Hinweise und Rechte auch für Beschäftigte, Bewerbende und Ansprechpersonen von Geschäftskunden mit Wohnsitz in Kalifornien. Deren Daten sind im Verzeichnis und in den Abläufen für Anfragen berücksichtigt.",
		domain: "hr",
		controls: ["CC-PRV-01", "CC-PRV-02"],
		partial: true,
		note: "Eigene Hinweise für Beschäftigte und Bewerbende gesondert erstellen.",
	},
	{
		code: "NT.1",
		section: "NT",
		title: "Hinweis bei der Erhebung",
		text: "Bei oder vor der Erhebung informieren über die Kategorien der Daten und sensiblen Daten, die Zwecke, ob sie verkauft oder weitergegeben werden, und wie lange jede Kategorie aufbewahrt wird (§ 1798.100(a), Verordnung § 7012). Der Hinweis verlinkt auf die Datenschutzerklärung und, falls nötig, auf den Widerspruchslink.",
		domain: "compliance",
		controls: ["CC-PRV-01", "CC-PRV-02"],
		partial: true,
		note: "Inhalt, Ort und Zeitpunkt des Hinweises sind eigens zu belegen.",
		questions: [
			"Wo sehen Verbraucher:innen den Hinweis, bevor ihre Daten erhoben werden, auch offline und am Telefon?",
		],
		evidence: ["Bildschirmfotos der Hinweise an jeder Erhebungsstelle"],
		related: ["dsgvo:Art.12-15"],
	},
	{
		code: "NT.2",
		section: "NT",
		title: "Datenschutzerklärung mit Pflichtinhalten",
		text: "Die Datenschutzerklärung beschreibt Rechte und Wege für Anfragen, Kategorien der Daten, Quellen, Zwecke, Empfänger, Verkauf und Weitergabe in den letzten zwölf Monaten, Aufbewahrungsfristen und den Umgang mit Opt-out-Signalen (§ 1798.130(a)(5), Verordnung § 7011). Sie ist leicht lesbar, barrierefrei und wird mindestens alle zwölf Monate aktualisiert.",
		domain: "compliance",
		controls: ["CC-PRV-01", "CC-GOV-08", "CC-PRV-02"],
		partial: true,
		note: "Text und Veröffentlichung der Erklärung sind eigens zu pflegen.",
		evidence: ["Datenschutzerklärung mit Datum der letzten Aktualisierung"],
		related: ["dsgvo:Art.12-15"],
	},
	{
		code: "RT.1",
		section: "RT",
		title: "Auskunft und Übertragbarkeit",
		text: "Auf Anfrage Auskunft geben über Kategorien und konkrete Daten, Quellen, Zwecke und Empfänger, für Daten ab dem 1. Januar 2022 auch über zwölf Monate hinaus, außer es ist unmöglich oder unverhältnismäßig (§§ 1798.100, 1798.110, 1798.115). Konkrete Daten werden, soweit technisch machbar, in einem gängigen, maschinenlesbaren Format übergeben.",
		domain: "compliance",
		controls: ["CC-PRV-02"],
		related: ["dsgvo:Art.12-15", "dsgvo:Art.20-22"],
	},
	{
		code: "RT.2",
		section: "RT",
		title: "Löschung",
		text: "Daten auf Anfrage löschen und Dienstleister, Auftragnehmer sowie Dritte, an die sie verkauft oder weitergegeben wurden, zur Löschung anweisen (§ 1798.105). Ausnahmen (etwa gesetzliche Aufbewahrung, Sicherheit, laufender Vertrag) werden begründet und mitgeteilt.",
		domain: "compliance",
		controls: ["CC-PRV-02", "CC-AST-10"],
		questions: [
			"Wie stellt ihr sicher, dass auch Dienstleister und Dritte eine Löschung umsetzen?",
		],
		related: ["dsgvo:Art.16-18"],
	},
	{
		code: "RT.3",
		section: "RT",
		title: "Berichtigung",
		text: "Unrichtige Daten auf Anfrage mit wirtschaftlich angemessenem Aufwand berichtigen, unter Berücksichtigung der Art der Daten und der Zwecke (§ 1798.106).",
		domain: "compliance",
		controls: ["CC-PRV-02"],
		related: ["dsgvo:Art.16-18"],
	},
	{
		code: "RT.4",
		section: "RT",
		title: "Wege für Anfragen und Bevollmächtigte",
		text: "Mindestens zwei Wege für Anfragen anbieten, darunter eine gebührenfreie Telefonnummer; Firmen, die nur online tätig sind und eine direkte Beziehung zur Person haben, genügt eine E-Mail-Adresse (§ 1798.130(a)(1)). Anfragen über Bevollmächtigte werden angenommen, wenn eine Vollmacht vorliegt (Verordnung § 7063).",
		domain: "compliance",
		controls: ["CC-PRV-02"],
		evidence: ["Beschreibung der Anfragewege mit Testanfrage"],
	},
	{
		code: "RT.5",
		section: "RT",
		title: "Fristen für Antworten",
		text: "Den Eingang einer Anfrage auf Auskunft, Löschung oder Berichtigung binnen zehn Werktagen bestätigen und binnen 45 Kalendertagen antworten (§ 1798.130(a)(2), Verordnung § 7021). Die Frist ist einmal um weitere 45 Tage verlängerbar, wenn die Person vorher mit Begründung informiert wird.",
		domain: "compliance",
		controls: ["CC-PRV-02"],
		questions: [
			"Wie behaltet ihr die Fristen von zehn Werktagen und 45 Tagen im Blick?",
		],
	},
	{
		code: "RT.6",
		section: "RT",
		title: "Identität prüfen",
		text: "Ein Verfahren prüft die Identität mit angemessenem Grad an Gewissheit, bei konkreten Daten und Löschung sensibler Daten mit hohem Grad (Verordnung §§ 7060 bis 7062). Für Widerspruch und Beschränkung ist keine Prüfung verlangt; Angaben zur Prüfung werden nur dafür genutzt.",
		domain: "compliance",
		controls: ["CC-PRV-02"],
	},
	{
		code: "RT.7",
		section: "RT",
		title: "Keine Benachteiligung, Anreize nur mit Hinweis",
		text: "Wer Rechte ausübt, bekommt keine schlechteren Preise, Leistungen oder Bedingungen (§ 1798.125). Finanzielle Anreize für Daten (etwa Treueprogramme) gibt es nur mit vorherigem Hinweis, Zustimmung und einer nachvollziehbaren Schätzung des Werts der Daten (Verordnung § 7016).",
		domain: "conduct",
		controls: ["CC-CND-01", "CC-PRV-02"],
		partial: true,
		note: "Bewertung des Werts der Daten bei Anreizen gesondert belegen.",
	},
	{
		code: "OO.1",
		section: "OO",
		title: "Widerspruch gegen Verkauf und Weitergabe",
		text: "Wer Daten verkauft oder für kontextübergreifende Werbung weitergibt, bietet auf der Startseite den Link „Do Not Sell or Share My Personal Information“ oder „Your Privacy Choices“ (§§ 1798.120, 1798.135). Ein Widerspruch wird binnen 15 Werktagen umgesetzt, an Dritte weitergegeben, die die Daten seit dem Antrag erhielten, und frühestens nach zwölf Monaten erneut hinterfragt (Verordnung § 7026).",
		domain: "compliance",
		controls: ["CC-PRV-07", "CC-PRV-04"],
		questions: [
			"Wie erfahren Werbepartner und andere Empfänger:innen, dass jemand widersprochen hat?",
		],
		evidence: [
			"Bildschirmfoto des Widerspruchslinks",
			"Liste der Empfänger:innen mit Kennzeichnung Verkauf oder Weitergabe",
		],
	},
	{
		code: "OO.2",
		section: "OO",
		title: "Opt-out-Signale wie GPC beachten",
		text: "Ein Opt-out-Signal des Browsers (etwa Global Privacy Control) gilt als Widerspruch für diesen Browser oder dieses Gerät und für ein bekanntes Konto, ohne zusätzliche Rückfragen (Verordnung § 7025). Die Firma zeigt an, ob sie das Signal verarbeitet hat.",
		domain: "compliance",
		controls: ["CC-PRV-07"],
		evidence: ["Test der Website mit eingeschaltetem GPC-Signal"],
	},
	{
		code: "OO.3",
		section: "OO",
		title: "Nutzung sensibler Daten beschränken",
		text: "Nutzt die Firma sensible Daten über die erlaubten Zwecke hinaus, bietet sie den Link „Limit the Use of My Sensitive Personal Information“ (§ 1798.121). Nach einem Antrag werden sensible Daten binnen 15 Werktagen nur noch für erlaubte Zwecke genutzt (Verordnung § 7027).",
		domain: "compliance",
		controls: ["CC-PRV-07", "CC-PRV-01"],
		related: ["dsgvo:Art.9"],
	},
	{
		code: "OO.4",
		section: "OO",
		title: "Daten von Minderjährigen nur mit Zustimmung",
		text: "Daten von Personen unter 16 Jahren werden nur mit ausdrücklicher Zustimmung verkauft oder weitergegeben, bei Kindern unter 13 Jahren mit Zustimmung der Eltern (§ 1798.120(c)). Wer das Alter bewusst übergeht, gilt als wissend.",
		domain: "compliance",
		controls: ["CC-PRV-07"],
		partial: true,
		note: "Zustimmung vorab (Opt-in) und Prüfung der Eltern gesondert regeln.",
		questions: [
			"Wie erkennt ihr, dass eine Person jünger als 16 Jahre ist, bevor Daten weitergegeben werden?",
		],
	},
	{
		code: "OO.5",
		section: "OO",
		title: "Faire Wahl ohne Dark Patterns",
		text: "Wahlmöglichkeiten sind leicht verständlich und gleichwertig gestaltet; Ablehnen ist nicht schwerer als Zustimmen (Verordnung § 7004). Eine Zustimmung, die über manipulative Gestaltung (Dark Patterns) eingeholt wurde, gilt nicht als Zustimmung.",
		domain: "conduct",
		controls: ["CC-CND-01", "CC-PRV-07"],
		partial: true,
		note: "Prüfung der Gestaltung von Bannern und Formularen gesondert belegen.",
	},
	{
		code: "VP.1",
		section: "VP",
		title: "Verträge mit Dienstleistern und Auftragnehmern",
		text: "Verträge legen die Zwecke fest und verbieten Verkauf, Weitergabe, Nutzung außerhalb der Geschäftsbeziehung und Verknüpfung mit anderen Daten; sie verlangen denselben Schutz, erlauben Prüfungen und verpflichten zur Meldung, wenn Pflichten nicht mehr erfüllt werden (§ 1798.140(ag) und (j), Verordnung § 7051). Auftragnehmer bestätigen die Einschränkungen schriftlich.",
		domain: "supplier",
		controls: ["CC-PRV-04", "CC-TPR-04"],
		questions: [
			"Welche Verträge mit Dienstleistern enthalten die Pflichtinhalte nach CCPA, und wo fehlen sie noch?",
		],
		evidence: ["Vertragsanhang mit CCPA-Klauseln je Dienstleister"],
		related: ["dsgvo:Art.28"],
	},
	{
		code: "VP.2",
		section: "VP",
		title: "Verträge mit Dritten bei Verkauf oder Weitergabe",
		text: "Werden Daten an Dritte verkauft oder weitergegeben, legt ein Vertrag die begrenzten Zwecke fest, verlangt denselben Schutz und gibt der Firma das Recht, unbefugte Nutzung zu stoppen (§ 1798.100(d), Verordnung § 7053). Ohne einen solchen Vertrag dürfen Dritte die Daten nicht nutzen.",
		domain: "supplier",
		controls: ["CC-PRV-04", "CC-TPR-04", "CC-PRV-07"],
	},
	{
		code: "SE.1",
		section: "SE",
		title: "Angemessene Sicherheit",
		text: "Angemessene Sicherheitsmaßnahmen, passend zur Art der Daten, schützen vor unbefugtem Zugriff, Zerstörung, Nutzung, Änderung und Offenlegung (§ 1798.100(e)).",
		domain: "governance",
		controls: ["CC-GOV-01", "CC-CRY-01", "CC-IAM-01"],
		partial: true,
		note: "Angemessenheit je Datenart begründen; das Sicherheitsprogramm als Ganzes belegen.",
		related: ["dsgvo:Art.32"],
	},
	{
		code: "SE.2",
		section: "SE",
		title: "Haftung und Benachrichtigung bei Datenpannen",
		text: "Werden unverschlüsselte oder nicht geschwärzte Daten wegen fehlender Sicherheit entwendet oder offengelegt, können Betroffene klagen, mit Schadenersatz von 100 bis 750 US-Dollar je Person und Vorfall (inflationsangepasst) nach einer Abhilfefrist von 30 Tagen (§ 1798.150). Betroffene in Kalifornien werden nach § 1798.82 ohne unangemessene Verzögerung benachrichtigt.",
		domain: "incident",
		controls: ["CC-PRV-05", "CC-CRY-01", "CC-CRY-02"],
		partial: true,
		note: "Meldeweg und Fristen nach kalifornischem Recht gesondert festlegen.",
		questions: [
			"Welche Daten über Menschen in Kalifornien liegen unverschlüsselt, und warum?",
		],
		related: ["dsgvo:Art.82-83", "dsgvo:Art.34"],
	},
	{
		code: "SE.3",
		section: "SE",
		title: "Zweckbindung und Datensparsamkeit",
		text: "Daten werden nur erhoben, genutzt und aufbewahrt, soweit es für den angegebenen Zweck angemessen nötig und verhältnismäßig ist und nicht länger als nötig (§ 1798.100(c), Verordnung § 7002). Neue Zwecke, die nicht zum Erhebungszweck passen, brauchen eine Zustimmung.",
		domain: "compliance",
		controls: ["CC-PRV-06", "CC-AST-10", "CC-PRV-01"],
		related: ["dsgvo:Art.5"],
	},
	{
		code: "RA.1",
		section: "RA",
		title: "Risikobewertung vor riskanter Verarbeitung",
		text: "Vor Verkauf oder Weitergabe, Verarbeitung sensibler Daten, ADMT für erhebliche Entscheidungen und anderer Verarbeitung mit erheblichem Risiko eine Risikobewertung erstellen, mindestens alle drei Jahre und binnen 45 Tagen nach wesentlicher Änderung prüfen. Bestehende Verarbeitungen sind bis zum 31. Dezember 2027 bewertet; Angaben dazu und eine Bescheinigung der Geschäftsleitung gehen erstmals bis zum 1. April 2028 an die CPPA.",
		domain: "risk",
		controls: ["CC-PRV-03", "CC-AI-02"],
		effectiveFrom: REGS_2025,
		questions: [
			"Welche eurer Verarbeitungen gelten als erhebliches Risiko, und wo ist die Bewertung dazu?",
		],
		evidence: ["Risikobewertung je Verarbeitung mit Freigabe"],
		related: ["dsgvo:Art.35-36"],
	},
	{
		code: "RA.2",
		section: "RA",
		title: "Jährliches Cybersecurity-Audit",
		text: "Firmen mit erheblichem Risiko (mindestens die Hälfte des Umsatzes aus Verkauf oder Weitergabe, oder Umsatzschwelle und Daten von 250.000 Verbraucher:innen bzw. sensible Daten von 50.000 im Vorjahr) lassen ihr Sicherheitsprogramm jährlich unabhängig prüfen. Ein Mitglied der Geschäftsleitung bescheinigt das Audit gegenüber der CPPA, erstmals bis zum 1. April 2028, 2029 oder 2030, gestaffelt nach Umsatz.",
		domain: "compliance",
		controls: ["CC-GOV-13", "CC-GOV-06"],
		effectiveFrom: AUDIT_FROM,
		questions: [
			"Wer prüft euer Sicherheitsprogramm unabhängig, und an wen berichtet diese Person?",
		],
		evidence: ["Auditbericht mit Bescheinigung der Geschäftsleitung"],
	},
	{
		code: "RA.3",
		section: "RA",
		title: "Automatisierte Entscheidungen (ADMT)",
		text: "Wer ADMT für erhebliche Entscheidungen nutzt (etwa Kredit, Wohnung, Ausbildung, Arbeit, Gesundheit), informiert vorher über Zweck, Funktionsweise und Rechte. Betroffene können widersprechen, außer es gibt eine menschliche Überprüfung durch eine befugte Person, und erhalten auf Anfrage Auskunft über Logik und Ergebnis.",
		domain: "conduct",
		controls: ["CC-AI-05", "CC-AI-06", "CC-PRV-02"],
		effectiveFrom: ADMT_FROM,
		related: ["dsgvo:Art.20-22"],
	},
	{
		code: "RK.1",
		section: "RK",
		title: "Aufzeichnungen über Anfragen",
		text: "Anfragen und Antworten werden mindestens 24 Monate mit Datum, Art, Ergebnis und Grund einer Ablehnung aufbewahrt und nur dafür genutzt (Verordnung § 7101). Wer im Jahr Daten von 10 Millionen oder mehr Verbraucher:innen kauft, verkauft oder weitergibt, veröffentlicht jährlich bis zum 1. Juli Kennzahlen zu den Anfragen (Verordnung § 7102).",
		domain: "compliance",
		controls: ["CC-PRV-02", "CC-AST-10"],
		evidence: ["Register der Anfragen der letzten 24 Monate"],
	},
	{
		code: "RK.2",
		section: "RK",
		title: "Schulung des Personals",
		text: "Alle, die Anfragen bearbeiten oder für die Einhaltung zuständig sind, kennen die Pflichten und wissen, wie sie Verbraucher:innen auf ihre Rechte hinweisen (§ 1798.130(a)(6), Verordnung § 7100).",
		domain: "hr",
		controls: ["CC-HR-03", "CC-PRV-02"],
		questions: [
			"Wie weist ihr nach, dass alle mit Kontakt zu Anfragen geschult sind?",
		],
	},
];

const built = buildIndex("ccpa", S);
export const CCPA_REQUIREMENTS = built.requirements;
export const CCPA_EDGES = built.edges;
