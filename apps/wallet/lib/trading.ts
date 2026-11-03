import type { RoadmapItem } from "./roadmap";

// Automatisch handeln (geplant, Wunsch 03.11.): Ein Bot tauscht Gold gegen
// US-Dollar und zurück, beide als Token in der eigenen Wallet, nur in einem
// Rahmen, den eine Inhaber:in vorher festlegt und den der Signer selbst prüft
// (wie die Vollmacht, ADR-031). Zuerst nur für die eigenen Bestände der
// Betreiber-Organisation; für Kund:innen ist das Portfolioverwaltung nach
// MiCAR und bleibt gesperrt bis zur Erlaubnis. Texte für Startseite und
// Fahrplan an einer Stelle; Test public-pages: kein Gewinnversprechen, Hinweis
// auf Verluste, Kund:innen gesperrt. Rechtliche Einordnung vor der Bewerbung
// prüfen (CLAUDE.md, Offene Punkte).

export const TRADING = {
	status: "geplant · zuerst für eigene Bestände",
	title: "Automatisch handeln",
	lead: "Ein Bot soll Gold gegen US-Dollar tauschen und zurück. Er handelt nach festen Regeln und nur in Grenzen, die du vorher setzt.",
	pairs: "Zuerst Gold und US-Dollar, weitere Paare folgen.",
	// Was ein Token ist, in zwei Sätzen
	tokens:
		"Beides liegt als Token in der Wallet. Ein Gold-Token steht für eine feste Menge echtes Gold im Tresor eines Herausgebers, ein Dollar-Token für einen US-Dollar.",
	steps: [
		{
			title: "Du legst den Rahmen fest",
			text: "Welches Paar, wie viel höchstens je Tausch und am Tag, bis wann. Den Rahmen bestätigst du mit deinem Sicherheitsschlüssel.",
		},
		{
			title: "Der Bot beobachtet den Kurs",
			text: "Den Goldpreis liest both.money aus eigener Quelle: Preisdaten von Chainlink über den eigenen Ethereum-Knoten. Fehlt der Kurs, wartet der Bot.",
		},
		{
			title: "Der Signer prüft jeden Tausch",
			text: "Der Bot schlägt einen Tausch nur vor. Der Signer unterschreibt erst, wenn Paar, Betrag und Kurs im Rahmen liegen.",
		},
		{
			title: "Jeder Tausch ist belegt",
			text: "Kurs, Betrag, Uhrzeit und die Regel, nach der der Bot gehandelt hat, landen als Nachweis in Klick.",
		},
	],
	may: {
		title: "Was der Bot darf",
		items: [
			"Gold und US-Dollar tauschen, in beide Richtungen.",
			"Nur so viel, wie dein Rahmen je Tausch und Tag erlaubt.",
			"Nur nahe am Kurs aus eigener Quelle.",
		],
	},
	never: {
		title: "Was der Bot nie darf",
		items: [
			"Geld aus der Wallet schicken. Das Ergebnis jedes Tauschs kommt in dieselbe Wallet zurück.",
			"Seinen Rahmen selbst ändern. Das geht nur mit deinem Sicherheitsschlüssel.",
			"Weiterhandeln, wenn du ihn stoppst. Ein Klick hält ihn sofort an.",
		],
	},
	risk: "Gold und Dollar schwanken gegeneinander. Ein Bot kann dabei Geld verlieren, und einen Gewinn kann niemand zusagen.",
	customers:
		"Für das Geld von Kund:innen bleibt der Bot gesperrt, bis die Erlaubnis dafür vorliegt.",
	// Kurzform von „nie darf“ für den Fahrplan
	safety:
		"Der Bot kann nur tauschen, nie auszahlen: Das Ergebnis jedes Tauschs kommt in dieselbe Wallet zurück.",
	// Beispielansichten (nachgebaut, keine echten Werte)
	example: {
		label: "Beispiel, so soll es aussehen",
		frameTitle: "Rahmen für den Bot",
		frame: [
			["Paar", "Gold / US-Dollar"],
			["Höchstens je Tausch", "1.000 US-Dollar"],
			["Höchstens am Tag", "5.000 US-Dollar"],
			["Abstand zum Kurs", "höchstens 0,5 %"],
			["Gilt bis", "31. März"],
		],
		frameAction: "Mit Sicherheitsschlüssel bestätigen",
		logTitle: "Was der Bot getan hat",
		log: [
			{
				what: "Gold gekauft",
				amount: "800 US-Dollar",
				state: "unterschrieben",
			},
			{
				what: "Gold verkauft",
				amount: "600 US-Dollar",
				state: "unterschrieben",
			},
			{
				what: "Tausch abgelehnt",
				amount: "900 US-Dollar",
				state: "Kurs außerhalb des Rahmens",
			},
		],
	},
} as const;

// Fahrplan: Schritte bis zum Bot, je mit der Pflicht, auf die er einzahlt.
// Reihenfolge ohne Termine; Kund:innen gesperrt bis zur Erlaubnis.
export const TRADING_STEPS: readonly RoadmapItem[] = [
	{
		key: "handeln-kurs",
		title: "Goldpreis aus eigener Quelle",
		text: "Der Kurs von Gold in US-Dollar kommt aus Chainlink-Preisdaten über den eigenen Ethereum-Knoten, wie die übrigen Kurse. Ohne Kurs handelt der Bot nicht.",
		status: "planned",
		requires: "Ethereum-Knoten (siehe Als Nächstes)",
		anchors: [
			{ framework: "DORA", point: "Datenquellen selbst prüfen" },
			{ framework: "MiCAR", point: "Nachvollziehbare Bewertung" },
		],
	},
	{
		key: "handeln-tausch",
		title: "Tausch über dezentrale Börsen",
		text: "Der Bot nutzt den Tausch aus Phase 5. Der Signer baut jeden Tausch selbst und lässt ihn nur zu, wenn das Ergebnis in dieselbe Wallet zurückfließt.",
		status: "planned",
		anchors: [
			{ framework: "CCSS", point: "Freigaben und Grenzen" },
			{ framework: "Sanktionsrecht", point: "Prüfung der Gegenseite" },
		],
	},
	{
		key: "handeln-rahmen",
		title: "Rahmen per Sicherheitsschlüssel",
		text: "Eine Inhaber:in legt Paar, Grenzen je Tausch und Tag, den höchsten Abstand zum Kurs und die Laufzeit fest. Der Signer zählt diesen Rahmen wie eine Vollmacht; mehr darf der Bot nie.",
		status: "planned",
		anchors: [
			{ framework: "CCSS", point: "Freigabe durch Schlüssel" },
			{ framework: "DORA", point: "Kontrollierte Freigaben" },
		],
	},
	{
		key: "handeln-test",
		title: "Erst Testnetz, dann kleine Grenzen",
		text: "Der Bot läuft zuerst im Testnetz Sepolia mit Test-Token. Danach handelt er im echten Netz mit kleinen Grenzen, nur mit den eigenen Beständen.",
		status: "planned",
		requires: "Abnahme im Testnetz",
		anchors: [
			{ framework: "DORA", point: "Tests vor dem Einsatz" },
			{ framework: "MiCAR", point: "Keine Marktmanipulation (Art. 91)" },
		],
	},
	{
		key: "handeln-paare",
		title: "Weitere Paare",
		text: "Weitere Paare kommen dazu, wenn es für sie eine verlässliche Kursquelle und Token mit klarer Deckung gibt.",
		status: "planned",
		anchors: [
			{ framework: "MiCAR", point: "Token mit zugelassenem Herausgeber" },
		],
	},
	{
		key: "handeln-kunden",
		title: "Für Kund:innen",
		text: "Für das Geld anderer zu handeln ist Portfolioverwaltung. Dazu gehören eine Prüfung, ob es zur Person passt, klare Kosten und regelmäßige Berichte.",
		status: "locked",
		requires:
			"Erlaubnis als Anbieter von Krypto-Dienstleistungen nach MiCAR (Portfolioverwaltung)",
		anchors: [
			{ framework: "MiCAR", point: "Portfolioverwaltung nur mit Erlaubnis" },
			{ framework: "MiCAR", point: "Eignung prüfen (Art. 81)" },
			{ framework: "GwG / AMLR", point: "Sorgfaltspflichten" },
		],
	},
];
