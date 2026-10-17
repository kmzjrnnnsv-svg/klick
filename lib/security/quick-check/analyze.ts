import type { FindingSeverity } from "@/db/schema/enums";
import { type DlpDetector, scanText } from "@/lib/dlp/detectors";
import { emptyFinding, type NormalizedFinding } from "../types";
import type { TlsInfo } from "./fetcher";

// Auswertungen des passiven Schnellchecks — rein, je Quelle eine Funktion.
// Geprüft wird nur, was jeder Browser ohnehin lädt: Header, Cookies, TLS,
// DNS-Einträge, security.txt, ausgelieferte JavaScript-Dateien und deren
// Source-Maps. Secret-Treffer nennen Detektor und Anzahl, nie den Wert.

type Headers = Record<string, string | string[] | undefined>;
const h1 = (h: Headers, k: string) => {
	const v = h[k];
	return Array.isArray(v) ? v.join(", ") : (v ?? null);
};
const f = (
	ruleId: string,
	title: string,
	severity: FindingSeverity,
	category: NormalizedFinding["category"],
	location: string | null,
	description: string,
	remediation: string,
): NormalizedFinding =>
	emptyFinding({
		ruleId: `qc-${ruleId}`,
		title,
		severity,
		category,
		location,
		description,
		remediation,
	});

// ── Header ─────────────────────────────────────────────────────────────────

export function analyzeHeaders(
	url: string,
	headers: Headers,
): NormalizedFinding[] {
	const out: NormalizedFinding[] = [];
	const https = url.startsWith("https:");
	if (!https)
		out.push(
			f(
				"no-https",
				"Seite wird ohne Verschlüsselung (HTTP) ausgeliefert",
				"high",
				"tls",
				url,
				"Der Abruf endete auf einer HTTP-Adresse — Zugangsdaten und Sitzungen sind im Netz mitlesbar.",
				"Auf HTTPS umleiten (301) und HSTS setzen.",
			),
		);
	const hsts = h1(headers, "strict-transport-security");
	if (https && !hsts)
		out.push(
			f(
				"hsts-missing",
				"HSTS fehlt",
				"medium",
				"web",
				url,
				"Ohne Strict-Transport-Security kann ein Angreifer im Netz den ersten Aufruf auf HTTP herabstufen.",
				"Header `Strict-Transport-Security: max-age=31536000; includeSubDomains` setzen.",
			),
		);
	else if (https && hsts) {
		const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
		if (age < 15_552_000)
			out.push(
				f(
					"hsts-short",
					"HSTS-Laufzeit unter 180 Tagen",
					"low",
					"web",
					url,
					`max-age=${age} ist kurz; Browser vergessen die Regel schnell.`,
					"max-age auf mindestens ein Jahr (31536000) setzen.",
				),
			);
	}
	const csp = h1(headers, "content-security-policy");
	if (!csp)
		out.push(
			f(
				"csp-missing",
				"Content-Security-Policy fehlt",
				"medium",
				"web",
				url,
				"Ohne CSP richtet eingeschleustes JavaScript (XSS) vollen Schaden an.",
				"CSP mit Nonce oder Hash für Skripte setzen (`script-src 'nonce-…' 'strict-dynamic'`), `object-src 'none'`, `base-uri 'none'`.",
			),
		);
	else {
		const script =
			/script-src([^;]*)/i.exec(csp)?.[1] ??
			/default-src([^;]*)/i.exec(csp)?.[1] ??
			"";
		if (
			/'unsafe-inline'/.test(script) &&
			!/'nonce-|'sha(256|384|512)-/.test(script)
		)
			out.push(
				f(
					"csp-unsafe-inline",
					"CSP erlaubt Inline-Skripte",
					"low",
					"web",
					url,
					"`'unsafe-inline'` in script-src hebt den XSS-Schutz der CSP weitgehend auf.",
					"Inline-Skripte mit Nonce oder Hash erlauben statt 'unsafe-inline'.",
				),
			);
	}
	if ((h1(headers, "x-content-type-options") ?? "").toLowerCase() !== "nosniff")
		out.push(
			f(
				"nosniff",
				"X-Content-Type-Options fehlt",
				"low",
				"web",
				url,
				"Browser raten sonst den Inhaltstyp — hochgeladene Dateien können als Skript laufen.",
				"Header `X-Content-Type-Options: nosniff` setzen.",
			),
		);
	if (!/frame-ancestors/i.test(csp ?? "") && !h1(headers, "x-frame-options"))
		out.push(
			f(
				"clickjacking",
				"Schutz gegen Clickjacking fehlt",
				"medium",
				"web",
				url,
				"Die Seite lässt sich in fremde Seiten einbetten (iframe).",
				"CSP `frame-ancestors 'none'` (oder 'self') bzw. `X-Frame-Options: DENY` setzen.",
			),
		);
	if (!h1(headers, "referrer-policy"))
		out.push(
			f(
				"referrer-policy",
				"Referrer-Policy fehlt",
				"low",
				"web",
				url,
				"Vollständige URLs (mit Tokens in Parametern) können an Dritte gehen.",
				"Header `Referrer-Policy: strict-origin-when-cross-origin` setzen.",
			),
		);
	const disclosed = ["server", "x-powered-by", "x-aspnet-version"]
		.map((k) => h1(headers, k))
		.filter((v): v is string => Boolean(v && /\d/.test(v)));
	if (disclosed.length > 0)
		out.push(
			f(
				"version-disclosure",
				"Software-Versionen im Header sichtbar",
				"low",
				"exposure",
				url,
				`Header verraten Software und Version: ${disclosed.join(", ")}.`,
				"Versionsangaben in Server/X-Powered-By entfernen.",
			),
		);
	if (
		h1(headers, "access-control-allow-origin") === "*" &&
		(h1(headers, "access-control-allow-credentials") ?? "").toLowerCase() ===
			"true"
	)
		out.push(
			f(
				"cors-wildcard",
				"CORS erlaubt jede Herkunft mit Zugangsdaten",
				"medium",
				"config",
				url,
				"Access-Control-Allow-Origin: * zusammen mit Allow-Credentials deutet auf eine zu offene CORS-Konfiguration.",
				"Erlaubte Herkünfte explizit auflisten.",
			),
		);
	return out;
}

// ── Cookies ────────────────────────────────────────────────────────────────

const SESSIONISH = /sess|sid|auth|token|jwt|^sb-|login|remember/i;

export function analyzeCookies(
	url: string,
	setCookie: readonly string[],
): NormalizedFinding[] {
	const https = url.startsWith("https:");
	const noSecure: string[] = [];
	const noHttpOnly: string[] = [];
	const noSameSite: string[] = [];
	for (const c of setCookie) {
		const [pair, ...attrs] = c.split(";");
		const name = (pair ?? "").split("=")[0]?.trim() ?? "";
		if (!name) continue;
		const a = attrs.map((x) => x.trim().toLowerCase());
		if (https && !a.includes("secure")) noSecure.push(name);
		if (SESSIONISH.test(name) && !a.includes("httponly")) noHttpOnly.push(name);
		if (!a.some((x) => x.startsWith("samesite"))) noSameSite.push(name);
	}
	const out: NormalizedFinding[] = [];
	if (noSecure.length)
		out.push(
			f(
				"cookie-secure",
				"Cookies ohne Secure-Flag",
				"medium",
				"config",
				url,
				`Cookies können über HTTP mitgesendet werden: ${noSecure.join(", ")}.`,
				"Alle Cookies mit `Secure` setzen.",
			),
		);
	if (noHttpOnly.length)
		out.push(
			f(
				"cookie-httponly",
				"Sitzungs-Cookies ohne HttpOnly",
				"medium",
				"config",
				url,
				`JavaScript kann diese Cookies lesen (XSS stiehlt die Sitzung): ${noHttpOnly.join(", ")}.`,
				"Sitzungs- und Auth-Cookies mit `HttpOnly` setzen.",
			),
		);
	if (noSameSite.length)
		out.push(
			f(
				"cookie-samesite",
				"Cookies ohne SameSite",
				"low",
				"config",
				url,
				`Kein SameSite-Attribut: ${noSameSite.join(", ")}.`,
				"`SameSite=Lax` (oder Strict) setzen.",
			),
		);
	return out;
}

// ── TLS ────────────────────────────────────────────────────────────────────

export function analyzeTls(
	url: string,
	tls: TlsInfo | null,
	now: Date,
): NormalizedFinding[] {
	if (!tls) return [];
	const out: NormalizedFinding[] = [];
	if (!tls.authorized)
		out.push(
			f(
				"tls-invalid",
				"TLS-Zertifikat ungültig",
				"high",
				"tls",
				url,
				`Browser warnen beim Aufruf (${tls.authError ?? "unbekannter Fehler"}).`,
				"Gültiges Zertifikat einer öffentlichen CA mit vollständiger Kette ausliefern (z. B. Let's Encrypt).",
			),
		);
	if (tls.validTo) {
		const days = Math.floor(
			(new Date(tls.validTo).getTime() - now.getTime()) / 86_400_000,
		);
		if (days < 30)
			out.push(
				f(
					"tls-expiry",
					days < 0
						? "TLS-Zertifikat abgelaufen"
						: `TLS-Zertifikat läuft in ${days} Tagen ab`,
					days < 0 ? "high" : days < 14 ? "medium" : "low",
					"tls",
					url,
					`Gültig bis ${tls.validTo}.`,
					"Automatische Erneuerung (ACME) einrichten und überwachen.",
				),
			);
	}
	if (tls.protocol && /^TLSv1(\.[01])?$/.test(tls.protocol))
		out.push(
			f(
				"tls-old",
				`Veraltetes Protokoll ${tls.protocol}`,
				"high",
				"tls",
				url,
				"TLS 1.0/1.1 gelten als unsicher und sind in Browsern abgeschaltet.",
				"Nur TLS 1.2 und 1.3 anbieten.",
			),
		);
	return out;
}

// ── DNS (E-Mail-Fälschung) ─────────────────────────────────────────────────

export function analyzeDns(
	domain: string,
	dns: { txt: string[] | null; dmarc: string[] | null; caa: boolean | null },
): NormalizedFinding[] {
	const out: NormalizedFinding[] = [];
	const spf = (dns.txt ?? []).find((t) => /^v=spf1/i.test(t));
	if (dns.txt !== null && !spf)
		out.push(
			f(
				"spf-missing",
				"Kein SPF-Eintrag",
				"medium",
				"dns",
				domain,
				"Ohne SPF können Dritte leichter E-Mails im Namen der Domain versenden.",
				"TXT-Eintrag `v=spf1 … -all` mit den erlaubten Versendern anlegen.",
			),
		);
	else if (spf && /\+all\b/i.test(spf))
		out.push(
			f(
				"spf-plus-all",
				"SPF erlaubt jeden Absender (+all)",
				"high",
				"dns",
				domain,
				"`+all` hebt SPF auf.",
				"`-all` oder `~all` verwenden.",
			),
		);
	const dmarc = (dns.dmarc ?? []).find((t) => /^v=DMARC1/i.test(t));
	if (dns.dmarc !== null && !dmarc)
		out.push(
			f(
				"dmarc-missing",
				"Kein DMARC-Eintrag",
				"medium",
				"dns",
				`_dmarc.${domain}`,
				"Empfänger wissen nicht, was mit gefälschten Mails der Domain passieren soll.",
				"TXT-Eintrag `_dmarc` mit `v=DMARC1; p=quarantine; rua=mailto:…` anlegen, später p=reject.",
			),
		);
	else if (dmarc && /p=none/i.test(dmarc))
		out.push(
			f(
				"dmarc-none",
				"DMARC nur im Beobachtungsmodus (p=none)",
				"low",
				"dns",
				`_dmarc.${domain}`,
				"Gefälschte Mails werden nicht abgewiesen.",
				"Nach Auswertung der Berichte auf p=quarantine bzw. p=reject gehen.",
			),
		);
	if (dns.caa === false)
		out.push(
			f(
				"caa-missing",
				"Kein CAA-Eintrag",
				"info",
				"dns",
				domain,
				"Jede CA darf Zertifikate für die Domain ausstellen.",
				'CAA-Eintrag für die genutzte CA anlegen (z. B. `0 issue "letsencrypt.org"`).',
			),
		);
	return out;
}

// ── security.txt (CVD, CRA Anhang I Teil II Nr. 5) ─────────────────────────

export function analyzeSecurityTxt(
	url: string,
	res: { status: number; body: string } | null,
	now: Date,
): NormalizedFinding[] {
	if (!res || res.status !== 200 || !/^\s*contact:/im.test(res.body))
		return [
			f(
				"security-txt",
				"Keine security.txt",
				"low",
				"config",
				url,
				"Forschende finden keinen Meldeweg für Schwachstellen (RFC 9116; für Produkte nach CRA Pflicht).",
				"`/.well-known/security.txt` mit Contact, Expires und Policy veröffentlichen (Vorlage in Klick).",
			),
		];
	const exp = /^\s*expires:\s*(.+)$/im.exec(res.body)?.[1];
	if (exp && new Date(exp.trim()) < now)
		return [
			f(
				"security-txt-expired",
				"security.txt abgelaufen",
				"low",
				"config",
				url,
				`Expires ${exp.trim()} liegt in der Vergangenheit.`,
				"Expires erneuern (höchstens ein Jahr in die Zukunft).",
			),
		];
	return [];
}

// ── JavaScript-Bundles: Secrets und Source-Maps ────────────────────────────

const CRITICAL_SECRETS = new Set<DlpDetector>([
	"private_key",
	"aws_access_key",
	"stripe_secret",
	"github_token",
	"openai_key",
	"anthropic_key",
	"slack_token",
	"sendgrid_key",
	"supabase_service_role",
]);

const DETECTOR_LABEL: Partial<Record<DlpDetector, string>> = {
	private_key: "privater Schlüssel",
	aws_access_key: "AWS-Zugangsschlüssel",
	stripe_secret: "Stripe-Live-Secret",
	github_token: "GitHub-Token",
	openai_key: "OpenAI-API-Key",
	anthropic_key: "Anthropic-API-Key",
	slack_token: "Slack-Token",
	sendgrid_key: "SendGrid-Key",
	supabase_service_role: "Supabase service_role-Key",
};

export function analyzeBundles(
	bundles: readonly { url: string; text: string }[],
): NormalizedFinding[] {
	const out: NormalizedFinding[] = [];
	for (const b of bundles)
		for (const hit of scanText(b.text)) {
			if (!CRITICAL_SECRETS.has(hit.detector)) continue;
			const label = DETECTOR_LABEL[hit.detector] ?? hit.detector;
			out.push(
				emptyFinding({
					ruleId: `qc-bundle-${hit.detector}`,
					title: `Secret im ausgelieferten JavaScript: ${label}`,
					severity: "critical",
					category: "secret",
					location: b.url,
					description:
						hit.detector === "supabase_service_role"
							? "Der service_role-Key umgeht Row Level Security — wer ihn aus dem Browser-Bundle liest, hat vollen Datenbankzugriff. Typischer Fehler bei KI-gebauten Apps."
							: `Ein ${label} steckt im JavaScript, das jeder Besucher lädt.`,
					remediation:
						"Schlüssel sofort widerrufen und neu ausstellen; Aufrufe mit Secrets nur serverseitig (API-Route/Edge-Funktion); im Browser nur öffentliche Keys (z. B. Supabase anon mit RLS).",
					evidence: `${hit.count} Treffer (Wert nicht gespeichert)`,
				}),
			);
		}
	return out;
}

export function analyzeSourceMaps(
	maps: readonly { url: string; exposed: boolean }[],
): NormalizedFinding[] {
	const exposed = maps.filter((m) => m.exposed);
	if (exposed.length === 0) return [];
	return [
		emptyFinding({
			ruleId: "qc-sourcemap",
			title: "Source-Maps öffentlich abrufbar",
			severity: "medium",
			category: "exposure",
			location: exposed[0]?.url ?? null,
			description: `${exposed.length} Source-Map(s) liefern den Original-Quellcode inklusive Kommentaren und interner Pfade.`,
			remediation:
				"Source-Maps nicht ausliefern (z. B. `productionBrowserSourceMaps: false`) oder nur an das Fehler-Tracking hochladen.",
		}),
	];
}

// Skripte derselben Herkunft aus dem HTML (src und modulepreload).
export function scriptUrls(html: string, base: string, limit = 15): string[] {
	const out = new Set<string>();
	const origin = new URL(base).origin;
	const re =
		/<(?:script[^>]*\bsrc|link[^>]*rel=["']?modulepreload["']?[^>]*\bhref)=["']([^"']+)["']/gi;
	for (const m of html.matchAll(re)) {
		if (out.size >= limit) break;
		try {
			const u = new URL(m[1] ?? "", base);
			if (u.origin === origin) out.add(u.toString());
		} catch {
			// ungültige URL im HTML ignorieren
		}
	}
	return [...out];
}

export function sourceMapUrl(js: string, base: string): string | null {
	const m = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m.exec(js.slice(-2000));
	if (!m?.[1] || m[1].startsWith("data:")) return null;
	try {
		return new URL(m[1], base).toString();
	} catch {
		return null;
	}
}
