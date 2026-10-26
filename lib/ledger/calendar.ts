import { hex, type OtsTimestamp, parseTimestamp } from "./ots";

// OpenTimestamps-Kalender (Härtung V): Wurzel einreichen, später das Upgrade
// mit der Bitcoin-Beglaubigung holen. Feste Adressen, keine aus Eingaben —
// ausstehende Beglaubigungen nennen den Kalender selbst, gefolgt wird nur
// bekannten Hosts (wie die Whitelist des offiziellen Clients). Antworten sind
// klein (≤ 64 KB) und werden streng gelesen (lib/ledger/ots.ts).

export const DEFAULT_CALENDARS = [
	"https://a.pool.opentimestamps.org",
	"https://b.pool.opentimestamps.org",
	"https://a.pool.eternitywall.com",
] as const;

const KNOWN_HOSTS = new Set([
	"a.pool.opentimestamps.org",
	"b.pool.opentimestamps.org",
	"a.pool.eternitywall.com",
	"alice.btc.calendar.opentimestamps.org",
	"bob.btc.calendar.opentimestamps.org",
	"finney.calendar.eternitywall.com",
	"btc.calendar.catallaxy.com",
]);

const MAX_RESPONSE = 64 * 1024;
const TIMEOUT_MS = 15_000;
const HEADERS = {
	Accept: "application/vnd.opentimestamps.v1",
	"User-Agent": "klick-ledger",
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Darf Klick diesen Kalender ansprechen? Bekannter Host über https; zum
 * Testen ausdrücklich konfigurierte Kalender (LEDGER_CALENDARS) auch über
 * http, aber nie in Produktion.
 */
export function calendarAllowed(
	uri: string,
	configured: readonly string[],
	production: boolean,
): boolean {
	let u: URL;
	try {
		u = new URL(uri);
	} catch {
		return false;
	}
	if (u.username || u.password || u.search || u.hash) return false;
	if (u.protocol === "https:" && KNOWN_HOSTS.has(u.hostname)) return true;
	const own = configured.some(
		(c) => c.replace(/\/+$/, "") === uri.replace(/\/+$/, ""),
	);
	if (!own) return false;
	return u.protocol === "https:" || (!production && u.protocol === "http:");
}

export function configuredCalendars(env: string | undefined): string[] {
	const list = (env ?? "")
		.split(",")
		.map((s) => s.trim().replace(/\/+$/, ""))
		.filter(Boolean);
	return list.length > 0 ? list : [...DEFAULT_CALENDARS];
}

async function readLimited(res: Response): Promise<Uint8Array> {
	const buf = new Uint8Array(await res.arrayBuffer());
	if (buf.length > MAX_RESPONSE) throw new Error("calendar_too_large");
	return buf;
}

/** Commitment bei einem Kalender einreichen → Zeitstempel ab dem Commitment. */
export async function submitToCalendar(
	calendar: string,
	commitment: Uint8Array,
	fetchImpl: FetchLike,
): Promise<OtsTimestamp> {
	const res = await fetchImpl(`${calendar.replace(/\/+$/, "")}/digest`, {
		method: "POST",
		headers: {
			...HEADERS,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: Buffer.from(commitment),
		redirect: "error",
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`calendar_http_${res.status}`);
	return parseTimestamp(await readLimited(res), commitment);
}

/**
 * Upgrade eines ausstehenden Commitments: Zeitstempel bis zur Bitcoin-
 * Beglaubigung, oder null, solange der Kalender noch wartet (404).
 */
export async function upgradeFromCalendar(
	calendar: string,
	commitment: Uint8Array,
	fetchImpl: FetchLike,
): Promise<OtsTimestamp | null> {
	const res = await fetchImpl(
		`${calendar.replace(/\/+$/, "")}/timestamp/${hex(commitment)}`,
		{
			method: "GET",
			headers: HEADERS,
			redirect: "error",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		},
	);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`calendar_http_${res.status}`);
	return parseTimestamp(await readLimited(res), commitment);
}
