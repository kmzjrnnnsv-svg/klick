import { addOp, newTimestamp, type OtsTimestamp, sha256, unhex } from "./ots";

// Wann und wie verankert wird (Härtung V) — rein, getestet.
//
// Täglich nach 02:30 (Berlin) einmal, und nach kritischen Ereignissen
// (Zugriffe durch Klick, Sicherheitsänderungen, Notweg der IP-Liste) beim
// nächsten Lauf des Jobs (alle 10 min). Ohne Änderung seit dem letzten Anker
// (gleiche Wurzel) kein neuer.

export const CRITICAL_PREFIXES = [
	"platform_access.",
	"security_change.",
	"org.network_reset",
	"org.governance_mode_changed",
] as const;

export const isCriticalAction = (action: string) =>
	CRITICAL_PREFIXES.some((p) => action.startsWith(p));

const berlin = (d: Date) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(d);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
	return {
		date: `${get("year")}-${get("month")}-${get("day")}`,
		minutes: Number(get("hour")) * 60 + Number(get("minute")),
	};
};

export function anchorDue(input: {
	now: Date;
	// letzter erfolgreicher täglicher Anker
	lastDailyAt: Date | null;
	// kritische Einträge seit dem letzten Anker
	criticalSinceLast: number;
}): "daily" | "event" | null {
	const now = berlin(input.now);
	const dailyDone =
		input.lastDailyAt !== null && berlin(input.lastDailyAt).date === now.date;
	if (!dailyDone && now.minutes >= 2 * 60 + 30) return "daily";
	if (input.criticalSinceLast > 0) return "event";
	return null;
}

/**
 * Zeitstempel-Baum für eine Wurzel wie `ots stamp` für eine Datei
 * wurzel.bin (32 Bytes): Datei-Prüfsumme → Zufallswert anhängen (der
 * Kalender sieht so nie die Wurzel selbst) → SHA-256 = an die Kalender.
 */
export function stampTree(
	rootHex: string,
	nonce: Uint8Array,
): { file: OtsTimestamp; commitment: OtsTimestamp } {
	if (!/^[0-9a-f]{64}$/.test(rootHex)) throw new Error("ledger_root");
	if (nonce.length < 16) throw new Error("ledger_nonce");
	const file = newTimestamp(sha256(unhex(rootHex)));
	const commitment = addOp(addOp(file, { op: "append", arg: nonce }), {
		op: "sha256",
	});
	return { file, commitment };
}
