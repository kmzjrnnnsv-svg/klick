// Generic transactional mail helper. Wraps Nodemailer behind the same
// SMTP_* env vars used by Auth.js's magic-link flow. No-op (logs to
// console) when SMTP isn't configured — devs see "would have sent X".
//
// Failures are swallowed so a flaky mail server doesn't break the calling
// flow (matches, interest decisions etc.).

export type SendMailInput = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

export async function sendTransactionalMail(
	input: SendMailInput,
): Promise<void> {
	if (!process.env.SMTP_HOST) {
		console.log(
			`\n┌──── Mail (no SMTP, would-send) ─────\n│ to:      ${input.to}\n│ subject: ${input.subject}\n│ body:    ${input.text.slice(0, 200)}\n└─────────────────────────────────────\n`,
		);
		return;
	}
	try {
		const nodemailer = await import("nodemailer");
		const port = Number(process.env.SMTP_PORT ?? 465);
		const transport = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port,
			secure: port === 465,
			auth:
				process.env.SMTP_USER && process.env.SMTP_PASS
					? {
							user: process.env.SMTP_USER,
							pass: process.env.SMTP_PASS,
						}
					: undefined,
		});
		await transport.sendMail({
			to: input.to,
			from: process.env.MAIL_FROM ?? "noreply@klick.local",
			subject: input.subject,
			text: input.text,
			html: input.html,
		});
	} catch (e) {
		console.error("[mail] sendTransactionalMail failed", e);
	}
}
