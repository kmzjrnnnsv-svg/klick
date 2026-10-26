import { createHmac, timingSafeEqual } from "node:crypto";
import type { PortalDomain } from "@/db/schema/policy-portal";

// Richtlinien-Portal (M2) — rein. Zugang per Einmal-Code an eine bestätigte
// Firmen-Domain; der Code liegt nur als HMAC vor.

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const SESSION_DAYS = { min: 1, max: 90, default: 30 } as const;

const SLUG = /^[a-z0-9](?:-?[a-z0-9]){2,39}$/;
const RESERVED = new Set(["admin", "api", "code", "anmelden", "abmelden"]);

export function portalSlugValid(slug: string): boolean {
	return SLUG.test(slug) && !RESERVED.has(slug);
}

// Ein Cookie je Portal, nur unter /portal/<slug> (Seiten und Routen dort).
export const portalCookieName = (slug: string) => `kr_${slug}`;
export const portalPath = (slug: string) => `/portal/${slug}`;

const DOMAIN =
	/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// „https://www.Firma.de/“ → „www.firma.de“; ungültig → null
export function normalizeDomain(input: string): string | null {
	const d = input
		.trim()
		.toLowerCase()
		.replace(/^[a-z]+:\/\//, "")
		.replace(/[/?#].*$/, "")
		.replace(/\.$/, "");
	return DOMAIN.test(d) ? d : null;
}

export function emailDomain(email: string): string | null {
	const at = email.lastIndexOf("@");
	if (at < 1) return null;
	return normalizeDomain(email.slice(at + 1));
}

// Nur bestätigte Domains, genau (keine Unterdomains).
export function domainAllowed(
	email: string,
	domains: readonly PortalDomain[],
): boolean {
	const d = emailDomain(email);
	return Boolean(d && domains.some((x) => x.verifiedAt && x.domain === d));
}

export const txtRecordName = (domain: string) => `_klick-portal.${domain}`;
export const txtRecordValue = (token: string) => `klick-portal=${token}`;

// TXT-Antwort (je Eintrag eine Liste von Stücken) enthält den Wert?
export function txtMatches(
	records: readonly (readonly string[])[],
	token: string,
): boolean {
	const want = txtRecordValue(token);
	return records.some((r) => r.join("").trim() === want);
}

export function codeHash(secret: string, readerId: string, code: string) {
	return createHmac("sha256", secret)
		.update(`policy-portal:${readerId}:${code}`)
		.digest("hex");
}

export type CodeState = "ok" | "none" | "expired" | "locked" | "wrong";

export function checkCode(
	row: {
		codeHash: string | null;
		codeExpiresAt: Date | null;
		codeAttempts: number;
	},
	candidateHash: string,
	now: Date,
): CodeState {
	if (!row.codeHash || !row.codeExpiresAt) return "none";
	if (row.codeAttempts >= CODE_MAX_ATTEMPTS) return "locked";
	if (row.codeExpiresAt <= now) return "expired";
	const a = Buffer.from(row.codeHash, "hex");
	const b = Buffer.from(candidateHash, "hex");
	return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "wrong";
}

export function clampSessionDays(n: number): number {
	if (!Number.isFinite(n)) return SESSION_DAYS.default;
	return Math.min(SESSION_DAYS.max, Math.max(SESSION_DAYS.min, Math.round(n)));
}
