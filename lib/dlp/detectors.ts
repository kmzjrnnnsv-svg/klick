// DLP-Detektoren — reine Funktionen über Text. Sie zählen Treffer je
// Detektor und geben **nie** den gefundenen Inhalt zurück: Ergebnisse landen
// im Audit-Log und an der Nachweis-Zeile, dort darf kein Geheimnis stehen.
// Prüfziffern (IBAN mod 97, Luhn, Steuer-ID) halten die Fehlalarme klein.
// Dieselben Muster nutzt der passive Schnellcheck für JS-Bundles.

export const DLP_ENGINE_VERSION = "2";

export type DlpCategory =
	| "secret"
	| "payment"
	| "bank"
	| "tax"
	| "pii"
	| "info";

export type DlpDetector =
	| "private_key"
	| "aws_access_key"
	| "stripe_secret"
	| "github_token"
	| "openai_key"
	| "anthropic_key"
	| "slack_token"
	| "sendgrid_key"
	| "supabase_service_role"
	| "google_api_key"
	| "card_number"
	| "iban"
	| "de_tax_id"
	| "email"
	| "phone";

export type DlpFinding = {
	detector: DlpDetector;
	category: DlpCategory;
	count: number;
};

type PatternDetector = {
	detector: DlpDetector;
	category: DlpCategory;
	pattern: RegExp;
	valid?: (match: string) => boolean;
};

function b64urlJson(part: string): unknown {
	try {
		const pad = part.replace(/-/g, "+").replace(/_/g, "/");
		return JSON.parse(Buffer.from(pad, "base64").toString("utf-8"));
	} catch {
		return null;
	}
}

// Supabase-Schlüssel sind JWTs; nur `service_role` umgeht RLS — `anon` ist
// öffentlich gedacht und kein Fund.
export function isServiceRoleJwt(token: string): boolean {
	const [, payload] = token.split(".");
	if (!payload) return false;
	const claims = b64urlJson(payload);
	return (
		typeof claims === "object" &&
		claims !== null &&
		(claims as { role?: unknown }).role === "service_role"
	);
}

export function luhnValid(digits: string): boolean {
	let sum = 0;
	let dbl = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let d = digits.charCodeAt(i) - 48;
		if (dbl) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
		dbl = !dbl;
	}
	return sum % 10 === 0;
}

function cardValid(match: string): boolean {
	const digits = match.replace(/[ -]/g, "");
	if (digits.length < 13 || digits.length > 19) return false;
	// gängige Kartennetze (Visa, Mastercard, Amex, Discover/UnionPay)
	if (!/^(4|5[1-5]|2[2-7]|3[47]|6)/.test(digits)) return false;
	if (/^(\d)\1+$/.test(digits)) return false;
	return luhnValid(digits);
}

export function ibanValid(match: string): boolean {
	const iban = match.replace(/ /g, "").toUpperCase();
	if (iban.length < 15 || iban.length > 34) return false;
	const rearranged = iban.slice(4) + iban.slice(0, 4);
	let rem = 0;
	for (const ch of rearranged) {
		const code = ch.charCodeAt(0);
		const val = code >= 65 && code <= 90 ? String(code - 55) : ch;
		for (const d of val) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
	}
	return rem === 1;
}

// Steuerliche Identifikationsnummer (§ 139b AO): 11 Ziffern, erste ≠ 0, in
// den ersten zehn genau eine Ziffer doppelt oder dreifach, Prüfziffer nach
// ISO 7064 MOD 11,10.
export function deTaxIdValid(id: string): boolean {
	if (!/^[1-9]\d{10}$/.test(id)) return false;
	const counts = new Map<string, number>();
	for (const d of id.slice(0, 10)) counts.set(d, (counts.get(d) ?? 0) + 1);
	const multi = [...counts.values()].filter((n) => n > 1);
	if (multi.length !== 1 || (multi[0] ?? 0) > 3) return false;
	let product = 10;
	for (const d of id.slice(0, 10)) {
		let sum = (Number(d) + product) % 10;
		if (sum === 0) sum = 10;
		product = (sum * 2) % 11;
	}
	let check = 11 - product;
	if (check === 10) check = 0;
	return check === Number(id[10]);
}

const PATTERNS: PatternDetector[] = [
	{
		detector: "private_key",
		category: "secret",
		pattern:
			/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
	},
	{
		detector: "aws_access_key",
		category: "secret",
		pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
	},
	{
		detector: "stripe_secret",
		category: "secret",
		pattern: /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/g,
	},
	{
		detector: "github_token",
		category: "secret",
		pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})\b/g,
	},
	{
		detector: "openai_key",
		category: "secret",
		pattern:
			/\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20})\b/g,
	},
	{
		detector: "anthropic_key",
		category: "secret",
		pattern: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/g,
	},
	{
		detector: "slack_token",
		category: "secret",
		pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
	},
	{
		detector: "sendgrid_key",
		category: "secret",
		pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
	},
	{
		detector: "supabase_service_role",
		category: "secret",
		pattern:
			/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b|\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
		valid: (m) => m.startsWith("sb_secret_") || isServiceRoleJwt(m),
	},
	{
		detector: "google_api_key",
		category: "info",
		pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
	},
	{
		detector: "card_number",
		category: "payment",
		pattern: /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g,
		valid: cardValid,
	},
	{
		detector: "iban",
		category: "bank",
		pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g,
		valid: ibanValid,
	},
	{
		detector: "de_tax_id",
		category: "tax",
		pattern: /(?<!\d)[1-9]\d{10}(?!\d)/g,
		valid: deTaxIdValid,
	},
];

// Lokaler Teil nur ab Wortanfang und höchstens 64 Zeichen (RFC 5321): ohne
// die Grenze probiert die Regex lange Zeichenketten ohne „@“ von jeder
// Position aus neu — quadratisch, ein 2-MB-Upload blockierte den Server.
const EMAIL =
	/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;
const PHONE =
	/(?<![\d+])(?:\+\d{1,3}|00\d{1,3}|0)[ /-]?\(?\d{2,5}\)?(?:[ /-]?\d{2,}){1,4}(?!\d)/g;

function uniqueCount(text: string, re: RegExp, minDigits = 0): number {
	const seen = new Set<string>();
	for (const m of text.matchAll(re)) {
		const key = minDigits ? m[0].replace(/\D/g, "") : m[0].toLowerCase();
		if (minDigits && key.length < minDigits) continue;
		seen.add(key);
	}
	return seen.size;
}

export function scanText(text: string): DlpFinding[] {
	const out: DlpFinding[] = [];
	for (const p of PATTERNS) {
		let count = 0;
		for (const m of text.matchAll(p.pattern)) {
			if (!p.valid || p.valid(m[0])) count += 1;
		}
		if (count > 0)
			out.push({ detector: p.detector, category: p.category, count });
	}
	const emails = uniqueCount(text, EMAIL);
	if (emails > 0)
		out.push({ detector: "email", category: "pii", count: emails });
	const phones = uniqueCount(text, PHONE, 8);
	if (phones > 0)
		out.push({ detector: "phone", category: "pii", count: phones });
	return out;
}
