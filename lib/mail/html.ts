// HTML-Helfer für Mails (rein) — ohne Vorlagen und ohne Klick-Auth, damit
// lib/mail/send.ts auch in both.money (apps/wallet) nutzbar ist.

// Alles, was in HTML landet, wird escaped — Titel, Namen und User-Agent kommen
// aus Nutzereingaben bzw. vom Client (sonst Phishing-Links in Sicherheitsmails).
export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

// Klartext → HTML: escapen, Zeilenumbrüche sichtbar machen.
export function textToHtml(value: string): string {
	return escapeHtml(value).replaceAll("\n", "<br>");
}
