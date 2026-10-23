import { sha256 } from "@noble/hashes/sha2.js";
import { checkAddress } from "./address";
import { type AssetCode, assetOf } from "./assets";
import { NETWORKS, WALLET_NETWORKS, type WalletNetwork } from "./networks";

// Absicht (Intent) als kanonischer Text — das, was ein Sicherheitsschlüssel
// auf der Bestätigungsseite unterschreibt (Challenge = SHA-256 des Textes).
// Signer, App und Bestätigungsseite (deploy/confirm/canonical.js) kodieren
// identisch; gemeinsame Testvektoren in tests/fixtures/wallet-intent-vectors.json.
// Kein Feld enthält Text aus der App (keine Bezeichnungen): jedes Feld hat
// ein festes Format, `|` und Zeilenumbrüche sind ausgeschlossen.

export const INTENT_PREFIX = "klick-wallet/v1";
export const INTENT_KINDS = ["payout", "whitelist"] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

export type Intent = {
	kind: IntentKind;
	orgId: string;
	// nur bei Auszahlungen
	accountId: string | null;
	network: WalletNetwork;
	// nur Ethereum (EIP-155)
	chainId: number | null;
	asset: AssetCode | null;
	// Basiseinheiten (Satoshi, Wei, 10⁻⁶)
	amount: bigint | null;
	destination: string;
	// Auszahlung: seit wann das Ziel im Signer aktiv ist (Unix-Sekunden)
	destinationActiveSince: number | null;
	// höchste Gebühr in Basiseinheiten der Gebührenwährung (Satoshi bzw. Wei)
	feeCap: bigint | null;
	initiator: string;
	intentId: string;
	nonce: string;
	expiresAt: number;
};

export class IntentError extends Error {
	constructor(readonly field: string) {
		super(`intent_${field}`);
	}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX128 = /^[0-9a-f]{32}$/;
const UINT = /^(0|[1-9][0-9]{0,39})$/;
const POSINT = /^[1-9][0-9]{0,39}$/;
const SECONDS = /^[1-9][0-9]{8,10}$/;
const NONE = "-";

function check(ok: boolean, field: string): asserts ok {
	if (!ok) throw new IntentError(field);
}

// Felder prüfen (Kodieren und Parsen nutzen dieselben Regeln)
function validate(i: Intent): void {
	check((INTENT_KINDS as readonly string[]).includes(i.kind), "kind");
	check(UUID.test(i.orgId), "org");
	check(UUID.test(i.initiator), "initiator");
	check(HEX128.test(i.intentId), "id");
	check(HEX128.test(i.nonce), "nonce");
	check(SECONDS.test(String(i.expiresAt)), "expires");
	check((WALLET_NETWORKS as readonly string[]).includes(i.network), "network");
	const net = NETWORKS[i.network];
	check(
		net.chain === "ethereum" ? i.chainId === net.chainId : i.chainId === null,
		"chain",
	);
	const dest = checkAddress(i.network, i.destination);
	check(dest.ok && dest.address === i.destination, "destination");
	if (i.kind === "payout") {
		check(i.accountId !== null && UUID.test(i.accountId), "account");
		check(i.asset !== null && assetOf(i.network, i.asset) !== null, "asset");
		check(i.amount !== null && i.amount > 0n, "amount");
		check(i.feeCap !== null && i.feeCap >= 0n, "fee");
		check(
			i.destinationActiveSince !== null &&
				SECONDS.test(String(i.destinationActiveSince)),
			"active",
		);
	} else {
		check(i.accountId === null, "account");
		check(i.asset === null, "asset");
		check(i.amount === null, "amount");
		check(i.feeCap === null, "fee");
		check(i.destinationActiveSince === null, "active");
	}
}

const opt = (v: string | number | bigint | null) =>
	v === null ? NONE : String(v);

export function encodeIntent(i: Intent): string {
	validate(i);
	return [
		INTENT_PREFIX,
		i.kind,
		i.orgId,
		opt(i.accountId),
		i.network,
		opt(i.chainId),
		opt(i.asset),
		opt(i.amount),
		i.destination,
		opt(i.destinationActiveSince),
		opt(i.feeCap),
		i.initiator,
		i.intentId,
		i.nonce,
		String(i.expiresAt),
	].join("|");
}

export function parseIntent(text: string): Intent {
	check(/^[\x21-\x7e]+$/.test(text) && text.length <= 600, "text");
	const f = text.split("|");
	check(f.length === 15 && f[0] === INTENT_PREFIX, "format");
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
	] = f as string[] as [string, ...string[]];
	const num = (v: string | undefined, re: RegExp, field: string) => {
		if (v === NONE) return null;
		check(v !== undefined && re.test(v), field);
		return v;
	};
	const intent: Intent = {
		kind: kind as IntentKind,
		orgId: orgId ?? "",
		accountId: accountId === NONE ? null : (accountId ?? ""),
		network: network as WalletNetwork,
		chainId: ((v) => (v === null ? null : Number(v)))(
			num(chainId, POSINT, "chain"),
		),
		asset: asset === NONE ? null : (asset as AssetCode),
		amount: ((v) => (v === null ? null : BigInt(v)))(
			num(amount, POSINT, "amount"),
		),
		destination: destination ?? "",
		destinationActiveSince: ((v) => (v === null ? null : Number(v)))(
			num(activeSince, SECONDS, "active"),
		),
		feeCap: ((v) => (v === null ? null : BigInt(v)))(num(feeCap, UINT, "fee")),
		initiator: initiator ?? "",
		intentId: intentId ?? "",
		nonce: nonce ?? "",
		expiresAt: Number(num(expiresAt, SECONDS, "expires") ?? 0),
	};
	validate(intent);
	// Rundreise muss exakt denselben Text ergeben (keine zweite Schreibweise)
	check(encodeIntent(intent) === text, "canonical");
	return intent;
}

// Challenge für WebAuthn: SHA-256 über die UTF-8-Bytes des Textes
export const intentChallenge = (text: string): Uint8Array =>
	sha256(new TextEncoder().encode(text));
