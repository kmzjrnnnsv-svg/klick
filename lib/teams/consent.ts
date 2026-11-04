import {
	adminConsentUrl,
	CONSENT_TTL_MS,
	newNonce,
	nonceHash,
	openState,
	sealState,
} from "@/lib/microsoft/consent";

// Freigabe der Teams-App im Tenant der Kundin (T5): gemeinsame Siegel in
// lib/microsoft/consent.ts mit dem Zweck „teams-consent“.

export { adminConsentUrl, CONSENT_TTL_MS, newNonce, nonceHash };

export function sealConsentState(
	orgId: string,
	nonce: string,
	expiresAtMs: number,
	secret: string,
): string {
	return sealState("teams-consent", orgId, nonce, expiresAtMs, secret);
}

export function openConsentState(
	state: string,
	secret: string,
	nowMs: number,
): { orgId: string; nonce: string } | null {
	return openState("teams-consent", state, secret, nowMs);
}
