import { describe, expect, it } from "vitest";
import {
	retentionOf,
	retentionYearsOf,
	safeExternalUrl,
	suggestedRetentionYears,
} from "@/lib/documents/retention";

// Aufbewahrung je Fassung (AP9.3): Frist ab Ende der Gültigkeit, Verlängerung
// nur nach hinten, „fällig“ ab dem Tag nach dem Ende.

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const open = { destroyedAt: null, retainUntil: null };

describe("Aufbewahrung", () => {
	it("Vorschlag je Art", () => {
		expect(suggestedRetentionYears("contract")).toBe(10);
		expect(suggestedRetentionYears("record")).toBe(10);
		expect(suggestedRetentionYears("policy")).toBe(5);
		expect(retentionYearsOf({ type: "policy", retentionYears: 7 })).toBe(7);
		expect(retentionYearsOf({ type: "report", retentionYears: null })).toBe(10);
		expect(retentionYearsOf({ type: "policy", retentionYears: 0 })).toBe(0);
	});

	it("gilt noch, nie gegolten, vernichtet", () => {
		expect(retentionOf(open, undefined, 5).state).toBe("none");
		expect(
			retentionOf(open, { from: d("2020-01-01"), until: null }, 5).state,
		).toBe("in_force");
		expect(
			retentionOf(
				open,
				{ from: d("2020-01-01"), until: d("2030-01-01") },
				5,
				d("2026-10-31"),
			).state,
		).toBe("in_force");
		expect(
			retentionOf(
				{ destroyedAt: d("2026-01-01"), retainUntil: null },
				{ from: d("2010-01-01"), until: d("2011-01-01") },
				5,
			).state,
		).toBe("destroyed");
	});

	it("Frist ab Ende der Gültigkeit, fällig ab dem Folgetag", () => {
		const range = { from: d("2018-01-01"), until: d("2021-03-15") };
		const r = retentionOf(open, range, 5, d("2026-03-15"));
		expect(r.state).toBe("retained");
		expect(r.retainUntil?.toISOString().slice(0, 10)).toBe("2026-03-15");
		expect(retentionOf(open, range, 5, d("2026-03-16")).state).toBe("due");
	});

	it("Verlängerung schiebt nur nach hinten", () => {
		const range = { from: d("2010-01-01"), until: d("2015-01-01") };
		const later = retentionOf(
			{ destroyedAt: null, retainUntil: "2027-06-30" },
			range,
			5,
			d("2026-10-31"),
		);
		expect(later.state).toBe("retained");
		expect(later.retainUntil?.toISOString().slice(0, 10)).toBe("2027-06-30");
		const earlier = retentionOf(
			{ destroyedAt: null, retainUntil: "2016-01-01" },
			range,
			5,
			d("2026-10-31"),
		);
		expect(earlier.state).toBe("due");
		expect(earlier.retainUntil?.toISOString().slice(0, 10)).toBe("2020-01-01");
	});

	it("Links nur http(s)", () => {
		expect(safeExternalUrl("https://www.iso.org/standard/27001")).toBe(
			"https://www.iso.org/standard/27001",
		);
		expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
		expect(safeExternalUrl("nicht eine Adresse")).toBeNull();
		expect(safeExternalUrl(null)).toBeNull();
	});
});
