// HTML/Text-Templates für transaktionale Mails. Eigenes Modul, damit Auth.js
// und andere Stellen denselben Stil teilen.
//
// Editorial-Stil im Sinne der App: Cremeweiß-Hintergrund, Cocoa-Text,
// Cormorant Garamond für Headlines (mit Georgia-Fallback, da Mail-Clients
// keine externen Schriften laden), Jost/Futura-Fallback für Body und
// uppercase-Eyebrow-Labels. Wirkt auf Apple Mail / Outlook / Gmail
// gleichermaßen.

import { roleLabel } from "@/lib/auth/memberships";

const CREAM = "#f7f3ec";
const COCOA = "#211c14";
const STONE = "#6b5e4a";
const BORDER = "#d8cfbd";
const GOLD = "#6a4a2a";
const TAGLINE = "Maison Klick — Compliance, die zusammenpasst.";

import { escapeHtml, textToHtml } from "./html";

export { escapeHtml, textToHtml } from "./html";

// Nur http(s)-Ziele als Button-Link; alles andere fällt weg.
function safeHref(url: string): string | null {
	return /^https?:\/\//i.test(url) ? escapeHtml(url) : null;
}

export function magicLinkEmail(input: { url: string; host: string }): {
	subject: string;
	text: string;
	html: string;
} {
	const { url, host } = input;
	const hostHtml = escapeHtml(host);
	const urlHtml = escapeHtml(url);

	const subject = `Dein Anmelde-Link für ${host}`;

	const text = [
		`Anmelden bei ${host}`,
		``,
		`Klick auf den Link, um dich einzuloggen — du brauchst kein Passwort.`,
		``,
		url,
		``,
		`Der Link ist 15 Minuten gültig und einmalig nutzbar.`,
		`Wenn du das nicht angefordert hast, ignoriere diese Mail einfach.`,
		``,
		`— ${TAGLINE}`,
	].join("\n");

	const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'Jost','Futura','Century Gothic',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${COCOA}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:48px 16px">
	<tr>
		<td align="center">
			<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${CREAM}">
				<tr>
					<td style="padding:0 8px 32px 8px;text-align:center">
						<p style="margin:0;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${STONE};font-weight:600">
							Klick
						</p>
						<p style="margin:6px 0 0 0;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${STONE}">
							Maison Klick — Est. 2026
						</p>
					</td>
				</tr>
				<tr>
					<td style="background:#ffffff;border:1px solid ${BORDER};border-radius:2px;padding:48px 40px">
						<p style="margin:0;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};font-weight:500">
							Anmeldung
						</p>
						<h1 style="margin:14px 0 0 0;font-family:'Cormorant Garamond','Didot','Bodoni 72','Hoefler Text',Cambria,Georgia,serif;font-size:36px;line-height:1.05;font-weight:500;letter-spacing:-0.005em;color:${COCOA}">
							Schön, dass du da bist.
						</h1>
						<p style="margin:18px 0 0 0;font-size:15px;line-height:1.65;color:${COCOA};opacity:0.85">
							Klick auf den Button, um dich einzuloggen — du brauchst kein Passwort und kein Konto-Setup.
						</p>
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 12px 0">
							<tr>
								<td align="center">
									<a href="${urlHtml}"
										style="display:inline-block;background:${COCOA};color:${CREAM};padding:16px 40px;border-radius:2px;text-decoration:none;font-size:11px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase">
										Bei ${hostHtml} anmelden
									</a>
								</td>
							</tr>
						</table>
						<p style="margin:0;font-size:11px;line-height:1.6;color:${STONE};text-align:center">
							Der Link ist 15 Minuten gültig und einmalig nutzbar.
						</p>
						<hr style="border:0;border-top:1px solid ${BORDER};margin:36px 0">
						<p style="margin:0;font-size:11px;color:${STONE};line-height:1.6">
							Funktioniert der Button nicht? Kopiere diesen Link in deinen Browser:
						</p>
						<p style="margin:8px 0 0 0;font-family:'JetBrains Mono','SFMono-Regular','Menlo',monospace;font-size:11px;line-height:1.5;color:${COCOA};word-break:break-all;background:${CREAM};padding:10px 12px;border-radius:2px">
							${urlHtml}
						</p>
					</td>
				</tr>
				<tr>
					<td style="padding:24px 8px 0 8px;text-align:center">
						<p style="margin:0;font-size:11px;line-height:1.6;color:${STONE}">
							Du hast diese Mail nicht angefordert? Ignoriere sie — niemand
							kommt damit in dein Konto, ohne den Link zu öffnen.
						</p>
						<p style="margin:18px 0 0 0;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:${STONE};opacity:0.7">
							${TAGLINE}
						</p>
					</td>
				</tr>
			</table>
		</td>
	</tr>
</table>
</body>
</html>`;

	return { subject, text, html };
}

// Generischer Wrapper im selben Stil — für Benachrichtigungen, Digest,
// Sicherheits- und Löschmails. `body` ist Klartext (wird escaped, Umbrüche
// bleiben); `bodyHtml` nur für bereits escapetes HTML (Digest).
export function transactionalEmail(input: {
	subject: string;
	preheader?: string;
	eyebrow?: string;
	title: string;
	body: string;
	bodyHtml?: string;
	cta?: { label: string; url: string };
	footnote?: string;
}): { subject: string; text: string; html: string } {
	const { subject, eyebrow, title, body, bodyHtml, cta, footnote, preheader } =
		input;
	const ctaHref = cta ? safeHref(cta.url) : null;

	const text = [
		title,
		"",
		body,
		"",
		cta && ctaHref ? `${cta.label}: ${cta.url}` : "",
		"",
		footnote ?? `— ${TAGLINE}`,
	]
		.filter((l) => l !== "")
		.join("\n");

	const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'Jost','Futura','Century Gothic',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${COCOA}">
${preheader ? `<div style="display:none;font-size:1px;color:${CREAM};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:48px 16px">
	<tr>
		<td align="center">
			<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
				<tr>
					<td style="padding:0 8px 28px 8px;text-align:center">
						<p style="margin:0;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${STONE};font-weight:600">Klick</p>
					</td>
				</tr>
				<tr>
					<td style="background:#ffffff;border:1px solid ${BORDER};border-radius:2px;padding:40px 36px">
						${eyebrow ? `<p style="margin:0;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};font-weight:500">${escapeHtml(eyebrow)}</p>` : ""}
						<h1 style="margin:${eyebrow ? "12px" : "0"} 0 0 0;font-family:'Cormorant Garamond','Didot','Hoefler Text',Cambria,Georgia,serif;font-size:30px;line-height:1.1;font-weight:500;color:${COCOA}">${escapeHtml(title)}</h1>
						<div style="margin:18px 0 0 0;font-size:14px;line-height:1.65;color:${COCOA};opacity:0.85">${bodyHtml ?? textToHtml(body)}</div>
						${
							cta && ctaHref
								? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0">
							<tr><td align="left">
								<a href="${ctaHref}" style="display:inline-block;background:${COCOA};color:${CREAM};padding:14px 32px;border-radius:2px;text-decoration:none;font-size:11px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase">${escapeHtml(cta.label)}</a>
							</td></tr>
						</table>`
								: ""
						}
					</td>
				</tr>
				<tr>
					<td style="padding:20px 8px 0 8px;text-align:center">
						<p style="margin:0;font-size:11px;color:${STONE};line-height:1.6">${escapeHtml(footnote ?? TAGLINE)}</p>
					</td>
				</tr>
			</table>
		</td>
	</tr>
</table>
</body>
</html>`;

	return { subject, text, html };
}

// Einladung in eine Organisation (Better Auth organization-Plugin).
export function invitationEmail(input: {
	url: string;
	organization: string;
	inviter: string;
	role: string;
}): { subject: string; text: string; html: string } {
	return transactionalEmail({
		subject: `Einladung zu ${input.organization}`,
		eyebrow: "Einladung",
		title: `${input.inviter} lädt dich zu ${input.organization} ein.`,
		body: `Du wirst als ${roleLabel(input.role)} aufgenommen. Öffne den Link und lege einen Passkey an — Fingerabdruck, Gesicht oder Geräte-PIN, kein Passwort, keine App. Der Link ist 48 Stunden gültig und nur einmal nutzbar.`,
		cta: { label: "Passkey anlegen und beitreten", url: input.url },
		footnote: "Wenn du diese Einladung nicht erwartest, ignoriere diese Mail.",
	});
}

// Konto aktivieren: ein Plattform-Admin hat ein Konto angelegt. Der Link
// (/aktivieren#klk_activate_…) legt den ersten Passkey an.
export function activationEmail(input: {
	url: string;
	name: string;
	organization: string | null;
	role: string | null;
	days: number;
}): { subject: string; text: string; html: string } {
	const join = input.organization
		? ` Danach bist du Mitglied von ${input.organization} (${roleLabel(input.role)}).`
		: " Danach legst du deine Organisation an.";
	return transactionalEmail({
		subject: "Dein Konto bei Klick",
		eyebrow: "Konto aktivieren",
		title: `Willkommen bei Klick, ${input.name}.`,
		body: `Für dich wurde ein Konto angelegt. Öffne den Link und lege einen Passkey an — Fingerabdruck, Gesicht oder Geräte-PIN, kein Passwort, keine App. Der Passkey ist ab dann deine Anmeldung.${join} Der Link ist ${input.days} Tage gültig und nur einmal nutzbar.`,
		cta: { label: "Passkey anlegen und loslegen", url: input.url },
		footnote:
			"Wenn du kein Konto bei Klick erwartest, ignoriere diese Mail — ohne Passkey entsteht kein Zugang.",
	});
}

// Lieferantenportal: Einladung zum Fragebogen. Der Link trägt den Token im
// Fragment (#klk_portal_…) — ohne Konto, gültig bis zum Ablaufdatum.
export function supplierPortalEmail(input: {
	url: string;
	organization: string;
	questionnaire: string;
	contactName?: string | null;
	expiresAt: Date;
	dueAt?: string | null;
}): { subject: string; text: string; html: string } {
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "long",
		timeZone: "Europe/Berlin",
	});
	const greeting = input.contactName ? `Hallo ${input.contactName},` : "Hallo,";
	const dueDate = input.dueAt ? fmt.format(new Date(input.dueAt)) : null;
	const validUntil = fmt.format(input.expiresAt);
	const rest = `Ein Konto brauchst du dafür nicht. Der Link ist bis zum ${validUntil} gültig; leite ihn nur an Personen weiter, die für dein Unternehmen antworten dürfen.`;
	return transactionalEmail({
		subject: `Fragebogen von ${input.organization}: ${input.questionnaire}`,
		eyebrow: "Lieferantenbewertung",
		title: `${input.organization} bittet dich um Auskunft.`,
		body: `${greeting}\n\nim Rahmen der Lieferantenbewertung bitten wir dich, den Fragebogen „${input.questionnaire}“ zu beantworten und passende Nachweise hochzuladen.${dueDate ? ` Bitte reiche ihn bis zum ${dueDate} ein.` : ""} ${rest}`,
		bodyHtml: `${escapeHtml(greeting)}<br><br>im Rahmen der Lieferantenbewertung bitten wir dich, den Fragebogen <strong>${escapeHtml(input.questionnaire)}</strong> zu beantworten und passende Nachweise hochzuladen.${dueDate ? ` Bitte reiche ihn bis zum <strong>${dueDate}</strong> ein.` : ""} ${escapeHtml(rest)}`,
		cta: { label: "Fragebogen öffnen", url: input.url },
		footnote:
			"Wenn du diese Anfrage nicht erwartest, ignoriere diese Mail und melde dich bei deinem Ansprechpartner.",
	});
}

// Trust Center: Zugang zu vertraulichen Unterlagen nach Freigabe. Der Link
// trägt den Token im Fragment (#klk_trust_…) — ohne Konto, befristet.
export function trustAccessEmail(input: {
	url: string;
	organization: string;
	name: string;
	expiresAt: Date;
}): { subject: string; text: string; html: string } {
	const validUntil = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "long",
		timeZone: "Europe/Berlin",
	}).format(input.expiresAt);
	const body = `Hallo ${input.name},\n\n${input.organization} hat deine Anfrage freigegeben. Über den Link siehst du die vertraulichen Unterlagen und kannst sie herunterladen. Ein Konto brauchst du dafür nicht. Der Link ist bis zum ${validUntil} gültig und nur für dich bestimmt — es gilt die Vertraulichkeitserklärung, der du zugestimmt hast.`;
	return transactionalEmail({
		subject: `Unterlagen von ${input.organization} freigegeben`,
		eyebrow: "Trust Center",
		title: "Deine Anfrage ist freigegeben.",
		body,
		bodyHtml: escapeHtml(body).replace(/\n/g, "<br>"),
		cta: { label: "Unterlagen öffnen", url: input.url },
		footnote:
			"Wenn du diese Unterlagen nicht angefragt hast, ignoriere diese Mail.",
	});
}
