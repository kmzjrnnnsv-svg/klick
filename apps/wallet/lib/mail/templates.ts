import { baseURL } from "@wallet/lib/auth/config";
import { PLATFORM_MAIL } from "@/lib/mail/address";
import { escapeHtml, textToHtml } from "@/lib/mail/html";
import { type SendOutcome, sendTransactionalMail } from "@/lib/mail/send";

// Mails von both.money: eigener Absender (WALLET_MAIL_FROM) und Impressum
// unter both.money; Pflichtangaben hängt lib/mail/send.ts an.

export type WalletMail = { subject: string; text: string; html: string };

export function walletMail(input: {
	subject: string;
	title: string;
	body: string;
	cta?: { label: string; url: string };
}): WalletMail {
	const text = [
		input.title,
		"",
		input.body,
		...(input.cta ? ["", `${input.cta.label}: ${input.cta.url}`] : []),
	].join("\n");
	// Stil wie die App (Apple HIG): systemgrauer Grund, weiße Karte,
	// Systemschrift, Knopf als Kapsel im Akzentblau
	const cta =
		input.cta && /^https?:\/\//i.test(input.cta.url) ? input.cta : null;
	const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1c1c1e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f7;padding:40px 16px">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
<tr><td style="padding:0 8px 20px 8px;text-align:center"><p style="margin:0;font-size:17px;font-weight:700;color:#1c1c1e">both.money</p></td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px">
<h1 style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:#1c1c1e">${escapeHtml(input.title)}</h1>
<div style="margin:12px 0 0 0;font-size:16px;line-height:1.45;color:#1c1c1e">${textToHtml(input.body)}</div>
${cta ? `<p style="margin:28px 0 0 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#0a63d6;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-size:16px;font-weight:600">${escapeHtml(cta.label)}</a></p>` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
	return { subject: input.subject, text, html };
}

export async function sendWalletMail(
	to: string,
	mail: WalletMail,
): Promise<SendOutcome> {
	return sendTransactionalMail({
		to,
		...mail,
		from: process.env.WALLET_MAIL_FROM || `both.money <${PLATFORM_MAIL}>`,
		imprintUrl: `${baseURL}/imprint`,
	});
}

export function invitationMail(input: {
	url: string;
	organization: string;
	role: string;
	inviter: string | null;
}): WalletMail {
	return walletMail({
		subject: `Einladung zu ${input.organization} bei both.money`,
		title: `Einladung zu ${input.organization}`,
		body: `${input.inviter ? `${input.inviter} lädt dich als ${input.role} zu ${input.organization} bei both.money ein.` : `Du bist als ${input.role} zu ${input.organization} bei both.money eingeladen.`}\n\nÖffne den Link und lege einen Passkey an (Fingerabdruck, Gesicht oder Geräte-PIN). Der Link gilt 72 Stunden.`,
		cta: { label: "Einladung öffnen", url: input.url },
	});
}
