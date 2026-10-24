// both.money · Bestätigungsseite (approve.both.money) — gemeinsamer Kern.
//
// Ohne Abhängigkeiten. Liest den kanonischen Text einer Absicht selbst und
// rechnet die Challenge im Browser (SHA-256), statt einer Anzeige aus der App
// zu vertrauen. Muss exakt zu lib/wallet/core/intent.ts passen; Vitest lädt
// diese Datei mit denselben Testvektoren (tests/confirm-static.test.ts).

export const PREFIX = "klick-wallet/v1";

// Stellen und Verträge je Netz — muss lib/wallet/core/assets.ts entsprechen
export const ASSETS = {
	bitcoin_signet: { BTC: { decimals: 8, contract: null } },
	bitcoin_mainnet: { BTC: { decimals: 8, contract: null } },
	ethereum_sepolia: {
		ETH: { decimals: 18, contract: null },
		USDC: {
			decimals: 6,
			contract: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
		},
		EURC: {
			decimals: 6,
			contract: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
		},
	},
	ethereum_mainnet: {
		ETH: { decimals: 18, contract: null },
		USDC: {
			decimals: 6,
			contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		},
		EURC: {
			decimals: 6,
			contract: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
		},
	},
};

export const NETWORKS = {
	bitcoin_signet: {
		label: "Bitcoin Signet (Testnetz)",
		chainId: null,
		live: false,
		fee: "BTC",
		feeDecimals: 8,
	},
	bitcoin_mainnet: {
		label: "Bitcoin (echtes Netz)",
		chainId: null,
		live: true,
		fee: "BTC",
		feeDecimals: 8,
	},
	ethereum_sepolia: {
		label: "Ethereum Sepolia (Testnetz)",
		chainId: 11155111,
		live: false,
		fee: "ETH",
		feeDecimals: 18,
	},
	ethereum_mainnet: {
		label: "Ethereum (echtes Netz)",
		chainId: 1,
		live: true,
		fee: "ETH",
		feeDecimals: 18,
	},
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX128 = /^[0-9a-f]{32}$/;
const UINT = /^(0|[1-9][0-9]{0,39})$/;
const POSINT = /^[1-9][0-9]{0,39}$/;
const SECONDS = /^[1-9][0-9]{8,10}$/;
const BTC_ADDR = {
	tb: /^tb1[02-9ac-hj-np-z]{8,87}$/,
	bc: /^bc1[02-9ac-hj-np-z]{8,87}$/,
};
const ETH_ADDR = /^0x[0-9a-fA-F]{40}$/;
const NONE = "-";

export class IntentFormatError extends Error {
	constructor(field) {
		super(`intent_${field}`);
		this.field = field;
	}
}

function check(ok, field) {
	if (!ok) throw new IntentFormatError(field);
}

// Text → Felder (gleiche Regeln wie der Signer); wirft bei jeder Abweichung
export function parseIntent(text) {
	check(
		typeof text === "string" &&
			/^[\x21-\x7e]+$/.test(text) &&
			text.length <= 600,
		"text",
	);
	const f = text.split("|");
	check(f.length === 15 && f[0] === PREFIX, "format");
	const [
		,
		kind,
		orgId,
		accountId,
		network,
		chainId,
		asset,
		amount,
		destination,
		activeSince,
		feeCap,
		initiator,
		intentId,
		nonce,
		expiresAt,
	] = f;
	check(kind === "payout" || kind === "whitelist", "kind");
	check(UUID.test(orgId), "org");
	check(UUID.test(initiator), "initiator");
	check(HEX128.test(intentId), "id");
	check(HEX128.test(nonce), "nonce");
	check(SECONDS.test(expiresAt), "expires");
	const net = NETWORKS[network];
	check(Boolean(net) && Object.hasOwn(NETWORKS, network), "network");
	check(
		net.chainId === null ? chainId === NONE : chainId === String(net.chainId),
		"chain",
	);
	if (network.startsWith("bitcoin"))
		check(BTC_ADDR[net.live ? "bc" : "tb"].test(destination), "destination");
	else check(ETH_ADDR.test(destination), "destination");
	if (kind === "payout") {
		check(UUID.test(accountId), "account");
		check(Object.hasOwn(ASSETS[network], asset), "asset");
		check(POSINT.test(amount), "amount");
		check(UINT.test(feeCap), "fee");
		check(SECONDS.test(activeSince), "active");
	} else {
		check(
			accountId === NONE &&
				asset === NONE &&
				amount === NONE &&
				feeCap === NONE &&
				activeSince === NONE,
			"whitelist",
		);
	}
	return {
		kind,
		orgId,
		accountId: accountId === NONE ? null : accountId,
		network,
		chainId: chainId === NONE ? null : Number(chainId),
		asset: asset === NONE ? null : asset,
		amount: amount === NONE ? null : amount,
		destination,
		destinationActiveSince: activeSince === NONE ? null : Number(activeSince),
		feeCap: feeCap === NONE ? null : feeCap,
		initiator,
		intentId,
		nonce,
		expiresAt: Number(expiresAt),
	};
}

// Basiseinheiten → Dezimaltext in deutscher Schreibweise, exakt (kein Float)
export function formatUnits(value, decimals) {
	check(UINT.test(value), "amount");
	const padded = value.padStart(decimals + 1, "0");
	const whole = padded.slice(0, padded.length - decimals);
	const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return frac ? `${grouped},${frac}` : grouped;
}

// Adresse in Vierergruppen (zum Vergleichen mit dem Gegenüber)
export const chunks = (s) => s.match(/.{1,4}/g) ?? [];

const enc = new TextEncoder();

const hex = (buf) =>
	[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const hexBytes = (h) => {
	check(/^([0-9a-f]{2})+$/.test(h), "hex");
	return new Uint8Array(h.match(/../g).map((x) => Number.parseInt(x, 16)));
};

export const b64u = {
	encode(bytes) {
		let s = "";
		for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
		return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	},
	decode(s) {
		check(/^[A-Za-z0-9_-]*$/.test(s), "b64u");
		const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
		return Uint8Array.from(bin, (c) => c.charCodeAt(0));
	},
};

// Challenge = SHA-256 über den Text (wie intentChallenge im Signer)
export async function challengeOf(text) {
	return new Uint8Array(
		await crypto.subtle.digest("SHA-256", enc.encode(text)),
	);
}

export async function sha256Hex(bytes) {
	return hex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(secretHex, msg) {
	const key = await crypto.subtle.importKey(
		"raw",
		hexBytes(secretHex),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

// Einrichtung: Challenge und MAC aus dem Geheimnis des Links (wie
// enrolChallenge/enrolMac in signer/webauthn.ts)
export const enrolChallenge = (secretHex, enrolId) =>
	hmac(secretHex, `klick-enrol/v1|challenge|${enrolId}`);

export async function enrolMac(secretHex, p) {
	const msg = `klick-enrol/v1|${p.enrolId}|${p.credId}|${await sha256Hex(p.clientDataJSON)}|${await sha256Hex(p.authenticatorData)}|${await sha256Hex(p.spki)}`;
	return hmac(secretHex, msg);
}

// Fragment lesen und sofort aus der Adresszeile entfernen
export function takeFragment() {
	const params = new URLSearchParams(location.hash.slice(1));
	history.replaceState(null, "", location.pathname);
	return params;
}

export const apiBase = () =>
	document.querySelector('meta[name="klick-api"]')?.getAttribute("content") ??
	"";

// Element mit Text bauen (nie HTML-Strings — Trusted Types sind Pflicht)
export function el(tag, text, cls) {
	const e = document.createElement(tag);
	if (text !== undefined && text !== null) e.textContent = String(text);
	if (cls) e.className = cls;
	return e;
}

export const fmtTime = (sec) =>
	new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	}).format(new Date(sec * 1000));
