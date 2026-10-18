import { describe, expect, it } from "vitest";
import {
	collectDates,
	type DateSource,
	dateState,
	datesByMonth,
	datesByWeek,
	nextQuarters,
	noticeDate,
	quarterEnd,
	quarterOf,
	weekStart,
} from "@/lib/compliance/dates";

const today = "2026-10-17";
const src: DateSource[] = [
	{
		date: "2026-10-01",
		kind: "risk_review",
		title: "R-001",
		href: "/risiken/1",
	},
	{
		date: "2026-09-01",
		kind: "nonconformity",
		title: "NC alt",
		href: "/abweichungen/1",
	},
	{
		date: "2026-09-02",
		kind: "milestone",
		title: "erledigt",
		href: "/roadmap",
		done: true,
	},
	{ date: "2026-10-20", kind: "audit", title: "ISMS-Audit", href: "/audits/1" },
	{
		date: "2026-12-31",
		kind: "document_review",
		title: "LL-001",
		href: "/dokumente/LL-001",
	},
	{ date: "2027-03-01", kind: "legal", title: "AMLR", href: "/kalender" },
	{
		date: null,
		kind: "objective_due",
		title: "ohne Datum",
		href: "/organisation",
	},
];

describe("dateState", () => {
	it("überfällig, bald, später, erledigt", () => {
		expect(dateState("2026-10-01", false, today)).toBe("overdue");
		expect(dateState("2026-11-10", false, today)).toBe("soon");
		expect(dateState("2026-12-31", false, today)).toBe("due");
		expect(dateState("2026-01-01", true, today)).toBe("done");
	});
});

describe("collectDates", () => {
	it("Zeitraum, sortiert, ohne Datum nichts", () => {
		const r = collectDates(
			src,
			{ from: "2026-10-01", to: "2026-12-31" },
			today,
		);
		expect(r.map((e) => e.title)).toEqual(["R-001", "ISMS-Audit", "LL-001"]);
		expect(r[0]?.state).toBe("overdue");
		expect(r[1]?.state).toBe("soon");
	});
	it("Überfälliges vor dem Zeitraum kommt mit, Erledigtes nicht", () => {
		const r = collectDates(
			src,
			{ from: "2026-10-17", to: "2026-12-31" },
			today,
			{ includeOverdue: true },
		);
		expect(r.map((e) => e.title)).toEqual([
			"NC alt",
			"R-001",
			"ISMS-Audit",
			"LL-001",
		]);
	});
	it("Filter nach Art", () => {
		const r = collectDates(
			src,
			{ from: "2026-01-01", to: "2027-12-31" },
			today,
			{ kinds: ["audit", "legal"] },
		);
		expect(r.map((e) => e.kind)).toEqual(["audit", "legal"]);
	});
});

describe("Gruppierung", () => {
	const r = collectDates(src, { from: "2026-01-01", to: "2027-12-31" }, today);
	it("nach Monat eines Jahres", () => {
		const m = datesByMonth(r, 2026);
		expect(m.get(10)?.length).toBe(2);
		expect(m.get(3)).toBeUndefined();
	});
	it("nach ISO-Woche (Montag)", () => {
		expect(weekStart("2026-10-17")).toBe("2026-10-12");
		expect(weekStart("2026-10-12")).toBe("2026-10-12");
		expect(datesByWeek(r)[0]?.week).toBe("2026-08-31");
	});
	it("Quartal und Kündigungstag", () => {
		expect(quarterOf("2026-10-17")).toBe("2026-Q4");
		expect(quarterOf("2027-03-31")).toBe("2027-Q1");
		expect(quarterEnd("2027-Q2")).toBe("2027-06-30");
		expect(quarterEnd("2026-Q4")).toBe("2026-12-31");
		expect(nextQuarters("2026-10-18", 3)).toEqual([
			"2026-Q4",
			"2027-Q1",
			"2027-Q2",
		]);
		expect(noticeDate("2026-12-31", 90)).toBe("2026-10-02");
		expect(noticeDate("2026-12-31", null)).toBeNull();
	});
});
