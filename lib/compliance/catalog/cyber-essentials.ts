import { buildIndex, type Spec } from "./spec";
import type { CatalogSection, FrameworkVariant } from "./types";

// Cyber Essentials (UK, NCSC mit IASME): fünf technische Grundmaßnahmen
// gegen alltägliche Angriffe. Basis = Selbstauskunft mit Prüfung, Plus =
// zusätzlich technische Prüfung vor Ort. Oft Pflicht bei Aufträgen der
// britischen Regierung. Eigene Formulierung nach den Anforderungen für
// IT-Infrastruktur (v3.x), gegen ncsc.gov.uk prüfen.

export const CE_VARIANTS: FrameworkVariant[] = [
	{
		key: "basic",
		label: "Cyber Essentials",
		hint: "Selbstauskunft, geprüft durch eine Zertifizierungsstelle",
	},
	{
		key: "plus",
		label: "Cyber Essentials Plus",
		hint: "Zusätzlich technische Prüfung durch die Zertifizierungsstelle",
	},
];

export const CE_SECTIONS: CatalogSection[] = [
	{ code: "SC", title: "Geltungsbereich", sortOrder: 10 },
	{ code: "FW", title: "Firewalls", sortOrder: 20 },
	{ code: "CF", title: "Sichere Konfiguration", sortOrder: 30 },
	{ code: "UM", title: "Updates", sortOrder: 40 },
	{ code: "AC", title: "Benutzerzugriff", sortOrder: 50 },
	{ code: "MW", title: "Schutz vor Schadsoftware", sortOrder: 60 },
	{ code: "PL", title: "Plus: technische Prüfung", sortOrder: 70 },
];

const S: Spec[] = [
	{
		code: "SC.1",
		section: "SC",
		title: "Geltungsbereich festlegen",
		text: "Festlegen, welche Geräte, Netze und Cloud-Dienste geprüft werden; alles mit Internetzugang im Bereich gehört dazu.",
		domain: "governance",
		controls: ["CC-GOV-04", "CC-AST-01"],
		partial: true,
	},
	{
		code: "SC.2",
		section: "SC",
		title: "Geräteverzeichnis",
		text: "Alle Geräte im Geltungsbereich sind mit Betriebssystem und Fassung erfasst.",
		domain: "asset",
		controls: ["CC-AST-01"],
	},
	{
		code: "FW.1",
		section: "FW",
		title: "Firewall an jedem Übergang",
		text: "Jedes Gerät ist durch eine Firewall am Netzübergang oder auf dem Gerät selbst geschützt.",
		domain: "network",
		controls: ["CC-NET-02"],
	},
	{
		code: "FW.2",
		section: "FW",
		title: "Regeln nur mit Grund",
		text: "Eingehende Verbindungen sind gesperrt, außer es gibt einen dokumentierten Grund; unnötige Regeln werden entfernt.",
		domain: "network",
		controls: ["CC-NET-02", "CC-NET-01"],
	},
	{
		code: "FW.3",
		section: "FW",
		title: "Verwaltung der Firewall schützen",
		text: "Das Standardpasswort ist geändert, die Verwaltung aus dem Internet ist gesperrt oder mit zweitem Faktor geschützt.",
		domain: "network",
		controls: ["CC-NET-02", "CC-IAM-04"],
	},
	{
		code: "CF.1",
		section: "CF",
		title: "Unnötiges entfernen",
		text: "Unnötige Software, Konten und Dienste sind entfernt oder abgeschaltet.",
		domain: "operations",
		controls: ["CC-OPS-04"],
	},
	{
		code: "CF.2",
		section: "CF",
		title: "Standardpasswörter ändern",
		text: "Standardpasswörter sind geändert; automatisches Ausführen von Dateien ist abgeschaltet.",
		domain: "operations",
		controls: ["CC-OPS-04", "CC-OPS-01"],
	},
	{
		code: "CF.3",
		section: "CF",
		title: "Geräte entsperren",
		text: "Geräte verlangen zum Entsperren eine PIN, ein Passwort oder ein biometrisches Merkmal, mit Schutz gegen Raten.",
		domain: "access",
		controls: ["CC-OPS-01", "CC-IAM-03"],
		partial: true,
	},
	{
		code: "UM.1",
		section: "UM",
		title: "Nur unterstützte Software",
		text: "Alle Software ist lizenziert und wird vom Hersteller noch mit Updates versorgt; alte Software ist entfernt oder abgetrennt.",
		domain: "operations",
		controls: ["CC-OPS-03", "CC-AST-06"],
	},
	{
		code: "UM.2",
		section: "UM",
		title: "Kritische Updates in 14 Tagen",
		text: "Updates für kritische und hohe Schwachstellen werden binnen 14 Tagen eingespielt.",
		domain: "operations",
		controls: ["CC-OPS-03"],
	},
	{
		code: "AC.1",
		section: "AC",
		title: "Konten nach Bedarf",
		text: "Konten werden nach festem Ablauf angelegt und gelöscht; jede Person hat nur die Rechte, die sie braucht.",
		domain: "access",
		controls: ["CC-IAM-02", "CC-IAM-01"],
	},
	{
		code: "AC.2",
		section: "AC",
		title: "Getrennte Admin-Konten",
		text: "Verwaltungsrechte liegen in eigenen Konten, die nicht für Mail und Internet genutzt werden.",
		domain: "access",
		controls: ["CC-IAM-04"],
	},
	{
		code: "AC.3",
		section: "AC",
		title: "Gute Passwörter und zweiter Faktor",
		text: "Passwörter sind lang genug, und für Cloud-Dienste ist ein zweiter Faktor eingeschaltet.",
		domain: "access",
		controls: ["CC-IAM-03"],
	},
	{
		code: "MW.1",
		section: "MW",
		title: "Schutz vor Schadsoftware",
		text: "Jedes Gerät hat Virenschutz mit aktuellen Signaturen, oder nur freigegebene Programme dürfen laufen.",
		domain: "operations",
		controls: ["CC-OPS-02", "CC-OPS-06"],
	},
	{
		code: "MW.2",
		section: "MW",
		title: "Schädliche Webseiten",
		text: "Der Zugriff auf bekannte schädliche Webseiten wird verhindert.",
		domain: "network",
		controls: ["CC-NET-03", "CC-OPS-02"],
		partial: true,
	},
	{
		code: "PL.1",
		section: "PL",
		title: "Technische Prüfung vor Ort",
		text: "Die Zertifizierungsstelle prüft Stichproben von Geräten technisch: Updates, Schadsoftware-Schutz, zweiter Faktor, Konten.",
		domain: "development",
		controls: ["CC-DEV-04", "CC-TST-01"],
		partial: true,
		variants: ["plus"],
	},
	{
		code: "PL.2",
		section: "PL",
		title: "Prüfung von außen",
		text: "Die Zertifizierungsstelle prüft die Systeme mit Internetzugang von außen auf Schwachstellen.",
		domain: "development",
		controls: ["CC-DEV-04"],
		variants: ["plus"],
	},
];

const built = buildIndex("cyber-essentials", S);
export const CE_REQUIREMENTS = built.requirements;
export const CE_EDGES = built.edges;
