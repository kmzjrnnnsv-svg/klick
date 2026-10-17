// Kalender in Europe/Berlin — pure, getestet. Fristen und „heute“ hängen am
// deutschen Kalendertag, nicht an UTC: zwischen 00:00 und 02:00 Berliner Zeit
// ist es in UTC noch gestern, und Sommer-/Winterzeit verschiebt den Offset.
// Datumsangaben ohne Uhrzeit sind ISO-Strings "YYYY-MM-DD".

export const TZ = "Europe/Berlin";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
	timeZone: TZ,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const offsetFmt = new Intl.DateTimeFormat("en-US", {
	timeZone: TZ,
	timeZoneName: "longOffset",
});

// Kalendertag in Berlin zu einem Zeitpunkt.
export function berlinDate(d: Date): string {
	return dateFmt.format(d);
}

export function todayBerlin(now: Date = new Date()): string {
	return berlinDate(now);
}

// Offset Berlin–UTC in Minuten zu einem Zeitpunkt (+60 Winter, +120 Sommer).
function offsetMinutes(at: Date): number {
	const name =
		offsetFmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ??
		"GMT+01:00";
	const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
	if (!m) return 60;
	const sign = m[1] === "-" ? -1 : 1;
	return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

function parts(iso: string): [number, number, number] {
	const [y, m, d] = iso.split("-").map(Number);
	return [y ?? 1970, m ?? 1, d ?? 1];
}

// Berliner Wanduhrzeit → Zeitpunkt.
export function berlinTime(iso: string, h = 0, min = 0, s = 0, ms = 0): Date {
	const [y, m, d] = parts(iso);
	const naive = Date.UTC(y, m - 1, d, h, min, s, ms);
	let t = naive - offsetMinutes(new Date(naive)) * 60_000;
	// zweite Runde: Offset am Zielzeitpunkt (Umstellungstage)
	t = naive - offsetMinutes(new Date(t)) * 60_000;
	return new Date(t);
}

export function startOfBerlinDay(iso: string): Date {
	return berlinTime(iso, 0, 0, 0, 0);
}

// Fristende eines Tages: 23:59:59.999 Berliner Zeit (§ 188 BGB „Ablauf des
// Tages“). Datumswerte ohne Uhrzeit sind bis dahin nicht überfällig.
export function endOfBerlinDay(iso: string): Date {
	return berlinTime(iso, 23, 59, 59, 999);
}

export function addDaysIso(iso: string, days: number): string {
	const [y, m, d] = parts(iso);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Monate nach § 188 Abs. 2/3 BGB bzw. VO 1182/71 Art. 3: gleicher Tag im
// Zielmonat, fehlt er, der letzte Tag (31.01. + 1 Monat = 28./29.02.).
export function addMonthsIso(iso: string, months: number): string {
	const [y, m, d] = parts(iso);
	const target = new Date(Date.UTC(y, m - 1 + months, 1));
	const last = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
	).getUTCDate();
	return new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)),
	)
		.toISOString()
		.slice(0, 10);
}

// Monatsfrist ab einem Zeitpunkt: Ende des entsprechenden Berliner Tages.
export function monthsDeadline(from: Date, months: number): Date {
	return endOfBerlinDay(addMonthsIso(berlinDate(from), months));
}

// Wochentag eines Kalendertags (0 = Sonntag).
export function weekdayIso(iso: string): number {
	const [y, m, d] = parts(iso);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Ist ein Datum ohne Uhrzeit vorbei? (Fälligkeit = Ende des Berliner Tages)
export function isPastDay(iso: string, now: Date = new Date()): boolean {
	return now > endOfBerlinDay(iso);
}

// Kalendertage zwischen zwei Berliner Daten (b − a), unabhängig von Uhrzeit
// und Sommerzeit — „in 30 Tagen“ heißt am 30. Kalendertag.
export function calendarDaysBetween(aIso: string, bIso: string): number {
	const [ay, am, ad] = parts(aIso);
	const [by, bm, bd] = parts(bIso);
	return Math.round(
		(Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
	);
}
