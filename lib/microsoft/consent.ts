import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

// Freigabe einer Klick-App im Tenant der Kundin (Admin-Consent: Teams,
// Identität). Der Link trägt einen versiegelten Zustand (Org, Einmalwert,
// Ablauf, HMAC mit Zweck); der Rückruf prüft Siegel, Zweck, Ablauf und den
// gespeicherten Einmalwert (nur SHA-256). Der Zweck trennt die Apps: ein
// Teams-Zustand gilt nie im Rückruf der Identität und umgekehrt.

export type ConsentPurpose = "teams-consent" | "identity-consent";

export const CONSENT_TTL_MS = 60 * 60 * 1000;

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export function newNonce(): string {
	return randomBytes(24).toString("base64url");
}

export function nonceHash(nonce: string): string {
	return createHash("sha256").update(nonce).digest("hex");
}

function mac(purpose: ConsentPurpose, body: string, secret: string): string {
	return createHmac("sha256", secret)
		.update(`${purpose}|${body}`)
		.digest("base64url");
}

export function sealState(
	purpose: ConsentPurpose,
	orgId: string,
	nonce: string,
	expiresAtMs: number,
	secret: string,
): string {
	const body = `${b64(orgId)}.${nonce}.${expiresAtMs}`;
	return `${body}.${mac(purpose, body, secret)}`;
}

export function openState(
	purpose: ConsentPurpose,
	state: string,
	secret: string,
	nowMs: number,
): { orgId: string; nonce: string } | null {
	const parts = state.split(".");
	if (parts.length !== 4) return null;
	const [o, nonce, exp, sig] = parts as [string, string, string, string];
	const body = `${o}.${nonce}.${exp}`;
	const want = Buffer.from(mac(purpose, body, secret));
	const got = Buffer.from(sig);
	if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
	if (!/^\d+$/.test(exp) || Number(exp) < nowMs) return null;
	const orgId = unb64(o);
	if (!/^[0-9a-f-]{36}$/i.test(orgId)) return null;
	return { orgId, nonce };
}

export function adminConsentUrl(
	tenantId: string,
	clientId: string,
	redirectUri: string,
	state: string,
): string {
	const q = new URLSearchParams({
		client_id: clientId,
		scope: "https://graph.microsoft.com/.default",
		redirect_uri: redirectUri,
		state,
	});
	return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0/adminconsent?${q.toString()}`;
}
