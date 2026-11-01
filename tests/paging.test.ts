import { describe, expect, it } from "vitest";
import {
	PAGE_SIZE,
	pageCount,
	pageHref,
	pageParam,
	pageSlice,
	pageWindow,
} from "@/lib/paging";

describe("Listen seitenweise", () => {
	it("liest ?seite= nur als ganze Zahl ab 1", () => {
		expect(pageParam(undefined)).toBe(1);
		expect(pageParam("3")).toBe(3);
		expect(pageParam(["4", "5"])).toBe(4);
		for (const bad of ["0", "-1", "2.5", "abc", "999999999"])
			expect(pageParam(bad)).toBe(1);
	});

	it("rechnet Fenster und Seitenzahl", () => {
		expect(pageWindow(1)).toEqual({ limit: PAGE_SIZE, offset: 0 });
		expect(pageWindow(3, 10)).toEqual({ limit: 10, offset: 20 });
		expect(pageCount(0)).toBe(1);
		expect(pageCount(50)).toBe(1);
		expect(pageCount(51)).toBe(2);
	});

	it("schneidet Zeilen und bleibt auf der letzten Seite", () => {
		const rows = Array.from({ length: 120 }, (_, i) => i);
		expect(pageSlice(rows, 1).rows).toHaveLength(50);
		expect(pageSlice(rows, 3).rows).toEqual(rows.slice(100));
		const beyond = pageSlice(rows, 9);
		expect(beyond.page).toBe(3);
		expect(beyond.total).toBe(120);
	});

	it("behält Filter im Link und lässt Seite 1 weg", () => {
		expect(
			pageHref("/nachweise", { q: "a b", seite: "2", type: ["x"] }, 3),
		).toBe("/nachweise?q=a+b&type=x&seite=3");
		expect(pageHref("/nachweise", { seite: "2" }, 1)).toBe("/nachweise");
	});
});
