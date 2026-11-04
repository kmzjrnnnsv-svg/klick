// Kern und Zusätze, Teil A (Teil K): die 13 meistgeteilten Maßnahmen nach
// Schulung und Anmeldung. Inhalte aus den Anforderungstexten des Katalogs.
// Format und Regeln in control-additions.ts, Test control-additions.

import type { ControlCore } from "./control-additions";

export const PART_A: Record<string, ControlCore> = {
	"CC-GOV-02": {
		core: "Die Leitung weist Rollen, Aufgaben und Befugnisse für Sicherheit zu, schreibt sie auf und macht sie bekannt.",
		where: { href: "/organisation?tab=rollen", label: "Rollen & Leitung" },
		additions: [
			{
				kind: "zielgruppe",
				text: "Eine benannte Person verantwortet die Informationssicherheit und hat Auftrag und Mittel dafür. Kommt diese Person von einem Dienstleister, bleibt die Verantwortung beim Unternehmen.",
				requirements: [
					"pci-dss:12.1.4",
					"nist-800-53:PM-2",
					"nycrr-500:500.4(a)",
					"hipaa:164.308(a)(2)",
					"ms-sspa:MGT.2",
				],
				where: { href: "/organisation?tab=rollen", label: "Rollen & Leitung" },
			},
			{
				kind: "zielgruppe",
				text: "Die beauftragte Person für Informationssicherheit berichtet direkt an die Leitung. Ansprechpersonen in Bereichen und Projekten sind benannt, Schnittstellen zu Datenschutz und Notfallmanagement geregelt.",
				requirements: ["bsi-200-1:7.3", "bsi-200-2:4.1", "bsi-200-2:4.2"],
			},
			{
				kind: "zielgruppe",
				text: "Eine unabhängige Funktion überwacht die Risiken und berichtet an die Geschäftsleitung. Banken richten zusätzlich Compliance und Interne Revision mit direktem Zugang zur Leitung ein.",
				requirements: ["zag-marisk:AT4.4.1", "kwg:AT4.4", "kwg:§25a"],
			},
			{
				kind: "zielgruppe",
				text: "Eine Rolle überwacht die Verträge mit IT-Dienstleistern, oder ein Mitglied der Geschäftsleitung übernimmt diese Verantwortung.",
				requirements: ["dora:Art.5(3)"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
			{
				kind: "zielgruppe",
				text: "Ein Mitglied der Leitung ist für die Vorbeugung gegen Geldwäsche verantwortlich.",
				requirements: ["gwg:§4", "amlr:Art.9"],
				where: { href: "/aml", label: "Geldwäsche" },
			},
			{
				kind: "zielgruppe",
				text: "Eine Person ist für den Datenschutz benannt. Die datenschutzbeauftragte Person wird der Aufsicht gemeldet und arbeitet unabhängig mit eigenen Mitteln.",
				requirements: ["dsgvo:Art.37-39", "hipaa:164.530(a)"],
				where: { href: "/datenschutz", label: "Datenschutz" },
			},
			{
				kind: "zielgruppe",
				text: "Eine beauftragte Person für das Notfallmanagement ist benannt und hat Aufgaben, Befugnisse und Zeit dafür.",
				requirements: ["bsi-200-4:5.1"],
			},
			{
				kind: "zielgruppe",
				text: "Für KI sind eigene Rollen, Aufgaben und Befugnisse festgelegt und bekannt gemacht.",
				requirements: ["iso42001:5.3", "iso42001:A.3.2"],
			},
			{
				kind: "inhalt",
				text: "Alle Geschäftsleiter:innen bleiben gesamtverantwortlich, mit festgelegter Geschäftsverteilung und Vertretung. Die Mitglieder sind zuverlässig und fachlich geeignet; Banken bestellen mindestens zwei.",
				requirements: ["zag-marisk:AT3", "kwg:§33", "micar:Art.68"],
			},
			{
				kind: "inhalt",
				text: "Unvereinbare Tätigkeiten liegen bei verschiedenen Personen, und Berechtigungen folgen dieser Aufteilung.",
				requirements: ["zag-marisk:AT4.3.1"],
			},
			{
				kind: "rhythmus",
				text: "Wer eine Aufgabe in der Informationssicherheit übernimmt, wird vorher dafür geschult.",
				requirements: ["nist-800-171:3.2.2", "cmmc:AT.L2-3.2.2"],
				where: { href: "/schulungen?tab=matrix", label: "Kompetenzmatrix" },
			},
			{
				kind: "nachweis",
				text: "Die nötige Kompetenz je Rolle ist bestimmt, sichergestellt und belegt.",
				requirements: ["iso27001:7.2", "iso42001:7.2"],
				where: { href: "/schulungen?tab=matrix", label: "Kompetenzmatrix" },
			},
			{
				kind: "nachweis",
				text: "Rollen sind je Sicherheitsbereich aufgeschrieben, etwa für Netz, Zugriffe, Protokolle und Tests. Alle Beschäftigten kennen ihre Pflichten.",
				requirements: [
					"pci-dss:1.1.2",
					"pci-dss:2.1.2",
					"pci-dss:3.1.2",
					"pci-dss:4.1.2",
					"pci-dss:5.1.2",
					"pci-dss:6.1.2",
					"pci-dss:7.1.2",
					"pci-dss:8.1.2",
					"pci-dss:9.1.2",
					"pci-dss:10.1.2",
					"pci-dss:11.1.2",
					"pci-dss:12.1.3",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=BE-ROLLEN",
					label: "Vorlage Rollenregister",
				},
			},
			{
				kind: "nachweis",
				text: "Stellenbeschreibungen nennen die Aufgaben für Sicherheit und Datenschutz.",
				requirements: ["nist-800-53:PS-9"],
			},
		],
	},

	"CC-IAM-01": {
		core: "Zugriffe folgen einem schriftlichen Konzept, und jede Person bekommt nur die Rechte, die ihre Aufgabe braucht.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-ZUGANG",
			label: "Vorlage Zugangsrichtlinie",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Das Zugriffssystem setzt die vergebenen Rechte technisch durch. Was nicht ausdrücklich erlaubt ist, bleibt gesperrt.",
				requirements: [
					"pci-dss:7.3.1",
					"pci-dss:7.3.2",
					"pci-dss:7.3.3",
					"nist-800-53:AC-3",
					"nist-800-171:3.1.2",
					"cmmc:AC.L1-3.1.2",
				],
			},
			{
				kind: "inhalt",
				text: "Aufgaben sind so verteilt, dass eine Person allein nichts Schädliches tun kann.",
				requirements: [
					"nist-800-171:3.1.4",
					"cmmc:AC.L2-3.1.4",
					"soc2:CC6.3",
					"nist-csf:PR.AA-05",
					"zag-marisk:AT4.3.1",
				],
			},
			{
				kind: "zielgruppe",
				text: "Nur wenige, begründete Konten haben Verwaltungsrechte, und sie dienen nur den Aufgaben, die sie erfordern.",
				requirements: [
					"nycrr-500:500.7(a)(1)",
					"aws-ftr:IAM.5",
					"nist-800-53:AC-6",
					"nist-800-171:3.1.5",
					"cmmc:AC.L2-3.1.5",
				],
			},
			{
				kind: "inhalt",
				text: "Befugte Personen genehmigen jedes Recht und prüfen vorher, ob der Zugang angemessen ist.",
				requirements: [
					"pci-dss:7.2.3",
					"mvsp:4.2",
					"hipaa:164.308(a)(3)(ii)(B)",
				],
			},
			{
				kind: "zielgruppe",
				text: "Direkte Abfragen auf gespeicherte Kartendaten sind auf Anwendungen und wenige Administrator:innen beschränkt.",
				requirements: ["pci-dss:7.2.6"],
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
				text: "Zugriff auf AWS-Konten der Kund:innen läuft über Rollen mit eigener External ID statt über Schlüssel. Kund:innen sehen vorab, welche Rechte verlangt werden.",
				requirements: ["aws-ftr:CAA.1", "aws-ftr:CAA.2", "aws-ftr:CAA.3"],
			},
			{
				kind: "inhalt",
				text: "In AWS hat jede Person eine eigene Identität, und die Zugriffsregeln aller S3-Buckets sind geprüft.",
				requirements: ["aws-ftr:IAM.1", "aws-ftr:S3.1"],
			},
			{
				kind: "zielgruppe",
				text: "Normale Konten können Sicherungen weder lesen noch ändern oder löschen.",
				requirements: ["essential-eight:RB.2"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=KZ-BACKUP",
					label: "Vorlage Backup-Konzept",
				},
			},
			{
				kind: "inhalt",
				text: "Vor der Anmeldung bestätigt die Person einen Hinweis zu Nutzung, Überwachung und Datenschutz. Festgelegt ist, was ohne Anmeldung möglich ist.",
				requirements: ["nist-800-53:AC-8", "nist-800-53:AC-14"],
			},
			{
				kind: "zielgruppe",
				text: "Bei Gesundheitsdaten regeln Verfahren, wie Zugriff gewährt und beaufsichtigt wird. Jede Nutzung und Weitergabe bleibt auf den nötigen Mindestumfang beschränkt.",
				requirements: [
					"hipaa:164.308(a)(3)(ii)(A)",
					"hipaa:164.308(a)(4)(ii)(B)",
					"hipaa:164.502(b)",
				],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller schützen ihre Produkte gegen unbefugten Zugriff, und das Produkt meldet mögliche unbefugte Zugriffe.",
				requirements: ["cra:AnhI-2d"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "rhythmus",
				text: "Rechte werden nach festem Ablauf vergeben, bei Wechsel angepasst und bei Austritt sofort entzogen. Ungenutzte Konten werden zeitnah gesperrt.",
				requirements: [
					"iso27001:A.5.18",
					"soc2:CC6.3",
					"cyber-essentials:AC.1",
					"ms-sspa:SEC.1",
					"mvsp:4.2",
				],
				where: { href: "/team", label: "Team" },
			},
			{
				kind: "rhythmus",
				text: "Rechte werden regelmäßig überprüft, privilegierte Rechte häufiger als die übrigen.",
				requirements: [
					"iso27001:A.5.18",
					"dora:Art.9(4)(c)",
					"nist-800-53:AC-6",
				],
				where: { href: "/team", label: "Zugriffsprüfung im Team" },
			},
			{
				kind: "nachweis",
				text: "Richtlinie und Verfahren sind verteilt, haben eine verantwortliche Person und werden nach Anlässen überprüft.",
				requirements: ["nist-800-53:AC-1"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-ZUGANG",
					label: "Vorlage Zugangsrichtlinie",
				},
			},
		],
	},

	"CC-GOV-10": {
		core: "Alle geltenden Gesetze, Vorgaben und Verträge sind mit Verantwortlichen erfasst und werden aktuell gehalten.",
		where: { href: "/kalender?tab=pflichten", label: "Pflichten" },
		additions: [
			{
				kind: "rhythmus",
				text: "Neue Gesetze, Entwürfe und Änderungen werden mit Geltungsbeginn und Übergangsfristen laufend verfolgt.",
				requirements: [
					"us-privacy:SC.2",
					"zag:PSD3",
					"kassen:RegKassen-2028",
					"kwg:CRD-VI-Art.21c",
				],
				where: {
					href: "/kalender?tab=rechtsaenderungen",
					label: "Rechtsänderungen",
				},
			},
			{
				kind: "rhythmus",
				text: "Jedes neue Sanktionspaket wird zeitnah ausgewertet. Gelistete Personen, Organisationen und Wallet-Adressen werden gesperrt.",
				requirements: ["sanctions:EU-Pakete"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-SANKTIONEN",
					label: "Vorlage Sanktionsrichtlinie",
				},
			},
			{
				kind: "inhalt",
				text: "Die eigenen Dienste sind rechtlich eingeordnet, Ausnahmen sind geprüft und der Status nach Geldwäschegesetz ist festgestellt. Das Ergebnis ist dokumentiert.",
				requirements: ["zag:§1(1)", "zag:§2", "gwg:§2", "micar:Art.60"],
			},
			{
				kind: "inhalt",
				text: "Wie streng Anforderungen umgesetzt werden, richtet sich nach Art und Umfang der Geschäfte. Die Entscheidung ist begründet und dokumentiert.",
				requirements: ["zag-marisk:AT1-2"],
			},
			{
				kind: "zielgruppe",
				text: "Für Dienste in anderen Ländern ist geprüft, welche Erlaubnis dort nötig ist oder welcher zugelassene Partner sie erbringt. Werden Kund:innen nur auf eigene Anfrage bedient, ist das dokumentiert.",
				requirements: [
					"uk-fca:FSMA-Crypto",
					"uk-fca:MLR-Reg",
					"ae-vara:CBUAE-RPS",
					"ae-vara:VARA-ADGM-DIFC",
					"bh-cbb:CBB-CRA",
					"ch-finma:GwG-CH",
					"ch-finma:CH-Crossborder",
					"br-bcb:Lei-14478",
					"kwg:CRD-VI-Art.21c",
				],
				where: { href: "/aml?tab=laender", label: "Länder & Korridore" },
			},
			{
				kind: "zielgruppe",
				text: "Je US-Bundesstaat ist geprüft, ob die Schwellen der Datenschutzgesetze erreicht sind. Ausnahmen je Staat sind erfasst.",
				requirements: ["ccpa:SC.1", "us-privacy:SC.1", "us-privacy:SC.2"],
			},
			{
				kind: "zielgruppe",
				text: "Eine Compliance-Funktion erkennt die wesentlichen Vorgaben und berichtet an die Geschäftsleitung. Vollständig auslagern lässt sie sich nur bei geringer Komplexität.",
				requirements: ["zag-marisk:AT4.4.2"],
				where: { href: "/organisation?tab=rollen", label: "Rollen & Leitung" },
			},
			{
				kind: "inhalt",
				text: "Auch Anforderungen von Kund:innen, Aufsicht und Partnern sind erfasst, mit der Entscheidung, welche erfüllt werden. Für KI zählt der EU AI Act dazu.",
				requirements: ["iso27001:4.2", "iso42001:4.2"],
				where: {
					href: "/organisation?tab=kontext",
					label: "Kontext & Parteien",
				},
			},
			{
				kind: "inhalt",
				text: "Anfragen von Behörden nach Daten folgen festen Regeln und werden dokumentiert. Herausgegeben wird nur das Nötige, Kund:innen erfahren vorher davon, soweit erlaubt.",
				requirements: ["eu-us-dpf:S5", "ms-sspa:TPR.3"],
			},
			{
				kind: "inhalt",
				text: "Daten von Kund:innen werden nur für vereinbarte Zwecke und nach deren Weisung verarbeitet.",
				requirements: ["ms-sspa:MGT.5"],
			},
			{
				kind: "inhalt",
				text: "Vorgaben aus Gesetz und Vertrag zum Speicherort von Daten sind umgesetzt.",
				requirements: ["mvsp:1.6"],
			},
			{
				kind: "inhalt",
				text: "Das Risiko von Bußgeldern und Schadensersatz nach Datenschutzrecht steht im Risikoregister.",
				requirements: ["dsgvo:Art.82-83"],
				where: { href: "/risiken", label: "Risiken" },
			},
		],
	},

	"CC-TPR-03": {
		core: "Vor dem Vertrag prüft das Unternehmen Dienstleister nach festem Verfahren und dokumentiert das Ergebnis.",
		where: { href: "/dienstleister", label: "Dienstleister" },
		additions: [
			{
				kind: "inhalt",
				text: "Die Prüfung klärt, ob eine kritische oder wichtige Funktion betroffen ist, und bewertet Konzentrationsrisiken und Interessenkonflikte. Für kritische Funktionen gelten die höchsten Sicherheitsstandards.",
				requirements: ["dora:Art.28(4-6)"],
				where: {
					href: "/dienstleister?tab=uebersicht",
					label: "Bewertungsübersicht",
				},
			},
			{
				kind: "inhalt",
				text: "Bewertet werden Schwachstellen, Produktqualität und Sicherheitspraxis des Anbieters und seiner eigenen Lieferkette.",
				requirements: [
					"nis2:Art.21(2)(d)",
					"iso27001:A.5.21",
					"cmmc:RA.L3-3.11.6e",
				],
			},
			{
				kind: "zielgruppe",
				text: "Vor einer Beziehung mit einem Krypto-Dienstleister außerhalb der EU werden Zulassung, Aufsicht, Geldwäsche-Programm und Ruf geprüft. Die Leitung stimmt zu.",
				requirements: ["amlr:Art.37", "ae-vara:AML-FDL20", "br-bcb:BR-AML"],
			},
			{
				kind: "zielgruppe",
				text: "Partner in anderen Ländern werden auf ihre Erlaubnis und deren Umfang geprüft.",
				requirements: [
					"uk-fca:FSMA-Crypto",
					"ae-vara:CBUAE-RPS",
					"ae-vara:VARA-ADGM-DIFC",
					"bh-cbb:CBB-CRA",
					"ch-finma:GwG-CH",
					"br-bcb:Lei-14478",
					"kwg:CRD-VI-Art.21c",
				],
				where: { href: "/aml?tab=laender", label: "Länder & Korridore" },
			},
			{
				kind: "zielgruppe",
				text: "Wesentliche Auslagerungen beruhen auf einer Risikoanalyse und werden angezeigt. Die Verantwortung bleibt beim Unternehmen.",
				requirements: ["zag-marisk:AT9", "micar:Art.73"],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller wählen Komponenten Dritter, auch freie Software, mit Sorgfalt aus und überwachen sie.",
				requirements: ["cra:Art.13(5)"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Einführer bringen nur Produkte mit Konformitätsbewertung, technischer Dokumentation, CE-Zeichen und Meldeadresse für Schwachstellen in Verkehr. Bei Zweifeln informieren sie den Hersteller.",
				requirements: ["cra:Art.19"],
			},
			{
				kind: "inhalt",
				text: "Hardware und Software werden vor Erwerb auf Echtheit geprüft. Gefälschte Komponenten werden erkannt und gemeldet.",
				requirements: ["nist-csf:ID.RA-09", "nist-800-53:SR-11"],
			},
			{
				kind: "zielgruppe",
				text: "Vor einer Übermittlung an US-Firmen ist geprüft, ob sie auf der DPF-Liste stehen und die Datenart abgedeckt ist.",
				requirements: ["eu-us-dpf:C2"],
			},
			{
				kind: "zielgruppe",
				text: "Leistungen von Lieferanten passen zum eigenen verantwortungsvollen Umgang mit KI.",
				requirements: ["iso42001:A.10.3"],
			},
			{
				kind: "rhythmus",
				text: "Bewertet wird vor dem Vertrag und danach in festen Abständen.",
				requirements: ["nist-800-53:SR-6", "nycrr-500:500.11(a)"],
				where: {
					href: "/einstellungen?tab=lieferanten",
					label: "Lieferantenbewertung",
				},
			},
			{
				kind: "nachweis",
				text: "Eine schriftliche Richtlinie regelt Erfassung, Risikobewertung und Mindestanforderungen an die Sicherheit der Dienstleister.",
				requirements: ["nycrr-500:500.11(a)", "pci-dss:12.8.3"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-DIENSTLEISTER",
					label: "Vorlage Dienstleisterrichtlinie",
				},
			},
		],
	},

	"CC-GOV-01": {
		core: "Die Leitung gibt eine Leitlinie zur Informationssicherheit frei; Themenrichtlinien regeln Einzelheiten und sind allen bekannt.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-ISMS-LEITLINIE",
			label: "Vorlage Leitlinie",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Die Leitlinie nennt Ziele, Geltungsbereich und Organisation der Sicherheit. Darin verpflichtet sich die Leitung, Anforderungen zu erfüllen und sich laufend zu verbessern.",
				requirements: ["iso27001:5.2", "bsi-200-1:7.2"],
			},
			{
				kind: "inhalt",
				text: "Die Leitlinie schützt Verfügbarkeit, Echtheit, Integrität und Vertraulichkeit, auch für Daten und Werte der Kund:innen.",
				requirements: ["dora:Art.9(4)(a)"],
			},
			{
				kind: "inhalt",
				text: "Schriftliche Richtlinien regeln mindestens Daten, Inventar, Zugänge, Betrieb, Netz, Entwicklung, physische Sicherheit, Dienstleister, Risiken, Vorfälle und Schwachstellen. Eine leitende Person gibt sie jedes Jahr frei.",
				requirements: ["nycrr-500:500.3"],
			},
			{
				kind: "nachweis",
				text: "Je Thema gibt es Richtlinie und Verfahren mit verantwortlicher Person, etwa für Zugriff, Protokolle, Wartung und Lieferkette.",
				requirements: [
					"nist-800-53:AC-1",
					"nist-800-53:AT-1",
					"nist-800-53:AU-1",
					"nist-800-53:CA-1",
					"nist-800-53:CM-1",
					"nist-800-53:CP-1",
					"nist-800-53:IA-1",
					"nist-800-53:IR-1",
					"nist-800-53:MA-1",
					"nist-800-53:MP-1",
					"nist-800-53:PE-1",
					"nist-800-53:PL-1",
					"nist-800-53:PS-1",
					"nist-800-53:RA-1",
					"nist-800-53:SA-1",
					"nist-800-53:SC-1",
					"nist-800-53:SI-1",
					"nist-800-53:SR-1",
				],
			},
			{
				kind: "nachweis",
				text: "Für jeden Bereich der Kartensicherheit sind Richtlinie und Verfahren aktuell, in Gebrauch und allen Beteiligten bekannt.",
				requirements: [
					"pci-dss:1.1.1",
					"pci-dss:2.1.1",
					"pci-dss:3.1.1",
					"pci-dss:4.1.1",
					"pci-dss:5.1.1",
					"pci-dss:6.1.1",
					"pci-dss:7.1.1",
					"pci-dss:8.1.1",
					"pci-dss:9.1.1",
					"pci-dss:10.1.1",
					"pci-dss:11.1.1",
				],
			},
			{
				kind: "rhythmus",
				text: "Die Richtlinien werden außer der Reihe angepasst, wenn sich Anforderungen, Bedrohungen, Technik oder Betrieb ändern. Jede Änderung ist dokumentiert.",
				requirements: [
					"iso27001:A.5.1",
					"pci-dss:12.1.2",
					"nist-csf:GV.PO-02",
					"zag-marisk:AT5",
					"hipaa:164.316(a)",
					"hipaa:164.316(b)(2)(iii)",
				],
				where: { href: "/dokumente", label: "Dokumente" },
			},
			{
				kind: "inhalt",
				text: "Ein freigegebenes Sicherheitsprogramm beruht auf der Risikobewertung. Es deckt Risiken, Schutz, Erkennung, Reaktion, Wiederherstellung und Meldepflichten ab.",
				requirements: [
					"nycrr-500:500.2(a)",
					"nist-800-53:PM-1",
					"ms-sspa:MGT.1",
				],
			},
			{
				kind: "inhalt",
				text: "Ein Managementsystem verbindet die nötigen Prozesse und zeigt, wie sie zusammenwirken.",
				requirements: ["iso27001:4.4", "iso42001:4.4"],
				where: { href: "/prozesse", label: "Prozesslandkarte" },
			},
			{
				kind: "zielgruppe",
				text: "Eine eigene KI-Richtlinie ist mit den Richtlinien zu Sicherheit, Datenschutz und Qualität abgestimmt.",
				requirements: ["iso42001:5.2", "iso42001:A.2.3"],
			},
			{
				kind: "inhalt",
				text: "Die gesamte Geschäftsorganisation ist in schriftlichen Richtlinien festgelegt und allen Mitarbeitenden bekannt.",
				requirements: ["zag-marisk:AT5", "zag:§27", "kwg:§25a"],
			},
			{
				kind: "inhalt",
				text: "Die Maßnahmen passen zu Risiko, Größe und Art der Daten und folgen dem Stand der Technik. Die Angemessenheit ist begründet.",
				requirements: ["nis2:Art.21(1)", "ccpa:SE.1", "us-privacy:SE.1"],
			},
			{
				kind: "zielgruppe",
				text: "Die Leitlinie ist bei Bedarf auch interessierten Parteien wie Kund:innen zugänglich.",
				requirements: ["iso27001:5.2"],
				where: { href: "/trust-center", label: "Trust Center" },
			},
		],
	},

	"CC-GOV-06": {
		core: "Unabhängige Prüfer:innen prüfen nach einem Plan, ob die Maßnahmen wirken, und Feststellungen werden nachverfolgt.",
		where: { href: "/audits?tab=programm", label: "Auditprogramm" },
		additions: [
			{
				kind: "inhalt",
				text: "Häufigkeit und Schwerpunkt der Prüfungen richten sich nach dem Risiko. Ein Mehrjahresplan deckt alle Tätigkeiten und Prozesse ab.",
				requirements: ["dora:Art.6(6)", "zag-marisk:AT4.4.3", "zag-marisk:BT2"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=VA-AUDITPROGRAMM",
					label: "Vorlage Auditprogramm",
				},
			},
			{
				kind: "zielgruppe",
				text: "Eine prozessunabhängige Interne Revision prüft alle Tätigkeiten und berichtet an die Geschäftsleitung. Bei Banken hat sie direkten Zugang auch zum Aufsichtsorgan.",
				requirements: ["zag-marisk:AT4.4.3", "kwg:AT4.4"],
			},
			{
				kind: "inhalt",
				text: "Die Prüfer:innen kennen sich mit IT-Risiken aus und sind vom geprüften Bereich unabhängig.",
				requirements: ["dora:Art.6(6)", "iso27001:9.2"],
			},
			{
				kind: "nachweis",
				text: "Jede Prüfung endet mit einem Bericht an die Leitung, Programm und Ergebnisse werden aufbewahrt. Die Interne Revision berichtet zudem jährlich zusammenfassend.",
				requirements: ["iso27001:9.2", "zag-marisk:BT2", "nist-800-53:CA-2"],
				where: { href: "/audits?tab=audits", label: "Audits" },
			},
			{
				kind: "inhalt",
				text: "Prüfungen an Produktionssystemen werden mit der Leitung geplant, damit der Betrieb nicht gestört wird.",
				requirements: ["iso27001:A.8.34"],
			},
			{
				kind: "zielgruppe",
				text: "Die Abschlussprüfer:in wird der Aufsicht angezeigt und prüft auch Pflichten wie Kundengelder, Eigenmittel, Organisation und Geldwäsche.",
				requirements: ["zag:§22-24", "kwg:§26-29"],
			},
			{
				kind: "zielgruppe",
				text: "Sicherheitsmaßnahmen für Zahlungen werden regelmäßig getestet und von unabhängigen Prüfer:innen bewertet. Wer die Ausnahme nach Transaktionsrisiko nutzt, lässt deren Methode prüfen.",
				requirements: ["zag:RTS-Art.3"],
			},
			{
				kind: "zielgruppe",
				text: "Die Maßnahmen gegen Geldwäsche werden unabhängig geprüft.",
				requirements: ["amlr:Art.9"],
				where: { href: "/aml", label: "Geldwäsche" },
			},
			{
				kind: "zielgruppe",
				text: "Das gesamte Sicherheitsprogramm wird unabhängig geprüft. Bei Firmen mit erheblichem Datenrisiko in Kalifornien bescheinigt ein Mitglied der Geschäftsleitung das Audit gegenüber der Behörde.",
				requirements: ["nycrr-500:500.2(c)", "tisax:1.5.2", "ccpa:RA.2"],
			},
			{
				kind: "rhythmus",
				text: "Geprüft wird auch aus Anlass, etwa nach Änderungen in Umgebung oder Betrieb und nach Notfällen.",
				requirements: ["hipaa:164.308(a)(8)", "bsi-200-1:8.3", "bsi-200-4:10"],
			},
			{
				kind: "inhalt",
				text: "Auch Kennzahlen und Übungen zeigen, ob Maßnahmen wirken. Die Ergebnisse fließen in Verbesserungen ein.",
				requirements: [
					"bsi-200-1:4.3",
					"bsi-200-2:10.1",
					"nis2:Art.21(2)(f)",
					"nist-csf:GV.OV-03",
					"nist-csf:ID.IM-01",
				],
				where: { href: "/testprogramm", label: "Testprogramm" },
			},
		],
	},

	"CC-CRY-01": {
		core: "Vertrauliche Daten sind auch im gespeicherten Zustand mit anerkannten Verfahren verschlüsselt.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=KZ-KRYPTO",
			label: "Vorlage Kryptokonzept",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Schriftliche Regeln legen die zugelassenen Verfahren und die Verwaltung der Schlüssel fest. Die Schlüssel selbst sind geschützt.",
				requirements: [
					"iso27001:A.8.24",
					"nis2:Art.21(2)(h)",
					"aws-ftr:DAT.2",
					"ms-sspa:SEC.4",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=KZ-KRYPTO",
					label: "Vorlage Kryptokonzept",
				},
			},
			{
				kind: "zielgruppe",
				text: "Auch Datensicherungen sind verschlüsselt und am Aufbewahrungsort geschützt.",
				requirements: ["mvsp:2.8", "nist-800-171:3.8.9", "cmmc:MP.L2-3.8.9"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=KZ-BACKUP",
					label: "Vorlage Backup-Konzept",
				},
			},
			{
				kind: "zielgruppe",
				text: "Laptops, Mobilgeräte und Datenträger sind verschlüsselt, auch beim Transport.",
				requirements: [
					"nist-800-171:3.1.19",
					"cmmc:AC.L2-3.1.19",
					"nist-800-171:3.8.6",
					"cmmc:MP.L2-3.8.6",
					"ms-sspa:SEC.4",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-ENDGERAETE",
					label: "Vorlage Endgeräterichtlinie",
				},
			},
			{
				kind: "inhalt",
				text: "Für geschützte Daten von US-Behörden dienen nur Verschlüsselungsmodule mit Prüfung nach FIPS 140.",
				requirements: ["nist-800-171:3.13.11", "cmmc:SC.L2-3.13.11"],
			},
			{
				kind: "zielgruppe",
				text: "Kartennummern sind überall unlesbar gespeichert: verschlüsselt, gekürzt, als Token oder als Hash mit Schlüssel.",
				requirements: ["pci-dss:3.5.1", "pci-dss:3.5.1.1"],
			},
			{
				kind: "inhalt",
				text: "Festplattenverschlüsselung allein genügt für Kartendaten nur auf Wechselmedien. Die Schlüssel dafür hängen nicht an Benutzerkonten.",
				requirements: ["pci-dss:3.5.1.2", "pci-dss:3.5.1.3"],
			},
			{
				kind: "inhalt",
				text: "Ist Verschlüsselung im gespeicherten Zustand nicht machbar, gibt die CISO-Person Ersatzmaßnahmen schriftlich frei und prüft sie jährlich.",
				requirements: ["nycrr-500:500.15"],
			},
			{
				kind: "zielgruppe",
				text: "Primärschlüssel für Kryptowerte liegen verschlüsselt, und für jeden gibt es ein Backup. Höhere Stufen verlangen geschützte Backups an getrennten Orten.",
				requirements: ["ccss:1.03"],
				where: { href: "/verwahrung", label: "Verwahrung" },
			},
			{
				kind: "zielgruppe",
				text: "Hersteller verschlüsseln Daten im Produkt nach Stand der Technik und schützen Befehle und Konfiguration vor Manipulation.",
				requirements: ["cra:AnhI-2e-f"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "inhalt",
				text: "Gespeicherte Daten sind auch gegen unbefugtes Verändern geschützt, nicht nur gegen Lesen.",
				requirements: ["nist-800-53:SC-28", "nist-csf:PR.DS-01"],
			},
			{
				kind: "inhalt",
				text: "In Kalifornien können Betroffene klagen, wenn unverschlüsselte Daten wegen fehlender Sicherheit entwendet werden.",
				requirements: ["ccpa:SE.2"],
			},
		],
	},

	"CC-RSK-02": {
		core: "Risiken werden nach einer festen Methode erkannt, nach Wahrscheinlichkeit und Auswirkung bewertet und im Register geführt.",
		where: { href: "/risiken", label: "Risiken" },
		additions: [
			{
				kind: "inhalt",
				text: "Die Methode legt Kriterien für die Akzeptanz fest und liefert vergleichbare Ergebnisse. Jedes Risiko hat eine verantwortliche Person.",
				requirements: ["iso27001:6.1.2", "nist-csf:GV.RM-06", "bsi-200-3:5.2"],
				where: { href: "/einstellungen?tab=risk", label: "Risikomethodik" },
			},
			{
				kind: "inhalt",
				text: "Je Zielobjekt sind die elementaren Gefährdungen G 0.1 bis G 0.47 zugeordnet und um eigene ergänzt.",
				requirements: ["bsi-200-3:4.1", "bsi-200-3:4.2"],
				where: { href: "/risiken/neu", label: "Risiko-Assistent" },
			},
			{
				kind: "inhalt",
				text: "Häufigkeit und Schaden werden in je vier Stufen geschätzt, und die Matrix ergibt die Risikokategorie.",
				requirements: ["bsi-200-3:5.1", "bsi-200-3:5.2"],
				where: { href: "/einstellungen?tab=risk", label: "Risikomethodik" },
			},
			{
				kind: "zielgruppe",
				text: "Eine eigene Risikoanalyse braucht jedes Zielobjekt mit hohem Schutzbedarf, ohne passenden Baustein oder mit untypischem Einsatz.",
				requirements: ["bsi-200-2:7.5", "bsi-200-2:8.5"],
			},
			{
				kind: "inhalt",
				text: "Bedrohungen von innen und außen sind erfasst, auch aus offenen oder kommerziellen Quellen.",
				requirements: ["nist-csf:ID.RA-03", "cmmc:RA.L3-3.11.1e"],
			},
			{
				kind: "inhalt",
				text: "Die Beurteilung berücksichtigt ausdrücklich das Risiko von Betrug.",
				requirements: ["soc2:CC3.3"],
			},
			{
				kind: "zielgruppe",
				text: "Risiken aus der Lieferkette fließen in die Beurteilung ein.",
				requirements: ["nist-csf:GV.SC-03", "nist-800-53:RA-3"],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller bewerten die Risiken jedes Produkts über den ganzen Lebenszyklus und halten die Bewertung im Unterstützungszeitraum aktuell.",
				requirements: ["cra:Art.13(1-4)"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Auch Risiken aus KI-Systemen werden nach festen Kriterien für Eintritt und Folgen beurteilt.",
				requirements: ["iso42001:6.1.2", "iso42001:8.2"],
			},
			{
				kind: "zielgruppe",
				text: "Für zeitkritische Prozesse sind Ausfälle von Personal, Gebäude, IT und Dienstleistern bewertet.",
				requirements: ["bsi-200-4:6.3"],
				where: { href: "/prozesse", label: "Prozesse" },
			},
			{
				kind: "rhythmus",
				text: "Neu bewertet wird auch bei wesentlichen Änderungen in Geschäft oder Technik.",
				requirements: [
					"iso27001:8.2",
					"nycrr-500:500.9(a)",
					"nist-800-53:RA-3",
					"iso42001:8.2",
				],
			},
			{
				kind: "nachweis",
				text: "Die Geschäftsleitung erhält regelmäßig und bei Bedarf auch zwischendurch einen Risikobericht. Das Aufsichtsorgan wird informiert.",
				requirements: ["zag-marisk:BT3"],
				where: { href: "/berichte", label: "Berichte an die GL" },
			},
			{
				kind: "inhalt",
				text: "Die wesentlichen Risiken stehen in einer Risikoinventur und sind in die Planung eingebunden. Banken ergänzen Risikostrategie und Stresstests.",
				requirements: ["zag-marisk:AT4.3.2", "kwg:AT4.2-4.3"],
			},
		],
	},

	"CC-INC-01": {
		core: "Ein festgelegter Ablauf regelt, wie Vorfälle erkannt, behandelt und dokumentiert werden, mit Rollen und Eskalation.",
		where: { href: "/vorfaelle", label: "Vorfälle" },
		additions: [
			{
				kind: "inhalt",
				text: "Der Ablauf reicht von Eindämmung und Behebung bis zu Wiederherstellung und Nachbereitung. Erkenntnisse fließen in Abläufe und Schulungen ein.",
				requirements: [
					"nis2:Art.21(2)(b)",
					"nist-800-53:IR-4",
					"nist-800-171:3.6.1",
					"cmmc:IR.L2-3.6.1",
					"tisax:1.6.2",
					"soc2:CC7.4",
					"nycrr-500:500.16(a)(1)",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-VORFALL",
					label: "Vorlage Vorfallrichtlinie",
				},
			},
			{
				kind: "inhalt",
				text: "Alle Vorfälle und erheblichen Cyberbedrohungen werden erfasst, und Frühwarnindikatoren sind eingerichtet. Schwerwiegende Vorfälle gehen an die Geschäftsleitung.",
				requirements: ["dora:Art.17"],
			},
			{
				kind: "zielgruppe",
				text: "Meldewege an Mitarbeitende, Kund:innen, Betroffene, Behörden und Partner wie Kartenorganisationen oder Cloud-Anbieter stehen vorab fest.",
				requirements: [
					"dora:Art.17",
					"pci-dss:12.10.1",
					"aws-ftr:SEC.2",
					"iso42001:A.8.4",
				],
			},
			{
				kind: "zielgruppe",
				text: "Kund:innen erfahren von einer Sicherheitsverletzung unverzüglich, mit Ansprechperson, erster Analyse und Plan zur Behebung.",
				requirements: ["mvsp:1.7"],
			},
			{
				kind: "inhalt",
				text: "Je Meldepflicht stehen Empfänger und Stufen fest, etwa Frühwarnung, Meldung und Abschlussbericht. Alle Datenschutzverletzungen werden dokumentiert.",
				requirements: [
					"dsgvo:Art.33",
					"cra:Art.14(3-4)",
					"nist-800-171:3.6.2",
					"cmmc:IR.L2-3.6.2",
				],
				where: { href: "/vorfaelle", label: "Meldeuhren am Vorfall" },
			},
			{
				kind: "zielgruppe",
				text: "Benannte Personen sind rund um die Uhr erreichbar. Für höchste Anforderungen gibt es eine Sicherheitszentrale und ein schnell einsetzbares Eingreifteam.",
				requirements: [
					"pci-dss:12.10.3",
					"cmmc:IR.L3-3.6.1e",
					"cmmc:IR.L3-3.6.2e",
				],
			},
			{
				kind: "inhalt",
				text: "Fallen Firewall, Protokollierung oder Schutzsoftware aus, wird das erkannt, gemeldet und umgehend behoben. Ursache und Folgen werden geklärt.",
				requirements: ["pci-dss:10.7.1", "pci-dss:10.7.2", "pci-dss:10.7.3"],
			},
			{
				kind: "inhalt",
				text: "Der Plan umfasst die Alarme der Überwachung und den Fund von Kartendaten an unerwarteten Orten.",
				requirements: ["pci-dss:12.10.5", "pci-dss:12.10.7"],
			},
			{
				kind: "inhalt",
				text: "Der Plan gilt ausdrücklich auch für Angriffe mit Ransomware.",
				requirements: ["nycrr-500:500.16(a)(1)"],
			},
			{
				kind: "zielgruppe",
				text: "Wichtige Lieferanten sind in Planung, Reaktion und Wiederherstellung eingebunden.",
				requirements: ["nist-csf:GV.SC-08", "nist-csf:RS.MA-01"],
				where: { href: "/dienstleister", label: "Dienstleister" },
			},
			{
				kind: "zielgruppe",
				text: "Anbieter für mehrere Kund:innen unterstützen forensische Untersuchungen und informieren betroffene Kund:innen über Vorfälle.",
				requirements: ["pci-dss:A1.2.2", "pci-dss:A1.2.3"],
			},
			{
				kind: "zielgruppe",
				text: "Eine Anlaufstelle hilft Nutzer:innen und Kund:innen beim Melden und Behandeln von Vorfällen.",
				requirements: ["nist-800-53:IR-7", "zag-marisk:BTO2"],
			},
			{
				kind: "rhythmus",
				text: "Der Plan wird geübt und nach Vorfällen überprüft und angepasst.",
				requirements: [
					"pci-dss:12.10.2",
					"aws-ftr:SEC.2",
					"nist-800-53:IR-8",
					"nist-csf:ID.IM-04",
				],
				where: { href: "/testprogramm", label: "Testprogramm" },
			},
			{
				kind: "nachweis",
				text: "Der Abschluss folgt festen Kriterien, und die Dokumentation wird geschlossen. Belege für alle Benachrichtigungen werden aufbewahrt.",
				requirements: [
					"nist-csf:RC.RP-06",
					"hipaa:164.414(b)",
					"hipaa:164.308(a)(6)(ii)",
					"nist-800-53:IR-5",
				],
			},
		],
	},

	"CC-LOG-01": {
		core: "Sicherheitsrelevante Ereignisse werden mit Person, Zeit und Ergebnis protokolliert, und die Protokolle sind vor Änderung geschützt.",
		where: {
			href: "/dokumente?vorlagen=1&vorlage=RL-LOGGING",
			label: "Vorlage Protokollierungskonzept",
		},
		additions: [
			{
				kind: "inhalt",
				text: "Protokolliert werden auch fehlgeschlagene Anmeldungen, Handlungen mit Verwaltungsrechten, Kontoänderungen, Start und Stopp der Protokolle und Zugriffe darauf. Dazu kommen Zugriffe auf Kartendaten und Zugriffe des Anbieters auf Kundendaten.",
				requirements: [
					"pci-dss:10.2.1",
					"pci-dss:10.2.1.1",
					"pci-dss:10.2.1.2",
					"pci-dss:10.2.1.3",
					"pci-dss:10.2.1.4",
					"pci-dss:10.2.1.5",
					"pci-dss:10.2.1.6",
					"pci-dss:10.2.1.7",
					"mvsp:2.7",
					"nist-800-171:3.1.7",
					"cmmc:AC.L2-3.1.7",
					"essential-eight:RA.2",
				],
			},
			{
				kind: "inhalt",
				text: "Jeder Eintrag nennt auch Art des Ereignisses, Herkunft wie die IP-Adresse und das betroffene Objekt. Sensible Daten selbst stehen nicht im Protokoll.",
				requirements: ["pci-dss:10.2.2", "nist-800-53:AU-3", "mvsp:2.7"],
			},
			{
				kind: "inhalt",
				text: "Jede Handlung lässt sich eindeutig einer Person zuordnen, denn jede Person hat eine eigene Kennung.",
				requirements: [
					"nist-800-171:3.3.2",
					"cmmc:AU.L2-3.3.2",
					"hipaa:164.312(a)(2)(i)",
				],
			},
			{
				kind: "inhalt",
				text: "Nur wenige Personen mit Bedarf lesen und verwalten Protokolle. Die Protokolle liegen zentral und schwer veränderbar, jede Änderung löst Alarm aus.",
				requirements: [
					"pci-dss:10.3.1",
					"pci-dss:10.3.2",
					"pci-dss:10.3.3",
					"pci-dss:10.3.4",
					"nist-800-53:AU-9",
					"nist-800-171:3.3.8",
					"cmmc:AU.L2-3.3.8",
					"ccss:2.04",
				],
			},
			{
				kind: "inhalt",
				text: "Fällt die Protokollierung aus, werden festgelegte Personen binnen festgelegter Frist alarmiert.",
				requirements: ["nist-800-53:AU-5"],
			},
			{
				kind: "inhalt",
				text: "Protokolle werden regelmäßig ausgewertet, um ungewöhnliche Aktivitäten zu finden. Alarmschwellen lösen die Reaktion aus.",
				requirements: [
					"dora:Art.10",
					"tisax:5.2.4",
					"nist-csf:DE.CM-03",
					"nist-csf:PR.PS-04",
					"hipaa:164.308(a)(1)(ii)(D)",
					"ms-sspa:SEC.6",
					"nist-800-171:3.3.1",
					"cmmc:AU.L2-3.3.1",
				],
			},
			{
				kind: "zielgruppe",
				text: "Kassensysteme zeichnen jeden Vorgang einzeln auf und sichern ihn mit einer zertifizierten technischen Sicherheitseinrichtung.",
				requirements: ["kassen:AO-§146a(1)"],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller bauen eine Sicherheitsprotokollierung in ihre Produkte ein, die Nutzer:innen abwählen können.",
				requirements: ["cra:AnhI-2l"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Anbieter für mehrere Kund:innen führen Protokolle getrennt je Kund:in.",
				requirements: ["pci-dss:A1.2.1"],
			},
			{
				kind: "zielgruppe",
				text: "In AWS zeichnet CloudTrail alle Konten und Regionen auf und legt die Protokolle geschützt ab.",
				requirements: ["aws-ftr:LOG.1"],
			},
			{
				kind: "zielgruppe",
				text: "Wesentliche Finanztransaktionen lassen sich aus den Aufzeichnungen nachvollziehen.",
				requirements: ["nycrr-500:500.6", "micar:Art.68"],
			},
			{
				kind: "nachweis",
				text: "Für festgelegte Handlungen wie Freigaben belegt eine digitale Signatur, wer sie ausgeführt hat.",
				requirements: ["nist-800-53:AU-10"],
			},
			{
				kind: "nachweis",
				text: "Ein Prüfverfahren belegt, dass Protokolle und Daten nicht unbefugt verändert wurden.",
				requirements: [
					"hipaa:164.312(c)(2)",
					"dora:Art.9(3)",
					"nist-csf:RS.AN-07",
				],
				where: { href: "/einstellungen?tab=verlauf", label: "Verlauf" },
			},
			{
				kind: "nachweis",
				text: "Festgelegt ist, welche Ereignisse protokolliert werden, abgestimmt mit den Fachbereichen und regelmäßig überprüft.",
				requirements: ["nist-800-53:AU-2", "nist-800-53:AU-12"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-LOGGING",
					label: "Vorlage Protokollierungskonzept",
				},
			},
		],
	},

	"CC-AST-01": {
		core: "Ein aktuelles Inventar erfasst Systeme, Software, Geräte und Daten, jeweils mit einer verantwortlichen Person.",
		where: { href: "/assets", label: "Inventar" },
		additions: [
			{
				kind: "inhalt",
				text: "Die Einträge sind den Geschäftsfunktionen zugeordnet, die sie stützen, mit Einstufung und Abhängigkeiten.",
				requirements: ["dora:Art.8(1-4)", "bsi-200-4:6.2"],
				where: { href: "/prozesse", label: "Prozesse" },
			},
			{
				kind: "inhalt",
				text: "Je System stehen Standort, Einstufung, Ende der Herstellerunterstützung und Wiederherstellungszeit im Inventar. Geräte sind mit Betriebssystem und Fassung erfasst.",
				requirements: ["nycrr-500:500.13(a)", "cyber-essentials:SC.2"],
				where: { href: "/assets", label: "Lebenszyklus im Inventar" },
			},
			{
				kind: "inhalt",
				text: "Auch Firmware, eigene Software und eingesetzte Fremdkomponenten stehen im Bestand. So lassen sich Schwachstellen und Patches zuordnen.",
				requirements: [
					"pci-dss:6.3.2",
					"nist-800-171:3.4.1",
					"cmmc:CM.L2-3.4.1",
				],
			},
			{
				kind: "zielgruppe",
				text: "Ein Verzeichnis zeigt, welche sensiblen Daten wo, wofür und von wem verarbeitet werden.",
				requirements: [
					"ms-sspa:MGT.6",
					"aws-ftr:DAT.1",
					"mvsp:3.1",
					"nist-csf:ID.AM-07",
				],
				where: {
					href: "/datenschutz?tab=vvt",
					label: "Verarbeitungsverzeichnis",
				},
			},
			{
				kind: "inhalt",
				text: "Werkzeuge halten das Inventar automatisch aktuell und erkennen unbekannte Komponenten. Das Verzeichnis ist die maßgebliche Quelle für freigegebene Komponenten.",
				requirements: [
					"cmmc:CM.L3-3.4.3e",
					"nist-800-53:CM-8",
					"cmmc:CM.L3-3.4.1e",
				],
			},
			{
				kind: "zielgruppe",
				text: "Festgelegt ist, welche Geräte, Netze und Cloud-Dienste zum Prüfbereich gehören. Alles mit Internetzugang darin zählt dazu.",
				requirements: ["cyber-essentials:SC.1"],
			},
			{
				kind: "inhalt",
				text: "Die Strukturanalyse erfasst auch Räume und Kommunikationsverbindungen und fasst Gleiches zu Gruppen zusammen.",
				requirements: ["bsi-200-2:8.1"],
			},
			{
				kind: "zielgruppe",
				text: "Besondere Geräte wie IoT, Steuerungstechnik und Testgeräte sind einbezogen oder in eigenen Netzen abgetrennt.",
				requirements: ["cmmc:SI.L3-3.14.3e"],
			},
			{
				kind: "zielgruppe",
				text: "Je KI-System sind Daten, Werkzeuge, Bibliotheken, Rechenleistung und beteiligte Menschen dokumentiert.",
				requirements: ["iso42001:A.4.2", "iso42001:A.4.4", "iso42001:A.4.5"],
			},
			{
				kind: "rhythmus",
				text: "Wird Hardware oder ein Datenträger an einen anderen Ort gebracht, ist festgehalten, wohin und wer verantwortlich ist.",
				requirements: ["hipaa:164.310(d)(2)(iii)"],
			},
			{
				kind: "inhalt",
				text: "Geräte sind eindeutig gekennzeichnet. Auf höchster Stufe gibt es Zugang nur über Geräte der Organisation.",
				requirements: [
					"nist-800-171:3.5.1",
					"cmmc:IA.L1-3.5.1",
					"cmmc:AC.L3-3.1.2e",
				],
			},
		],
	},

	"CC-TPR-04": {
		core: "Verträge mit Dienstleistern halten Sicherheitsanforderungen und Verantwortlichkeiten schriftlich fest.",
		where: { href: "/dienstleister", label: "Dienstleister" },
		additions: [
			{
				kind: "inhalt",
				text: "Verträge nennen Leistung, Orte der Datenverarbeitung, Zugangs- und Rückgaberechte, Hilfe bei Vorfällen, Mitwirkung bei Behörden und Kündigungsrechte.",
				requirements: ["dora:Art.30", "micar:Art.73"],
			},
			{
				kind: "zielgruppe",
				text: "Bei kritischen oder wichtigen Funktionen kommen volle SLAs, Meldepflichten, Notfallpläne, Prüfrechte, Ausstiegsstrategien und Teilnahme an TLPT dazu.",
				requirements: ["dora:Art.30"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=VA-EXIT-PLAN",
					label: "Vorlage Ausstiegsplan",
				},
			},
			{
				kind: "zielgruppe",
				text: "Auftragsverarbeiter sind per Vertrag an Weisung, Vertraulichkeit, Schutzmaßnahmen, Löschung und Prüfrechte gebunden. Unterauftragnehmer kommen nur mit gleichen Pflichten und nach Mitteilung dazu.",
				requirements: ["dsgvo:Art.28", "us-privacy:PR.1"],
				where: { href: "/datenschutz", label: "Datenschutz" },
			},
			{
				kind: "zielgruppe",
				text: "Dienstleister mit Gesundheitsdaten verpflichten sich, sie zu schützen, Vorfälle zu melden und Unterauftragnehmer ebenso zu binden. Am Vertragsende geben sie die Daten zurück oder vernichten sie.",
				requirements: [
					"hipaa:164.308(b)(1)",
					"hipaa:164.314(a)(2)(i)",
					"hipaa:164.504(e)",
				],
			},
			{
				kind: "zielgruppe",
				text: "Verträge mit Dienstleistern verbieten Verkauf und Nutzung der Daten außerhalb des Auftrags und erlauben Prüfungen. Dritte nutzen Daten nur mit Vertrag über begrenzte Zwecke.",
				requirements: ["ccpa:VP.1", "ccpa:VP.2"],
			},
			{
				kind: "inhalt",
				text: "Dienstleister melden Sicherheitsereignisse und Kompromittierungen ihrer Lieferkette. Der Vertrag verlangt Anmeldung mit mehreren Faktoren und Verschlüsselung.",
				requirements: [
					"nycrr-500:500.11(b)",
					"nist-800-53:SR-8",
					"bh-cbb:CBB-Cyber",
				],
			},
			{
				kind: "inhalt",
				text: "Für externes Personal gelten vertragliche Sicherheitsregeln, und Anbieter melden Austritte in fester Frist.",
				requirements: ["nist-800-53:PS-7"],
			},
			{
				kind: "inhalt",
				text: "Vor dem Austausch vertraulicher Informationen gibt es eine Geheimhaltungsvereinbarung.",
				requirements: ["tisax:6.1.2"],
			},
			{
				kind: "inhalt",
				text: "Der Vertrag regelt, wer für welche Sicherheit zuständig ist, gerade bei Cloud-Diensten. Dienstleister mit Kartendaten bestätigen ihre Verantwortung schriftlich.",
				requirements: [
					"tisax:1.2.4",
					"nist-csf:GV.SC-02",
					"iso42001:A.10.2",
					"pci-dss:12.8.2",
				],
			},
			{
				kind: "inhalt",
				text: "Unterauftragnehmer übernehmen dieselben Pflichten zu Datenschutz und Sicherheit, und ihre Einhaltung wird regelmäßig geprüft.",
				requirements: ["ms-sspa:TPR.2", "eu-us-dpf:P3"],
			},
			{
				kind: "inhalt",
				text: "Beschaffungsverträge enthalten Sicherheitsanforderungen, Abnahmekriterien und Reaktionszeiten für Wartung.",
				requirements: ["nist-800-53:SA-4", "nist-800-53:MA-6"],
			},
			{
				kind: "zielgruppe",
				text: "Wesentliche Auslagerungen werden der Aufsicht angezeigt. Bei Banken bleiben Leitungsaufgaben immer im Haus.",
				requirements: ["zag:§26", "kwg:§25b", "zag-marisk:AT9"],
			},
			{
				kind: "nachweis",
				text: "Je Vertrag belegt eine Klausel-Checkliste, welche Pflichtinhalte enthalten sind und wo Lücken bleiben.",
				requirements: ["dora:Art.30"],
				where: {
					href: "/dienstleister",
					label: "Klausel-Checkliste am Dienstleister",
				},
			},
		],
	},

	"CC-OPS-03": {
		core: "Schwachstellen werden regelmäßig gesucht, nach Risiko eingestuft und in festen Fristen behoben.",
		where: { href: "/sicherheit?tab=befunde", label: "Befunde" },
		additions: [
			{
				kind: "inhalt",
				text: "Neue Schwachstellen kommen aus anerkannten Quellen, und Warnungen von Herstellern und Behörden werden verfolgt.",
				requirements: [
					"pci-dss:6.3.1",
					"nist-800-171:3.14.3",
					"cmmc:SI.L2-3.14.3",
					"nycrr-500:500.5(c)",
				],
			},
			{
				kind: "inhalt",
				text: "Interne Scans laufen mit Anmeldung an den Systemen. Systeme, die kein Scanner erfasst, werden von Hand geprüft.",
				requirements: [
					"pci-dss:11.3.1.2",
					"nist-800-53:RA-5",
					"nycrr-500:500.5(a)(2)",
				],
				where: { href: "/sicherheit?tab=scans", label: "Scans" },
			},
			{
				kind: "rhythmus",
				text: "Gescannt wird zusätzlich nach jeder wesentlichen Änderung und sobald neue Schwachstellen bekannt werden.",
				requirements: [
					"pci-dss:11.3.1.3",
					"nycrr-500:500.5(a)(2)",
					"nist-800-53:RA-5",
					"nist-800-171:3.11.2",
					"cmmc:RA.L2-3.11.2",
				],
			},
			{
				kind: "rhythmus",
				text: "Programme mit Internetzugang werden täglich auf fehlende Updates geprüft. Wird eine Lücke aktiv angegriffen, kommt das Update binnen 48 Stunden.",
				requirements: [
					"essential-eight:PA.1",
					"essential-eight:PA.2",
					"essential-eight:PO.1",
				],
			},
			{
				kind: "inhalt",
				text: "Hohe und kritische Funde werden behoben und erneut gescannt. Für niedrigere Funde entscheidet eine gezielte Risikoanalyse.",
				requirements: ["pci-dss:11.3.1", "pci-dss:11.3.1.1"],
			},
			{
				kind: "inhalt",
				text: "Kann ein Update nicht eingespielt werden, braucht es eine geregelte Ausnahme oder gleichwertigen Schutz.",
				requirements: ["dora:Art.9(4)(f)", "mvsp:2.6"],
				where: { href: "/risiken?tab=ausnahmen", label: "Ausnahmen" },
			},
			{
				kind: "inhalt",
				text: "Software und Betriebssysteme ohne Herstellerunterstützung werden entfernt, ersetzt oder abgetrennt. Betriebssysteme laufen in der neuesten oder vorletzten Fassung.",
				requirements: [
					"cyber-essentials:UM.1",
					"essential-eight:PA.3",
					"essential-eight:PO.2",
					"essential-eight:PO.3",
					"nist-800-53:SA-22",
					"nist-csf:PR.PS-02",
				],
				where: { href: "/assets", label: "Lebenszyklus im Inventar" },
			},
			{
				kind: "zielgruppe",
				text: "Auch alle Abhängigkeiten der Anwendung werden geprüft und ab mittlerer Schwere aktualisiert.",
				requirements: ["aws-ftr:SEC.1", "mvsp:2.6"],
			},
			{
				kind: "zielgruppe",
				text: "Hersteller liefern ohne bekannte ausnutzbare Schwachstellen aus und trennen Sicherheitsupdates möglichst von Funktionsupdates. Bereitgestellte Updates bleiben zehn Jahre oder bis Supportende abrufbar, je nachdem, was länger dauert.",
				requirements: ["cra:AnhI-2a", "cra:AnhI-II-2", "cra:Art.13(9)"],
				where: { href: "/produkte", label: "Produkte" },
			},
			{
				kind: "zielgruppe",
				text: "Findet ein Hersteller eine Lücke in einer fremden Komponente, meldet er sie der Stelle, die sie pflegt. Im eigenen Produkt behebt er sie selbst.",
				requirements: ["cra:Art.13(6)"],
			},
			{
				kind: "inhalt",
				text: "Ein öffentlicher Meldeweg nimmt Hinweise auf Schwachstellen an, die ausgewertet und beantwortet werden.",
				requirements: [
					"nist-800-53:RA-5",
					"nist-csf:ID.RA-08",
					"nis2:Art.21(2)(e)",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-CVD",
					label: "Vorlage Offenlegung von Schwachstellen",
				},
			},
			{
				kind: "inhalt",
				text: "Das Testprogramm umfasst Scans, Prüfungen offener Software, Quellcodeprüfungen und Penetrationstests.",
				requirements: ["dora:Art.25"],
				where: { href: "/testprogramm", label: "Testprogramm" },
			},
			{
				kind: "nachweis",
				text: "Eine schriftliche Patch-Richtlinie legt Prioritäten nach Kritikalität von Lücke und System fest.",
				requirements: ["dora:Art.9(4)(f)", "nist-800-53:SI-1"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-PATCH",
					label: "Vorlage Patchmanagement",
				},
			},
		],
	},
};
