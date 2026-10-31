import { deflateSync } from "node:zlib";
import { ACTIVITY_TYPE } from "./graph";

// Teams-App von Klick (T5): nur Aktivitätsfeed, kein Tab, kein Bot. Die
// Kunden-IT lädt das Paket in den Org-Katalog hoch; webApplicationInfo
// verbindet die App mit der App-Registrierung (Pflicht für Hinweise im
// Aktivitätsfeed). Schema 1.17 nach Microsoft Learn (prüfen).

export const MANIFEST_VERSION = "1.17";
export const APP_VERSION = "1.0.0";

export function buildTeamsManifest(input: {
	appId: string;
	clientId: string;
	baseUrl: string;
}): Record<string, unknown> {
	const host = new URL(input.baseUrl).host;
	const root = input.baseUrl.replace(/\/$/, "");
	return {
		$schema: `https://developer.microsoft.com/en-us/json-schemas/teams/v${MANIFEST_VERSION}/MicrosoftTeams.schema.json`,
		manifestVersion: MANIFEST_VERSION,
		version: APP_VERSION,
		id: input.appId,
		developer: {
			name: "Klick",
			websiteUrl: root,
			privacyUrl: `${root}/datenschutz-erklaerung`,
			termsOfUseUrl: `${root}/nutzungsbedingungen`,
		},
		name: { short: "Klick", full: "Klick Compliance" },
		description: {
			short: "Hinweise aus Klick in deinem Aktivitätsfeed",
			full: "Freigaben, Fristen, Aufgaben und Erwähnungen aus Klick erscheinen im Aktivitätsfeed von Teams. Ein Klick öffnet die Seite in Klick; freigeben und unterschreiben bleibt in Klick mit deinem Passkey.",
		},
		icons: { color: "color.png", outline: "outline.png" },
		accentColor: "#0A63D6",
		permissions: ["identity"],
		validDomains: [host],
		webApplicationInfo: {
			id: input.clientId,
			resource: `api://${host}/${input.clientId}`,
		},
		activities: {
			activityTypes: [
				{
					type: ACTIVITY_TYPE,
					description: "Hinweis aus Klick",
					templateText: "{title}",
				},
			],
		},
	};
}

// ── Symbole als PNG (eigener Writer, nur node:zlib) ─────────────────────────

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}

// RGBA-Bild als PNG
export function encodePng(
	width: number,
	height: number,
	pixel: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	let o = 0;
	for (let y = 0; y < height; y++) {
		raw[o++] = 0;
		for (let x = 0; x < width; x++) {
			const [r, g, b, a] = pixel(x, y);
			raw[o++] = r;
			raw[o++] = g;
			raw[o++] = b;
			raw[o++] = a;
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // Bittiefe
	ihdr[9] = 6; // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", new Uint8Array()),
	]);
}

// Buchstabe K aus drei Strichen (Koordinaten 0 … 1)
function onK(u: number, v: number, w: number): boolean {
	const seg = (ax: number, ay: number, bx: number, by: number) => {
		const dx = bx - ax;
		const dy = by - ay;
		const t = Math.max(
			0,
			Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)),
		);
		return Math.hypot(u - (ax + t * dx), v - (ay + t * dy)) <= w;
	};
	return (
		seg(0.34, 0.24, 0.34, 0.76) ||
		seg(0.36, 0.53, 0.66, 0.24) ||
		seg(0.44, 0.45, 0.68, 0.76)
	);
}

export function colorIcon(): Uint8Array {
	const n = 192;
	return encodePng(n, n, (x, y) =>
		onK((x + 0.5) / n, (y + 0.5) / n, 0.055)
			? [255, 255, 255, 255]
			: [10, 99, 214, 255],
	);
}

export function outlineIcon(): Uint8Array {
	const n = 32;
	return encodePng(n, n, (x, y) =>
		onK((x + 0.5) / n, (y + 0.5) / n, 0.07)
			? [255, 255, 255, 255]
			: [0, 0, 0, 0],
	);
}
