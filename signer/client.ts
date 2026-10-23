import { createConnection } from "node:net";

// Client für app.sock/admin.sock: je Aufruf eine Verbindung, eine Zeile hin,
// eine zurück. Genutzt von der Kommandozeile (scripts/signer-admin.ts) und
// von Klick (lib/wallet/signer/client.ts).

export type SignerCallErrorCode =
	| "unreachable"
	| "timeout"
	| "protocol"
	| "signer";

export class SignerCallError extends Error {
	constructor(
		readonly code: SignerCallErrorCode,
		readonly signerCode?: string,
		readonly detail?: string,
		readonly seq?: number,
		readonly head?: string,
	) {
		super(
			signerCode ? `${code}:${signerCode}${detail ? `:${detail}` : ""}` : code,
		);
		this.name = "SignerCallError";
	}
}

export type CallMeta = { seq: number; head: string };

let nextId = 1;

export function callSigner<T>(
	socketPath: string,
	cmd: string,
	args: unknown = {},
	opts: { timeoutMs?: number } = {},
): Promise<{ result: T } & CallMeta> {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		const sock = createConnection(socketPath);
		let buf = "";
		let done = false;
		const finish = (fn: () => void) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			sock.destroy();
			fn();
		};
		const timer = setTimeout(
			() => finish(() => reject(new SignerCallError("timeout"))),
			opts.timeoutMs ?? 10_000,
		);
		sock.setEncoding("utf8");
		sock.on("connect", () => {
			sock.write(`${JSON.stringify({ id, cmd, args })}\n`);
		});
		sock.on("data", (chunk: string) => {
			buf += chunk;
			if (buf.length > 4 * 1024 * 1024)
				return finish(() => reject(new SignerCallError("protocol")));
			const nl = buf.indexOf("\n");
			if (nl === -1) return;
			let res: {
				id: unknown;
				ok: boolean;
				result?: T;
				error?: { code: string; detail?: string };
				seq: number;
				head: string;
			};
			try {
				res = JSON.parse(buf.slice(0, nl));
			} catch {
				return finish(() => reject(new SignerCallError("protocol")));
			}
			if (
				res.id !== id ||
				typeof res.seq !== "number" ||
				typeof res.head !== "string"
			)
				return finish(() => reject(new SignerCallError("protocol")));
			finish(() =>
				res.ok
					? resolve({ result: res.result as T, seq: res.seq, head: res.head })
					: reject(
							new SignerCallError(
								"signer",
								res.error?.code ?? "unknown",
								res.error?.detail,
								res.seq,
								res.head,
							),
						),
			);
		});
		sock.on("error", () =>
			finish(() => reject(new SignerCallError("unreachable"))),
		);
		sock.on("close", () =>
			finish(() => reject(new SignerCallError("protocol"))),
		);
	});
}
