// Wie hängen Rahmenwerke untereinander zusammen (Teil Z5)? Gepflegte
// Beziehungen, die sich nicht aus den gemeinsamen Maßnahmen rechnen lassen:
// eines baut auf einem anderen auf, geht vor, löst ab, ergänzt oder will
// fast dasselbe. Jede Beziehung hat einen Satz in einfacher Sprache.
// Rechtsstand Oktober 2026; Fundstellen sind zu prüfen.

export const RELATION_KINDS = [
	"builds_on",
	"precedes",
	"replaces",
	"complements",
	"similar",
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export const RELATION_LABEL: Record<RelationKind, string> = {
	builds_on: "baut auf",
	precedes: "geht vor",
	replaces: "löst ab",
	complements: "ergänzt",
	similar: "fast gleich",
};

export type FrameworkRelation = {
	from: string;
	to: string;
	kind: RelationKind;
	text: string;
	// Fundstelle, wo es eine gibt
	basis?: string;
};

const CORRIDORS = ["uk-fca", "ae-vara", "bh-cbb", "ch-finma", "br-bcb"];

export const FRAMEWORK_RELATIONS: readonly FrameworkRelation[] = [
	{
		from: "soc2",
		to: "iso27001",
		kind: "similar",
		text: "Beide wollen fast dasselbe: Daten gut schützen. Eine Umsetzung trägt beide, nur der Prüfbericht sieht anders aus.",
	},
	{
		from: "bsi-200-1",
		to: "iso27001",
		kind: "similar",
		text: "Der BSI-Standard passt zu ISO 27001. Mit IT-Grundschutz gibt es auch ein ISO-27001-Zertifikat.",
	},
	{
		from: "bsi-200-2",
		to: "bsi-200-1",
		kind: "builds_on",
		text: "BSI 200-1 sagt, was ein Schutzsystem braucht. BSI 200-2 zeigt Schritt für Schritt, wie man es aufbaut.",
	},
	{
		from: "bsi-200-3",
		to: "bsi-200-2",
		kind: "builds_on",
		text: "Wo die Grundschutz-Bausteine nicht reichen, prüft man die Gefahren genauer nach BSI 200-3.",
	},
	{
		from: "bsi-200-4",
		to: "bsi-200-1",
		kind: "complements",
		text: "BSI 200-4 ergänzt den Schutz um den Notfall: wie die Firma nach einem Ausfall weiterarbeitet.",
	},
	{
		from: "dora",
		to: "nis2",
		kind: "precedes",
		text: "Für Finanzfirmen geht DORA vor. Von NIS2 bleiben dann vor allem Registrierung und Meldeweg.",
		basis: "Art. 4 NIS2-Richtlinie (Vorrang besonderer EU-Gesetze)",
	},
	{
		from: "micar",
		to: "dora",
		kind: "complements",
		text: "Wer eine Erlaubnis nach MiCAR hat, muss auch DORA erfüllen. MiCAR regelt das Geschäft, DORA die Technik.",
	},
	{
		from: "zag-marisk",
		to: "zag",
		kind: "builds_on",
		text: "Das ZAG sagt, was Zahlungsfirmen dürfen und müssen. Die ZAG-MaRisk erklären, wie sie das im Alltag umsetzen.",
	},
	{
		from: "kwg",
		to: "zag",
		kind: "precedes",
		text: "Banken mit Erlaubnis nach dem KWG brauchen für Zahlungen keine eigene Erlaubnis nach dem ZAG.",
		basis: "§ 1 Abs. 1 ZAG (Kreditinstitute als Zahlungsdienstleister)",
	},
	{
		from: "amlr",
		to: "gwg",
		kind: "replaces",
		text: "Ab Juli 2027 gilt die EU-Verordnung statt großer Teile des deutschen Geldwäschegesetzes.",
		basis: "Art. 90 AMLR (Geltung ab 10.07.2027)",
	},
	{
		from: "tfr",
		to: "gwg",
		kind: "complements",
		text: "Die Geldwäsche-Regeln prüfen die Kundschaft. Die Travel Rule sorgt dafür, dass bei jeder Überweisung die Namen mitreisen.",
	},
	{
		from: "sanctions",
		to: "gwg",
		kind: "complements",
		text: "Sanktionslisten prüft man zusammen mit der Prüfung der Kundschaft gegen schmutziges Geld.",
	},
	{
		from: "dac8",
		to: "micar",
		kind: "complements",
		text: "Krypto-Firmen mit MiCAR-Erlaubnis melden nach DAC8 zusätzlich Daten ihrer Kundschaft an das Finanzamt.",
	},
	{
		from: "ccss",
		to: "micar",
		kind: "complements",
		text: "MiCAR verlangt, digitales Geld sicher zu verwahren. CCSS zeigt genau, wie man die Schlüssel dafür schützt.",
	},
	{
		from: "dsgvo",
		to: "iso27001",
		kind: "complements",
		text: "ISO 27001 schützt alle Informationen. Die DSGVO schützt besonders die Daten über Menschen und gibt ihnen Rechte.",
	},
	{
		from: "cra",
		to: "nis2",
		kind: "complements",
		text: "Der CRA macht Produkte mit Software sicher. NIS2 macht die Firmen sicher, die solche Produkte nutzen.",
	},
	{
		from: "pci-dss",
		to: "iso27001",
		kind: "complements",
		text: "ISO 27001 gilt für alle Informationen. PCI DSS gilt nur für Kartendaten, dafür sehr genau.",
	},
	{
		from: "iso42001",
		to: "iso27001",
		kind: "builds_on",
		text: "ISO 42001 ist gleich aufgebaut wie ISO 27001. Wer ISO 27001 schon umsetzt, ergänzt vor allem die Regeln für KI.",
	},
	{
		from: "tisax",
		to: "iso27001",
		kind: "builds_on",
		text: "Der TISAX-Katalog lehnt sich eng an ISO 27001 an. Neu sind vor allem der Prototypenschutz und die Bewertung in Reifegraden.",
	},
	{
		from: "eu-us-dpf",
		to: "dsgvo",
		kind: "complements",
		text: "Die DSGVO erlaubt Übermittlungen in die USA, wenn die US-Firma am Data Privacy Framework teilnimmt. Dann braucht es keine eigenen Verträge dafür.",
		basis: "Art. 45 DSGVO mit Angemessenheitsbeschluss vom 10.07.2023",
	},
	{
		from: "cyber-essentials",
		to: "iso27001",
		kind: "complements",
		text: "Cyber Essentials prüft nur fünf technische Grundmaßnahmen. ISO 27001 enthält sie alle und noch viel mehr.",
	},
	{
		from: "essential-eight",
		to: "iso27001",
		kind: "complements",
		text: "Die acht Maßnahmen sind technisch und sehr genau. ISO 27001 verlangt das Ganze, Essential Eight sagt, wie gut acht Teile davon sein müssen.",
	},
	...CORRIDORS.map(
		(slug): FrameworkRelation => ({
			from: slug,
			to: "micar",
			kind: "complements",
			text: "Für Kundschaft in diesem Land gelten zusätzlich die Regeln dort. Die Regeln aus der EU reichen dort nicht.",
		}),
	),
];

// Beziehungen, die ein Rahmenwerk betreffen (in beide Richtungen)
export function relationsOf(slug: string): FrameworkRelation[] {
	return FRAMEWORK_RELATIONS.filter((r) => r.from === slug || r.to === slug);
}
