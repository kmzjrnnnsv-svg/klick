/**
 * Bündelt den Parser-Prozess (N6) zu einer Datei `dist/parse-worker.mjs`.
 * Der systemd-Dienst klick-parse startet genau diese Datei mit
 * `node --jitless` — ohne node_modules, ohne tsx, ohne Schreibrechte.
 * Erlaubt sind nur Module aus `lib/` und die Parser-Bibliotheken unten;
 * alles andere (Datenbank, Auth, Krypto, Env) bricht den Build ab.
 *
 *   pnpm build:parser
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist", "parse-worker.mjs");

// Woraus der Parser bestehen darf (Eingaben laut Metafile)
const ALLOWED_LIB = [
	"lib/parse/",
	"lib/uploads/validate.ts",
	"lib/uploads/limits.ts",
	"lib/uploads/zip-read.ts",
	"lib/dlp/detectors.ts",
	"lib/dlp/extract.ts",
	"lib/dlp/pdf-text.ts",
	"lib/security/parsers.ts",
	"lib/security/finding-rules.ts",
	"lib/security/types.ts",
	"lib/security/sbom-check.ts",
];
const ALLOWED_PACKAGES = [
	"zod",
	"file-type",
	"strtok3",
	"token-types",
	"@tokenizer/inflate",
	"@tokenizer/token",
	"uint8array-extras",
	"@borewit/text-codec",
	"ieee754",
	"debug",
	"ms",
];

function packageOf(input: string): string | null {
	const m = input.match(
		/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//,
	);
	return m?.[1] ?? null;
}

async function main() {
	const result = await build({
		entryPoints: [path.join(ROOT, "lib/parse/worker.ts")],
		outfile: OUT,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		tsconfig: path.join(ROOT, "tsconfig.json"),
		minify: false,
		sourcemap: false,
		legalComments: "eof",
		metafile: true,
		logLevel: "warning",
		// nur node:* bleibt extern; alles andere steckt in der Datei
		external: ["node:*"],
		banner: {
			js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
		},
	});
	const bad: string[] = [];
	for (const input of Object.keys(result.metafile.inputs)) {
		const pkg = packageOf(input);
		if (pkg) {
			if (!ALLOWED_PACKAGES.includes(pkg)) bad.push(input);
			continue;
		}
		if (!ALLOWED_LIB.some((p) => input.startsWith(p))) bad.push(input);
	}
	if (bad.length > 0) {
		console.error(
			`Parser-Bündel enthält nicht erlaubte Module:\n  ${bad.join("\n  ")}`,
		);
		process.exitCode = 1;
		return;
	}
	const sha = createHash("sha256").update(readFileSync(OUT)).digest("hex");
	console.log(`dist/parse-worker.mjs  sha256 ${sha}`);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
