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
	"guide",
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
	guide: "Freiwilliger Leitfaden ohne Zertifikat",
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
	guide: "voluntary",
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
	"nist-csf": {
		simple:
			"Ein Bauplan aus den USA, wie eine Firma sich vor Angriffen aus dem Internet schützt.",
		why: "Eine Firma soll wissen, was sie schützen muss, und Angriffe früh bemerken. Nach einem Angriff soll sie schnell wieder arbeiten können.",
		forWhom:
			"Firmen jeder Größe, besonders mit Kundschaft oder Partnern in den USA.",
		issuer: "guide",
		ifNot:
			"Es gibt keine Strafe, denn der Rahmen ist freiwillig. Aber Kundschaft aus den USA fragt oft, wie weit ihr damit seid.",
		proof:
			"Es gibt kein Zertifikat. Man schätzt sich selbst ein und zeigt Kundschaft, wie weit man in jedem Bereich ist.",
		example:
			"Wie bei Feuer im Haus: wissen, was brennen kann, vorbeugen, Rauch bemerken, löschen und danach aufräumen.",
	},
	"nist-800-53": {
		simple:
			"Eine sehr genaue Liste von Schutzmaßnahmen für die Computersysteme der US-Regierung.",
		why: "Daten und Systeme der US-Behörden sollen vor Angriffen, Fehlern und Ausfällen geschützt sein.",
		forWhom:
			"US-Behörden und Firmen, die für sie arbeiten oder ihnen Cloud-Dienste anbieten.",
		issuer: "law_foreign",
		ifNot:
			"Ohne Freigabe darf eine US-Behörde ein System nicht nutzen. Cloud-Anbieter brauchen dafür die Prüfung nach FedRAMP.",
		proof:
			"Ein Schutzplan je System, eine unabhängige Prüfung und die Freigabe durch die Behörde.",
		example:
			"Wie ein Tresor in drei Größen: Je wertvoller der Inhalt, desto mehr Schlösser hat er.",
	},
	"nist-800-171": {
		simple:
			"Eine US-Liste mit 110 Regeln, wie Firmen vertrauliche Daten aus Regierungsaufträgen schützen.",
		why: "Angreifer suchen Baupläne und Daten des Militärs oft bei kleinen Zulieferern. Dort ist der Schutz meist schwächer.",
		forWhom:
			"Firmen, die für das US-Verteidigungsministerium arbeiten oder Teile dafür liefern, auch in Europa. Das Ministerium schreibt die Regeln in seine Verträge.",
		issuer: "customer",
		ifNot:
			"Ohne diese Regeln bekommt die Firma keine Aufträge mit solchen Daten. Falsche Angaben können teure Klagen bringen.",
		proof:
			"Eine Selbstbewertung mit Punktzahl, die in einer Datenbank des US-Militärs steht, dazu ein Sicherheitsplan.",
		example:
			"Wie ein Schlüssel zum Haus der Nachbarn: Wer ihn bekommt, muss gut darauf aufpassen.",
	},
	cmmc: {
		simple:
			"Ein Prüfsystem des US-Militärs, das in drei Stufen zeigt, wie gut Zulieferer Daten schützen.",
		why: "Früher reichte das Wort der Firma, dass sie ihre Daten schützt. Jetzt prüft oft jemand von außen, ob der Schutz wirklich da ist.",
		forWhom:
			"Alle Firmen, die für das US-Verteidigungsministerium arbeiten, auch kleine Zulieferer in Europa.",
		issuer: "law_foreign",
		ifNot:
			"Ohne die verlangte Stufe darf die Firma bei vielen Aufträgen des US-Militärs nicht mitmachen.",
		proof:
			"Stufe 1 mit Selbstbewertung jedes Jahr, Stufe 2 oft mit Prüfung von außen, Stufe 3 durch das Militär selbst. Eine Prüfung von außen gilt drei Jahre.",
		example:
			"Wie beim Schwimmabzeichen: Je höher die Stufe, desto mehr musst du zeigen, und jemand schaut genau zu.",
	},
	hipaa: {
		simple:
			"Ein US-Gesetz, das die Gesundheitsdaten von Patientinnen und Patienten schützt.",
		why: "Gesundheitsdaten sind sehr privat. Niemand Fremdes soll sehen, welche Krankheit jemand hat.",
		forWhom:
			"Arztpraxen, Kliniken, Krankenversicherungen und Abrechnungsstellen in den USA. Dazu Firmen, die für sie mit Gesundheitsdaten arbeiten, etwa Anbieter von Software.",
		issuer: "law_foreign",
		ifNot:
			"Die US-Gesundheitsbehörde kann hohe Geldbußen verhängen. In schweren Fällen drohen auch Strafverfahren.",
		proof:
			"Es gibt kein Zertifikat. Die Firma zeigt bei einer Prüfung ihre Risikoanalyse, ihre Regeln und ihre Verträge.",
		example:
			"Wie die Schweigepflicht beim Arzt: Was im Sprechzimmer gesagt wird, bleibt dort.",
	},
	"nycrr-500": {
		simple:
			"Regeln der Finanzaufsicht in New York, damit Finanzfirmen sich gegen Hacker schützen.",
		why: "Banken und Versicherungen haben viel Geld und viele Daten. Ein Angriff kann vielen Menschen schaden.",
		forWhom:
			"Banken, Versicherungen und andere Finanzfirmen mit einer Erlaubnis der Finanzaufsicht in New York. Große Firmen haben zusätzliche Pflichten.",
		issuer: "supervisor",
		ifNot:
			"Die Aufsicht kann hohe Geldbußen verhängen. Sie prüft auch, ob die jährliche Bestätigung stimmt.",
		proof:
			"Jedes Jahr bis zum 15. April bestätigt die Leitung der Aufsicht, dass die Regeln eingehalten wurden.",
		example:
			"Wie ein Tresor in der Bank: Jedes Jahr prüft jemand Schloss, Alarm und die Liste der Schlüssel.",
	},
	ccpa: {
		simple:
			"Ein Gesetz aus Kalifornien: Menschen erfahren, was Firmen über sie wissen, und können widersprechen.",
		why: "Firmen sammeln viele Daten über Menschen und verkaufen sie oft weiter. Die Menschen sollen wissen, was passiert, und Nein sagen können.",
		forWhom:
			"Größere Firmen, die Daten von Menschen in Kalifornien nutzen, auch wenn sie in Europa sitzen.",
		issuer: "law_foreign",
		ifNot:
			"Dann drohen Strafen der Aufsicht in Kalifornien. Nach einem Datenleck können Betroffene auch selbst vor Gericht gehen.",
		proof:
			"Eine klare Datenschutzerklärung, ein Link zum Widersprechen und Aufzeichnungen über alle Anfragen der letzten zwei Jahre.",
		example:
			"Wie ein Schild im Laden, auf dem steht, was über dich notiert wird und wie du Nein sagst.",
	},
	"us-privacy": {
		simple:
			"Gesetze vieler US-Bundesstaaten, die Menschen Rechte an ihren Daten geben.",
		why: "In den USA gibt es kein Datenschutzgesetz für das ganze Land. Darum regeln immer mehr Staaten das selbst.",
		forWhom:
			"Firmen mit vielen Kundinnen und Kunden in diesen Staaten, auch wenn sie in Europa sitzen.",
		issuer: "law_foreign",
		ifNot:
			"Dann kann die Generalstaatsanwaltschaft des Staats hohe Strafen verlangen. Jeder Verstoß kann dabei einzeln zählen.",
		proof:
			"Eine Datenschutzerklärung, ein Weg zum Widersprechen, Verträge mit Helfern und schriftliche Prüfungen riskanter Nutzungen.",
		example:
			"Wie Hausregeln, die in jedem Haus etwas anders sind, aber fast immer dasselbe wollen.",
	},
	"aws-ftr": {
		simple:
			"Eine technische Prüfung von AWS für Partner, die ihre Software bei AWS betreiben.",
		why: "AWS will sicher sein, dass Lösungen von Partnern die Konten und Daten der Kundschaft gut schützen.",
		forWhom:
			"Partner von AWS, die ihre Software auf AWS anbieten, zum Beispiel als Dienst im Internet.",
		issuer: "customer",
		ifNot:
			"Ohne bestandene Prüfung bleiben viele Partnerprogramme von AWS verschlossen, etwa der gemeinsame Verkauf.",
		proof:
			"Ein ausgefüllter Fragebogen mit Belegen, den eine Fachperson von AWS durchsieht und freigibt.",
		example:
			"Wie ein Kaufhaus, das einen Händler erst hineinlässt, wenn sein Stand sicher aufgebaut ist.",
	},
	"ms-sspa": {
		simple:
			"Regeln von Microsoft für Lieferanten, die mit Daten von Microsoft arbeiten.",
		why: "Microsoft will, dass Daten von Kundschaft und Beschäftigten auch bei Lieferanten sicher sind.",
		forWhom:
			"Firmen, die für Microsoft arbeiten und dabei Daten über Menschen oder geheime Unterlagen bekommen.",
		issuer: "customer",
		ifNot:
			"Ohne bestandene Prüfung bekommt die Firma von Microsoft keine neuen Aufträge.",
		proof:
			"Jedes Jahr eine Selbstprüfung im Portal von Microsoft, manchmal dazu eine Prüfung von außen.",
		example:
			"Wie ein Nachbar, der deinen Schlüssel bekommt und versprechen muss, gut darauf aufzupassen.",
	},
	mvsp: {
		simple:
			"Eine offene Liste von Mindestregeln für sichere Software, die Firmen bei Lieferanten abfragen.",
		why: "Große Firmen wollen schnell sehen, ob eine Software das Nötigste für die Sicherheit mitbringt.",
		forWhom:
			"Firmen, die Software für andere Firmen anbieten, vor allem als Dienst im Internet.",
		issuer: "industry",
		ifNot:
			"Ohne diese Grundlagen lehnen viele große Firmen eine Software beim Einkauf ab.",
		proof:
			"Eine ausgefüllte Selbstprüfung zur Liste, dazu Belege wie der Bericht über einen Test von außen.",
		example:
			"Wie eine Checkliste vor dem Flug: Erst wenn jeder Punkt stimmt, darf das Flugzeug starten.",
	},
	iso42001: {
		simple: "Ein Bauplan, wie eine Firma KI verantwortungsvoll baut und nutzt.",
		why: "KI soll niemandem schaden, keine Menschen benachteiligen und nachvollziehbar bleiben.",
		forWhom: "Firmen, die KI entwickeln, anbieten oder im Alltag einsetzen.",
		issuer: "standard",
		ifNot: "Kein Zertifikat, und Kundschaft fragt nach, wie ihr mit KI umgeht.",
		proof:
			"Ein Zertifikat von einer unabhängigen Prüfstelle, jedes Jahr nachgeprüft.",
		example:
			"Wie ein Führerschein für Roboter: Erst lernen und prüfen, dann fahren lassen.",
	},
	tisax: {
		simple:
			"Die Sicherheitsprüfung der Autoindustrie für Firmen, die mit Herstellern arbeiten.",
		why: "Pläne und Prototypen neuer Autos sollen nicht in falsche Hände geraten.",
		forWhom: "Zulieferer und Dienstleister von Autoherstellern.",
		issuer: "industry",
		ifNot:
			"Ohne Prüfergebnis bekommt ihr oft keinen Auftrag von Autoherstellern.",
		proof:
			"Eine Prüfung durch eine zugelassene Stelle, das Ergebnis steht im Portal der Branche.",
		example:
			"Wie ein Werksausweis: Nur wer ihn hat, darf in die Halle mit den neuen Modellen.",
	},
	"eu-us-dpf": {
		simple:
			"Regeln, damit Daten von Menschen aus Europa in den USA sicher sind.",
		why: "Daten aus Europa sollen in den USA genauso gut geschützt sein wie hier.",
		forWhom:
			"US-Firmen, die Daten aus Europa bekommen, und Firmen in Europa, die US-Dienste nutzen.",
		issuer: "law_foreign",
		ifNot:
			"Ohne Teilnahme braucht es eigene Verträge, sonst ist die Übermittlung verboten.",
		proof: "Eintrag auf der offiziellen Liste in den USA, jedes Jahr erneuert.",
		example:
			"Wie ein Gastland, das verspricht, auf deine Sachen aufzupassen wie zu Hause.",
	},
	"cyber-essentials": {
		simple:
			"Ein britisches Zertifikat für fünf einfache Schutzmaßnahmen gegen Angriffe aus dem Internet.",
		why: "Die meisten Angriffe nutzen einfache Lücken, die sich leicht schließen lassen.",
		forWhom:
			"Firmen, die für die britische Regierung arbeiten oder Kundschaft in Großbritannien haben.",
		issuer: "standard",
		ifNot: "Ohne Zertifikat keine Aufträge der britischen Regierung.",
		proof:
			"Ein Fragebogen mit Prüfung, bei der Stufe Plus zusätzlich ein technischer Test.",
		example:
			"Wie Tür abschließen, Fenster zu und Licht an: einfach, aber es hält die meisten ab.",
	},
	"essential-eight": {
		simple:
			"Acht Schutzmaßnahmen aus Australien gegen die häufigsten Angriffe, in drei Stufen.",
		why: "Mit wenigen gut gemachten Maßnahmen lassen sich die meisten Angriffe stoppen.",
		forWhom:
			"Behörden in Australien und Firmen, deren Kundschaft das verlangt.",
		issuer: "supervisor",
		ifNot:
			"Ohne die Stufe, die die Kundschaft verlangt, gibt es dort oft keinen Auftrag.",
		proof: "Eine Bewertung, welche Stufe jede der acht Maßnahmen erreicht.",
		example:
			"Wie acht Schlösser am Fahrrad: Je mehr gut sitzen, desto schwerer der Diebstahl.",
	},
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
	"nist-csf:GV.OC":
		"Die Firma weiß, wozu sie da ist und wer etwas von ihr erwartet.",
	"nist-csf:GV.RM":
		"Die Firma legt fest, wie viel Gefahr sie tragen will und wie sie Gefahren bewertet.",
	"nist-csf:GV.RR":
		"Jede Person weiß, wofür sie zuständig ist, und die Leitung steht für alles ein.",
	"nist-csf:GV.PO":
		"Es gibt feste Regeln für die Sicherheit, und sie werden aktuell gehalten.",
	"nist-csf:GV.OV":
		"Die Leitung prüft regelmäßig, ob der Plan wirkt, und passt ihn an.",
	"nist-csf:GV.SC":
		"Auch Lieferanten und Dienstleister müssen sicher arbeiten, vom Vertrag bis zum Ende.",
	"nist-csf:ID.AM":
		"Die Firma weiß, welche Geräte, Programme und Daten sie hat.",
	"nist-csf:ID.RA":
		"Die Firma sucht Schwachstellen und Gefahren und bewertet, wie schlimm sie wären.",
	"nist-csf:ID.IM":
		"Aus Prüfungen, Übungen und Fehlern lernt die Firma und wird besser.",
	"nist-csf:PR.AA":
		"Nur wer sich richtig anmeldet, kommt hinein, und nur so weit wie nötig.",
	"nist-csf:PR.AT":
		"Alle lernen, wie sie sicher arbeiten, manche Rollen noch genauer.",
	"nist-csf:PR.DS":
		"Daten sind geschützt, ob gespeichert, verschickt oder in Gebrauch, und es gibt Sicherungen.",
	"nist-csf:PR.PS":
		"Geräte und Programme sind sicher eingestellt, aktuell und erlaubt.",
	"nist-csf:PR.IR":
		"Netze sind abgeschottet, und die Technik übersteht Ausfälle, Feuer und Wasser.",
	"nist-csf:DE.CM":
		"Netze, Räume, Geräte und Dienstleister werden ständig beobachtet.",
	"nist-csf:DE.AE":
		"Auffälliges wird genau angeschaut, um echte Angriffe zu erkennen.",
	"nist-csf:RS.MA": "Bei einem Angriff gibt es einen Plan, wer was tut.",
	"nist-csf:RS.AN":
		"Nach einem Angriff wird geklärt, was passiert ist und warum.",
	"nist-csf:RS.CO":
		"Bei einem Angriff werden die richtigen Leute rechtzeitig informiert.",
	"nist-csf:RS.MI": "Der Angriff wird gestoppt und sein Schaden beseitigt.",
	"nist-csf:RC.RP":
		"Nach einem Angriff kommt alles in der richtigen Reihenfolge wieder in Gang.",
	"nist-csf:RC.CO": "Alle erfahren, wie weit die Wiederherstellung ist.",
	"nist-800-53:AC": "Nur wer darf, kommt an Daten und Systeme heran.",
	"nist-800-53:AT":
		"Alle lernen, wie sie sicher arbeiten und Gefahren erkennen.",
	"nist-800-53:AU": "Das System schreibt auf, wer wann was gemacht hat.",
	"nist-800-53:CA":
		"Jemand prüft, ob der Schutz wirkt, und erlaubt dann den Betrieb.",
	"nist-800-53:CM":
		"Einstellungen sind festgelegt, und jede Änderung wird vorher geprüft.",
	"nist-800-53:CP": "Ein Plan sagt, was bei einem Ausfall zu tun ist.",
	"nist-800-53:IA": "Jede Person und jedes Gerät muss zeigen, wer es ist.",
	"nist-800-53:IR": "Bei einem Angriff weiß jede Person, was sie tun muss.",
	"nist-800-53:MA": "Reparaturen am System laufen geplant und unter Aufsicht.",
	"nist-800-53:MP":
		"USB-Sticks, Festplatten und Papier werden sicher verwahrt und gelöscht.",
	"nist-800-53:PE":
		"Gebäude und Räume sind vor Fremden, Feuer und Wasser geschützt.",
	"nist-800-53:PL": "Für jedes System gibt es einen schriftlichen Schutzplan.",
	"nist-800-53:PM":
		"Die ganze Firma hat ein gemeinsames Programm für Sicherheit.",
	"nist-800-53:PS":
		"Mitarbeitende werden geprüft, und beim Gehen werden ihre Zugänge gesperrt.",
	"nist-800-53:RA":
		"Die Firma überlegt, was passieren kann und wie schlimm das wäre.",
	"nist-800-53:SA":
		"Beim Kaufen und Bauen von Systemen zählt die Sicherheit von Anfang an.",
	"nist-800-53:SC": "Daten sind unterwegs und im Speicher gut geschützt.",
	"nist-800-53:SI":
		"Lücken werden schnell geschlossen, und Schadsoftware wird erkannt.",
	"nist-800-53:SR": "Auch Lieferanten und ihre Teile sollen sicher sein.",
	"nist-800-171:3.1": "Nur wer darf, kommt an die Daten und Systeme.",
	"nist-800-171:3.2":
		"Alle lernen, welche Gefahren es gibt und was zu tun ist.",
	"nist-800-171:3.3": "Systeme schreiben auf, wer wann was gemacht hat.",
	"nist-800-171:3.4":
		"Computer sind fest eingestellt, und jede Änderung wird vorher geprüft.",
	"nist-800-171:3.5":
		"Jede Person meldet sich mit eigenem Namen und einem zweiten Nachweis an.",
	"nist-800-171:3.6":
		"Bei einem Angriff weiß jede Person, was zu tun ist, und er wird gemeldet.",
	"nist-800-171:3.7":
		"Reparaturen an Computern laufen sicher und unter Aufsicht.",
	"nist-800-171:3.8":
		"USB-Sticks, Festplatten und Papier mit Daten werden sicher verwahrt und vernichtet.",
	"nist-800-171:3.9":
		"Neue Leute werden vorher geprüft, und wer geht, hat sofort keinen Zugang mehr.",
	"nist-800-171:3.10":
		"Nur Berechtigte kommen in die Räume, Gäste werden begleitet.",
	"nist-800-171:3.11":
		"Die Firma prüft regelmäßig, was schiefgehen kann, und sucht nach Lücken.",
	"nist-800-171:3.12":
		"Die Firma prüft, ob ihr Schutz wirkt, und plant, was noch fehlt.",
	"nist-800-171:3.13":
		"Netze und Verbindungen sind geschützt, und Daten werden verschlüsselt.",
	"nist-800-171:3.14":
		"Fehler werden schnell behoben, Schadprogramme und Angriffe werden erkannt.",
	"cmmc:AC": "Nur wer darf, kommt an die Daten und Systeme.",
	"cmmc:AT": "Alle lernen, welche Gefahren es gibt und was zu tun ist.",
	"cmmc:AU": "Systeme schreiben auf, wer wann was gemacht hat.",
	"cmmc:CM":
		"Computer sind fest eingestellt, und jede Änderung wird vorher geprüft.",
	"cmmc:IA":
		"Jede Person meldet sich mit eigenem Namen und einem zweiten Nachweis an.",
	"cmmc:IR":
		"Bei einem Angriff weiß jede Person, was zu tun ist, und er wird gemeldet.",
	"cmmc:MA": "Reparaturen an Computern laufen sicher und unter Aufsicht.",
	"cmmc:MP":
		"USB-Sticks, Festplatten und Papier mit Daten werden sicher verwahrt und vernichtet.",
	"cmmc:PS":
		"Neue Leute werden vorher geprüft, und wer geht, hat sofort keinen Zugang mehr.",
	"cmmc:PE": "Nur Berechtigte kommen in die Räume, Gäste werden begleitet.",
	"cmmc:RA":
		"Die Firma prüft regelmäßig, was schiefgehen kann, und sucht nach Angreifern.",
	"cmmc:CA": "Die Firma prüft, ob ihr Schutz wirkt, und plant, was noch fehlt.",
	"cmmc:SC":
		"Netze und Verbindungen sind geschützt, und Daten werden verschlüsselt.",
	"cmmc:SI":
		"Fehler werden schnell behoben, Schadprogramme und Angriffe werden erkannt.",
	"hipaa:ADM":
		"Die Firma plant den Schutz, schult ihre Leute und übt den Notfall.",
	"hipaa:PHY":
		"Räume, Computer und Datenträger mit Gesundheitsdaten sind gut geschützt.",
	"hipaa:TEC":
		"Technik regelt, wer Daten sieht, und schreibt auf, wer was tut.",
	"hipaa:ORG":
		"Helfer mit Gesundheitsdaten unterschreiben einen Vertrag, der sie zum Schutz verpflichtet.",
	"hipaa:DOC":
		"Die Regeln stehen schriftlich fest und werden sechs Jahre aufbewahrt.",
	"hipaa:BRN":
		"Gehen Gesundheitsdaten verloren, erfahren es die Menschen spätestens nach 60 Tagen.",
	"hipaa:PRV":
		"Nur so viele Daten wie nötig, und jeder darf die eigenen Daten sehen.",
	"nycrr-500:PRG":
		"Es gibt einen Plan, schriftliche Regeln und eine Person, die verantwortlich ist.",
	"nycrr-500:TEC":
		"Technik schützt die Daten: Updates, wenige Rechte, Anmeldung mit zweitem Nachweis und Verschlüsselung.",
	"nycrr-500:RSK":
		"Die Firma schätzt ihre Gefahren ein und prüft ihre Helfer von außen.",
	"nycrr-500:PPL": "Es gibt genug Fachleute, und alle lernen jedes Jahr dazu.",
	"nycrr-500:INC":
		"Für Angriffe und Ausfälle gibt es Pläne, die jedes Jahr geübt werden.",
	"nycrr-500:NOT":
		"Schwere Angriffe meldet die Firma binnen 72 Stunden der Aufsicht.",
	"nycrr-500:CLA":
		"Große Firmen werden genauer geprüft und überwachen ihre Technik stärker.",
	"ccpa:SC": "Klären, ob das Gesetz für die Firma gilt.",
	"ccpa:NT":
		"Menschen erfahren vorher, welche Daten gesammelt werden und wofür.",
	"ccpa:RT":
		"Menschen dürfen ihre Daten sehen, berichtigen, löschen lassen und mitnehmen.",
	"ccpa:OO":
		"Menschen können sagen: Verkauft meine Daten nicht und gebt sie nicht weiter.",
	"ccpa:VP": "Helfer der Firma bekommen feste Regeln für die Daten.",
	"ccpa:SE":
		"Daten werden gut geschützt, und es wird nur so viel gesammelt wie nötig.",
	"ccpa:RA":
		"Gefährliche Nutzungen von Daten werden vorher geprüft, auch Entscheidungen durch Computer.",
	"ccpa:RK":
		"Jede Anfrage wird aufgeschrieben, und das Team weiß, was zu tun ist.",
	"us-privacy:SC":
		"Klären, in welchen Staaten die Gesetze für die Firma gelten.",
	"us-privacy:NT":
		"Eine Erklärung sagt, welche Daten gesammelt werden und an wen sie gehen.",
	"us-privacy:RT":
		"Menschen dürfen ihre Daten sehen, berichtigen, löschen und mitnehmen.",
	"us-privacy:OO":
		"Menschen können Werbung nach ihrem Verhalten und den Verkauf ihrer Daten ablehnen.",
	"us-privacy:SD":
		"Besonders private Daten gibt es nur, wenn die Person vorher Ja sagt.",
	"us-privacy:CH":
		"Daten von Kindern und Jugendlichen sind besonders geschützt.",
	"us-privacy:PR": "Helfer der Firma bekommen einen Vertrag mit festen Regeln.",
	"us-privacy:AS":
		"Riskante Nutzungen von Daten werden vorher schriftlich geprüft.",
	"us-privacy:SE":
		"Daten werden gut geschützt, und es wird nur so viel gesammelt wie nötig.",
	"aws-ftr:SUP":
		"Hilfe von AWS ist gebucht, und der Aufbau wird regelmäßig geprüft.",
	"aws-ftr:ROOT":
		"Der Hauptschlüssel zum Konto bleibt im Tresor und ist doppelt gesichert.",
	"aws-ftr:IAM":
		"Jede Person hat ein eigenes Konto mit zweitem Faktor und nur den nötigen Rechten.",
	"aws-ftr:LOG": "Alles, was im Konto passiert, wird sicher aufgeschrieben.",
	"aws-ftr:NET": "Nur wenige Türen zum Internet stehen offen.",
	"aws-ftr:S3": "Ablagen für Dateien sind nicht für jeden im Internet offen.",
	"aws-ftr:CAA":
		"Der Zugang zu Konten der Kundschaft läuft über einen eigenen Schlüssel je Kundin.",
	"aws-ftr:DAT":
		"Wichtige Daten sind bekannt und werden verschlüsselt gespeichert und verschickt.",
	"aws-ftr:BAR":
		"Daten werden von selbst gesichert, und das Zurückholen wird geübt.",
	"aws-ftr:RES":
		"Es ist klar, wie schnell alles nach einem Ausfall wieder läuft.",
	"aws-ftr:SEC":
		"Lücken werden schnell geschlossen, und für Angriffe gibt es einen Plan.",
	"ms-sspa:MGT":
		"Jemand ist verantwortlich, alle lernen die Regeln, und jedes Jahr wird geprüft.",
	"ms-sspa:NOT": "Menschen erfahren vorher, was mit ihren Daten passiert.",
	"ms-sspa:CHO":
		"Menschen dürfen Ja oder Nein sagen und es sich anders überlegen.",
	"ms-sspa:COL": "Es werden nur die Daten gesammelt, die wirklich nötig sind.",
	"ms-sspa:RET":
		"Daten werden nicht länger als nötig behalten und am Ende gelöscht.",
	"ms-sspa:DSR":
		"Menschen können fragen, was über sie gespeichert ist, und Fehler korrigieren lassen.",
	"ms-sspa:TPR":
		"Andere Firmen bekommen Daten nur, wenn Microsoft vorher zustimmt.",
	"ms-sspa:QUA": "Gespeicherte Daten sollen stimmen und aktuell sein.",
	"ms-sspa:MON":
		"Geht etwas schief, erfährt Microsoft es sofort und bekommt Hilfe beim Aufklären.",
	"ms-sspa:SEC":
		"Daten sind verschlossen, verschlüsselt und gesichert, und Lücken werden schnell repariert.",
	"ms-sspa:AI":
		"Wer KI nutzt, sagt es vorher und füttert sie nicht mit Daten von Microsoft.",
	"mvsp:1":
		"Die Firma lässt sich prüfen, schult ihre Leute und sagt bei Problemen schnell Bescheid.",
	"mvsp:2":
		"Die Software ist von Anfang an so gebaut, dass Angriffe es schwer haben.",
	"mvsp:3":
		"Beim Programmieren werden typische Fehler vermieden und Lücken schnell repariert.",
	"mvsp:4":
		"Räume, Zugänge, Partner und Sicherungen sind im Alltag gut geschützt.",
	"iso42001:4": "Die Firma klärt, wo sie KI nutzt und wer davon betroffen ist.",
	"iso42001:5":
		"Die Leitung übernimmt Verantwortung und schreibt Regeln für KI auf.",
	"iso42001:6":
		"Die Firma sucht Gefahren durch KI und plant, wie sie damit umgeht.",
	"iso42001:7": "Leute, Geld, Wissen und Unterlagen für den Umgang mit KI.",
	"iso42001:8": "Die Firma setzt ihre Pläne für KI im Alltag um.",
	"iso42001:9": "Die Firma prüft, ob ihr Umgang mit KI funktioniert.",
	"iso42001:10": "Fehler werden behoben, und alles wird besser.",
	"iso42001:A.2":
		"Eine Richtlinie sagt, wofür KI genutzt wird und wofür nicht.",
	"iso42001:A.3": "Wer für KI zuständig ist und wo man Bedenken melden kann.",
	"iso42001:A.4":
		"Was jedes KI-System braucht: Daten, Werkzeuge, Rechner, Menschen.",
	"iso42001:A.5": "Vorher überlegen, wem ein KI-System schaden könnte.",
	"iso42001:A.6": "KI-Systeme sorgfältig planen, bauen, prüfen und betreiben.",
	"iso42001:A.7": "Gute und erlaubte Daten für KI-Systeme.",
	"iso42001:A.8": "Allen sagen, was ein KI-System kann und was nicht.",
	"iso42001:A.9": "KI-Systeme nur für ihren Zweck nutzen.",
	"iso42001:A.10": "Mit Lieferanten und Kundschaft klären, wer wofür sorgt.",
	"tisax:1.1": "Aufgeschriebene Regeln für den Schutz von Informationen.",
	"tisax:1.2":
		"Wer für die Sicherheit zuständig ist und wie sie organisiert ist.",
	"tisax:1.3": "Alles Wichtige ist erfasst und nach Schutzbedarf eingestuft.",
	"tisax:1.4": "Gefahren finden und behandeln.",
	"tisax:1.5": "Regelmäßig prüfen, ob die Regeln eingehalten werden.",
	"tisax:1.6": "Was bei Vorfällen und Krisen passiert.",
	"tisax:2.1": "Beschäftigte sind geeignet, verpflichtet und geschult.",
	"tisax:3.1":
		"Räume, Technik und Geräte sind gegen Diebstahl und Schäden geschützt.",
	"tisax:4.1": "Jede Person meldet sich sicher mit eigenem Konto an.",
	"tisax:4.2": "Jede Person darf nur an das, was sie braucht.",
	"tisax:5.1": "Wichtige Daten werden verschlüsselt.",
	"tisax:5.2": "Die Technik läuft sicher und wird gut gepflegt.",
	"tisax:5.3": "Neue Systeme sind von Anfang an sicher.",
	"tisax:6.1": "Auch Partner und Lieferanten schützen die Informationen.",
	"tisax:7.1": "Gesetze und Verträge werden eingehalten.",
	"tisax:8": "Neue Autos und Bauteile bleiben bis zum Marktstart geheim.",
	"tisax:9":
		"Daten von Menschen werden im Auftrag der Kundschaft gut geschützt.",
	"eu-us-dpf:P": "Die sieben Grundregeln für den Umgang mit Daten aus Europa.",
	"eu-us-dpf:S":
		"Zusatzregeln, zum Beispiel für sensible Daten und Beschwerden.",
	"eu-us-dpf:C": "Wie die Teilnahme angemeldet und geprüft wird.",
	"cyber-essentials:SC": "Festlegen, welche Geräte und Netze geprüft werden.",
	"cyber-essentials:FW": "Eine Firewall lässt nur erlaubte Verbindungen durch.",
	"cyber-essentials:CF":
		"Geräte haben nur das, was sie brauchen, und keine Standardpasswörter.",
	"cyber-essentials:UM": "Programme bekommen schnell ihre Updates.",
	"cyber-essentials:AC": "Jede Person hat nur die Rechte, die sie braucht.",
	"cyber-essentials:MW": "Schutzprogramme halten Schadsoftware fern.",
	"cyber-essentials:PL":
		"Bei der Stufe Plus prüft jemand die Technik selbst nach.",
	"essential-eight:AC": "Nur erlaubte Programme dürfen laufen.",
	"essential-eight:PA": "Programme bekommen schnell ihre Updates.",
	"essential-eight:MA": "Makros in Office-Dateien sind gesperrt oder geprüft.",
	"essential-eight:UH": "Browser und Office sind gegen Tricks abgesichert.",
	"essential-eight:RA":
		"Nur wenige dürfen alles ändern, und nur so lange wie nötig.",
	"essential-eight:PO": "Betriebssysteme bekommen schnell ihre Updates.",
	"essential-eight:MF": "Zum Anmelden braucht es einen zweiten Nachweis.",
	"essential-eight:RB":
		"Daten werden gesichert, und die Sicherung ist geschützt.",
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
