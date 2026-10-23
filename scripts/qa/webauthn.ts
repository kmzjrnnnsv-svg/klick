/**
 * Gemeinsame Helfer für die Passkey- und Wallet-Smokes: TOTP-Code aus dem
 * QA-Schlüssel, virtueller Authenticator (CDP WebAuthn), Prüfausgabe.
 */
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

export const EXEC = existsSync("/opt/pw-browsers/chromium")
	? "/opt/pw-browsers/chromium"
	: undefined;

export function totp(secret: string, now = Date.now()): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const ch of secret.toUpperCase().replace(/=+$/, "")) {
		const v = alphabet.indexOf(ch);
		if (v >= 0) bits += v.toString(2).padStart(5, "0");
	}
	const key: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8)
		key.push(Number.parseInt(bits.slice(i, i + 8), 2));
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
	const h = createHmac("sha1", Buffer.from(key)).update(msg).digest();
	const off = (h[h.length - 1] ?? 0) & 0xf;
	const code =
		(((h[off] ?? 0) & 0x7f) << 24) |
		((h[off + 1] ?? 0) << 16) |
		((h[off + 2] ?? 0) << 8) |
		(h[off + 3] ?? 0);
	return String(code % 1_000_000).padStart(6, "0");
}

let failures = 0;
export function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures += 1;
}
export const failureCount = () => failures;

// Dev-Server (Next 16.4, Turbopack): nach jedem Chunk-Abo meldet der Server
// „restart“ bzw. „reloadPage“ (HMR hash mismatch) — offene Seiten laden in
// einer Schleife neu und hydratisieren nie. Der HMR-Websocket wird
// durchgereicht, nur diese beiden Nachrichten fallen weg.
export async function quietHmr(ctx: BrowserContext): Promise<void> {
	await ctx.routeWebSocket(/\/_next\/(webpack-)?hmr/, (ws) => {
		const server = ws.connectToServer();
		server.onMessage((m) => {
			const text = String(m);
			if (text.includes('"reloadPage"') || text.includes('"type":"restart"'))
				return;
			ws.send(m);
		});
		ws.onMessage((m) => server.send(m));
	});
}

// Virtueller Plattform-Authenticator mit Nutzerverifikation (Biometrie/PIN)
export async function withAuthenticator(ctx: BrowserContext): Promise<Page> {
	await quietHmr(ctx);
	const page = await ctx.newPage();
	const cdp = await ctx.newCDPSession(page);
	await cdp.send("WebAuthn.enable");
	await cdp.send("WebAuthn.addVirtualAuthenticator", {
		options: {
			protocol: "ctap2",
			transport: "internal",
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	});
	return page;
}
