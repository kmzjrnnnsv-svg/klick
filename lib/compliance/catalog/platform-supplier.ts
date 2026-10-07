import { ART30_CLAUSES } from "./art30-clauses";
import { BASELINE } from "./baseline";

// Lieferantenpaket der Plattform selbst (/vertrauen): Klick ist für Finanz-
// kunden ein IKT-Drittdienstleister nach DORA Art. 28–30. Hier stehen die
// Zusagen, das Registerdatenblatt (ITS 2024/2956), die Subunternehmerliste,
// Vorfallmeldung, Exit und AVV — öffentlich, neben /baseline. Juristische
// Person, Register und Adresse stehen im Impressum; hier keine Duplikate.

export type PlatformSubcontractor = {
	name: string;
	country: string;
	service: string; // ITS S-Code + Klartext
	purpose: string;
	personalData: boolean;
	rank: number;
};

export const PLATFORM_SUPPLIER = {
	asOf: BASELINE.asOf,
	role: "IKT-Drittdienstleister — Cloud: SaaS (ITS-Typ S19)",
	service:
		"Compliance-/GRC-Plattform: Common Controls, Nachweise, Register, Freigaben, Prüfungspakete für ISO 27001, DORA, NIS2, MaRisk, MiCAR, GwG.",
	country: "DE",
	dataLocations: ["Deutschland (Hetzner: Falkenstein, Nürnberg)"],
	registerSheet: [
		{ field: "B_05.01 c0050 Rechtlicher Name", value: "siehe Impressum" },
		{
			field: "B_05.01 c0010/c0020 Kennung",
			value: "LEI auf Anfrage; Handelsregister siehe Impressum",
		},
		{ field: "B_05.01 c0070 Art der Person", value: "juristische Person" },
		{ field: "B_05.01 c0080 Land des Hauptsitzes", value: "DE" },
		{
			field: "B_02.02 c0060 Art der IKT-Dienstleistung",
			value: "S19 Cloud: SaaS",
		},
		{ field: "B_02.02 c0120 Anwendbares Recht", value: "DE" },
		{ field: "B_02.02 c0130 Land der Leistungserbringung", value: "DE" },
		{ field: "B_02.02 c0140 Datenspeicherung", value: "Ja" },
		{
			field: "B_02.02 c0150/c0160 Standort Speicherung/Verarbeitung",
			value: "DE",
		},
		{
			field: "B_02.02 c0170 Sensibilität der Daten",
			value:
				"mittel/hoch (Compliance-Daten, personenbezogene Daten von Mitarbeitenden)",
		},
		{
			field: "B_07.01 c0050 Substituierbarkeit",
			value:
				"leicht — vollständiger Export in offenen Formaten (CSV, Markdown, ZIP) jederzeit",
		},
		{
			field: "B_07.01 c0080 Ausstiegsplan",
			value: "Ja — Export, Übergangsfrist, Löschbestätigung (siehe Exit)",
		},
	],
	subcontractors: [
		{
			name: "Hetzner Online GmbH",
			country: "DE",
			service: "S07 Hosting, Objektspeicher",
			purpose: "Produktion, Datenbank, verschlüsselte Nachweise und Backups",
			personalData: true,
			rank: 2,
		},
		{
			name: "Brevo (Sendinblue SAS)",
			country: "FR",
			service: "S19 SaaS — transaktionale E-Mail",
			purpose: "Anmelde-Links, Benachrichtigungen (E-Mail-Adresse, Name)",
			personalData: true,
			rank: 2,
		},
		{
			name: "GitHub, Inc.",
			country: "US",
			service: "S19 SaaS — Quellcode, CI/CD",
			purpose: "Entwicklung und Build; kein Zugriff auf Kundendaten",
			personalData: false,
			rank: 2,
		},
	] satisfies PlatformSubcontractor[],
	commitments: {
		"30(2)(a)":
			"Leistungsbeschreibung oben; Unterauftrag nur an die genannten Subunternehmer, Änderungen mit mindestens 30 Tagen Vorabmitteilung.",
		"30(2)(b)":
			"Leistungserbringung und Datenverarbeitung ausschließlich in Deutschland; Standortwechsel nur nach vorheriger Mitteilung.",
		"30(2)(c)":
			"Verschlüsselung je Mandant (XChaCha20-Poly1305, eigener Schlüssel), Mandantentrennung in der Datenbank (Row-Level-Security mit FORCE), MFA für alle Rollen, append-only Audit-Log mit Hash-Kette.",
		"30(2)(d)":
			"Export aller Daten jederzeit durch den Kunden selbst (ZIP mit SHA-256-Manifest); bei Vertragsende Export, Übergangsfrist und Löschbestätigung.",
		"30(2)(e)":
			"Verfügbarkeitsziel und Reaktionszeiten im SLA-Anhang; Health-/Ready-Endpunkte für die Überwachung durch den Kunden.",
		"30(2)(f)":
			"Unterstützung bei IKT-Vorfällen ohne Zusatzkosten; Kontaktstelle laut security.txt.",
		"30(2)(g)":
			"Zusammenarbeit mit BaFin, Bundesbank, BSI und Abwicklungsbehörden; Auskünfte innerhalb der gesetzten Frist.",
		"30(2)(h)":
			"Kündigung mit angemessener Mindestfrist laut Vertrag; außerordentliche Kündigungsrechte nach Art. 28(7) ausdrücklich eingeräumt.",
		"30(2)(i)":
			"Teilnahme an Sensibilisierungsmaßnahmen des Kunden auf Anfrage.",
		"30(3)(a)":
			"Vollständige SLA mit quantitativen Zielen (Verfügbarkeit, RTO/RPO, Reaktionszeiten) und jährlicher Überprüfung.",
		"30(3)(b)":
			"Unverzügliche Mitteilung wesentlicher Entwicklungen (Eigentümer-, Standort-, Subunternehmerwechsel, Sicherheitsvorfälle).",
		"30(3)(c)":
			"Tägliche verschlüsselte Backups mit Offsite-Kopie, Restore-Test als wiederkehrender Pflicht-Lauf, Notfall- und Wiederanlaufplan nach Testprogramm.",
		"30(3)(d)":
			"Mitwirkung an TLPT des Kunden nach Abstimmung von Umfang und Zeitfenster.",
		"30(3)(e)":
			"Zugangs-, Inspektions- und Auditrechte für Kunde, Prüfer und Behörden; Prüfungspaket mit Manifest auf Anfrage, Vor-Ort-Prüfung nach Terminabstimmung; /baseline als laufender Nachweis.",
		"30(3)(f)":
			"Ausstiegsstrategie: Weiterbetrieb während einer Übergangsfrist von mindestens sechs Monaten, Migrationsunterstützung, vollständiger Export, Löschbestätigung.",
	} as Record<string, string>,
	incident: {
		customerNotificationHours: 24,
		text: "Meldung an die benannte Kontaktstelle des Kunden spätestens 24 Stunden nach Kenntnis eines Vorfalls mit Auswirkung auf dessen Daten oder Dienste — mit Zeitpunkt, Umfang, betroffenen Diensten und Sofortmaßnahmen; Zwischen- und Abschlussbericht folgen. Der Kunde kann die Angaben in seine eigene DORA-Erstmeldung übernehmen.",
	},
	exit: [
		"Vollständiger Export jederzeit durch den Kunden selbst — ZIP mit SHA-256-Manifest, offene Formate (CSV, Markdown), Nachweise im Original.",
		"Übergangsfrist von mindestens sechs Monaten mit Weiterbetrieb nach Kündigung.",
		"Löschung durch Vernichtung des Mandantenschlüssels (Crypto-Shredding) und Löschung der Objekte; schriftliche Löschbestätigung mit Datum.",
	],
	dpa: "Auftragsverarbeitungsvertrag nach Art. 28 DSGVO ist Vertragsbestandteil; technische und organisatorische Maßnahmen entsprechen dem Stand auf /baseline; Subunternehmer wie oben, Änderungen mit Widerspruchsrecht.",
} as const;

// Paket als Markdown (öffentlicher Download /vertrauen/paket.md).
export function platformSupplierMarkdown(): string {
	const p = PLATFORM_SUPPLIER;
	const lines: string[] = [
		"# Lieferantenpaket der Plattform (DORA Art. 28–30)",
		"",
		`Stand ${p.asOf} · Rolle: ${p.role}`,
		"",
		p.service,
		"",
		"## Registerdatenblatt (ITS (EU) 2024/2956)",
		"",
		"| Feld | Wert |",
		"|---|---|",
		...p.registerSheet.map((r) => `| ${r.field} | ${r.value} |`),
		"",
		"## Zusagen nach Art. 30",
		"",
		"| Art. | Inhalt | Zusage |",
		"|---|---|---|",
		...ART30_CLAUSES.map(
			(c) =>
				`| ${c.code}${c.criticalOnly ? " (kritisch)" : ""} | **${c.title}** — ${c.text} | ${p.commitments[c.code] ?? ""} |`,
		),
		"",
		"## Subunternehmer (B_05.02, Rang 2)",
		"",
		"| Name | Land | Leistung | Zweck | personenbezogene Daten |",
		"|---|---|---|---|---|",
		...p.subcontractors.map(
			(s) =>
				`| ${s.name} | ${s.country} | ${s.service} | ${s.purpose} | ${s.personalData ? "ja" : "nein"} |`,
		),
		"",
		"## Vorfallmeldung an Kunden",
		"",
		p.incident.text,
		"",
		"## Exit",
		"",
		...p.exit.map((e) => `- ${e}`),
		"",
		"## Auftragsverarbeitung",
		"",
		p.dpa,
		"",
		"## Technische und organisatorische Maßnahmen (Auszug aus /baseline)",
		"",
	];
	for (const n of BASELINE.narrative) {
		lines.push(`### ${n.title}`, "");
		for (const item of n.present) lines.push(`- ${item}`);
		lines.push("");
	}
	lines.push(
		"_Öffentliche Zusammenfassung; verbindlich sind Vertrag, SLA-Anhang und AVV. Kein Rechtsrat._",
		"",
	);
	return lines.join("\n");
}
