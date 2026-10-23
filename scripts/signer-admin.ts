/**
 * Verwaltung des Signers am Terminal (root, admin.sock). Nur hier lässt sich
 * einrichten und lockern — die App kann nur bremsen.
 *
 *   pnpm signer:admin status
 *   pnpm signer:admin init --org <uuid> --rp freigabe.raza.work --networks bitcoin_signet,ethereum_sepolia [--dice]
 *   pnpm signer:admin network-add --networks <netz,…>
 *   pnpm signer:admin enrol --person <userId> [--ttl 3600]
 *   pnpm signer:admin revoke <credId>
 *   pnpm signer:admin policy <datei.json>        (Version/Vorgänger setzt das Skript)
 *   pnpm signer:admin freeze "<Grund>" | unfreeze
 *   pnpm signer:admin cancel <intentId>
 *   pnpm signer:admin verify | xpubs | rekey
 *
 * Socket: --socket <pfad>, sonst SIGNER_ADMIN_SOCKET, sonst
 * /run/klick-signer/admin.sock; mit --dev QA_DIR/signer/admin.sock.
 */
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { type Policy, policyHash } from "../lib/wallet/core/policy";
import { callSigner, SignerCallError } from "../signer/client";
import { QA_DIR } from "./qa/paths";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
	const i = argv.indexOf(`--${name}`);
	return i === -1 ? undefined : argv[i + 1];
};
// Optionen mit Wert; alles andere mit -- ist ein Schalter
const VALUE_OPTS = new Set([
	"socket",
	"org",
	"rp",
	"origin",
	"networks",
	"person",
	"ttl",
]);
const positional = argv.filter(
	(a, i) =>
		!a.startsWith("--") &&
		!(
			argv[i - 1]?.startsWith("--") &&
			VALUE_OPTS.has(argv[i - 1]?.slice(2) ?? "")
		),
);
const [cmd, arg] = positional;

const socket =
	opt("socket") ??
	(flag("dev")
		? join(QA_DIR, "signer", "admin.sock")
		: (process.env.SIGNER_ADMIN_SOCKET ?? "/run/klick-signer/admin.sock"));

async function call<T = Record<string, unknown>>(
	c: string,
	args: unknown = {},
) {
	return (await callSigner<T>(socket, c, args, { timeoutMs: 60_000 })).result;
}

const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));

// Wörter einmal zeigen, dann drei Stellen je Netz abfragen
async function ceremony(networks: string[], dice: boolean) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		let diceText: string | undefined;
		if (dice)
			diceText = (
				await rl.question(
					"Würfelwürfe (mind. 99 Ziffern 1–6, werden mit der System-Entropie gemischt): ",
				)
			).trim();
		const prep = await call<{
			token: string;
			words: Record<string, string>;
			fingerprints: Record<string, string>;
		}>("seed.prepare", { networks, ...(diceText ? { dice: diceText } : {}) });
		const status = await call<{ dev: boolean }>("hello");
		const auto = flag("auto-confirm") && status.dev;
		const checks: Record<string, Record<string, string>> = {};
		for (const n of networks) {
			const words = (prep.words[n] as string).split(" ");
			if (!auto) {
				console.log(
					`\n${n} (Fingerprint ${prep.fingerprints[n]}) — auf Stahl oder Papier notieren, zwei Orte:\n`,
				);
				for (let r = 0; r < 6; r += 1)
					console.log(
						[0, 1, 2, 3]
							.map((c) => {
								const i = r * 4 + c;
								return `${String(i + 1).padStart(2)}. ${(words[i] as string).padEnd(10)}`;
							})
							.join("  "),
					);
				await rl.question(
					"\nNotiert? Enter drücken — danach wird der Bildschirm geleert.",
				);
				process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
			}
			const positions = new Set<number>();
			while (positions.size < 3) positions.add(randomInt(1, 25));
			checks[n] = {};
			for (const p of [...positions].sort((a, b) => a - b))
				(checks[n] as Record<string, string>)[p] = auto
					? (words[p - 1] as string)
					: (await rl.question(`${n}: Wort Nr. ${p}: `)).trim();
		}
		return { token: prep.token, checks };
	} finally {
		rl.close();
	}
}

async function main() {
	switch (cmd) {
		case "status":
			return print(await call("status"));
		case "verify":
			return print(await call("journal.verify"));
		case "xpubs":
			return print(await call("export-xpubs"));
		case "rekey":
			return print(await call("rekey"));
		case "unfreeze":
			return print(await call("unfreeze"));
		case "freeze":
			return print(await call("freeze", { reason: arg ?? "am Terminal" }));
		case "cancel":
			return print(await call("intent.cancel", { intentId: arg }));
		case "revoke":
			return print(await call("key.revoke", { credId: arg }));
		case "enrol": {
			const r = await call<{ url: string; expiresAt: number }>("enrol.start", {
				person: opt("person"),
				...(opt("ttl") ? { ttlSec: Number(opt("ttl")) } : {}),
			});
			console.log(
				`Einrichtungslink (gültig bis ${new Date(r.expiresAt * 1000).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}):\n\n${r.url}\n\nNur an die Person geben, die den Schlüssel einrichtet. Klick sieht den Link nie.`,
			);
			return;
		}
		case "init": {
			const networks = (opt("networks") ?? "").split(",").filter(Boolean);
			const { token, checks } = await ceremony(networks, flag("dice"));
			return print(
				await call("init.commit", {
					token,
					checks,
					orgId: opt("org"),
					rpId: opt("rp"),
					...(opt("origin") ? { origin: opt("origin") } : {}),
				}),
			);
		}
		case "network-add": {
			const networks = (opt("networks") ?? "").split(",").filter(Boolean);
			const { token, checks } = await ceremony(networks, flag("dice"));
			return print(await call("network.commit", { token, checks }));
		}
		case "policy": {
			if (!arg) throw new Error("Datei mit der Richtlinie fehlt");
			const current = (await call<{ policy: Policy }>("status")).policy;
			const next = JSON.parse(readFileSync(arg, "utf8")) as Policy;
			next.version = current.version + 1;
			next.prev = policyHash(current);
			return print(await call("policy.set", { policy: next }));
		}
		default:
			console.log(
				readFileSync(new URL(import.meta.url), "utf8").split("*/")[0],
			);
			process.exitCode = 1;
	}
}

main().catch((e) => {
	if (e instanceof SignerCallError)
		console.error(
			`Signer: ${e.code}${e.signerCode ? ` ${e.signerCode}` : ""}${e.detail ? ` (${e.detail})` : ""}`,
		);
	else console.error(e instanceof Error ? e.message : e);
	process.exitCode = 1;
});
