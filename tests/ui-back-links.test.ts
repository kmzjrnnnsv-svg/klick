import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, walkFiles } from "./helpers/walk";

// Zurück nach Apple HIG (docs/design/hig.md): jede Unterseite der App-Bereiche
// (ab der zweiten Pfadebene, z. B. /risiken/[id], /heute/aufgaben) zeigt
// über dem Titel „Zurück“ mit dem Titel der Elternseite — über `back` an
// PageHeader/EntityLayout oder direkt mit BackLink. Am Handy gibt es sonst
// keinen Weg zurück außer der Browser-Geste.

const APP_DIRS = ["app/(app)", "apps/wallet/app/(app)"];

// Listen der Tab-Leiste sind selbst Einstiege, keine Unterseiten
const EXEMPT = new Set(["app/(app)/bereich/[tab]/page.tsx"]);

function depth(file: string): number {
	const rel = file
		.replace(/^(apps\/wallet\/)?app\/\(app\)\//, "")
		.replace(/(^|\/)page\.tsx$/, "");
	return rel === "" ? 0 : rel.split("/").length;
}

describe("Zurück auf Unterseiten", () => {
	it("jede Unterseite hat einen Zurück-Link zur Elternseite", () => {
		const pages = walkFiles(APP_DIRS, /^page\.tsx$/).filter(
			(f) => depth(f) >= 2 && !EXEMPT.has(f),
		);
		expect(pages.length).toBeGreaterThan(20);
		const missing = pages.filter((f) => {
			const src = readFileSync(join(ROOT, f), "utf8");
			return !/\bback=\{|<BackLink\b/.test(src);
		});
		expect(missing).toEqual([]);
	});
});
