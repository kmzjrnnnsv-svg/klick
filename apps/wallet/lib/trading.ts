import type { RoadmapItem } from "./roadmap";

// Automatisch handeln per Prompt (geplant, Wunsch 03.11.): Du beschreibst in
// deinen Worten, wie ein Bot Gold gegen US-Dollar tauschen soll. Eine KI macht
// daraus feste Regeln und einen Rahmen in Klartext; erst deine Bestätigung mit
// dem Sicherheitsschlüssel macht ihn gültig, und der Signer prüft jeden Tausch
// dagegen (wie die Vollmacht, ADR-031). Die KI ändert den Rahmen nie selbst,
// liest nur deinen Prompt und den Kurs aus eigener Quelle und handelt nie
// frei. Zuerst nur für die eigenen Bestände der Betreiber-Organisation; für
// Kund:innen ist das Portfolioverwaltung nach MiCAR und bleibt gesperrt bis
// zur Erlaubnis. Texte für Startseite und Fahrplan an einer Stelle; Test
// public-pages: kein Gewinnversprechen, Hinweis auf Verluste, Kund:innen
// gesperrt, KI und Prompt erklärt. Rechtliche Einordnung vor der Bewerbung
// prüfen (CLAUDE.md, Offene Punkte).

export const TRADING = {
	status: "geplant · zuerst für eigene Bestände",
	title: "Ein Bot, gesteuert mit deinen Worten",
	lead: "Du schreibst, wie ein Bot Gold und US-Dollar tauschen soll. Eine KI macht daraus feste Regeln, und du bestätigst sie mit deinem Sicherheitsschlüssel.",
	pairs: "Zuerst Gold und US-Dollar, weitere Paare folgen.",
	// Was ein Token ist, in zwei Sätzen
	tokens:
		"Beides liegt als Token in der Wallet. Ein Gold-Token steht für eine feste Menge echtes Gold im Tresor eines Herausgebers, ein Dollar-Token für einen US-Dollar.",
	steps: [
		{
			title: "Du schreibst, was der Bot tun soll",
			text: "In deinen Worten, als Prompt. Etwa so wie im Beispiel unten.",
		},
		{
			title: "Die KI macht daraus Regeln",
			text: "Paar, Grenzen, Auslöser und Laufzeit stehen danach in Klartext da. Du siehst genau, was der Bot tun wird.",
		},
		{
			title: "Du bestätigst mit dem Schlüssel",
			text: "Erst dann gelten die Regeln. Ein neuer Prompt braucht eine neue Bestätigung.",
		},
		{
			title: "Der Signer prüft jeden Tausch",
			text: "Der Bot schlägt einen Tausch nur vor. Der Signer unterschreibt erst, wenn Paar, Betrag und Kurs im Rahmen liegen.",
		},
		{
			title: "Jeder Tausch ist belegt",
			text: "Prompt, Regel, Kurs und Betrag landen als Nachweis in Klick.",
		},
	],
	may: {
		title: "Was der Bot darf",
		items: [
			"Gold und US-Dollar tauschen, in beide Richtungen.",
			"Nur so viel, wie deine Regeln je Tausch und Tag erlauben.",
			"Nur nahe am Kurs aus eigener Quelle.",
			"Nur deinen Prompt und diesen Kurs lesen. Fremde Seiten und Nachrichten liest er nicht.",
		],
	},
	never: {
		title: "Was der Bot nie darf",
		items: [
			"Geld aus der Wallet schicken. Das Ergebnis jedes Tauschs kommt in dieselbe Wallet zurück.",
			"Seine Regeln selbst ändern. Auch die KI kann das nicht, nur dein Sicherheitsschlüssel.",
			"Frei nach Gefühl der KI handeln. Er folgt nur den Regeln, die du bestätigt hast.",
			"Weiterhandeln, wenn du ihn stoppst. Ein Klick hält ihn sofort an.",
		],
	},
	risk: "Gold und Dollar schwanken gegeneinander. Ein Bot kann dabei Geld verlieren, und einen Gewinn kann niemand zusagen.",
	customers:
		"Für das Geld von Kund:innen bleibt der Bot gesperrt, bis die Erlaubnis dafür vorliegt.",
	// Kurzform von „nie darf“ für den Fahrplan
	safety:
		"Der Bot kann nur tauschen, nie auszahlen: Das Ergebnis jedes Tauschs kommt in dieselbe Wallet zurück. Seine Regeln ändert nur dein Sicherheitsschlüssel, nie die KI.",
	// Beispielansichten (nachgebaut, keine echten Werte)
	example: {
		label: "Beispiel, so soll es aussehen",
		promptTitle: "Dein Prompt",
		prompt:
			"Halte 60 % Gold und 40 % Dollar. Gleiche aus, wenn es mehr als 5 Punkte abweicht. Höchstens 1.000 Dollar am Tag, bis Ende März.",
		frameTitle: "Daraus wird",
		frame: [
			["Paar", "Gold / US-Dollar"],
			["Ziel", "60 % Gold, 40 % US-Dollar"],
			["Auslöser", "Abweichung über 5 Punkte"],
			["Höchstens am Tag", "1.000 US-Dollar"],
			["Abstand zum Kurs", "höchstens 0,5 %"],
			["Gilt bis", "31. März"],
		],
		frameAction: "Mit Sicherheitsschlüssel bestätigen",
		logTitle: "Was der Bot getan hat",
		log: [
			{
				what: "Gold verkauft",
				amount: "400 US-Dollar",
				state: "unterschrieben",
			},
			{
				what: "Gold gekauft",
				amount: "350 US-Dollar",
				state: "unterschrieben",
			},
			{
				what: "Tausch abgelehnt",
				amount: "900 US-Dollar",
				state: "über der Grenze am Tag",
			},
		],
		stopAction: "Bot stoppen",
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
		key: "handeln-prompt",
		title: "Prompt wird zu Regeln",
		text: "Eine KI übersetzt deinen Prompt in feste Regeln: Paar, Ziel, Auslöser, Grenzen und Laufzeit. Sie liest nur den Prompt und den Kurs aus eigener Quelle, handeln oder Regeln ändern kann sie nicht.",
		status: "planned",
		anchors: [
			{ framework: "DORA", point: "Regeln vor dem Einsatz testen" },
			{ framework: "MiCAR", point: "Keine Marktmanipulation (Art. 91)" },
			{
				framework: "AI Act",
				point: "Hinweis, dass eine KI mitwirkt (Art. 50)",
			},
		],
	},
	{
		key: "handeln-rahmen",
		title: "Regeln per Sicherheitsschlüssel",
		text: "Eine Inhaber:in bestätigt die Regeln aus dem Prompt mit dem Sicherheitsschlüssel. Der Signer zählt sie wie eine Vollmacht; mehr darf der Bot nie, und ein neuer Prompt braucht eine neue Bestätigung.",
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
