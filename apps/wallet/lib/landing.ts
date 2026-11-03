// Öffentliche Startseite von both.money (abgemeldet unter „/“): alle Texte an
// einer Stelle, Du-Form, keine Geviertstriche, kurze Sätze (Test
// public-pages). Oben, was both.money ist, und der Stand in drei Zeilen
// (heute, geplant, Ziel); dann wie es funktioniert, der Bot (lib/trading.ts),
// was heute läuft und das Ziel. Zahlungsweg und Kundengeld sind klar als Ziel
// bzw. „gesperrt“ markiert, die Stufen stehen im Fahrplan (lib/roadmap.ts).
// Rechtliche Einordnung vor der Bewerbung prüfen.

export const HERO = {
	// Zeilen von Hand umbrochen
	lines: ["Geld bewegt sich", "nur nach Regeln"],
	lead: "both.money ist eine Wallet für Unternehmen. Sie bewahrt Kryptowerte auf, bewegt sie nur in festen Grenzen und belegt jeden Schritt.",
	action: "Anmelden",
	today:
		"Heute läuft both.money im Test: Bitcoin-Testnetz, kein echtes Geld, Zugang nur per Einladung.",
} as const;

// Der Stand in drei Zeilen, rechts neben dem Titel
export type StandRow = {
	key: string;
	label: string;
	tone: "live" | "planned" | "goal";
	title: string;
	text: string;
	href: string;
};

export const STAND = {
	title: "Wo both.money steht",
	rows: [
		{
			key: "heute",
			label: "Heute",
			tone: "live",
			title: "Wallet für eigene Bestände",
			text: "Empfangen, aufbewahren und senden mit Sicherheitsschlüssel. Im Testnetz, ohne echtes Geld.",
			href: "#so-gehts",
		},
		{
			key: "geplant",
			label: "Geplant",
			tone: "planned",
			title: "Automatisch handeln",
			text: "Ein Bot tauscht Gold gegen US-Dollar, nur in Grenzen, die du setzt.",
			href: "#handeln",
		},
		{
			key: "ziel",
			label: "Ziel · braucht Erlaubnis",
			tone: "goal",
			title: "Zahlungsweg",
			text: "Geld annehmen und an geprüfte Empfänger weitergeben. Erst mit Erlaubnis der Aufsicht.",
			href: "#ziel",
		},
	] satisfies StandRow[],
} as const;

// So funktioniert both.money: drei Sätze mit einem Bild aus dem Alltag
export type Pillar = { key: string; title: string; text: string; like: string };

export const PILLARS = {
	title: "So funktioniert both.money",
	lead: "Drei Dinge machen den Unterschied. Jedes steht in einem Satz, darunter ein Bild aus dem Alltag.",
	items: [
		{
			key: "tresor",
			title: "Ein eigener Tresor",
			text: "both.money liest die Blockchain über eigene Rechner, die Knoten, und hält die Schlüssel selbst. Kein fremder Anbieter steht dazwischen.",
			like: "Wie ein Tresor im eigenen Haus statt eines Schließfachs bei einer fremden Firma.",
		},
		{
			key: "grenzen",
			title: "Nichts geht ohne Freigabe",
			text: "Jede Auszahlung braucht die Freigabe mit einem Sicherheitsschlüssel. Ein eigenes Programm, der Signer, prüft die Grenzen und unterschreibt erst dann.",
			like: "Wie eine Kasse mit Tageslimit: Mehr als vereinbart geht nicht raus, egal wer fragt.",
		},
		{
			key: "belegt",
			title: "Jeder Schritt belegt",
			text: "Eingänge, Auszahlungen und Tagesbestände gehen automatisch an Klick, eine App für Compliance. Dort werden sie zu Nachweisen für Prüfer:innen.",
			like: "Wie ein Kassenbuch, das sich selbst schreibt und das niemand heimlich ändern kann.",
		},
	] satisfies Pillar[],
} as const;

// Eine Auszahlung, Schritt für Schritt (Ruf und Antwort)
export const PAYOUT = {
	title: "Eine Auszahlung, Schritt für Schritt",
	lead: "So läuft es heute im Testnetz. Je Schritt steht oben, was du tust, und darunter, was both.money daraufhin tut.",
	steps: [
		{
			say: "Du legst die Auszahlung an.",
			answer:
				"both.money prüft Ziel und Bestand. Dann hält es fest, was passieren soll. Unterschrieben ist damit noch nichts.",
		},
		{
			say: "Du bestätigst mit dem Sicherheitsschlüssel.",
			answer:
				"Eine eigene Seite zeigt dir Betrag und Ziel noch einmal. Erst nach deiner Bestätigung prüft der Signer die Grenzen und unterschreibt.",
		},
		{
			say: "Alles steht in Klick.",
			answer:
				"Auszahlung und Bewegung kommen mit eigener Kennung und Prüfsumme an. Klick nimmt jedes Ereignis genau einmal an.",
		},
	],
} as const;

export const EVENTS_INTRO = {
	title: "Was passiert, wenn …",
	lead: "Wähle ein Ereignis. Du siehst, was both.money dann tut und was davon in Klick ankommt.",
} as const;

// Das Live-Element: ein Ereignis wählen, beide Seiten lesen
export type LandingEvent = {
	key: string;
	label: string;
	wallet: string;
	klick: string;
};

export const EVENTS: readonly LandingEvent[] = [
	{
		key: "eingang",
		label: "Geld kommt an",
		wallet:
			"Der eigene Knoten meldet die Zahlung. Bevor sie zählt, prüft both.money den Absender gegen die Sanktionsliste der USA (OFAC).",
		klick:
			"Eine Bewegung mit Konto, Betrag und dem Ergebnis der Prüfung, unter „Krypto“.",
	},
	{
		key: "treffer",
		label: "Absender steht auf der Liste",
		wallet:
			"Der Betrag bleibt eingefroren. Alle mit Zugriff auf die Wallet bekommen sofort eine Meldung.",
		klick:
			"Ein Verdachtsfall zur Prüfung, ohne Namen, und eine Aufgabe für die zuständige Person.",
	},
	{
		key: "auszahlung",
		label: "Geld geht raus",
		wallet:
			"Ziel, Betrag und höchste Gebühr stehen fest. Erst nach der Freigabe mit Sicherheitsschlüssel unterschreibt der Signer.",
		klick:
			"Die Auszahlung mit ihren Freigaben, danach die Bewegung, sobald die Blockchain sie bestätigt.",
	},
	{
		key: "tagesabschluss",
		label: "Ein Tag endet",
		wallet:
			"Um 00:10 Uhr hält both.money den Bestand je Konto fest, mit der Nummer des letzten Blocks.",
		klick:
			"Der Bestand für die tägliche Abstimmung unter „Verwahrung“, schon ausgefüllt.",
	},
	{
		key: "unbekannt",
		label: "Geld geht ohne Auftrag raus",
		wallet:
			"Das darf nie passieren. both.money schlägt sofort Alarm und friert den Signer ein.",
		klick:
			"Ein Vorfall, den du einstufst und bei Bedarf meldest. Er schließt nie von allein.",
	},
	{
		key: "stopp",
		label: "Du drückst „Alles stoppen“",
		wallet:
			"Der Signer unterschreibt nichts mehr. Wieder starten geht nur direkt am Server.",
		klick: "Eine dringende Aufgabe: Grund klären, dann entscheiden.",
	},
];

// Das Ziel: so soll eine Zahlung laufen; je Schritt, was davon heute läuft
export type FlowStep = {
	key: string;
	title: string;
	text: string;
	today: string;
	live: boolean;
};

export const GOAL = {
	badge: "Ziel · braucht Erlaubnis",
	title: "Das Ziel: ein Zahlungsweg",
	lead: "both.money soll Geld annehmen, getrennt aufbewahren und an einer anderen Stelle auszahlen. Absender und Empfänger sind vorher geprüft. Das darf both.money erst mit Erlaubnis.",
	steps: [
		{
			key: "pruefen",
			title: "Beide Seiten geprüft",
			text: "Bevor Geld fließt, kennt both.money Absender und Empfänger: Personen mit Ausweisprüfung, Unternehmen mit Registerauszug und den Menschen dahinter.",
			today: "folgt mit Erlaubnis",
			live: false,
		},
		{
			key: "eingang",
			title: "Geld kommt an",
			text: "Euro auf ein Treuhandkonto, Kryptowerte in die Wallet. Jeder Eingang wird gegen Sanktionslisten geprüft.",
			today: "Prüfung je Krypto-Eingang läuft",
			live: true,
		},
		{
			key: "verwahren",
			title: "Getrennt aufbewahrt",
			text: "Das Geld liegt getrennt vom Geld des Betreibers, bis der Eingang sicher bestätigt ist. Jeden Tag wird nachgezählt.",
			today: "Tagesabschluss läuft",
			live: true,
		},
		{
			key: "auszahlen",
			title: "Ausgezahlt beim Empfänger",
			text: "Erst dann geht der Betrag an den geprüften Empfänger, mit den Angaben zu Absender und Empfänger. Jeder Schritt landet als Nachweis in Klick.",
			today: "Freigabe bereit, Angaben folgen",
			live: false,
		},
	] satisfies FlowStep[],
	stagesTitle: "Der Weg dahin",
	stagesText:
		"Vier Stufen, jede ab der zweiten nur mit Erlaubnis. Im Fahrplan steht jeder Schritt mit der Pflicht, auf die er einzahlt.",
	action: "Zum Fahrplan",
} as const;

// Wofür both.money Nachweise liefert (zweiendige Zeilen je Rahmenwerk)
export type ComplianceRow = { name: string; value: string };
export type ComplianceGroup = { title: string; rows: ComplianceRow[] };

export const COMPLIANCE = {
	title: "Wofür es Nachweise liefert",
	lead: "Unternehmen mit Kryptowerten müssen vieles belegen. both.money liefert die Nachweise dafür an Klick. Ob sie reichen, entscheiden Prüfer:in und Aufsicht.",
	groups: [
		{
			title: "Zahlungsweg, beide Seiten",
			rows: [
				{
					name: "Absender und Empfänger prüfen (KYC, KYB)",
					value: "folgt mit Erlaubnis",
				},
				{
					name: "Kundengeld getrennt aufbewahren",
					value: "gesperrt bis zur Erlaubnis",
				},
				{
					name: "Auszahlung erst nach bestätigtem Eingang",
					value: "läuft für eigene Bestände",
				},
				{ name: "Travel Rule", value: "folgt mit Kundengeld" },
			],
		},
		{
			title: "MiCAR, Verwahrung",
			rows: [
				{ name: "Tägliche Abstimmung", value: "Bestand mit Blocknummer" },
				{
					name: "Eigenes Geld und Kundengeld trennen",
					value: "Zweck je Konto",
				},
				{
					name: "Verwahrung für Kund:innen",
					value: "gesperrt bis zur Erlaubnis",
				},
				{
					name: "Bot für das Geld von Kund:innen",
					value: "gesperrt bis zur Erlaubnis",
				},
			],
		},
		{
			title: "Geldwäsche und Sanktionen",
			rows: [
				{ name: "Sanktionsprüfung je Eingang", value: "OFAC-Liste, täglich" },
				{
					name: "Treffer einfrieren und prüfen",
					value: "Verdachtsfall in Klick",
				},
			],
		},
		{
			title: "DORA, IT-Sicherheit",
			rows: [
				{ name: "Protokoll", value: "verkettet je Organisation" },
				{ name: "Vorfälle erkennen", value: "Vorfall in Klick" },
				{ name: "Zugriff", value: "Passkey, 15 Minuten entsperrt" },
				{ name: "Abhängigkeit von Dritten", value: "eigene Knoten" },
			],
		},
		{
			title: "CCSS, Schlüssel",
			rows: [
				{ name: "Schlüssel erzeugen", value: "Zeremonie mit Wortprüfung" },
				{
					name: "Auszahlungen freigeben",
					value: "nur mit Sicherheitsschlüsseln",
				},
				{ name: "Sicherung", value: "täglich" },
				{ name: "Notfall", value: "Alles stoppen" },
			],
		},
	] satisfies ComplianceGroup[],
} as const;

// Begriffe kurz erklärt: jedes Fachwort der Seite in ein, zwei Sätzen
export type Term = { term: string; text: string };

export const TERMS = {
	title: "Begriffe kurz erklärt",
	items: [
		{
			term: "Wallet",
			text: "Ein Programm, das Kryptowerte verwaltet. Genau genommen verwaltet es die Schlüssel, mit denen sich Kryptowerte bewegen lassen.",
		},
		{
			term: "Knoten",
			text: "Ein Rechner, der eine Kopie der Blockchain führt und jede neue Zahlung nachprüft. Er hält keine Schlüssel.",
		},
		{
			term: "Signer",
			text: "Ein eigenes Programm ohne Internet, das die Schlüssel hält. Es unterschreibt nur, was die Regeln erlauben.",
		},
		{
			term: "Sicherheitsschlüssel",
			text: "Ein kleines Gerät für den USB-Anschluss oder zum Auflegen. Ohne das Gerät in der Hand gibt es keine Freigabe.",
		},
		{
			term: "Token",
			text: "Ein Wert auf der Blockchain, der für etwas anderes steht, etwa für einen US-Dollar oder eine Menge Gold.",
		},
		{
			term: "Testnetz",
			text: "Eine Blockchain zum Üben. Die Werte darin haben keinen Geldwert.",
		},
		{
			term: "KYC und KYB",
			text: "Die Prüfung, wer jemand ist: bei Personen mit Ausweis, bei Unternehmen mit Registerauszug und den Menschen dahinter.",
		},
		{
			term: "Travel Rule",
			text: "Die Pflicht, bei jeder Überweisung von Kryptowerten Angaben zu Absender und Empfänger mitzuschicken.",
		},
		{
			term: "Klick",
			text: "Eine App für Compliance. Sie sammelt die Nachweise aus both.money und macht daraus Aufgaben, Vorfälle und Berichte.",
		},
	] satisfies Term[],
} as const;

export const FAQ = {
	title: "Häufige Fragen",
	items: [
		{
			q: "Ist both.money schon ein Zahlungsdienstleister?",
			a: "Nein. Heute ist both.money eine Wallet für die eigenen Bestände, im Testnetz. Geld für andere annehmen und weiterleiten braucht Erlaubnisse. Die Sperre dafür ist eingebaut und bleibt zu, bis eine Erlaubnis vorliegt.",
		},
		{
			q: "Handelt der Bot schon?",
			a: "Nein, er ist geplant. Zuerst kommen der Ethereum-Knoten und der Tausch über dezentrale Börsen. Dann läuft der Bot im Testnetz, danach im echten Netz mit kleinen Grenzen.",
		},
		{
			q: "Kann der Bot mein Geld verwalten?",
			a: "Noch nicht. Für das Geld anderer zu handeln ist Portfolioverwaltung und braucht eine Erlaubnis. Bis dahin handelt der Bot nur mit den eigenen Beständen von both.money.",
		},
		{
			q: "Kann der Bot Geld abziehen?",
			a: "Nein. Er kann nur tauschen. Der Signer unterschreibt einen Tausch nur, wenn das Ergebnis in dieselbe Wallet zurückfließt.",
		},
		{
			q: "Warum zuerst Gold gegen US-Dollar?",
			a: "Für beides gibt es Token mit klarer Deckung und einen Goldpreis aus unabhängiger Quelle. So lässt sich jeder Tausch gegen einen Kurs prüfen. Weitere Paare kommen dazu, wenn das für sie genauso gilt.",
		},
		{
			q: "Warum werden beide Seiten geprüft?",
			a: "Bei einer Überweisung kennt meist jede Bank nur ihre eigene Seite. both.money soll Absender und Empfänger selbst prüfen. So lässt sich bei jeder Zahlung belegen, wer sie geschickt hat, wer sie bekommt und wofür.",
		},
		{
			q: "Wie soll das in anderen Ländern gehen?",
			a: "Je Land über eine eigene Einheit mit Erlaubnis oder einen Partner mit Erlaubnis vor Ort. Beide prüfen nach demselben Standard. Welche Länder zuerst kommen, hängt an den Erlaubnissen.",
		},
		{
			q: "Läuft das schon mit echtem Geld?",
			a: "Noch nicht. Gerade läuft das Bitcoin-Testnetz, das Ethereum-Testnetz folgt mit dem nächsten Server. Das echte Netz bleibt gesperrt, bis der Test abgeschlossen ist.",
		},
		{
			q: "Wer kann Geld bewegen?",
			a: "Niemand allein über die Website. Jede Auszahlung braucht die Freigabe mit Sicherheitsschlüssel. Der Signer prüft dabei Ziel, Grenzen je Auszahlung und Tag und die Gebühr.",
		},
		{
			q: "Wie bekommst du Zugang?",
			a: "Nur per Einladung. Jemand aus deiner Organisation lädt dich ein, du legst einen Passkey an. Eine offene Registrierung gibt es nicht.",
		},
		{
			q: "Wo laufen die Server?",
			a: "Bei Hetzner in Deutschland. Die Knoten stehen auf einem eigenen Server und sind nur über einen verschlüsselten Tunnel erreichbar.",
		},
		{
			q: "Ersetzt das eine Prüfung?",
			a: "Nein. both.money hält Regeln technisch ein und liefert Nachweise. Ob das reicht, entscheiden Prüfer:in und Aufsicht. Diese Seite ist keine Rechtsberatung.",
		},
	],
} as const;

export const MORE = {
	text: "Mehr Technik, die Hardware der Knoten und alle Schritte stehen im Fahrplan.",
	action: "Zum Fahrplan",
} as const;

export const CLOSE = {
	sentence: "Du hast eine Einladung? Dann melde dich mit deinem Passkey an.",
	action: "Anmelden",
} as const;
