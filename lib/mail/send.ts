// Mail-Helper mit mehreren Zustellwegen. Nie wirft eine Exception nach
// außen — Failures werden geloggt, der Aufrufer läuft weiter.
//
// Reihenfolge (scheitert ein Weg, kommt der nächste konfigurierte dran):
//   1. BREVO_API_KEY  → HTTPS-POST an api.brevo.com (EU-Anbieter, Frankreich)
//      Umgeht SMTP-Sperren und -Logins (nur ausgehend 443 nötig).
//   2. SMTP_HOST       → klassischer Nodemailer-Pfad (z. B. Brevo-Relay).
//   3. RESEND_API_KEY → api.resend.com (USA) — nur mit MAIL_ALLOW_RESEND=true,
//      weil die Datenschutzerklärung sonst keinen US-Empfänger nennt.
//   4. sonst           → Konsole-Log (Dev-Mock). In Produktion nur Metadaten:
//      Body (Magic-Links, Einladungen) landet nie im Log, der Versand zählt
//      als fehlgeschlagen (Digest versucht es erneut).

import { legalEntityFrom, legalMailLines } from "@/lib/legal/entity";
import { MAIL_FROM_DEFAULT, PLATFORM_MAIL } from "./address";
import { escapeHtml, textToHtml } from "./html";

export type SendMailInput = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	// Absender und Impressum je App (both.money); ohne Angabe gilt Klick
	from?: string;
	imprintUrl?: string;
};

// Ohne MAIL_FROM gilt die Plattform-Adresse (lib/mail/address.ts).
function fromAddress(input?: Pick<SendMailInput, "from">): string {
	return input?.from || process.env.MAIL_FROM || MAIL_FROM_DEFAULT;
}

// „Klick <no-reply@raza.work>“ → { name, email } — Brevo will beides getrennt.
export function parseFrom(from: string): { name?: string; email: string } {
	const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/.exec(from);
	if (!m?.[2]) return { email: from.trim() };
	return m[1] ? { name: m[1].trim(), email: m[2] } : { email: m[2] };
}

const isProd = (): boolean => process.env.NODE_ENV === "production";

function logToConsole(input: SendMailInput, reason: string): void {
	if (isProd()) {
		console.error(
			`[mail] ✗ nicht zugestellt (${reason}) · to=${input.to} subject="${input.subject}" — Inhalt bewusst nicht geloggt`,
		);
		return;
	}
	console.log(
		`\n┌──── Mail (${reason}) ──────────────────────\n│ to:      ${input.to}\n│ from:    ${fromAddress(input)}\n│ subject: ${input.subject}\n│ body:    ${input.text.slice(0, 240).replace(/\n/g, "\n│         ")}\n└────────────────────────────────────────────\n`,
	);
}

async function sendViaResend(input: SendMailInput): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) throw new Error("no_resend");
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: fromAddress(input),
			to: [input.to],
			subject: input.subject,
			text: input.text,
			html: input.html,
		}),
		signal: AbortSignal.timeout(8_000),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`resend_${res.status}:${body.slice(0, 200)}`);
	}
}

async function sendViaBrevo(input: SendMailInput): Promise<void> {
	const apiKey = process.env.BREVO_API_KEY;
	if (!apiKey) throw new Error("no_brevo");
	const res = await fetch("https://api.brevo.com/v3/smtp/email", {
		method: "POST",
		headers: {
			"api-key": apiKey,
			accept: "application/json",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			sender: parseFrom(fromAddress(input)),
			to: [{ email: input.to }],
			subject: input.subject,
			textContent: input.text,
			htmlContent: input.html ?? textToHtml(input.text),
		}),
		signal: AbortSignal.timeout(8_000),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`brevo_${res.status}:${body.slice(0, 200)}`);
	}
}

async function sendViaSmtp(input: SendMailInput): Promise<void> {
	if (!process.env.SMTP_HOST) throw new Error("no_smtp");
	const nodemailer = await import("nodemailer");
	const port = Number(process.env.SMTP_PORT ?? 587);
	const transport = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port,
		secure: port === 465,
		connectionTimeout: 5_000,
		greetingTimeout: 5_000,
		socketTimeout: 10_000,
		auth:
			process.env.SMTP_USER && process.env.SMTP_PASS
				? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
				: undefined,
	});
	await transport.sendMail({
		to: input.to,
		from: fromAddress(input),
		subject: input.subject,
		text: input.text,
		html: input.html,
	});
}

// Reports which path was actually used. Helpful for diagnosing why mail
// "didn't arrive": you see in journalctl which path was tried, whether it
// fell back, whether MAIL_FROM was missing.
type MailPath = "resend" | "brevo" | "smtp";

export type SendOutcome =
	| { path: MailPath; ok: true }
	| { path: "console"; ok: true; reason: string }
	| { path: MailPath | "console"; ok: false; error: string };

const resendAllowed = (): boolean =>
	process.env.MAIL_ALLOW_RESEND === "true" && !!process.env.RESEND_API_KEY;

const PROVIDERS: {
	path: MailPath;
	enabled: () => boolean;
	send: (input: SendMailInput) => Promise<void>;
}[] = [
	{
		path: "brevo",
		enabled: () => !!process.env.BREVO_API_KEY,
		send: sendViaBrevo,
	},
	{ path: "smtp", enabled: () => !!process.env.SMTP_HOST, send: sendViaSmtp },
	{ path: "resend", enabled: resendAllowed, send: sendViaResend },
];

// Pflichtangaben der Gesellschaft (§ 35a GmbHG, § 37a HGB) und Link zum
// Impressum unter jeder Mail — einmal hier statt in jeder Vorlage. Pure.
export function withLegalFooter(
	input: SendMailInput,
	env: Record<string, string | undefined> = process.env,
): SendMailInput {
	const lines = legalMailLines(
		legalEntityFrom({
			...env,
			LEGAL_CONTACT_MAIL: env.LEGAL_CONTACT_MAIL || PLATFORM_MAIL,
		}),
	);
	const base = (env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
	const imprint =
		input.imprintUrl ??
		(/^https?:\/\//.test(base) ? `${base}/impressum` : null);
	if (imprint) lines.push(`Impressum: ${imprint}`);
	if (lines.length === 0) return input;
	const text = `${input.text}\n\n—\n${lines.join("\n")}`;
	if (!input.html) return { ...input, text };
	const block = `<p style="margin:32px auto 0;max-width:560px;padding:16px 8px 0;border-top:1px solid #d8cfbd;font-size:11px;line-height:1.6;color:#6b5e4a;text-align:center">${lines.map(escapeHtml).join("<br>")}</p>`;
	const html = input.html.includes("</body>")
		? input.html.replace("</body>", `${block}\n</body>`)
		: `${input.html}\n${block}`;
	return { ...input, text, html };
}

export async function sendTransactionalMail(
	raw: SendMailInput,
): Promise<SendOutcome> {
	const input = withLegalFooter(raw);
	const from = fromAddress(input);
	const active = PROVIDERS.filter((p) => p.enabled());
	let last: { path: MailPath; error: string } | null = null;
	for (const [i, provider] of active.entries()) {
		try {
			await provider.send(input);
			const host =
				provider.path === "smtp"
					? ` host=${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}`
					: "";
			console.log(
				`[mail] ✓ ${provider.path} ok · to=${input.to} subject="${input.subject}" from=${from}${host}`,
			);
			return { path: provider.path, ok: true };
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			const next = active[i + 1];
			console.error(
				`[mail] ✗ ${provider.path} failed (${error}), ${next ? `falling back to ${next.path}…` : "logging to console…"}`,
			);
			last = { path: provider.path, error };
		}
	}
	if (last) {
		logToConsole(input, `${last.path} failed: ${last.error}`);
		return consoleOutcome(`${last.path}_failed:${last.error}`);
	}
	logToConsole(
		input,
		"no provider configured (set BREVO_API_KEY or SMTP_HOST)",
	);
	return consoleOutcome("no_provider");
}

// Dev: Konsole ist der Zustellweg. Prod: nichts zugestellt → ok: false.
function consoleOutcome(reason: string): SendOutcome {
	return isProd()
		? { path: "console", ok: false, error: reason }
		: { path: "console", ok: true, reason };
}

// Explicit diagnostic — call from a script or admin endpoint to verify the
// configured mail path without actually triggering an auth flow.
export async function diagnoseMailConfig(): Promise<{
	mailFrom: string;
	hasResendKey: boolean;
	resendAllowed: boolean;
	hasBrevoKey: boolean;
	hasSmtpHost: boolean;
	smtpHost?: string;
	smtpPort?: number;
	likelyPath: MailPath | "console";
}> {
	const from = fromAddress();
	return {
		mailFrom: from,
		hasResendKey: !!process.env.RESEND_API_KEY,
		resendAllowed: resendAllowed(),
		hasBrevoKey: !!process.env.BREVO_API_KEY,
		hasSmtpHost: !!process.env.SMTP_HOST,
		smtpHost: process.env.SMTP_HOST,
		smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
		likelyPath: PROVIDERS.find((p) => p.enabled())?.path ?? "console",
	};
}

// Klartext-Hinweis zu einem Zustellfehler (pnpm mail:check, Startlog). Pure.
export function mailErrorHint(
	error: string,
	cfg: { smtpPort?: number },
): string | null {
	// sendTransactionalMail meldet Fehler als „<weg>_failed:…“.
	const e = error.toLowerCase().replace(/^(resend|brevo|smtp)_failed:/, "");
	if (e === "no_provider")
		return "Kein Zustellweg — BREVO_API_KEY, RESEND_API_KEY oder SMTP_HOST setzen (/etc/klick/klick.env).";
	if (e.startsWith("resend_401") || e.startsWith("resend_403")) {
		return e.includes("domain") || e.includes("verif")
			? "Resend: Absender-Domain ist nicht verifiziert — Domain in Resend verifizieren oder MAIL_FROM anpassen."
			: "Resend: API-Schlüssel ungültig oder ohne Senderecht — RESEND_API_KEY prüfen.";
	}
	if (e.startsWith("resend_422"))
		return "Resend: Anfrage abgelehnt — meist ein ungültiges MAIL_FROM (Format „Name <adresse@domain>“).";
	if (e.startsWith("brevo_401") || e.startsWith("brevo_403")) {
		return e.includes("ip address") || e.includes("unrecognised ip")
			? "Brevo: Die IP des Servers ist nicht freigegeben — in Brevo unter Sicherheit → Autorisierte IPs freigeben (oder die IP-Sperre abschalten)."
			: "Brevo: API-Schlüssel ungültig oder Konto ohne Transaktionsversand — BREVO_API_KEY prüfen (Brevo → SMTP & API → API-Schlüssel).";
	}
	if (e.startsWith("brevo_400")) {
		return e.includes("sender")
			? `Brevo: Absender nicht freigegeben — Domain in Brevo unter Absender & Domains authentifizieren und ${PLATFORM_MAIL} als Absender bestätigen (MAIL_FROM leer lassen oder „${MAIL_FROM_DEFAULT}“).`
			: "Brevo: Anfrage abgelehnt — MAIL_FROM im Format „Name <adresse@domain>“ prüfen.";
	}
	// Netzfehler der HTTPS-Wege (fetch wirft ohne Statuscode)
	if (
		/^(resend|brevo)_failed:/i.test(error) &&
		(e.includes("timeout") || e.includes("fetch failed"))
	)
		return "Mail-API nicht erreichbar — ausgehendes HTTPS (Port 443) des Servers prüfen.";
	if (
		e.includes("timeout") ||
		e.includes("etimedout") ||
		e.includes("econnrefused")
	) {
		return cfg.smtpPort === 25 || cfg.smtpPort === 465
			? `Port ${cfg.smtpPort} ist bei Hetzner ausgehend gesperrt — SMTP_PORT=587 (STARTTLS) nutzen oder Brevo über HTTPS (BREVO_API_KEY).`
			: "Mailserver nicht erreichbar — Host/Port und ausgehende Verbindungen des Servers prüfen.";
	}
	if (e.includes("enotfound") || e.includes("eai_again"))
		return "Hostname nicht auflösbar — SMTP_HOST prüfen.";
	if (
		e.includes("535") ||
		e.includes("invalid login") ||
		e.includes("authentication")
	)
		return "SMTP-Anmeldung abgelehnt — SMTP_USER (meist die volle Postfach-Adresse) und das Passwort im systemd-Credential smtp_pass prüfen. Aliasse und Weiterleitungen können sich nicht anmelden; Brevo verlangt den SMTP-Schlüssel statt des Konto-Passworts.";
	if (e.includes("sender") || e.includes("550") || e.includes("553"))
		return `Absender abgelehnt — ${PLATFORM_MAIL} (bzw. MAIL_FROM) muss beim Provider als Absender verifiziert sein.`;
	return null;
}
