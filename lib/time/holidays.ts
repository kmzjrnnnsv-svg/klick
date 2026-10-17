import { addDaysIso, weekdayIso } from "./berlin";

// Gesetzliche Feiertage in Deutschland je Land — für Fristen in Werk- und
// Arbeitstagen (§ 46 GwG, § 2c KWG). Bundesweite Tage plus Landesrecht;
// Mariä Himmelfahrt (BY) und Fronleichnam (SN/TH) gelten dort nur in Teilen
// des Landes — wir zählen sie mit (Frist im Zweifel länger, nicht kürzer).

export const LAENDER = [
	"BW",
	"BY",
	"BE",
	"BB",
	"HB",
	"HH",
	"HE",
	"MV",
	"NI",
	"NW",
	"RP",
	"SL",
	"SN",
	"ST",
	"SH",
	"TH",
] as const;
export type Land = (typeof LAENDER)[number];

// Standard ohne Angabe: Hessen (Sitz Frankfurt, BaFin Wertpapieraufsicht).
export const DEFAULT_LAND: Land = "HE";

// Ostersonntag (gregorianisch, Meeus/Jones/Butcher).
export function easterSunday(year: number): string {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Buß- und Bettag: Mittwoch vor dem 23. November.
function bussUndBettag(year: number): string {
	let iso = `${year}-11-22`;
	while (weekdayIso(iso) !== 3) iso = addDaysIso(iso, -1);
	return iso;
}

const cache = new Map<string, ReadonlySet<string>>();

export function holidays(
	year: number,
	land: Land = DEFAULT_LAND,
): ReadonlySet<string> {
	const key = `${year}:${land}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const easter = easterSunday(year);
	const e = (n: number) => addDaysIso(easter, n);
	const fixed = (md: string) => `${year}-${md}`;
	const days = new Set<string>([
		fixed("01-01"),
		e(-2), // Karfreitag
		e(1), // Ostermontag
		fixed("05-01"),
		e(39), // Christi Himmelfahrt
		e(50), // Pfingstmontag
		fixed("10-03"),
		fixed("12-25"),
		fixed("12-26"),
	]);
	if (year === 2017) days.add(fixed("10-31")); // 500 Jahre Reformation
	const add = (...xs: string[]) => {
		for (const x of xs) days.add(x);
	};
	const fronleichnam = e(60);
	switch (land) {
		case "BW":
			add(fixed("01-06"), fronleichnam, fixed("11-01"));
			break;
		case "BY":
			add(fixed("01-06"), fronleichnam, fixed("08-15"), fixed("11-01"));
			break;
		case "BE":
			if (year >= 2019) add(fixed("03-08"));
			break;
		case "BB":
			add(easter, e(49), fixed("10-31"));
			break;
		case "HB":
		case "HH":
		case "NI":
		case "SH":
			if (year >= 2018) add(fixed("10-31"));
			break;
		case "HE":
			add(fronleichnam);
			break;
		case "MV":
			add(fixed("10-31"));
			if (year >= 2023) add(fixed("03-08"));
			break;
		case "NW":
		case "RP":
			add(fronleichnam, fixed("11-01"));
			break;
		case "SL":
			add(fronleichnam, fixed("08-15"), fixed("11-01"));
			break;
		case "SN":
			add(fixed("10-31"), bussUndBettag(year), fronleichnam);
			break;
		case "ST":
			add(fixed("01-06"), fixed("10-31"));
			break;
		case "TH":
			add(fixed("10-31"), fronleichnam);
			if (year >= 2019) add(fixed("09-20"));
			break;
	}
	cache.set(key, days);
	return days;
}

export function isHoliday(iso: string, land: Land = DEFAULT_LAND): boolean {
	return holidays(Number(iso.slice(0, 4)), land).has(iso);
}

// Werktag im Sinne der Frist: Mo–Fr (optional Sa) ohne Feiertage des Landes.
export function isWorkday(
	iso: string,
	opts: { land?: Land; saturday?: boolean } = {},
): boolean {
	const wd = weekdayIso(iso);
	if (wd === 0) return false;
	if (wd === 6 && !opts.saturday) return false;
	return !isHoliday(iso, opts.land ?? DEFAULT_LAND);
}

// n-ter Werktag nach dem Kalendertag `fromIso` (der Ausgangstag zählt nicht).
export function nthWorkdayAfter(
	fromIso: string,
	n: number,
	opts: { land?: Land; saturday?: boolean } = {},
): string {
	let iso = fromIso;
	let left = n;
	while (left > 0) {
		iso = addDaysIso(iso, 1);
		if (isWorkday(iso, opts)) left -= 1;
	}
	return iso;
}

export function isLand(v: unknown): v is Land {
	return typeof v === "string" && (LAENDER as readonly string[]).includes(v);
}
