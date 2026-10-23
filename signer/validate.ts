import { ASSETS, type AssetCode } from "../lib/wallet/core/assets";
import {
	isWalletNetwork,
	type WalletNetwork,
} from "../lib/wallet/core/networks";

// Eingaben prüfen ohne Bibliothek (der Signer bündelt nur node:*, @noble,
// @scure, micro-eth-signer und lib/wallet/core). Jede Verletzung →
// SignerError("bad_request", Feld).

export class SignerError extends Error {
	constructor(
		readonly code: string,
		readonly detail?: string,
	) {
		super(detail ? `${code}:${detail}` : code);
	}
}

export const bad = (field: string): never => {
	throw new SignerError("bad_request", field);
};

export type Args = Record<string, unknown>;

export function obj(v: unknown, field = "args"): Args {
	if (!v || typeof v !== "object" || Array.isArray(v)) bad(field);
	return v as Args;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uuid = (v: unknown, field: string): string =>
	typeof v === "string" && UUID.test(v) ? v : bad(field);

export const hex128 = (v: unknown, field: string): string =>
	typeof v === "string" && /^[0-9a-f]{32}$/.test(v) ? v : bad(field);

export const txid = (v: unknown, field: string): string =>
	typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : bad(field);

export const hexData = (v: unknown, field: string, max = 400_000): string =>
	typeof v === "string" &&
	v.length <= max &&
	v.length % 2 === 0 &&
	/^[0-9a-f]+$/.test(v)
		? v
		: bad(field);

export const b64uStr = (v: unknown, field: string, max = 4096): string =>
	typeof v === "string" && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v)
		? v
		: bad(field);

export const uint = (v: unknown, field: string): bigint =>
	typeof v === "string" && /^(0|[1-9][0-9]{0,39})$/.test(v)
		? BigInt(v)
		: bad(field);

export const posUint = (v: unknown, field: string): bigint => {
	const n = uint(v, field);
	return n > 0n ? n : bad(field);
};

export const int = (v: unknown, field: string, min: number, max: number) =>
	typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
		? v
		: bad(field);

export const network = (v: unknown, field = "network"): WalletNetwork =>
	typeof v === "string" && isWalletNetwork(v) ? v : bad(field);

export function asset(net: WalletNetwork, v: unknown): AssetCode {
	if (typeof v !== "string") return bad("asset");
	return ASSETS[net].some((a) => a.code === v)
		? (v as AssetCode)
		: bad("asset");
}

// freier Text nur druckbar und kurz (Grund beim Einfrieren)
export const shortText = (v: unknown, field: string, max = 200): string =>
	typeof v === "string" &&
	v.length > 0 &&
	v.length <= max &&
	/^[\p{L}\p{N}\p{P}\p{Zs}]+$/u.test(v)
		? v
		: bad(field);

export const rpIdOf = (v: unknown): string =>
	typeof v === "string" &&
	/^(localhost|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$/.test(
		v,
	)
		? v
		: bad("rpId");

export const originOf = (v: unknown): string =>
	typeof v === "string" &&
	/^(https:\/\/[a-z0-9.-]+|http:\/\/localhost(:[0-9]{1,5})?)$/.test(v)
		? v
		: bad("origin");
