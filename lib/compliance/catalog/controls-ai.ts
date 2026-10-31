import type { CatalogControl } from "./types";

// Common Controls für KI (ISO/IEC 42001, EU AI Act): nur, was ein ISMS nach
// ISO 27001 nicht schon trägt. Leitung, Rollen, Risiko, Audit, Lieferanten
// bleiben bei den bestehenden Controls. Inhalte nach Modellwissen, gegen
// ISO/IEC 42001:2023 und die Leitlinien zum AI Act prüfen.

let order = 8000;
const next = () => {
	order += 10;
	return order;
};

export const PART_H: CatalogControl[] = [
	{
		code: "CC-AI-01",
		title: "KI-Richtlinie und Verzeichnis der KI-Systeme",
		description:
			"Eine von der Leitung freigegebene KI-Richtlinie legt Ziele, Grundsätze und Grenzen für Entwicklung und Nutzung von KI fest. Alle KI-Systeme (selbst gebaut, eingekauft, als Dienst genutzt) stehen in einem Verzeichnis mit Zweck, Verantwortlichen, Risikoklasse und Lebenszyklus-Stand.",
		implementationGuidance:
			"KI-Systeme unter /assets als eigene Art erfassen (Zweck, Anbieter, Daten, Verantwortliche); die Richtlinie unter /dokumente mit Freigabe durch die Geschäftsleitung führen und jährlich prüfen.",
		domain: "governance",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["KI-Richtlinie mit Freigabe", "Verzeichnis der KI-Systeme"],
		auditQuestions: [
			"Welche KI-Systeme setzt ihr ein, und wer ist für jedes verantwortlich?",
			"Wo legt eure Richtlinie fest, wofür KI nicht genutzt werden darf?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AI-02",
		title: "Folgenabschätzung für KI-Systeme",
		description:
			"Vor dem Einsatz und bei wesentlichen Änderungen wird je KI-System bewertet, welche Folgen es für Einzelne, Gruppen und die Gesellschaft haben kann (Fehler, Diskriminierung, Sicherheit, Grundrechte). Ergebnis, Maßnahmen und Entscheidung sind dokumentiert.",
		implementationGuidance:
			"Folgenabschätzung als verfassten Nachweis je KI-System anlegen; bei hohem Risiko (AI Act Anhang III) mit der Datenschutz-Folgenabschätzung verbinden und durch die Geschäftsleitung freigeben lassen.",
		domain: "risk",
		effort: "M",
		kind: "process",
		evidenceHints: ["Folgenabschätzung je KI-System", "Freigabe"],
		auditQuestions: [
			"Wie bewertet ihr, wem ein KI-System schaden könnte?",
			"Wann wird die Bewertung wiederholt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AI-03",
		title: "Verantwortungsvoller Lebenszyklus von KI-Systemen",
		description:
			"Für jedes KI-System sind Anforderungen, Entwurf, Training, Prüfung (Verifikation und Validierung), Freigabe zur Inbetriebnahme, Betrieb und Außerbetriebnahme beschrieben. Vor der Freigabe wird gegen festgelegte Kriterien geprüft (Genauigkeit, Robustheit, Fairness, Sicherheit).",
		implementationGuidance:
			"Den Ablauf an den sicheren Entwicklungslebenszyklus anhängen; Prüfkriterien und Testergebnisse je Modellfassung als Nachweis ablegen, die Freigabe über Änderungen mit Freigabe führen.",
		domain: "development",
		effort: "L",
		kind: "process",
		evidenceHints: [
			"Anforderungen und Prüfkriterien je KI-System",
			"Prüfbericht vor Freigabe",
			"Technische Dokumentation",
		],
		auditQuestions: [
			"Nach welchen Kriterien gebt ihr ein Modell für den Betrieb frei?",
			"Wie dokumentiert ihr, welche Modellfassung wann im Einsatz war?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AI-04",
		title: "Daten für KI: Herkunft, Qualität und Aufbereitung",
		description:
			"Daten für Training, Prüfung und Betrieb von KI-Systemen sind nach Herkunft, Rechtsgrundlage, Qualität und Repräsentativität beschrieben. Aufbereitung (Bereinigen, Kennzeichnen, Anreichern) ist nachvollziehbar dokumentiert.",
		implementationGuidance:
			"Je Datensatz Herkunft, Lizenz bzw. Rechtsgrundlage, Zeitraum und bekannte Lücken festhalten; mit dem Verarbeitungsverzeichnis verbinden, wenn Personendaten enthalten sind.",
		domain: "asset",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Datenblätter je Datensatz", "Aufbereitungsprotokoll"],
		auditQuestions: [
			"Woher stammen die Trainingsdaten, und dürft ihr sie dafür nutzen?",
			"Wie prüft ihr, ob die Daten die Wirklichkeit gut genug abbilden?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AI-05",
		title: "Transparenz und Informationen zu KI-Systemen",
		description:
			"Nutzende und Betroffene erfahren, dass sie mit KI zu tun haben, wofür das System gedacht ist, wo seine Grenzen liegen und an wen sie sich wenden können. Erzeugte Inhalte sind gekennzeichnet, wo das verlangt ist.",
		implementationGuidance:
			"Hinweise in Oberfläche und Unterlagen aufnehmen, Gebrauchsanweisung für Betreiber bereitstellen, einen Kontakt für Rückfragen und Beschwerden nennen.",
		domain: "conduct",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Hinweistexte",
			"Gebrauchsanweisung",
			"Kontakt für Rückfragen",
		],
		auditQuestions: [
			"Woran erkennt eine Person, dass sie mit KI spricht?",
			"Wo stehen die Grenzen des Systems für Nutzende?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AI-06",
		title: "Menschliche Aufsicht und Überwachung im Betrieb",
		description:
			"KI-Systeme im Betrieb werden überwacht (Leistung, Abweichungen, Vorfälle, Missbrauch). Menschen können Ergebnisse prüfen, übersteuern oder das System anhalten; Protokolle reichen aus, um Entscheidungen nachzuvollziehen.",
		implementationGuidance:
			"Kennzahlen für Leistung und Abweichung festlegen, Schwellen mit Alarm, Ereignisprotokolle aufbewahren; benennen, wer eingreifen darf, und das Eingreifen üben.",
		domain: "operations",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Überwachungs-Kennzahlen",
			"Ereignisprotokolle",
			"Regelung zum Eingreifen",
		],
		auditQuestions: [
			"Woran merkt ihr, dass ein Modell schlechter wird?",
			"Wer darf ein KI-System anhalten, und wie schnell geht das?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
];
