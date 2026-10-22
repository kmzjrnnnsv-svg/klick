import { loadEnvFiles } from "../lib/env";
import { ASSETS } from "../lib/wallet/core/assets";
import { NETWORKS, WALLET_NETWORKS } from "../lib/wallet/core/networks";
import {
	EXPECTED_BTC_CHAIN,
	nodeClientsFromEnv,
} from "../lib/wallet/node-clients";
import { hexToNumber } from "../lib/wallet/rpc/ethereum";
import { RpcError } from "../lib/wallet/rpc/http";

// Prüft die eigenen Knoten des Wallet-Bereichs (Runbook „Wallet: Knoten“):
// erreichbar, richtige Kette, synchron, nötige APIs, gesperrte Methoden und
// — bei Ethereum — die fest hinterlegten Token-Verträge (decimals/symbol).
//
//   pnpm wallet:check
//
// Exit 1, sobald eine Prüfung scheitert.

let failures = 0;
const ok = (label: string, detail = "") =>
	console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ""}`);
const bad = (label: string, detail = "") => {
	failures += 1;
	console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
};

// ABI-kodierter String (symbol()) → Text
function abiString(hex: string): string {
	const data = hex.replace(/^0x/, "");
	if (data.length < 128) return "";
	const len = Number.parseInt(data.slice(64, 128), 16);
	return Buffer.from(data.slice(128, 128 + len * 2), "hex").toString("utf8");
}

async function main() {
	loadEnvFiles();
	const clients = nodeClientsFromEnv();
	if (Object.keys(clients).length === 0) {
		console.log("Kein Knoten konfiguriert (WALLET_RPC_* fehlt).");
		process.exit(1);
	}
	for (const network of WALLET_NETWORKS) {
		const client = clients[network];
		if (!client) continue;
		console.log(`\n${NETWORKS[network].label}`);
		try {
			if (client.chain === "bitcoin") {
				const info = await client.btc.blockchainInfo();
				if (info.chain === EXPECTED_BTC_CHAIN[network])
					ok("richtige Kette", info.chain);
				else
					bad(
						"falsche Kette",
						`${info.chain}, erwartet ${EXPECTED_BTC_CHAIN[network]}`,
					);
				if (!info.initialblockdownload && info.headers - info.blocks <= 2)
					ok("synchron", `Block ${info.blocks}`);
				else bad("nicht synchron", `${info.blocks}/${info.headers}`);
				// rpcwhitelist: Methoden außerhalb der Liste beantwortet Bitcoin
				// Core mit HTTP 403 — alles andere heißt: keine Whitelist
				try {
					await client.btc.probe("help");
					bad("rpcwhitelist", "„help“ ist erlaubt — Whitelist fehlt");
				} catch (e) {
					if (e instanceof RpcError && e.code === "http")
						ok("rpcwhitelist greift");
					else bad("rpcwhitelist", e instanceof Error ? e.message : String(e));
				}
				await client.btc.listWallets();
				ok("Wallet-RPC erreichbar");
			} else {
				const rpc = client.eth;
				const chainId = await rpc.chainId();
				if (chainId === NETWORKS[network].chainId)
					ok("richtige Kette", `chainId ${chainId}`);
				else bad("falsche Kette", `chainId ${chainId}`);
				const [latest, finalized] = await Promise.all([
					rpc.block("latest"),
					rpc.block("finalized"),
				]);
				if (!latest || !finalized) bad("keine Blöcke latest/finalized");
				else {
					const age = Date.now() / 1000 - hexToNumber(latest.timestamp);
					if (age < 120)
						ok(
							"synchron",
							`Block ${hexToNumber(latest.number)}, ${Math.round(age)} s alt`,
						);
					else bad("nicht synchron", `letzter Block ${Math.round(age)} s alt`);
					ok("finalisiert", `Block ${hexToNumber(finalized.number)}`);
					const n = hexToNumber(latest.number);
					await rpc.traceFilter({
						fromBlock: Math.max(0, n - 1),
						toBlock: n,
						toAddress: ["0x0000000000000000000000000000000000000000"],
					});
					ok("trace-API verfügbar");
				}
				for (const asset of ASSETS[network]) {
					if (!asset.contract) continue;
					const call = (data: string) =>
						rpc.callContract(asset.contract as string, data);
					const decimals = Number.parseInt(
						(await call("0x313ce567")).slice(2) || "0",
						16,
					);
					const symbol = abiString(await call("0x95d89b41"));
					if (decimals === asset.decimals && symbol === asset.code)
						ok(
							`${asset.code}-Vertrag`,
							`${asset.contract} · ${decimals} Stellen`,
						);
					else
						bad(
							`${asset.code}-Vertrag`,
							`${asset.contract}: decimals ${decimals}, symbol „${symbol}“`,
						);
				}
			}
		} catch (e) {
			bad(
				"nicht erreichbar oder Fehler",
				e instanceof Error ? e.message : String(e),
			);
		}
	}
	console.log(
		failures
			? `\n${failures} Prüfung(en) fehlgeschlagen`
			: "\nAlles in Ordnung.",
	);
	process.exit(failures ? 1 : 0);
}

main();
