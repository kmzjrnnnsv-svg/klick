import type { Domain } from "@/db/schema/enums";
import type { CatalogRequirement, CatalogSection } from "./types";

// PCI DSS v4.0.1 (Juni 2024): alle definierten Anforderungen der Abschnitte
// 1 bis 12 und der Anhänge A1 (Multi-Tenant-Dienstleister) und A2 (SSL/
// frühes TLS an POI-Terminals). Die früher „zukünftig gültigen“
// Anforderungen gelten seit 31.03.2025. Anhang A3 (DESV) gilt nur für
// Stellen, die eine Kartenorganisation benennt, und ist nicht enthalten.
// Eigene Formulierung nach Kapitelbezug, nicht der Wortlaut des PCI SSC;
// vor einer Prüfung gegen die aktuelle Fassung prüfen. Anwendbarkeit je
// SAQ-Typ über Varianten (pci-saq.ts), nur für Dienstleister: SP.

type Row = [
	code: string,
	title: string,
	text: string,
	extra?: Partial<
		Omit<CatalogRequirement, "code" | "title" | "requirementText">
	> & {
		sp?: true;
	},
];

export const PCI_SECTIONS: CatalogSection[] = [
	{ code: "1", title: "Netzwerksicherheitskontrollen", sortOrder: 10 },
	{ code: "2", title: "Sichere Konfiguration", sortOrder: 20 },
	{ code: "3", title: "Gespeicherte Kontodaten schützen", sortOrder: 30 },
	{
		code: "4",
		title: "Kartendaten bei der Übertragung schützen",
		sortOrder: 40,
	},
	{ code: "5", title: "Schutz vor Schadsoftware", sortOrder: 50 },
	{ code: "6", title: "Sichere Systeme und Software", sortOrder: 60 },
	{ code: "7", title: "Zugriff nach Need-to-know", sortOrder: 70 },
	{ code: "8", title: "Identifizierung und Authentisierung", sortOrder: 80 },
	{ code: "9", title: "Physischer Zugang zu Kartendaten", sortOrder: 90 },
	{ code: "10", title: "Protokollierung und Überwachung", sortOrder: 100 },
	{ code: "11", title: "Sicherheit regelmäßig testen", sortOrder: 110 },
	{ code: "12", title: "Richtlinien und Programme", sortOrder: 120 },
	{ code: "A1", title: "Multi-Tenant-Dienstleister", sortOrder: 130 },
	{ code: "A2", title: "SSL und frühes TLS an POI-Terminals", sortOrder: 140 },
];

// Je Abschnitt N die beiden Grundanforderungen N.1.1 (Richtlinien und
// Verfahren) und N.1.2 (Rollen und Verantwortung)
const basics = (n: string, topic: string): Row[] => [
	[
		`${n}.1.1`,
		`Richtlinien und Verfahren: ${topic}`,
		`Die Sicherheitsrichtlinien und Verfahren zu ${topic} sind dokumentiert, aktuell, in Gebrauch und allen Beteiligten bekannt.`,
		{ evidenceHints: ["Richtlinie mit Freigabe und Prüfdatum"] },
	],
	[
		`${n}.1.2`,
		`Rollen und Verantwortung: ${topic}`,
		`Rollen und Verantwortlichkeiten für ${topic} sind dokumentiert, zugewiesen und den Personen bekannt.`,
		{ evidenceHints: ["Rollenbeschreibung oder Verantwortungsmatrix"] },
	],
];

const R1: Row[] = [
	...basics("1", "Netzwerksicherheitskontrollen"),
	[
		"1.2.1",
		"Konfigurationsstandards für Netzwerksicherheitskontrollen",
		"Für Firewalls und andere Netzwerksicherheitskontrollen gibt es Konfigurationsstandards, die festgelegt, umgesetzt und gepflegt werden.",
	],
	[
		"1.2.2",
		"Änderungen an der Netzkonfiguration",
		"Jede Änderung an Netzwerkverbindungen und an der Konfiguration der Netzwerksicherheitskontrollen läuft über das Änderungsverfahren (Anforderung 6.5.1).",
	],
	[
		"1.2.3",
		"Netzplan",
		"Ein aktueller Netzplan zeigt alle Verbindungen zwischen der Kartendatenumgebung und anderen Netzen, auch drahtlose.",
		{ evidenceHints: ["Netzplan mit Stand"] },
	],
	[
		"1.2.4",
		"Datenflussplan",
		"Ein aktueller Datenflussplan zeigt alle Flüsse von Kontodaten über Systeme und Netze und wird bei Änderungen nachgeführt.",
		{ evidenceHints: ["Datenflussplan"] },
	],
	[
		"1.2.5",
		"Erlaubte Dienste, Protokolle und Ports",
		"Alle erlaubten Dienste, Protokolle und Ports sind erfasst, genehmigt und haben einen festgelegten geschäftlichen Bedarf.",
	],
	[
		"1.2.6",
		"Unsichere Dienste absichern",
		"Für genutzte Dienste, Protokolle und Ports, die als unsicher gelten, sind Sicherheitsmerkmale festgelegt und umgesetzt.",
	],
	[
		"1.2.7",
		"Halbjährliche Prüfung der Regeln",
		"Die Konfiguration der Netzwerksicherheitskontrollen wird mindestens alle sechs Monate auf Bedarf und Wirksamkeit geprüft.",
		{
			auditQuestions: [
				"Wann habt ihr die Firewall-Regeln zuletzt geprüft, und was ist dabei entfallen?",
			],
		},
	],
	[
		"1.2.8",
		"Konfigurationsdateien geschützt",
		"Konfigurationsdateien der Netzwerksicherheitskontrollen sind vor unbefugtem Zugriff geschützt und stimmen mit der aktiven Konfiguration überein.",
	],
	[
		"1.3.1",
		"Eingehender Verkehr in die Kartendatenumgebung",
		"Eingehender Verkehr in die Kartendatenumgebung ist auf das Nötige beschränkt, alles andere ist ausdrücklich gesperrt.",
	],
	[
		"1.3.2",
		"Ausgehender Verkehr aus der Kartendatenumgebung",
		"Ausgehender Verkehr aus der Kartendatenumgebung ist auf das Nötige beschränkt, alles andere ist ausdrücklich gesperrt.",
	],
	[
		"1.3.3",
		"Funknetze und Kartendatenumgebung",
		"Zwischen allen Funknetzen und der Kartendatenumgebung stehen Netzwerksicherheitskontrollen; standardmäßig ist jeder Verkehr gesperrt.",
	],
	[
		"1.4.1",
		"Trennung vertrauenswürdiger und nicht vertrauenswürdiger Netze",
		"Zwischen vertrauenswürdigen und nicht vertrauenswürdigen Netzen sind Netzwerksicherheitskontrollen eingerichtet.",
	],
	[
		"1.4.2",
		"Eingehender Verkehr aus nicht vertrauenswürdigen Netzen",
		"Eingehender Verkehr aus nicht vertrauenswürdigen Netzen ist auf öffentlich erreichbare, freigegebene Dienste und Antworten auf ausgehenden Verkehr beschränkt.",
	],
	[
		"1.4.3",
		"Schutz vor gefälschten Absenderadressen",
		"Gegen gefälschte Quell-IP-Adressen (Spoofing) sind Maßnahmen umgesetzt.",
	],
	[
		"1.4.4",
		"Keine direkte Erreichbarkeit von Kartendaten",
		"Systeme, die Kartendaten speichern, sind aus nicht vertrauenswürdigen Netzen nicht direkt erreichbar.",
	],
	[
		"1.4.5",
		"Interne Adressen verbergen",
		"Interne IP-Adressen und Routing-Informationen werden nur an berechtigte Stellen weitergegeben.",
	],
	[
		"1.5.1",
		"Geräte mit Verbindung in beide Welten",
		"Geräte, die sich sowohl mit nicht vertrauenswürdigen Netzen als auch mit der Kartendatenumgebung verbinden (z. B. Laptops), sind mit Sicherheitskontrollen versehen, die Nutzende nicht abschalten können.",
	],
];

const R2: Row[] = [
	...basics("2", "sichere Konfiguration"),
	[
		"2.2.1",
		"Konfigurationsstandards für Systeme",
		"Für alle Systemkomponenten gibt es Konfigurationsstandards, die bekannte Schwachstellen adressieren, anerkannten Härtungsvorgaben folgen und bei neuen Bedrohungen aktualisiert werden.",
		{ evidenceHints: ["Härtungsstandard je Systemart"] },
	],
	[
		"2.2.2",
		"Standardkonten der Hersteller",
		"Standardkonten der Hersteller werden entfernt oder deaktiviert bzw. bekommen vor der Nutzung ein neues Passwort.",
	],
	[
		"2.2.3",
		"Primärfunktionen mit unterschiedlichem Schutzbedarf",
		"Funktionen mit unterschiedlichem Sicherheitsniveau laufen getrennt oder sind so abgesichert, dass sie sich nicht gegenseitig gefährden.",
	],
	[
		"2.2.4",
		"Nur nötige Dienste",
		"Nur die nötigen Dienste, Protokolle, Module und Funktionen sind aktiv; nicht benötigte sind entfernt oder deaktiviert.",
	],
	[
		"2.2.5",
		"Unsichere Dienste begründet",
		"Sind unsichere Dienste oder Protokolle aktiv, ist der Bedarf dokumentiert und zusätzliche Sicherheitsmerkmale sind umgesetzt.",
	],
	[
		"2.2.6",
		"Sicherheitsparameter",
		"Sicherheitsparameter der Systeme sind so eingestellt, dass Missbrauch verhindert wird.",
	],
	[
		"2.2.7",
		"Verschlüsselter administrativer Zugang",
		"Administrativer Zugang, der nicht über die Konsole erfolgt, ist mit starker Kryptografie verschlüsselt.",
	],
	[
		"2.3.1",
		"Standardwerte bei Funknetzen",
		"Bei Funknetzen, die mit der Kartendatenumgebung verbunden sind oder Kontodaten übertragen, sind alle Standardwerte der Hersteller geändert oder bestätigt sicher.",
	],
	[
		"2.3.2",
		"Funkschlüssel beim Personalwechsel",
		"Schlüssel für Funknetze werden geändert, wenn Personen mit Kenntnis des Schlüssels ausscheiden oder ein Verdacht auf Kompromittierung besteht.",
	],
];

const R3: Row[] = [
	...basics("3", "den Schutz gespeicherter Kontodaten"),
	[
		"3.2.1",
		"Kontodaten minimal speichern",
		"Kontodaten werden nur so viel und so lange gespeichert, wie Recht, Vertrag oder Geschäft es verlangen; ein Aufbewahrungs- und Löschkonzept regelt das, auch für sensible Authentifizierungsdaten bis zur Autorisierung.",
		{ evidenceHints: ["Aufbewahrungs- und Löschkonzept für Kontodaten"] },
	],
	[
		"3.3.1",
		"Keine sensiblen Authentifizierungsdaten nach der Autorisierung",
		"Sensible Authentifizierungsdaten werden nach der Autorisierung nicht gespeichert, auch nicht verschlüsselt; sie sind nach Abschluss unwiederbringlich gelöscht.",
	],
	[
		"3.3.1.1",
		"Keine Spurdaten",
		"Der vollständige Inhalt einer Magnetspur bzw. des Chips wird nach der Autorisierung nicht gespeichert.",
	],
	[
		"3.3.1.2",
		"Keine Kartenprüfnummer",
		"Die Kartenprüfnummer (CVV, CVC) wird nach der Autorisierung nicht gespeichert.",
	],
	[
		"3.3.1.3",
		"Keine PIN-Daten",
		"PIN und PIN-Block werden nach der Autorisierung nicht gespeichert.",
	],
	[
		"3.3.2",
		"Sensible Daten vor der Autorisierung verschlüsselt",
		"Werden sensible Authentifizierungsdaten bis zur Autorisierung elektronisch gespeichert, sind sie mit starker Kryptografie verschlüsselt.",
	],
	[
		"3.3.3",
		"Sensible Daten bei Kartenausgebern",
		"Kartenausgeber und ihre Dienstleister speichern sensible Authentifizierungsdaten nur mit legitimem Bedarf, so kurz wie möglich und verschlüsselt.",
	],
	[
		"3.4.1",
		"PAN maskiert anzeigen",
		"Die Kartennummer (PAN) wird maskiert angezeigt (höchstens die ersten sechs und letzten vier Stellen); vollständig sehen sie nur Personen mit festgelegtem Bedarf.",
	],
	[
		"3.4.2",
		"Kein Kopieren bei Fernzugriff",
		"Über Fernzugriffstechniken lässt sich die PAN nicht kopieren oder verschieben, außer mit dokumentierter, ausdrücklicher Berechtigung.",
	],
	[
		"3.5.1",
		"PAN unlesbar gespeichert",
		"Die PAN ist überall, wo sie gespeichert wird, unlesbar: verschlüsselt, gekürzt, tokenisiert oder als kryptografischer Hash mit Schlüssel.",
	],
	[
		"3.5.1.1",
		"Hashes mit Schlüssel",
		"Hashes der PAN sind kryptografische Hashes der ganzen PAN mit Schlüssel und zugehöriger Schlüsselverwaltung.",
	],
	[
		"3.5.1.2",
		"Festplattenverschlüsselung nur für Wechselmedien",
		"Festplatten- oder Partitionsverschlüsselung allein genügt nur auf Wechselmedien; sonst kommt ein weiterer Mechanismus nach 3.5.1 hinzu.",
	],
	[
		"3.5.1.3",
		"Verwaltung der Festplattenverschlüsselung",
		"Bei Festplattenverschlüsselung ist der logische Zugang unabhängig von der Anmeldung am Betriebssystem, und Entschlüsselungsschlüssel sind nicht an Benutzerkonten gebunden.",
	],
	[
		"3.6.1",
		"Schlüssel zum Schutz von Kontodaten geschützt",
		"Verfahren schützen die Schlüssel für Kontodaten vor Offenlegung und Missbrauch: wenige Verwahrende, Schlüssel verschlüsselnde Schlüssel mindestens gleich stark, getrennt aufbewahrt.",
	],
	[
		"3.6.1.1",
		"Kryptografische Architektur beschrieben",
		"Dienstleister beschreiben ihre kryptografische Architektur: Algorithmen, Protokolle, Schlüssel mit Stärke und Ablauf, Zweck und eingesetzte HSM.",
		{ sp: true },
	],
	[
		"3.6.1.2",
		"Geheime Schlüssel in sicherer Form",
		"Geheime und private Schlüssel werden nur verschlüsselt mit einem mindestens gleich starken Schlüssel, in einem sicheren Gerät (HSM, POI) oder als geteilte Komponenten gespeichert.",
	],
	[
		"3.6.1.3",
		"Zugriff auf Klartext-Schlüsselteile",
		"Zugriff auf Schlüsselkomponenten im Klartext haben nur die wenigsten nötigen Verwahrenden.",
	],
	[
		"3.6.1.4",
		"Wenige Speicherorte",
		"Schlüssel liegen an möglichst wenigen Orten.",
	],
	[
		"3.7.1",
		"Schlüsselerzeugung",
		"Verfahren zur Erzeugung starker Schlüssel für Kontodaten sind umgesetzt.",
	],
	["3.7.2", "Schlüsselverteilung", "Schlüssel werden sicher verteilt."],
	["3.7.3", "Schlüsselspeicherung", "Schlüssel werden sicher gespeichert."],
	[
		"3.7.4",
		"Schlüsselwechsel nach Kryptoperiode",
		"Schlüssel werden am Ende ihrer festgelegten Kryptoperiode gewechselt.",
	],
	[
		"3.7.5",
		"Schlüssel außer Dienst stellen",
		"Schlüssel werden ausgemustert, ersetzt oder vernichtet, wenn ihre Integrität geschwächt ist, sie kompromittiert sein könnten oder ihre Zeit abgelaufen ist.",
	],
	[
		"3.7.6",
		"Geteiltes Wissen und Vier-Augen",
		"Manuelle Klartext-Operationen mit Schlüsseln laufen mit geteiltem Wissen und doppelter Kontrolle.",
	],
	[
		"3.7.7",
		"Kein unbefugter Schlüsseltausch",
		"Schlüssel lassen sich nicht unbefugt austauschen.",
	],
	[
		"3.7.8",
		"Bestätigung der Verwahrenden",
		"Schlüsselverwahrende bestätigen schriftlich oder elektronisch, dass sie ihre Pflichten kennen und annehmen.",
	],
	[
		"3.7.9",
		"Schlüsselweitergabe an Kund:innen",
		"Dienstleister, die Schlüssel mit Kund:innen teilen, geben Anleitung zur sicheren Übertragung, Speicherung und Aktualisierung.",
		{ sp: true },
	],
];

const R4: Row[] = [
	...basics("4", "die Übertragung von Kartendaten"),
	[
		"4.2.1",
		"Starke Kryptografie bei der Übertragung",
		"Bei der Übertragung der PAN über offene, öffentliche Netze schützen starke Kryptografie und sichere Protokolle; nur gültige, nicht abgelaufene Zertifikate werden akzeptiert.",
	],
	[
		"4.2.1.1",
		"Bestand vertrauenswürdiger Schlüssel und Zertifikate",
		"Ein Bestand der vertrauenswürdigen Schlüssel und Zertifikate für die Übertragung der PAN wird geführt.",
	],
	[
		"4.2.1.2",
		"Funknetze mit Kartendaten",
		"Funknetze, die PAN übertragen oder mit der Kartendatenumgebung verbunden sind, nutzen anerkannte Verfahren für starke Authentisierung und Verschlüsselung.",
	],
	[
		"4.2.2",
		"PAN in Nachrichten",
		"Wird die PAN über Nachrichtendienste für Endnutzer:innen (E-Mail, Chat) gesendet, ist sie mit starker Kryptografie geschützt.",
	],
];

const R5: Row[] = [
	...basics("5", "den Schutz vor Schadsoftware"),
	[
		"5.2.1",
		"Schutzsoftware eingesetzt",
		"Auf allen Systemkomponenten läuft eine Lösung gegen Schadsoftware, außer auf Systemen, die nachweislich nicht gefährdet sind.",
	],
	[
		"5.2.2",
		"Erkennen, entfernen, blockieren",
		"Die Lösung erkennt alle bekannten Arten von Schadsoftware und entfernt, blockiert oder isoliert sie.",
	],
	[
		"5.2.3",
		"Nicht gefährdete Systeme prüfen",
		"Systeme ohne Schutzsoftware werden regelmäßig darauf geprüft, ob sie weiterhin nicht gefährdet sind.",
	],
	[
		"5.2.3.1",
		"Häufigkeit dieser Prüfung",
		"Wie oft nicht gefährdete Systeme geprüft werden, legt eine gezielte Risikoanalyse fest.",
	],
	[
		"5.3.1",
		"Schutzsoftware aktuell",
		"Die Schutzsoftware wird automatisch aktuell gehalten.",
	],
	[
		"5.3.2",
		"Regelmäßige oder laufende Prüfung",
		"Die Schutzsoftware prüft regelmäßig oder laufend bzw. analysiert das Verhalten von Systemen und Prozessen.",
	],
	[
		"5.3.2.1",
		"Häufigkeit regelmäßiger Prüfungen",
		"Bei regelmäßigen Prüfungen legt eine gezielte Risikoanalyse die Häufigkeit fest.",
	],
	[
		"5.3.3",
		"Wechselmedien prüfen",
		"Wechselmedien werden beim Einstecken oder Öffnen automatisch geprüft bzw. ihr Verhalten laufend analysiert.",
	],
	[
		"5.3.4",
		"Protokolle der Schutzsoftware",
		"Die Protokollierung der Schutzsoftware ist aktiv, und die Protokolle werden nach Anforderung 10.5.1 aufbewahrt.",
	],
	[
		"5.3.5",
		"Nicht abschaltbar",
		"Nutzende können die Schutzsoftware nicht abschalten oder ändern, außer mit befristeter, dokumentierter Genehmigung der Leitung.",
	],
	[
		"5.4.1",
		"Schutz vor Phishing",
		"Verfahren und technische Mechanismen erkennen Phishing-Angriffe und schützen das Personal davor.",
	],
];

const R6: Row[] = [
	...basics("6", "sichere Systeme und Software"),
	[
		"6.2.1",
		"Sichere Entwicklung",
		"Eigene und individuell entwickelte Software wird nach anerkannten Vorgaben für sichere Entwicklung erstellt, mit PCI-DSS-Anforderungen und Sicherheit in jeder Phase.",
	],
	[
		"6.2.2",
		"Schulung der Entwickler:innen",
		"Entwickler:innen werden mindestens jährlich zu sicherer Entwicklung und Werkzeugen geschult.",
	],
	[
		"6.2.3",
		"Code-Prüfung vor Freigabe",
		"Eigener Code wird vor der Freigabe auf Schwachstellen geprüft; Änderungen werden geprüft, bevor sie in Produktion gehen.",
	],
	[
		"6.2.3.1",
		"Manuelle Code-Prüfung",
		"Manuelle Code-Prüfungen erfolgen durch kundige, nicht beteiligte Personen und werden vor der Freigabe von der Leitung genehmigt.",
	],
	[
		"6.2.4",
		"Schutz vor üblichen Angriffen",
		"Entwicklungstechniken verhindern oder mildern übliche Angriffe wie Injection, Angriffe auf Daten und Datenstrukturen, auf Kryptografie, Geschäftslogik und Zugriffskontrollen.",
	],
	[
		"6.3.1",
		"Schwachstellen erkennen und einstufen",
		"Neue Schwachstellen werden aus anerkannten Quellen erkannt und nach Risiko eingestuft, mindestens als hoch oder kritisch.",
	],
	[
		"6.3.2",
		"Bestand eigener Software und Komponenten",
		"Ein Bestand eigener Software und eingesetzter Fremdkomponenten wird geführt, um Schwachstellen und Patches zuordnen zu können.",
		{ evidenceHints: ["Softwarebestand bzw. SBOM"] },
	],
	[
		"6.3.3",
		"Patches einspielen",
		"Systeme sind durch Sicherheitspatches geschützt; kritische Patches werden binnen eines Monats nach Veröffentlichung eingespielt.",
	],
	[
		"6.4.1",
		"Öffentliche Webanwendungen prüfen",
		"Öffentlich erreichbare Webanwendungen werden regelmäßig auf Schwachstellen geprüft oder durch eine automatische Lösung geschützt (abgelöst durch 6.4.2).",
	],
	[
		"6.4.2",
		"Automatischer Schutz für Webanwendungen",
		"Vor öffentlich erreichbaren Webanwendungen steht eine automatische Lösung (z. B. WAF), die Angriffe laufend erkennt und abwehrt.",
	],
	[
		"6.4.3",
		"Skripte auf Zahlungsseiten",
		"Jedes Skript auf einer Zahlungsseite im Browser ist genehmigt, auf Integrität geprüft und mit Begründung in einem Bestand erfasst.",
	],
	[
		"6.5.1",
		"Änderungsverfahren",
		"Änderungen an Systemen in Produktion folgen einem Verfahren mit Begründung, Auswirkung, Genehmigung, Test und Rückweg.",
	],
	[
		"6.5.2",
		"Nach wesentlichen Änderungen",
		"Nach einer wesentlichen Änderung wird bestätigt, dass alle betroffenen PCI-DSS-Anforderungen weiter erfüllt sind.",
	],
	[
		"6.5.3",
		"Vorproduktion getrennt",
		"Vorproduktionsumgebungen sind von der Produktion getrennt, und die Trennung ist mit Zugriffskontrollen durchgesetzt.",
	],
	[
		"6.5.4",
		"Rollen getrennt",
		"Rollen und Funktionen zwischen Produktion und Vorproduktion sind getrennt, sodass nur geprüfte, genehmigte Änderungen in Produktion gelangen.",
	],
	[
		"6.5.5",
		"Keine echten PAN in Tests",
		"Echte Kartennummern werden in Vorproduktionsumgebungen nicht verwendet, außer diese erfüllen alle PCI-DSS-Anforderungen.",
	],
	[
		"6.5.6",
		"Testdaten vor Produktion entfernt",
		"Testdaten und Testkonten werden entfernt, bevor ein System in Produktion geht.",
	],
];

const R7: Row[] = [
	...basics("7", "die Zugriffssteuerung"),
	[
		"7.2.1",
		"Zugriffskonzept",
		"Ein Zugriffskonzept legt fest, wer worauf zugreifen darf: nach Funktion, mit den geringsten nötigen Rechten.",
	],
	[
		"7.2.2",
		"Rechte nach Aufgabe",
		"Rechte, auch privilegierte, werden nach Aufgabe und Funktion mit den geringsten nötigen Rechten vergeben.",
	],
	[
		"7.2.3",
		"Rechte genehmigt",
		"Erforderliche Rechte werden von befugten Personen genehmigt.",
	],
	[
		"7.2.4",
		"Halbjährliche Prüfung der Konten",
		"Alle Benutzerkonten und ihre Rechte werden mindestens alle sechs Monate geprüft; Unpassendes wird behoben, die Leitung bestätigt das Ergebnis.",
	],
	[
		"7.2.5",
		"Rechte von System- und Anwendungskonten",
		"System- und Anwendungskonten haben nur die nötigen Rechte und nur Zugriff auf die Systeme, die sie brauchen.",
	],
	[
		"7.2.5.1",
		"Prüfung der System- und Anwendungskonten",
		"Rechte von System- und Anwendungskonten werden regelmäßig geprüft; die Häufigkeit legt eine gezielte Risikoanalyse fest.",
	],
	[
		"7.2.6",
		"Abfragen auf gespeicherte Kartendaten",
		"Direkte Abfragen auf Speicher mit Kartendaten sind auf Anwendungen und wenige Administrator:innen beschränkt.",
	],
	[
		"7.3.1",
		"Zugriffssystem",
		"Ein Zugriffssystem beschränkt den Zugriff nach Bedarf und deckt alle Systemkomponenten ab.",
	],
	[
		"7.3.2",
		"Rechte durchgesetzt",
		"Das Zugriffssystem setzt die nach Funktion vergebenen Rechte für Personen, Anwendungen und Systeme durch.",
	],
	[
		"7.3.3",
		"Standardmäßig gesperrt",
		"Das Zugriffssystem sperrt standardmäßig alles, was nicht ausdrücklich erlaubt ist.",
	],
];

const R8: Row[] = [
	...basics("8", "Identifizierung und Authentisierung"),
	[
		"8.2.1",
		"Eindeutige Kennung",
		"Jede Person bekommt eine eindeutige Kennung, bevor sie auf Systeme oder Kartendaten zugreift.",
	],
	[
		"8.2.2",
		"Gemeinsame Konten nur ausnahmsweise",
		"Gruppen-, geteilte und allgemeine Konten werden nur in begründeten Ausnahmen, befristet und mit Zuordnung jeder Handlung zu einer Person genutzt.",
	],
	[
		"8.2.3",
		"Fernzugriff von Dienstleistern beim Kunden",
		"Dienstleister mit Fernzugriff auf Umgebungen ihrer Kund:innen nutzen je Kund:in eigene Authentisierungsmerkmale.",
		{ sp: true },
	],
	[
		"8.2.4",
		"Konten genehmigt anlegen und ändern",
		"Anlegen, Löschen und Ändern von Kennungen und Merkmalen ist genehmigt und mit den dokumentierten Rechten umgesetzt.",
	],
	[
		"8.2.5",
		"Zugang beim Austritt sofort entzogen",
		"Der Zugang ausgeschiedener Personen wird sofort entzogen.",
	],
	[
		"8.2.6",
		"Inaktive Konten",
		"Konten, die 90 Tage nicht genutzt wurden, werden entfernt oder deaktiviert.",
	],
	[
		"8.2.7",
		"Konten für Fernzugriff Dritter",
		"Konten Dritter für Fernzugriff sind nur bei Bedarf freigeschaltet, sonst gesperrt, und ihre Nutzung wird überwacht.",
	],
	[
		"8.2.8",
		"Sitzung nach 15 Minuten",
		"Nach höchstens 15 Minuten Untätigkeit muss sich die Person erneut anmelden.",
	],
	[
		"8.3.1",
		"Mindestens ein Faktor",
		"Jeder Zugang ist mit mindestens einem Faktor gesichert (Wissen, Besitz oder Merkmal).",
	],
	[
		"8.3.2",
		"Faktoren unlesbar",
		"Authentisierungsmerkmale sind bei Übertragung und Speicherung mit starker Kryptografie unlesbar.",
	],
	[
		"8.3.3",
		"Identität vor Änderung prüfen",
		"Vor dem Ändern eines Merkmals wird die Identität der Person geprüft.",
	],
	[
		"8.3.4",
		"Fehlversuche begrenzt",
		"Nach höchstens zehn Fehlversuchen wird die Kennung für mindestens 30 Minuten oder bis zur Prüfung der Identität gesperrt.",
	],
	[
		"8.3.5",
		"Erstpasswörter",
		"Erst- und Rücksetzpasswörter sind je Person eindeutig und müssen bei der ersten Nutzung geändert werden.",
	],
	[
		"8.3.6",
		"Passwortlänge",
		"Passwörter haben mindestens zwölf Zeichen (oder acht, wenn das System nicht mehr kann) und enthalten Buchstaben und Ziffern.",
	],
	[
		"8.3.7",
		"Keine Wiederverwendung",
		"Ein neues Passwort darf keinem der letzten vier entsprechen.",
	],
	[
		"8.3.8",
		"Regeln zur Authentisierung bekannt",
		"Regeln und Verfahren zur Authentisierung sind dokumentiert und allen Nutzenden bekannt.",
	],
	[
		"8.3.9",
		"Passwort als einziger Faktor",
		"Ist ein Passwort der einzige Faktor, wird es mindestens alle 90 Tage geändert oder der Zugriff wird laufend anhand des Sicherheitsstatus bewertet.",
	],
	[
		"8.3.10",
		"Hinweise für Kund:innen zu Passwörtern",
		"Dienstleister geben ihren Kund:innen Hinweise zum Wechsel von Passwörtern, wenn diese der einzige Faktor sind.",
		{ sp: true },
	],
	[
		"8.3.10.1",
		"Passwortwechsel bei Kund:innen",
		"Dienstleister setzen für Kundenkonten mit Passwort als einzigem Faktor einen Wechsel alle 90 Tage oder eine laufende Bewertung durch.",
		{ sp: true },
	],
	[
		"8.3.11",
		"Tokens und Karten personengebunden",
		"Physische oder logische Faktoren (Token, Smartcard, Zertifikat) sind einer Person zugeordnet und nicht übertragbar.",
	],
	[
		"8.4.1",
		"MFA für administrativen Zugang",
		"Administrativer Zugang zur Kartendatenumgebung, der nicht über die Konsole erfolgt, verlangt Multi-Faktor-Authentisierung.",
	],
	[
		"8.4.2",
		"MFA für jeden Zugang zur Kartendatenumgebung",
		"Jeder Zugang zur Kartendatenumgebung verlangt Multi-Faktor-Authentisierung.",
	],
	[
		"8.4.3",
		"MFA für Fernzugriff",
		"Jeder Fernzugriff von außen in das Netz der Stelle verlangt Multi-Faktor-Authentisierung.",
	],
	[
		"8.5.1",
		"MFA richtig eingerichtet",
		"Die Multi-Faktor-Authentisierung ist gegen Wiederholung geschützt, nicht umgehbar, nutzt mindestens zwei verschiedene Faktorarten und gewährt Zugang erst, wenn alle Faktoren erfolgreich sind.",
	],
	[
		"8.6.1",
		"Interaktive Anmeldung mit Systemkonten",
		"Kann ein System- oder Anwendungskonto interaktiv genutzt werden, ist das auf Ausnahmen beschränkt, befristet, genehmigt und einer Person zugeordnet.",
	],
	[
		"8.6.2",
		"Keine fest eingebauten Passwörter",
		"Passwörter von System- und Anwendungskonten stehen nicht im Klartext in Skripten, Konfigurationsdateien oder Quellcode.",
	],
	[
		"8.6.3",
		"Passwörter von Systemkonten geschützt",
		"Passwörter von System- und Anwendungskonten sind gegen Missbrauch geschützt und werden nach einer gezielten Risikoanalyse regelmäßig und bei Verdacht gewechselt.",
	],
];

const R9: Row[] = [
	...basics("9", "den physischen Zugang"),
	[
		"9.2.1",
		"Zutrittskontrolle",
		"Der Zutritt zu Räumen mit Systemen der Kartendatenumgebung ist mit geeigneten Kontrollen beschränkt.",
	],
	[
		"9.2.1.1",
		"Zutritt überwacht",
		"Zutritte zu sensiblen Bereichen werden mit Kameras oder Zutrittssystemen überwacht, die Daten mindestens drei Monate aufbewahrt.",
	],
	[
		"9.2.2",
		"Netzwerkanschlüsse gesichert",
		"Öffentlich zugängliche Netzwerkanschlüsse sind gegen unbefugte Nutzung gesichert.",
	],
	[
		"9.2.3",
		"Netzwerkgeräte physisch geschützt",
		"Zugangspunkte für Funknetze, Netzwerkgeräte und Leitungen sind physisch geschützt.",
	],
	[
		"9.2.4",
		"Konsolen in sensiblen Bereichen",
		"Konsolen in sensiblen Bereichen sind gesperrt, wenn sie nicht genutzt werden.",
	],
	[
		"9.3.1",
		"Zutritt für Personal",
		"Verfahren regeln, wie Personal Zutritt bekommt, erkennbar ist, und wie Zutrittsrechte geändert und entzogen werden.",
	],
	[
		"9.3.1.1",
		"Zutritt zu sensiblen Bereichen",
		"Zutritt zu sensiblen Bereichen haben nur Personen mit Bedarf; er wird beim Ausscheiden sofort entzogen.",
	],
	[
		"9.3.2",
		"Besucher:innen genehmigt",
		"Besucher:innen werden vor dem Zutritt genehmigt, begleitet, gekennzeichnet und mit befristeten Ausweisen versehen.",
	],
	[
		"9.3.3",
		"Besucherausweise zurückgeben",
		"Besucherausweise werden beim Verlassen zurückgegeben oder ungültig gemacht.",
	],
	[
		"9.3.4",
		"Besucherbuch",
		"Ein Besucherbuch erfasst Name, Organisation, Begleitperson und Zeit und wird mindestens drei Monate aufbewahrt.",
	],
	[
		"9.4.1",
		"Medien mit Kartendaten gesichert",
		"Alle Medien mit Kartendaten sind physisch gesichert.",
	],
	[
		"9.4.1.1",
		"Sicherungen an sicherem Ort",
		"Offline-Sicherungen mit Kartendaten liegen an einem sicheren Ort.",
	],
	[
		"9.4.1.2",
		"Jährliche Prüfung des Sicherungsorts",
		"Die Sicherheit des Orts für Offline-Sicherungen wird mindestens jährlich geprüft.",
	],
	[
		"9.4.2",
		"Medien eingestuft",
		"Medien mit Kartendaten sind nach Sensibilität eingestuft.",
	],
	[
		"9.4.3",
		"Versand von Medien",
		"Medien, die den Standort verlassen, werden sicher und nachverfolgbar versandt.",
	],
	[
		"9.4.4",
		"Versand genehmigt",
		"Die Leitung genehmigt jedes Medium mit Kartendaten, das den Standort verlässt.",
	],
	[
		"9.4.5",
		"Bestandsverzeichnis elektronischer Medien",
		"Für elektronische Medien mit Kartendaten wird ein Bestandsverzeichnis geführt.",
	],
	[
		"9.4.5.1",
		"Jährliche Inventur",
		"Das Bestandsverzeichnis wird mindestens jährlich mit dem Bestand abgeglichen.",
	],
	[
		"9.4.6",
		"Papier vernichten",
		"Papier mit Kartendaten wird vernichtet, wenn es nicht mehr gebraucht wird (Schreddern, Verbrennen, Zerfasern), und bis dahin sicher verwahrt.",
	],
	[
		"9.4.7",
		"Datenträger vernichten",
		"Elektronische Medien mit Kartendaten werden vernichtet oder so gelöscht, dass die Daten nicht wiederherstellbar sind.",
	],
	[
		"9.5.1",
		"Schutz von Kartenlesegeräten",
		"Geräte, die Kartendaten durch direkten Kontakt mit der Karte erfassen (POI), sind gegen Manipulation und Austausch geschützt.",
	],
	[
		"9.5.1.1",
		"Liste der Kartenlesegeräte",
		"Eine aktuelle Liste der POI-Geräte mit Hersteller, Modell, Standort und Seriennummer wird geführt.",
	],
	[
		"9.5.1.2",
		"Geräte regelmäßig prüfen",
		"POI-Geräte werden regelmäßig auf Manipulation (Skimmer) und Austausch geprüft.",
	],
	[
		"9.5.1.2.1",
		"Häufigkeit der Geräteprüfung",
		"Wie oft POI-Geräte geprüft werden, legt eine gezielte Risikoanalyse fest.",
	],
	[
		"9.5.1.3",
		"Schulung zu Kartenlesegeräten",
		"Personal an POI-Geräten ist geschult, Manipulation und Austausch zu erkennen und zu melden.",
	],
];

const R10: Row[] = [
	...basics("10", "Protokollierung und Überwachung"),
	[
		"10.2.1",
		"Protokolle aktiv",
		"Für alle Systemkomponenten und Kartendaten sind Protokolle aktiviert.",
	],
	[
		"10.2.1.1",
		"Zugriffe auf Kartendaten",
		"Alle Zugriffe einzelner Personen auf Kartendaten werden protokolliert.",
	],
	[
		"10.2.1.2",
		"Administrative Handlungen",
		"Alle Handlungen mit administrativen Rechten werden protokolliert.",
	],
	[
		"10.2.1.3",
		"Zugriffe auf Protokolle",
		"Alle Zugriffe auf Protokolle werden protokolliert.",
	],
	[
		"10.2.1.4",
		"Fehlgeschlagene Anmeldungen",
		"Alle ungültigen Zugriffsversuche werden protokolliert.",
	],
	[
		"10.2.1.5",
		"Änderungen an Kennungen und Merkmalen",
		"Anlegen, Erhöhen von Rechten und alle Änderungen an Konten mit Rechten werden protokolliert.",
	],
	[
		"10.2.1.6",
		"Start und Stopp der Protokollierung",
		"Starten, Stoppen und Pausieren der Protokolle werden protokolliert.",
	],
	[
		"10.2.1.7",
		"Systemobjekte",
		"Anlegen und Löschen von Objekten auf Systemebene werden protokolliert.",
	],
	[
		"10.2.2",
		"Inhalt der Protokolleinträge",
		"Jeder Eintrag enthält mindestens Person, Art des Ereignisses, Zeit, Erfolg oder Fehlschlag, Herkunft und betroffene Daten oder Komponente.",
	],
	[
		"10.3.1",
		"Lesezugriff auf Protokolle beschränkt",
		"Nur Personen mit Bedarf können Protokolle lesen.",
	],
	[
		"10.3.2",
		"Protokolle vor Änderung geschützt",
		"Protokolle sind vor Änderung durch Einzelpersonen geschützt.",
	],
	[
		"10.3.3",
		"Protokolle zentral gesichert",
		"Protokolle werden umgehend auf einen sicheren, zentralen Protokollserver oder schwer veränderbare Medien gesichert.",
	],
	[
		"10.3.4",
		"Integrität der Protokolle überwacht",
		"Dateiintegritätsüberwachung oder Änderungserkennung stellt sicher, dass bestehende Protokolle nicht ohne Alarm geändert werden.",
	],
	[
		"10.4.1",
		"Tägliche Auswertung",
		"Sicherheitsereignisse, Protokolle von Systemen mit Kartendaten, kritischen Systemen und Sicherheitsfunktionen werden mindestens täglich ausgewertet.",
	],
	[
		"10.4.1.1",
		"Automatische Auswertung",
		"Die Auswertung der Protokolle erfolgt mit automatischen Mechanismen.",
	],
	[
		"10.4.2",
		"Übrige Protokolle",
		"Protokolle aller übrigen Systemkomponenten werden regelmäßig ausgewertet.",
	],
	[
		"10.4.2.1",
		"Häufigkeit dieser Auswertung",
		"Wie oft die übrigen Protokolle ausgewertet werden, legt eine gezielte Risikoanalyse fest.",
	],
	[
		"10.4.3",
		"Auffälligkeiten bearbeitet",
		"Ausnahmen und Auffälligkeiten aus der Auswertung werden erkannt und bearbeitet.",
	],
	[
		"10.5.1",
		"Aufbewahrung der Protokolle",
		"Protokolle werden mindestens zwölf Monate aufbewahrt, die letzten drei Monate sofort verfügbar.",
	],
	[
		"10.6.1",
		"Zeitsynchronisation",
		"Die Uhren aller Systeme werden über eine Zeitsynchronisation gestellt.",
	],
	[
		"10.6.2",
		"Richtige Zeit",
		"Systeme beziehen die richtige, einheitliche Zeit von festgelegten Zeitservern, die externe Quellen nutzen.",
	],
	[
		"10.6.3",
		"Zeiteinstellungen geschützt",
		"Zeiteinstellungen sind nur für Personen mit Bedarf änderbar, und Änderungen werden protokolliert.",
	],
	[
		"10.7.1",
		"Ausfall von Sicherheitssystemen (Dienstleister)",
		"Dienstleister erkennen Ausfälle kritischer Sicherheitssysteme (Firewalls, Protokollierung, Schutzsoftware …), melden sie und reagieren umgehend.",
		{ sp: true },
	],
	[
		"10.7.2",
		"Ausfall von Sicherheitssystemen",
		"Ausfälle kritischer Sicherheitssysteme werden erkannt, gemeldet und umgehend bearbeitet.",
	],
	[
		"10.7.3",
		"Reaktion auf Ausfälle",
		"Auf Ausfälle wird umgehend reagiert: Funktion wiederherstellen, Ursache klären, Folgen bewerten, Wiederholung verhindern.",
	],
];

const R11: Row[] = [
	...basics("11", "Sicherheitstests"),
	[
		"11.2.1",
		"Funkzugangspunkte erkennen",
		"Berechtigte und unberechtigte Funkzugangspunkte werden mindestens vierteljährlich erkannt und behandelt.",
	],
	[
		"11.2.2",
		"Bestand der Funkzugangspunkte",
		"Ein Bestand berechtigter Funkzugangspunkte mit Begründung wird geführt.",
	],
	[
		"11.3.1",
		"Interne Schwachstellenscans",
		"Interne Schwachstellenscans laufen mindestens vierteljährlich; hohe und kritische Funde werden behoben und erneut gescannt.",
	],
	[
		"11.3.1.1",
		"Übrige Schwachstellen",
		"Schwachstellen unter hoch und kritisch werden nach einer gezielten Risikoanalyse behandelt.",
	],
	[
		"11.3.1.2",
		"Authentisierte Scans",
		"Interne Scans laufen mit Anmeldung an den Systemen.",
	],
	[
		"11.3.1.3",
		"Interne Scans nach Änderungen",
		"Nach jeder wesentlichen Änderung wird intern gescannt.",
	],
	[
		"11.3.2",
		"Externe Scans durch ASV",
		"Externe Schwachstellenscans laufen mindestens vierteljährlich durch einen zugelassenen Scan-Dienstleister (ASV) und bestehen die Anforderungen des ASV-Programms.",
		{ evidenceHints: ["ASV-Bericht je Quartal"] },
	],
	[
		"11.3.2.1",
		"Externe Scans nach Änderungen",
		"Nach jeder wesentlichen Änderung wird extern gescannt.",
	],
	[
		"11.4.1",
		"Methodik für Penetrationstests",
		"Eine Methodik für Penetrationstests ist festgelegt, nach anerkannten Vorgaben, mit Umfang, Netz- und Anwendungsebene und Segmentierung.",
	],
	[
		"11.4.2",
		"Interner Penetrationstest",
		"Interne Penetrationstests laufen mindestens jährlich und nach wesentlichen Änderungen, durch qualifizierte, unabhängige Personen.",
	],
	[
		"11.4.3",
		"Externer Penetrationstest",
		"Externe Penetrationstests laufen mindestens jährlich und nach wesentlichen Änderungen.",
	],
	[
		"11.4.4",
		"Funde behoben",
		"Ausnutzbare Schwachstellen aus Penetrationstests werden behoben und die Behebung durch erneuten Test bestätigt.",
	],
	[
		"11.4.5",
		"Segmentierung testen",
		"Wird die Kartendatenumgebung durch Segmentierung abgegrenzt, wird die Segmentierung mindestens jährlich und nach Änderungen getestet.",
	],
	[
		"11.4.6",
		"Segmentierung halbjährlich (Dienstleister)",
		"Dienstleister testen ihre Segmentierung mindestens alle sechs Monate und nach Änderungen.",
		{ sp: true },
	],
	[
		"11.4.7",
		"Penetrationstests der Kund:innen unterstützen",
		"Multi-Tenant-Dienstleister unterstützen ihre Kund:innen bei externen Penetrationstests.",
		{ sp: true },
	],
	[
		"11.5.1",
		"Angriffserkennung",
		"Angriffserkennungs- bzw. -abwehrsysteme überwachen den Verkehr am Rand und an kritischen Punkten der Kartendatenumgebung und melden Verdacht.",
	],
	[
		"11.5.1.1",
		"Verdeckte Kanäle (Dienstleister)",
		"Dienstleister erkennen verdeckte Kommunikationskanäle von Schadsoftware, melden sie und reagieren.",
		{ sp: true },
	],
	[
		"11.5.2",
		"Änderungserkennung",
		"Ein Mechanismus zur Änderungserkennung meldet unbefugte Änderungen an kritischen Dateien und vergleicht mindestens wöchentlich.",
	],
	[
		"11.6.1",
		"Änderungen an Zahlungsseiten erkennen",
		"Ein Mechanismus erkennt unbefugte Änderungen an HTTP-Kopfzeilen und Inhalten von Zahlungsseiten im Browser und meldet sie mindestens wöchentlich bzw. nach Risikoanalyse.",
	],
];

const R12: Row[] = [
	[
		"12.1.1",
		"Sicherheitsrichtlinie",
		"Eine umfassende Richtlinie zur Informationssicherheit ist festgelegt, veröffentlicht, gepflegt und allen Beteiligten bekannt gemacht.",
		{ evidenceHints: ["Informationssicherheitsrichtlinie"] },
	],
	[
		"12.1.2",
		"Jährliche Prüfung der Richtlinie",
		"Die Richtlinie wird mindestens jährlich und bei Änderungen geprüft und angepasst.",
	],
	[
		"12.1.3",
		"Rollen in der Richtlinie",
		"Die Richtlinie beschreibt Rollen und Verantwortung für Informationssicherheit, und alle Beschäftigten kennen ihre Pflichten.",
	],
	[
		"12.1.4",
		"Verantwortliche:r für Informationssicherheit",
		"Die Verantwortung für Informationssicherheit ist einer benannten Person der Leitung (CISO) formell übertragen.",
	],
	[
		"12.2.1",
		"Regeln für die Nutzung von Technik",
		"Nutzungsregeln für Endgeräte und Technik der Beschäftigten sind dokumentiert: Genehmigung, zulässige Nutzung, Liste freigegebener Produkte.",
	],
	[
		"12.3.1",
		"Gezielte Risikoanalysen",
		"Für jede Anforderung, deren Häufigkeit die Stelle selbst festlegen darf, gibt es eine dokumentierte gezielte Risikoanalyse, die mindestens jährlich geprüft wird.",
		{ evidenceHints: ["Gezielte Risikoanalysen je Anforderung"] },
	],
	[
		"12.3.2",
		"Risikoanalyse für den angepassten Ansatz",
		"Für jede Anforderung im angepassten Ansatz gibt es eine gezielte Risikoanalyse, von der Leitung genehmigt und jährlich geprüft.",
	],
	[
		"12.3.3",
		"Kryptografische Verfahren geprüft",
		"Eingesetzte Cipher Suites und Protokolle sind dokumentiert und werden mindestens jährlich auf Eignung geprüft, mit Plan für veraltete Verfahren.",
	],
	[
		"12.3.4",
		"Hard- und Software geprüft",
		"Eingesetzte Hard- und Software wird mindestens jährlich darauf geprüft, ob sie weiter Sicherheitsupdates bekommt, mit Plan für auslaufende Technik.",
	],
	[
		"12.4.1",
		"Verantwortung der Leitung (Dienstleister)",
		"Bei Dienstleistern trägt die Leitung die Verantwortung für die Einhaltung von PCI DSS, mit Programm und Bericht an die Leitung.",
		{ sp: true },
	],
	[
		"12.4.2",
		"Vierteljährliche Prüfungen (Dienstleister)",
		"Dienstleister prüfen mindestens vierteljährlich, ob Personal die Verfahren einhält (Protokollauswertung, Firewall-Regeln, Konfiguration, Alarme, Änderungen).",
		{ sp: true },
	],
	[
		"12.4.2.1",
		"Dokumentation der Prüfungen (Dienstleister)",
		"Die vierteljährlichen Prüfungen sind mit Ergebnis, Maßnahmen und Abnahme durch die Verantwortlichen dokumentiert.",
		{ sp: true },
	],
	[
		"12.5.1",
		"Bestand der Systemkomponenten",
		"Ein Bestand aller Systemkomponenten im Geltungsbereich mit Funktion wird geführt und aktuell gehalten.",
	],
	[
		"12.5.2",
		"Geltungsbereich bestätigt",
		"Der Geltungsbereich von PCI DSS (Kartendatenflüsse, Speicherorte, Segmentierung, Verbindungen zu Dritten) wird mindestens jährlich und nach wesentlichen Änderungen bestätigt.",
		{ evidenceHints: ["Scope-Bestätigung mit Datum"] },
	],
	[
		"12.5.2.1",
		"Geltungsbereich halbjährlich (Dienstleister)",
		"Dienstleister bestätigen den Geltungsbereich mindestens alle sechs Monate.",
		{ sp: true },
	],
	[
		"12.5.3",
		"Organisatorische Änderungen (Dienstleister)",
		"Dienstleister prüfen nach wesentlichen organisatorischen Änderungen die Auswirkung auf Geltungsbereich und Kontrollen und informieren die Leitung.",
		{ sp: true },
	],
	[
		"12.6.1",
		"Programm für Sicherheitsbewusstsein",
		"Ein formales Programm macht alle Beschäftigten mit der Sicherheitsrichtlinie und ihrer Rolle beim Schutz von Kartendaten vertraut.",
	],
	[
		"12.6.2",
		"Jährliche Prüfung des Programms",
		"Das Programm wird mindestens jährlich geprüft und an neue Bedrohungen angepasst.",
	],
	[
		"12.6.3",
		"Schulung bei Eintritt und jährlich",
		"Beschäftigte werden bei Eintritt und mindestens jährlich geschult und bestätigen, dass sie die Richtlinie gelesen haben.",
	],
	[
		"12.6.3.1",
		"Bedrohungen in der Schulung",
		"Die Schulung behandelt Bedrohungen wie Phishing und Social Engineering.",
	],
	[
		"12.6.3.2",
		"Nutzung von Technik in der Schulung",
		"Die Schulung behandelt die zulässige Nutzung von Endgeräten und Technik nach 12.2.1.",
	],
	[
		"12.7.1",
		"Überprüfung vor Einstellung",
		"Personen mit Zugriff auf die Kartendatenumgebung werden vor der Einstellung im rechtlich zulässigen Rahmen überprüft.",
	],
	[
		"12.8.1",
		"Liste der Dienstleister",
		"Eine Liste aller Dienstleister, mit denen Kontodaten geteilt werden oder die deren Sicherheit beeinflussen können, mit Beschreibung der Leistung wird geführt.",
	],
	[
		"12.8.2",
		"Schriftliche Vereinbarungen",
		"Schriftliche Vereinbarungen mit den Dienstleistern bestätigen deren Verantwortung für die Sicherheit der Kontodaten, die sie besitzen oder beeinflussen.",
	],
	[
		"12.8.3",
		"Sorgfaltsprüfung vor Beauftragung",
		"Vor der Beauftragung eines Dienstleisters gibt es eine Sorgfaltsprüfung nach festgelegtem Verfahren.",
	],
	[
		"12.8.4",
		"Jährliche Prüfung der Dienstleister",
		"Der PCI-DSS-Stand der Dienstleister wird mindestens jährlich überwacht (z. B. AOC).",
	],
	[
		"12.8.5",
		"Verantwortungsmatrix mit Dienstleistern",
		"Für jeden Dienstleister ist festgehalten, welche PCI-DSS-Anforderungen er übernimmt, welche die Stelle selbst erfüllt und welche geteilt sind.",
		{ evidenceHints: ["Verantwortungsmatrix je Dienstleister"] },
	],
	[
		"12.9.1",
		"Bestätigung gegenüber Kund:innen",
		"Dienstleister bestätigen ihren Kund:innen schriftlich ihre Verantwortung für die Sicherheit der Kontodaten.",
		{ sp: true },
	],
	[
		"12.9.2",
		"Nachweise für Kund:innen",
		"Dienstleister geben Kund:innen auf Anfrage Auskunft über ihren PCI-DSS-Stand und die Aufteilung der Anforderungen.",
		{ sp: true },
	],
	[
		"12.10.1",
		"Plan für Sicherheitsvorfälle",
		"Ein Vorfallreaktionsplan ist bereit: Rollen, Kommunikation, Benachrichtigung der Kartenorganisationen, Reaktion, Wiederanlauf, Datensicherung, rechtliche Pflichten.",
		{ evidenceHints: ["Vorfallreaktionsplan"] },
	],
	[
		"12.10.2",
		"Jährliche Prüfung und Übung",
		"Der Plan wird mindestens jährlich geprüft, aktualisiert und geübt.",
	],
	[
		"12.10.3",
		"Erreichbarkeit rund um die Uhr",
		"Benannte Personen sind rund um die Uhr erreichbar, um auf vermutete Vorfälle zu reagieren.",
	],
	[
		"12.10.4",
		"Schulung des Vorfallteams",
		"Das Personal für die Vorfallreaktion ist passend und regelmäßig geschult.",
	],
	[
		"12.10.4.1",
		"Häufigkeit dieser Schulung",
		"Wie oft das Vorfallteam geschult wird, legt eine gezielte Risikoanalyse fest.",
	],
	[
		"12.10.5",
		"Alarme im Plan",
		"Der Plan umfasst die Alarme der Sicherheitsüberwachung, auch der Änderungserkennung an Zahlungsseiten.",
	],
	[
		"12.10.6",
		"Plan aus Erfahrungen verbessern",
		"Der Plan wird nach Erfahrungen und Branchenentwicklungen angepasst.",
	],
	[
		"12.10.7",
		"Kartendaten an unerwartetem Ort",
		"Werden gespeicherte PAN an einem unerwarteten Ort gefunden, greifen Verfahren: sicher löschen oder in den Geltungsbereich übernehmen, Ursache klären, Wiederholung verhindern.",
	],
];

const RA1: Row[] = [
	[
		"A1.1.1",
		"Logische Trennung der Kund:innen",
		"Multi-Tenant-Dienstleister trennen die Umgebungen ihrer Kund:innen logisch, sodass keine Kund:in auf Umgebungen anderer zugreifen kann.",
		{ sp: true },
	],
	[
		"A1.1.2",
		"Zugriff nur auf die eigene Umgebung",
		"Kontrollen stellen sicher, dass jede Kund:in nur auf die eigene Kartendatenumgebung zugreift.",
		{ sp: true },
	],
	[
		"A1.1.3",
		"Ressourcen je Kund:in",
		"Jede Kund:in kann nur ihre eigenen Ressourcen nutzen, ohne andere zu beeinträchtigen.",
		{ sp: true },
	],
	[
		"A1.1.4",
		"Trennung halbjährlich getestet",
		"Die Wirksamkeit der logischen Trennung wird mindestens alle sechs Monate per Penetrationstest bestätigt.",
		{ sp: true },
	],
	[
		"A1.2.1",
		"Protokolle je Kund:in",
		"Für jede Kund:in sind Protokolle aktiviert, die ihren Pflichten nach Anforderung 10 entsprechen.",
		{ sp: true },
	],
	[
		"A1.2.2",
		"Forensik unterstützen",
		"Verfahren unterstützen die forensische Untersuchung eines vermuteten Vorfalls bei einer Kund:in.",
		{ sp: true },
	],
	[
		"A1.2.3",
		"Vorfälle melden",
		"Verfahren regeln, wie vermutete Vorfälle und Schwachstellen gemeldet und an betroffene Kund:innen weitergegeben werden.",
		{ sp: true },
	],
];

const RA2: Row[] = [
	[
		"A2.1.1",
		"POI-Terminals ohne SSL-Schwächen",
		"POI-Terminals, die noch SSL oder frühes TLS nutzen, sind nachweislich nicht anfällig für bekannte Angriffe auf diese Protokolle.",
	],
	[
		"A2.1.2",
		"Plan zum Ablösen (Dienstleister)",
		"Dienstleister mit Verbindungen zu solchen POI-Terminals haben einen Plan zur Risikominderung und Ablösung.",
		{ sp: true },
	],
	[
		"A2.1.3",
		"Sichere Verbindung anbieten (Dienstleister)",
		"Dienstleister bieten ihren Kund:innen eine sichere Verbindungsoption an.",
		{ sp: true },
	],
];

const DOMAIN_BY_SECTION: Record<string, Domain> = {
	"1": "network",
	"2": "operations",
	"3": "payments",
	"4": "crypto",
	"5": "operations",
	"6": "development",
	"7": "access",
	"8": "access",
	"9": "physical",
	"10": "operations",
	"11": "operations",
	"12": "governance",
	A1: "network",
	A2: "crypto",
};

// Unterbereiche mit anderer Domäne als ihr Abschnitt
function domainFor(code: string, section: string): Domain {
	if (/^3\.[5-7]\./.test(code)) return "crypto";
	if (/^12\.8\.|^12\.9\./.test(code)) return "supplier";
	if (/^12\.10\./.test(code)) return "incident";
	if (/^12\.[67]\./.test(code)) return "hr";
	if (/^12\.3\./.test(code)) return "risk";
	return DOMAIN_BY_SECTION[section] ?? "governance";
}

const ALL: Row[] = [
	...R1,
	...R2,
	...R3,
	...R4,
	...R5,
	...R6,
	...R7,
	...R8,
	...R9,
	...R10,
	...R11,
	...R12,
	...RA1,
	...RA2,
];

// Nur für Dienstleister (Prüfung über die Variante „sp“)
export const PCI_SP_ONLY: ReadonlySet<string> = new Set(
	ALL.filter((r) => r[3]?.sp).map((r) => r[0]),
);

export const PCI_CODES: readonly string[] = ALL.map((r) => r[0]);

export const PCI_DSS_REQUIREMENTS_BASE: Omit<CatalogRequirement, "variants">[] =
	ALL.map(([code, title, text, extra], i) => {
		const { sp: _sp, ...rest } = extra ?? {};
		const section = code.startsWith("A")
			? code.slice(0, 2)
			: (code.split(".")[0] ?? "12");
		return {
			code,
			sectionCode: section,
			title,
			requirementText: text,
			domain: domainFor(code, section),
			sortOrder: (i + 1) * 10,
			...rest,
		};
	});
