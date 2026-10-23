import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { btcChain, parseBtcAmount, serializeBtc } from "./btc";
import { ethChain } from "./eth";
import {
	Forbidden,
	GWEI,
	loadState,
	RpcFault,
	type State,
	saveState,
} from "./state";

// HTTP-Seite der lokalen Testkette: zwei Server (Bitcoin Core / Reth) mit
// JSON-RPC wie die echten Knoten und Steuerung unter /dev/*. Ports 0 =
// freier Port (Tests); stateFile null = nur im Speicher.

export type DevchainOptions = {
	btcPort: number;
	ethPort: number;
	stateFile: string | null;
	host?: string;
};

export type Devchain = {
	btcUrl: string;
	ethUrl: string;
	state: State;
	btc: ReturnType<typeof btcChain>;
	eth: ReturnType<typeof ethChain>;
	save: () => void;
	close: () => Promise<void>;
};

type Req = { id: unknown; method: string; params?: unknown[] };

const MAX_BODY = 4 * 1024 * 1024;

async function body(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const c of req) {
		size += (c as Buffer).length;
		if (size > MAX_BODY) throw new Error("body too large");
		chunks.push(c as Buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, text: string) {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(text);
}

// Antwort wie die echten Knoten: Bitcoin Core (JSON-RPC 1.0) meldet Fehler
// mit HTTP 500, Reth (2.0) mit 200; Batch-Anfragen als Liste
function handleRpc(
	text: string,
	call: (m: string, p: unknown[]) => unknown,
	version: "1.0" | "2.0",
	serialize: (v: unknown) => string,
): { status: number; body: string } {
	let parsed: Req | Req[];
	try {
		parsed = JSON.parse(text) as Req | Req[];
	} catch {
		return {
			status: version === "1.0" ? 500 : 200,
			body: serialize({
				jsonrpc: version === "2.0" ? "2.0" : undefined,
				id: null,
				result: null,
				error: { code: -32700, message: "Parse error" },
			}),
		};
	}
	const one = (r: Req) => {
		try {
			return {
				jsonrpc: version === "2.0" ? "2.0" : undefined,
				id: r.id,
				result: call(r.method, r.params ?? []),
				error: null,
			};
		} catch (e) {
			if (e instanceof Forbidden) throw e;
			const f = e instanceof RpcFault ? e : new RpcFault(-1, String(e));
			return {
				jsonrpc: version === "2.0" ? "2.0" : undefined,
				id: r.id,
				result: null,
				error: { code: f.code, message: f.message },
			};
		}
	};
	if (Array.isArray(parsed))
		return { status: 200, body: serialize(parsed.map(one)) };
	const res = one(parsed);
	return {
		status: res.error && version === "1.0" ? 500 : 200,
		body: serialize(res),
	};
}

const listen = (server: Server, port: number, host: string) =>
	new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () =>
			resolve((server.address() as AddressInfo).port),
		);
	});

const closeServer = (server: Server) =>
	new Promise<void>((resolve) => {
		server.close(() => resolve());
		server.closeAllConnections();
	});

const asInput = (text: string) =>
	(text ? JSON.parse(text) : {}) as Record<string, unknown>;

export async function startDevchain(opts: DevchainOptions): Promise<Devchain> {
	const host = opts.host ?? "127.0.0.1";
	const state = loadState(opts.stateFile);
	const btc = btcChain(state);
	const eth = ethChain(state);
	const save = () => saveState(opts.stateFile, state);

	const btcServer = createServer(async (req, res) => {
		try {
			const text = await body(req);
			const url = req.url ?? "/";
			if (url.startsWith("/dev/")) {
				const input = asInput(text);
				if (url === "/dev/faucet") {
					const txid = btc.faucet(
						String(input.address),
						parseBtcAmount(String(input.amount ?? "0.01")),
						input.from ? String(input.from) : undefined,
					);
					save();
					return send(res, 200, JSON.stringify({ txid }));
				}
				if (url === "/dev/mine") {
					const height = btc.mine(Number(input.n ?? 1));
					save();
					return send(res, 200, JSON.stringify({ height }));
				}
				if (url === "/dev/reorg") {
					const out = btc.reorg(
						Number(input.depth ?? 1),
						input.conflict !== false,
					);
					save();
					return send(res, 200, JSON.stringify(out));
				}
				// Gebührensatz für estimatesmartfee (sat/vB); null = keine Schätzung
				if (url === "/dev/fee") {
					const rate = input.satPerVb;
					state.btc.feeRate =
						rate === null ? null : Math.max(1, Number(rate ?? 2));
					save();
					return send(
						res,
						200,
						JSON.stringify({ satPerVb: state.btc.feeRate }),
					);
				}
				return send(res, 404, "{}");
			}
			const wallet = /^\/wallet\/([^/?]+)/.exec(url)?.[1];
			const out = handleRpc(
				text,
				(m, p) => btc.call(m, p, wallet ? decodeURIComponent(wallet) : null),
				"1.0",
				serializeBtc,
			);
			save();
			send(res, out.status, out.body);
		} catch (e) {
			// rpcwhitelist-Nachbau: nicht erlaubte Methode → 403 ohne Inhalt
			if (e instanceof Forbidden) {
				res.writeHead(403);
				res.end();
				return;
			}
			send(res, 400, JSON.stringify({ error: String(e) }));
		}
	});

	const ethServer = createServer(async (req, res) => {
		try {
			const text = await body(req);
			const url = req.url ?? "/";
			if (url.startsWith("/dev/")) {
				const input = asInput(text);
				if (url === "/dev/faucet") {
					const out = eth.faucet({
						address: String(input.address),
						asset:
							(input.asset as "ETH" | "USDC" | "EURC" | undefined) ?? "ETH",
						amount:
							input.amount === undefined ? undefined : String(input.amount),
						viaContract: Boolean(input.viaContract),
						from: input.from ? String(input.from) : undefined,
					});
					save();
					return send(res, 200, JSON.stringify(out));
				}
				if (url === "/dev/mine") {
					const height = eth.mine(Number(input.n ?? 1));
					save();
					return send(res, 200, JSON.stringify({ height }));
				}
				// Basisgebühr und übliches Trinkgeld der nächsten Blöcke (gwei)
				if (url === "/dev/basefee") {
					if (input.gwei !== undefined)
						state.eth.baseFee = (
							BigInt(Math.round(Number(input.gwei) * 1000)) *
							(GWEI / 1000n)
						).toString();
					if (input.tipGwei !== undefined)
						state.eth.tip = (
							BigInt(Math.round(Number(input.tipGwei) * 1000)) *
							(GWEI / 1000n)
						).toString();
					save();
					return send(
						res,
						200,
						JSON.stringify({ baseFee: state.eth.baseFee, tip: state.eth.tip }),
					);
				}
				// Circle-Sperrliste: transfer() von/an die Adresse scheitert
				if (url === "/dev/blacklist") {
					const a = String(input.address).toLowerCase();
					state.eth.blacklist = state.eth.blacklist.filter((x) => x !== a);
					if (input.on !== false) state.eth.blacklist.push(a);
					save();
					return send(
						res,
						200,
						JSON.stringify({ blacklist: state.eth.blacklist }),
					);
				}
				return send(res, 404, "{}");
			}
			const out = handleRpc(text, eth.call, "2.0", (v) => JSON.stringify(v));
			save();
			send(res, out.status, out.body);
		} catch (e) {
			send(res, 400, JSON.stringify({ error: String(e) }));
		}
	});

	const btcPort = await listen(btcServer, opts.btcPort, host);
	const ethPort = await listen(ethServer, opts.ethPort, host);
	return {
		btcUrl: `http://${host}:${btcPort}`,
		ethUrl: `http://${host}:${ethPort}`,
		state,
		btc,
		eth,
		save,
		close: async () => {
			await Promise.all([closeServer(btcServer), closeServer(ethServer)]);
		},
	};
}
