/**
 * Signer für die Entwicklung: baut das Dev-Bundle (Wartezeiten 0, ein
 * Sicherheitsschlüssel genügt) und startet es mit denselben Node-Flags wie
 * im Betrieb. Zustand, KEK und Sockets in QA_DIR/signer.
 *
 *   pnpm signer:dev
 *   pnpm signer:admin --dev init --org <qaOrg> --rp localhost --origin http://localhost:3201 \
 *     --networks bitcoin_signet,ethereum_sepolia --auto-confirm
 *   WALLET_SIGNER_SOCKET=$QA_DIR/signer/app.sock pnpm dev:wallet
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildSigner } from "./build-signer";
import { QA_DIR } from "./qa/paths";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = join(QA_DIR, "signer");
const OUT = join(ROOT, "dist", "signer-dev.mjs");

async function main() {
	mkdirSync(DIR, { recursive: true, mode: 0o700 });
	const kek = join(DIR, "kek");
	if (!existsSync(kek))
		writeFileSync(kek, randomBytes(32).toString("hex"), { mode: 0o600 });
	const { bad, sha } = await buildSigner({ dev: true, outfile: OUT });
	if (bad.length > 0)
		throw new Error(`nicht erlaubte Module: ${bad.join(", ")}`);
	console.log(`dist/signer-dev.mjs  sha256 ${sha}`);
	const child = spawn(
		process.execPath,
		[
			"--jitless",
			"--disallow-code-generation-from-strings",
			"--disable-proto=delete",
			OUT,
		],
		{
			stdio: "inherit",
			env: { ...process.env, SIGNER_DIR: DIR, SIGNER_KEK_FILE: kek },
		},
	);
	child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
