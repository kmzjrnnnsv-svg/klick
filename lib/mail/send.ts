// Mail-Helper mit drei Zustellwegen. Nie wirft eine Exception nach außen —
// Failures werden geloggt, der Aufrufer läuft weiter.
//
// Reihenfolge:
//   1. RESEND_API_KEY → HTTPS-POST an api.resend.com (umgeht SMTP-Blocks
//      bei Hetzner/Cloudflare/etc., kein offener Port nötig).
//   2. SMTP_HOST       → klassischer Nodemailer-Pfad.
//   3. sonst           → Konsole-Log (Dev-Mock, sichtbar in journalctl).

export type SendMailInput = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

const FROM_FALLBACK = "Klick <noreply@klick.local>";

function fromAddress(): string {
	return process.env.MAIL_FROM ?? FROM_FALLBACK;
}

function logToConsole(input: SendMailInput, reason: string): void {
	console.log(
		`\n┌──── Mail (${reason}) ──────────────────────\n│ to:      ${input.to}\n│ from:    ${fromAddress()}\n│ subject: ${input.subject}\n│ body:    ${input.text.slice(0, 240).replace(/\n/g, "\n│         ")}\n└────────────────────────────────────────────\n`,
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
			from: fromAddress(),
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
		from: fromAddress(),
		subject: input.subject,
		text: input.text,
		html: input.html,
	});
}

// Reports which path was actually used. Helpful for diagnosing why mail
// "didn't arrive": you see in journalctl whether Resend was tried, whether
// SMTP fell back, whether MAIL_FROM was missing.
export type SendOutcome =
	| { path: "resend"; ok: true }
	| { path: "smtp"; ok: true }
	| { path: "console"; ok: true; reason: string }
	| { path: "resend" | "smtp" | "console"; ok: false; error: string };

export async function sendTransactionalMail(
	input: SendMailInput,
): Promise<SendOutcome> {
	const from = fromAddress();
	const fromIsFallback = from === FROM_FALLBACK;

	if (process.env.RESEND_API_KEY) {
		if (fromIsFallback) {
			console.warn(
				"[mail] MAIL_FROM not set — Resend will likely reject sender. Set MAIL_FROM to a verified address.",
			);
		}
		try {
			await sendViaResend(input);
			console.log(
				`[mail] ✓ resend ok · to=${input.to} subject="${input.subject}" from=${from}`,
			);
			return { path: "resend", ok: true };
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			console.error(`[mail] ✗ resend failed (${error}), falling back…`);
			if (!process.env.SMTP_HOST) {
				logToConsole(input, `resend failed: ${error}`);
				return { path: "console", ok: true, reason: `resend_failed:${error}` };
			}
		}
	}
	if (process.env.SMTP_HOST) {
		if (fromIsFallback) {
			console.warn(
				"[mail] MAIL_FROM not set — SMTP server will likely reject sender. Set MAIL_FROM to match SMTP_USER's domain.",
			);
		}
		try {
			await sendViaSmtp(input);
			console.log(
				`[mail] ✓ smtp ok · to=${input.to} subject="${input.subject}" from=${from} host=${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}`,
			);
			return { path: "smtp", ok: true };
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			console.error(`[mail] ✗ smtp failed (${error}), logging to console…`);
			logToConsole(input, `smtp failed: ${error}`);
			return { path: "console", ok: true, reason: `smtp_failed:${error}` };
		}
	}
	logToConsole(
		input,
		"no provider configured (set RESEND_API_KEY or SMTP_HOST)",
	);
	return {
		path: "console",
		ok: true,
		reason: "no_provider",
	};
}

// Explicit diagnostic — call from a script or admin endpoint to verify the
// configured mail path without actually triggering an auth flow.
export async function diagnoseMailConfig(): Promise<{
	mailFrom: string;
	mailFromIsFallback: boolean;
	hasResendKey: boolean;
	hasSmtpHost: boolean;
	smtpHost?: string;
	smtpPort?: number;
	likelyPath: "resend" | "smtp" | "console";
}> {
	const from = fromAddress();
	const hasResend = !!process.env.RESEND_API_KEY;
	const hasSmtp = !!process.env.SMTP_HOST;
	return {
		mailFrom: from,
		mailFromIsFallback: from === FROM_FALLBACK,
		hasResendKey: hasResend,
		hasSmtpHost: hasSmtp,
		smtpHost: process.env.SMTP_HOST,
		smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
		likelyPath: hasResend ? "resend" : hasSmtp ? "smtp" : "console",
	};
}
