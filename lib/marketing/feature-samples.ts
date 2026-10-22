// Beispieldaten für die Ergebnis-Blätter auf /funktionen. Erfunden, aber in
// sich stimmig: Summen gehen auf, Fristen folgen der Rechenregel in
// lib/compliance/incident.ts (DORA) und lib/custody/reconcile.ts.

export const SAMPLE_ORG = "Beispiel Pay GmbH";

export const SOA_SAMPLE = {
	title: "Erklärung zur Anwendbarkeit",
	framework: "ISO/IEC 27001:2022, Anhang A",
	asOf: "22.10.2026",
	summary: [
		{ label: "Maßnahmen", value: "93" },
		{ label: "anwendbar", value: "81" },
		{ label: "umgesetzt", value: "64" },
		{ label: "nicht anwendbar", value: "12" },
	],
	rows: [
		{
			code: "A.5.1",
			title: "Informationssicherheitsrichtlinien",
			state: "umgesetzt",
			proof: "POL-01 v1.2",
		},
		{
			code: "A.5.7",
			title: "Informationen über Bedrohungen",
			state: "in Arbeit",
			proof: "CC-THR-01",
		},
		{
			code: "A.5.23",
			title: "Sicherheit bei Cloud-Diensten",
			state: "umgesetzt",
			proof: "Testat Rechenzentrum 2026",
		},
		{
			code: "A.7.4",
			title: "Physische Sicherheitsüberwachung",
			state: "nicht anwendbar",
			proof: "kein eigenes Rechenzentrum",
		},
		{
			code: "A.8.24",
			title: "Verwendung von Kryptografie",
			state: "umgesetzt",
			proof: "KRY-02 v2.0",
		},
		{
			code: "A.8.28",
			title: "Sichere Programmierung",
			state: "in Arbeit",
			proof: "Scan-Import 21.10.",
		},
	],
} as const;

export const PACKAGE_SAMPLE = {
	file: "pruefungspaket-2026-10-22.zip",
	exportId: "Export EX-2026-0142",
	files: [
		{ name: "MANIFEST.json", size: "4 KB", hash: "9c1e…44b0" },
		{ name: "SHA256SUMS", size: "2 KB", hash: "—" },
		{ name: "erklaerung-anwendbarkeit.md", size: "38 KB", hash: "3f9a…c21e" },
		{ name: "luecken.csv", size: "12 KB", hash: "b04d…7e19" },
		{ name: "controls.csv", size: "21 KB", hash: "e88c…0a52" },
		{ name: "risiken.csv", size: "9 KB", hash: "51f2…d3c8" },
		{ name: "dokumente/POL-01-v1.2.md", size: "16 KB", hash: "c7a0…92fe" },
		{ name: "nachweise/index.csv", size: "7 KB", hash: "2d6b…e105" },
		{ name: "vorfaelle.csv", size: "3 KB", hash: "a913…5b7d" },
		{ name: "protokoll-auszug.csv", size: "64 KB", hash: "07ee…c6a4" },
	],
	total: "176 KB",
} as const;

// DORA: Erstmeldung = min(Einstufung + 4 h, Kenntnis + 24 h);
// Zwischenbericht = Abgabe Erstmeldung + 72 h; Abschluss = + 1 Monat.
export const INCIDENT_SAMPLE = {
	code: "VF-2026-007",
	title: "Ausfall der Zahlungsabwicklung",
	regime: "DORA · schwerwiegend",
	facts: [
		{ label: "Kenntnis", value: "22.10. 08:40" },
		{ label: "eingestuft", value: "22.10. 09:12" },
	],
	clocks: [
		{
			label: "Erstmeldung",
			due: "22.10. 13:12",
			rule: "4 h nach Einstufung, spätestens 24 h nach Kenntnis",
			state: "abgegeben 12:30",
			done: true,
		},
		{
			label: "Zwischenbericht",
			due: "25.10. 12:30",
			rule: "72 h nach Abgabe der Erstmeldung",
			state: "läuft",
			done: false,
		},
		{
			label: "Abschlussbericht",
			due: "25.11. 12:30",
			rule: "1 Monat nach dem Zwischenbericht",
			state: "vorläufig",
			done: false,
		},
	],
} as const;

// Abstimmung: Differenz = on-chain − Kundenbuch; Unterdeckung über der
// Toleranz → Abweichung.
export const RECON_SAMPLE = {
	day: "21.10.2026",
	rows: [
		{
			symbol: "BTC",
			onChain: "12,28",
			ledger: "12,48",
			diff: "−0,2",
			state: "Unterdeckung",
		},
		{
			symbol: "ETH",
			onChain: "318,2",
			ledger: "318,2",
			diff: "0",
			state: "gedeckt",
		},
		{
			symbol: "USDC",
			onChain: "1.250.000",
			ledger: "1.249.999,5",
			diff: "+0,5",
			state: "in Toleranz",
		},
	],
	followUp: "Abweichung NC-2026-004 angelegt, Inhaber:innen benachrichtigt",
	people: "Erfasst: M. Beispiel 09:05 · Geprüft: J. Weber 10:12",
} as const;
