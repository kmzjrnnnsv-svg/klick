import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Lizenzhinweise der ausgelieferten Pakete (Seite /lizenzen): MIT, ISC und
// BSD verlangen, dass der Hinweis mitgeliefert wird. Nach jedem
// Abhängigkeits-Update ausführen: `pnpm legal:licenses`. Test `legal`
// prüft, dass jede direkte Abhängigkeit in der Datei steht.

type Entry = {
	name: string;
	versions: string[];
	license: string;
	author?: string;
	homepage?: string;
};

const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
	encoding: "utf8",
	maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(raw) as Record<string, Entry[]>;
const rows = Object.values(byLicense)
	.flat()
	.map((e) => ({
		name: e.name,
		version: e.versions.join(", "),
		license: e.license,
		...(e.author ? { author: e.author } : {}),
		...(e.homepage?.startsWith("https://") ? { homepage: e.homepage } : {}),
	}))
	.sort((a, b) => a.name.localeCompare(b.name));
const out = join(process.cwd(), "lib/legal/licenses.json");
writeFileSync(out, `${JSON.stringify(rows, null, "\t")}\n`);
console.log(`✔ ${rows.length} Pakete → lib/legal/licenses.json`);
