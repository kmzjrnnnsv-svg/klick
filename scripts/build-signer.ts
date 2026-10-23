/**
 * Bündelt den Signier-Dienst (Plan Wallet, Phase 2) zu einer Datei:
 *   pnpm build:signer          → dist/signer.mjs      (Betrieb)
 *   pnpm build:signer --dev    → dist/signer-dev.mjs  (Wartezeiten 0, ein Schlüssel)
 * Erlaubt sind nur node:*, @noble/*, @scure/*, micro-eth-signer (+ micro-packed)
 * sowie signer/ und lib/wallet/core/ — alles andere bricht den Build ab.
 * Der SHA-256 landet neben der Datei; deploy/signer/install.sh vergleicht ihn
 * mit dem Wert aus CI.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV = process.argv.includes("--dev");
const OUT = path.join(ROOT, "dist", DEV ? "signer-dev.mjs" : "signer.mjs");

export const SIGNER_ALLOWED_SOURCES = ["signer/", "lib/wallet/core/"];
export const SIGNER_ALLOWED_PACKAGES = [
	"@noble/curves",
	"@noble/hashes",
	"@scure/base",
	"@scure/bip32",
	"@scure/bip39",
	"@scure/btc-signer",
	"micro-eth-signer",
	"micro-packed",
];

function packageOf(input: string): string | null {
	const m = input.match(
		/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//,
	);
	return m?.[1] ?? null;
}

export async function buildSigner(opts: { dev: boolean; outfile: string }) {
	const result = await build({
		entryPoints: [path.join(ROOT, "signer/main.ts")],
		outfile: opts.outfile,
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
		external: ["node:*"],
		define: { __DEV__: opts.dev ? "true" : "false" },
	});
	const bad: string[] = [];
	for (const input of Object.keys(result.metafile.inputs)) {
		const pkg = packageOf(input);
		if (pkg) {
			if (!SIGNER_ALLOWED_PACKAGES.includes(pkg)) bad.push(input);
			continue;
		}
		if (!SIGNER_ALLOWED_SOURCES.some((p) => input.startsWith(p)))
			bad.push(input);
	}
	const sha = createHash("sha256")
		.update(readFileSync(opts.outfile))
		.digest("hex");
	return { bad, sha, inputs: Object.keys(result.metafile.inputs) };
}

async function main() {
	const { bad, sha } = await buildSigner({ dev: DEV, outfile: OUT });
	if (bad.length > 0) {
		console.error(
			`Signer-Bündel enthält nicht erlaubte Module:\n  ${bad.join("\n  ")}`,
		);
		process.exitCode = 1;
		return;
	}
	writeFileSync(`${OUT}.sha256`, `${sha}  ${path.basename(OUT)}\n`);
	console.log(`${path.relative(ROOT, OUT)}  sha256 ${sha}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))
	main().catch((err) => {
		console.error(err);
		process.exitCode = 1;
	});
