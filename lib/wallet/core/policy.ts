import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { AssetCode } from "./assets";
import { NETWORKS, WALLET_NETWORKS, type WalletNetwork } from "./networks";

// Richtlinie des Signers (rein, getestet): Freigabemodus, Wartezeiten,
// Grenzen, Gebühren-Deckel, freigeschaltete Netze. Setzen darf sie nur root
// am Terminal (admin.sock); die App darf ausschließlich verschärfen
// (`isTightening`). Echtgeld bleibt in Phase 2 aus.

export const POLICY_MODES = ["solo", "four_eyes"] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

export type AssetLimit = { perPayout: string; perDay: string }; // Basiseinheiten

export type Policy = {
	version: number;
	// Hash der vorigen Version (v1: null) — kein Zurückdrehen
	prev: string | null;
	mode: PolicyMode;
	soloMinKeys: number;
	soloDelaySec: number;
	whitelistCooldownSec: number;
	// Signieren nur in diesem Fenster nach Erreichen der Freigabe
	approvalWindowSec: number;
	limits: Partial<Record<AssetCode, AssetLimit>>;
	feeCaps: { btcSatPerVb: number; ethMaxFeeGwei: number };
	networks: WalletNetwork[];
	liveFunds: false;
};

export const PROD_MIN = {
	soloMinKeys: 2,
	whitelistCooldownSec: 24 * 3600,
	soloDelaySec: 10 * 60,
} as const;

export type PolicyIssue =
	| "version"
	| "mode"
	| "solo_keys"
	| "delay"
	| "cooldown"
	| "window"
	| "limits"
	| "fee_caps"
	| "networks"
	| "live";

const DIGITS = /^(0|[1-9][0-9]{0,39})$/;

// Grenzen gegen Fehlbedienung; im Dev-Bundle dürfen Wartezeiten 0 sein
export function policyIssues(p: Policy, opts: { dev: boolean }): PolicyIssue[] {
	const out: PolicyIssue[] = [];
	if (!Number.isInteger(p.version) || p.version < 1) out.push("version");
	if (!(POLICY_MODES as readonly string[]).includes(p.mode)) out.push("mode");
	const min = opts.dev
		? { soloMinKeys: 1, whitelistCooldownSec: 0, soloDelaySec: 0 }
		: PROD_MIN;
	if (!Number.isInteger(p.soloMinKeys) || p.soloMinKeys < min.soloMinKeys)
		out.push("solo_keys");
	if (!Number.isInteger(p.soloDelaySec) || p.soloDelaySec < min.soloDelaySec)
		out.push("delay");
	if (
		!Number.isInteger(p.whitelistCooldownSec) ||
		p.whitelistCooldownSec < min.whitelistCooldownSec
	)
		out.push("cooldown");
	if (
		!Number.isInteger(p.approvalWindowSec) ||
		p.approvalWindowSec < 60 ||
		p.approvalWindowSec > 24 * 3600
	)
		out.push("window");
	for (const l of Object.values(p.limits)) {
		if (
			!l ||
			!DIGITS.test(l.perPayout) ||
			!DIGITS.test(l.perDay) ||
			BigInt(l.perPayout) > BigInt(l.perDay)
		)
			out.push("limits");
	}
	if (
		!(p.feeCaps.btcSatPerVb > 0 && p.feeCaps.btcSatPerVb <= 2000) ||
		!(p.feeCaps.ethMaxFeeGwei > 0 && p.feeCaps.ethMaxFeeGwei <= 2000)
	)
		out.push("fee_caps");
	if (
		p.networks.some((n) => !(WALLET_NETWORKS as readonly string[]).includes(n))
	)
		out.push("networks");
	if (p.liveFunds !== false || p.networks.some((n) => NETWORKS[n].live))
		out.push("live");
	return [...new Set(out)];
}

// Kanonisches JSON (Schlüssel sortiert) → Hash für die Versionskette
function canonicalJson(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
	if (v && typeof v === "object")
		return `{${Object.keys(v as object)
			.sort()
			.map(
				(k) =>
					`${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`,
			)
			.join(",")}}`;
	return JSON.stringify(v);
}

export const policyHash = (p: Policy): string =>
	bytesToHex(sha256(new TextEncoder().encode(canonicalJson(p))));

// Verschärft `next` gegenüber `prev` in jeder Hinsicht (oder ist gleich)?
export function isTightening(prev: Policy, next: Policy): boolean {
	if (prev.mode === "four_eyes" && next.mode === "solo") return false;
	if (next.soloMinKeys < prev.soloMinKeys) return false;
	if (next.soloDelaySec < prev.soloDelaySec) return false;
	if (next.whitelistCooldownSec < prev.whitelistCooldownSec) return false;
	if (next.approvalWindowSec > prev.approvalWindowSec) return false;
	if (next.feeCaps.btcSatPerVb > prev.feeCaps.btcSatPerVb) return false;
	if (next.feeCaps.ethMaxFeeGwei > prev.feeCaps.ethMaxFeeGwei) return false;
	if (next.networks.some((n) => !prev.networks.includes(n))) return false;
	if (next.liveFunds !== false) return false;
	for (const [asset, l] of Object.entries(next.limits)) {
		const before = prev.limits[asset as AssetCode];
		// neues Asset freischalten = lockern
		if (!before || !l) return false;
		if (BigInt(l.perPayout) > BigInt(before.perPayout)) return false;
		if (BigInt(l.perDay) > BigInt(before.perDay)) return false;
	}
	return true;
}

export type SpendCheck = "ok" | "asset_not_allowed" | "per_payout" | "per_day";

// Grenze je Auszahlung und rollierend 24 h (Summe bereits signierter)
export function spendAllowed(
	p: Policy,
	asset: AssetCode,
	amount: bigint,
	signedLast24h: bigint,
): SpendCheck {
	const l = p.limits[asset];
	if (!l) return "asset_not_allowed";
	if (amount > BigInt(l.perPayout)) return "per_payout";
	if (signedLast24h + amount > BigInt(l.perDay)) return "per_day";
	return "ok";
}

export type Approval = { personId: string; credentialId: string };

// Freigabe erreicht? Solo: eine Bestätigung einer Person mit mindestens
// soloMinKeys aktiven Schlüsseln. Vier-Augen: zwei verschiedene Personen —
// gezählt über Schlüssel, nie über die Angabe der App zur anlegenden Person.
export function approvalsSatisfied(
	p: Policy,
	approvals: readonly Approval[],
	activeKeysByPerson: ReadonlyMap<string, number>,
): boolean {
	const persons = new Set(approvals.map((a) => a.personId));
	if (p.mode === "four_eyes") return persons.size >= 2;
	return [...persons].some(
		(person) => (activeKeysByPerson.get(person) ?? 0) >= p.soloMinKeys,
	);
}
