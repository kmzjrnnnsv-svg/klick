// Kern und Zusätze, Teil B (Teil K): die nächsten 22 meistgeteilten
// Maßnahmen (Vorfallplan, Notfall, Protokolle, Risiko, Zugänge, Netz u. a.).
// Inhalte aus den Anforderungstexten des Katalogs. Format und Regeln in
// control-additions.ts, Test control-additions.

import type { ControlCore } from "./control-additions";

export const PART_B: Record<string, ControlCore> = {
	"CC-INC-04": {
		core: "Ein schriftlicher Plan regelt, wie auf Vorfälle reagiert wird und wer wen informiert.",
		where: { href: "/vorfaelle", label: "Vorfälle" },
		additions: [
			{
				kind: "inhalt",
				text: "Der Ablauf reicht vom Eindämmen und Sichern von Beweisen bis zum Beseitigen. Feste Kriterien sagen, wann die Wiederherstellung beginnt.",
				requirements: [
					"iso27001:A.5.26",
					"soc2:CC7.4",
					"nist-csf:RS.MI-01",
					"nist-csf:RS.MI-02",
					"nist-csf:RS.MA-05",
					"nist-csf:RC.RP-01",
					"nist-800-53:IR-4",
					"nist-800-171:3.6.1",
					"cmmc:IR.L2-3.6.1",
					"hipaa:164.308(a)(6)(ii)",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-VORFALL",
					label: "Vorlage Vorfallrichtlinie",
				},
			},
			{
				kind: "inhalt",
				text: "Der Plan nennt Rollen, Meldewege, Ursachenanalyse und Kennzahlen und deckt auch Erpressungssoftware ab.",
				requirements: [
					"nycrr-500:500.16(a)(1)",
					"nist-800-53:IR-8",
					"ms-sspa:MON.1",
				],
			},
			{
				kind: "inhalt",
				text: "Ein Krisenstab hat Regeln für Eskalation, Entscheidungen und Kommunikation. Dafür stehen gesicherte Wege für Sprache, Video und Text bereit.",
				requirements: ["dora:Art.11(7)", "nis2:Art.21(2)(j)"],
				where: {
					href: "/organisation/krisenkontakte",
					label: "Krisenkontakte",
				},
			},
			{
				kind: "zielgruppe",
				text: "Kund:innen, Partner und Öffentlichkeit erfahren von schweren Vorfällen. Mindestens eine benannte Person spricht mit Presse und Öffentlichkeit.",
				requirements: [
					"dora:Art.14",
					"nist-csf:RS.CO-02",
					"nist-csf:RS.CO-03",
					"nist-csf:RC.CO-03",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=PL-KRISENKOMMUNIKATION",
					label: "Vorlage Krisenkommunikation",
				},
			},
			{
				kind: "nachweis",
				text: "Öffentliche Mitteilungen laufen über freigegebene Wege, mit vorbereiteten Vorlagen und Kontaktlisten für Behörden und Presse.",
				requirements: ["nist-csf:RC.CO-04", "bsi-200-4:8.3"],
			},
			{
				kind: "zielgruppe",
				text: "Betroffene Personen werden in klarer Sprache benachrichtigt, bei Datenpannen mit hohem Risiko unverzüglich. Für KI-Systeme ist festgelegt, wie Betroffene davon erfahren.",
				requirements: ["dsgvo:Art.34", "hipaa:164.404(b)", "iso42001:A.8.4"],
				where: { href: "/datenschutz", label: "Datenschutz" },
			},
			{
				kind: "zielgruppe",
				text: "Fehlen bei Gesundheitsdaten für zehn oder mehr Personen Kontaktdaten, folgt eine Ersatzmeldung auf der Website. Bei mehr als 500 Betroffenen in einem Bundesstaat werden auch Medien dort informiert.",
				requirements: ["hipaa:164.404(d)", "hipaa:164.406"],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller informieren Nutzer:innen über ausgenutzte Schwachstellen und Schutzmaßnahmen, bei Bedarf öffentlich und maschinenlesbar.",
				requirements: ["cra:Art.14(8)"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Geschäftskund:innen erfahren unverzüglich von Sicherheitsverletzungen, mit Ansprechperson, erster Analyse und Plan zur Behebung. Wer für AWS oder Microsoft liefert, meldet Vorfälle dorthin und hilft bei der Aufklärung.",
				requirements: ["mvsp:1.7", "aws-ftr:SEC.2", "ms-sspa:MON.3"],
			},
			{
				kind: "inhalt",
				text: "Für den Verdacht auf kompromittierte Schlüssel gibt es ein eigenes Protokoll. Ab Stufe II sind die Beteiligten geschult, ab Stufe III üben sie es regelmäßig.",
				requirements: ["ccss:1.05"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "inhalt",
				text: "Die Reaktion wird geübt, etwa am Tisch oder als Simulation. Ein Team für Cybervorfälle ist vor Ort oder aus der Ferne einsatzbereit.",
				requirements: [
					"nist-800-53:IR-3",
					"nist-800-171:3.6.3",
					"cmmc:IR.L2-3.6.3",
					"cmmc:IR.L3-3.6.2e",
				],
				where: { href: "/testprogramm", label: "Testprogramm" },
			},
			{
				kind: "rhythmus",
				text: "Nach jedem Vorfall wird der Plan geprüft und mit den Erkenntnissen verbessert.",
				requirements: [
					"aws-ftr:SEC.2",
					"nist-csf:ID.IM-04",
					"nist-800-53:IR-4",
				],
			},
		],
	},

	"CC-BCM-03": {
		core: "Daten werden regelmäßig gesichert, die Sicherungen sind geschützt, und die Wiederherstellung wird getestet.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=KZ-BACKUP",
			label: "Vorlage Backup-Konzept",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Umfang und Häufigkeit der Sicherung richten sich nach Bedeutung und Vertraulichkeit der Daten. Sicherungen laufen automatisch nach festem Zeitplan.",
				requirements: ["dora:Art.12(1)", "aws-ftr:BAR.1"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=KZ-BACKUP",
					label: "Vorlage Backup-Konzept",
				},
			},
			{
				kind: "inhalt",
				text: "Gesichert werden auch Programme, Einstellungen und Dokumentation, nicht nur Daten.",
				requirements: [
					"iso27001:A.8.13",
					"essential-eight:RB.1",
					"nist-800-53:CP-9",
				],
			},
			{
				kind: "inhalt",
				text: "Sicherungen liegen an einem getrennten, gleich gut geschützten Ort, nicht dort, wo die Anwendung läuft.",
				requirements: [
					"dora:Art.12(1)",
					"nist-800-53:CP-6",
					"mvsp:4.4",
					"pci-dss:9.4.1.1",
				],
			},
			{
				kind: "inhalt",
				text: "Nur die Konten für die Sicherung dürfen Sicherungen ändern oder löschen. Normale Konten können sie nicht einmal lesen.",
				requirements: [
					"essential-eight:RB.2",
					"essential-eight:RB.3",
					"nycrr-500:500.16(e)",
				],
			},
			{
				kind: "inhalt",
				text: "Die Vertraulichkeit der Sicherungen ist am Aufbewahrungsort geschützt, etwa durch Verschlüsselung.",
				requirements: [
					"nist-800-53:CP-9",
					"nist-800-171:3.8.9",
					"cmmc:MP.L2-3.8.9",
				],
			},
			{
				kind: "inhalt",
				text: "Wiederhergestellt wird auf Systemen, die von der Quelle des Vorfalls getrennt sind. Ausweichstandorte liegen geografisch getrennt.",
				requirements: ["dora:Art.12(2)"],
			},
			{
				kind: "inhalt",
				text: "Vor dem Einsatz wird die Unversehrtheit der Sicherung geprüft. Danach wird bestätigt, dass Systeme sicher laufen und der Normalbetrieb zurück ist.",
				requirements: [
					"nist-csf:RC.RP-03",
					"nist-csf:RC.RP-05",
					"nist-800-53:CP-10",
				],
			},
			{
				kind: "inhalt",
				text: "Ein Test zeigt, dass Daten und kritische Systeme vollständig und nutzbar aus der Sicherung zurückkommen.",
				requirements: [
					"aws-ftr:BAR.2",
					"nycrr-500:500.16(d)",
					"soc2:A1.3",
					"tisax:5.2.9",
				],
				where: { href: "/testprogramm", label: "Testprogramm" },
			},
			{
				kind: "rhythmus",
				text: "Bevor Geräte mit Gesundheitsdaten umziehen, wird eine genaue, wiederherstellbare Kopie angelegt.",
				requirements: ["hipaa:164.310(d)(2)(iv)"],
			},
			{
				kind: "nachweis",
				text: "Verfahren für Sicherung und Wiederherstellung verlorener Daten sind schriftlich festgelegt.",
				requirements: [
					"dora:Art.12(1)",
					"hipaa:164.308(a)(7)(ii)(B)",
					"bsi-200-4:8.1",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=KZ-BACKUP",
					label: "Vorlage Backup-Konzept",
				},
			},
		],
	},

	"CC-GOV-13": {
		core: "Ob Regeln eingehalten werden und wirken, wird regelmäßig geprüft, auch durch unabhängige Stellen.",
		where: { href: "/audits", label: "Audits" },
		additions: [
			{
				kind: "inhalt",
				text: "Prüfungen an laufenden Systemen werden mit der Leitung abgestimmt, damit der Betrieb nicht gestört wird.",
				requirements: ["iso27001:A.8.34"],
			},
			{
				kind: "inhalt",
				text: "Das ganze Programm wird auf Grundlage der Risikobewertung unabhängig geprüft. Ein Zertifikat wie ISO 27001 kann als Beleg dienen.",
				requirements: ["nycrr-500:500.2(c)", "tisax:1.5.2", "ms-sspa:MGT.8"],
			},
			{
				kind: "zielgruppe",
				text: "Compliance, bei Banken auch Risikocontrolling und Revision, arbeiten unabhängig und berichten direkt an die Leitung. Ganz auslagern darf man Compliance nur bei geringer Komplexität.",
				requirements: ["zag-marisk:AT4.4.2", "kwg:AT4.4"],
				where: { href: "/organisation?tab=rollen", label: "Rollen & Leitung" },
			},
			{
				kind: "zielgruppe",
				text: "BaFin und Bundesbank bekommen Auskünfte, Unterlagen und Zugang, auch bei Sonderprüfungen.",
				requirements: ["kwg:§44"],
				where: { href: "/organisation?tab=aufsicht", label: "Aufsicht" },
			},
			{
				kind: "zielgruppe",
				text: "Ein ausreichend unabhängiges Aufsichtsorgan überwacht, ob die internen Kontrollen wirken.",
				requirements: ["soc2:CC1.2"],
			},
			{
				kind: "zielgruppe",
				text: "Bei Dienstleistern für Kartenzahlungen verantwortet die Leitung das Programm. Geprüft wird, ob das Personal Verfahren einhält, etwa bei Firewall-Regeln und Änderungen.",
				requirements: ["pci-dss:12.4.1", "pci-dss:12.4.2"],
			},
			{
				kind: "zielgruppe",
				text: "Anbieter prüfen ihr Produkt selbst gegen Prüflisten wie MVSP oder das AWS Well-Architected Framework.",
				requirements: ["mvsp:1.3", "aws-ftr:SUP.2"],
			},
			{
				kind: "rhythmus",
				text: "Zusätzlich wird nach wesentlichen Änderungen, neuen Bedrohungen oder einem Vorfall geprüft.",
				requirements: [
					"iso27001:A.5.35",
					"cmmc:RA.L3-3.11.5e",
					"hipaa:164.308(a)(8)",
					"bsi-200-1:8.3",
				],
			},
			{
				kind: "rhythmus",
				text: "Neben einzelnen Prüfungen werden die Maßnahmen laufend überwacht, etwa mit Kennzahlen und Tests.",
				requirements: [
					"nist-800-171:3.12.3",
					"cmmc:CA.L2-3.12.3",
					"soc2:CC4.1",
				],
			},
			{
				kind: "nachweis",
				text: "Ein schriftlicher Plan legt fest, was geprüft wird, und die Ergebnisse werden berichtet.",
				requirements: ["nist-800-53:CA-1", "nist-800-53:CA-2"],
				where: { href: "/audits?tab=programm", label: "Auditprogramm" },
			},
			{
				kind: "nachweis",
				text: "Jede dieser Prüfungen ist mit Ergebnis, Maßnahmen und Abnahme durch die Verantwortlichen dokumentiert.",
				requirements: ["pci-dss:12.4.2.1"],
			},
			{
				kind: "nachweis",
				text: "Das Ergebnis wird förmlich bescheinigt, etwa gegenüber Behörden in New York und Kalifornien oder im Portal von Microsoft. Offene Lücken stehen dort mit Plan und Termin.",
				requirements: ["nycrr-500:500.17(b)(1)", "ccpa:RA.2", "ms-sspa:MGT.7"],
			},
		],
	},

	"CC-CRY-05": {
		core: "Daten sind bei der Übertragung über Netze verschlüsselt und gegen Verändern geschützt.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=KZ-KRYPTO",
			label: "Vorlage Kryptokonzept",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Verschlüsselt wird mindestens mit TLS 1.2.",
				requirements: ["aws-ftr:DAT.3", "ms-sspa:SEC.3"],
			},
			{
				kind: "inhalt",
				text: "Die Anwendung ist nur über HTTPS erreichbar, leitet HTTP um und setzt HSTS. Die TLS-Einstellungen werden regelmäßig geprüft.",
				requirements: ["mvsp:2.2"],
			},
			{
				kind: "inhalt",
				text: "Nur gültige Zertifikate werden angenommen. Ein Bestand der vertrauenswürdigen Schlüssel und Zertifikate wird geführt.",
				requirements: ["pci-dss:4.2.1", "pci-dss:4.2.1.1"],
			},
			{
				kind: "inhalt",
				text: "Sitzungen sind gegen Übernahme geschützt. Anmeldetoken und Passwörter gehen nur verschlüsselt über das Netz.",
				requirements: [
					"nist-800-53:SC-23",
					"nist-800-171:3.13.15",
					"cmmc:SC.L2-3.13.15",
					"nist-csf:PR.AA-04",
					"nist-800-171:3.5.10",
					"cmmc:IA.L2-3.5.10",
				],
			},
			{
				kind: "inhalt",
				text: "Geräte melden sich vor einer Verbindung gegenseitig an, etwa über Zertifikate.",
				requirements: ["cmmc:IA.L3-3.5.1e"],
			},
			{
				kind: "inhalt",
				text: "Für geschützte Daten des US-Bundes zählen nur Module, die nach FIPS 140 geprüft sind.",
				requirements: ["nist-800-171:3.13.11", "cmmc:SC.L2-3.13.11"],
			},
			{
				kind: "zielgruppe",
				text: "Fernzugriff und Verwaltung über das Netz sind immer stark verschlüsselt.",
				requirements: [
					"pci-dss:2.2.7",
					"nist-800-53:AC-17",
					"nist-800-171:3.1.13",
					"cmmc:AC.L2-3.1.13",
				],
			},
			{
				kind: "zielgruppe",
				text: "Funknetze sind mit Anmeldung und Verschlüsselung geschützt.",
				requirements: [
					"pci-dss:4.2.1.2",
					"nist-800-171:3.1.17",
					"cmmc:AC.L2-3.1.17",
				],
			},
			{
				kind: "zielgruppe",
				text: "Auch zwischen eigenen Systemen werden sensible Daten verschlüsselt übertragen.",
				requirements: ["mvsp:2.8"],
			},
			{
				kind: "zielgruppe",
				text: "Kartennummern in E-Mail oder Chat sind stark verschlüsselt.",
				requirements: ["pci-dss:4.2.2"],
			},
			{
				kind: "zielgruppe",
				text: "Kartenterminals mit altem SSL oder frühem TLS sind nachweislich nicht angreifbar. Dienstleister haben einen Plan zum Ablösen und bieten sichere Verbindungen an.",
				requirements: ["pci-dss:A2.1.1", "pci-dss:A2.1.2", "pci-dss:A2.1.3"],
			},
			{
				kind: "nachweis",
				text: "Die Regeln für Verschlüsselung stehen in einem schriftlichen Konzept.",
				requirements: ["iso27001:A.8.24", "nis2:Art.21(2)(h)"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=KZ-KRYPTO",
					label: "Vorlage Kryptokonzept",
				},
			},
		],
	},

	"CC-BCM-01": {
		core: "Eine Leitlinie und Notfallpläne regeln, wie wichtige Abläufe bei Störungen weiterlaufen und wieder anlaufen.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-BCM",
			label: "Vorlage Geschäftsfortführung",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Auch im Notbetrieb bleibt die Sicherheit der Daten gewahrt.",
				requirements: [
					"iso27001:A.5.29",
					"hipaa:164.308(a)(7)(ii)(C)",
					"nist-csf:PR.IR-03",
				],
			},
			{
				kind: "inhalt",
				text: "Für jede Ausfallart gibt es eine Strategie: Personal, Gebäude, IT und Dienstleister.",
				requirements: ["bsi-200-4:7"],
			},
			{
				kind: "inhalt",
				text: "Ein Notfallhandbuch mit Sofortmaßnahmen und Alarmierung ist auch im Notfall für alle Beteiligten erreichbar.",
				requirements: ["bsi-200-4:8.2"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=PL-NOTFALL",
					label: "Vorlage Notfallplan",
				},
			},
			{
				kind: "inhalt",
				text: "Der Plan nennt wichtige Systeme, Daten, Personen und Dienstleister, dazu Wiederherstellungsziele, Rollen und Kontakte.",
				requirements: ["nycrr-500:500.16(a)(2)", "nist-800-53:CP-2"],
			},
			{
				kind: "inhalt",
				text: "Die Wiederherstellung folgt festen Prioritäten. Am Ende wird bestätigt, dass der Normalbetrieb wieder läuft.",
				requirements: [
					"nist-csf:RS.MA-05",
					"nist-csf:RC.RP-01",
					"nist-csf:RC.RP-02",
					"nist-csf:RC.RP-04",
					"nist-csf:RC.RP-05",
					"nist-800-53:CP-10",
				],
			},
			{
				kind: "inhalt",
				text: "Im Notfall gibt es geregelten Zugriff auf benötigte Daten und Zutritt zu den Räumen.",
				requirements: ["hipaa:164.312(a)(2)(ii)", "hipaa:164.310(a)(2)(i)"],
			},
			{
				kind: "zielgruppe",
				text: "Die Leitung beschließt das Notfallmanagement, stellt Mittel bereit und verabschiedet die Leitlinie.",
				requirements: ["bsi-200-4:4.1", "bsi-200-4:4.2"],
				where: { href: "/beschluesse", label: "Beschlüsse" },
			},
			{
				kind: "zielgruppe",
				text: "Pläne gibt es für jede zeitkritische Tätigkeit und jede kritische oder wichtige Funktion.",
				requirements: ["zag-marisk:AT7.3", "dora:Art.11(1-2)"],
				where: { href: "/prozesse?tab=kritisch", label: "Kritische Prozesse" },
			},
			{
				kind: "zielgruppe",
				text: "Wichtige Lieferanten sind in Planung, Reaktion und Wiederherstellung eingebunden.",
				requirements: ["nist-csf:GV.SC-08"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
			{
				kind: "zielgruppe",
				text: "Für Lösungen in der Cloud beschreibt ein Plan den Wiederanlauf nach Ausfall einer Zone oder Region.",
				requirements: ["aws-ftr:RES.3"],
			},
			{
				kind: "rhythmus",
				text: "Leitlinie und Pläne werden auch nach Anlässen geprüft. Nach jedem Vorfall fließen Verbesserungen ein.",
				requirements: ["nist-800-53:CP-1", "soc2:CC7.5", "nist-csf:ID.IM-04"],
			},
		],
	},

	"CC-AST-10": {
		core: "Für jede Art von Daten ist festgelegt, wie lange sie aufbewahrt und wie sie danach sicher gelöscht werden.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=KZ-LOESCHUNG",
			label: "Vorlage Löschkonzept",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Aufzeichnungen sind vor Verlust, Fälschung, unbefugtem Zugriff und unbefugter Veröffentlichung geschützt.",
				requirements: ["iso27001:A.5.33"],
			},
			{
				kind: "inhalt",
				text: "Steht ein Gesetz der Löschung entgegen, wird die Nutzung eingeschränkt und das Löschdatum vorgemerkt.",
				requirements: ["dsgvo:Art.16-18", "nycrr-500:500.13(b)"],
			},
			{
				kind: "zielgruppe",
				text: "Protokolle bleiben so lange erhalten, wie Gesetze und spätere Untersuchungen es verlangen.",
				requirements: ["nist-800-53:AU-11"],
			},
			{
				kind: "zielgruppe",
				text: "Kartendaten werden nur so viel und so lange gespeichert, wie Recht, Vertrag oder Geschäft es verlangen.",
				requirements: ["pci-dss:3.2.1"],
			},
			{
				kind: "zielgruppe",
				text: "Geräte und Datenträger mit Schlüsselmaterial werden nach eigener Richtlinie gelöscht. Ab Stufe II wird jede Löschung mit Nachweis protokolliert.",
				requirements: ["ccss:2.02"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "zielgruppe",
				text: "Nutzer:innen eines Produkts können alle Daten und Einstellungen dauerhaft, sicher und einfach löschen.",
				requirements: ["cra:AnhI-2m"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Auf Löschanfragen hin werden auch Dienstleister und Empfänger der Daten zur Löschung angewiesen. Ausnahmen wie gesetzliche Aufbewahrung werden begründet und mitgeteilt.",
				requirements: ["ccpa:RT.2", "us-privacy:RT.2"],
				where: {
					href: "/datenschutz?tab=anfragen",
					label: "Betroffenenanfragen",
				},
			},
			{
				kind: "rhythmus",
				text: "Bei Vertragsende werden Daten zurückgegeben oder sicher gelöscht, und die Löschung wird bestätigt.",
				requirements: ["tisax:5.3.3", "ms-sspa:RET.2"],
			},
			{
				kind: "rhythmus",
				text: "Bei Richtlinien und Aufzeichnungen beginnt die Frist mit dem Ende ihrer Gültigkeit, wenn das später als die Erstellung ist.",
				requirements: ["hipaa:164.316(b)(2)(i)"],
			},
			{
				kind: "nachweis",
				text: "Unterlagen sind so abgelegt, dass sachkundige Dritte sie nachvollziehen und prüfen können.",
				requirements: ["zag-marisk:AT6"],
			},
			{
				kind: "nachweis",
				text: "Anfragen von Verbraucher:innen und die Antworten werden mit Datum, Art, Ergebnis und Ablehnungsgrund aufbewahrt.",
				requirements: ["ccpa:RK.1"],
				where: {
					href: "/datenschutz?tab=anfragen",
					label: "Betroffenenanfragen",
				},
			},
		],
	},

	"CC-LOG-02": {
		core: "Systeme und Protokolle werden auf Auffälliges überwacht, und Alarme werden bearbeitet.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-LOGGING",
			label: "Vorlage Protokollierung",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Protokolle werden zentral gesammelt, automatisch ausgewertet und über mehrere Quellen hinweg verknüpft.",
				requirements: [
					"pci-dss:10.4.1.1",
					"nist-800-53:AU-6",
					"nist-csf:DE.AE-03",
					"nist-800-171:3.3.5",
					"cmmc:AU.L2-3.3.5",
					"nycrr-500:500.14(b)(2)",
				],
			},
			{
				kind: "inhalt",
				text: "Alarmschwellen und Kriterien sind festgelegt und lösen den Ablauf für Vorfälle aus.",
				requirements: ["dora:Art.10"],
			},
			{
				kind: "inhalt",
				text: "Fallen Protokollierung oder andere Sicherheitssysteme aus, wird sofort alarmiert. Danach wird die Funktion wiederhergestellt, und Ursache und Folgen werden geklärt.",
				requirements: [
					"pci-dss:10.7.1",
					"pci-dss:10.7.2",
					"pci-dss:10.7.3",
					"nist-800-53:AU-5",
					"nist-800-171:3.3.4",
					"cmmc:AU.L2-3.3.4",
				],
			},
			{
				kind: "inhalt",
				text: "Angriffserkennung überwacht den Verkehr am Rand und an kritischen Punkten. Auf Endgeräten erkennt eine EDR-Lösung ungewöhnliche Aktivität.",
				requirements: [
					"pci-dss:11.5.1",
					"nist-800-53:SI-4",
					"nist-csf:DE.CM-01",
					"nist-800-171:3.14.6",
					"cmmc:SI.L2-3.14.6",
					"nycrr-500:500.14(b)(1)",
				],
			},
			{
				kind: "inhalt",
				text: "Unbefugte Änderungen an kritischen Dateien, Software und Daten werden mit Prüfsummen oder Signaturen erkannt.",
				requirements: [
					"pci-dss:11.5.2",
					"nist-800-53:SI-7",
					"nist-csf:DE.CM-09",
				],
			},
			{
				kind: "inhalt",
				text: "Eine Sicherheitszentrale arbeitet rund um die Uhr und sucht aktiv nach Angreifern. Bedrohungsinformationen fließen in die Auswertung ein.",
				requirements: [
					"cmmc:IR.L3-3.6.1e",
					"cmmc:RA.L3-3.11.2e",
					"cmmc:RA.L3-3.11.3e",
					"cmmc:SI.L3-3.14.6e",
					"nist-csf:DE.AE-07",
				],
			},
			{
				kind: "zielgruppe",
				text: "Anmeldeversuche, Fernzugriffe und privilegierte Zugänge werden eigens überwacht: wer wann von wo zugreift.",
				requirements: [
					"hipaa:164.308(a)(5)(ii)(C)",
					"nist-800-171:3.1.12",
					"cmmc:AC.L2-3.1.12",
					"nist-800-171:3.14.7",
					"cmmc:SI.L2-3.14.7",
					"nycrr-500:500.14(a)(1)",
					"nycrr-500:500.7(c)(1)",
					"aws-ftr:ROOT.1",
					"nist-csf:DE.CM-03",
				],
			},
			{
				kind: "zielgruppe",
				text: "Auch Zugriffe und Tätigkeiten externer Dienstleister werden technisch überwacht.",
				requirements: ["nist-csf:DE.CM-06"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
			{
				kind: "zielgruppe",
				text: "Zahlungen werden auf Betrug überwacht, etwa nach Betrag, Muster, Gerät und Listen kompromittierter Daten.",
				requirements: ["zag:RTS-Art.2"],
			},
			{
				kind: "zielgruppe",
				text: "Produkte zeichnen sicherheitsrelevante Zugriffe und Änderungen auf, und Nutzer:innen können das abwählen.",
				requirements: ["cra:AnhI-2l"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "rhythmus",
				text: "Für alle übrigen Systeme legt eine gezielte Risikoanalyse fest, wie oft ihre Protokolle ausgewertet werden.",
				requirements: ["pci-dss:10.4.2", "pci-dss:10.4.2.1"],
			},
			{
				kind: "nachweis",
				text: "Eine Strategie legt Kennzahlen, Häufigkeit und Berichte fest. Berichte entstehen mit Werkzeugen, die die Originale nicht verändern.",
				requirements: [
					"nist-800-53:CA-7",
					"nist-800-53:AU-7",
					"nist-800-171:3.3.6",
					"cmmc:AU.L2-3.3.6",
				],
			},
		],
	},

	"CC-GOV-03": {
		core: "Die Geschäftsleitung trägt die Verantwortung für die Sicherheit, gibt Rahmen und Mittel frei und lässt sich berichten.",
		where: { href: "/beschluesse", label: "Beschlüsse" },
		additions: [
			{
				kind: "inhalt",
				text: "Die Leitung genehmigt Rollen, Budget, die Richtlinie zu Dienstleistern und die Notfallpläne.",
				requirements: ["dora:Art.5(2)"],
				where: { href: "/beschluesse", label: "Beschlüsse" },
			},
			{
				kind: "inhalt",
				text: "Die Leitung billigt die Maßnahmen selbst und haftet für Verstöße. Übertragen darf sie diese Verantwortung nicht.",
				requirements: ["nis2:Art.20(1)"],
			},
			{
				kind: "inhalt",
				text: "Die Leitung lebt Sicherheit vor, fördert eine lernende Kultur und verlangt von allen, die Regeln anzuwenden. Verhaltensregeln stehen fest, und Verstöße werden geahndet.",
				requirements: [
					"bsi-200-1:4.1",
					"iso27001:A.5.4",
					"soc2:CC1.1",
					"nist-csf:GV.RR-01",
				],
			},
			{
				kind: "inhalt",
				text: "Die Leitung beschließt den Sicherheitsprozess und benennt Verantwortliche. Das gilt ebenso für Notfallmanagement und KI.",
				requirements: ["bsi-200-2:3.1", "bsi-200-4:4.1", "iso42001:5.1"],
			},
			{
				kind: "inhalt",
				text: "Eine verantwortliche Leitungsperson gibt jedes System anhand seiner Risiken förmlich für den Betrieb frei.",
				requirements: ["nist-800-53:CA-6", "nist-800-53:PM-10"],
			},
			{
				kind: "zielgruppe",
				text: "Alle Geschäftsleiter:innen sind verantwortlich, egal wie die Zuständigkeiten verteilt sind. Geschäftsverteilung und Vertretung sind festgelegt.",
				requirements: ["zag-marisk:AT3"],
				where: { href: "/organisation?tab=rollen", label: "Rollen & Leitung" },
			},
			{
				kind: "zielgruppe",
				text: "Ein ausreichend unabhängiges Aufsichtsorgan überwacht die internen Kontrollen, prüft Berichte und bestätigt ausreichende Mittel.",
				requirements: ["soc2:CC1.2", "nycrr-500:500.4(d)"],
			},
			{
				kind: "zielgruppe",
				text: "Bei Banken widmen Geschäftsleiter:innen der Leitung genug Zeit und begrenzen ihre Mandate. Bedeutende Institute folgen dem Leitfaden der EZB zur Risikokultur.",
				requirements: ["kwg:§25c-25d", "kwg:EZB-Governance"],
			},
			{
				kind: "zielgruppe",
				text: "Die oder der CISO berichtet schriftlich an das Aufsichtsgremium und informiert zeitnah über wichtige Sicherheitsthemen.",
				requirements: ["nycrr-500:500.4(b)"],
				where: { href: "/berichte", label: "Berichte an die GL" },
			},
			{
				kind: "zielgruppe",
				text: "Bei Dienstleistern für Kartenzahlungen verantwortet die Leitung PCI DSS. Prüfungen der Einhaltung sind mit Ergebnis und Abnahme dokumentiert.",
				requirements: ["pci-dss:12.4.1", "pci-dss:12.4.2", "pci-dss:12.4.2.1"],
			},
			{
				kind: "nachweis",
				text: "Ein Programmplan und die schriftlichen Richtlinien werden von der Leitung freigegeben und regelmäßig aktualisiert.",
				requirements: ["nist-800-53:PM-1", "nycrr-500:500.3"],
				where: { href: "/dokumente", label: "Dokumente" },
			},
			{
				kind: "nachweis",
				text: "Die ranghöchste Führungskraft und die oder der CISO unterschreiben die Bescheinigung an die Aufsicht in New York.",
				requirements: ["nycrr-500:500.17(b)(2)"],
			},
		],
	},

	"CC-RSK-01": {
		core: "Eine schriftliche Methode legt fest, wie Risiken bewertet werden und welche Risiken tragbar sind.",
		where: { href: "/einstellungen?tab=risk", label: "Risikomethodik" },
		additions: [
			{
				kind: "inhalt",
				text: "Die Methode liefert gleichbleibende, vergleichbare Ergebnisse und nennt für jedes Risiko eine verantwortliche Person.",
				requirements: ["iso27001:6.1.2", "nist-csf:GV.RM-06"],
			},
			{
				kind: "inhalt",
				text: "Bewertet werden Bedrohungen, Schwachstellen und Folgen für Betrieb, Ansehen, Werte und Personen. Dabei zählen Vertraulichkeit, Integrität und Verfügbarkeit.",
				requirements: [
					"nist-csf:ID.RA-05",
					"nist-800-171:3.11.1",
					"cmmc:RA.L2-3.11.1",
					"nycrr-500:500.9(b)",
				],
			},
			{
				kind: "inhalt",
				text: "Die Methode legt fest, welche Behandlung passt, etwa mindern oder bewusst akzeptieren.",
				requirements: ["nist-csf:GV.RM-04", "nycrr-500:500.9(b)"],
			},
			{
				kind: "inhalt",
				text: "Neben Risiken werden auch Chancen bestimmt und in die Planung einbezogen.",
				requirements: ["iso27001:6.1.1", "iso42001:6.1.1", "nist-csf:GV.RM-07"],
			},
			{
				kind: "inhalt",
				text: "Eine Richtlinie legt fest, für welche Zielobjekte eine Risikoanalyse nötig ist und wer sie macht. Eine Matrix ergibt die Kategorien gering bis sehr hoch.",
				requirements: ["bsi-200-3:3", "bsi-200-3:5.2"],
				where: { href: "/einstellungen?tab=risk", label: "Risikomethodik" },
			},
			{
				kind: "inhalt",
				text: "Die Ergebnisse fließen in das Risikomanagement des ganzen Unternehmens und in die Planung ein.",
				requirements: ["nist-csf:GV.RM-03", "zag-marisk:AT4.3.2"],
			},
			{
				kind: "zielgruppe",
				text: "Für Risiken der Technik ist eine unabhängige Kontrollfunktion zuständig, nach dem Modell der drei Verteidigungslinien.",
				requirements: ["dora:Art.6(1-4)"],
				where: { href: "/organisation?tab=rollen", label: "Rollen & Leitung" },
			},
			{
				kind: "zielgruppe",
				text: "Banken legen Geschäfts- und Risikostrategie fest, auch für ESG-Risiken, und führen Stresstests durch.",
				requirements: ["kwg:AT4.2-4.3", "kwg:§25a"],
			},
			{
				kind: "zielgruppe",
				text: "Für KI-Risiken gibt es ein eigenes Verfahren mit Kriterien für Eintritt und Folgen.",
				requirements: ["iso42001:6.1.2"],
			},
			{
				kind: "rhythmus",
				text: "Methode und Richtlinie werden regelmäßig und nach Anlässen überprüft, mit einer verantwortlichen Person.",
				requirements: ["nist-800-53:RA-1", "nist-800-53:PM-9"],
			},
			{
				kind: "nachweis",
				text: "Risikoappetit und Toleranz sind schriftlich festgelegt und allen Beteiligten mitgeteilt.",
				requirements: ["nist-csf:GV.RM-02", "nist-800-53:PM-9"],
				where: { href: "/beschluesse", label: "Beschlüsse" },
			},
			{
				kind: "nachweis",
				text: "Zur Methode gehören ein dokumentiertes Risikoregister und ein Behandlungsplan.",
				requirements: ["nis2:Art.21(2)(a)"],
				where: { href: "/risiken", label: "Risiken" },
			},
		],
	},

	"CC-IAM-02": {
		core: "Konten werden bei Eintritt genehmigt angelegt, bei Wechsel angepasst und bei Austritt gesperrt.",
		where: { href: "/team", label: "Team" },
		additions: [
			{
				kind: "inhalt",
				text: "Jede Person hat eine eigene, eindeutige Kennung. Geteilte Konten gibt es höchstens als begründete, befristete Ausnahme, bei AWS gar nicht.",
				requirements: [
					"pci-dss:8.2.1",
					"pci-dss:8.2.2",
					"aws-ftr:IAM.1",
					"hipaa:164.312(a)(2)(i)",
					"nist-800-171:3.5.1",
					"cmmc:IA.L1-3.5.1",
					"nist-800-171:3.3.2",
					"cmmc:AU.L2-3.3.2",
					"iso27001:A.5.16",
				],
			},
			{
				kind: "inhalt",
				text: "Kennungen werden eine festgelegte Zeit lang nicht neu vergeben. Externe sind eindeutig erkannt und als solche gekennzeichnet.",
				requirements: [
					"nist-800-53:IA-4",
					"nist-800-171:3.5.5",
					"cmmc:IA.L2-3.5.5",
					"nist-800-53:IA-8",
				],
			},
			{
				kind: "inhalt",
				text: "Vor der Vergabe eines Kontos wird die Identität der Person geprüft.",
				requirements: ["nist-800-53:IA-12", "nist-csf:PR.AA-02"],
			},
			{
				kind: "inhalt",
				text: "Beim Austritt gibt die Person Geräte, Ausweise, Token und Schlüssel zurück. Ein Gespräch erinnert an Pflichten, die weiter gelten.",
				requirements: [
					"iso27001:A.5.11",
					"iso27001:A.6.5",
					"nist-800-53:PS-4",
					"tisax:4.1.1",
					"nist-800-171:3.9.2",
					"cmmc:PS.L2-3.9.2",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-PERSONAL",
					label: "Vorlage Personalsicherheit",
				},
			},
			{
				kind: "zielgruppe",
				text: "Konten Dritter für Fernzugriff sind nur bei Bedarf offen und werden überwacht. Dienstleister nutzen je Kund:in eigene Zugangsdaten.",
				requirements: ["pci-dss:8.2.7", "pci-dss:8.2.3"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
			{
				kind: "zielgruppe",
				text: "Schlüssel für Kryptowerte werden nach festem Verfahren vergeben und entzogen. Ab Stufe III werden sie beim Ausscheiden unverzüglich ausgetauscht.",
				requirements: ["ccss:1.06"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "rhythmus",
				text: "Beim Austritt wird jeder Zugang sofort entzogen. Das gilt auch, sobald ein Zugang nicht mehr angemessen ist.",
				requirements: [
					"pci-dss:8.2.5",
					"ms-sspa:SEC.1",
					"nycrr-500:500.7(a)(4)",
					"hipaa:164.308(a)(3)(ii)(C)",
				],
			},
			{
				kind: "rhythmus",
				text: "Bei einem Wechsel innerhalb der Firma werden die Rechte binnen fester Frist neu geprüft.",
				requirements: ["nist-800-53:PS-5"],
			},
			{
				kind: "rhythmus",
				text: "Ungenutzte Konten und Schlüssel werden nach einer festgelegten Zeit gesperrt oder entfernt.",
				requirements: [
					"pci-dss:8.2.6",
					"nist-800-171:3.5.6",
					"cmmc:IA.L2-3.5.6",
					"aws-ftr:IAM.6",
					"mvsp:4.2",
					"nist-800-53:AC-2",
				],
			},
			{
				kind: "rhythmus",
				text: "Werden ungünstige Informationen über eine Person bekannt, wird ihr Zugang sofort geprüft und bei Bedarf gesperrt.",
				requirements: ["cmmc:PS.L3-3.9.2e"],
			},
			{
				kind: "nachweis",
				text: "Jedes Anlegen, Ändern und Löschen eines Kontos ist genehmigt und dokumentiert.",
				requirements: [
					"pci-dss:8.2.4",
					"hipaa:164.308(a)(4)(ii)(C)",
					"tisax:4.1.3",
					"cyber-essentials:AC.1",
					"soc2:CC6.2",
				],
			},
		],
	},

	"CC-BCM-05": {
		core: "Notfall- und Wiederanlaufpläne werden regelmäßig geübt, und die Ergebnisse verbessern die Pläne.",
		where: { href: "/testprogramm", label: "Testprogramm" },
		additions: [
			{
				kind: "inhalt",
				text: "Geübt werden auch Cyberangriffe und das Umschalten auf Ersatztechnik. Gezielte Ausfälle zeigen, ob Wiederanlaufzeit und Datenverlust im Rahmen bleiben.",
				requirements: ["dora:Art.11(6)", "aws-ftr:RES.4"],
			},
			{
				kind: "inhalt",
				text: "Ein Übungsplan deckt Alarmierung, Krisenstab, Pläne und Wiederanlauf ab.",
				requirements: ["bsi-200-4:9"],
			},
			{
				kind: "inhalt",
				text: "Zu den Tests gehört die Wiederherstellung kritischer Daten und Systeme aus Sicherungen.",
				requirements: [
					"nycrr-500:500.16(d)",
					"aws-ftr:BAR.2",
					"soc2:A1.3",
					"mvsp:4.4",
				],
			},
			{
				kind: "inhalt",
				text: "Auch die Reaktion auf Sicherheitsvorfälle wird geübt, etwa am Tisch oder als Simulation.",
				requirements: [
					"nist-800-53:IR-3",
					"nist-800-171:3.6.3",
					"cmmc:IR.L2-3.6.3",
					"pci-dss:12.10.2",
				],
			},
			{
				kind: "zielgruppe",
				text: "Wichtige Dienstleister werden mit ihren eigenen Plänen in die Tests einbezogen.",
				requirements: ["dora:Art.11(6)", "nist-csf:ID.IM-02"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
			{
				kind: "zielgruppe",
				text: "An den Tests nehmen alle wichtigen Beteiligten teil, auch die ranghöchste Führungskraft.",
				requirements: ["nycrr-500:500.16(d)"],
			},
			{
				kind: "zielgruppe",
				text: "Praktische Übungen richten sich nach Rollen und aktuellen Bedrohungen. Beteiligte und ihre Vorgesetzten bekommen Rückmeldung.",
				requirements: ["cmmc:AT.L3-3.2.2e"],
			},
			{
				kind: "rhythmus",
				text: "Zusätzlich wird nach jeder wesentlichen Änderung an Systemen für kritische Funktionen getestet.",
				requirements: ["dora:Art.11(6)"],
			},
			{
				kind: "rhythmus",
				text: "Wer Aufgaben im Notfall oder bei Vorfällen übernimmt, wird binnen fester Frist geschult und danach regelmäßig.",
				requirements: ["nist-800-53:CP-3", "nist-800-53:IR-2"],
				where: { href: "/schulungen", label: "Schulungen" },
			},
			{
				kind: "nachweis",
				text: "Jede Übung ist mit Ergebnis und abgeleiteten Maßnahmen dokumentiert.",
				requirements: [
					"iso27001:A.5.30",
					"nist-800-53:CP-4",
					"hipaa:164.308(a)(7)(ii)(D)",
				],
			},
		],
	},

	"CC-LOG-03": {
		core: "Ein Konzept legt fest, was protokolliert wird, wie lange Protokolle bleiben und wie sie geschützt sind.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-LOGGING",
			label: "Vorlage Protokollierung",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Protokolliert werden Anmeldungen, Lesen, Ändern und Löschen, Änderungen an Sicherheitseinstellungen und Zugriffe des Anbieters. Jeder Eintrag nennt Person, IP-Adresse, Zeit, Aktion und Objekt.",
				requirements: ["mvsp:2.7"],
			},
			{
				kind: "inhalt",
				text: "Protokolle enthalten keine sensiblen Daten. Werden Beschäftigte erfasst, ist das verhältnismäßig und für sie nachvollziehbar.",
				requirements: ["mvsp:2.7", "dsgvo:BDSG-§26"],
			},
			{
				kind: "inhalt",
				text: "Protokolle werden zentral gesammelt und für die laufende Überwachung bereitgestellt.",
				requirements: ["nycrr-500:500.14(b)(2)", "nist-csf:PR.PS-04"],
			},
			{
				kind: "inhalt",
				text: "Nur ein kleiner Kreis darf die Protokollierung verwalten, etwa über ein eigenes Konto für Protokolle.",
				requirements: [
					"nist-800-171:3.3.9",
					"cmmc:AU.L2-3.3.9",
					"aws-ftr:LOG.2",
				],
			},
			{
				kind: "inhalt",
				text: "Der Speicher reicht, damit bis zum Ende der Aufbewahrung nichts verloren geht.",
				requirements: ["nist-800-53:AU-4"],
			},
			{
				kind: "inhalt",
				text: "Die Protokolle der letzten drei Monate sind sofort verfügbar.",
				requirements: ["pci-dss:10.5.1"],
			},
			{
				kind: "zielgruppe",
				text: "Wesentliche Finanztransaktionen lassen sich aus den Aufzeichnungen nachträglich rekonstruieren.",
				requirements: ["nycrr-500:500.6"],
			},
			{
				kind: "zielgruppe",
				text: "In AWS zeichnet CloudTrail alle Konten und Regionen auf, auch globale Dienste.",
				requirements: ["aws-ftr:LOG.1"],
			},
			{
				kind: "zielgruppe",
				text: "Für KI-Systeme ist festgelegt, wann Ereignisse protokolliert werden.",
				requirements: ["iso42001:A.6.2.8"],
			},
			{
				kind: "zielgruppe",
				text: "Bei der Verwahrung von Kryptowerten werden Protokolle ab Stufe II gesichert und manipulationssicher aufbewahrt.",
				requirements: ["ccss:2.04"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "rhythmus",
				text: "Welche Ereignisse protokolliert werden, wird mit den Fachbereichen abgestimmt und regelmäßig angepasst.",
				requirements: [
					"nist-800-53:AU-2",
					"nist-800-171:3.3.3",
					"cmmc:AU.L2-3.3.3",
				],
			},
			{
				kind: "nachweis",
				text: "Richtlinie und Verfahren zur Protokollierung sind verteilt, und eine Person ist dafür verantwortlich.",
				requirements: ["nist-800-53:AU-1"],
			},
		],
	},

	"CC-GOV-04": {
		core: "Umfeld, Beteiligte mit ihren Anforderungen und der Geltungsbereich sind schriftlich festgelegt.",
		where: { href: "/organisation?tab=kontext", label: "Kontext & Parteien" },
		additions: [
			{
				kind: "inhalt",
				text: "Für jede Anforderung der Beteiligten ist festgelegt, ob das Managementsystem sie abdeckt.",
				requirements: ["iso27001:4.2", "nist-csf:GV.OC-02"],
			},
			{
				kind: "inhalt",
				text: "Der Geltungsbereich nennt auch Schnittstellen und Abhängigkeiten zu Tätigkeiten anderer Firmen.",
				requirements: ["iso27001:4.3"],
				where: {
					href: "/organisation?tab=geltungsbereich",
					label: "Geltungsbereich",
				},
			},
			{
				kind: "inhalt",
				text: "Zum Geltungsbereich gehören alle Geräte, Netze und Cloud-Dienste mit Internetzugang.",
				requirements: ["cyber-essentials:SC.1"],
			},
			{
				kind: "inhalt",
				text: "Nach BSI wird die Absicherung gewählt und begründet: Basis, Standard oder Kern. Bei der Kern-Absicherung sind die Kronjuwelen festgelegt.",
				requirements: ["bsi-200-2:3.2", "bsi-200-2:6.1", "bsi-200-2:7.1"],
				where: {
					href: "/einstellungen?tab=frameworks",
					label: "Rahmenwerke & Stufe",
				},
			},
			{
				kind: "inhalt",
				text: "Die Anforderungen werden passend zu Art, Umfang und Risiko des Geschäfts umgesetzt, und die Entscheidung ist dokumentiert.",
				requirements: ["zag-marisk:AT1-2"],
			},
			{
				kind: "zielgruppe",
				text: "Für jedes Produkt mit digitalen Elementen ist festgehalten, ob der CRA gilt und welche Rolle die Firma hat.",
				requirements: ["cra:Art.2-3"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Jeder Zahlungs- oder Kryptodienst ist der passenden Erlaubnis zugeordnet. Für Kryptodienste liegen Sitz und tatsächliche Leitung in der EU.",
				requirements: ["zag:§1(1)", "micar:Art.59"],
				where: { href: "/antrag", label: "Erlaubnisantrag" },
			},
			{
				kind: "zielgruppe",
				text: "Je US-Bundesstaat wird geprüft, ob die Schwellen der Datenschutzgesetze erreicht sind, für Kalifornien jährlich.",
				requirements: ["ccpa:SC.1", "us-privacy:SC.1"],
			},
			{
				kind: "zielgruppe",
				text: "Für KI wird die eigene Rolle bestimmt: Anbieter, Betreiber oder Nutzer. Anforderungen wie der EU AI Act und Erwartungen der Kundschaft fließen ein.",
				requirements: ["iso42001:4.1", "iso42001:4.2", "iso42001:A.10.4"],
			},
			{
				kind: "nachweis",
				text: "Die Prüfung, ob NIS2 gilt oder ein vereinfachter DORA-Rahmen möglich ist, ist dokumentiert.",
				requirements: ["nis2:Anlage1", "dora:Art.16"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=KZ-NIS2-BETROFFENHEIT",
					label: "Vorlage NIS2-Betroffenheit",
				},
			},
		],
	},

	"CC-GOV-08": {
		core: "Wichtige Dokumente sind gelenkt: mit Version, Freigabe, Verteilung und nachvollziehbaren Änderungen.",
		where: { href: "/dokumente", label: "Dokumente" },
		additions: [
			{
				kind: "inhalt",
				text: "Dokumente sind gekennzeichnet, geschützt und für Berechtigte verfügbar.",
				requirements: ["iso27001:7.5", "iso42001:7.5", "bsi-200-2:5"],
			},
			{
				kind: "zielgruppe",
				text: "Richtlinien sind den Mitarbeitenden bekannt und für die Zuständigen jederzeit zugänglich.",
				requirements: ["zag-marisk:AT5", "hipaa:164.316(b)(2)(ii)"],
				where: { href: "/richtlinien", label: "Richtlinien" },
			},
			{
				kind: "zielgruppe",
				text: "Technische Dokumentation und Konformitätserklärung eines Produkts bleiben zehn Jahre erhalten, bei längerem Unterstützungszeitraum länger. Darin stehen Name, Anschrift und eine Kontaktstelle für Schwachstellen.",
				requirements: ["cra:Art.13(12-13)"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Nur berechtigte Personen veröffentlichen Inhalte, und diese werden vorher auf Vertrauliches geprüft.",
				requirements: ["nist-800-53:AC-22"],
			},
			{
				kind: "zielgruppe",
				text: "Für Administration und Nutzung gibt es geschützte Anleitungen zu sicherer Einrichtung und bekannten Schwachstellen.",
				requirements: ["nist-800-53:SA-5"],
			},
			{
				kind: "zielgruppe",
				text: "Die Datenschutzerklärung nennt die Pflichtinhalte, ist leicht lesbar und barrierefrei.",
				requirements: ["ccpa:NT.2"],
			},
			{
				kind: "rhythmus",
				text: "Dokumente werden zeitnah angepasst, wenn sich Anforderungen, Bedrohungen, Technik oder Betrieb ändern.",
				requirements: [
					"zag-marisk:AT5",
					"nist-csf:GV.PO-02",
					"hipaa:164.316(b)(2)(iii)",
					"iso42001:A.2.4",
				],
			},
			{
				kind: "rhythmus",
				text: "Bei Richtlinien beginnt die Aufbewahrungsfrist mit dem Ende ihrer Gültigkeit, wenn das später als die Erstellung ist.",
				requirements: ["hipaa:164.316(b)(2)(i)"],
			},
			{
				kind: "nachweis",
				text: "Unterlagen sind so geführt, dass sachkundige Dritte sie in angemessener Zeit nachvollziehen. Für Kassensysteme gibt es dazu eine Verfahrensdokumentation.",
				requirements: ["zag-marisk:AT6", "kassen:GoBD"],
			},
			{
				kind: "nachweis",
				text: "Folgenabschätzungen werden festgehalten, aufbewahrt und der Behörde auf Anfrage vorgelegt.",
				requirements: ["iso42001:A.5.3", "us-privacy:AS.2"],
			},
			{
				kind: "nachweis",
				text: "Wird eine adressierbare HIPAA-Vorgabe nicht umgesetzt, sind Gründe und gleichwertige Alternative dokumentiert.",
				requirements: ["hipaa:164.306(d)(3)"],
			},
			{
				kind: "nachweis",
				text: "Auch Entscheidungen, Berichte an die Leitung und Belege für Bescheinigungen werden aufbewahrt.",
				requirements: ["bsi-200-1:7.4", "nycrr-500:500.17(b)(2)"],
			},
		],
	},

	"CC-OPS-04": {
		core: "Systeme werden nach festen, sicheren Vorgaben eingerichtet, und Abweichungen werden erkannt.",
		additions: [
			{
				kind: "inhalt",
				text: "Standardkonten der Hersteller sind entfernt oder gesperrt, Standardpasswörter geändert.",
				requirements: ["pci-dss:2.2.2", "cyber-essentials:CF.2"],
			},
			{
				kind: "inhalt",
				text: "Nur nötige Dienste, Ports und Programme sind aktiv, alles andere ist entfernt oder abgeschaltet.",
				requirements: [
					"pci-dss:2.2.4",
					"cyber-essentials:CF.1",
					"nist-800-53:CM-7",
					"nist-800-171:3.4.6",
					"nist-800-171:3.4.7",
					"cmmc:CM.L2-3.4.6",
					"cmmc:CM.L2-3.4.7",
				],
			},
			{
				kind: "inhalt",
				text: "Unsichere Dienste laufen nur mit dokumentiertem Bedarf und zusätzlichem Schutz. Fernsteuerung von Geräten ist abgeschaltet oder sicher eingerichtet.",
				requirements: ["pci-dss:2.2.5", "nycrr-500:500.7(a)(5)"],
			},
			{
				kind: "inhalt",
				text: "Funktionen mit unterschiedlichem Schutzbedarf laufen getrennt oder gefährden sich nicht gegenseitig.",
				requirements: ["pci-dss:2.2.3"],
			},
			{
				kind: "inhalt",
				text: "Falsch eingerichtete Komponenten werden automatisch erkannt und entfernt oder in ein eigenes Netz verschoben.",
				requirements: ["cmmc:CM.L3-3.4.2e", "soc2:CC7.1"],
			},
			{
				kind: "zielgruppe",
				text: "Auf Arbeitsplätzen sind Office-Makros aus dem Internet gesperrt, Browser blockieren Java und Werbung. Alte Komponenten wie Internet Explorer sind entfernt.",
				requirements: [
					"essential-eight:MA.1",
					"essential-eight:MA.2",
					"essential-eight:UH.1",
					"essential-eight:UH.2",
					"essential-eight:UH.3",
				],
			},
			{
				kind: "zielgruppe",
				text: "Produkte kommen sicher voreingestellt und lassen sich in den Ursprungszustand zurücksetzen.",
				requirements: ["cra:AnhI-2b"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "In AWS ist öffentlicher Zugriff auf Speicher gesperrt, Ausnahmen nur mit dokumentiertem Grund.",
				requirements: ["aws-ftr:S3.2"],
			},
			{
				kind: "rhythmus",
				text: "Die Vorgaben werden bei neuen Bedrohungen und bei Änderungen am System aktualisiert.",
				requirements: ["pci-dss:2.2.1", "nist-800-53:CM-2"],
			},
			{
				kind: "nachweis",
				text: "Für jedes System gibt es eine freigegebene Basiskonfiguration und ein Inventar aus Hardware, Software und Firmware.",
				requirements: [
					"nist-800-171:3.4.1",
					"cmmc:CM.L2-3.4.1",
					"cmmc:CM.L3-3.4.1e",
					"nist-800-53:CM-2",
				],
				where: { href: "/assets", label: "Inventar" },
			},
			{
				kind: "nachweis",
				text: "Ein Plan regelt Rollen, Abläufe und die verwalteten Konfigurationen und schützt sie vor unbefugter Änderung.",
				requirements: ["nist-800-53:CM-9", "nist-800-53:CM-1"],
			},
			{
				kind: "nachweis",
				text: "Abweichungen von den sicheren Einstellungen sind begründet, und Änderungen werden überwacht.",
				requirements: ["nist-800-53:CM-6"],
			},
		],
	},

	"CC-NET-01": {
		core: "Netze sind nach Schutzbedarf getrennt, und Verbindungen zwischen ihnen sind auf das Nötige beschränkt.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-NETZ",
			label: "Vorlage Netzsicherheit",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Gesperrt ist alles, was nicht erlaubt ist. Jeder erlaubte Port hat einen Grund, unsichere bekommen zusätzlichen Schutz.",
				requirements: [
					"cyber-essentials:FW.2",
					"nist-800-53:SC-7",
					"pci-dss:1.2.5",
					"pci-dss:1.2.6",
				],
			},
			{
				kind: "inhalt",
				text: "Bei einem Angriff lassen sich betroffene Teile automatisch isolieren.",
				requirements: ["dora:Art.9(4)(b)"],
			},
			{
				kind: "inhalt",
				text: "Öffentlich erreichbare Systeme liegen in eigenen Netzen, Datenbanken und Anwendungsserver in privaten.",
				requirements: [
					"nist-800-171:3.13.5",
					"cmmc:SC.L1-3.13.5",
					"aws-ftr:NET.2",
				],
			},
			{
				kind: "inhalt",
				text: "Funktionen für die Verwaltung sind von denen für die normale Nutzung getrennt.",
				requirements: [
					"nist-800-53:SC-2",
					"nist-800-171:3.13.3",
					"cmmc:SC.L2-3.13.3",
				],
			},
			{
				kind: "inhalt",
				text: "Datenflüsse zwischen Bereichen folgen genehmigten Regeln und laufen über gesicherte Übergänge wie Filter und Gateways.",
				requirements: [
					"nist-800-53:AC-4",
					"nist-800-171:3.1.3",
					"cmmc:AC.L2-3.1.3",
					"cmmc:AC.L3-3.1.3e",
				],
			},
			{
				kind: "zielgruppe",
				text: "Funknetze sind erst nach Freigabe erlaubt und mit Anmeldung und Verschlüsselung geschützt.",
				requirements: [
					"nist-800-53:AC-18",
					"nist-800-171:3.1.16",
					"cmmc:AC.L2-3.1.16",
					"nist-800-171:3.1.17",
					"cmmc:AC.L2-3.1.17",
				],
			},
			{
				kind: "zielgruppe",
				text: "Verbindungen zu fremden Systemen, private Geräte und Internettelefonie sind begrenzt und überwacht. Entfernte Geräte hängen nie zugleich am Firmennetz und direkt im Internet.",
				requirements: [
					"nist-800-171:3.1.20",
					"cmmc:AC.L1-3.1.20",
					"nist-800-171:3.13.14",
					"cmmc:SC.L2-3.13.14",
					"nist-800-171:3.13.7",
					"cmmc:SC.L2-3.13.7",
				],
			},
			{
				kind: "zielgruppe",
				text: "Nur bekannte, angemeldete Geräte dürfen sich verbinden. Besondere Geräte wie IoT oder Steuerungstechnik liegen in eigenen Netzen.",
				requirements: [
					"nist-800-53:IA-3",
					"cmmc:IA.L3-3.5.3e",
					"cmmc:SI.L3-3.14.3e",
				],
			},
			{
				kind: "zielgruppe",
				text: "Anbieter für mehrere Kund:innen trennen deren Umgebungen, sodass niemand fremde Daten erreicht. Ein Penetrationstest bestätigt die Trennung regelmäßig.",
				requirements: [
					"pci-dss:A1.1.1",
					"pci-dss:A1.1.2",
					"pci-dss:A1.1.3",
					"pci-dss:A1.1.4",
				],
			},
			{
				kind: "zielgruppe",
				text: "Eine Abrechnungsstelle für Gesundheitsdaten ist vom Rest der Organisation abgetrennt.",
				requirements: ["hipaa:164.308(a)(4)(ii)(A)"],
			},
			{
				kind: "nachweis",
				text: "Ein aktueller Netzplan zeigt alle Verbindungen und Datenflüsse, auch drahtlose.",
				requirements: [
					"pci-dss:1.2.3",
					"nist-csf:ID.AM-03",
					"nist-800-53:CA-9",
				],
			},
			{
				kind: "nachweis",
				text: "Änderungen an Firewall-Regeln laufen über das Änderungsverfahren. Die gespeicherte Konfiguration stimmt mit der aktiven überein.",
				requirements: ["pci-dss:1.2.1", "pci-dss:1.2.2", "pci-dss:1.2.8"],
				where: { href: "/aenderungen", label: "Änderungen" },
			},
		],
	},

	"CC-DEV-04": {
		core: "Anwendungen und Systeme werden regelmäßig auf Sicherheit getestet, und Befunde werden behoben.",
		where: { href: "/sicherheit?tab=auftraege", label: "Sicherheitsaufträge" },
		additions: [
			{
				kind: "inhalt",
				text: "Getestet wird von innen und außen durch qualifizierte, unabhängige Personen nach einer anerkannten Methodik.",
				requirements: [
					"nycrr-500:500.5(a)(1)",
					"pci-dss:11.4.1",
					"nist-800-53:CA-8",
					"ccss:2.01",
					"mvsp:1.4",
				],
			},
			{
				kind: "inhalt",
				text: "Das Testprogramm mischt Testarten, etwa Schwachstellenscans, Prüfung von Quellcode, Szenarien und Penetrationstests.",
				requirements: ["dora:Art.25"],
				where: { href: "/testprogramm", label: "Testprogramm" },
			},
			{
				kind: "inhalt",
				text: "Die Entwicklung testet nach Testplan und dokumentiert die Ergebnisse. KI-Systeme werden vor dem Einsatz gegen festgelegte Kriterien geprüft.",
				requirements: ["nist-800-53:SA-11", "iso42001:A.6.2.4", "soc2:CC8.1"],
			},
			{
				kind: "zielgruppe",
				text: "Wo Segmentierung die Kartendaten abgrenzt, wird auch sie getestet, ebenso nach Änderungen.",
				requirements: ["pci-dss:11.4.5", "pci-dss:11.4.6"],
			},
			{
				kind: "zielgruppe",
				text: "Vor öffentlichen Webanwendungen steht eine automatische Abwehr, etwa eine WAF.",
				requirements: ["pci-dss:6.4.1", "pci-dss:6.4.2"],
			},
			{
				kind: "zielgruppe",
				text: "Produkte kommen ohne bekannte ausnutzbare Schwachstellen auf den Markt.",
				requirements: ["cra:AnhI-2a", "cra:AnhI-II-3"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Kund:innen dürfen das Produkt selbst testen lassen, oder es gibt dafür eine Umgebung ohne echte Daten.",
				requirements: ["mvsp:1.2", "pci-dss:11.4.7"],
			},
			{
				kind: "zielgruppe",
				text: "Auch zugekaufte Anwendungen werden nach schriftlichem Verfahren auf Sicherheit geprüft.",
				requirements: ["nycrr-500:500.8"],
			},
			{
				kind: "zielgruppe",
				text: "Für bedrohungsgeleitete Penetrationstests zählen nur erfahrene Tester:innen mit Zertifikat oder festen Verhaltensregeln. Dazu gehört eine angemessene Berufshaftpflicht.",
				requirements: ["dora:Art.27"],
			},
			{
				kind: "zielgruppe",
				text: "Für Cyber Essentials Plus prüft die Zertifizierungsstelle Stichproben von Geräten und die Systeme mit Internetzugang von außen.",
				requirements: ["cyber-essentials:PL.1", "cyber-essentials:PL.2"],
			},
			{
				kind: "rhythmus",
				text: "Zusätzlich wird nach jeder wesentlichen Änderung getestet und sobald neue Schwachstellen bekannt werden.",
				requirements: [
					"pci-dss:11.4.2",
					"pci-dss:11.4.3",
					"cmmc:CA.L3-3.12.1e",
					"nist-800-171:3.11.2",
					"cmmc:RA.L2-3.11.2",
				],
			},
			{
				kind: "nachweis",
				text: "Ausnutzbare Schwachstellen werden behoben, und ein erneuter Test bestätigt die Behebung.",
				requirements: ["pci-dss:11.4.4", "ccss:2.01"],
				where: { href: "/sicherheit?tab=befunde", label: "Befunde" },
			},
		],
	},

	"CC-GOV-05": {
		core: "Messbare Ziele werden verfolgt, und die Leitung bewertet das Managementsystem in geplanten Abständen.",
		where: { href: "/managementbewertung", label: "Managementbewertung" },
		additions: [
			{
				kind: "inhalt",
				text: "Für jedes Ziel ist geplant, was getan wird, mit welchen Mitteln, durch wen und bis wann.",
				requirements: ["iso27001:6.2"],
				where: { href: "/organisation?tab=ziele", label: "Ziele & Kennzahlen" },
			},
			{
				kind: "inhalt",
				text: "Festgelegt ist, was wie, wann und durch wen gemessen und ausgewertet wird.",
				requirements: ["iso27001:9.1", "iso42001:9.1", "nist-800-53:CA-7"],
			},
			{
				kind: "inhalt",
				text: "Die Bewertung nutzt feste Eingaben: offene Maßnahmen, Kontext, Messwerte, Auditergebnisse, Rückmeldungen und Risiken.",
				requirements: ["iso27001:9.3", "iso42001:9.3"],
				where: { href: "/managementbewertung", label: "Managementbewertung" },
			},
			{
				kind: "inhalt",
				text: "Kennzahlen, Revisionen und Übungen zeigen, ob die Sicherheitsmaßnahmen wirken.",
				requirements: ["nis2:Art.21(2)(f)", "bsi-200-1:4.3", "bsi-200-2:10.1"],
			},
			{
				kind: "inhalt",
				text: "Die Ergebnisse steuern Anpassungen der Strategie, damit sie alle Anforderungen und Risiken abdeckt.",
				requirements: [
					"nist-csf:GV.OV-01",
					"nist-csf:GV.OV-02",
					"nist-csf:GV.OV-03",
				],
			},
			{
				kind: "inhalt",
				text: "Tests, Schulungen und Überwachung sind gemeinsam geplant und auf die Risikostrategie abgestimmt.",
				requirements: ["nist-800-53:PM-14"],
			},
			{
				kind: "zielgruppe",
				text: "Für KI gibt es eigene Ziele zur verantwortungsvollen Entwicklung und Nutzung.",
				requirements: ["iso42001:6.2", "iso42001:A.6.1.2", "iso42001:A.9.3"],
			},
			{
				kind: "zielgruppe",
				text: "Die Leitung wird regelmäßig über Stand, Risiken und Vorfälle informiert. In New York berichtet die oder der CISO dem Aufsichtsgremium schriftlich.",
				requirements: ["bsi-200-1:4.2", "nycrr-500:500.4(b)"],
				where: { href: "/berichte", label: "Berichte an die GL" },
			},
			{
				kind: "zielgruppe",
				text: "Personen stehen für ihre Aufgaben im Kontrollsystem ein, und Leistung und Anreize berücksichtigen das.",
				requirements: ["soc2:CC1.5"],
			},
			{
				kind: "rhythmus",
				text: "Das Notfallmanagement wird auch nach jedem Notfall überprüft.",
				requirements: ["bsi-200-4:10"],
			},
			{
				kind: "nachweis",
				text: "Messergebnisse und das Protokoll der Bewertung mit Entscheidungen werden aufbewahrt.",
				requirements: ["iso27001:9.1", "iso27001:9.3"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=BE-MANAGEMENTBEWERTUNG",
					label: "Vorlage Protokoll",
				},
			},
		],
	},

	"CC-AST-02": {
		core: "Informationen werden nach Schutzbedarf eingestuft, gekennzeichnet und danach behandelt.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-ASSETS",
			label: "Vorlage Klassifizierung",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Die Einstufung beruht auf Vertraulichkeit, Integrität, Verfügbarkeit und den Anforderungen der Beteiligten.",
				requirements: ["iso27001:A.5.12"],
			},
			{
				kind: "inhalt",
				text: "Der Schutzbedarf wird aus Schadensszenarien bestimmt und auf Anwendungen, Systeme, Räume und Verbindungen vererbt.",
				requirements: ["bsi-200-2:8.2"],
			},
			{
				kind: "inhalt",
				text: "Vor dem Teilen lässt sich prüfen, ob Empfänger:innen die nötigen Rechte haben.",
				requirements: ["nist-800-53:AC-21"],
			},
			{
				kind: "zielgruppe",
				text: "Auch Geschäftsfunktionen und die Technik dahinter werden mit ihren Abhängigkeiten eingestuft und nach Bedeutung priorisiert.",
				requirements: ["dora:Art.8(1-4)", "nist-csf:ID.AM-05"],
				where: { href: "/prozesse", label: "Prozesse" },
			},
			{
				kind: "zielgruppe",
				text: "Datenträger tragen Angaben zu Schutzbedarf, Umgang und erlaubter Verbreitung.",
				requirements: [
					"nist-800-53:MP-3",
					"nist-800-171:3.8.4",
					"cmmc:MP.L2-3.8.4",
				],
			},
			{
				kind: "zielgruppe",
				text: "Nur benannte Personen veröffentlichen Inhalte, und vorher wird geprüft, dass nichts Vertrauliches dabei ist.",
				requirements: [
					"nist-800-53:AC-22",
					"nist-800-171:3.1.22",
					"cmmc:AC.L1-3.1.22",
				],
			},
			{
				kind: "zielgruppe",
				text: "Eine Liste zeigt, welche sensiblen Daten wo verarbeitet werden. Für sie gelten strengere Regeln, oft mit ausdrücklicher Einwilligung.",
				requirements: [
					"aws-ftr:DAT.1",
					"mvsp:3.1",
					"ccpa:SC.2",
					"eu-us-dpf:S1",
				],
			},
			{
				kind: "zielgruppe",
				text: "Vertrauliche Informationen von Kund:innen werden so geschützt, wie es die Zusagen an sie verlangen.",
				requirements: ["soc2:C1.1"],
			},
			{
				kind: "zielgruppe",
				text: "Für Prototypen gibt es Geheimhaltung, Einstufung, Verantwortliche und geschulte Beschäftigte.",
				requirements: ["tisax:8.2"],
			},
			{
				kind: "nachweis",
				text: "Die Einstufung ist begründet, dokumentiert und von der Leitung bestätigt.",
				requirements: ["nist-800-53:RA-2"],
			},
		],
	},

	"CC-IAM-05": {
		core: "Verantwortliche prüfen regelmäßig alle Zugriffsrechte und entziehen, was nicht mehr nötig ist.",
		where: { href: "/team", label: "Zugriffsprüfung" },
		additions: [
			{
				kind: "inhalt",
				text: "Geprüft wird gegen Rollen, geringste Rechte und Aufgabentrennung.",
				requirements: [
					"soc2:CC6.3",
					"nist-csf:PR.AA-05",
					"tisax:4.2.1",
					"ms-sspa:SEC.1",
				],
			},
			{
				kind: "inhalt",
				text: "Bei der Prüfung werden ungenutzte und unnötige Konten gesperrt oder entfernt.",
				requirements: [
					"nycrr-500:500.7(a)(4)",
					"nist-800-171:3.5.6",
					"cmmc:IA.L2-3.5.6",
					"aws-ftr:IAM.7",
				],
			},
			{
				kind: "inhalt",
				text: "Ungewöhnliche Anmeldungen und Zugriffe zu ungewohnten Zeiten werden erkannt.",
				requirements: ["nist-800-171:3.14.7", "cmmc:SI.L2-3.14.7"],
			},
			{
				kind: "zielgruppe",
				text: "Auch Rechte von System- und Anwendungskonten werden geprüft. Wie oft, legt eine gezielte Risikoanalyse fest.",
				requirements: ["pci-dss:7.2.5.1"],
			},
			{
				kind: "zielgruppe",
				text: "Verwaltungsrechte gibt es nur nach Prüfung, und sie werden regelmäßig neu geprüft. Verwaltungskonten haben keinen Zugang zu Mail und Internet.",
				requirements: ["essential-eight:RA.1"],
			},
			{
				kind: "rhythmus",
				text: "Beim Austritt werden Rechte sofort entzogen, ohne auf die nächste Prüfung zu warten.",
				requirements: ["ms-sspa:SEC.1", "nycrr-500:500.7(a)(4)"],
			},
			{
				kind: "nachweis",
				text: "Jede Prüfung ist mit Ergebnis und entzogenen Rechten dokumentiert. Für PCI DSS bestätigt die Leitung das Ergebnis.",
				requirements: [
					"hipaa:164.308(a)(4)(ii)(C)",
					"nist-800-53:AC-2",
					"pci-dss:7.2.4",
				],
				where: { href: "/team", label: "Zugriffsprüfung" },
			},
		],
	},

	"CC-HR-01": {
		core: "Vor Einstellung oder Zugang werden Personen passend zum Risiko der Stelle überprüft.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-PERSONAL",
			label: "Vorlage Personalsicherheit",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Jede Stelle hat eine Risikostufe, nach der sich die Überprüfung richtet. Die Einstufung wird regelmäßig geprüft.",
				requirements: ["nist-800-53:PS-2"],
			},
			{
				kind: "inhalt",
				text: "Geprüft wird nur im rechtlich zulässigen Rahmen.",
				requirements: ["pci-dss:12.7.1", "iso27001:A.6.1"],
			},
			{
				kind: "inhalt",
				text: "Vor der Vergabe eines Kontos wird die Identität geprüft und die Adresse bestätigt.",
				requirements: ["nist-800-53:IA-12", "nist-csf:PR.AA-02"],
			},
			{
				kind: "inhalt",
				text: "Personal reicht nach Zahl und Qualifikation für die Aufgaben, und Vertretungen sind geregelt.",
				requirements: ["zag-marisk:AT7.1", "soc2:CC1.4"],
			},
			{
				kind: "inhalt",
				text: "Sicherheit gehört in alle Personalprozesse, von der Einstellung bis zum Austritt.",
				requirements: ["nist-csf:GV.RR-04"],
			},
			{
				kind: "zielgruppe",
				text: "Mitarbeitende werden nach dem Geldwäschegesetz auf Zuverlässigkeit geprüft.",
				requirements: ["gwg:§6"],
				where: { href: "/aml", label: "Geldwäsche" },
			},
			{
				kind: "zielgruppe",
				text: "Wer Schlüssel für Kryptowerte hält, wird ab Stufe II vorab überprüft, ab Stufe III auch auf Identität und Integrität.",
				requirements: ["ccss:1.06"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "zielgruppe",
				text: "Auch Entwickelnde mit Zugriff auf das System sind überprüft.",
				requirements: ["nist-800-53:SA-21"],
			},
			{
				kind: "zielgruppe",
				text: "Bei Gesundheitsdaten wird vor dem Zugang geprüft, ob er für die Person angemessen ist.",
				requirements: ["hipaa:164.308(a)(3)(ii)(B)"],
			},
			{
				kind: "rhythmus",
				text: "Die Überprüfung wird fortgesetzt und unter festgelegten Bedingungen wiederholt. Bei ungünstigen Hinweisen wird der Zugang sofort geprüft.",
				requirements: [
					"iso27001:A.6.1",
					"nist-800-53:PS-3",
					"cmmc:PS.L3-3.9.2e",
				],
			},
		],
	},

	"CC-PHY-05": {
		core: "Geräte werden kontrolliert gewartet, und Datenträger werden vor Entsorgung oder Wiederverwendung sicher gelöscht oder vernichtet.",
		where: { href: "/assets", label: "Inventar" },
		additions: [
			{
				kind: "inhalt",
				text: "Wartungswerkzeuge sind freigegeben, vor Gebrauch auf Schadsoftware geprüft und verlassen das Gelände ohne Daten.",
				requirements: [
					"nist-800-53:MA-3",
					"nist-800-171:3.7.2",
					"cmmc:MA.L2-3.7.2",
				],
			},
			{
				kind: "inhalt",
				text: "Gelöscht wird nach anerkanntem Verfahren, etwa NIST SP 800-88, sodass nichts wiederherstellbar ist.",
				requirements: [
					"mvsp:1.8",
					"pci-dss:9.4.7",
					"nist-800-53:MP-6",
					"nist-800-171:3.8.3",
					"cmmc:MP.L1-3.8.3",
				],
			},
			{
				kind: "inhalt",
				text: "Systemteile sind über ihren ganzen Lebenszyklus gegen Manipulation geschützt.",
				requirements: ["nist-800-53:SR-9"],
			},
			{
				kind: "zielgruppe",
				text: "Nur berechtigtes Personal wartet, und Personen ohne eigene Berechtigung werden beaufsichtigt.",
				requirements: [
					"nist-800-53:MA-5",
					"nist-800-171:3.7.6",
					"cmmc:MA.L2-3.7.6",
				],
			},
			{
				kind: "zielgruppe",
				text: "Papier mit Kartendaten wird geschreddert oder anders vernichtet und bis dahin sicher verwahrt.",
				requirements: ["pci-dss:9.4.6"],
			},
			{
				kind: "zielgruppe",
				text: "Geräte mit Schlüsselmaterial werden nach eigener Richtlinie gelöscht, ab Stufe II mit Nachweis je Löschung.",
				requirements: ["ccss:2.02"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "zielgruppe",
				text: "Mobile Datenträger werden sicher genutzt, transportiert und entsorgt.",
				requirements: ["tisax:3.1.3"],
			},
			{
				kind: "rhythmus",
				text: "Geräte für Arbeiten außer Haus werden vorher gelöscht und danach geprüft.",
				requirements: [
					"nist-800-53:MA-2",
					"nist-800-171:3.7.3",
					"cmmc:MA.L2-3.7.3",
				],
			},
			{
				kind: "nachweis",
				text: "Wartung ist geplant, freigegeben und dokumentiert.",
				requirements: [
					"nist-800-171:3.7.1",
					"cmmc:MA.L2-3.7.1",
					"nist-800-53:MA-2",
					"nist-800-53:MA-1",
				],
			},
			{
				kind: "nachweis",
				text: "Bei hohem Schutzbedarf wird jede Löschung geprüft und dokumentiert. Löschungen für Microsoft werden bestätigt.",
				requirements: ["nist-800-53:MP-6", "ms-sspa:RET.2"],
			},
			{
				kind: "nachweis",
				text: "Reparaturen an Türen, Schlössern und Wänden werden dokumentiert.",
				requirements: ["hipaa:164.310(a)(2)(iv)"],
			},
		],
	},
};
