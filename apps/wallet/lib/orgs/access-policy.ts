import {
	type NetworkEntry,
	type NetworkPolicy,
	networkAllows,
	networkPolicyOf,
} from "@/lib/net/network-policy";
import { type AssetCode, assetsFor } from "@/lib/wallet/core/assets";
import type { WalletNetwork } from "@/lib/wallet/core/networks";

// Zugangsregeln je Wallet-Org (Härtung W, pure, getestet in
// apps/wallet/tests/access-policy.test.ts). Gespeichert in org_settings
// (network_policy, security_keys_only, allowed_assets, mandates_required),
// gelesen nur über accessPolicyOf bzw. orgAccessPolicy (Zwischenspeicher).
//
// - Netz: IP-Liste wie in Klick (lib/net/network-policy.ts), nur die Fläche
//   „app“ — Bestätigungsseite, Relay und Link-Tausch schützen sich selbst
//   (Sicherheitsschlüssel, Token) und bleiben offen.
// - Nur Sicherheitsschlüssel: Passkeys müssen gerätegebunden sein (BE = 0,
//   nicht gesichert) — bei Registrierung, Anmeldung, Entsperren, Step-up und
//   im Guard. Wer Mitglied einer solchen Org ist, meldet sich überall nur noch
//   mit einem Sicherheitsschlüssel an (die strengste Regel gewinnt).
// - Nur bestimmte Assets: Konten, Empfangen und Auszahlungen nur dafür; der
//   Signer sperrt die übrigen Assets zusätzlich über seine Richtlinie
//   (Grenzen nur root, pnpm wallet:check meldet Abweichungen).
// - Vollmacht: Bedienung zahlt nur mit gültiger, von einer Inhaber:in per
//   Sicherheitsschlüssel unterschriebener Vollmacht aus.

export const WALLET_ASSET_CODES = ["BTC", "ETH", "USDC", "EURC"] as const;

export type WalletAccessPolicy = {
	network: NetworkPolicy;
	securityKeysOnly: boolean;
	// null = alle Assets
	allowedAssets: AssetCode[] | null;
	mandatesRequired: boolean;
};

export const OPEN_ACCESS_POLICY: WalletAccessPolicy = {
	network: networkPolicyOf(null),
	securityKeysOnly: false,
	allowedAssets: null,
	mandatesRequired: false,
};

const isAsset = (v: unknown): v is AssetCode =>
	typeof v === "string" &&
	(WALLET_ASSET_CODES as readonly string[]).includes(v);

/** Gespeicherte Spalten lesen; Unbekanntes fällt weg. */
export function accessPolicyOf(row: {
	networkPolicy?: unknown;
	securityKeysOnly?: boolean | null;
	allowedAssets?: unknown;
	mandatesRequired?: boolean | null;
}): WalletAccessPolicy {
	const assets = Array.isArray(row.allowedAssets)
		? [...new Set(row.allowedAssets.filter(isAsset))]
		: null;
	return {
		network: walletNetworkPolicy(row.networkPolicy),
		securityKeysOnly: row.securityKeysOnly === true,
		allowedAssets: assets,
		mandatesRequired: row.mandatesRequired === true,
	};
}

// Nur die Mitglieder-Liste zählt (both.money kennt keine Externen und keine
// Portale); Ausnahmen und eine eigene Liste für Externe fallen weg.
export function walletNetworkPolicy(raw: unknown): NetworkPolicy {
	const p = networkPolicyOf(raw);
	return {
		members: p.members,
		externals: null,
		exceptions: networkPolicyOf(null).exceptions,
	};
}

export const networkEntries = (p: WalletAccessPolicy): NetworkEntry[] =>
	p.network.members;

export function walletNetworkAllows(
	p: WalletAccessPolicy,
	ip: string | null | undefined,
): boolean {
	return networkAllows(p.network, "app", ip);
}

// ── Sicherheitsschlüssel ────────────────────────────────────────────────────

export type CredentialFlags = {
	deviceType: string | null | undefined;
	backedUp: boolean | null | undefined;
};

/**
 * Gerätegebunden = WebAuthn-Flag BE = 0 („singleDevice“) und nicht gesichert.
 * Synchronisierte Passkeys (iCloud-Schlüsselbund, Google-Passwortmanager)
 * melden BE = 1 und fallen damit heraus. Ohne Attestierung ist das eine
 * Angabe des Authenticators — sie schützt vor übernommenen Cloud-Konten,
 * nicht vor einem eigens gebauten Software-Schlüssel (docs, ADR-031).
 */
export function deviceBound(c: CredentialFlags): boolean {
	return c.deviceType === "singleDevice" && c.backedUp !== true;
}

/** Darf diese Person mit diesem Schlüssel herein? */
export function credentialAllowed(
	requiresSecurityKey: boolean,
	c: CredentialFlags,
): boolean {
	return !requiresSecurityKey || deviceBound(c);
}

/** Alle Passkeys der Person gerätegebunden (und mindestens einer)? */
export function onlyDeviceBound(passkeys: readonly CredentialFlags[]): boolean {
	return passkeys.length > 0 && passkeys.every(deviceBound);
}

// ── Assets ──────────────────────────────────────────────────────────────────

export function assetAllowed(p: WalletAccessPolicy, asset: AssetCode): boolean {
	return p.allowedAssets === null || p.allowedAssets.includes(asset);
}

/** Assets eines Netzes, die die Org führen darf. */
export function allowedAssetsOn(
	p: WalletAccessPolicy,
	network: WalletNetwork,
): AssetCode[] {
	return assetsFor(network)
		.map((a) => a.code)
		.filter((c) => assetAllowed(p, c));
}

/** Konto auf diesem Netz nur, wenn dort mindestens ein Asset erlaubt ist. */
export function networkHasAllowedAsset(
	p: WalletAccessPolicy,
	network: WalletNetwork,
): boolean {
	return allowedAssetsOn(p, network).length > 0;
}

/**
 * Abgleich mit der Signer-Richtlinie: Assets, die der Signer noch auszahlen
 * würde (Grenze gesetzt), die Org aber nicht führen darf. Leer = stimmig.
 */
export function signerAssetMismatch(
	p: WalletAccessPolicy,
	signerLimits: Partial<Record<AssetCode, unknown>>,
): AssetCode[] {
	return WALLET_ASSET_CODES.filter(
		(a) => signerLimits[a] !== undefined && !assetAllowed(p, a),
	);
}

// ── Vollmacht ───────────────────────────────────────────────────────────────

/** Braucht diese Rolle für Auszahlungen eine Vollmacht? Inhaber:innen nie. */
export function mandateRequired(
	p: WalletAccessPolicy,
	role: "owner" | "operator" | "viewer",
): boolean {
	return p.mandatesRequired && role !== "owner";
}

// ── Änderungen ──────────────────────────────────────────────────────────────

export type AccessChange =
	| "network_tightened"
	| "network_relaxed"
	| "security_keys_on"
	| "security_keys_off"
	| "assets_tightened"
	| "assets_relaxed"
	| "mandates_on"
	| "mandates_off";

const covers = (a: readonly string[], b: readonly string[]) =>
	b.every((x) => a.includes(x));

/** Was eine Änderung bewirkt — Lockerungen melden alle Inhaber:innen. */
export function accessChanges(
	prev: WalletAccessPolicy,
	next: WalletAccessPolicy,
): AccessChange[] {
	const out: AccessChange[] = [];
	const pn = prev.network.members.map((e) => e.cidr);
	const nn = next.network.members.map((e) => e.cidr);
	const same = pn.length === nn.length && covers(pn, nn);
	if (!same) {
		// Aus (leer) ist das Lockerste; sonst lockert jedes neue Netz
		const relaxed =
			(pn.length > 0 && nn.length === 0) ||
			(nn.length > 0 && pn.length > 0 && !covers(pn, nn));
		out.push(relaxed ? "network_relaxed" : "network_tightened");
	}
	if (prev.securityKeysOnly !== next.securityKeysOnly)
		out.push(next.securityKeysOnly ? "security_keys_on" : "security_keys_off");
	const pa = prev.allowedAssets ?? [...WALLET_ASSET_CODES];
	const na = next.allowedAssets ?? [...WALLET_ASSET_CODES];
	if (pa.length !== na.length || !covers(pa, na))
		out.push(covers(pa, na) ? "assets_tightened" : "assets_relaxed");
	if (prev.mandatesRequired !== next.mandatesRequired)
		out.push(next.mandatesRequired ? "mandates_on" : "mandates_off");
	return out;
}

export const isRelaxing = (c: AccessChange) =>
	c === "network_relaxed" ||
	c === "security_keys_off" ||
	c === "assets_relaxed" ||
	c === "mandates_off";
