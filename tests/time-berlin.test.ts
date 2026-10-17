import { describe, expect, it } from "vitest";
import {
	addMonthsIso,
	berlinDate,
	calendarDaysBetween,
	endOfBerlinDay,
	isPastDay,
	monthsDeadline,
	startOfBerlinDay,
	todayBerlin,
} from "@/lib/time/berlin";
import {
	easterSunday,
	holidays,
	isWorkday,
	nthWorkdayAfter,
} from "@/lib/time/holidays";

describe("Berliner Kalender", () => {
	it("„heute“ ist der Berliner Tag, nicht der UTC-Tag", () => {
		// 00:30 Berlin (Sommerzeit) = 22:30 UTC am Vortag
		expect(todayBerlin(new Date("2026-10-12T22:30:00Z"))).toBe("2026-10-13");
		// 00:30 Berlin (Winterzeit) = 23:30 UTC am Vortag
		expect(berlinDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
	});
	it("Tagesanfang/-ende über Sommer- und Winterzeit", () => {
		expect(startOfBerlinDay("2026-07-01")).toEqual(
			new Date("2026-06-30T22:00:00.000Z"),
		);
		expect(endOfBerlinDay("2026-01-15")).toEqual(
			new Date("2026-01-15T22:59:59.999Z"),
		);
		// Umstellungstage
		expect(startOfBerlinDay("2026-03-29")).toEqual(
			new Date("2026-03-28T23:00:00.000Z"),
		);
		expect(endOfBerlinDay("2026-03-29")).toEqual(
			new Date("2026-03-29T21:59:59.999Z"),
		);
		expect(endOfBerlinDay("2026-10-25")).toEqual(
			new Date("2026-10-25T22:59:59.999Z"),
		);
	});
	it("Monate nach BGB: Monatsende geklemmt, Schaltjahr", () => {
		expect(addMonthsIso("2027-01-31", 1)).toBe("2027-02-28");
		expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29");
		expect(addMonthsIso("2028-02-29", 36)).toBe("2031-02-28");
		expect(addMonthsIso("2026-11-30", 3)).toBe("2027-02-28");
		expect(addMonthsIso("2026-10-15", 12)).toBe("2027-10-15");
		expect(monthsDeadline(new Date("2026-10-30T23:30:00Z"), 1)).toEqual(
			new Date("2026-11-30T22:59:59.999Z"),
		);
	});
	it("Datum ohne Uhrzeit ist erst nach Tagesende vorbei", () => {
		expect(isPastDay("2026-10-31", new Date("2026-10-31T20:00:00Z"))).toBe(
			false,
		);
		expect(isPastDay("2026-10-31", new Date("2026-10-31T23:30:00Z"))).toBe(
			true,
		);
		expect(calendarDaysBetween("2026-10-17", "2026-11-16")).toBe(30);
		expect(calendarDaysBetween("2026-03-28", "2026-03-30")).toBe(2);
	});
});

describe("Feiertage", () => {
	it("Ostern und bewegliche Feiertage", () => {
		expect(easterSunday(2026)).toBe("2026-04-05");
		expect(easterSunday(2027)).toBe("2027-03-28");
		expect(easterSunday(2028)).toBe("2028-04-16");
		const he = holidays(2026, "HE");
		expect(he.has("2026-04-03")).toBe(true); // Karfreitag
		expect(he.has("2026-05-14")).toBe(true); // Himmelfahrt
		expect(he.has("2026-05-25")).toBe(true); // Pfingstmontag
		expect(he.has("2026-06-04")).toBe(true); // Fronleichnam (HE)
		expect(holidays(2026, "BE").has("2026-06-04")).toBe(false);
		expect(holidays(2026, "SN").has("2026-11-18")).toBe(true); // Buß- und Bettag
		expect(holidays(2026, "NI").has("2026-10-31")).toBe(true); // Reformationstag
		expect(holidays(2026, "BE").has("2026-03-08")).toBe(true); // Frauentag
	});
	it("Werktage: Samstag nur auf Wunsch, Feiertage nie", () => {
		expect(isWorkday("2026-10-17")).toBe(false); // Samstag
		expect(isWorkday("2026-10-17", { saturday: true })).toBe(true);
		expect(isWorkday("2026-10-03", { saturday: true })).toBe(false);
		expect(nthWorkdayAfter("2026-12-23", 3)).toBe("2026-12-29");
	});
});
