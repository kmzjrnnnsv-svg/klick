import { sha256 } from "@noble/hashes/sha2.js";
import { checkAddress } from "./address";
import { type AssetCode, assetOf } from "./assets";
import { NETWORKS, WALLET_NETWORKS, type WalletNetwork } from "./networks";

// Vollmacht (Härtung W): eine Inhaber:in erlaubt einer Person der Bedienung,
// bis zu einem Betrag in einem Asset an feste Zieladressen in einem Zeitraum
// auszuzahlen. Unterschrieben per Sicherheitsschlüssel über diesen
// kanonischen Text (Challenge = SHA-256 des Textes) — wie eine Absicht
// (intent.ts): feste Formate, kein Freitext, `|` und Umbrüche unmöglich,
// Rundreise ergibt exakt denselben Text. Rein und ohne Abhängigkeit außer
// @noble/hashes, damit der Signer dieselbe Prüfung nutzen kann (Schritt 2).

export const MANDATE_PREFIX = "both-mandate/v1";
export const MANDATE_MAX_DAYS = 90;
export const MANDATE_MAX_DESTINATIONS = 20;

export type Mandate = {
	orgId: string;
	mandateId: string;
	// Person der Bedienung, die auszahlen darf
	grantee: string;
	network: WalletNetwork;
	// nur Ethereum (EIP-155)
	chainId: number | null;
	asset: AssetCode;
	// Basiseinheiten (Satoshi, Wei, 10⁻⁶)
	perPayout: bigint;
	total: bigint;
	// Zieladressen in Normalform, sortiert, ohne Dopplungen
	destinations: string[];
	// Unix-Sekunden, gültig von einschließlich bis ausschließlich
	validFrom: number;
	validUntil: number;
	issuer: string;
	nonce: string;
};

export class MandateError extends Error {
	constructor(readonly field: string) {
		super(`mandate_${field}`);
	}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX128 = /^[0-9a-f]{32}$/;
const POSINT = /^[1-9][0-9]{0,39}$/;
const SECONDS = /^[1-9][0-9]{8,10}$/;
const NONE = "-";

function check(ok: boolean, field: string): asserts ok {
	if (!ok) throw new MandateError(field);
}

function validate(m: Mandate): void {
	check(UUID.test(m.orgId), "org");
	check(UUID.test(m.mandateId), "id");
	check(UUID.test(m.grantee), "grantee");
	check(UUID.test(m.issuer), "issuer");
	check(m.grantee !== m.issuer, "self");
	check(HEX128.test(m.nonce), "nonce");
	check((WALLET_NETWORKS as readonly string[]).includes(m.network), "network");
	const net = NETWORKS[m.network];
	check(
		net.chain === "ethereum" ? m.chainId === net.chainId : m.chainId === null,
		"chain",
	);
	check(assetOf(m.network, m.asset) !== null, "asset");
	check(m.perPayout > 0n && m.total > 0n, "amount");
	check(m.perPayout <= m.total, "amount");
	check(
		m.destinations.length > 0 &&
			m.destinations.length <= MANDATE_MAX_DESTINATIONS,
		"destinations",
	);
	for (const d of m.destinations) {
		const r = checkAddress(m.network, d);
		check(r.ok && r.address === d, "destination");
	}
	const sorted = [...new Set(m.destinations)].sort();
	check(sorted.join(",") === m.destinations.join(","), "destinations");
	check(SECONDS.test(String(m.validFrom)), "from");
	check(SECONDS.test(String(m.validUntil)), "until");
	check(m.validUntil > m.validFrom, "until");
	check(m.validUntil - m.validFrom <= MANDATE_MAX_DAYS * 86_400, "until");
}

export function encodeMandate(m: Mandate): string {
	validate(m);
	return [
		MANDATE_PREFIX,
		m.orgId,
		m.mandateId,
		m.grantee,
		m.network,
		m.chainId === null ? NONE : String(m.chainId),
		m.asset,
		String(m.perPayout),
		String(m.total),
		m.destinations.join(","),
		String(m.validFrom),
		String(m.validUntil),
		m.issuer,
		m.nonce,
	].join("|");
}

export function parseMandate(text: string): Mandate {
	check(/^[\x21-\x7e]+$/.test(text) && text.length <= 2400, "text");
	const f = text.split("|");
	check(f.length === 14 && f[0] === MANDATE_PREFIX, "format");
	const [
		,
		orgId,
		mandateId,
		grantee,
		network,
		chainId,
		asset,
		perPayout,
		total,
		destinations,
		validFrom,
		validUntil,
		issuer,
		nonce,
	] = f as [string, ...string[]];
	const pos = (v: string | undefined, field: string) => {
		check(v !== undefined && POSINT.test(v), field);
		return v;
	};
	const secs = (v: string | undefined, field: string) => {
		check(v !== undefined && SECONDS.test(v), field);
		return Number(v);
	};
	const m: Mandate = {
		orgId: orgId ?? "",
		mandateId: mandateId ?? "",
		grantee: grantee ?? "",
		network: network as WalletNetwork,
		chainId: chainId === NONE ? null : Number(pos(chainId, "chain")),
		asset: asset as AssetCode,
		perPayout: BigInt(pos(perPayout, "amount")),
		total: BigInt(pos(total, "amount")),
		destinations: (destinations ?? "").split(","),
		validFrom: secs(validFrom, "from"),
		validUntil: secs(validUntil, "until"),
		issuer: issuer ?? "",
		nonce: nonce ?? "",
	};
	validate(m);
	check(encodeMandate(m) === text, "canonical");
	return m;
}

/** Zieladressen in Normalform, sortiert, ohne Dopplungen (vor dem Kodieren). */
export function normalizeDestinations(
	network: WalletNetwork,
	list: readonly string[],
): string[] {
	const out = new Set<string>();
	for (const raw of list) {
		const r = checkAddress(network, raw.trim());
		if (!r.ok) throw new MandateError("destination");
		out.add(r.address);
	}
	return [...out].sort();
}

// Challenge für WebAuthn: SHA-256 über die UTF-8-Bytes des Textes
export const mandateChallenge = (text: string): Uint8Array =>
	sha256(new TextEncoder().encode(text));

export type MandateUse =
	| "ok"
	| "grantee"
	| "network"
	| "asset"
	| "destination"
	| "not_yet"
	| "expired"
	| "per_payout"
	| "total";

/**
 * Deckt die Vollmacht diese Auszahlung? `used` = Summe der Auszahlungen,
 * die schon auf sie laufen (offen oder ausgeführt).
 */
export function mandateCovers(
	m: Mandate,
	p: {
		grantee: string;
		network: WalletNetwork;
		asset: AssetCode;
		amount: bigint;
		destination: string;
		at: number;
		used: bigint;
	},
): MandateUse {
	if (p.grantee !== m.grantee) return "grantee";
	if (p.network !== m.network) return "network";
	if (p.asset !== m.asset) return "asset";
	if (!m.destinations.includes(p.destination)) return "destination";
	if (p.at < m.validFrom) return "not_yet";
	if (p.at >= m.validUntil) return "expired";
	if (p.amount > m.perPayout) return "per_payout";
	if (p.used + p.amount > m.total) return "total";
	return "ok";
}
