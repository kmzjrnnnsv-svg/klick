// Jedes Rahmenwerk so erklärt, dass auch ein Kind es versteht (Teil Z2):
// wozu es da ist, für wen, wer es verlangt, was ohne passiert, wie man es
// zeigt, ein Bild aus dem Alltag. Dazu je Kapitel ein einfacher Satz.
// Kurze Sätze, keine Fachwörter (Test framework-profiles). Rechtsstand
// Oktober 2026; fachlich gilt die Beschreibung im Katalog.

export const ISSUER_KINDS = [
	"law_eu",
	"law_eu_national",
	"law_de",
	"law_foreign",
	"supervisor",
	"standard",
	"industry",
	"customer",
] as const;
export type IssuerKind = (typeof ISSUER_KINDS)[number];

export const ISSUER_LABEL: Record<IssuerKind, string> = {
	law_eu: "Gesetz der EU",
	law_eu_national: "Gesetz der EU, in Deutschland umgesetzt",
	law_de: "Gesetz in Deutschland",
	law_foreign: "Gesetz in einem anderen Land",
	supervisor: "Vorgabe der Aufsicht",
	standard: "Freiwilliger Standard mit Zertifikat",
	industry: "Regeln einer Branche",
	customer: "Verlangen Kundinnen und Kunden",
};

// Muss ich? Gesetze gelten, wenn man betroffen ist; Standards wählt man
export const ISSUER_MUST: Record<IssuerKind, "law" | "rules" | "voluntary"> = {
	law_eu: "law",
	law_eu_national: "law",
	law_de: "law",
	law_foreign: "law",
	supervisor: "law",
	standard: "voluntary",
	industry: "rules",
	customer: "voluntary",
};

export type FrameworkProfile = {
	// In einem Satz: wozu es da ist
	simple: string;
	// Welcher Schaden verhindert werden soll
	why: string;
	forWhom: string;
	issuer: IssuerKind;
	// Was passiert ohne
	ifNot: string;
	// Wie man es zeigt
	proof: string;
	// Ein Bild aus dem Alltag, beginnt mit „Wie …“
	example: string;
};

function corridor(country: string, region: string): FrameworkProfile {
	return {
		simple: `Die Regeln ${country} für Firmen, die mit digitalem Geld oder Zahlungen arbeiten.`,
		why: `Wer Kundschaft ${region} hat, muss sich an die Regeln dort halten.`,
		forWhom: `Firmen, die Kundschaft ${region} bedienen wollen.`,
		issuer: "law_foreign",
		ifNot: "Ohne Erlaubnis oder Partner mit Erlaubnis kein Geschäft dort.",
		proof:
			"Erlaubnis oder Eintragung bei der Aufsicht dort, oder ein Partner, der sie hat.",
		example: "Wie im Urlaub: Dort gelten andere Verkehrsregeln als zu Hause.",
	};
}

export const FRAMEWORK_PROFILES: Record<string, FrameworkProfile> = {
	iso27001: {
		simple:
			"Ein Bauplan, wie eine Firma ihre Informationen Schritt für Schritt schützt.",
		why: "Daten sollen nicht verloren gehen, gestohlen oder heimlich verändert werden.",
		forWhom:
			"Jede Firma, die zeigen will, dass sie gut auf Daten aufpasst. Kundschaft fragt oft danach.",
		issuer: "standard",
		ifNot:
			"Kein Zertifikat, und manche Kundschaft vergibt dann keinen Auftrag.",
		proof:
			"Ein Zertifikat von einer unabhängigen Prüfstelle, jedes Jahr nachgeprüft.",
		example:
			"Wie das Schwimmabzeichen: Nach der Prüfung weiß jeder, was du kannst.",
	},
	dora: {
		simple:
			"Ein EU-Gesetz, damit Finanzfirmen auch bei Computerproblemen weiterarbeiten.",
		why: "Fällt die Technik einer Bank aus, kommen Menschen nicht an ihr Geld.",
		forWhom:
			"Banken, Zahlungsfirmen, Versicherungen, Firmen mit digitalem Geld und viele andere Finanzfirmen in der EU.",
		issuer: "law_eu",
		ifNot:
			"Die Aufsicht kann Strafen verhängen und im schlimmsten Fall die Erlaubnis entziehen.",
		proof:
			"Die Aufsicht prüft. Die Firma meldet schwere Vorfälle und führt eine Liste ihrer Helfer.",
		example: "Wie im Krankenhaus: Auch bei Stromausfall muss es weitergehen.",
	},
	nis2: {
		simple:
			"Ein Gesetz, damit wichtige Firmen sich gut gegen Angriffe aus dem Internet schützen.",
		why: "Fällt eine wichtige Firma aus, leiden viele Menschen darunter, zum Beispiel ohne Strom oder Wasser.",
		forWhom:
			"Mittlere und große Firmen in wichtigen Bereichen wie Energie, Gesundheit, Verkehr oder Digitales.",
		issuer: "law_eu_national",
		ifNot: "Bußgelder, und die Leitung haftet persönlich.",
		proof:
			"Anmeldung beim zuständigen Amt (BSI), Meldungen bei Vorfällen, Nachweise auf Anfrage.",
		example: "Wie die Regel, dass Feuerwehrautos immer fahrbereit sein müssen.",
	},
	micar: {
		simple:
			"Ein EU-Gesetz für Firmen, die mit digitalem Geld wie Bitcoin arbeiten.",
		why: "Menschen sollen beim digitalen Geld genauso geschützt sein wie bei einer Bank.",
		forWhom:
			"Firmen, die digitales Geld aufbewahren, tauschen, verschicken oder selbst herausgeben.",
		issuer: "law_eu",
		ifNot: "Ohne Erlaubnis ist das Geschäft verboten.",
		proof: "Erlaubnis der Aufsicht und laufende Prüfung.",
		example: "Wie ein Führerschein: Ohne ihn darfst du nicht fahren.",
	},
	zag: {
		simple:
			"Ein deutsches Gesetz für Firmen, die Zahlungen für andere abwickeln.",
		why: "Das Geld der Menschen soll bei Zahlungsfirmen sicher sein.",
		forWhom:
			"Zahlungsinstitute und E-Geld-Firmen, zum Beispiel für Kartenzahlung oder Überweisungen.",
		issuer: "law_de",
		ifNot: "Ohne Erlaubnis ist das Geschäft verboten und strafbar.",
		proof: "Erlaubnis der BaFin, jährliche Prüfung und Meldungen.",
		example:
			"Wie die Erlaubnis für den Schulkiosk, der mit dem Geld der Kinder umgeht.",
	},
	"zag-marisk": {
		simple:
			"Genaue Regeln der Aufsicht, wie Zahlungsfirmen ihre Gefahren steuern.",
		why: "Das Gesetz sagt, was zu tun ist. Diese Regeln sagen, wie.",
		forWhom: "Zahlungsinstitute und E-Geld-Firmen in Deutschland.",
		issuer: "supervisor",
		ifNot: "Die Aufsicht beanstandet Mängel und kann Auflagen machen.",
		proof: "Prüfung durch Wirtschaftsprüfer und die Aufsicht.",
		example: "Wie die genaue Anleitung, die zur Hausordnung gehört.",
	},
	gwg: {
		simple: "Ein deutsches Gesetz gegen schmutziges Geld von Verbrechern.",
		why: "Verbrecher sollen ihr Geld nicht sauber aussehen lassen können.",
		forWhom:
			"Banken, Zahlungsfirmen, Firmen mit digitalem Geld, aber auch Makler oder Händler.",
		issuer: "law_de",
		ifNot: "Hohe Bußgelder, die öffentlich bekannt gemacht werden.",
		proof:
			"Gefahrenanalyse, Prüfung der Kundschaft, Verdachtsmeldungen und Prüfung durch die Aufsicht.",
		example: "Wie ein Ladenbesitzer, der Falschgeld erkennen und melden muss.",
	},
	amlr: {
		simple:
			"Die neue EU-Verordnung gegen schmutziges Geld, ab Juli 2027 statt großer Teile des deutschen Gesetzes.",
		why: "In der ganzen EU sollen dieselben Regeln gegen schmutziges Geld gelten.",
		forWhom: "Dieselben Firmen wie beim deutschen Geldwäschegesetz.",
		issuer: "law_eu",
		ifNot: "Hohe Bußgelder.",
		proof: "Wie beim deutschen Gesetz, nur nach EU-weit gleichen Regeln.",
		example:
			"Wie wenn alle Schulen eines Landes dieselbe Hausordnung bekommen.",
	},
	tfr: {
		simple:
			"Bei jeder Überweisung, auch von digitalem Geld, reisen die Namen von Absender und Empfänger mit.",
		why: "So können Verbrecher ihr Geld nicht unerkannt verschieben.",
		forWhom: "Banken, Zahlungsfirmen und Firmen mit digitalem Geld.",
		issuer: "law_eu",
		ifNot: "Bußgelder, und Überweisungen dürfen nicht ausgeführt werden.",
		proof: "Nachprüfbare Aufzeichnungen zu jeder Überweisung.",
		example: "Wie ein Paket, auf dem immer Absender und Empfänger stehen.",
	},
	sanctions: {
		simple:
			"Regeln, mit wem Geschäfte verboten sind, zum Beispiel mit bestimmten Ländern oder Personen.",
		why: "Wer Kriege führt oder Terror unterstützt, soll kein Geld bekommen.",
		forWhom: "Jede Firma, besonders Banken und Zahlungsfirmen.",
		issuer: "law_eu",
		ifNot: "Strafen bis hin zu Gefängnis, und Geld wird eingefroren.",
		proof: "Prüfung aller Kundinnen, Kunden und Zahlungen gegen Listen.",
		example: "Wie die Liste mit Hausverboten beim Türsteher.",
	},
	dsgvo: {
		simple: "Das Gesetz, das die Daten von Menschen schützt.",
		why: "Jeder Mensch soll selbst bestimmen, was mit seinen Daten passiert.",
		forWhom: "Jede Firma, die Daten von Menschen nutzt, also fast alle.",
		issuer: "law_eu",
		ifNot: "Hohe Bußgelder und Schadenersatz an die Betroffenen.",
		proof:
			"Ein Verzeichnis der Datennutzung, Verträge mit Helfern und Meldungen bei Pannen.",
		example: "Wie das Recht, dass niemand dein Tagebuch ohne Erlaubnis liest.",
	},
	dac8: {
		simple:
			"Firmen mit digitalem Geld melden dem Finanzamt die Geschäfte ihrer Kundschaft.",
		why: "Auch auf Gewinne mit digitalem Geld sollen Steuern gezahlt werden.",
		forWhom: "Firmen, die für andere mit digitalem Geld handeln.",
		issuer: "law_eu_national",
		ifNot: "Bußgelder.",
		proof: "Eine jährliche Meldung an die Steuerbehörde.",
		example:
			"Wie die Bescheinigung, die Eltern für die Steuererklärung brauchen.",
	},
	awv: {
		simple: "Größere Zahlungen ins Ausland werden der Bundesbank gemeldet.",
		why: "Der Staat will wissen, wie viel Geld ins Ausland und zurück fließt.",
		forWhom:
			"Firmen, die große Zahlungen ins Ausland schicken oder von dort bekommen.",
		issuer: "law_de",
		ifNot: "Bußgelder.",
		proof: "Monatliche Meldungen an die Bundesbank.",
		example: "Wie eine Strichliste, wer wie oft ins Ausland fährt.",
	},
	kassen: {
		simple:
			"Regeln für elektronische Kassen, damit niemand Einnahmen heimlich löscht.",
		why: "Alle sollen ehrlich ihre Steuern zahlen.",
		forWhom: "Läden und Firmen mit einer elektronischen Kasse.",
		issuer: "law_de",
		ifNot: "Bußgelder, und das Finanzamt schätzt die Steuern.",
		proof: "Ein Sicherheitsmodul in der Kasse, Belege und eine Beschreibung.",
		example: "Wie der Kassenzettel, den du beim Bäcker bekommst.",
	},
	kwg: {
		simple: "Das Gesetz für Banken in Deutschland.",
		why: "Das Geld der Sparerinnen und Sparer soll sicher sein.",
		forWhom: "Banken und andere Kreditinstitute.",
		issuer: "law_de",
		ifNot: "Ohne Erlaubnis ist das Bankgeschäft verboten und strafbar.",
		proof: "Erlaubnis, laufende Aufsicht, Prüfungen und viele Meldungen.",
		example:
			"Wie die strengen Regeln für die Bank, bei der dein Sparbuch liegt.",
	},
	cra: {
		simple:
			"Ein EU-Gesetz, damit Produkte mit Software sicher verkauft werden.",
		why: "Unsichere Geräte und Apps sind ein Einfallstor für Angreifer.",
		forWhom:
			"Hersteller, Einführer und Händler von Software und Geräten mit Software.",
		issuer: "law_eu",
		ifNot: "Das Produkt darf nicht verkauft werden, dazu kommen Bußgelder.",
		proof:
			"Das CE-Zeichen, eine technische Beschreibung und Meldungen bei Lücken.",
		example: "Wie das Prüfsiegel auf Spielzeug.",
	},
	soc2: {
		simple:
			"Ein Prüfbericht aus den USA: Die Firma passt gut auf die Daten ihrer Kundschaft auf.",
		why: "Kundschaft will sicher sein, bevor sie einer Firma ihre Daten gibt.",
		forWhom: "Vor allem Software-Firmen mit Kundschaft in den USA.",
		issuer: "customer",
		ifNot: "Kein Bericht, und viele Kundinnen und Kunden kaufen dann nicht.",
		proof: "Der Bericht einer Prüfgesellschaft über einen ganzen Zeitraum.",
		example:
			"Wie ein Zeugnis über ein ganzes Schuljahr, nicht nur über eine Prüfung.",
	},
	ccss: {
		simple:
			"Ein Standard, wie man digitales Geld und seine Schlüssel sicher aufbewahrt.",
		why: "Wer den Schlüssel verliert oder verrät, verliert das Geld.",
		forWhom: "Firmen, die digitales Geld für andere aufbewahren.",
		issuer: "industry",
		ifNot: "Kein Nachweis gegenüber Kundschaft und Aufsicht.",
		proof: "Eine Prüfung durch zugelassene Prüferinnen und Prüfer.",
		example: "Wie die Regeln für den Tresor einer Bank.",
	},
	"bsi-200-1": {
		simple:
			"Der deutsche Grundplan, wie eine Firma ihre Informationssicherheit organisiert.",
		why: "Sicherheit soll geplant sein und nicht vom Zufall abhängen.",
		forWhom:
			"Behörden und Firmen in Deutschland, oft verlangt bei öffentlichen Aufträgen.",
		issuer: "standard",
		ifNot: "Kein Zertifikat nach deutschem Grundschutz.",
		proof: "Ein Zertifikat auf Grundlage des IT-Grundschutzes.",
		example: "Wie ISO 27001, nur nach deutscher Bauart.",
	},
	"bsi-200-2": {
		simple:
			"Die Anleitung, wie man beim deutschen Grundschutz Schritt für Schritt vorgeht.",
		why: "Mit fertigen Bausteinen geht es schneller, als alles selbst zu erfinden.",
		forWhom:
			"Behörden und Firmen in Deutschland, die nach Grundschutz arbeiten.",
		issuer: "standard",
		ifNot: "Kein Zertifikat nach deutschem Grundschutz.",
		proof: "Ein Grundschutz-Check und ein Sicherheitskonzept.",
		example: "Wie ein Baukasten mit fertigen Teilen und einer Anleitung.",
	},
	"bsi-200-3": {
		simple: "Eine einfache Methode, Gefahren zu finden und zu bewerten.",
		why: "So denkt man auch an Gefahren, die nicht im Baukasten stehen.",
		forWhom: "Alle, die nach deutschem Grundschutz arbeiten.",
		issuer: "standard",
		ifNot: "Gefahren bleiben unbemerkt, und das Zertifikat fehlt.",
		proof: "Eine Liste der Gefahren und ihre Bewertung.",
		example: "Wie eine Liste möglicher Gefahren vor dem Ausflug.",
	},
	"bsi-200-4": {
		simple: "Die Anleitung, wie eine Firma Notfälle übersteht.",
		why: "Wichtige Arbeit soll auch im Notfall weitergehen.",
		forWhom: "Alle Firmen und Behörden, die sich auf Notfälle vorbereiten.",
		issuer: "standard",
		ifNot: "Im Notfall fehlt ein Plan, und es dauert viel länger.",
		proof: "Ein Notfallhandbuch und Protokolle von Übungen.",
		example: "Wie der Plan für den Probealarm in der Schule.",
	},
	"pci-dss": {
		simple: "Regeln der Kreditkartenfirmen, wie Kartendaten geschützt werden.",
		why: "Kartennummern sollen nicht in die Hände von Dieben fallen.",
		forWhom:
			"Jede Firma, die Kreditkartenzahlungen annimmt oder für andere abwickelt.",
		issuer: "industry",
		ifNot: "Strafgebühren, und im schlimmsten Fall keine Kartenzahlung mehr.",
		proof:
			"Je nach Größe ein Fragebogen zur Selbstauskunft oder eine Prüfung durch zugelassene Prüfer.",
		example:
			"Wie die Regeln eines Vereins: Wer mitmachen will, hält sich daran.",
	},
	"uk-fca": corridor("in Großbritannien", "in Großbritannien"),
	"ae-vara": corridor(
		"in den Vereinigten Arabischen Emiraten",
		"in den Emiraten",
	),
	"bh-cbb": corridor("in Bahrain", "in Bahrain"),
	"ch-finma": corridor("in der Schweiz", "in der Schweiz"),
	"br-bcb": corridor("in Brasilien", "in Brasilien"),
};

// Je Kapitel ein einfacher Satz, Schlüssel „rahmenwerk:kapitel“
export const SECTION_SIMPLE: Record<string, string> = {
	"iso27001:4":
		"Die Firma klärt, wer etwas von ihr erwartet und was geschützt wird.",
	"iso27001:5": "Die Leitung übernimmt Verantwortung und verteilt Aufgaben.",
	"iso27001:6":
		"Die Firma plant: Welche Gefahren gibt es, welche Ziele hat sie?",
	"iso27001:7":
		"Es gibt genug Leute, Wissen und Unterlagen für die Sicherheit.",
	"iso27001:8": "Die Pläne werden im Alltag umgesetzt.",
	"iso27001:9": "Die Firma misst und prüft, ob alles wirkt.",
	"iso27001:10": "Fehler werden behoben, und es wird immer etwas besser.",
	"iso27001:A.5": "Regeln, Rollen und Abläufe in der Firma.",
	"iso27001:A.6": "Alles rund um die Menschen, die dort arbeiten.",
	"iso27001:A.7": "Schutz von Räumen, Türen und Geräten.",
	"iso27001:A.8":
		"Schutz durch Technik: Anmeldung, Updates, Verschlüsselung und mehr.",
	"dora:II": "Die Firma steuert die Gefahren für ihre Technik.",
	"dora:III": "Schwere Computerprobleme werden erkannt und gemeldet.",
	"dora:IV": "Die Firma testet, ob ihre Technik Störungen aushält.",
	"dora:V":
		"Helfer von außen werden ausgewählt, vertraglich gebunden und beobachtet.",
	"dora:VI": "Firmen tauschen Wissen über Angriffe aus.",
	"nis2:A": "Die Firma prüft, ob das Gesetz für sie gilt.",
	"nis2:B": "Die Leitung ist verantwortlich und lernt dazu.",
	"nis2:C":
		"Zehn Gruppen von Schutzmaßnahmen, vom Notfallplan bis zur Verschlüsselung.",
	"nis2:D": "Schwere Vorfälle werden in festen Stufen gemeldet.",
	"nis2:E": "Die Firma meldet sich beim Amt an.",
	"nis2:F": "Firmen tauschen Warnungen aus.",
	"nis2:G": "Zusatzregeln für Firmen, die Technik für andere betreiben.",
	"micar:V":
		"Pflichten für Firmen, die mit digitalem Geld für andere arbeiten.",
	"micar:II-IV": "Regeln für Firmen, die digitales Geld selbst herausgeben.",
	"micar:VI": "Regeln gegen Schummeln beim Handel mit digitalem Geld.",
	"micar:KMAG": "Wie Deutschland das EU-Gesetz umsetzt.",
	"zag:ERL": "Erlaubnis, genug eigenes Geld und geprüfte Eigentümer.",
	"zag:ORG": "Gute Ordnung in der Firma und bei abgegebenen Aufgaben.",
	"zag:SEC": "Sichere Zahlungen und Schutz vor Betrug.",
	"zag:KUN": "Rechte der Kundschaft bei Zahlungen.",
	"zag:AUS": "Was demnächst neu kommt.",
	"zag-marisk:AT": "Allgemeine Regeln für den Umgang mit Gefahren.",
	"zag-marisk:BT": "Besondere Regeln für einzelne Bereiche.",
	"zag-marisk:ERG": "Ergänzende Hinweise der Aufsicht.",
	"zag-marisk:HIST": "Alte Regeln, die durch neue ersetzt wurden.",
	"gwg:ORG": "Die Firma organisiert sich gegen schmutziges Geld.",
	"gwg:SOR": "Die Firma prüft, wer ihre Kundschaft ist.",
	"gwg:MEL": "Verdachtsfälle werden dem Amt gemeldet.",
	"gwg:TM": "Zahlungen werden auf Auffälliges beobachtet.",
	"amlr:ORG": "Interne Regeln und eine Gefahrenanalyse gegen schmutziges Geld.",
	"amlr:SOR": "Die Firma prüft ihre Kundschaft nach EU-weit gleichen Regeln.",
	"amlr:KRY": "Besondere Regeln für digitales Geld.",
	"tfr:FIAT": "Angaben zu Absender und Empfänger bei normalen Überweisungen.",
	"tfr:KRY": "Angaben zu Absender und Empfänger bei digitalem Geld.",
	"tfr:ALLG": "Allgemeine Regeln und Hinweise der Aufsicht.",
	"sanctions:SAN":
		"Verbotene Personen und Länder erkennen und Geschäfte stoppen.",
	"dsgvo:GRUND": "Daten von Menschen nur mit gutem Grund und sparsam nutzen.",
	"dsgvo:RECHTE": "Menschen dürfen fragen, ändern und löschen lassen.",
	"dsgvo:VERANT": "Wer Daten nutzt, ist verantwortlich, auch für Helfer.",
	"dsgvo:SICH": "Daten werden geschützt, Pannen werden gemeldet.",
	"dsgvo:DSB": "Eine Person passt auf den Datenschutz auf.",
	"dsgvo:TRANSFER": "Regeln, wenn Daten in Länder außerhalb der EU gehen.",
	"dsgvo:SANK": "Strafen und deutsche Zusatzregeln.",
	"dac8:DAC8":
		"Meldungen an die Steuerbehörde über Geschäfte mit digitalem Geld.",
	"awv:AWV": "Meldungen über Zahlungen ins Ausland.",
	"kassen:KAS": "Sichere elektronische Kassen mit Belegen.",
	"kwg:ERL": "Erlaubnis, geprüfte Leitung und Eigentümer der Bank.",
	"kwg:ORG": "Gute Ordnung in der Bank.",
	"kwg:CAP": "Genug eigenes Geld und genug flüssiges Geld.",
	"kwg:MELD": "Meldungen an die Aufsicht und Prüfungen.",
	"kwg:AT": "Allgemeine Regeln für den Umgang mit Gefahren in der Bank.",
	"kwg:BT": "Besondere Regeln für einzelne Bereiche der Bank.",
	"kwg:EU": "Regeln der europäischen Aufsicht und der Einlagensicherung.",
	"cra:A": "Für welche Produkte das Gesetz gilt und wie wichtig sie sind.",
	"cra:B": "Pflichten für Firmen, die Produkte herstellen.",
	"cra:C": "Ausgenutzte Lücken und schwere Vorfälle werden gemeldet.",
	"cra:D": "Wie ein Produkt gebaut sein muss, damit es sicher ist.",
	"cra:E": "Wie mit Lücken im Produkt umgegangen wird.",
	"cra:F": "Was die Kundschaft über die Sicherheit erfahren muss.",
	"cra:G": "Die Beschreibung, wie das Produkt gebaut ist.",
	"cra:H": "Die Prüfung vor dem Verkauf und das CE-Zeichen.",
	"cra:I": "Pflichten für Firmen, die Produkte einführen oder verkaufen.",
	"soc2:CC1": "Die Haltung der Firma: Ehrlichkeit, Verantwortung, Aufsicht.",
	"soc2:CC2": "Wichtige Informationen erreichen die richtigen Leute.",
	"soc2:CC3": "Gefahren werden erkannt und bewertet.",
	"soc2:CC4": "Die Firma prüft laufend, ob ihr Schutz wirkt.",
	"soc2:CC5": "Konkrete Schutzregeln werden festgelegt.",
	"soc2:CC6": "Nur Berechtigte kommen an Daten und in Räume.",
	"soc2:CC7": "Die Technik wird überwacht, Vorfälle werden behandelt.",
	"soc2:CC8": "Änderungen werden geplant und geprüft.",
	"soc2:CC9": "Gefahren durch Helfer und Ausfälle werden verringert.",
	"soc2:A1":
		"Zusatz: Die Dienste sind verfügbar, wenn die Kundschaft sie braucht.",
	"soc2:C1": "Zusatz: Vertrauliche Informationen bleiben vertraulich.",
	"soc2:PI1": "Zusatz: Daten werden vollständig und richtig verarbeitet.",
	"soc2:P": "Zusatz: Die Daten von Menschen werden geschützt.",
	"ccss:CAM":
		"Schlüssel zum digitalen Geld sicher erzeugen, aufbewahren und nutzen.",
	"ccss:OPS": "Den Betrieb rund um das digitale Geld sicher führen.",
	"bsi-200-1:4": "Die Leitung steuert die Sicherheit.",
	"bsi-200-1:5": "Es gibt genug Geld, Zeit und Leute.",
	"bsi-200-1:6": "Alle in der Firma machen mit.",
	"bsi-200-1:7": "Sicherheit ist ein Ablauf, der immer weiterläuft.",
	"bsi-200-1:8": "Ein schriftlicher Plan beschreibt den Schutz.",
	"bsi-200-2:3": "Die Leitung gibt den Startschuss.",
	"bsi-200-2:4": "Wer macht was bei der Sicherheit?",
	"bsi-200-2:5": "Alles Wichtige wird aufgeschrieben.",
	"bsi-200-2:6": "Der schnelle Einstieg: zuerst die wichtigsten Grundlagen.",
	"bsi-200-2:7": "Zuerst die allerwichtigsten Dinge besonders gut schützen.",
	"bsi-200-2:8": "Der volle Schutz für alles, was dazugehört.",
	"bsi-200-2:9": "Die geplanten Maßnahmen werden umgesetzt.",
	"bsi-200-2:10": "Prüfen und immer weiter verbessern.",
	"bsi-200-3:3": "Vorbereitung: Was wird untersucht?",
	"bsi-200-3:4": "Eine Liste aller möglichen Gefahren.",
	"bsi-200-3:5": "Wie wahrscheinlich und wie schlimm ist jede Gefahr?",
	"bsi-200-3:6": "Was wird gegen jede Gefahr getan?",
	"bsi-200-3:7": "Alles zusammenführen und prüfen.",
	"bsi-200-4:4": "Die Leitung startet die Notfallvorsorge.",
	"bsi-200-4:5": "Wer kümmert sich um Notfälle?",
	"bsi-200-4:6": "Was ist am wichtigsten, und was darf wie lange ausfallen?",
	"bsi-200-4:7": "Pläne, wie es im Notfall weitergeht.",
	"bsi-200-4:8": "Vorsorgen und im Notfall richtig handeln.",
	"bsi-200-4:9": "Die Pläne werden geübt.",
	"bsi-200-4:10": "Pläne aktuell halten und verbessern.",
	"pci-dss:1": "Netzfilter schützen die Bereiche mit Kartendaten.",
	"pci-dss:2": "Alle Geräte sind sicher eingestellt.",
	"pci-dss:3": "Gespeicherte Kartendaten werden geschützt.",
	"pci-dss:4": "Kartendaten werden unterwegs verschlüsselt.",
	"pci-dss:5": "Schutz gegen Viren und andere Schadprogramme.",
	"pci-dss:6": "Programme werden sicher gebaut und repariert.",
	"pci-dss:7": "Nur wer muss, darf an Kartendaten.",
	"pci-dss:8": "Jede Person meldet sich sicher und eindeutig an.",
	"pci-dss:9": "Räume und Geräte mit Kartendaten sind geschützt.",
	"pci-dss:10": "Alles wird aufgezeichnet und beobachtet.",
	"pci-dss:11": "Der Schutz wird regelmäßig getestet.",
	"pci-dss:12": "Regeln, Schulungen und Verträge rund um Kartendaten.",
	"pci-dss:A1": "Zusatz für Firmen, die Systeme für viele Kunden betreiben.",
	"pci-dss:A2": "Zusatz für alte Verschlüsselung an Kartenterminals.",
	"uk-fca:LIZ": "Erlaubnis und was als erlaubnispflichtig gilt.",
	"uk-fca:AML": "Regeln gegen schmutziges Geld, Sanktionen und Begleitangaben.",
	"uk-fca:KUN": "Schutz der Kundschaft, Werbung und Vermögen.",
	"ae-vara:LIZ": "Erlaubnis und was als erlaubnispflichtig gilt.",
	"ae-vara:AML":
		"Regeln gegen schmutziges Geld, Sanktionen und Begleitangaben.",
	"ae-vara:KUN": "Schutz der Kundschaft, Werbung und Vermögen.",
	"bh-cbb:LIZ": "Erlaubnis und was als erlaubnispflichtig gilt.",
	"bh-cbb:AML": "Regeln gegen schmutziges Geld, Sanktionen und Begleitangaben.",
	"bh-cbb:KUN": "Schutz der Kundschaft, Werbung und Vermögen.",
	"ch-finma:LIZ": "Erlaubnis und was als erlaubnispflichtig gilt.",
	"ch-finma:AML":
		"Regeln gegen schmutziges Geld, Sanktionen und Begleitangaben.",
	"ch-finma:KUN": "Schutz der Kundschaft, Werbung und Vermögen.",
	"br-bcb:LIZ": "Erlaubnis und was als erlaubnispflichtig gilt.",
	"br-bcb:AML": "Regeln gegen schmutziges Geld, Sanktionen und Begleitangaben.",
	"br-bcb:KUN": "Schutz der Kundschaft, Werbung und Vermögen.",
};

// Das Grundbild (Z1), überall gleich
export const BASIC_PICTURE = {
	title: "Compliance einfach erklärt",
	lead: "Compliance heißt: Du hältst die Regeln ein, die für deine Firma gelten, und kannst es zeigen.",
	points: [
		{
			term: "Rahmenwerk",
			text: "Mama, Schule und Polizei haben jeweils Regeln fürs Radfahren. Jede Regelsammlung ist ein Rahmenwerk.",
		},
		{
			term: "Gemeinsame Maßnahme",
			text: "Alle drei sagen „Helm auf“. Du setzt ihn einmal auf, und alle drei sind zufrieden.",
		},
		{
			term: "Nur bei einem",
			text: "Nur die Polizei will Licht am Rad. Das gilt nur bei diesem einen Rahmenwerk.",
		},
		{
			term: "Strenger gewinnt",
			text: "Mama sagt „um 18 Uhr zu Hause“, Oma sagt „um 17 Uhr“. Wer um 17 Uhr da ist, macht beide froh.",
		},
		{
			term: "Widerspruch",
			text: "Manchmal passen Regeln nicht zusammen, etwa „alles aufheben“ und „alles wegwerfen“. Dann muss jemand entscheiden.",
		},
		{
			term: "Nachweis und Prüfung",
			text: "Ein Foto vom Helm ist der Nachweis. Wenn jemand nachschaut, ist das die Prüfung.",
		},
	],
} as const;
