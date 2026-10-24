import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers/walk";

// Ab der ersten Migration nur additiv (Klick: nach 0000_pivot, both.money:
// nach 0000_init): kein DROP TABLE/COLUMN/SCHEMA, kein RENAME. drizzle-kit
// erzeugt solche Schritte still, wenn ein Schema-Feld verschwindet.
const FOLDERS = ["db/migrations", "apps/wallet/db/migrations"];
const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|SCHEMA)|RENAME\s+(TO|COLUMN))\b/i;

describe("Migrationen nur additiv", () => {
	for (const folder of FOLDERS) {
		const files = readdirSync(join(ROOT, folder))
			.filter((f) => f.endsWith(".sql") && !f.startsWith("0000_"))
			.sort();
		it(`${folder}: ${files.length} Folgemigrationen ohne DROP/RENAME`, () => {
			const bad = files.filter((f) =>
				readFileSync(join(ROOT, folder, f), "utf8")
					.split("\n")
					.some((l) => !l.trim().startsWith("--") && DESTRUCTIVE.test(l)),
			);
			expect(bad).toEqual([]);
		});
	}
});
