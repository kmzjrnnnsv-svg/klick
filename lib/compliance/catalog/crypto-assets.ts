// Kryptowerte, auf die sich die Dienste beziehen (MiCAR Art. 62(2)(q);
// Art. 48 ff.: EMT nur von Kredit- oder E-Geld-Instituten mit Whitepaper).
// Seed aus Businessplan 5.2. Zulassungsstand Oktober 2026 — vor Aufnahme
// gegen das ESMA-Register prüfen. Kein Rechtsrat.

export type CatalogCryptoAsset = {
	symbol: string;
	name: string;
	issuer: string | null;
	type: "emt" | "art" | "native" | "other";
	issuerAuthorisation: string | null;
	whitepaperRef: string | null;
	micarStatus: "authorised" | "not_authorised" | "pending";
	networks: readonly string[];
	accepted: boolean;
	notes?: string;
};

export const CRYPTO_ASSETS: readonly CatalogCryptoAsset[] = [
	{
		symbol: "EURC",
		name: "Euro Coin",
		issuer: "Circle Internet Financial Europe SAS",
		type: "emt",
		issuerAuthorisation:
			"E-Geld-Institut, ACPR (Frankreich), seit 07/2024 MiCAR-konform",
		whitepaperRef: "EURC-Whitepaper (ESMA-Register, Titel IV)",
		micarStatus: "authorised",
		networks: ["Ethereum", "Solana", "Base", "Avalanche"],
		accepted: true,
		notes: "Primäres Euro-Zahlungsmittel; 1:1 Reserve bei EU-Kreditinstituten.",
	},
	{
		symbol: "USDC",
		name: "USD Coin",
		issuer: "Circle Internet Financial Europe SAS",
		type: "emt",
		issuerAuthorisation: "E-Geld-Institut, ACPR (Frankreich)",
		whitepaperRef: "USDC-Whitepaper (ESMA-Register, Titel IV)",
		micarStatus: "authorised",
		networks: ["Ethereum", "Solana", "Base", "Polygon", "Arbitrum"],
		accepted: true,
		notes: "USD-EMT; OFAC-Exposure und Fremdwährungsrisiko (BTR 3) beachten.",
	},
	{
		symbol: "EURAU",
		name: "AllUnity Euro",
		issuer: "AllUnity GmbH (DWS, Flow Traders, Galaxy)",
		type: "emt",
		issuerAuthorisation: "E-Geld-Institut, BaFin (Erlaubnis 07/2025)",
		whitepaperRef: "EURAU-Whitepaper (BaFin/ESMA-Register)",
		micarStatus: "authorised",
		networks: ["Ethereum"],
		accepted: true,
		notes: "Deutscher Euro-EMT; Emittent in Frankfurt.",
	},
	{
		symbol: "BTC",
		name: "Bitcoin",
		issuer: null,
		type: "native",
		issuerAuthorisation: null,
		whitepaperRef: null,
		micarStatus: "not_authorised",
		networks: ["Bitcoin", "Lightning"],
		accepted: true,
		notes:
			"Kein Emittent, kein Whitepaper-Erfordernis (Art. 4(3)(a) MiCAR); Annahme nur über Lightning mit sofortigem Umtausch — Marktpreisrisiko BTR 3.",
	},
	{
		symbol: "USDT",
		name: "Tether USD",
		issuer: "Tether Limited",
		type: "emt",
		issuerAuthorisation: null,
		whitepaperRef: null,
		micarStatus: "not_authorised",
		networks: ["Ethereum", "Tron", "Solana"],
		accepted: false,
		notes:
			"Kein zugelassener EMT-Emittent in der EU — Angebot/Tausch in der EU nicht zulässig (Art. 48); Delistings seit 2025.",
	},
	{
		symbol: "AED-EMT",
		name: "Dirham-Token (Emittent offen)",
		issuer: null,
		type: "emt",
		issuerAuthorisation: null,
		whitepaperRef: null,
		micarStatus: "pending",
		networks: [],
		accepted: false,
		notes:
			"Korridor VAE (Businessplan 23): nur mit EU-zugelassenem Emittenten oder über Fiat-Settlement beim Partner.",
	},
];
