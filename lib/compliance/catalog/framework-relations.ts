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
	{
		from: "nist-csf",
		to: "iso27001",
		kind: "similar",
		text: "Beide wollen fast dasselbe: eine Firma gegen Angriffe schützen. Für ISO 27001 gibt es ein Zertifikat, für den NIST-Rahmen nicht.",
	},
	{
		from: "nist-csf",
		to: "nist-800-53",
		kind: "complements",
		text: "Der NIST-Rahmen sagt, was erreicht werden soll. NIST 800-53 sagt genau, mit welchen Maßnahmen man es umsetzt.",
		basis: "Informative Referenzen von NIST: CSF 2.0 zu SP 800-53 Rev. 5",
	},
	{
		from: "nist-800-53",
		to: "iso27001",
		kind: "complements",
		text: "Beide wollen Daten gut schützen. NIST 800-53 ist viel genauer und hat drei Stufen je nach Schutzbedarf.",
	},
	{
		from: "nist-800-171",
		to: "nist-800-53",
		kind: "builds_on",
		text: "NIST 800-171 ist ein Auszug aus NIST 800-53. Er ist für Firmen gedacht, die Daten der US-Regierung bekommen.",
		basis: "NIST SP 800-171 Rev. 3",
	},
	{
		from: "cmmc",
		to: "nist-800-171",
		kind: "builds_on",
		text: "CMMC übernimmt die 110 Regeln von NIST 800-171. Neu ist, dass oft jemand von außen prüft und es drei Stufen gibt.",
		basis: "32 CFR 170.14",
	},
	{
		from: "hipaa",
		to: "dsgvo",
		kind: "complements",
		text: "Beide schützen Gesundheitsdaten, aber in verschiedenen Ländern. Wer Kundschaft in den USA und in Europa hat, braucht beide.",
	},
	{
		from: "hipaa",
		to: "iso27001",
		kind: "complements",
		text: "ISO 27001 deckt die Sicherheitsregeln von HIPAA zu großen Teilen ab. Die Meldung von Datenpannen und die Rechte der Menschen kommen bei HIPAA dazu.",
	},
	{
		from: "hipaa",
		to: "nist-csf",
		kind: "complements",
		text: "Die US-Gesundheitsbehörde verweist auf den NIST-Rahmen. Damit lässt sich der Schutz nach HIPAA gut planen und prüfen.",
		basis: "NIST SP 800-66 Rev. 2 (Februar 2024)",
	},
	{
		from: "nycrr-500",
		to: "dora",
		kind: "similar",
		text: "Beide sind Sicherheitsregeln der Finanzaufsicht. DORA gilt in der EU, diese Regeln gelten in New York. Meldungen, Tests und Notfallpläne sind ähnlich.",
	},
	{
		from: "nycrr-500",
		to: "nist-csf",
		kind: "complements",
		text: "Die Regeln aus New York folgen denselben Schritten wie der NIST-Rahmen: erkennen, schützen, entdecken, reagieren, wiederherstellen.",
	},
	{
		from: "nycrr-500",
		to: "iso27001",
		kind: "complements",
		text: "Ein Zertifikat nach ISO 27001 hilft beim Nachweis. Die Meldungen an die Aufsicht und die jährliche Bestätigung verlangt nur New York.",
	},
	{
		from: "ccpa",
		to: "dsgvo",
		kind: "complements",
		text: "Beide geben Menschen ähnliche Rechte an ihren Daten. In Kalifornien darf die Firma oft erst sammeln und muss ein Nein beachten, die DSGVO verlangt vorher einen erlaubten Grund.",
	},
	{
		from: "us-privacy",
		to: "ccpa",
		kind: "similar",
		text: "Die Gesetze der anderen Staaten wollen fast dasselbe wie das Gesetz in Kalifornien. Wer eines gut umsetzt, hat für die anderen schon viel geschafft.",
	},
	{
		from: "us-privacy",
		to: "dsgvo",
		kind: "complements",
		text: "Die Staaten haben viele Ideen aus der DSGVO übernommen, etwa die Prüfung riskanter Nutzungen. Meist reicht dort aber ein Nein der Person statt einer Einwilligung vorher.",
	},
	{
		from: "aws-ftr",
		to: "iso27001",
		kind: "complements",
		text: "AWS FTR prüft nur die Technik in den Konten bei AWS. ISO 27001 verlangt das ganze Vorgehen der Firma zum Schutz von Daten.",
	},
	{
		from: "aws-ftr",
		to: "soc2",
		kind: "complements",
		text: "Ein Bericht nach SOC 2 zeigt, dass die Firma im Ganzen gut aufpasst. AWS FTR schaut genau auf die Einstellungen bei AWS.",
	},
	{
		from: "ms-sspa",
		to: "dsgvo",
		kind: "complements",
		text: "Die DSGVO gilt als Gesetz für alle. Microsoft verlangt zusätzlich eigene Regeln und eine Prüfung jedes Jahr.",
	},
	{
		from: "ms-sspa",
		to: "iso27001",
		kind: "complements",
		text: "Ein Zertifikat nach ISO 27001 hilft bei der Prüfung durch Microsoft. Die Regeln zum Datenschutz deckt es aber nicht ab.",
	},
	{
		from: "mvsp",
		to: "iso27001",
		kind: "complements",
		text: "MVSP ist eine kurze Liste nur für Software. ISO 27001 verlangt ein ganzes Vorgehen für die ganze Firma.",
	},
	{
		from: "mvsp",
		to: "cra",
		kind: "complements",
		text: "Der CRA ist ein Gesetz für Produkte mit Software, die verkauft werden. MVSP ist freiwillig und fragt viele ähnliche Punkte ab.",
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
