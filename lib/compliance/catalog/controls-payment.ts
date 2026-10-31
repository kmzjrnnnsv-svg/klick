import type { CatalogControl } from "./types";

// Common Controls Kartenzahlungen (PCI DSS v4.0.1): nur, was über ein ISMS
// hinaus für Kontodaten gilt. Netz, Härtung, Schadsoftware, Patches,
// Zugriff, MFA, Protokollierung, Tests, Vorfälle und Schulung tragen die
// bestehenden Controls. Inhalte prüfen gegen PCI DSS v4.0.1.

let order = 7000;
const next = () => {
	order += 10;
	return order;
};

export const PART_G: CatalogControl[] = [
	{
		code: "CC-PCI-01",
		title: "Kartendatenumgebung abgrenzen und Segmentierung",
		description:
			"Die Kartendatenumgebung (CDE) ist mit allen Systemen, Datenflüssen, Speicherorten und Verbindungen zu Dritten abgegrenzt; Segmentierung trennt sie vom übrigen Netz und wird regelmäßig getestet. Der Geltungsbereich wird mindestens jährlich bestätigt.",
		implementationGuidance:
			"Netz- und Datenflussplan in Klick als Nachweis pflegen, Systeme der CDE im Asset-Register kennzeichnen. Scope-Bestätigung jährlich (Dienstleister halbjährlich) als Pflicht im Kalender, Segmentierungstest im Testprogramm.",
		domain: "network",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Netzplan und Datenflussplan der Kartendatenumgebung",
			"Scope-Bestätigung mit Datum",
			"Bericht zum Segmentierungstest",
		],
		auditQuestions: [
			"Welche Systeme speichern, verarbeiten oder übertragen Kontodaten, und wie habt ihr sie vom übrigen Netz getrennt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-02",
		title:
			"Kontodaten minimal speichern, keine sensiblen Authentifizierungsdaten",
		description:
			"Kontodaten werden nur gespeichert, wo es nötig ist, und nach festen Fristen gelöscht; Spurdaten, Kartenprüfnummer und PIN-Daten werden nach der Autorisierung nie gespeichert.",
		implementationGuidance:
			"Aufbewahrungs- und Löschkonzept um Kontodaten ergänzen; vierteljährlich prüfen, ob Daten über der Frist liegen; Zahlungsanbieter so einbinden, dass Klartext-Kartendaten die eigenen Systeme gar nicht erreichen (Tokenisierung, Weiterleitung).",
		domain: "payments",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Aufbewahrungsregel für Kontodaten",
			"Nachweis der Löschläufe",
		],
		auditQuestions: [
			"Wo speichert ihr Kartennummern, und wann löscht ihr sie?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-03",
		title: "Kartennummer unlesbar speichern und maskiert anzeigen",
		description:
			"Die Kartennummer (PAN) ist überall unlesbar gespeichert (Verschlüsselung, Tokenisierung, Kürzung oder Hash mit Schlüssel) und wird nur maskiert angezeigt; vollständig sehen sie nur Personen mit festgelegtem Bedarf.",
		implementationGuidance:
			"Je Speicherort festhalten, welches Verfahren schützt; Masken in Anwendungen und Berichten prüfen; Fernzugriff so einrichten, dass PAN nicht kopiert werden kann.",
		domain: "crypto",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Übersicht der Speicherorte mit Schutzverfahren",
			"Bildschirmfoto der maskierten Anzeige",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-04",
		title: "Schlüsselverwaltung für Kontodaten",
		description:
			"Schlüssel zum Schutz von Kontodaten werden sicher erzeugt, verteilt, gespeichert, nach Kryptoperiode gewechselt und ausgemustert; manuelle Klartext-Operationen laufen mit geteiltem Wissen und Vier-Augen, Verwahrende bestätigen ihre Pflichten.",
		implementationGuidance:
			"Schlüssel im Asset-Register (Art Schlüssel/HSM) mit Zweck, Stärke und Ablauf führen; Wechsel als Aufgabe planen; Bestätigungen der Verwahrenden als Nachweis ablegen.",
		domain: "crypto",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Schlüsselverzeichnis mit Kryptoperioden",
			"Bestätigungen der Schlüsselverwahrenden",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-05",
		title: "Skripte auf Zahlungsseiten überwachen",
		description:
			"Jedes Skript, das im Browser auf einer Zahlungsseite läuft, ist genehmigt, begründet und auf Integrität geprüft; Änderungen an Kopfzeilen und Inhalten der Zahlungsseite werden erkannt und gemeldet.",
		implementationGuidance:
			"Bestand der Skripte mit Begründung führen, Content-Security-Policy und Subresource Integrity nutzen, eine Lösung zur Änderungserkennung (wöchentlich oder nach Risikoanalyse) einsetzen und Alarme in den Vorfallplan aufnehmen.",
		domain: "development",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Bestand der Skripte auf Zahlungsseiten",
			"Alarme der Änderungserkennung",
		],
		auditQuestions: [
			"Welche Skripte laufen auf eurer Zahlungsseite, und wer hat sie genehmigt?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-06",
		title: "Externe Schwachstellenscans durch einen ASV",
		description:
			"Externe Schwachstellenscans laufen mindestens vierteljährlich und nach wesentlichen Änderungen durch einen zugelassenen Scan-Dienstleister (ASV); Funde werden behoben, bis der Scan besteht.",
		implementationGuidance:
			"ASV-Berichte je Quartal als Nachweis hochladen (Gültig-bis drei Monate), Scan-Ergebnisse über den Import in Klick übernehmen, fehlgeschlagene Scans als Abweichung führen.",
		domain: "operations",
		effort: "S",
		kind: "process",
		evidenceHints: ["ASV-Bericht je Quartal"],
		testMethodHint: "vuln_scan",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-07",
		title: "Gezielte Risikoanalysen",
		description:
			"Für jede Anforderung, deren Häufigkeit die Stelle selbst festlegt (z. B. Prüfung nicht gefährdeter Systeme, Protokollauswertung, Geräteprüfung), gibt es eine dokumentierte gezielte Risikoanalyse, die mindestens jährlich geprüft wird.",
		implementationGuidance:
			"Je Anforderung eine kurze Analyse als Rohling in Klick verfassen: Werte, Bedrohungen, Wahrscheinlichkeit, Ergebnis, gewählte Häufigkeit, Begründung; jährliche Prüfung als Pflicht.",
		domain: "risk",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Gezielte Risikoanalysen je Anforderung"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-08",
		title: "Kartenlesegeräte gegen Manipulation schützen",
		description:
			"Alle Geräte, die Kartendaten durch Kontakt mit der Karte erfassen, stehen in einer Liste mit Standort und Seriennummer, werden regelmäßig auf Skimmer und Austausch geprüft, und das Personal kann Manipulation erkennen.",
		implementationGuidance:
			"Terminals im Asset-Register führen, Sichtprüfung als wiederkehrende Aufgabe (Häufigkeit aus der Risikoanalyse), Schulung für Kassenpersonal im Schulungsplan.",
		domain: "physical",
		effort: "S",
		kind: "process",
		evidenceHints: ["Liste der Terminals", "Prüfprotokolle der Terminals"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-09",
		title: "Verantwortungsmatrix mit Dienstleistern",
		description:
			"Für jeden Dienstleister mit Einfluss auf Kontodaten ist festgehalten, welche PCI-DSS-Anforderungen er übernimmt, welche die Stelle selbst erfüllt und welche geteilt sind; sein Compliance-Stand (AOC) wird jährlich geprüft. Dienstleister bestätigen ihren Kund:innen ihre Verantwortung schriftlich.",
		implementationGuidance:
			"Matrix je Dienstleister als Nachweis am Dienstleister ablegen, AOC jährlich mit Gültig-bis hochladen, Klauseln in den Vertrag aufnehmen.",
		domain: "supplier",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Verantwortungsmatrix je Dienstleister",
			"AOC des Dienstleisters",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PCI-10",
		title: "Kartendaten an unerwarteten Orten finden",
		description:
			"Regelmäßig wird nach Kartennummern außerhalb der festgelegten Speicherorte gesucht; Funde werden sicher gelöscht oder in den Geltungsbereich übernommen, die Ursache wird geklärt.",
		implementationGuidance:
			"Suche mit einem Werkzeug zur Datenerkennung über Dateiablagen, Datenbanken und Postfächer; die Upload-Prüfung in Klick (DLP) meldet Kartennummern in hochgeladenen Dateien. Funde als Vorfall nach 12.10.7 behandeln.",
		domain: "payments",
		effort: "S",
		kind: "technical",
		evidenceHints: ["Ergebnis der Kartendaten-Suche"],
		testMethodHint: "automated",
		sortOrder: next(),
	},
];
