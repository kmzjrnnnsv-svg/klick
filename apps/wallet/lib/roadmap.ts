// Öffentlicher Fahrplan von both.money (/roadmap): was heute läuft, was als
// Nächstes kommt, die Phasen und die Infrastruktur mit Hardware-Richtwerten.
// Für Investor:innen und Entwickler:innen; jede Zeile nennt, auf welche
// Pflicht sie einzahlt. Nur Pläne, keine Termine und keine Zusagen; keine
// internen Angaben (Adressen, Ports, Dienstnamen). Betreiber-Details stehen
// in docs/betrieb/knoten-hardware.md. Rechtliche Einordnung vor der
// Bewerbung prüfen (CLAUDE.md, Offene Punkte).

export type RoadmapStatus = "live" | "ready" | "next" | "planned" | "locked";

export const STATUS_LABEL: Record<RoadmapStatus, string> = {
	live: "läuft",
	ready: "bereit",
	next: "als Nächstes",
	planned: "geplant",
	locked: "gesperrt bis zur Erlaubnis",
};

// Rahmenwerk + Stichwort, auf das ein Schritt einzahlt
export type Anchor = { framework: string; point: string };

export type RoadmapItem = {
	key: string;
	title: string;
	text: string;
	status: RoadmapStatus;
	anchors: Anchor[];
	requires?: string;
};

export const INTRO = {
	title: "Fahrplan",
	lead: "Was both.money heute kann, was als Nächstes kommt und welche Infrastruktur dafür nötig ist. Zu jedem Schritt steht, auf welche Pflicht er einzahlt.",
	status:
		"Stand Oktober 2026. Testphase im Bitcoin-Testnetz Signet, kein echtes Geld.",
	note: "Diese Seite beschreibt Pläne, keine Zusagen und keine Termine. Keine Rechtsberatung: Ob eine Maßnahme reicht, entscheiden Prüfer:in und Aufsicht.",
} as const;

export const TODAY: readonly RoadmapItem[] = [
	{
		key: "knoten",
		title: "Eigener Bitcoin-Knoten",
		text: "both.money liest das Bitcoin-Testnetz nur über einen eigenen Knoten. Keine Explorer, keine fremden Schnittstellen.",
		status: "live",
		anchors: [
			{
				framework: "DORA",
				point: "Abhängigkeit von IKT-Drittanbietern begrenzen",
			},
			{ framework: "MiCAR", point: "Bestände aus eigener, geprüfter Quelle" },
		],
	},
	{
		key: "sanktionen",
		title: "Sanktionsprüfung vor der Gutschrift",
		text: "Jeder neue Eingang wird gegen die Kryptoadressen der OFAC-Liste geprüft, bevor er zählt. Ein Treffer bleibt eingefroren und wird in Klick zum Verdachtsfall.",
		status: "live",
		anchors: [
			{ framework: "Sanktionsrecht", point: "Abgleich mit Sanktionslisten" },
			{ framework: "GwG", point: "Auffälligkeiten prüfen und dokumentieren" },
		],
	},
	{
		key: "signer",
		title: "Signer ohne Netz, Zeremonie mit Wortprüfung",
		text: "Hot-Schlüssel liegen in einem eigenen Prozess ohne Netzzugang. Er führt ein Journal mit Hash-Kette; die Wiederherstellungswörter gibt es nur auf Papier, an zwei Orten.",
		status: "live",
		anchors: [
			{ framework: "CCSS", point: "Schlüssel erzeugen und aufbewahren" },
			{ framework: "DORA", point: "Schutz kritischer IKT-Systeme" },
		],
	},
	{
		key: "freigabe",
		title: "Freigabe-Seite für Sicherheitsschlüssel",
		text: "Auszahlungen werden auf approve.both.money bestätigt. Die Seite zeigt den Text der Auszahlung selbst an; gezählt werden nur Hardware-Sicherheitsschlüssel, keine Passwörter oder synchronisierten Passkeys.",
		status: "ready",
		anchors: [
			{ framework: "CCSS", point: "Freigabe durch mehrere Schlüssel" },
			{ framework: "DORA", point: "Starke Authentifizierung" },
		],
	},
	{
		key: "zugang",
		title: "Zugang nur per Einladung und Passkey",
		text: "Konten entstehen nur per Einladung. Anmeldung mit Passkey und Nutzerverifikation; Wallet-Daten sind nur 15 Minuten nach dem Entsperren sichtbar.",
		status: "live",
		anchors: [{ framework: "DORA", point: "Zugriffssteuerung" }],
	},
	{
		key: "protokoll",
		title: "Protokoll mit Hash-Kette, Verschlüsselung je Organisation",
		text: "Jede Änderung steht in einem Protokoll, das je Organisation verkettet ist. Sensible Felder sind mit einem eigenen Schlüssel je Organisation verschlüsselt.",
		status: "live",
		anchors: [
			{ framework: "DORA", point: "Protokollierung" },
			{ framework: "DSGVO", point: "Sicherheit der Verarbeitung" },
		],
	},
	{
		key: "export",
		title: "Compliance-Export an Klick",
		text: "Bewegungen, Konten, Tagesbestände mit Blockhöhe und Hash, Schlüssel-Zeremonien und Auffälligkeiten gehen automatisch an die Compliance-App Klick. Dort werden sie zu Nachweisen, Aufgaben, Vorfällen oder Verdachtsfällen.",
		status: "live",
		anchors: [
			{ framework: "MiCAR", point: "Tägliche Abstimmung der Bestände" },
			{ framework: "DORA", point: "Vorfälle erfassen und einstufen" },
		],
	},
	{
		key: "sperre",
		title: "Sperre für Kundengelder",
		text: "Hot-Konten gibt es nur für eigene Bestände des Betreibers. Verwahrung für Kund:innen bleibt technisch gesperrt, bis eine Erlaubnis eingetragen ist.",
		status: "live",
		anchors: [{ framework: "MiCAR", point: "Verwahrung nur mit Erlaubnis" }],
	},
];

// Reihenfolge, keine Termine
export const NEXT: readonly RoadmapItem[] = [
	{
		key: "senden",
		title: "Sicherheitsschlüssel registrieren, Senden freischalten",
		text: "Zwei Hardware-Sicherheitsschlüssel einrichten. Danach sind Auszahlungen im Testnetz frei: neue Zieladressen erst nach einer Wartezeit, eine Pause vor dem Signieren, Grenzen je Auszahlung und Tag. Mit einer zweiten Person gilt das Vier-Augen-Prinzip.",
		status: "next",
		anchors: [
			{ framework: "CCSS", point: "Freigabe durch mehrere Schlüssel" },
			{ framework: "DORA", point: "Kontrollierte Freigaben" },
		],
	},
	{
		key: "ethereum",
		title: "Ethereum-Knoten",
		text: "Ein größerer Knoten-Server für das Ethereum-Testnetz Sepolia (Stufe 1, siehe Infrastruktur). Damit kommen Ethereum, USDC und EURC im Testnetz und Kurse aus Chainlink-Preisfeeds über den eigenen Knoten dazu.",
		status: "next",
		anchors: [
			{ framework: "DORA", point: "Eigene Infrastruktur statt Anbieter" },
		],
	},
	{
		key: "gegenprobe",
		title: "Gegenprobe der Kette",
		text: "both.money vergleicht regelmäßig den Block-Hash einer sicher bestätigten Höhe mit einer unabhängigen öffentlichen Quelle. Weicht er ab, stoppen Auszahlungen und es gibt eine Sicherheitsmeldung. Abgefragt wird nur der Block, nie eine eigene Adresse.",
		status: "next",
		anchors: [
			{ framework: "DORA", point: "Anomalien erkennen" },
			{ framework: "CCSS", point: "Verlässliche Daten der Kette" },
		],
	},
	{
		key: "zweiter-knoten",
		title: "Zweiter Knoten je Kette",
		text: "Ein zweiter, unabhängiger Knoten bei einem anderen Anbieter. both.money gleicht beide laufend ab; der Tagesabschluss gilt nur, wenn beide denselben Bestand melden.",
		status: "planned",
		anchors: [
			{ framework: "DORA", point: "Keine einzelne Fehlerquelle" },
			{ framework: "MiCAR", point: "Abstimmung aus zwei Quellen" },
		],
	},
	{
		key: "eigener-server",
		title: "Eigener Server für both.money",
		text: "App, Datenbank, Signer und Freigabe-Seite ziehen auf eigene Maschinen, getrennt von Klick. Am Code ändert sich dafür nichts.",
		status: "planned",
		anchors: [{ framework: "DORA", point: "Trennung von Systemen" }],
	},
];

export const PHASES: readonly RoadmapItem[] = [
	{
		key: "phase-3",
		title: "Phase 3 · Bitcoin cold und echtes Netz",
		text: "Kalte Bestände mit Multisig: Auszahlungen werden vorbereitet und auf mehreren Hardware-Wallets unterschrieben, both.money sieht nie einen privaten Schlüssel. Danach öffnet das echte Bitcoin-Netz, zuerst mit kleinen Grenzen.",
		status: "planned",
		requires: "Abnahme im Testnetz",
		anchors: [
			{ framework: "MiCAR", point: "Schutz der Kryptowerte (Art. 70)" },
			{ framework: "CCSS", point: "Schlüsselverwaltung und Sicherung" },
		],
	},
	{
		key: "phase-4",
		title: "Phase 4 · Ethereum Safe, HSM, eigener Signer-Server",
		text: "Ethereum-Bestände in einem Safe, einem Multisig-Vertrag. Der Signer zieht auf einen eigenen Server, die Schlüssel in ein Hardware-Sicherheitsmodul (HSM).",
		status: "planned",
		anchors: [
			{ framework: "CCSS", point: "Schlüssel in geschützter Hardware" },
			{ framework: "DORA", point: "Schutz und Trennung kritischer Systeme" },
		],
	},
	{
		key: "phase-s",
		title: "Phase S · Sicherheitsstandard",
		text: "Ausrichtung auf die aktuelle Fassung des CryptoCurrency Security Standard, Transportverschlüsselung mit Post-Quanten-Verfahren, öffentlich nachprüfbare Bestandsnachweise (Proof of Reserves) und regelmäßige Resilienz-Tests.",
		status: "planned",
		anchors: [
			{ framework: "CCSS", point: "Sicherheitsniveau der Verwahrung" },
			{ framework: "DORA", point: "Tests der digitalen Resilienz" },
		],
	},
	{
		key: "phase-k",
		title: "Phase K · Verwahrung für Kund:innen",
		text: "Identitätsprüfung der Kund:innen, Travel Rule bei Überweisungen, Transaktionsmonitoring, Kundenregister mit Positionsauszügen, eine eigene Signer-Instanz je Kunden-Organisation und Steuermeldungen nach DAC8.",
		status: "locked",
		requires: "Erlaubnis als Anbieter von Krypto-Dienstleistungen (CASP)",
		anchors: [
			{ framework: "MiCAR", point: "Erlaubnis und Verwahrung (Art. 75)" },
			{ framework: "GwG / AMLR", point: "Sorgfaltspflichten und Monitoring" },
			{ framework: "TFR", point: "Travel Rule" },
			{ framework: "DAC8", point: "Meldungen an die Steuerbehörden" },
		],
	},
	{
		key: "phase-5",
		title: "Phase 5 · Tausch über dezentrale Börsen",
		text: "Tausch zwischen Kryptowerten direkt aus der Wallet, mit denselben Freigaben und Grenzen wie bei Auszahlungen. Für eigene Bestände; für Kund:innen nur mit Erlaubnis.",
		status: "planned",
		anchors: [
			{
				framework: "MiCAR",
				point: "Tausch als Dienstleistung nur mit Erlaubnis",
			},
			{ framework: "Sanktionsrecht", point: "Prüfung der Gegenseite" },
		],
	},
];

// Infrastruktur und Hardware (Richtwerte)
export const NODE_BASICS = {
	title: "Was ein Knoten ist",
	paragraphs: [
		"Eine Kryptowährung hat keinen zentralen Server. Das Netz besteht aus vielen tausend Rechnern, den Knoten. Jeder hält eine Kopie des gemeinsamen Kontobuchs, prüft jede neue Transaktion und jeden neuen Block nach denselben Regeln und gibt sie weiter.",
		"both.money betreibt eigene Knoten, statt einen Anbieter zu fragen. Ein Knoten hält keine Schlüssel und kann kein Geld bewegen; unterschrieben wird nur im Signer.",
	],
} as const;

export type Reason = { title: string; text: string; anchor: string };

export const WHY_OWN: readonly Reason[] = [
	{
		title: "Selbst geprüft",
		text: "Der eigene Knoten rechnet jeden Block nach. Ein fremder Anbieter könnte sich irren oder manipuliert sein.",
		anchor: "MiCAR · verlässliche Bestände",
	},
	{
		title: "Vertraulich",
		text: "Wer bei einem Anbieter nach Adressen fragt, verrät ihm, welche Adressen dem Unternehmen gehören und wie viel darauf liegt.",
		anchor: "DSGVO · Geschäftsgeheimnis",
	},
	{
		title: "Unabhängig",
		text: "Fällt ein Anbieter aus oder sperrt den Zugang, steht die Wallet still. Eigene Knoten begrenzen diese Abhängigkeit.",
		anchor: "DORA · IKT-Drittanbieter",
	},
	{
		title: "Nachweisbar",
		text: "Der Tagesabschluss nennt Blockhöhe und Block-Hash des eigenen Knotens. Jeder Bestand lässt sich daran nachprüfen.",
		anchor: "MiCAR · Abstimmung",
	},
];

export const SPLIT = {
	title: "Ein Server je Währung?",
	lead: "Nein. Die Knoten halten keine Schlüssel, deshalb dürfen mehrere Ketten auf derselben Maschine laufen. Getrennt wird nach drei anderen Gesichtspunkten:",
	points: [
		{
			title: "Testnetz und echtes Netz",
			text: "Getrennte Server, damit Tests nie den Betrieb stören und ein Fehler im Testnetz kein echtes Geld trifft.",
		},
		{
			title: "Speicher und Plattenleistung",
			text: "Eine neue Kette kommt auf einen vorhandenen Server, solange Platte und Arbeitsspeicher reichen. Erst sehr große Ketten bekommen eine eigene Maschine.",
		},
		{
			title: "Ausfallsicherheit",
			text: "Für das echte Netz ein zweiter, unabhängiger Knoten je Kette bei einem anderen Anbieter, laufend gegengeprüft.",
		},
	],
	note: "Signer, App und Knoten bleiben immer getrennte Maschinen.",
} as const;

export type NodeSpec = {
	chain: string;
	network: string;
	disk: string;
	ram: string;
	cpu: string;
	when: string;
};

export const NODE_SPECS: readonly NodeSpec[] = [
	{
		chain: "Bitcoin",
		network: "Testnetz Signet",
		disk: "unter 20 GB",
		ram: "2 GB",
		cpu: "1–2 Kerne",
		when: "läuft heute",
	},
	{
		chain: "Bitcoin",
		network: "Echtes Netz, mit Transaktionsindex",
		disk: "ca. 0,8–1 TB, wächst um ca. 60–80 GB im Jahr",
		ram: "4–8 GB",
		cpu: "2–4 Kerne",
		when: "Phase 3",
	},
	{
		chain: "Ethereum",
		network: "Testnetz Sepolia, Archivknoten",
		disk: "mehrere hundert GB bis ca. 1 TB",
		ram: "16 GB",
		cpu: "4 Kerne oder mehr",
		when: "Stufe 1",
	},
	{
		chain: "Ethereum",
		network: "Echtes Netz, Archivknoten",
		disk: "ca. 3–3,5 TB, wächst",
		ram: "32–64 GB",
		cpu: "8 Kerne",
		when: "Phase 4",
	},
];

export const SPEC_DISCLAIMER =
	"Richtwerte, Stand Oktober 2026. Die Ketten wachsen laufend; vor jeder Bestellung gegen die Angaben der jeweiligen Software prüfen.";

export const SPEC_NOTES: readonly { title: string; text: string }[] = [
	{
		title: "Zwei Programme bei Ethereum",
		text: "Seit Proof of Stake braucht Ethereum zwei Programme: eines führt die Transaktionen aus (Reth), eines folgt dem Konsens (Lighthouse). Deshalb mehr Arbeitsspeicher als bei Bitcoin.",
	},
	{
		title: "Warum Archivknoten",
		text: "both.money liest Zahlungen auch aus Verträgen nach. Für ältere Blöcke geht das nur mit vollständigem Verlauf. Werden Konten erst ab ihrer Anlage beobachtet, reicht ein normaler Knoten mit etwa halb so viel Platte.",
	},
	{
		title: "Schnelle Platten (NVMe)",
		text: "Auf langsamen Platten dauert der erste Abgleich von Ethereum Tage bis Wochen. Die Kettendaten lassen sich jederzeit neu laden; eine Spiegelung der Platten ist dafür nicht nötig.",
	},
	{
		title: "Datenverkehr",
		text: "Ein Ethereum-Knoten im echten Netz bewegt mehrere Terabyte im Monat. Dedizierte Server ohne Volumengrenze sind dafür meist günstiger als Cloud-Server.",
	},
	{
		title: "Erreichbarkeit",
		text: "Die Knoten antworten nur dem App-Server über einen verschlüsselten Tunnel. Nach außen offen sind nur die Verbindungen zu anderen Knoten im Netz.",
	},
];

export type Tier = {
	key: string;
	title: string;
	when: string;
	spec: string;
	runs: string;
	why: string;
};

export const TIERS: readonly Tier[] = [
	{
		key: "stufe-1",
		title: "Stufe 1 · Knoten Test",
		when: "als Nächstes",
		spec: "8 Kerne, 64 GB Arbeitsspeicher, 2 × 1 TB NVMe",
		runs: "Bitcoin Signet und Ethereum Sepolia",
		why: "Ethereum im Testnetz, Kurse aus eigener Quelle und die Abnahme vor dem echten Netz.",
	},
	{
		key: "stufe-2",
		title: "Stufe 2 · Knoten Prod",
		when: "mit dem echten Netz",
		spec: "8–16 Kerne, 64–128 GB Arbeitsspeicher, ca. 6–8 TB NVMe nutzbar",
		runs: "Bitcoin und Ethereum im echten Netz",
		why: "Echtes Geld nur über eigene, ausreichend große Knoten.",
	},
	{
		key: "redundanz",
		title: "Zweiter Prod-Knoten",
		when: "mit dem echten Netz",
		spec: "wie Stufe 2, bei einem anderen Anbieter",
		runs: "dieselben Ketten, unabhängig betrieben",
		why: "Gegenprobe und Ausfallsicherheit: Weicht ein Knoten ab, stoppen Auszahlungen.",
	},
	{
		key: "signer",
		title: "Eigener Signer-Server mit HSM",
		when: "Phase 4",
		spec: "eigene Maschine ohne Verbindung nach außen, Hardware-Sicherheitsmodul",
		runs: "nur der Signer",
		why: "Schlüssel getrennt von App und Knoten, geschützt in Hardware.",
	},
];

export const LIMITS = {
	title: "Was ein Knoten nicht kann",
	points: [
		"Er bewegt kein Geld, denn er hat keine Schlüssel. Wer einen Knoten-Server übernimmt, kommt nicht an die Bestände.",
		"Er kann falsch berichten, wenn er manipuliert oder vom Netz abgeschnitten ist. Dagegen helfen die Prüfung der richtigen Kette, die Gegenprobe mit einer unabhängigen Quelle und später ein zweiter Knoten.",
	],
} as const;

export const SECTIONS = [
	{ id: "heute", label: "Heute" },
	{ id: "als-naechstes", label: "Als Nächstes" },
	{ id: "phasen", label: "Phasen" },
	{ id: "infrastruktur", label: "Infrastruktur" },
] as const;
