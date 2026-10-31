/**
 * Bündelt den Netz-Agenten klick-netz (Standort-Tunnel, ADR-033) zu einer
 * Datei: pnpm build:netz-agent → dist/netz-agent.mjs (+ .sha256).
 * Erlaubt sind nur node:* sowie netz-agent/, lib/net/ip.ts und die reinen
 * Regeln unter lib/site-tunnels/{rules,config}.ts; keine Pakete. Alles andere
 * bricht den Build ab (Test netz-agent). Der Agent läuft als root, deshalb
 * baut die Rollout-Phase `standorte` ihn aus dem root-eigenen Checkout und
 * legt ihn nach /usr/local/lib/klick-netz (nie aus /opt/klick/current).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist", "netz-agent.mjs");

export const NETZ_ALLOWED_SOURCES = [
	"netz-agent/",
	"lib/net/ip.ts",
	"lib/site-tunnels/rules.ts",
	"lib/site-tunnels/config.ts",
];

export async function buildNetzAgent(opts: { outfile: string }) {
	const result = await build({
		entryPoints: [path.join(ROOT, "netz-agent/main.ts")],
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
	});
	const inputs = Object.keys(result.metafile.inputs);
	const bad = inputs.filter(
		(i) =>
			i.includes("node_modules/") ||
			!NETZ_ALLOWED_SOURCES.some((p) => i.startsWith(p)),
	);
	const sha = createHash("sha256")
		.update(readFileSync(opts.outfile))
		.digest("hex");
	return { bad, sha, inputs };
}

async function main() {
	const { bad, sha } = await buildNetzAgent({ outfile: OUT });
	if (bad.length > 0) {
		console.error(
			`Netz-Agent enthält nicht erlaubte Module:\n  ${bad.join("\n  ")}`,
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
