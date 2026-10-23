/**
 * Wiederherstellungstest für die Seeds des Signers (CC-KEY-03) — auf einem
 * zweiten Rechner ohne Netz: aus den 24 Wörtern dieselben Kontoschlüssel?
 *
 *   pnpm signer:recover-check --network bitcoin_signet --xpubs xpubs.json
 *
 * xpubs.json = Ausgabe von `pnpm signer:admin xpubs` (nur öffentliche
 * Schlüssel). Die Wörter werden abgefragt, nie gespeichert. Ergebnis
 * „übereinstimmend“ als Wiederherstellungstest in Klick eintragen
 * (Verwahrung → Zeremonien/Backup-Tests).
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { isWalletNetwork } from "../lib/wallet/core/networks";
import { entropyOfMnemonic, KeyRing } from "../signer/keys";

const argv = process.argv.slice(2);
const opt = (name: string) => {
	const i = argv.indexOf(`--${name}`);
	return i === -1 ? undefined : argv[i + 1];
};

async function main() {
	const network = opt("network") ?? "";
	if (!isWalletNetwork(network))
		throw new Error("--network fehlt oder unbekannt");
	const file = opt("xpubs");
	if (!file) throw new Error("--xpubs <datei> fehlt");
	const exported = JSON.parse(readFileSync(file, "utf8")) as {
		fingerprints: Record<string, string>;
		accounts: { network: string; index: number; xpub: string }[];
	};
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const words = await rl.question("24 Wörter (mit Leerzeichen): ");
	rl.close();
	process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
	const ring = KeyRing.fromEntropy({ [network]: entropyOfMnemonic(words) });
	const fp = ring.fingerprint(network);
	let ok = fp === exported.fingerprints[network];
	console.log(
		`Fingerprint ${fp} ${ok ? "= " : "≠ "}${exported.fingerprints[network]}`,
	);
	for (const a of exported.accounts.filter((x) => x.network === network)) {
		const same = ring.accountXpub(network, a.index) === a.xpub;
		ok &&= same;
		console.log(`Konto ${a.index}: ${same ? "übereinstimmend" : "ABWEICHEND"}`);
	}
	console.log(
		ok
			? "\nWiederherstellung übereinstimmend."
			: "\nWiederherstellung ABWEICHEND.",
	);
	process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exitCode = 1;
});
