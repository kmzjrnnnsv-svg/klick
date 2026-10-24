import { createHash, randomBytes } from "node:crypto";
import type { AccessTokenKind } from "@/db/schema/enums";

// Zugangstoken ohne Sitzung (ADR-017) — rein. Format klk_<art>_<32 Byte
// base64url>: das Präfix lässt gitleaks und GitHub-Secret-Scanning geleakte
// Tokens erkennen. Gespeichert wird nur der SHA-256; der Klartext wird genau
// einmal angezeigt.

export const TOKEN_PREFIX: Record<AccessTokenKind, string> = {
	ingest: "klk_ingest_",
	supplier_portal: "klk_portal_",
	trust_center: "klk_trust_",
	wallet: "klk_wallet_",
};

const BODY = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
	return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newToken(kind: AccessTokenKind): {
	token: string;
	hash: string;
	prefix: string;
} {
	const token = `${TOKEN_PREFIX[kind]}${randomBytes(32).toString("base64url")}`;
	return {
		token,
		hash: hashToken(token),
		prefix: token.slice(0, TOKEN_PREFIX[kind].length + 4),
	};
}

// Form prüfen, bevor die DB gefragt wird (spart Abfragen bei Müll).
export function tokenKindOf(token: string): AccessTokenKind | null {
	for (const [kind, prefix] of Object.entries(TOKEN_PREFIX) as [
		AccessTokenKind,
		string,
	][])
		if (token.startsWith(prefix) && BODY.test(token.slice(prefix.length)))
			return kind;
	return null;
}

export function bearerToken(header: string | null | undefined): string | null {
	const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
	return m?.[1] ?? null;
}

export type TokenState = "ok" | "expired" | "revoked";

export function tokenState(
	t: { expiresAt: Date; revokedAt: Date | null },
	now: Date,
): TokenState {
	if (t.revokedAt) return "revoked";
	if (t.expiresAt <= now) return "expired";
	return "ok";
}

export function hasScopes(
	granted: readonly string[],
	required: readonly string[],
): boolean {
	return required.every((s) => granted.includes(s));
}
