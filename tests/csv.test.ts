import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, toBool, toCsv } from "@/lib/csv";

describe("csv", () => {
	it("parst Semikolon-CSV mit Anführungszeichen, BOM und Leerzeilen", () => {
		const t = parseCsv(
			'﻿title;category;likelihood;organization_id\n"Ausfall; Hosting";ict_cyber;4;fremd\n\n"Sagt ""Hallo""";operational;2;x\n',
		);
		expect(t.sep).toBe(";");
		expect(t.header).toEqual(["title", "category", "likelihood"]);
		expect(t.rows).toEqual([
			{ title: "Ausfall; Hosting", category: "ict_cyber", likelihood: "4" },
			{ title: 'Sagt "Hallo"', category: "operational", likelihood: "2" },
		]);
	});

	it("erkennt Komma als Trenner und CRLF", () => {
		const t = parseCsv("name,type\r\nServer A,system\r\nDB,data\r\n");
		expect(t.sep).toBe(",");
		expect(t.rows).toHaveLength(2);
		expect(t.rows[1]?.type).toBe("data");
	});

	it("Export: Formel-Injektion entschärft, Felder mit Trenner gequotet", () => {
		expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
		expect(csvCell("a;b")).toBe('"a;b"');
		expect(csvCell(null)).toBe("");
		const out = toCsv(
			["a", "b"],
			[
				["x", 1],
				["y;z", new Date("2026-10-07T00:00:00Z")],
			],
		);
		expect(out.startsWith("﻿a;b\r\n")).toBe(true);
		expect(out).toContain('"y;z";2026-10-07T00:00:00.000Z');
	});

	it("toBool", () => {
		expect(toBool("ja")).toBe(true);
		expect(toBool("0")).toBe(false);
		expect(toBool(undefined, true)).toBe(true);
	});
});
