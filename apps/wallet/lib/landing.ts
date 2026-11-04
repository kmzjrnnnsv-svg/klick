// Öffentliche Startseite von both.money (abgemeldet unter „/“): alle Texte an
// einer Stelle, Du-Form, keine Geviertstriche, kurze Sätze (Test
// public-pages). Sieben Abschnitte (Wunsch 03.11.): oben, was both.money ist,
// mit dem Stand in drei Zeilen; dann Krypto überweisen, der Bot per Prompt
// (lib/trading.ts), „Was passiert, wenn …“, Nachweise, Fragen mit Begriffen
// und „Zugang anfragen“ als einzige Hauptaktion. Zahlungsweg und Kundengeld
// sind klar als Ziel bzw. „gesperrt“ markiert; die Stufen stehen nur im
// Fahrplan (lib/roadmap.ts), hier ein Satz mit Link. Rechtliche Einordnung
// vor der Bewerbung prüfen.

export const HERO = {
	// Zeilen von Hand umbrochen
	lines: ["Geld bewegt sich", "nur nach Regeln"],
	lead: "both.money ist eine Wallet für Unternehmen. Du überweist Kryptowerte nur in festen Grenzen, und jeder Schritt ist belegt.",
	action: "Zugang anfragen",
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
			title: "Krypto überweisen, mit Freigabe",
			text: "Empfangen, aufbewahren und senden mit Sicherheitsschlüssel. Im Testnetz, ohne echtes Geld.",
			href: "#ueberweisen",
		},
		{
			key: "geplant",
			label: "Geplant",
			tone: "planned",
			title: "Ein Bot, gesteuert per Prompt",
			text: "Du beschreibst in Worten, wie er Gold gegen US-Dollar tauscht. Er handelt nur nach Regeln, die du bestätigst.",
			href: "#handeln",
		},
		{
			key: "ziel",
			label: "Ziel · braucht Erlaubnis",
			tone: "goal",
			title: "Zahlungsweg",
			text: "Geld annehmen und an geprüfte Empfänger weitergeben. Erst mit Erlaubnis der Aufsicht.",
			href: "/roadmap#ziel",
		},
	] satisfies StandRow[],
} as const;

// Worauf eine Überweisung baut: drei Sätze mit einem Bild aus dem Alltag
// (im Abschnitt „Krypto überweisen“)
export type Pillar = { key: string; title: string; text: string; like: string };

export const PILLARS = {
	title: "Worauf das baut",
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

// Krypto überweisen, Schritt für Schritt (Ruf und Antwort); zuerst auf der
// Seite (Wunsch 03.11.)
export const PAYOUT = {
	title: "Krypto überweisen, Schritt für Schritt",
	lead: "So läuft eine Überweisung heute im Testnetz. Je Schritt steht oben, was du tust, und darunter, was both.money daraufhin tut.",
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

// Das Ziel in einem Satz; die Stufen stehen im Fahrplan (lib/roadmap.ts)
export const GOAL_NOTE = {
	label: "Ziel · braucht Erlaubnis",
	text: "Das Ziel ist ein Zahlungsweg zwischen geprüften Unternehmen. Dafür braucht both.money Erlaubnisse der Aufsicht, jede Stufe steht im Fahrplan.",
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
			term: "Prompt",
			text: "Ein Auftrag in deinen eigenen Worten. Hier sagt er der KI, wie der Bot handeln soll.",
		},
		{
			term: "KI",
			text: "Ein Programm, das Sprache versteht. Hier macht es aus deinem Prompt feste Regeln, handeln darf es selbst nicht.",
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
	termsTitle: "Begriffe kurz erklärt",
	items: [
		{
			q: "Ist both.money schon ein Zahlungsdienstleister?",
			a: "Nein. Heute ist both.money eine Wallet für die eigenen Bestände, im Testnetz. Geld für andere annehmen und weiterleiten braucht Erlaubnisse. Die Sperre dafür ist eingebaut und bleibt zu, bis eine Erlaubnis vorliegt.",
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
			q: "Handelt der Bot schon, auch für mich?",
			a: "Nein, er ist geplant und zuerst nur für die eigenen Bestände von both.money. Für das Geld anderer zu handeln ist Portfolioverwaltung und braucht eine Erlaubnis.",
		},
		{
			q: "Was macht die KI, und was nicht?",
			a: "Sie macht aus deinem Prompt Regeln, die du vor dem Bestätigen liest. Handeln, Regeln ändern oder Geld schicken kann sie nicht. Sie liest nur deinen Prompt und den Kurs aus eigener Quelle.",
		},
		{
			q: "Wie bekommst du Zugang?",
			a: "Stell unten eine Anfrage. Passt es, bekommst du eine Einladung und legst einen Passkey an. Eine offene Registrierung gibt es nicht.",
		},
	],
} as const;

// Die eine Hauptaktion: Zugang anfragen (Formular, /api/access-request)
export const ACCESS = {
	title: "Zugang anfragen",
	lead: "both.money ist im Test und nur per Einladung offen. Schreib kurz, wer du bist und wofür du es nutzen willst. Die Antwort kommt per E-Mail.",
	fields: {
		name: "Name",
		company: "Unternehmen",
		email: "E-Mail",
		purpose: "Wofür",
		message: "Nachricht (freiwillig)",
		messageHint: "Etwa: welche Kryptowerte, wie viele Überweisungen im Monat.",
		business: "Ich frage für ein Unternehmen an.",
	},
	privacy:
		"Für die Antwort speichert both.money deine Angaben höchstens 12 Monate und gibt sie nicht weiter.",
	privacyLink: "Datenschutz",
	submit: "Zugang anfragen",
	sending: "Wird gesendet …",
	done: "Danke, deine Anfrage ist angekommen. Die Antwort kommt per E-Mail.",
	error: "Das hat nicht geklappt. Bitte versuch es gleich noch einmal.",
	tooMany: "Zu viele Anfragen von deinem Anschluss. Bitte versuch es später.",
	invited: "Du hast schon eine Einladung?",
	login: "Anmelden",
} as const;
