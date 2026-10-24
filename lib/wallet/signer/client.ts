// Legacy (bis K6): Wallet-Bereich in Klick, ersetzt durch both.money —
// Änderungen nur noch in apps/wallet/lib/wallet/signer/client.ts.
import { callSigner, SignerCallError } from "@/signer/client";
import type { SignerMeta } from "./types";

// Klick → Signer (app.sock). Jeder Aufruf liefert den Journal-Kopf mit
// (seq, head); lib/wallet/signer/anchor.ts prüft, dass er nie zurückläuft.
// Ohne SIGNER_SOCKET gibt es kein Senden.

export type {
	SignerHello,
	SignerIntentView,
	SignerMeta,
	SignResult,
} from "./types";
export { SignerCallError };

export const signerSocket = (): string | null =>
	process.env.SIGNER_SOCKET?.trim() || null;
export const confirmOrigin = (): string | null =>
	process.env.CONFIRM_ORIGIN?.trim() || null;
export const signerConfigured = (): boolean => signerSocket() !== null;

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
