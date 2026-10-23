/**
 * Lokale Testkette für Entwicklung und QA — kein Ersatz für die Abnahme mit
 * echten Knoten (Plan Wallet, „Ziel: eine funktionierende Wallet“).
 *
 * Bildet die JSON-RPC-Teilmenge nach, die Klick nutzt (scripts/devchain/*):
 *   Bitcoin Core (Signet)  Port 18443: Beobachtungs-Wallets mit Descriptoren,
 *     listsinceblock (Eingänge, Ausgänge mit Gebühr, removed), gettransaction
 *     (mit hex), getrawtransaction, getbalance(s), listunspent,
 *     estimatesmartfee, testmempoolaccept, sendrawtransaction (Signaturen,
 *     Doppelausgabe, Dust, Mindestgebühr, RBF), deriveaddresses
 *   Reth (Sepolia)         Port 18545: Blöcke mit latest/finalized und
 *     Basisgebühr, trace_filter/trace_transaction, eth_getLogs (Transfer),
 *     Quittungen, Salden, balanceOf, Chainlink-Feeds, Nonces,
 *     eth_feeHistory, eth_estimateGas, eth_getCode, eth_sendRawTransaction
 *     (Signatur, chainId, Ersetzen +10 %, Gas, Zurückrollen) — auch Batch
 * Steuerung (POST, JSON):
 *   :18443/dev/faucet {address, amount:"0.01"}       BTC in den Mempool
 *   :18443/dev/mine {n}                              Blöcke erzeugen
 *   :18443/dev/reorg {depth, conflict?}              letzte Blöcke verwerfen
 *   :18443/dev/fee {satPerVb}                        Gebührenschätzung (null = keine)
 *   :18545/dev/faucet {address, asset, amount, viaContract?}  amount in Basiseinheiten
 *   :18545/dev/mine {n}
 *   :18545/dev/basefee {gwei, tipGwei}               Basisgebühr/Trinkgeld
 *   :18545/dev/blacklist {address, on?}              Circle-Sperrliste (USDC/EURC)
 * Zustand liegt in QA_DIR/devchain.json (überlebt Neustarts).
 *
 *   pnpm wallet:devchain [--auto]
 *   WALLET_RPC_BITCOIN_SIGNET=http://dev:dev@127.0.0.1:18443
 *   WALLET_RPC_ETHEREUM_SEPOLIA=http://127.0.0.1:18545
 */
import { join } from "node:path";
import { startDevchain } from "./devchain/server";
import { QA_DIR } from "./qa/paths";

const chain = await startDevchain({
	btcPort: Number(process.env.DEVCHAIN_BTC_PORT ?? 18443),
	ethPort: Number(process.env.DEVCHAIN_ETH_PORT ?? 18545),
	stateFile: join(QA_DIR, "devchain.json"),
});
console.log(`Bitcoin (Signet-Nachbau) auf ${chain.btcUrl}`);
console.log(`Ethereum (Sepolia-Nachbau) auf ${chain.ethUrl}`);

// --auto: Blöcke wie im Netz (Bitcoin alle 60 s, Ethereum alle 12 s)
if (process.argv.includes("--auto")) {
	setInterval(() => {
		chain.btc.mine(1);
		chain.save();
	}, 60_000);
	setInterval(() => {
		chain.eth.mine(1);
		chain.save();
	}, 12_000);
}
