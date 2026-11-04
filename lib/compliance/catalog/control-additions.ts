// Kern und Zusätze je Maßnahme (Teil K, Nov 2026): Eine Maßnahme zählt für
// viele Rahmenwerke, aber jedes stellt eigene Anforderungen an sie. Der Kern
// ist, was alle verlangen; die Zusätze sagen, was einzelne Rahmenwerke
// darüber hinaus wollen: anderer Inhalt, eine bestimmte Gruppe, ein eigener
// Rhythmus oder ein bestimmter Nachweis. Jeder Zusatz nennt die Anforderungen,
// aus denen er kommt (nur Kanten dieser Maßnahme), und wo du ihn in Klick
// erledigst. Zahlen zu Turnus und Fristen rechnet weiter params.ts („Gleiche
// Maßnahme, andere Strenge“); gepflegter Rhythmus nur für das, was Zahlen nicht
// sagen (etwa „bei Eintritt“). Inhalte aus den Anforderungstexten des
// Katalogs, nie mehr als dort steht. Test control-additions.

export type AdditionKind = "inhalt" | "zielgruppe" | "rhythmus" | "nachweis";

export type KlickPlace = { href: string; label: string };

export type ControlAddition = {
	kind: AdditionKind;
	// Ein, höchstens zwei kurze Sätze: was dazukommt
	text: string;
	// Anforderungen, die das verlangen („rahmenwerk:code“, Kanten dieser Maßnahme)
	requirements: readonly `${string}:${string}`[];
	where?: KlickPlace;
};

export type ControlCore = {
	// Was alle verlangen, in einem Satz
	core: string;
	where?: KlickPlace;
	additions: readonly ControlAddition[];
};

import { PART_A } from "./control-additions-a";
import { PART_B } from "./control-additions-b";
import { PART_C } from "./control-additions-c";

export const ADDITION_KINDS: readonly AdditionKind[] = [
	"inhalt",
	"zielgruppe",
	"rhythmus",
	"nachweis",
];

export const CONTROL_ADDITIONS: Record<string, ControlCore> = {
	...PART_A,
	...PART_B,
	...PART_C,
	"CC-HR-03": {
		core: "Ein Programm schult alle Beschäftigten zur Sicherheit, mit Plan und belegter Teilnahme.",
		where: { href: "/schulungen", label: "Schulungen" },
		additions: [
			{
				kind: "inhalt",
				text: "Phishing und Täuschung am Telefon oder per Mail gehören in die Schulung.",
				requirements: [
					"pci-dss:5.4.1",
					"pci-dss:12.6.3.1",
					"nycrr-500:500.14(a)(3)",
					"cmmc:AT.L3-3.2.1e",
				],
				where: { href: "/schulungen", label: "Pflichtschulung Phishing" },
			},
			{
				kind: "inhalt",
				text: "Alle lernen, Anzeichen für Innentäter zu erkennen und zu melden.",
				requirements: [
					"nist-800-171:3.2.3",
					"cmmc:AT.L2-3.2.3",
					"nist-800-53:AT-2",
				],
			},
			{
				kind: "inhalt",
				text: "Wer mit Geldwäsche zu tun hat, lernt Sorgfaltspflichten, Verdachtsmeldung und das Verbot, Betroffene zu warnen.",
				requirements: ["gwg:§6", "gwg:§47"],
				where: { href: "/aml", label: "Geldwäsche" },
			},
			{
				kind: "inhalt",
				text: "Die Schulung erklärt Sanktionen und Embargos, damit niemand verbotene Zahlungen freigibt.",
				requirements: ["sanctions:AWG-§18"],
				where: { href: "/schulungen", label: "Pflichtschulung Sanktionen" },
			},
			{
				kind: "inhalt",
				text: "Die Schulung erklärt, wie Geräte und Technik genutzt werden dürfen.",
				requirements: ["pci-dss:12.6.3.2"],
			},
			{
				kind: "zielgruppe",
				text: "Die Geschäftsleitung wird eigens geschult, damit sie Cyberrisiken bewerten kann.",
				requirements: [
					"nis2:Art.20(2)",
					"dora:Art.13(6)",
					"hipaa:164.308(a)(5)(i)",
				],
				where: {
					href: "/schulungen",
					label: "Pflichtschulung für die Leitung",
				},
			},
			{
				kind: "zielgruppe",
				text: "Wer Software entwickelt, wird jährlich zu sicherer Entwicklung geschult.",
				requirements: ["pci-dss:6.2.2", "nist-800-53:SA-16"],
				where: {
					href: "/schulungen",
					label: "Pflichtschulung sichere Entwicklung",
				},
			},
			{
				kind: "zielgruppe",
				text: "Das Team für Vorfälle und Notfälle wird für seine Aufgabe geschult und übt.",
				requirements: [
					"pci-dss:12.10.4",
					"pci-dss:12.10.4.1",
					"nist-800-53:IR-2",
					"nist-800-53:CP-3",
				],
				where: {
					href: "/schulungen",
					label: "Pflichtschulung Vorfallbehandlung",
				},
			},
			{
				kind: "zielgruppe",
				text: "Wer Sicherheitsaufgaben übernimmt, wird vorher für diese Rolle geschult.",
				requirements: [
					"nist-800-53:AT-3",
					"nist-800-171:3.2.2",
					"cmmc:AT.L2-3.2.2",
					"nist-csf:PR.AT-02",
				],
				where: { href: "/schulungen?tab=matrix", label: "Kompetenzmatrix" },
			},
			{
				kind: "zielgruppe",
				text: "Wer an Kartenlesegeräten arbeitet, erkennt manipulierte Geräte und meldet sie.",
				requirements: ["pci-dss:9.5.1.3"],
			},
			{
				kind: "zielgruppe",
				text: "Wer Anfragen zum Datenschutz bearbeitet, kennt die Rechte der Betroffenen.",
				requirements: ["ccpa:RK.2"],
				where: { href: "/datenschutz", label: "Datenschutz" },
			},
			{
				kind: "rhythmus",
				text: "Geschult wird bei Eintritt und danach mindestens jährlich.",
				requirements: [
					"pci-dss:12.6.3",
					"ms-sspa:MGT.3",
					"nist-800-53:AT-2",
					"nycrr-500:500.14(a)(3)",
				],
				where: { href: "/schulungen", label: "Schulungsplan" },
			},
			{
				kind: "rhythmus",
				text: "Das Programm selbst wird jährlich geprüft und an neue Bedrohungen angepasst.",
				requirements: ["pci-dss:12.6.2", "cmmc:AT.L3-3.2.1e"],
			},
			{
				kind: "nachweis",
				text: "Die Teilnahme ist je Person belegt und wird aufbewahrt.",
				requirements: ["nist-800-53:AT-4"],
				where: {
					href: "/schulungen?tab=durchgefuehrt",
					label: "Durchgeführte Schulungen",
				},
			},
			{
				kind: "nachweis",
				text: "Beschäftigte bestätigen, dass sie die Sicherheitsrichtlinie gelesen haben.",
				requirements: ["pci-dss:12.6.3"],
				where: { href: "/dokumente", label: "Kenntnisnahme am Dokument" },
			},
		],
	},

	"CC-IAM-03": {
		core: "Jedes Konto meldet sich mit zwei Faktoren an, etwa Passwort und Passkey.",
		additions: [
			{
				kind: "inhalt",
				text: "Der zweite Faktor ist gegen Phishing geschützt, etwa ein Sicherheitsschlüssel oder Passkey.",
				requirements: ["essential-eight:MF.3"],
			},
			{
				kind: "inhalt",
				text: "Nach zu vielen Fehlversuchen wird das Konto zeitweise gesperrt.",
				requirements: [
					"pci-dss:8.3.4",
					"nist-800-53:AC-7",
					"nist-800-171:3.1.8",
					"cmmc:AC.L2-3.1.8",
				],
			},
			{
				kind: "inhalt",
				text: "Passwörter haben feste Regeln: Länge, keine Wiederverwendung, Erstpasswort sofort ändern.",
				requirements: [
					"pci-dss:8.3.5",
					"pci-dss:8.3.6",
					"pci-dss:8.3.7",
					"nist-800-171:3.5.7",
					"nist-800-171:3.5.8",
					"nist-800-171:3.5.9",
				],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-ZUGANG",
					label: "Vorlage Zugangsrichtlinie",
				},
			},
			{
				kind: "inhalt",
				text: "Passwörter werden gegen Listen bekannter, gestohlener Passwörter geprüft.",
				requirements: ["nist-800-53:IA-5"],
			},
			{
				kind: "inhalt",
				text: "Vor dem Zurücksetzen eines Faktors wird die Identität der Person geprüft.",
				requirements: ["pci-dss:8.3.3"],
			},
			{
				kind: "zielgruppe",
				text: "Verwaltungszugänge und jeder Fernzugriff von außen brauchen ausdrücklich den zweiten Faktor.",
				requirements: [
					"pci-dss:8.4.1",
					"pci-dss:8.4.3",
					"essential-eight:MF.2",
					"nist-800-171:3.5.3",
					"nist-800-171:3.7.5",
				],
			},
			{
				kind: "zielgruppe",
				text: "Kund:innen bestätigen Zahlungen und Kontozugriffe online mit zwei von drei Faktoren.",
				requirements: ["zag:§55"],
			},
			{
				kind: "zielgruppe",
				text: "Für Cloud-Dienste ist der zweite Faktor immer eingeschaltet.",
				requirements: ["cyber-essentials:AC.3", "essential-eight:MF.1"],
			},
			{
				kind: "rhythmus",
				text: "Ist ein Passwort der einzige Faktor, wird es spätestens alle 90 Tage gewechselt.",
				requirements: ["pci-dss:8.3.9", "pci-dss:8.3.10.1"],
			},
			{
				kind: "nachweis",
				text: "Die Regeln zur Anmeldung sind aufgeschrieben und allen bekannt.",
				requirements: ["pci-dss:8.3.8", "nist-800-53:IA-1"],
				where: {
					href: "/dokumente?vorlagen=1&vorlage=RL-ZUGANG",
					label: "Vorlage Zugangsrichtlinie",
				},
			},
		],
	},
};
