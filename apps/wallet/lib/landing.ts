// Öffentliche Startseite von both.money (abgemeldet unter „/“): alle Texte an
// einer Stelle, Du-Form, keine Geviertstriche (Test public-pages). Oben das
// Ziel (Zahlungsweg zwischen geprüften Parteien), klar als Ziel markiert; der
// Rest zeigt, was both.money heute tut. Kundengeld, Prüfung beider Seiten,
// Euro und Travel Rule sind „folgt“ bzw. „gesperrt“, die Stufen stehen im
// Fahrplan (lib/roadmap.ts). Rechtliche Einordnung vor der Bewerbung prüfen.

export const HERO = {
	goal: "Ziel · braucht Erlaubnis",
	// Zeilen von Hand umbrochen
	lines: ["Geld weitergeben,", "beide Seiten geprüft"],
	lead: "both.money soll Geld in Euro und in Kryptowerten annehmen, getrennt verwahren und an der anderen Stelle auszahlen, sobald der Eingang bestätigt ist. Absender und Empfänger sind vorher geprüft, als Person oder als Unternehmen, nach einem Standard, der überall gleich gilt.",
	action: "Anmelden",
	today:
		"Heute ist both.money eine Wallet für eigene Bestände im Bitcoin-Testnetz Signet: kein echtes Geld, kein Kundengeld, Zugang nur per Einladung.",
	backend: "Einblick ins Backend",
} as const;

// So soll eine Zahlung laufen; je Schritt, was davon heute schon läuft
export type FlowStep = {
	key: string;
	title: string;
	text: string;
	today: string;
	live: boolean;
};

export const FLOW = {
	title: "So soll eine Zahlung laufen",
	lead: "Vier Schritte, bei jeder Zahlung gleich. Darunter steht, was davon heute schon läuft.",
	steps: [
		{
			key: "pruefen",
			title: "Beide Seiten geprüft",
			text: "Bevor Geld fließt, kennt both.money Absender und Empfänger: Personen mit Identitätsprüfung (KYC), Unternehmen mit Registerauszug, wirtschaftlich Berechtigten und Geschäftszweck (KYB).",
			today: "folgt mit Erlaubnis",
			live: false,
		},
		{
			key: "eingang",
			title: "Geld kommt an",
			text: "Euro auf ein Treuhandkonto, Kryptowerte auf eine Wallet über eigene Knoten. Jeder Eingang wird gegen Sanktionslisten und den angegebenen Zweck geprüft.",
			today: "Sanktionsprüfung je Krypto-Eingang läuft",
			live: true,
		},
		{
			key: "verwahren",
			title: "Verwahrt, bis es bestätigt ist",
			text: "Das Geld liegt getrennt vom Geld des Betreibers, bis der Eingang endgültig bestätigt ist, und wird täglich abgestimmt.",
			today: "Tagesabschluss mit Blockhöhe läuft",
			live: true,
		},
		{
			key: "auszahlen",
			title: "Ausgezahlt an der anderen Stelle",
			text: "Erst dann geht der Betrag an den geprüften Empfänger, freigegeben per Sicherheitsschlüssel und mit den Angaben zu Absender und Empfänger (Travel Rule). Jeder Schritt landet als Nachweis in Klick.",
			today: "Freigabe per Sicherheitsschlüssel bereit, Travel Rule folgt",
			live: false,
		},
	] satisfies FlowStep[],
} as const;

export const EVENTS_TITLE = "Was heute schon passiert bei …";

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
		label: "Eingang",
		wallet:
			"Der eigene Knoten meldet die Transaktion. Vor der Gutschrift prüft both.money jeden direkten Absender gegen die OFAC-Liste.",
		klick:
			"Eine Bewegung unter „Krypto“: Konto, Betrag, Transaktion und das Ergebnis der Sanktionsprüfung.",
	},
	{
		key: "treffer",
		label: "Sanktionstreffer",
		wallet:
			"Der Betrag bleibt eingefroren. Alle mit Zugriff auf die Wallet bekommen sofort eine Sicherheitsmeldung.",
		klick:
			"Ein Verdachtsfall zur Prüfung, ohne Personendaten, und eine Aufgabe für die verantwortliche Person.",
	},
	{
		key: "auszahlung",
		label: "Auszahlung",
		wallet:
			"Ziel, Betrag und Gebührendeckel stehen in der Absicht. Erst nach der Freigabe mit Sicherheitsschlüssel signiert der Signer.",
		klick:
			"Die Auszahlung mit Freigaben, danach die Bewegung mit Blockhöhe, sobald sie bestätigt ist.",
	},
	{
		key: "tagesabschluss",
		label: "Tagesabschluss",
		wallet:
			"Um 00:10 Uhr hält both.money den Bestand je Konto fest, mit Blockhöhe und Hash des eigenen Knotens.",
		klick:
			"Der Bestand für die tägliche Abstimmung unter „Verwahrung“, vorbelegt mit Blockhöhe und Hash.",
	},
	{
		key: "unbekannt",
		label: "Ausgabe ohne Auszahlung",
		wallet:
			"Geld verlässt ein Hot-Konto, ohne dass es eine Auszahlung dazu gibt: Sicherheitsmeldung, der Signer wird eingefroren.",
		klick:
			"Ein Vorfall, den du einstufst und bei Bedarf meldest. Er schließt nie von allein.",
	},
	{
		key: "stopp",
		label: "Alles stoppen",
		wallet:
			"Ein Klick friert den Signer ein. Wieder auftauen geht nur am Terminal des Servers.",
		klick: "Eine Aufgabe mit hoher Priorität: Grund klären, dann entscheiden.",
	},
];

// Eine Auszahlung, Schritt für Schritt (Ruf und Antwort)
export const PAYOUT = {
	title: "Eine Auszahlung, wie sie heute läuft",
	steps: [
		{
			say: "Zuerst legst du die Auszahlung an.",
			answer:
				"both.money prüft Ziel und verfügbaren Bestand und legt eine Absicht an. Unterschrieben ist damit noch nichts.",
		},
		{
			say: "Dann bestätigst du mit dem Sicherheitsschlüssel.",
			answer:
				"Die Seite approve.both.money liest den Text der Absicht selbst. Der Signer zählt die Freigabe, prüft Grenzen und Gebühr und signiert genau diese Absicht.",
		},
		{
			say: "Zum Schluss steht alles in Klick.",
			answer:
				"Auszahlung und Bewegung kommen mit eigener Kennung und Prüfsumme an. Klick nimmt jedes Ereignis genau einmal an.",
		},
	],
} as const;

// Einblick: Systemzustand als Tafel mit Randnotizen (Beispielwerte)
export type BackendPart = {
	key: string;
	label: string;
	value: string;
	state: string;
	note: { title: string; text: string };
};

export const BACKEND = {
	title: "Einblick ins Backend",
	caption:
		"Beispielansicht mit Werten aus dem Testnetz. So sieht der Zustand aus, den both.money laufend prüft.",
	parts: [
		{
			key: "knoten",
			label: "Knoten",
			value: "Bitcoin Signet",
			state: "synchron",
			note: {
				title: "Eigene Knoten",
				text: "Die Knoten laufen auf einem eigenen Server und antworten nur über einen verschlüsselten Tunnel. Keine Explorer, keine fremden Schnittstellen.",
			},
		},
		{
			key: "sanktionen",
			label: "Sanktionsliste",
			value: "OFAC, 660 Adressen",
			state: "täglich neu",
			note: {
				title: "Prüfung vor der Gutschrift",
				text: "Jeder neue Eingang wird gegen die Liste geprüft, bevor er zählt. Ein Treffer bleibt eingefroren.",
			},
		},
		{
			key: "signer",
			label: "Signer",
			value: "Journal Nr. 128",
			state: "nicht eingefroren",
			note: {
				title: "Signer ohne Netz",
				text: "Ein eigener Prozess hält die Hot-Schlüssel, führt ein Journal mit Hash-Kette und signiert nur, was die Richtlinie erlaubt.",
			},
		},
		{
			key: "freigabe",
			label: "Sicherheitsschlüssel",
			value: "Solo, 2 Schlüssel",
			state: "Richtlinie gesetzt",
			note: {
				title: "Freigabe außerhalb der App",
				text: "Bestätigt wird auf approve.both.money. Die Seite zeigt den Text selbst an, gezählt werden nur Sicherheitsschlüssel.",
			},
		},
		{
			key: "protokoll",
			label: "Protokoll",
			value: "Kette geprüft",
			state: "täglich",
			note: {
				title: "Protokoll mit Hash-Kette",
				text: "Jede Änderung steht im Protokoll, verkettet je Organisation. Sensible Felder sind mit einem Schlüssel je Organisation verschlüsselt.",
			},
		},
		{
			key: "export",
			label: "Compliance-Export",
			value: "Klick",
			state: "nichts offen",
			note: {
				title: "Export an Klick",
				text: "Bewegungen, Tagesbestände, Zeremonien und Auffälligkeiten gehen mit Kennung und Prüfsumme an deine Organisation in Klick.",
			},
		},
	] satisfies BackendPart[],
} as const;

// Wofür both.money Nachweise liefert (zweiendige Zeilen je Rahmenwerk)
export type ComplianceRow = { name: string; value: string };
export type ComplianceGroup = { title: string; rows: ComplianceRow[] };

export const COMPLIANCE = {
	title: "Wofür es Nachweise liefert",
	lead: "both.money ist auf diese Pflichten ausgelegt und liefert die Nachweise dafür nach Klick. Ob sie reichen, entscheiden Prüfer:in und Aufsicht.",
	groups: [
		{
			title: "Zahlungsweg, beide Seiten",
			rows: [
				{
					name: "KYC und KYB von Absender und Empfänger",
					value: "folgt mit Erlaubnis",
				},
				{
					name: "Kundengeld getrennt verwahren",
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
				{ name: "Tägliche Abstimmung", value: "Bestand mit Blockhöhe" },
				{
					name: "Eigene Werte und Kundenwerte trennen",
					value: "Zweck je Konto",
				},
				{
					name: "Verwahrung für Kund:innen",
					value: "gesperrt bis zur Erlaubnis",
				},
				{
					name: "Register der Positionen je Kund:in",
					value: "folgt mit Erlaubnis",
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
			title: "DORA, IKT-Risiko",
			rows: [
				{ name: "Protokollierung", value: "Hash-Kette je Organisation" },
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
					value: "Quorum aus Sicherheitsschlüsseln",
				},
				{ name: "Sicherung", value: "Journal täglich gesichert" },
				{ name: "Notfall", value: "Alles stoppen" },
			],
		},
	] satisfies ComplianceGroup[],
} as const;

export const FAQ = {
	title: "Häufige Fragen",
	items: [
		{
			q: "Ist both.money schon ein Zahlungsdienstleister?",
			a: "Nein. Heute ist both.money eine Wallet für die eigenen Bestände der Betreiber-Organisation, im Testnetz. Geld für andere annehmen, verwahren und weiterleiten braucht Erlaubnisse als Zahlungsinstitut und als Anbieter von Krypto-Dienstleistungen; die Sperre dafür ist eingebaut und bleibt zu, bis eine Erlaubnis eingetragen ist.",
		},
		{
			q: "Warum werden beide Seiten geprüft?",
			a: "Bei einer Überweisung kennt meist jede Bank nur ihre eigene Seite. both.money soll Absender und Empfänger selbst prüfen. So lässt sich bei jeder Zahlung belegen, wer sie geschickt hat, wer sie bekommt und wofür, und Geld an Unbekannte oder gelistete Personen geht gar nicht erst hinaus.",
		},
		{
			q: "Wie soll das in anderen Ländern gehen?",
			a: "Über Korridore: je Land eine eigene Einheit mit Erlaubnis oder ein Partner mit Erlaubnis vor Ort, der nach demselben Standard prüft. Welche Länder zuerst kommen, hängt an den Erlaubnissen; Termine gibt es dafür nicht.",
		},
		{
			q: "Wird both.money eine Bank?",
			a: "Das ist die letzte Stufe im Fahrplan: eigene Konten für Kundengeld statt Treuhandkonto bei einer Partnerbank. Dafür braucht es eine Erlaubnis als Kreditinstitut; vorher kommen die Stufen als Zahlungsinstitut und Krypto-Dienstleister.",
		},
		{
			q: "Läuft das schon mit echtem Geld?",
			a: "Noch nicht. Gerade läuft das Bitcoin-Testnetz Signet, Ethereum Sepolia folgt mit dem nächsten Knoten-Server. Beides sind Testnetze ohne Geldwert. Das echte Netz bleibt gesperrt, bis die Abnahme im Testnetz abgeschlossen ist.",
		},
		{
			q: "Wie bekommst du Zugang?",
			a: "Nur per Einladung. Jemand aus deiner Organisation lädt dich ein, du legst einen Passkey an. Eine offene Registrierung gibt es nicht.",
		},
		{
			q: "Was sieht Klick von der Wallet?",
			a: "Ein- und Ausgänge, Tagesbestände, den Stand der Schlüssel-Zeremonie und Auffälligkeiten. Nie Kontoschlüssel und nie Schlüsselmaterial.",
		},
		{
			q: "Wer kann Geld bewegen?",
			a: "Niemand allein über die Website. Jede Auszahlung braucht die Freigabe mit Sicherheitsschlüssel; der Signer prüft Wartezeit des Ziels, Grenzen je Auszahlung und Tag und den Gebührendeckel.",
		},
		{
			q: "Wo laufen die Server?",
			a: "Bei Hetzner in Deutschland. Die Knoten stehen auf einem eigenen Server und sind nur über einen verschlüsselten Tunnel erreichbar. Welche Hardware als Nächstes dazukommt, steht im Fahrplan.",
		},
		{
			q: "Ersetzt das eine Prüfung?",
			a: "Nein. both.money hält Regeln technisch ein und liefert Nachweise. Ob das für deine Pflichten reicht, entscheiden Prüfer:in und Aufsicht. Diese Seite ist keine Rechtsberatung.",
		},
	],
} as const;

export const ROADMAP_TEASER = {
	title: "Der Weg dahin",
	text: "Vier Stufen: zuerst die Wallet für eigene Bestände, dann mit Erlaubnis Zahlungsinstitut und Krypto-Dienstleister, danach Korridore in weitere Länder, am Ende die Bank. Im Fahrplan steht jeder Schritt mit der Pflicht, auf die er einzahlt, und der Hardware, die er braucht.",
	action: "Zum Fahrplan",
} as const;

export const CLOSE = {
	sentence: "Du hast eine Einladung? Dann melde dich mit deinem Passkey an.",
	action: "Anmelden",
} as const;
