/**
 * Bestätigungsseite lokal (wie approve.both.money, aber http://localhost):
 * liefert deploy/confirm mit denselben Sicherheits-Headern wie nginx aus und
 * trägt die API-Herkunft der lokalen App ein.
 *
 *   pnpm confirm:dev                       → http://localhost:3201
 *   CONFIRM_API=http://localhost:3400 CONFIRM_PORT=3201 pnpm confirm:dev
 *
 * Der Dev-Signer muss mit --rp localhost --origin http://localhost:3201
 * eingerichtet sein (scripts/signer-dev.ts).
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "deploy", "confirm");
const PORT = Number(process.env.CONFIRM_PORT ?? 3201);
const API = process.env.CONFIRM_API ?? "http://localhost:3400";

const FILES: Record<string, string> = {
	"/": "index.html",
	"/index.html": "index.html",
	"/enrol.html": "enrol.html",
	"/canonical.js": "canonical.js",
	"/confirm.js": "confirm.js",
	"/enrol.js": "enrol.js",
	"/style.css": "style.css",
};
const TYPES: Record<string, string> = {
	html: "text/html; charset=utf-8",
	js: "text/javascript; charset=utf-8",
	css: "text/css; charset=utf-8",
};

function confirmHeaders(api: string): Record<string, string> {
	return {
		"content-security-policy": `default-src 'none'; script-src 'self'; style-src 'self'; connect-src ${api}; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'`,
		"x-frame-options": "DENY",
		"referrer-policy": "no-referrer",
		"x-content-type-options": "nosniff",
		"cross-origin-opener-policy": "same-origin",
		"cross-origin-resource-policy": "same-origin",
		"cache-control": "no-cache",
	};
}

createServer((req, res) => {
	const path = (req.url ?? "/").split("?")[0] as string;
	const file = FILES[path];
	if (!file || (req.method !== "GET" && req.method !== "HEAD")) {
		res.writeHead(file ? 405 : 404, confirmHeaders(API));
		return res.end();
	}
	let body = readFileSync(join(ROOT, file), "utf8");
	if (file.endsWith(".html"))
		body = body.replace(
			/<meta name="klick-api" content="[^"]*">/,
			`<meta name="klick-api" content="${API}">`,
		);
	res.writeHead(200, {
		...confirmHeaders(API),
		"content-type": TYPES[file.split(".").pop() as string] as string,
	});
	res.end(req.method === "HEAD" ? undefined : body);
}).listen(PORT, "127.0.0.1", () =>
	console.log(`Bestätigungsseite auf http://localhost:${PORT} (API ${API})`),
);
