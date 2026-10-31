import { buildIndex, type Spec } from "./spec";
import type { CatalogSection, FrameworkVariant } from "./types";

// 23 NYCRR Part 500 (USA, New York Department of Financial Services, DFS):
// Cybersicherheitsregeln für Banken, Versicherungen und andere Finanzfirmen
// mit Erlaubnis oder Registrierung in New York (Covered Entities). Fassung der
// zweiten Änderung vom 01.11.2023, Übergangsfristen gestaffelt bis
// 01.11.2025, seitdem voll wirksam. Varianten: Covered Entity, Class-A-
// Unternehmen mit Zusatzpflichten (500.1) und begrenzte Ausnahme für kleine
// Unternehmen (500.19(a)). Codes nach der Fundstelle; wo eine Anforderung
// mehrere Unterabsätze zusammenfasst, steht der erste. Eigene Formulierung
// nach Modellwissen, gegen dfs.ny.gov prüfen.

export const NYCRR_VARIANTS: FrameworkVariant[] = [
	{
		key: "standard",
		label: "Covered Entity",
		hint: "Unternehmen mit Erlaubnis oder Registrierung des DFS",
	},
	{
		key: "class_a",
		label: "Class-A-Unternehmen",
		hint: "Mindestens 20 Mio. USD Umsatz in New York und mehr als 2.000 Beschäftigte oder mehr als 1 Mrd. USD Umsatz weltweit, jeweils mit verbundenen Unternehmen",
	},
	{
		key: "limited",
		label: "Begrenzte Ausnahme nach 500.19(a)",
		hint: "Kleine Unternehmen: weniger als 20 Beschäftigte, unter 7,5 Mio. USD Umsatz in New York oder unter 15 Mio. USD Bilanzsumme",
	},
];

const ALL = ["standard", "class_a", "limited"];
const STD = ["standard", "class_a"];
const CLASS_A = ["class_a"];
const LIMITED = ["limited"];

export const NYCRR_SECTIONS: CatalogSection[] = [
	{
		code: "PRG",
		title: "Programm, Richtlinie und Leitung (500.2–500.4)",
		sortOrder: 10,
	},
	{ code: "TEC", title: "Technische Maßnahmen", sortOrder: 20 },
	{
		code: "RSK",
		title: "Risikobewertung und Dienstleister (500.9, 500.11)",
		sortOrder: 30,
	},
	{
		code: "PPL",
		title: "Personal und Schulung (500.10, 500.14)",
		sortOrder: 40,
	},
	{
		code: "INC",
		title: "Vorfallreaktion und Notfallplanung (500.16)",
		sortOrder: 50,
	},
	{ code: "NOT", title: "Meldungen an das DFS (500.17)", sortOrder: 60 },
	{
		code: "CLA",
		title: "Zusatzpflichten für Class-A-Unternehmen",
		sortOrder: 70,
	},
];

const S: Spec[] = [
	// ── Programm, Richtlinie und Leitung ────────────────────────────────────
	{
		code: "500.2(a)",
		section: "PRG",
		title: "Cybersicherheitsprogramm",
		text: "Ein Cybersicherheitsprogramm auf Grundlage der Risikobewertung unterhalten, das Vertraulichkeit, Integrität und Verfügbarkeit der Informationssysteme und nichtöffentlichen Informationen schützt. Es deckt die Kernfunktionen ab: Risiken erkennen, schützen, Ereignisse entdecken, reagieren, wiederherstellen und Meldepflichten erfüllen.",
		domain: "governance",
		controls: ["CC-GOV-01", "CC-RSK-02"],
		variants: ALL,
		related: ["iso27001:4.4"],
	},
	{
		code: "500.3",
		section: "PRG",
		title: "Schriftliche Cybersicherheitsrichtlinie",
		text: "Schriftliche Richtlinien festlegen, die mindestens jährlich von einer leitenden Person oder dem Aufsichtsgremium freigegeben werden. Sie regeln unter anderem Datenklassifizierung und Aufbewahrung, Inventar, Zugänge, Betrieb, Netzsicherheit, Entwicklung, physische Sicherheit, Dienstleister, Risikobewertung, Vorfallreaktion und Schwachstellen.",
		domain: "governance",
		controls: ["CC-GOV-01", "CC-GOV-03"],
		variants: ALL,
		questions: [
			"Wer hat die Cybersicherheitsrichtlinie zuletzt freigegeben, und wann?",
		],
		evidence: ["Richtlinie mit jährlicher Freigabe"],
		related: ["iso27001:A.5.1"],
	},
	{
		code: "500.4(a)",
		section: "PRG",
		title: "CISO benennen",
		text: "Eine qualifizierte Person als CISO benennen, die das Programm überwacht und die Richtlinie durchsetzt; kommt sie von einem verbundenen Unternehmen oder einem Dienstleister, bleibt die Verantwortung beim Unternehmen.",
		domain: "governance",
		controls: ["CC-GOV-02"],
		variants: STD,
		evidence: ["Benennung des CISO"],
	},
	{
		code: "500.4(b)",
		section: "PRG",
		title: "Bericht des CISO an das Aufsichtsgremium",
		text: "Der CISO berichtet mindestens jährlich schriftlich an das Aufsichtsgremium über das Programm, wesentliche Risiken, seine Wirksamkeit und wesentliche Ereignisse und informiert zeitnah über wesentliche Sicherheitsthemen.",
		domain: "governance",
		controls: ["CC-GOV-05", "CC-GOV-03"],
		variants: STD,
		evidence: [
			"Jahresbericht des CISO",
			"Protokoll der Sitzung des Aufsichtsgremiums",
		],
	},
	{
		code: "500.4(d)",
		section: "PRG",
		title: "Aufsicht durch das Leitungsgremium",
		text: "Das Aufsichtsgremium überwacht das Cyberrisikomanagement wirksam: Es versteht die Themen ausreichend, lässt das Programm durch die Geschäftsleitung umsetzen, prüft regelmäßig deren Berichte und bestätigt ausreichende Ressourcen.",
		domain: "governance",
		controls: ["CC-GOV-03", "CC-GOV-16", "CC-GOV-14"],
		variants: STD,
		questions: [
			"Wie stellt ihr sicher, dass das Aufsichtsgremium genug von Cybersicherheit versteht, um wirksam zu überwachen?",
		],
	},

	// ── Technische Maßnahmen (500.5–500.8, 500.12–500.15) ───────────────────
	{
		code: "500.5(a)(1)",
		section: "TEC",
		title: "Jährlicher Penetrationstest",
		text: "Mindestens jährlich Penetrationstests von innen und von außen durch eine qualifizierte interne oder externe Stelle durchführen lassen.",
		domain: "development",
		controls: ["CC-DEV-04", "CC-TST-01"],
		variants: STD,
		evidence: ["Bericht des letzten Penetrationstests"],
	},
	{
		code: "500.5(a)(2)",
		section: "TEC",
		title: "Automatische Schwachstellenscans",
		text: "Systeme automatisch auf Schwachstellen scannen, so oft es die Risikobewertung verlangt und zeitnah nach wesentlichen Änderungen; nicht erfasste Systeme von Hand prüfen.",
		domain: "operations",
		controls: ["CC-OPS-03"],
		variants: STD,
	},
	{
		code: "500.5(c)",
		section: "TEC",
		title: "Schwachstellen zeitnah beheben",
		text: "Neue Schwachstellen zeitnah erfahren und gefundene Schwachstellen rechtzeitig beheben, priorisiert nach dem Risiko.",
		domain: "operations",
		controls: ["CC-OPS-03", "CC-RSK-05"],
		variants: STD,
		questions: [
			"Welche Fristen gelten für die Behebung kritischer Schwachstellen, und wie haltet ihr sie nach?",
		],
	},
	{
		code: "500.6",
		section: "TEC",
		title: "Prüfpfade",
		text: "Systeme betreiben, mit denen sich wesentliche Finanztransaktionen rekonstruieren lassen (Aufbewahrung fünf Jahre), und Prüfpfade, die helfen, Sicherheitsereignisse mit wesentlichem Schaden zu erkennen und zu bearbeiten (Aufbewahrung drei Jahre).",
		domain: "operations",
		controls: ["CC-LOG-03", "CC-LOG-01"],
		partial: true,
		note: "Rekonstruktion wesentlicher Finanztransaktionen ausdrücklich vorsehen",
		variants: STD,
		related: ["iso27001:A.8.15"],
	},
	{
		code: "500.7(a)(1)",
		section: "TEC",
		title: "Mindestrechte und wenige privilegierte Konten",
		text: "Zugriffsrechte auf das Nötige begrenzen, die Zahl privilegierter Konten klein halten und privilegierte Konten nur für Aufgaben nutzen, die sie erfordern.",
		domain: "access",
		controls: ["CC-IAM-01", "CC-IAM-04"],
		variants: ALL,
		related: ["iso27001:A.8.2"],
	},
	{
		code: "500.7(a)(4)",
		section: "TEC",
		title: "Jährliche Überprüfung der Rechte",
		text: "Alle Zugriffsrechte mindestens jährlich überprüfen, unnötige Konten entfernen oder sperren und Zugänge beim Ausscheiden umgehend entziehen.",
		domain: "access",
		controls: ["CC-IAM-05", "CC-IAM-02"],
		variants: ALL,
		evidence: ["Protokoll der letzten Überprüfung der Rechte"],
	},
	{
		code: "500.7(a)(5)",
		section: "TEC",
		title: "Fernsteuerung von Geräten",
		text: "Alle Protokolle, die eine Fernsteuerung von Geräten erlauben, abschalten oder sicher konfigurieren.",
		domain: "network",
		controls: ["CC-OPS-04", "CC-IAM-07"],
		variants: ALL,
	},
	{
		code: "500.7(b)",
		section: "TEC",
		title: "Passwortrichtlinie",
		text: "Soweit Passwörter genutzt werden, eine schriftliche Passwortrichtlinie nach Branchenstandard festlegen.",
		domain: "access",
		controls: ["CC-IAM-03"],
		variants: ALL,
	},
	{
		code: "500.8",
		section: "TEC",
		title: "Anwendungssicherheit",
		text: "Schriftliche Verfahren für die sichere Entwicklung eigener Anwendungen und für die Sicherheitsprüfung zugekaufter Anwendungen festlegen; der CISO prüft sie mindestens jährlich.",
		domain: "development",
		controls: ["CC-DEV-01", "CC-DEV-08", "CC-DEV-04"],
		variants: STD,
	},
	{
		code: "500.12(a)",
		section: "TEC",
		title: "Anmeldung mit mehreren Faktoren für alle",
		text: "Jede Person, die auf Informationssysteme zugreift, meldet sich mit mehreren Faktoren an, unabhängig von Ort, Art des Kontos und Daten. Ausnahmen nur mit gleichwertigen Ersatzmaßnahmen, die der CISO schriftlich freigibt und jährlich prüft.",
		domain: "access",
		controls: ["CC-IAM-03"],
		variants: STD,
		questions: [
			"Welche Zugänge laufen noch ohne zweiten Faktor, und wer hat das schriftlich freigegeben?",
		],
	},
	{
		code: "500.12(b)",
		section: "TEC",
		title: "Mehrere Faktoren bei begrenzter Ausnahme",
		text: "Unternehmen mit begrenzter Ausnahme nutzen mehrere Faktoren mindestens für Fernzugriffe auf eigene Systeme, für Fernzugriffe auf Anwendungen Dritter mit nichtöffentlichen Informationen und für alle privilegierten Konten.",
		domain: "access",
		controls: ["CC-IAM-03", "CC-IAM-07"],
		variants: LIMITED,
	},
	{
		code: "500.13(a)",
		section: "TEC",
		title: "Inventar der Informationssysteme",
		text: "Ein vollständiges, aktuelles Inventar aller Informationssysteme führen, mit Verantwortlichen, Standort, Einstufung, Ende der Herstellerunterstützung und Wiederherstellungszeit; festlegen, wie oft es geprüft wird.",
		domain: "asset",
		controls: ["CC-AST-01", "CC-AST-06"],
		variants: ALL,
		evidence: ["Inventar mit Pflichtangaben je System"],
		related: ["iso27001:A.5.9"],
	},
	{
		code: "500.13(b)",
		section: "TEC",
		title: "Nicht mehr benötigte Daten löschen",
		text: "Nichtöffentliche Informationen, die nicht mehr gebraucht werden, regelmäßig sicher löschen, außer ein Gesetz verlangt die Aufbewahrung oder es ist technisch nicht machbar.",
		domain: "asset",
		controls: ["CC-AST-10", "CC-PHY-05"],
		variants: ALL,
	},
	{
		code: "500.14(a)(1)",
		section: "TEC",
		title: "Aktivität der Nutzenden überwachen",
		text: "Risikobasierte Maßnahmen einsetzen, die die Aktivität befugter Personen überwachen und unbefugten Zugriff auf nichtöffentliche Informationen oder deren Manipulation erkennen.",
		domain: "operations",
		controls: ["CC-LOG-02", "CC-AST-09"],
		variants: STD,
	},
	{
		code: "500.14(a)(2)",
		section: "TEC",
		title: "Schutz vor Schadcode",
		text: "Risikobasierte Maßnahmen gegen Schadcode einsetzen, einschließlich Überwachung und Filterung von Web- und E-Mail-Verkehr.",
		domain: "operations",
		controls: ["CC-OPS-02", "CC-NET-03"],
		variants: ALL,
	},
	{
		code: "500.15",
		section: "TEC",
		title: "Verschlüsselung nichtöffentlicher Informationen",
		text: "Nichtöffentliche Informationen nach Branchenstandard verschlüsseln, bei Übertragung über externe Netze und im gespeicherten Zustand. Ist das im gespeicherten Zustand nicht machbar, genügen Ersatzmaßnahmen mit schriftlicher Freigabe des CISO, jährlich geprüft.",
		domain: "crypto",
		controls: ["CC-CRY-04", "CC-CRY-01", "CC-CRY-05"],
		variants: STD,
		related: ["iso27001:A.8.24"],
	},

	// ── Risikobewertung und Dienstleister ───────────────────────────────────
	{
		code: "500.9(a)",
		section: "RSK",
		title: "Risikobewertung",
		text: "Eine Risikobewertung durchführen und sie mindestens jährlich sowie bei wesentlichen Änderungen in Geschäft oder Technik überprüfen und aktualisieren.",
		domain: "risk",
		controls: ["CC-RSK-02", "CC-RSK-04"],
		variants: ALL,
		questions: [
			"Welche Änderung in Geschäft oder Technik hat zuletzt eine neue Risikobewertung ausgelöst?",
		],
		related: ["iso27001:6.1.2", "iso27001:8.2"],
	},
	{
		code: "500.9(b)",
		section: "RSK",
		title: "Methode der Risikobewertung",
		text: "Die Risikobewertung folgt schriftlichen Verfahren mit Kriterien zur Einstufung von Risiken, zur Bewertung von Vertraulichkeit, Integrität und Verfügbarkeit und zur Entscheidung, wie Risiken gemindert oder akzeptiert werden.",
		domain: "risk",
		controls: ["CC-RSK-01"],
		variants: ALL,
		related: ["iso27001:6.1.2"],
	},
	{
		code: "500.11(a)",
		section: "RSK",
		title: "Richtlinie für Dienstleister",
		text: "Schriftliche Richtlinien für Dienstleister festlegen: Erfassung und Risikobewertung, Mindestanforderungen an ihre Sicherheit, Prüfung vor Vertragsschluss und regelmäßige Bewertung.",
		domain: "supplier",
		controls: ["CC-TPR-02", "CC-TPR-03", "CC-TPR-05"],
		variants: ALL,
		questions: [
			"Wie prüft ihr die Sicherheit eines Dienstleisters vor Vertragsschluss und danach regelmäßig?",
		],
		related: ["iso27001:A.5.19"],
	},
	{
		code: "500.11(b)",
		section: "RSK",
		title: "Vertragliche Anforderungen an Dienstleister",
		text: "Leitlinien festlegen für Zugriffskontrollen mit mehreren Faktoren, Verschlüsselung, Benachrichtigung bei Sicherheitsereignissen, die das Unternehmen betreffen, und Zusicherungen des Dienstleisters zur Sicherheit.",
		domain: "supplier",
		controls: ["CC-TPR-04"],
		variants: ALL,
		related: ["iso27001:A.5.20"],
	},

	// ── Personal und Schulung ───────────────────────────────────────────────
	{
		code: "500.10",
		section: "PPL",
		title: "Qualifiziertes Sicherheitspersonal",
		text: "Genug qualifiziertes Personal einsetzen, eigenes oder von Dienstleistern, um die Cyberrisiken zu steuern; es erhält Schulungen und hält sein Wissen über Bedrohungen aktuell.",
		domain: "hr",
		controls: ["CC-GOV-14", "CC-HR-03", "CC-RSK-05"],
		variants: STD,
	},
	{
		code: "500.14(a)(3)",
		section: "PPL",
		title: "Jährliche Schulung mit Social Engineering",
		text: "Alle Beschäftigten mindestens jährlich zu Cybersicherheit schulen, einschließlich Social Engineering.",
		domain: "hr",
		controls: ["CC-HR-03"],
		variants: ALL,
		evidence: [
			"Teilnahmeliste der Schulung",
			"Schulungsinhalte zu Phishing und Social Engineering",
		],
		related: ["iso27001:A.6.3"],
	},

	// ── Vorfallreaktion und Notfallplanung ──────────────────────────────────
	{
		code: "500.16(a)(1)",
		section: "INC",
		title: "Plan für die Vorfallreaktion",
		text: "Einen schriftlichen Plan führen, mit dem auf wesentliche Sicherheitsereignisse rasch reagiert werden kann, auch auf Ransomware; er regelt Ziele, Abläufe, Rollen, Kommunikation, Behebung, Dokumentation, Ursachenanalyse und Aktualisierung.",
		domain: "incident",
		controls: ["CC-INC-01", "CC-INC-04", "CC-INC-05"],
		variants: STD,
		related: ["iso27001:A.5.24"],
	},
	{
		code: "500.16(a)(2)",
		section: "INC",
		title: "Plan für Geschäftsfortführung und Wiederherstellung",
		text: "Einen schriftlichen Plan führen, der wichtige Daten, Systeme, Personen und Dienstleister benennt, Verantwortliche und Kommunikation festlegt und die rechtzeitige Wiederherstellung kritischer Systeme sicherstellt.",
		domain: "continuity",
		controls: ["CC-BCM-01", "CC-BCM-02"],
		variants: STD,
		related: ["iso27001:A.5.30"],
	},
	{
		code: "500.16(d)",
		section: "INC",
		title: "Pläne jährlich testen",
		text: "Beide Pläne mindestens jährlich mit allen wichtigen Beteiligten testen, einschließlich leitender Personen und der ranghöchsten Führungskraft, und die Wiederherstellung kritischer Daten und Systeme aus Backups prüfen.",
		domain: "continuity",
		controls: ["CC-BCM-05", "CC-BCM-03"],
		variants: STD,
		questions: [
			"Wer aus der Geschäftsleitung war beim letzten Test der Pläne dabei?",
		],
		evidence: ["Protokoll des letzten Tests mit Teilnehmenden"],
	},
	{
		code: "500.16(e)",
		section: "INC",
		title: "Geschützte Backups",
		text: "Backups vorhalten, mit denen sich der wesentliche Betrieb wiederherstellen lässt, und sie vor unbefugter Veränderung oder Vernichtung schützen.",
		domain: "continuity",
		controls: ["CC-BCM-03"],
		variants: STD,
		related: ["iso27001:A.8.13"],
	},

	// ── Meldungen an das DFS ────────────────────────────────────────────────
	{
		code: "500.17(a)",
		section: "NOT",
		title: "Meldung binnen 72 Stunden",
		text: "Dem DFS elektronisch binnen 72 Stunden melden, nachdem feststeht, dass ein meldepflichtiger Cybersicherheitsvorfall im Unternehmen, bei einem verbundenen Unternehmen oder bei einem Dienstleister eingetreten ist; die Angaben danach laufend ergänzen.",
		domain: "incident",
		controls: ["CC-INC-03", "CC-REG-01"],
		variants: ALL,
		questions: [
			"Wer entscheidet, ob ein Ereignis an das DFS gemeldet wird, und wie wird die Frist von 72 Stunden überwacht?",
		],
		evidence: ["Melde-Playbook mit Kriterien", "Eingereichte Meldungen"],
	},
	{
		code: "500.17(b)(1)",
		section: "NOT",
		title: "Jährliche Bescheinigung bis 15. April",
		text: "Jährlich bis zum 15. April elektronisch entweder bescheinigen, dass die Regeln im Vorjahr im Wesentlichen eingehalten wurden, oder die Abweichungen mit Umfang und Zeitplan für die Behebung offenlegen.",
		domain: "compliance",
		controls: ["CC-REG-01", "CC-GOV-13"],
		variants: ALL,
		evidence: ["Eingereichte Bescheinigung", "Belege für die Bescheinigung"],
	},
	{
		code: "500.17(b)(2)",
		section: "NOT",
		title: "Unterschrift und Belege der Bescheinigung",
		text: "Die ranghöchste Führungskraft und der CISO unterschreiben die Bescheinigung; alle Unterlagen, auf die sie sich stützt, werden fünf Jahre aufbewahrt.",
		domain: "compliance",
		controls: ["CC-REG-01", "CC-GOV-03", "CC-GOV-08"],
		variants: ALL,
	},
	{
		code: "500.17(c)",
		section: "NOT",
		title: "Lösegeldzahlung melden",
		text: "Eine Lösegeldzahlung binnen 24 Stunden dem DFS melden und binnen 30 Tagen schriftlich begründen: warum sie nötig war, welche Alternativen geprüft wurden und wie die Sanktionsregeln, etwa des OFAC, eingehalten wurden.",
		domain: "incident",
		controls: ["CC-INC-03", "CC-SAN-01"],
		variants: ALL,
	},
	{
		code: "500.19(e)",
		section: "NOT",
		title: "Ausnahme anzeigen",
		text: "Wer eine Ausnahme nach 500.19 in Anspruch nimmt, zeigt sie dem DFS binnen 30 Tagen nach der Feststellung an.",
		domain: "compliance",
		controls: ["CC-REG-01"],
		variants: LIMITED,
	},

	// ── Zusatzpflichten für Class-A-Unternehmen ─────────────────────────────
	{
		code: "500.2(c)",
		section: "CLA",
		title: "Unabhängiges Audit des Programms",
		text: "Das Cybersicherheitsprogramm auf Grundlage der Risikobewertung unabhängig prüfen lassen.",
		domain: "compliance",
		controls: ["CC-GOV-13", "CC-GOV-06"],
		variants: CLASS_A,
		questions: ["Wer prüft euer Programm unabhängig, und wie oft?"],
	},
	{
		code: "500.7(c)(1)",
		section: "CLA",
		title: "Lösung für privilegierte Zugänge",
		text: "Privilegierte Zugriffe überwachen und eine Lösung für das Management privilegierter Zugänge (PAM) einsetzen.",
		domain: "access",
		controls: ["CC-IAM-04", "CC-LOG-02"],
		variants: CLASS_A,
	},
	{
		code: "500.7(c)(2)",
		section: "CLA",
		title: "Häufige Passwörter sperren",
		text: "Häufig genutzte Passwörter für alle Konten automatisch sperren; ist das nicht machbar, gibt der CISO jährlich schriftlich gleichwertige Ersatzmaßnahmen frei.",
		domain: "access",
		controls: ["CC-IAM-03"],
		variants: CLASS_A,
	},
	{
		code: "500.14(b)(1)",
		section: "CLA",
		title: "Erkennung und Reaktion auf Endgeräten (EDR)",
		text: "Eine Lösung zur Erkennung und Reaktion auf Endgeräten (EDR) einsetzen, die ungewöhnliche Aktivität erkennt, etwa seitliche Bewegungen im Netz.",
		domain: "operations",
		controls: ["CC-LOG-02", "CC-OPS-02"],
		variants: CLASS_A,
	},
	{
		code: "500.14(b)(2)",
		section: "CLA",
		title: "Zentrale Protokollierung und Alarme",
		text: "Eine Lösung einsetzen, die Protokolle zentral sammelt und bei Sicherheitsereignissen alarmiert; Ersatzmaßnahmen nur mit schriftlicher Freigabe des CISO.",
		domain: "operations",
		controls: ["CC-LOG-02", "CC-LOG-03"],
		variants: CLASS_A,
		evidence: ["Übersicht der angebundenen Protokollquellen"],
	},
];

const built = buildIndex("nycrr-500", S);
export const NYCRR_REQUIREMENTS = built.requirements;
export const NYCRR_EDGES = built.edges;
