import { loadEnvFiles } from "../lib/env";
import { ASSETS } from "../lib/wallet/core/assets";
import { FEED_CALLS, FEEDS } from "../lib/wallet/core/feeds";
import { NETWORKS, WALLET_NETWORKS } from "../lib/wallet/core/networks";
import {
	EXPECTED_BTC_CHAIN,
	nodeClientsFromEnv,
} from "../lib/wallet/node-clients";
import { decodeAbiString, decodeRoundData } from "../lib/wallet/prices";
import { hexToNumber } from "../lib/wallet/rpc/ethereum";
import { RpcError } from "../lib/wallet/rpc/http";
import {
	confirmOrigin,
	type SignerHello,
	signerCall,
	signerSocket,
} from "../lib/wallet/signer/client";

// Prüft die eigenen Knoten des Wallet-Bereichs (Runbook „Wallet: Knoten“):
// erreichbar, richtige Kette, synchron, nötige APIs, gesperrte Methoden und
// — bei Ethereum — die fest hinterlegten Token-Verträge (decimals/symbol)
// sowie die Chainlink-Kursfeeds (description, 8 Stellen, frische Runde).
// Mit SIGNER_SOCKET zusätzlich der Signer: erreichbar, eingerichtet, nicht
// eingefroren, Herkunft = CONFIRM_ORIGIN, Knoten für seine Netze, genug
// Sicherheitsschlüssel für die Freigabe laut Richtlinie.
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
				// Senden (Phase 2): Gebührenschätzung muss auf der Whitelist stehen
				try {
					const rate = await client.btc.estimateSmartFee(2);
					ok(
						"Senden: Gebührenschätzung",
						rate ? `${rate} BTC/kvB` : "noch keine",
					);
				} catch (e) {
					bad(
						"Senden: estimatesmartfee",
						e instanceof Error ? e.message : String(e),
					);
				}
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
				// Senden (Phase 2): Gebühren für Typ-2-Transaktionen
				try {
					const fees = await rpc.feeHistory();
					ok(
						"Senden: Gebühren",
						`Basis ${fees.nextBaseFee / 1_000_000_000n} gwei, Trinkgeld ${fees.priorityFee} wei`,
					);
				} catch (e) {
					bad(
						"Senden: eth_feeHistory",
						e instanceof Error ? e.message : String(e),
					);
				}
				// Chainlink-Feeds: Beschreibung, 8 Stellen, frische Runde
				for (const feed of FEEDS[network] ?? []) {
					const desc = decodeAbiString(
						await rpc.callContract(feed.address, FEED_CALLS.description),
					);
					const dec = Number.parseInt(
						(await rpc.callContract(feed.address, FEED_CALLS.decimals)).slice(
							2,
						) || "0",
						16,
					);
					const round = decodeRoundData(
						await rpc.callContract(feed.address, FEED_CALLS.latestRoundData),
					);
					const ageH = round
						? (Date.now() / 1000 - round.updatedAt) / 3600
						: null;
					if (
						desc === feed.description &&
						dec === 8 &&
						ageH !== null &&
						ageH < 26
					)
						ok(
							`Kurs ${feed.key}`,
							`${feed.address} · Runde ${Math.round(ageH * 10) / 10} h alt`,
						);
					else
						bad(
							`Kurs ${feed.key}`,
							`${feed.address}: „${desc}“, ${dec} Stellen, ${ageH === null ? "keine Runde" : `${Math.round(ageH)} h alt`}`,
						);
				}
				for (const asset of ASSETS[network]) {
					if (!asset.contract) continue;
					const call = (data: string) =>
						rpc.callContract(asset.contract as string, data);
					const decimals = Number.parseInt(
						(await call("0x313ce567")).slice(2) || "0",
						16,
					);
					const symbol = decodeAbiString(await call("0x95d89b41"));
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
	await checkSigner(Object.keys(clients));
	console.log(
		failures
			? `\n${failures} Prüfung(en) fehlgeschlagen`
			: "\nAlles in Ordnung.",
	);
	process.exit(failures ? 1 : 0);
}

type SignerStatus = SignerHello & {
	policy: {
		version: number;
		mode: "solo" | "four_eyes";
		soloMinKeys: number;
	} | null;
	keys: { person: string; active: boolean }[];
};

async function checkSigner(nodeNetworks: string[]) {
	if (!signerSocket()) return;
	console.log("\nSigner");
	let st: SignerStatus;
	try {
		st = (await signerCall<SignerStatus>("status", {}, { timeoutMs: 5000 }))
			.result;
		ok("erreichbar", signerSocket() ?? "");
	} catch (e) {
		bad("nicht erreichbar", e instanceof Error ? e.message : String(e));
		return;
	}
	if (!st.initialized || !st.policy) {
		bad("nicht eingerichtet", "sudo klick-signer-admin init");
		return;
	}
	ok("eingerichtet", `Org ${st.orgId}, Journal #${st.seq}`);
	if (st.frozen) bad("eingefroren", st.frozen.reason);
	else ok("nicht eingefroren");
	if (st.dev)
		bad("Entwicklungs-Signer", "kurze Wartezeiten, nur für die Testkette");
	if (st.bundleHash) ok("Programm", st.bundleHash);
	const origin = confirmOrigin();
	if (origin && origin === st.origin) ok("Bestätigungsseite", origin);
	else
		bad(
			"Bestätigungsseite",
			`CONFIRM_ORIGIN ${origin ?? "fehlt"}, Signer ${st.origin}`,
		);
	for (const n of st.networks)
		if (nodeNetworks.includes(n)) ok(`Knoten für ${n}`);
		else bad(`Knoten für ${n}`, "WALLET_RPC_* fehlt");
	const active = new Map<string, number>();
	for (const k of st.keys)
		if (k.active) active.set(k.person, (active.get(k.person) ?? 0) + 1);
	const persons = [...active.values()];
	const policy = st.policy;
	const enough =
		policy.mode === "solo"
			? persons.some((n) => n >= policy.soloMinKeys)
			: persons.length >= 2;
	if (enough)
		ok(
			"Sicherheitsschlüssel",
			`${persons.reduce((a, b) => a + b, 0)} aktiv, ${persons.length} Person(en), Richtlinie v${st.policy.version} (${st.policy.mode})`,
		);
	else
		bad(
			"Sicherheitsschlüssel",
			st.policy.mode === "solo"
				? `Solo braucht ${st.policy.soloMinKeys} aktive Schlüssel einer Person`
				: "Vier Augen braucht zwei Personen mit Schlüssel",
		);
}

main();
