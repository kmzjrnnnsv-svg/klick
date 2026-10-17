import { NextResponse } from "next/server";
import { escapeHtml } from "@/lib/mail/templates";

// Antworten für Links, die direkt im Browser geöffnet werden (Downloads):
// statt leerer 401/403/404/429-Seiten ein kurzer Satz mit Weg zurück.
export function plainPage(
	status: number,
	title: string,
	text: string,
	headers: Record<string, string> = {},
): NextResponse {
	const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#211c14;background:#f7f3ec"><h1 style="font-size:1.4rem;font-weight:500">${escapeHtml(title)}</h1><p style="line-height:1.6">${escapeHtml(text)}</p><p><a href="/heute" style="color:#2c3f68">Zurück zu Klick</a></p></body></html>`;
	return new NextResponse(html, {
		status,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			...headers,
		},
	});
}

// Content-Disposition mit ASCII-Fallback: Header-Werte müssen Latin-1 sein,
// sonst wirft Node bei „–“, „„“, €, Emoji (TypeError → 500). Der echte Name
// steht UTF-8-kodiert in filename* (RFC 6266/5987).
export function attachmentDisposition(name: string): string {
	const clean = name.replace(/["\\\r\n]/g, "").trim() || "datei";
	const ascii =
		clean
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^\x20-\x7e]/g, "_") || "datei";
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

// Rücksprung über die öffentliche Basis-URL (hinter dem Proxy ist req.url
// ggf. ein interner Host).
export function appUrl(path: string): URL {
	const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	return new URL(path, base);
}
