import { callSigner, SignerCallError } from "@/signer/client";

// Klick → Signer (app.sock). Jeder Aufruf liefert den Journal-Kopf mit
// (seq, head); lib/wallet/signer/anchor.ts prüft, dass er nie zurückläuft.
// Ohne SIGNER_SOCKET gibt es kein Senden.

export { SignerCallError };

export const signerSocket = (): string | null =>
	process.env.SIGNER_SOCKET?.trim() || null;
export const confirmOrigin = (): string | null =>
	process.env.CONFIRM_ORIGIN?.trim() || null;
export const signerConfigured = (): boolean => signerSocket() !== null;

export type SignerMeta = { seq: number; head: string };

export async function signerCall<T>(
	cmd: string,
	args: unknown = {},
	opts: { timeoutMs?: number } = {},
): Promise<{ result: T } & SignerMeta> {
	const path = signerSocket();
	if (!path) throw new SignerCallError("unreachable");
	return callSigner<T>(path, cmd, args, {
		timeoutMs: opts.timeoutMs ?? 10_000,
	});
}

export type SignerHello = {
	v: number;
	initialized: boolean;
	orgId: string | null;
	rpId: string | null;
	origin: string | null;
	dev: boolean;
	networks: string[];
	frozen: { reason: string; at: number; by: "app" | "admin" } | null;
	policyHash: string | null;
	bundleHash: string | null;
	seq: number;
	head: string;
};

export type SignerIntentView = {
	intentId: string;
	kind: "payout" | "whitelist";
	text: string;
	createdAt: number;
	expiresAt: number;
	approvals: { person: string; at: number }[];
	approvedAt: number | null;
	signableAt: number | null;
	signUntil: number | null;
	activeFrom: number | null;
	cancelled: boolean;
	vetoed: boolean;
	signed: { mode: string; txid: string; fee: string; at: number } | null;
};

export type SignResult = {
	intentId: string;
	mode: "first" | "bump" | "cancel";
	raw: string;
	txid: string;
	fee: string;
	outpoints?: string[];
	changeIndex?: number | null;
	nonce?: string;
};

// Fehlercode des Signers für die Oberfläche (unbekannte → „signer“)
export function signerErrorCode(e: unknown): string {
	if (!(e instanceof SignerCallError)) return "signer";
	if (e.code !== "signer") return `signer_${e.code}`;
	return `signer_${e.signerCode ?? "error"}`;
}

export const confirmUrl = (intentId: string): string | null => {
	const origin = confirmOrigin();
	return origin ? `${origin}/#i=${intentId}` : null;
};
