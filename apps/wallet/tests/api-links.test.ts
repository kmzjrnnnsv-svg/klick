import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Jeder feste Link auf /api/… in both.money zeigt auf eine vorhandene Route
// (Regression: CSV-Knopf auf /activity zeigte auf einen Klick-Pfad).
const ROOT = "apps/wallet";

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? e.name === "node_modules" || e.name === ".next"
				? []
				: walk(join(dir, e.name))
			: /\.tsx?$/.test(e.name)
				? [join(dir, e.name)]
				: [],
	);
}

describe("both.money: /api-Links", () => {
	const links = [
		...new Set(
			[...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))].flatMap(
				(f) =>
					[
						...readFileSync(f, "utf8").matchAll(
							/["'`](\/api\/[a-z0-9/._-]+)["'`]/g,
						),
					].map((m) => m[1]),
			),
		),
	];

	it("findet Links", () => {
		expect(links.length).toBeGreaterThan(0);
	});

	it.each(links)("%s hat eine Route", (link) => {
		const dir = join(ROOT, "app", link);
		const route = ["route.ts", "route.tsx"].some((f) =>
			existsSync(join(dir, f)),
		);
		// Präfixe (z. B. /api/confirm/ + ID) gelten, wenn ein dynamisches Segment folgt
		const prefix =
			link.endsWith("/") &&
			existsSync(dir) &&
			readdirSync(dir).some((n) => n.startsWith("["));
		expect(route || prefix).toBe(true);
	});
});
