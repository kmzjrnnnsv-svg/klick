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
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 15_000,
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

export async function sendTransactionalMail(
	input: SendMailInput,
): Promise<void> {
	if (process.env.RESEND_API_KEY) {
		try {
			await sendViaResend(input);
			return;
		} catch (e) {
			console.error("[mail] resend failed, falling back:", e);
		}
	}
	if (process.env.SMTP_HOST) {
		try {
			await sendViaSmtp(input);
			return;
		} catch (e) {
			console.error("[mail] smtp failed, logging to console:", e);
		}
	}
	logToConsole(input, "no provider configured");
}
