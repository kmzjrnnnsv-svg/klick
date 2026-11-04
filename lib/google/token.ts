import { createPrivateKey, sign } from "node:crypto";
import type { GoogleHttpRequest } from "./http";

// Token für die Directory API über ein Dienstkonto mit domänenweiter
// Delegierung (Teil D I3): signierte Assertion RS256 (RFC 7523), „sub“ =
// Admin-Adresse der Kundin. Nur Lese-Bereiche.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_SCOPES = [
	"https://www.googleapis.com/auth/admin.directory.user.readonly",
	"https://www.googleapis.com/auth/admin.directory.domain.readonly",
	"https://www.googleapis.com/auth/admin.directory.customer.readonly",
] as const;

export type GoogleServiceAccount = {
	clientEmail: string;
	// numerische Client-ID für die domänenweite Delegierung
	clientId: string;
	privateKey: string;
	keyId: string | null;
};

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// JSON-Schlüssel eines Dienstkontos lesen; nur die nötigen Felder
export function parseServiceAccount(json: string): GoogleServiceAccount | null {
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
	const s = (k: string) =>
		typeof raw[k] === "string" ? (raw[k] as string) : "";
	if (s("type") !== "service_account") return null;
	const clientEmail = s("client_email");
	const clientId = s("client_id");
	const privateKey = s("private_key");
	if (
		!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail) ||
		!/^\d{6,30}$/.test(clientId) ||
		!privateKey.includes("PRIVATE KEY")
	)
		return null;
	try {
		createPrivateKey(privateKey);
	} catch {
		return null;
	}
	return {
		clientEmail,
		clientId,
		privateKey,
		keyId: s("private_key_id") || null,
	};
}

export function googleAssertion(
	sa: GoogleServiceAccount,
	subject: string,
	nowMs: number,
): string {
	const header: Record<string, string> = { alg: "RS256", typ: "JWT" };
	if (sa.keyId) header.kid = sa.keyId;
	const now = Math.floor(nowMs / 1000);
	const payload = {
		iss: sa.clientEmail,
		sub: subject,
		scope: GOOGLE_SCOPES.join(" "),
		aud: TOKEN_URL,
		iat: now,
		exp: now + 3600,
	};
	const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
	const sig = sign(
		"sha256",
		Buffer.from(data),
		createPrivateKey(sa.privateKey),
	);
	return `${data}.${b64url(sig)}`;
}

export function googleTokenRequest(
	sa: GoogleServiceAccount,
	subject: string,
	nowMs: number,
): GoogleHttpRequest {
	const form = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		assertion: googleAssertion(sa, subject, nowMs),
	});
	return {
		method: "POST",
		url: TOKEN_URL,
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: form.toString(),
	};
}
