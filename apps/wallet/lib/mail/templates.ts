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
	const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1c1c1c">
<p style="font-size:20px;color:#004296;margin:0 0 16px">both.money</p>
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(input.title)}</h1>
<div style="font-size:15px;line-height:1.5">${textToHtml(input.body)}</div>
${input.cta ? `<p style="margin:20px 0"><a href="${escapeHtml(input.cta.url)}" style="background:#004296;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(input.cta.label)}</a></p>` : ""}
</div>`;
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
