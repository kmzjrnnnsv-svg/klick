// Kern und Zusätze, Teil C (Teil K): die übrigen 23 Maßnahmen mit mindestens
// zehn Rahmenwerken (Meldung, Tests, Entwicklung, Betrieb, Datenschutz u. a.).
// Inhalte aus den Anforderungstexten des Katalogs. Format und Regeln in
// control-additions.ts, Test control-additions.

import type { ControlCore } from "./control-additions";

export const PART_C: Record<string, ControlCore> = {
	"CC-INC-03": {
		core: "Meldepflichtige Vorfälle gehen fristgerecht an die zuständige Behörde, über vorbereitete Vorlagen und Meldewege.",
		where: { href: "/vorfaelle", label: "Vorfälle" },
		additions: [
			{
				kind: "zielgruppe",
				text: "Finanzunternehmen melden schwerwiegende Vorfälle der BaFin, Zahlungs- und Kreditinstitute auch Zahlungsvorfälle ohne IT-Bezug.",
				requirements: ["dora:Art.19", "dora:Art.23", "zag:§54"],
			},
			{
				kind: "rhythmus",
				text: "Die Erstmeldung an die BaFin folgt binnen 4 Stunden nach Einstufung, spätestens 24 Stunden nach Kenntnis. Zwischen- und Abschlussmeldung zählen ab Abgabe der jeweils vorigen Meldung.",
				requirements: ["dora:Art.19"],
			},
			{
				kind: "nachweis",
				text: "Die Meldungen nutzen die einheitlichen Formulare der europäischen Aufsicht in aktueller Fassung. Rückmeldungen der Behörde werden berücksichtigt, und ihre Umsetzung ist dokumentiert.",
				requirements: ["dora:Art.20", "dora:Art.22"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-VORFALL",
					label: "Vorlage Melderichtlinie",
				},
			},
			{
				kind: "zielgruppe",
				text: "Erhebliche Sicherheitsvorfälle gehen an das BSI, als Frühwarnung, Meldung mit Erstbewertung und Abschlussbericht.",
				requirements: ["nis2:Art.23"],
			},
			{
				kind: "zielgruppe",
				text: "Datenpannen mit personenbezogenen Daten gehen an die Datenschutzaufsicht, mit Art, Folgen und Maßnahmen. Jede Datenpanne wird dokumentiert, auch ohne Meldung.",
				requirements: ["dsgvo:Art.33"],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller melden aktiv ausgenutzte Schwachstellen und schwere Sicherheitsvorfälle am Produkt, jeweils in drei Stufen.",
				requirements: ["cra:Art.14(1-2)", "cra:Art.14(3-4)"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "rhythmus",
				text: "Der Abschlussbericht zu einer Schwachstelle folgt spätestens 14 Tage, nachdem eine Korrektur verfügbar ist.",
				requirements: ["cra:Art.14(1-2)"],
			},
			{
				kind: "zielgruppe",
				text: "Betroffene Kund:innen erfahren unverzüglich vom Vorfall und von möglichen Abhilfen.",
				requirements: [
					"dora:Art.19",
					"nis2:Art.23",
					"zag:§54",
					"nist-csf:RS.CO-02",
				],
			},
			{
				kind: "zielgruppe",
				text: "Bei Aufträgen des US-Verteidigungsministeriums gehen Vorfälle binnen 72 Stunden an die benannte Stelle.",
				requirements: ["nist-800-171:3.6.2", "cmmc:IR.L2-3.6.2"],
			},
			{
				kind: "zielgruppe",
				text: "Unter New Yorker Finanzaufsicht gehen Meldungen elektronisch an das DFS, auch für Vorfälle bei Dienstleistern. Eine Lösegeldzahlung wird eigens gemeldet und binnen 30 Tagen schriftlich begründet.",
				requirements: ["nycrr-500:500.17(a)", "nycrr-500:500.17(c)"],
			},
			{
				kind: "zielgruppe",
				text: "Bei Gesundheitsdaten geht die Meldung ab 500 Betroffenen zugleich an das US-Gesundheitsministerium. Kleinere Pannen werden gesammelt und binnen 60 Tagen nach Jahresende gemeldet.",
				requirements: ["hipaa:164.408"],
			},
			{
				kind: "zielgruppe",
				text: "Auch betroffene Stellen in der Lieferkette erfahren vom Vorfall, Microsoft etwa unverzüglich bei Vorfällen mit seinen Daten.",
				requirements: ["nist-800-53:IR-6", "ms-sspa:MON.2"],
			},
		],
	},

	"CC-TST-01": {
		core: "Ein geplantes Testprogramm prüft wichtige Systeme regelmäßig, und gefundene Schwächen werden behoben.",
		where: { href: "/testprogramm", label: "Testprogramm" },
		additions: [
			{
				kind: "inhalt",
				text: "Das Programm ist risikobasiert, und jede kritische Anwendung bekommt mindestens eine passende Testart.",
				requirements: ["dora:Art.24", "nist-800-53:PM-14"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-TESTPROGRAMM",
					label: "Vorlage Testprogramm",
				},
			},
			{
				kind: "inhalt",
				text: "Die Testarten reichen von Schwachstellenscans und Quellcodeprüfung über Szenario- und Leistungstests bis zum Penetrationstest.",
				requirements: ["dora:Art.25", "tisax:5.2.6"],
			},
			{
				kind: "zielgruppe",
				text: "Tests führen qualifizierte, unabhängige Personen durch, intern organisatorisch getrennt oder extern.",
				requirements: [
					"dora:Art.24",
					"zag:RTS-Art.3",
					"pci-dss:11.4.2",
					"nist-800-53:CA-8",
					"nycrr-500:500.5(a)(1)",
				],
			},
			{
				kind: "inhalt",
				text: "Penetrationstests laufen von innen und von außen, nach einer festen Methodik für Netz, Anwendung und Segmentierung.",
				requirements: [
					"pci-dss:11.4.1",
					"pci-dss:11.4.2",
					"pci-dss:11.4.3",
					"nycrr-500:500.5(a)(1)",
				],
			},
			{
				kind: "zielgruppe",
				text: "Das eigene Produkt prüft eine externe Fachfirma mit einem umfassenden Penetrationstest.",
				requirements: ["mvsp:1.4"],
			},
			{
				kind: "rhythmus",
				text: "Penetrationstests laufen zusätzlich nach jeder wesentlichen Änderung.",
				requirements: [
					"pci-dss:11.4.2",
					"pci-dss:11.4.3",
					"cmmc:CA.L3-3.12.1e",
				],
			},
			{
				kind: "rhythmus",
				text: "Die Wirksamkeit der Sicherheitslösungen wird auch nach neuen Bedrohungsinformationen oder einem Vorfall bewertet.",
				requirements: ["cmmc:RA.L3-3.11.5e"],
			},
			{
				kind: "nachweis",
				text: "Ein erneuter Test bestätigt, dass ausnutzbare Schwachstellen aus dem Penetrationstest behoben sind.",
				requirements: ["pci-dss:11.4.4"],
				where: { href: "/sicherheit?tab=befunde", label: "Befunde" },
			},
			{
				kind: "zielgruppe",
				text: "Mandantenfähige Dienstleister unterstützen ihre Kund:innen bei deren externen Penetrationstests.",
				requirements: ["pci-dss:11.4.7"],
			},
			{
				kind: "inhalt",
				text: "Sicherheitsfunktionen prüfen sich beim Start, auf Anweisung und in festen Abständen selbst und melden Fehler.",
				requirements: ["nist-800-53:SI-6"],
			},
			{
				kind: "inhalt",
				text: "Ob Wiederanlaufzeit und tolerierbarer Datenverlust eingehalten werden, zeigen Übungen oder gezielt ausgelöste Ausfälle.",
				requirements: ["aws-ftr:RES.4"],
			},
			{
				kind: "nachweis",
				text: "Ein festes Verfahren bewertet, ob die Sicherheitsmaßnahmen wirken, und leitet Verbesserungen aus Tests und Übungen ab.",
				requirements: [
					"nis2:Art.21(2)(f)",
					"dsgvo:Art.32",
					"zag:RTS-Art.3",
					"nist-csf:ID.IM-02",
				],
			},
		],
	},

	"CC-RSK-03": {
		core: "Für jedes Risiko ist eine Behandlung gewählt, mit Maßnahmen, Verantwortlichen und Terminen geplant und verfolgt.",
		where: { href: "/risiken?tab=massnahmen", label: "Maßnahmenplan" },
		additions: [
			{
				kind: "nachweis",
				text: "Eine Erklärung zur Anwendbarkeit begründet jede gewählte und jede ausgeschlossene Maßnahme aus Anhang A.",
				requirements: ["iso27001:6.1.3"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=BE-SOA",
					label: "Vorlage Erklärung zur Anwendbarkeit",
				},
			},
			{
				kind: "zielgruppe",
				text: "Risikoeigentümer:innen genehmigen Plan und Restrisiken. Ein Risiko bewusst akzeptieren darf nur die befugte Leitung, mit Begründung.",
				requirements: ["iso27001:6.1.3", "bsi-200-3:6", "bsi-200-2:9"],
			},
			{
				kind: "inhalt",
				text: "Der Umsetzungsplan nennt je Maßnahme auch die Kosten. Neue Maßnahmen sind auf Eignung, Zusammenwirken und Benutzerfreundlichkeit geprüft.",
				requirements: ["bsi-200-2:9", "bsi-200-1:8.2", "bsi-200-3:7.1"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=PL-RISIKOBEHANDLUNG",
					label: "Vorlage Risikobehandlungsplan",
				},
			},
			{
				kind: "nachweis",
				text: "Ein Sicherheitskonzept hält für den Geltungsbereich Schutzziele, Vorgehen und gewählte Maßnahmen fest.",
				requirements: ["bsi-200-1:8.1"],
			},
			{
				kind: "inhalt",
				text: "Nach der Basis-Absicherung ist der Schritt zur Standard- oder Kern-Absicherung geplant.",
				requirements: ["bsi-200-2:6.4"],
			},
			{
				kind: "nachweis",
				text: "Abweichungen von Vorgaben und Baselines sind begründet, mit gleichwertiger Alternative, wo angemessen. Der Systemsicherheitsplan hält Lösung, Begründung und Risikoentscheidung fest.",
				requirements: [
					"hipaa:164.306(d)(3)",
					"nist-800-53:PL-11",
					"cmmc:RA.L3-3.11.4e",
				],
			},
			{
				kind: "zielgruppe",
				text: "Eine verantwortliche Leitungsperson gibt den Betrieb jedes Systems nach seinen Risiken frei und erneuert die Freigabe regelmäßig.",
				requirements: ["nist-800-53:CA-6"],
			},
			{
				kind: "inhalt",
				text: "Auch Schwachstellen werden nach dem Ergebnis der Risikobewertung behoben.",
				requirements: ["nist-800-171:3.11.3", "cmmc:RA.L2-3.11.3"],
				where: { href: "/sicherheit?tab=befunde", label: "Befunde" },
			},
			{
				kind: "inhalt",
				text: "Eine strategische Vorgabe legt fest, welche Behandlungen zur Risikobereitschaft passen, und ist allen bekannt.",
				requirements: ["nist-csf:GV.RM-04", "nist-800-53:RA-7"],
			},
			{
				kind: "inhalt",
				text: "Ausnahmen werden wie Änderungen auf ihre Risiken bewertet, erfasst und verfolgt.",
				requirements: ["nist-csf:ID.RA-07"],
				where: { href: "/risiken?tab=ausnahmen", label: "Ausnahmen" },
			},
			{
				kind: "zielgruppe",
				text: "KI-Risiken bekommen eine eigene Behandlung und eine Erklärung zur Anwendbarkeit nach der KI-Norm.",
				requirements: ["iso42001:6.1.3", "iso42001:8.3"],
			},
		],
	},

	"CC-DEV-06": {
		core: "Änderungen an Systemen werden erfasst, auf Folgen geprüft, getestet, freigegeben und dokumentiert.",
		where: { href: "/aenderungen", label: "Änderungen" },
		additions: [
			{
				kind: "inhalt",
				text: "Das Verfahren gilt auch für Hardware, Firmware, Sicherheitseinstellungen, Daten und Abläufe.",
				requirements: ["dora:Art.9(4)(e)", "soc2:CC8.1"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-CHANGE",
					label: "Vorlage Änderungsmanagement",
				},
			},
			{
				kind: "inhalt",
				text: "Jede Änderung hat eine Begründung, eine bewertete Auswirkung und einen Rückweg für den Fehlerfall.",
				requirements: ["pci-dss:6.5.1"],
			},
			{
				kind: "zielgruppe",
				text: "Auch Änderungen an Netzverbindungen und Firewall-Regeln laufen über das Änderungsverfahren.",
				requirements: ["pci-dss:1.2.2"],
			},
			{
				kind: "rhythmus",
				text: "Vor neuen Produkten, Märkten oder Vertriebswegen und vor großen Umbauten laufen Risikoanalyse und Testkonzept. Betroffene Bereiche werden dabei eingebunden.",
				requirements: ["zag-marisk:AT8"],
			},
			{
				kind: "rhythmus",
				text: "Nach einer wesentlichen Änderung wird geprüft, ob alle betroffenen Vorgaben und Maßnahmen noch greifen.",
				requirements: ["pci-dss:6.5.2", "nist-800-53:CM-4", "nist-800-53:CM-3"],
			},
			{
				kind: "rhythmus",
				text: "Notfalländerungen sind geregelt und werden nachträglich geprüft, genehmigt und dokumentiert.",
				requirements: ["iso27001:A.8.32", "dora:Art.9(4)(e)"],
			},
			{
				kind: "zielgruppe",
				text: "Ein Plan regelt Rollen und Abläufe. Nur festgelegte Personen dürfen ändern, durchgesetzt mit technischen und physischen Sperren.",
				requirements: [
					"nist-800-53:CM-9",
					"nist-800-53:CM-5",
					"nist-800-171:3.4.5",
					"cmmc:CM.L2-3.4.5",
				],
			},
			{
				kind: "zielgruppe",
				text: "Auch die Entwicklung verwaltet Konfiguration, Änderungen und Fehler und lässt nur freigegebene Änderungen zu.",
				requirements: ["nist-800-53:SA-10"],
			},
			{
				kind: "nachweis",
				text: "Builds und Releases laufen automatisiert und erzeugen Herkunftsnachweise für die Pakete.",
				requirements: ["mvsp:3.5"],
			},
			{
				kind: "inhalt",
				text: "Ausnahmen von Richtlinien werden mit Begründung und Ablaufdatum eigens geführt und auf Risiken bewertet.",
				requirements: ["nist-csf:ID.RA-07"],
				where: { href: "/risiken?tab=ausnahmen", label: "Ausnahmen" },
			},
			{
				kind: "inhalt",
				text: "Auch ungeplante Änderungen, ausgelagerte Prozesse und Änderungen mit Einfluss auf das Kontrollsystem werden bewertet.",
				requirements: ["iso27001:8.1", "iso42001:8.1", "soc2:CC3.4"],
			},
			{
				kind: "zielgruppe",
				text: "KI-Systeme gehen erst nach einem Plan für die Inbetriebnahme und mit erfüllten Anforderungen in Betrieb.",
				requirements: ["iso42001:A.6.2.5"],
			},
		],
	},

	"CC-PHY-01": {
		core: "Nur berechtigte Personen kommen in Räume mit Informationen und Technik, und der Zutritt wird kontrolliert.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-PHYSISCH",
			label: "Vorlage Physische Sicherheit",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Räume sind nach Schutzbedarf in Sicherheitszonen mit klaren Grenzen eingeteilt.",
				requirements: ["iso27001:A.7.1", "tisax:3.1.1"],
			},
			{
				kind: "inhalt",
				text: "Zugänge werden laufend überwacht, etwa mit Alarmanlage, Kameras oder Zutrittssystem.",
				requirements: [
					"iso27001:A.7.4",
					"nist-csf:DE.CM-02",
					"nist-800-53:PE-6",
					"pci-dss:9.2.1.1",
				],
			},
			{
				kind: "nachweis",
				text: "Zutritte werden protokolliert und regelmäßig ausgewertet. Bei Kartendaten bleiben die Aufzeichnungen mindestens drei Monate erhalten.",
				requirements: [
					"nist-800-53:PE-6",
					"nist-800-171:3.10.4",
					"cmmc:PE.L1-3.10.4",
					"pci-dss:9.2.1.1",
				],
			},
			{
				kind: "zielgruppe",
				text: "Besucher:innen werden vorab genehmigt, begleitet, mit befristetem Ausweis gekennzeichnet und im Besucherbuch erfasst. Ausweise werden beim Gehen zurückgegeben oder gesperrt.",
				requirements: [
					"pci-dss:9.3.2",
					"pci-dss:9.3.3",
					"pci-dss:9.3.4",
					"nist-800-53:PE-8",
					"nist-800-53:PE-3",
					"nist-800-171:3.10.3",
					"cmmc:PE.L1-3.10.3",
				],
			},
			{
				kind: "zielgruppe",
				text: "Wartungspersonal ohne eigene Berechtigung arbeitet nur unter Aufsicht, berechtigtes steht auf einer Liste.",
				requirements: [
					"nist-800-53:MA-5",
					"nist-800-171:3.7.6",
					"cmmc:MA.L2-3.7.6",
				],
			},
			{
				kind: "inhalt",
				text: "Schlüssel, Karten und Ausweise werden kontrolliert ausgegeben, verwaltet und zurückgenommen.",
				requirements: [
					"nist-800-171:3.10.5",
					"cmmc:PE.L1-3.10.5",
					"tisax:4.1.1",
					"nist-800-53:PE-2",
					"nist-800-53:PE-3",
				],
			},
			{
				kind: "rhythmus",
				text: "Beim Ausscheiden endet der Zutritt zu sensiblen Bereichen sofort. Die Liste der Berechtigten wird regelmäßig geprüft.",
				requirements: ["pci-dss:9.3.1", "pci-dss:9.3.1.1", "nist-800-53:PE-2"],
			},
			{
				kind: "inhalt",
				text: "Netzwerkanschlüsse, Funkzugangspunkte und Leitungen sowie Strom und Klima der Systeme sind geschützt. Unbenutzte Konsolen sind gesperrt.",
				requirements: [
					"pci-dss:9.2.2",
					"pci-dss:9.2.3",
					"pci-dss:9.2.4",
					"nist-800-171:3.10.2",
					"cmmc:PE.L2-3.10.2",
				],
			},
			{
				kind: "zielgruppe",
				text: "Bereiche mit Prototypen sind baulich gesichert und gegen Einsicht geschützt.",
				requirements: ["tisax:8.1"],
			},
			{
				kind: "inhalt",
				text: "Anlieferung und Abtransport von Systemteilen sind freigegeben und protokolliert, Datenträger nur Berechtigten zugänglich.",
				requirements: ["nist-800-53:PE-16", "nist-800-53:MP-2"],
			},
			{
				kind: "nachweis",
				text: "Eine Richtlinie mit verantwortlicher Person regelt den Schutz der Räume, auch den Zutritt im Notfall. Reparaturen an Türen, Schlössern und Wänden werden dokumentiert.",
				requirements: [
					"nist-800-53:PE-1",
					"hipaa:164.310(a)(2)(ii)",
					"hipaa:164.310(a)(2)(i)",
					"hipaa:164.310(a)(2)(iv)",
				],
			},
			{
				kind: "nachweis",
				text: "Für genutzte Rechenzentren ist geprüft, dass Zugangssperren, Zutrittsprotokolle und Einbruchsalarm bestehen.",
				requirements: ["mvsp:4.1", "ms-sspa:SEC.9"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
		],
	},

	"CC-IAM-04": {
		core: "Verwaltungsrechte bekommen nur wenige Personen nach Bedarf, und ihre Nutzung wird überwacht und protokolliert.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-ZUGANG",
			label: "Vorlage Zugangsrichtlinie",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Verwaltungsrechte liegen in eigenen Konten, die nicht für Mail und Internet genutzt werden.",
				requirements: [
					"cyber-essentials:AC.2",
					"essential-eight:RA.1",
					"nist-800-171:3.1.6",
					"cmmc:AC.L2-3.1.6",
					"nycrr-500:500.7(a)(1)",
				],
			},
			{
				kind: "inhalt",
				text: "Verwaltungsfunktionen sind von Nutzerfunktionen getrennt. Verwaltung über das Netz läuft stark verschlüsselt.",
				requirements: [
					"nist-800-53:SC-2",
					"nist-800-171:3.13.3",
					"cmmc:SC.L2-3.13.3",
					"pci-dss:2.2.7",
				],
			},
			{
				kind: "inhalt",
				text: "Verwaltungsrechte gibt es nur für die Dauer der Aufgabe, von eigenen, gehärteten Arbeitsplätzen aus.",
				requirements: ["essential-eight:RA.3"],
			},
			{
				kind: "rhythmus",
				text: "Verwaltungsrechte laufen nach 12 Monaten ab, wenn niemand sie neu begründet.",
				requirements: ["essential-eight:RA.2"],
			},
			{
				kind: "zielgruppe",
				text: "Verwaltungszugänge brauchen immer einen zweiten Faktor, lokal wie über das Netz. Privilegierte Befehle aus der Ferne brauchen eine ausdrückliche Genehmigung.",
				requirements: [
					"essential-eight:MF.2",
					"nist-800-171:3.5.3",
					"cmmc:IA.L2-3.5.3",
					"ms-sspa:SEC.2",
					"nist-800-171:3.1.15",
					"cmmc:AC.L2-3.1.15",
				],
			},
			{
				kind: "inhalt",
				text: "Standardkonten der Hersteller sind entfernt, gesperrt oder neu gesichert. Die Verwaltung von Firewalls ist aus dem Internet gesperrt oder mit zweitem Faktor geschützt.",
				requirements: ["pci-dss:2.2.2", "cyber-essentials:FW.3"],
			},
			{
				kind: "zielgruppe",
				text: "System- und Anwendungskonten haben nur nötige Rechte und dienen nur ausnahmsweise zur Anmeldung von Personen. Deren Passwörter stehen nie im Klartext in Skripten oder Code.",
				requirements: [
					"pci-dss:7.2.5",
					"pci-dss:8.6.1",
					"pci-dss:8.6.2",
					"pci-dss:8.6.3",
				],
			},
			{
				kind: "zielgruppe",
				text: "Der Root-Benutzer eines AWS-Kontos dient nur für Ausnahmen, mit zweitem Faktor und ohne Zugriffsschlüssel. Kundenkonten erreicht die Lösung über Rollen statt Schlüssel.",
				requirements: [
					"aws-ftr:ROOT.1",
					"aws-ftr:ROOT.2",
					"aws-ftr:ROOT.3",
					"aws-ftr:CAA.1",
				],
			},
			{
				kind: "inhalt",
				text: "Eine eigene Lösung verwaltet privilegierte Zugänge und überwacht ihre Nutzung.",
				requirements: ["nycrr-500:500.7(c)(1)"],
			},
			{
				kind: "zielgruppe",
				text: "Nur ein kleiner Kreis darf die Protokollierung verwalten. Außer den Konten für die Sicherung kann kein Verwaltungskonto Sicherungen ändern oder löschen.",
				requirements: [
					"nist-800-171:3.3.9",
					"cmmc:AU.L2-3.3.9",
					"essential-eight:RB.3",
				],
			},
			{
				kind: "zielgruppe",
				text: "Schlüssel für Kryptowerte nutzen nur Berechtigte in vertrauenswürdiger Umgebung. Ab Stufe II werden Zieladressen vor dem Signieren geprüft und von mehreren Personen freigegeben.",
				requirements: ["ccss:1.04"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "inhalt",
				text: "Ein festgelegter Notfallzugang mit Protokollierung sichert den Zugriff auf nötige Daten auch im Notfall.",
				requirements: ["hipaa:164.312(a)(2)(ii)"],
			},
		],
	},

	"CC-OPS-02": {
		core: "Schutzsoftware erkennt und entfernt Schadsoftware auf Geräten und Servern, und Funde werden gemeldet und bearbeitet.",
		additions: [
			{
				kind: "rhythmus",
				text: "Schutzsoftware und Erkennung aktualisieren sich automatisch, sobald neue Fassungen verfügbar sind.",
				requirements: [
					"pci-dss:5.3.1",
					"nist-800-171:3.14.4",
					"cmmc:SI.L1-3.14.4",
					"cyber-essentials:MW.1",
					"nist-800-53:SI-3",
				],
			},
			{
				kind: "inhalt",
				text: "Dateien aus externen Quellen werden beim Herunterladen, Öffnen oder Ausführen in Echtzeit geprüft.",
				requirements: [
					"nist-800-171:3.14.5",
					"cmmc:SI.L1-3.14.5",
					"pci-dss:5.3.2",
				],
			},
			{
				kind: "zielgruppe",
				text: "Wechselmedien und Datenträger mit Diagnoseprogrammen werden vor oder beim Einsatz geprüft.",
				requirements: [
					"pci-dss:5.3.3",
					"nist-800-171:3.7.4",
					"cmmc:MA.L2-3.7.4",
				],
			},
			{
				kind: "inhalt",
				text: "Nutzende können den Schutz nicht abschalten, außer mit befristeter, dokumentierter Genehmigung der Leitung.",
				requirements: ["pci-dss:5.3.5"],
			},
			{
				kind: "inhalt",
				text: "Mail- und Webverkehr wird gefiltert, Spam, Phishing und bekannte schädliche Webseiten werden abgewehrt.",
				requirements: [
					"nycrr-500:500.14(a)(2)",
					"nist-800-53:SI-8",
					"pci-dss:5.4.1",
					"cyber-essentials:MW.2",
				],
			},
			{
				kind: "inhalt",
				text: "Eine Lösung zur Erkennung und Reaktion auf Endgeräten meldet ungewöhnliche Aktivität, etwa seitliche Bewegungen im Netz.",
				requirements: ["nycrr-500:500.14(b)(1)", "nist-csf:DE.CM-09"],
			},
			{
				kind: "inhalt",
				text: "Festgelegt ist, welche Makros und Skripte in Dokumenten erlaubt sind, und ihre Nutzung wird überwacht.",
				requirements: ["nist-800-53:SC-18"],
			},
			{
				kind: "inhalt",
				text: "Statt Virenschutz genügt auch, dass nur freigegebene Programme laufen dürfen.",
				requirements: ["cyber-essentials:MW.1", "soc2:CC6.8"],
			},
			{
				kind: "zielgruppe",
				text: "Systeme ohne Schutzsoftware müssen nachweislich ungefährdet sein und werden darauf regelmäßig geprüft.",
				requirements: ["pci-dss:5.2.1", "pci-dss:5.2.3"],
			},
			{
				kind: "rhythmus",
				text: "Wie oft solche und andere regelmäßige Prüfungen laufen, legt eine gezielte Risikoanalyse fest.",
				requirements: ["pci-dss:5.2.3.1", "pci-dss:5.3.2.1"],
			},
			{
				kind: "nachweis",
				text: "Die Schutzsoftware protokolliert, und ihre Protokolle werden aufbewahrt.",
				requirements: ["pci-dss:5.3.4"],
			},
			{
				kind: "zielgruppe",
				text: "Beschäftigte werden zu Schadsoftware und Phishing sensibilisiert.",
				requirements: ["iso27001:A.8.7", "pci-dss:5.4.1"],
				where: { href: "/schulungen", label: "Pflichtschulung Phishing" },
			},
		],
	},

	"CC-NET-02": {
		core: "An den Netzgrenzen lassen Firewalls nur benötigten Verkehr durch, und die Regeln werden gepflegt.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-NETZ",
			label: "Vorlage Netzsicherheitsrichtlinie",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Alles ist gesperrt, was nicht ausdrücklich erlaubt ist. Ein- und ausgehender Verkehr wird überwacht, um Angriffe zu erkennen.",
				requirements: [
					"nist-800-171:3.13.6",
					"cmmc:SC.L2-3.13.6",
					"pci-dss:1.3.1",
					"pci-dss:1.3.2",
					"nist-800-171:3.14.6",
					"cmmc:SI.L2-3.14.6",
				],
			},
			{
				kind: "nachweis",
				text: "Jeder erlaubte Dienst, Port und jede Regel hat einen dokumentierten, genehmigten Grund, unnötige Regeln werden entfernt. In der Cloud gibt es Freigaben fürs ganze Internet nur für öffentliche Dienste.",
				requirements: [
					"pci-dss:1.2.5",
					"cyber-essentials:FW.2",
					"aws-ftr:NET.1",
				],
			},
			{
				kind: "inhalt",
				text: "Nicht benötigte Ports, Protokolle und Dienste sind abgeschaltet, unsichere zusätzlich abgesichert.",
				requirements: [
					"nist-800-171:3.4.7",
					"cmmc:CM.L2-3.4.7",
					"pci-dss:1.2.6",
				],
			},
			{
				kind: "inhalt",
				text: "Fehlversuche bei der Anmeldung sind begrenzt, danach wird der Zugang zeitweise gesperrt.",
				requirements: [
					"nist-800-53:AC-7",
					"nist-800-171:3.1.8",
					"cmmc:AC.L2-3.1.8",
				],
			},
			{
				kind: "inhalt",
				text: "Wesentliche Funktionen bleiben auch bei Überlastungsangriffen verfügbar. Produkte stören andere Geräte und Netze dabei möglichst wenig.",
				requirements: ["nist-800-53:SC-5", "cra:AnhI-2h-i"],
			},
			{
				kind: "zielgruppe",
				text: "Öffentliche Webanwendungen schützt eine automatische Lösung, die Angriffe laufend erkennt und abwehrt.",
				requirements: ["pci-dss:6.4.1", "pci-dss:6.4.2"],
			},
			{
				kind: "inhalt",
				text: "Netze sind nach Schutzbedarf getrennt, öffentlich erreichbare Teile liegen in eigenen Netzen. Systeme mit Kartendaten sind aus unsicheren Netzen nie direkt erreichbar.",
				requirements: [
					"nist-800-53:SC-7",
					"pci-dss:1.4.1",
					"pci-dss:1.4.2",
					"pci-dss:1.4.4",
					"tisax:5.2.7",
					"ms-sspa:SEC.8",
				],
			},
			{
				kind: "zielgruppe",
				text: "Fernzugriffe laufen nur über verwaltete Zugangspunkte, Funknetze erst nach Freigabe und getrennt von Kartendaten.",
				requirements: [
					"nist-800-171:3.1.14",
					"cmmc:AC.L2-3.1.14",
					"nist-800-171:3.1.16",
					"cmmc:AC.L2-3.1.16",
					"pci-dss:1.3.3",
				],
			},
			{
				kind: "inhalt",
				text: "Konfigurationsdateien sind geschützt und stimmen mit der laufenden Konfiguration überein. Gefälschte Absenderadressen werden abgewehrt, interne Adressen bleiben verborgen.",
				requirements: [
					"pci-dss:1.2.1",
					"pci-dss:1.2.8",
					"pci-dss:1.4.3",
					"pci-dss:1.4.5",
				],
			},
			{
				kind: "inhalt",
				text: "Jedes Gerät hat eine Firewall am Netzübergang oder auf dem Gerät selbst. Deren Verwaltung ist aus dem Internet gesperrt oder mit zweitem Faktor geschützt.",
				requirements: ["cyber-essentials:FW.1", "cyber-essentials:FW.3"],
			},
			{
				kind: "rhythmus",
				text: "Netzverbindungen enden am Sitzungsende oder nach festgelegter Zeit ohne Aktivität.",
				requirements: [
					"nist-800-53:SC-10",
					"nist-800-171:3.13.9",
					"cmmc:SC.L2-3.13.9",
				],
			},
		],
	},

	"CC-DEV-01": {
		core: "Software entsteht nach festen Regeln für sichere Entwicklung, mit Sicherheit in jeder Phase.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-ENTWICKLUNG",
			label: "Vorlage sichere Entwicklung",
		},
		additions: [
			{
				kind: "zielgruppe",
				text: "Wer entwickelt, wird regelmäßig zu sicherer Entwicklung und den Werkzeugen geschult.",
				requirements: ["pci-dss:6.2.2", "mvsp:3.3", "nist-800-53:SA-3"],
				where: {
					href: "/schulungen",
					label: "Pflichtschulung sichere Entwicklung",
				},
			},
			{
				kind: "inhalt",
				text: "Die Regeln verhindern mindestens häufige Schwachstellen wie eingeschleusten Code, Cross-Site-Scripting und umgangene Rechteprüfungen.",
				requirements: ["mvsp:3.3"],
			},
			{
				kind: "zielgruppe",
				text: "Die Regeln gelten auch für Erwerb und Wartung von Systemen. Zugekaufte Anwendungen durchlaufen eine festgelegte Sicherheitsprüfung.",
				requirements: [
					"nis2:Art.21(2)(e)",
					"tisax:5.3.1",
					"nist-800-53:SA-1",
					"nycrr-500:500.8",
				],
			},
			{
				kind: "inhalt",
				text: "Dazu gehört ein Weg, über den Schwachstellen gemeldet, behandelt und offengelegt werden.",
				requirements: ["nis2:Art.21(2)(e)"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-CVD",
					label: "Vorlage Offenlegung von Schwachstellen",
				},
			},
			{
				kind: "zielgruppe",
				text: "Hersteller entwerfen und bauen Produkte mit einem Sicherheitsniveau, das zu ihren Risiken passt.",
				requirements: ["cra:AnhI-1"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "inhalt",
				text: "Neben Sicherheit gilt Datenschutz als fester Grundsatz bei Entwurf, Entwicklung und Änderung.",
				requirements: ["nist-800-53:SA-3", "nist-800-53:SA-8"],
			},
			{
				kind: "nachweis",
				text: "Der Entwicklungsprozess ist mit Standards und Werkzeugen dokumentiert und enthält eine Kritikalitätsanalyse.",
				requirements: ["nist-800-53:SA-15"],
			},
			{
				kind: "zielgruppe",
				text: "Die Leitung der Informationssicherheit prüft die schriftlichen Verfahren regelmäßig.",
				requirements: ["nycrr-500:500.8", "nist-800-53:SA-15"],
			},
			{
				kind: "nachweis",
				text: "Die Wirkung der sicheren Entwicklungspraktiken wird überwacht.",
				requirements: ["nist-csf:PR.PS-06"],
			},
			{
				kind: "zielgruppe",
				text: "Für KI-Systeme gibt es eigene Prozesse für verantwortungsvolles Entwerfen und Entwickeln.",
				requirements: ["iso42001:A.6.1.3"],
			},
		],
	},

	"CC-DEV-02": {
		core: "Sicherheitsanforderungen für neue Systeme und Änderungen sind festgelegt, und die Architektur folgt sicheren Grundsätzen.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-ENTWICKLUNG",
			label: "Vorlage sichere Entwicklung",
		},
		additions: [
			{
				kind: "zielgruppe",
				text: "Die Anforderungen gelten auch beim Kauf: Verträge nennen Sicherheitsanforderungen, Abnahmekriterien und Dokumentation.",
				requirements: ["iso27001:A.8.26", "nist-800-53:SA-4", "tisax:5.3.1"],
			},
			{
				kind: "inhalt",
				text: "Datenschutz ist eingebaut: Es werden nur nötige Daten verarbeitet, und Voreinstellungen sind datensparsam.",
				requirements: ["dsgvo:Art.24-25", "cra:AnhI-2g"],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller bewerten die Risiken jedes Produkts über den ganzen Lebenszyklus und leiten daraus die Anforderungen ab. Die Bewertung bleibt im Unterstützungszeitraum aktuell.",
				requirements: ["cra:Art.13(1-4)", "cra:AnhI-1"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=VL-PRODUKT-RISIKO",
					label: "Vorlage Risikobewertung je Produkt",
				},
			},
			{
				kind: "inhalt",
				text: "Angriffsflächen und externe Schnittstellen sind begrenzt, und Schutzmechanismen dämmen die Folgen eines Angriffs ein.",
				requirements: ["cra:AnhI-2j-k"],
			},
			{
				kind: "inhalt",
				text: "Eingaben werden geprüft, und die Entwicklung verhindert übliche Angriffe wie Injection oder Angriffe auf Geschäftslogik.",
				requirements: ["soc2:PI1.2", "pci-dss:6.2.4"],
			},
			{
				kind: "nachweis",
				text: "Eine Sicherheitsarchitektur beschreibt, wie Sicherheit und Datenschutz umgesetzt sind und zur Gesamtarchitektur passen.",
				requirements: ["nist-800-53:PL-8", "nist-800-53:SA-17"],
			},
			{
				kind: "nachweis",
				text: "Ein aktuelles Diagramm zeigt, wie sensible Daten in die Systeme kommen und wo sie liegen.",
				requirements: ["mvsp:3.2"],
			},
			{
				kind: "inhalt",
				text: "Die Anwendung bietet Single Sign-on über offene Standards und setzt Sicherheits-Header gegen Einbetten in fremde Seiten.",
				requirements: ["mvsp:2.1", "mvsp:2.3"],
			},
			{
				kind: "inhalt",
				text: "Passwörter haben mindestens acht Zeichen, keinen Wechselzwang und werden gegen Listen gestohlener Passwörter geprüft. Sicherheitsfragen gibt es nicht.",
				requirements: ["mvsp:2.4"],
			},
			{
				kind: "rhythmus",
				text: "Bei neuen Komponenten und vor Änderungen der Architektur werden Bedrohungen und Folgen neu bewertet.",
				requirements: ["iso27001:A.8.27", "nist-800-53:CM-4"],
			},
			{
				kind: "nachweis",
				text: "Die Architektur wird regelmäßig nach dem AWS Well-Architected Framework geprüft, mit eigenem Bericht und verfolgten Befunden.",
				requirements: ["aws-ftr:SUP.2"],
			},
			{
				kind: "zielgruppe",
				text: "Für neue KI-Systeme und Änderungen daran sind Anforderungen festgelegt und dokumentiert.",
				requirements: ["iso42001:A.6.2.2"],
			},
		],
	},

	"CC-GOV-09": {
		core: "Festgelegt ist, wer was, wann, an wen und wie kommuniziert, intern und nach außen.",
		where: { href: "/organisation?tab=kommunikation", label: "Kommunikation" },
		additions: [
			{
				kind: "zielgruppe",
				text: "Zu Behörden gibt es gepflegte Kontakte und Meldewege, etwa BaFin, BSI, Datenschutzaufsicht und Polizei.",
				requirements: ["iso27001:A.5.5"],
				where: { href: "/organisation?tab=aufsicht", label: "Aufsicht" },
			},
			{
				kind: "zielgruppe",
				text: "BaFin und Bundesbank bekommen Auskünfte, Unterlagen und Zugang, auch bei Sonderprüfungen. Die Kommunikation mit der Aufsicht ist dokumentiert.",
				requirements: ["kwg:§44"],
			},
			{
				kind: "zielgruppe",
				text: "Die Leitung wird regelmäßig über Stand, Risiken und Vorfälle informiert.",
				requirements: ["bsi-200-1:4.2"],
			},
			{
				kind: "inhalt",
				text: "Beschäftigte kennen einen Weg, Bedenken zum internen Kontrollsystem zu melden.",
				requirements: ["soc2:CC2.2"],
			},
			{
				kind: "zielgruppe",
				text: "Ansprechpersonen in Bereichen, Projekten und IT sind benannt, Schnittstellen zu Datenschutz und Notfallmanagement geregelt.",
				requirements: ["bsi-200-2:4.2"],
			},
			{
				kind: "inhalt",
				text: "Für Notfälle sind Zuständigkeiten, Vorlagen und Kontaktlisten bereit, auch für Behörden und Presse.",
				requirements: ["bsi-200-4:8.3"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=PL-KRISENKOMMUNIKATION",
					label: "Vorlage Krisenkommunikationsplan",
				},
			},
			{
				kind: "zielgruppe",
				text: "Die Wege für Meldungen zu Risiken schließen Lieferanten und andere Dritte ein.",
				requirements: ["nist-csf:GV.RM-05"],
			},
			{
				kind: "rhythmus",
				text: "Bei Vorfällen erfahren Behörden und Kundschaft davon in den vorgeschriebenen Fristen.",
				requirements: ["nist-csf:RS.CO-02"],
			},
			{
				kind: "zielgruppe",
				text: "Anfragen von Behörden nach Daten folgen einem festen Ablauf und werden dokumentiert. Microsoft erfährt vorher davon, soweit das erlaubt ist.",
				requirements: ["eu-us-dpf:S5", "ms-sspa:TPR.3"],
			},
			{
				kind: "inhalt",
				text: "Für jedes Cloud-Konto sind Kontakte für Abrechnung, Betrieb und Sicherheit hinterlegt, als Rollenadressen statt Einzelpersonen.",
				requirements: ["aws-ftr:ROOT.4"],
			},
			{
				kind: "zielgruppe",
				text: "Die Kundschaft erfährt Wiederanlaufzeit und tolerierbaren Datenverlust der Lösung, etwa im Vertrag.",
				requirements: ["aws-ftr:RES.2"],
			},
			{
				kind: "inhalt",
				text: "Festgelegt ist auch, welche Informationen zu KI-Systemen an wen gehen, auch an Behörden.",
				requirements: ["iso42001:7.4", "iso42001:A.8.5"],
			},
		],
	},

	"CC-GOV-11": {
		core: "Unvereinbare Aufgaben liegen bei verschiedenen Personen, und die Berechtigungen folgen dieser Trennung.",
		where: { href: "/organisation?tab=rollen", label: "Rollen und Leitung" },
		additions: [
			{
				kind: "inhalt",
				text: "Typische Trennungen sind Zahlung erfassen und freigeben, Rechte vergeben und prüfen, Schlüsselzeremonie und Betrieb.",
				requirements: ["iso27001:A.5.3"],
			},
			{
				kind: "inhalt",
				text: "Wo kleine Teams nicht trennen können, sichern Ausgleichsmaßnahmen wie Vier-Augen-Prüfungen ab.",
				requirements: ["iso27001:A.5.3"],
			},
			{
				kind: "zielgruppe",
				text: "Entwicklung und Produktion sind getrennt, damit nur geprüfte, genehmigte Änderungen in Betrieb gehen.",
				requirements: ["pci-dss:6.5.4"],
			},
			{
				kind: "zielgruppe",
				text: "Vier-Augen-Freigaben und Screening verhindern, dass Zahlungen gegen Embargos verstoßen.",
				requirements: ["sanctions:AWG-§18"],
			},
			{
				kind: "zielgruppe",
				text: "Im Kreditgeschäft sind Markt und Marktfolge getrennt, im Handelsgeschäft Handel, Abwicklung und Kontrolle.",
				requirements: ["kwg:BTO1-2"],
			},
			{
				kind: "nachweis",
				text: "Aufbau- und Ablauforganisation mit klaren, abgestimmten Zuständigkeiten sind dokumentiert.",
				requirements: ["zag-marisk:AT4.3.1", "zag:§27", "kwg:AT4.2-4.3"],
			},
			{
				kind: "nachweis",
				text: "Die Trennung steht in der Zugangsrichtlinie und wird bei der Prüfung der Rechte kontrolliert.",
				requirements: ["soc2:CC6.3", "nist-csf:PR.AA-05"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-ZUGANG",
					label: "Vorlage Zugangsrichtlinie",
				},
			},
		],
	},

	"CC-HR-02": {
		core: "Beschäftigte sind schriftlich zu Vertraulichkeit und Sicherheitsregeln verpflichtet, auch über das Ende der Tätigkeit hinaus.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-PERSONAL",
			label: "Vorlage Personalsicherheit",
		},
		additions: [
			{
				kind: "zielgruppe",
				text: "Auch Externe, Dienstleister und Partner unterschreiben eine Geheimhaltungsvereinbarung, bevor vertrauliche Informationen fließen.",
				requirements: [
					"iso27001:A.6.6",
					"tisax:6.1.2",
					"bsi-200-1:6",
					"ms-sspa:MGT.4",
				],
			},
			{
				kind: "rhythmus",
				text: "Vereinbarungen zu Vertraulichkeit und Nutzung werden vor dem ersten Zugriff unterschrieben und regelmäßig erneuert.",
				requirements: ["nist-800-53:PS-6", "iso27001:A.6.6"],
			},
			{
				kind: "rhythmus",
				text: "Nutzende bestätigen die Verhaltensregeln für Systeme, auch zu sozialen Medien, und erneut nach jeder Änderung.",
				requirements: ["nist-800-53:PL-4"],
				where: { href: "/dokumente", label: "Kenntnisnahme am Dokument" },
			},
			{
				kind: "rhythmus",
				text: "Beim Austritt oder Wechsel werden Zugänge binnen fester Frist gesperrt, Geräte zurückgenommen und ein Austrittsgespräch geführt.",
				requirements: [
					"nist-800-53:PS-4",
					"nist-800-171:3.9.2",
					"cmmc:PS.L2-3.9.2",
					"hipaa:164.308(a)(3)(ii)(C)",
				],
			},
			{
				kind: "inhalt",
				text: "Pflichten, die nach dem Austritt fortbestehen, werden der Person und anderen Beteiligten mitgeteilt.",
				requirements: ["iso27001:A.6.5"],
			},
			{
				kind: "inhalt",
				text: "Verhaltensregeln sind festgelegt, und Verstöße haben geregelte Folgen.",
				requirements: ["soc2:CC1.1", "iso27001:A.6.2"],
			},
			{
				kind: "inhalt",
				text: "Daten der Beschäftigten werden nur soweit nötig verarbeitet, Überwachung ist verhältnismäßig und transparent.",
				requirements: ["dsgvo:BDSG-§26"],
			},
			{
				kind: "nachweis",
				text: "Stellenbeschreibungen nennen die Aufgaben für Sicherheit und Datenschutz.",
				requirements: ["nist-800-53:PS-9"],
			},
			{
				kind: "zielgruppe",
				text: "Für Prototypen gibt es eigene Geheimhaltung, Einstufung, Verantwortliche und geschulte Beschäftigte.",
				requirements: ["tisax:8.2"],
			},
			{
				kind: "nachweis",
				text: "Eine Richtlinie mit verantwortlicher Person verankert Sicherheit in allen Personalprozessen, von der Einstellung bis zum Austritt.",
				requirements: ["nist-800-53:PS-1", "nist-csf:GV.RR-04"],
			},
		],
	},

	"CC-OPS-01": {
		core: "Endgeräte sind zentral verwaltet und nach festen Sicherheitseinstellungen eingerichtet.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-ENDGERAETE",
			label: "Vorlage Endgeräterichtlinie",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Nach festgelegter Zeit ohne Aktivität sperrt sich der Bildschirm und verdeckt den Inhalt. Entsperren braucht PIN, Passwort oder Biometrie mit Schutz gegen Raten.",
				requirements: [
					"nist-800-53:AC-11",
					"nist-800-171:3.1.10",
					"cmmc:AC.L2-3.1.10",
					"cyber-essentials:CF.3",
				],
			},
			{
				kind: "inhalt",
				text: "Mobile Geräte sind vollständig verschlüsselt und auch bei Verlust geschützt.",
				requirements: ["nist-800-53:AC-19", "tisax:3.1.4"],
			},
			{
				kind: "zielgruppe",
				text: "Die Verbindung von Smartphones und Tablets mit den Systemen ist gesteuert, etwa über eine Geräteverwaltung.",
				requirements: ["nist-800-171:3.1.18", "cmmc:AC.L2-3.1.18"],
			},
			{
				kind: "zielgruppe",
				text: "Zugang gibt es nur von Geräten der Organisation, unbekannte oder falsch eingerichtete Geräte werden blockiert.",
				requirements: ["cmmc:AC.L3-3.1.2e", "cmmc:IA.L3-3.5.3e"],
			},
			{
				kind: "inhalt",
				text: "Standardpasswörter sind geändert, und automatisches Ausführen ist aus. Makros laufen nur für Nutzende mit Bedarf, aus dem Internet nie.",
				requirements: ["cyber-essentials:CF.2", "essential-eight:MA.1"],
			},
			{
				kind: "inhalt",
				text: "Kameras und Mikrofone lassen sich nicht aus der Ferne einschalten, und ein Zeichen zeigt, wenn sie laufen.",
				requirements: [
					"nist-800-53:SC-15",
					"nist-800-171:3.13.12",
					"cmmc:SC.L2-3.13.12",
				],
			},
			{
				kind: "inhalt",
				text: "Bestimmte Datenträger sind eingeschränkt oder verboten, Wechseldatenträger ohne bekannten Eigentümer nie erlaubt.",
				requirements: ["nist-800-53:MP-7"],
			},
			{
				kind: "zielgruppe",
				text: "Laptops, die auch in unsichere Netze gehen, haben Schutz, den Nutzende nicht abschalten können.",
				requirements: ["pci-dss:1.5.1"],
			},
			{
				kind: "inhalt",
				text: "Geräte bieten nur nötige Funktionen, und ihr Speicher ist gegen das Ausführen fremden Codes geschützt.",
				requirements: [
					"nist-800-171:3.4.6",
					"cmmc:CM.L2-3.4.6",
					"nist-800-53:SI-16",
				],
			},
			{
				kind: "zielgruppe",
				text: "Arbeitsplatzrechner mit Gesundheitsdaten sind physisch so gesichert, dass nur Befugte sie nutzen.",
				requirements: ["hipaa:164.310(c)"],
			},
			{
				kind: "inhalt",
				text: "Geräte und ihre Software werden überwacht, um schädliche Ereignisse zu finden.",
				requirements: ["nist-csf:DE.CM-09"],
			},
		],
	},

	"CC-CRY-03": {
		core: "Schlüssel werden über ihren ganzen Lebenszyklus sicher erzeugt, verteilt, gespeichert, gewechselt und vernichtet.",
		where: { href: "/assets", label: "Inventar" },
		additions: [
			{
				kind: "inhalt",
				text: "Geheime Schlüssel liegen nur verschlüsselt mit einem gleich starken Schlüssel, in einem HSM oder in Teilen vor.",
				requirements: ["pci-dss:3.6.1.2", "pci-dss:3.6.1"],
			},
			{
				kind: "zielgruppe",
				text: "Nur wenige Verwahrende haben Zugriff, und Schlüssel liegen an möglichst wenigen Orten.",
				requirements: ["pci-dss:3.6.1", "pci-dss:3.6.1.3", "pci-dss:3.6.1.4"],
			},
			{
				kind: "nachweis",
				text: "Verwahrende bestätigen schriftlich oder elektronisch, dass sie ihre Pflichten kennen und annehmen.",
				requirements: ["pci-dss:3.7.8"],
			},
			{
				kind: "inhalt",
				text: "Manuelle Arbeit mit Klartext-Schlüsseln braucht geteiltes Wissen und vier Augen. Ein unbefugter Tausch von Schlüsseln ist ausgeschlossen.",
				requirements: ["pci-dss:3.7.6", "pci-dss:3.7.7"],
			},
			{
				kind: "rhythmus",
				text: "Schlüssel werden am Ende ihrer Kryptoperiode gewechselt und sofort, wenn sie kompromittiert sein könnten.",
				requirements: ["pci-dss:3.7.4", "pci-dss:3.7.5", "nist-800-53:IA-5"],
			},
			{
				kind: "zielgruppe",
				text: "Schlüssel und Seeds für Kryptowerte stammen aus geprüftem Zufall, ab Stufe II von mehreren Personen nachvollzogen. Stufe III verlangt eine protokollierte Zeremonie in abgeschirmter Umgebung.",
				requirements: ["ccss:1.01"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "inhalt",
				text: "Wie stark Schlüssel geschützt werden, folgt aus der Einstufung der Daten und der Risikobewertung.",
				requirements: ["dora:Art.9(4)(d)"],
			},
			{
				kind: "inhalt",
				text: "Zugangsdaten stehen nie im Code, sondern in einem Geheimnisspeicher. Statt dauerhafter Zugriffsschlüssel gibt es kurzlebige Zugangsdaten über Rollen.",
				requirements: ["aws-ftr:IAM.4", "aws-ftr:IAM.3"],
			},
			{
				kind: "inhalt",
				text: "Zertifikate kommen nach festgelegter Richtlinie oder von zugelassenen Anbietern, nur vertrauenswürdige Wurzeln sind hinterlegt.",
				requirements: ["nist-800-53:SC-17"],
			},
			{
				kind: "inhalt",
				text: "Die Anmeldung an kryptografischen Modulen erfüllt geltende Vorgaben, etwa FIPS 140.",
				requirements: ["nist-800-53:IA-7"],
			},
			{
				kind: "zielgruppe",
				text: "Dienstleister, die Schlüssel mit Kund:innen teilen, erklären sichere Übertragung, Speicherung und Aktualisierung.",
				requirements: ["pci-dss:3.7.9"],
			},
			{
				kind: "inhalt",
				text: "Bei hohem Schutzbedarf bleiben Schlüssel auch bei Verlust verfügbar.",
				requirements: ["nist-800-53:SC-12"],
			},
		],
	},

	"CC-TPR-05": {
		core: "Dienstleister werden während der ganzen Zusammenarbeit regelmäßig bewertet, und Mängel werden eskaliert und verfolgt.",
		where: { href: "/dienstleister", label: "Dienstleister" },
		additions: [
			{
				kind: "nachweis",
				text: "Geprüft werden auch Änderungen bei Sicherheit und Leistung, etwa anhand von Prüfberichten, Leistungsberichten und Vorfällen.",
				requirements: ["iso27001:A.5.22"],
			},
			{
				kind: "nachweis",
				text: "Bei Kartendaten wird der PCI-DSS-Stand jedes Dienstleisters überwacht, etwa über seine Konformitätsbestätigung.",
				requirements: ["pci-dss:12.8.4"],
			},
			{
				kind: "zielgruppe",
				text: "Fernzugriffskonten Dritter sind nur bei Bedarf offen, sonst gesperrt, und ihre Nutzung wird überwacht.",
				requirements: ["pci-dss:8.2.7", "nist-csf:DE.CM-06"],
			},
			{
				kind: "zielgruppe",
				text: "Für externes Personal gelten vertragliche Sicherheitspflichten, und Anbieter melden Austritte binnen fester Frist.",
				requirements: ["nist-800-53:PS-7", "nist-800-53:SA-9"],
			},
			{
				kind: "zielgruppe",
				text: "Verträge geben die Pflichten an Unterauftragnehmer weiter, und deren Einhaltung wird geprüft.",
				requirements: ["ms-sspa:TPR.2"],
			},
			{
				kind: "nachweis",
				text: "Die Liste der Drittfirmen mit Zugriff auf Kundendaten steht öffentlich auf der Webseite.",
				requirements: ["mvsp:4.3"],
				where: { href: "/trust-center", label: "Trust Center" },
			},
			{
				kind: "inhalt",
				text: "Auch genutzte Rechenzentren sind auf Zugangssperren, Zutrittsprotokolle und Einbruchsalarm geprüft.",
				requirements: ["mvsp:4.1"],
			},
			{
				kind: "zielgruppe",
				text: "Leistungen von Lieferanten passen zum eigenen verantwortungsvollen Umgang mit KI.",
				requirements: ["iso42001:A.10.3"],
			},
			{
				kind: "inhalt",
				text: "Abläufe erkennen und begrenzen Risiken der Lieferkette, auch Störungen bei Lieferungen.",
				requirements: [
					"nist-800-53:SR-3",
					"cmmc:RA.L3-3.11.6e",
					"nist-csf:GV.SC-09",
				],
			},
			{
				kind: "nachweis",
				text: "Eine schriftliche Richtlinie regelt Erfassung, Risikobewertung, Mindestanforderungen und regelmäßige Bewertung der Dienstleister.",
				requirements: ["nycrr-500:500.11(a)"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-DIENSTLEISTER",
					label: "Vorlage Dienstleisterrichtlinie",
				},
			},
		],
	},

	"CC-INC-05": {
		core: "Nach wesentlichen Vorfällen werden Ablauf und Ursache analysiert, und Verbesserungen fließen in Maßnahmen und Abläufe.",
		where: { href: "/vorfaelle", label: "Vorfälle" },
		additions: [
			{
				kind: "nachweis",
				text: "Jede Nachbetrachtung hält Zeitachse, Ursache, Wirksamkeit der Reaktion und abgeleitete Maßnahmen fest.",
				requirements: ["iso27001:A.5.27", "dora:Art.13(1-5)"],
			},
			{
				kind: "zielgruppe",
				text: "Erkenntnisse aus schwerwiegenden Vorfällen gehen an die Geschäftsleitung und in die Risikobewertung.",
				requirements: ["dora:Art.13(1-5)"],
			},
			{
				kind: "inhalt",
				text: "Auch Informationen über Schwachstellen und Cyberbedrohungen werden gesammelt und auf ihre Wirkung analysiert.",
				requirements: ["dora:Art.13(1-5)"],
			},
			{
				kind: "zielgruppe",
				text: "Bedeutende Schadensfälle werden zeitnah analysiert, erfasst und an das Risikocontrolling berichtet.",
				requirements: ["zag-marisk:BTR1"],
				where: { href: "/risiken?tab=schadensfaelle", label: "Schadensfälle" },
			},
			{
				kind: "rhythmus",
				text: "Der Vorfallplan wird nach Vorfällen und neuen Entwicklungen der Branche angepasst.",
				requirements: [
					"pci-dss:12.10.6",
					"aws-ftr:SEC.2",
					"nycrr-500:500.16(a)(1)",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-VORFALL",
					label: "Vorlage Melderichtlinie",
				},
			},
			{
				kind: "inhalt",
				text: "Erkenntnisse fließen auch in Schulungen, abgestimmt mit der Notfallplanung.",
				requirements: ["nist-800-53:IR-4"],
			},
			{
				kind: "nachweis",
				text: "Das Ende der Wiederherstellung wird nach festen Kriterien erklärt und die Dokumentation abgeschlossen.",
				requirements: ["nist-csf:RC.RP-06", "soc2:CC7.5"],
			},
			{
				kind: "inhalt",
				text: "Verbesserungen kommen auch aus dem laufenden Betrieb, nicht nur aus Vorfällen.",
				requirements: ["nist-csf:ID.IM-03"],
			},
		],
	},

	"CC-BCM-02": {
		core: "Für wichtige Prozesse sind Kritikalität, Wiederanlaufzeit und tolerierbarer Datenverlust bewertet.",
		where: { href: "/prozesse?tab=kritisch", label: "Kritische Prozesse" },
		additions: [
			{
				kind: "inhalt",
				text: "Die Auswirkungen eines Ausfalls werden mit messbaren und beschreibenden Kriterien bewertet.",
				requirements: ["dora:Art.11(5)"],
			},
			{
				kind: "inhalt",
				text: "Schäden werden über die Zeit bewertet, mit maximal tolerierbarer Ausfallzeit und Mindestniveau im Notbetrieb.",
				requirements: ["bsi-200-4:6.1", "dora:Art.11(5)"],
			},
			{
				kind: "inhalt",
				text: "Für zeitkritische Prozesse sind Personal, IT, Räume, Dienstleister und Informationen mit eigenen Wiederanlaufzeiten erfasst.",
				requirements: ["bsi-200-4:6.2", "nycrr-500:500.16(a)(2)"],
				where: {
					href: "/prozesse?tab=abhaengigkeiten",
					label: "Abhängigkeiten",
				},
			},
			{
				kind: "zielgruppe",
				text: "Leistungen, auf die sich andere verlassen, sind bekannt und mitgeteilt. Die Kundschaft erfährt Wiederanlaufzeit und tolerierbaren Datenverlust, etwa im Vertrag.",
				requirements: ["nist-csf:GV.OC-04", "aws-ftr:RES.2"],
			},
			{
				kind: "inhalt",
				text: "Aus der Analyse folgen Notfall- und Wiederanlaufpläne, ausgerichtet an der Bedeutung von Anwendungen und Daten.",
				requirements: [
					"hipaa:164.308(a)(7)(ii)(E)",
					"zag-marisk:AT7.3",
					"nist-800-53:CP-2",
					"iso27001:A.5.30",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=PL-NOTFALL",
					label: "Vorlage Notfallplan",
				},
			},
			{
				kind: "inhalt",
				text: "Wiederherstellung und Betrieb nach dem Vorfall folgen den Prioritäten der kritischen Aufgaben.",
				requirements: ["nist-csf:RC.RP-02", "nist-csf:RC.RP-04"],
			},
			{
				kind: "rhythmus",
				text: "Kritische Systemteile werden schon zu festgelegten Zeitpunkten in der Entwicklung bestimmt.",
				requirements: ["nist-800-53:RA-9"],
			},
			{
				kind: "inhalt",
				text: "Auch Systeme, Daten und andere Werte sind nach Kritikalität und Auswirkung priorisiert.",
				requirements: ["nist-csf:ID.AM-05", "nist-800-53:PM-11"],
				where: { href: "/assets", label: "Inventar" },
			},
		],
	},

	"CC-INC-07": {
		core: "Beschäftigte haben einen einfachen Weg, Sicherheitsereignisse zu melden, und Meldungen werden zügig bearbeitet.",
		where: { href: "/vorfaelle", label: "Vorfälle" },
		additions: [
			{
				kind: "inhalt",
				text: "Meldungen werden bestätigt und ohne Schuldzuweisung behandelt.",
				requirements: ["iso27001:A.6.8"],
			},
			{
				kind: "zielgruppe",
				text: "Für Geldwäsche gibt es zusätzlich ein Hinweisgebersystem.",
				requirements: ["gwg:§6"],
				where: { href: "/beschwerden?tab=hinweise", label: "Hinweise" },
			},
			{
				kind: "inhalt",
				text: "Gemeldet werden können auch Bedenken, etwa zum internen Kontrollsystem oder zu KI-Systemen.",
				requirements: ["soc2:CC2.2", "iso42001:A.3.3"],
			},
			{
				kind: "zielgruppe",
				text: "Auch Außenstehende können nachteilige Folgen eines KI-Systems melden.",
				requirements: ["iso42001:A.8.3"],
			},
			{
				kind: "inhalt",
				text: "Eine Anlaufstelle berät und unterstützt beim Melden und Behandeln von Vorfällen.",
				requirements: ["nist-800-53:IR-7"],
			},
			{
				kind: "rhythmus",
				text: "Vermutete Vorfälle werden binnen einer festgelegten Frist gemeldet, ab mittlerem Schutzbedarf automatisiert.",
				requirements: ["nist-800-53:IR-6", "tisax:1.6.1"],
			},
			{
				kind: "inhalt",
				text: "Die Schulung zeigt, wie Anzeichen für Innentäter erkannt und gemeldet werden.",
				requirements: ["nist-800-171:3.2.3", "cmmc:AT.L2-3.2.3"],
				where: { href: "/schulungen", label: "Schulungen" },
			},
			{
				kind: "nachweis",
				text: "Jede Meldung wird gesichtet und geprüft, und jeder Vorfall wird samt Ergebnis dokumentiert.",
				requirements: ["nist-csf:RS.MA-02", "hipaa:164.308(a)(6)(ii)"],
			},
			{
				kind: "zielgruppe",
				text: "Für Testfahrten mit Prototypen gibt es Regeln zu Tarnung, Verhalten und Vorfällen.",
				requirements: ["tisax:8.4"],
			},
		],
	},

	"CC-NET-03": {
		core: "Genutzte Netzdienste erfüllen festgelegte Sicherheitsanforderungen, und der Zugriff auf schädliche Webseiten wird gefiltert.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-NETZ",
			label: "Vorlage Netzsicherheitsrichtlinie",
		},
		additions: [
			{
				kind: "nachweis",
				text: "Dienstgüte und Sicherheitsmerkmale der Netzdienstleister werden überwacht, etwa bei Internetanbietern, CDN und Diensten gegen Überlastungsangriffe.",
				requirements: ["iso27001:A.8.21", "tisax:5.3.2", "nist-csf:DE.CM-01"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
			{
				kind: "inhalt",
				text: "Der Webfilter sperrt bekannte schädliche Kategorien, protokolliert Zugriffe und erlaubt Ausnahmen nur auf Antrag.",
				requirements: ["iso27001:A.8.23"],
			},
			{
				kind: "inhalt",
				text: "Browser blockieren Java und Werbung aus dem Internet, und Nutzende können das nicht ändern.",
				requirements: ["essential-eight:UH.1"],
			},
			{
				kind: "inhalt",
				text: "Skripte, Makros und Browser-Erweiterungen werden gesteuert und überwacht.",
				requirements: ["nist-800-171:3.13.13", "cmmc:SC.L2-3.13.13"],
			},
			{
				kind: "zielgruppe",
				text: "Auch Internettelefonie wird gesteuert und überwacht.",
				requirements: ["nist-800-171:3.13.14", "cmmc:SC.L2-3.13.14"],
			},
			{
				kind: "inhalt",
				text: "Mail- und Webverkehr wird gefiltert, und Spam wird an Ein- und Ausgängen abgewehrt.",
				requirements: ["nycrr-500:500.14(a)(2)", "nist-800-53:SI-8"],
			},
			{
				kind: "inhalt",
				text: "Die Namensauflösung ist abgesichert, mit DNSSEC, geprüften Antworten und fehlertoleranten, getrennten DNS-Servern.",
				requirements: [
					"nist-800-53:SC-20",
					"nist-800-53:SC-21",
					"nist-800-53:SC-22",
				],
			},
			{
				kind: "zielgruppe",
				text: "Funknetze mit Bezug zu Kartendaten tragen keine Standardwerte der Hersteller mehr.",
				requirements: ["pci-dss:2.3.1"],
			},
			{
				kind: "rhythmus",
				text: "Funkschlüssel werden gewechselt, wenn Wissende ausscheiden oder ein Verdacht auf Kompromittierung besteht.",
				requirements: ["pci-dss:2.3.2"],
			},
			{
				kind: "nachweis",
				text: "Ein Bestand berechtigter Funkzugangspunkte mit Begründung liegt vor, unberechtigte werden gesucht und behandelt.",
				requirements: ["pci-dss:11.2.1", "pci-dss:11.2.2"],
			},
		],
	},

	"CC-CRY-04": {
		core: "Ein Kryptokonzept legt fest, welche Verschlüsselung wofür eingesetzt wird, nach dem Stand der Technik.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=KZ-KRYPTO",
			label: "Vorlage Kryptokonzept",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Das Konzept regelt auch die Verwaltung der Schlüssel über ihren Lebenszyklus.",
				requirements: ["iso27001:A.8.24", "tisax:5.1.1"],
			},
			{
				kind: "inhalt",
				text: "Daten sind beim Transport durchgängig verschlüsselt, gespeicherte Daten nach ihrer Einstufung.",
				requirements: ["nis2:Art.21(2)(h)"],
			},
			{
				kind: "nachweis",
				text: "Dienstleister beschreiben ihre kryptografische Architektur mit Verfahren, Protokollen, Schlüsselstärke, Ablauf, Zweck und HSM.",
				requirements: ["pci-dss:3.6.1.1"],
			},
			{
				kind: "nachweis",
				text: "Ein Bestand der vertrauenswürdigen Schlüssel und Zertifikate für die Übertragung von Kartennummern liegt vor.",
				requirements: ["pci-dss:4.2.1.1"],
			},
			{
				kind: "inhalt",
				text: "Eingesetzte Verfahren und Protokolle sind dokumentiert, und für veraltete gibt es einen Plan zur Ablösung.",
				requirements: ["pci-dss:12.3.3"],
			},
			{
				kind: "zielgruppe",
				text: "Für geschützte Daten der US-Regierung sind nur nach FIPS 140 validierte Module erlaubt, mit Nachweis. Auch die Anmeldung an solchen Modulen erfüllt FIPS 140.",
				requirements: [
					"nist-800-171:3.13.11",
					"cmmc:SC.L2-3.13.11",
					"nist-800-53:IA-7",
				],
			},
			{
				kind: "inhalt",
				text: "Das System weist unwiderlegbar nach, wer etwa eine Freigabe oder Unterschrift ausgeführt hat.",
				requirements: ["nist-800-53:AU-10"],
			},
			{
				kind: "inhalt",
				text: "Prüfsummen oder Signaturen belegen, dass Gesundheitsdaten nicht unbefugt verändert wurden.",
				requirements: ["hipaa:164.312(c)(2)"],
			},
			{
				kind: "zielgruppe",
				text: "Unter New Yorker Finanzaufsicht sind nichtöffentliche Informationen beim Transport und gespeichert verschlüsselt. Wo das gespeichert nicht geht, genügen Ersatzmaßnahmen mit schriftlicher Freigabe der Sicherheitsleitung.",
				requirements: ["nycrr-500:500.15"],
			},
		],
	},

	"CC-DEV-05": {
		core: "Fremde Softwarekomponenten werden sorgfältig ausgewählt, erfasst und laufend auf Schwachstellen überwacht.",
		additions: [
			{
				kind: "nachweis",
				text: "Ein Bestand aller eigenen und fremden Komponenten liegt vor, für Produkte als maschinenlesbare Software-Stückliste.",
				requirements: ["pci-dss:6.3.2", "cra:AnhI-II-1", "iso42001:A.4.4"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "inhalt",
				text: "Patches folgen Prioritäten nach Kritikalität von Schwachstelle und System, Ausnahmen sind dokumentiert.",
				requirements: ["dora:Art.9(4)(f)", "iso27001:A.8.8"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-PATCH",
					label: "Vorlage Patchmanagement",
				},
			},
			{
				kind: "rhythmus",
				text: "Sicherheitsupdates ab mittlerer Schwere kommen binnen eines Monats nach Erscheinen, sonst greifen gleichwertige Schutzmaßnahmen.",
				requirements: ["mvsp:2.6"],
			},
			{
				kind: "rhythmus",
				text: "Vor der Auslieferung hat ein Produkt keine bekannten ausnutzbaren Schwachstellen.",
				requirements: ["cra:AnhI-2a"],
			},
			{
				kind: "zielgruppe",
				text: "Findet ein Hersteller eine Schwachstelle in einer Komponente, meldet er sie den Pflegenden und behebt sie im eigenen Produkt.",
				requirements: ["cra:Art.13(6)"],
			},
			{
				kind: "inhalt",
				text: "Echtheit und Unversehrtheit von Software werden vor der Nutzung geprüft, etwa über Signaturen.",
				requirements: [
					"nist-csf:ID.RA-09",
					"cmmc:SI.L3-3.14.1e",
					"nist-800-53:SI-7",
				],
			},
			{
				kind: "nachweis",
				text: "Builds laufen automatisiert und erzeugen Herkunftsnachweise für die Pakete.",
				requirements: ["mvsp:3.5"],
			},
			{
				kind: "rhythmus",
				text: "Ein Plan für Lieferkettenrisiken wird regelmäßig und nach neuen Bedrohungen oder einem Vorfall aktualisiert.",
				requirements: [
					"cmmc:RA.L3-3.11.7e",
					"nist-800-53:SR-2",
					"nist-800-53:PM-30",
					"nist-800-53:RA-3",
				],
			},
			{
				kind: "inhalt",
				text: "Auch Hardware wird auf Manipulation und Fälschung geprüft, Teile in Reparatur bleiben unter Kontrolle.",
				requirements: [
					"nist-800-53:SR-9",
					"nist-800-53:SR-10",
					"nist-800-53:SR-11",
				],
			},
			{
				kind: "zielgruppe",
				text: "Die Lieferkette umfasst auch gekaufte IT-Produkte und Dienste samt ihren Unterauftragnehmern.",
				requirements: ["iso27001:A.5.21", "nis2:Art.21(2)(e)"],
			},
		],
	},

	"CC-PRV-01": {
		core: "Ein Verzeichnis hält fest, welche personenbezogenen Daten wofür, woher und an wen verarbeitet werden.",
		where: { href: "/datenschutz?tab=vvt", label: "Verarbeitungsverzeichnis" },
		additions: [
			{
				kind: "inhalt",
				text: "Jede Verarbeitung hat eine dokumentierte Rechtsgrundlage, etwa Vertrag, gesetzliche Pflicht, berechtigtes Interesse oder Einwilligung.",
				requirements: ["dsgvo:Art.6"],
			},
			{
				kind: "inhalt",
				text: "Das Verzeichnis nennt auch Drittlandtransfers, Löschfristen und technische Schutzmaßnahmen und geht auf Anfrage an die Aufsicht.",
				requirements: ["dsgvo:Art.30"],
			},
			{
				kind: "zielgruppe",
				text: "Biometrische Daten, etwa beim Video-Ident, brauchen eine besondere Ausnahme und eine Datenschutz-Folgenabschätzung.",
				requirements: ["dsgvo:Art.9"],
				where: { href: "/datenschutz?tab=dsfa", label: "Folgenabschätzung" },
			},
			{
				kind: "inhalt",
				text: "Nur nötige Daten werden für genannte Zwecke erhoben und nicht länger als nötig aufbewahrt. Die Einhaltung ist jederzeit nachweisbar.",
				requirements: [
					"dsgvo:Art.5",
					"soc2:P3.1",
					"soc2:P4.1",
					"ccpa:SE.3",
					"us-privacy:SE.2",
					"ms-sspa:COL.1",
					"eu-us-dpf:P5",
				],
			},
			{
				kind: "inhalt",
				text: "Sensible Daten sind im Verzeichnis gesondert gekennzeichnet und brauchen nach den Gesetzen der US-Bundesstaaten eine vorherige Einwilligung.",
				requirements: ["ccpa:SC.2", "us-privacy:SD.1"],
			},
			{
				kind: "zielgruppe",
				text: "In Kalifornien lässt sich die Nutzung sensibler Daten beschränken, in Maryland werden sie nie verkauft. Daten von Kindern unter 13 brauchen die Zustimmung der Eltern.",
				requirements: ["ccpa:OO.3", "us-privacy:SD.2", "us-privacy:CH.1"],
			},
			{
				kind: "zielgruppe",
				text: "Auch Daten von Beschäftigten und Bewerbenden stehen im Verzeichnis, mit eigenen Regeln.",
				requirements: ["dsgvo:BDSG-§26", "ccpa:SC.3", "eu-us-dpf:S2"],
			},
			{
				kind: "nachweis",
				text: "Betroffene erhalten bei der Erhebung einen Hinweis zu Daten, Zwecken, Weitergabe und Aufbewahrung. Eine leicht lesbare Datenschutzerklärung nennt zudem Rechte und Wege zum Widerspruch.",
				requirements: [
					"soc2:P1.1",
					"eu-us-dpf:P1",
					"ccpa:NT.1",
					"hipaa:164.520",
					"ms-sspa:NOT.1",
					"ccpa:NT.2",
					"us-privacy:NT.1",
					"us-privacy:NT.2",
				],
			},
			{
				kind: "inhalt",
				text: "Einwilligungen werden vor der Verarbeitung eingeholt, dokumentiert und lassen sich jederzeit widerrufen.",
				requirements: [
					"soc2:P2.1",
					"soc2:P3.2",
					"ms-sspa:CHO.1",
					"eu-us-dpf:P2",
				],
			},
			{
				kind: "rhythmus",
				text: "Vor jedem neuen Zweck, der nicht zur Erhebung passt, braucht es eine Zustimmung oder einen neuen Hinweis.",
				requirements: [
					"ccpa:SE.3",
					"us-privacy:SE.2",
					"ms-sspa:NOT.1",
					"eu-us-dpf:P2",
				],
			},
			{
				kind: "inhalt",
				text: "Festgehalten ist auch, wo die Daten gespeichert und verarbeitet werden und von wem.",
				requirements: [
					"nist-800-53:CM-12",
					"ms-sspa:MGT.6",
					"nist-csf:ID.AM-07",
				],
			},
			{
				kind: "zielgruppe",
				text: "Verarbeitungen im Auftrag stehen mit Zweck und Weisung der Kundschaft im Verzeichnis.",
				requirements: ["tisax:9.2"],
			},
		],
	},
};
