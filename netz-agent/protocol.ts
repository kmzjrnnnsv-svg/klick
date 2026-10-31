import type { Server, Socket } from "node:net";
import type { NetzAgent } from "./agent";
import { SpecError } from "./spec";

// Protokoll des Netz-Agenten: je Zeile ein JSON-Objekt {id, cmd, args} →
// {id, ok, result | error}. Höchstens 64 KiB je Zeile, Befehle strikt
// nacheinander (eine Warteschlange für alle Verbindungen). Nur vier Befehle;
// alles andere = unknown_command.

export const MAX_LINE = 64 * 1024;

export const COMMANDS: Record<
	string,
	(a: NetzAgent, args: unknown) => unknown
> = {
	hello: (a) => a.hello(),
	status: (a) => a.status(),
	apply: (a, args) => a.apply(args),
	remove: (a, args) => a.remove((args as { id?: unknown } | null)?.id),
};

export type Reply =
	| { id: unknown; ok: true; result: unknown }
	| { id: unknown; ok: false; error: string };

export function serve(
	server: Server,
	agent: NetzAgent,
	log: (m: string) => void,
) {
	let queue: Promise<unknown> = Promise.resolve();
	const handle = async (line: string): Promise<Reply> => {
		let id: unknown = null;
		try {
			const msg = JSON.parse(line) as {
				id?: unknown;
				cmd?: unknown;
				args?: unknown;
			};
			id = msg.id ?? null;
			const fn = typeof msg.cmd === "string" ? COMMANDS[msg.cmd] : undefined;
			if (!fn) return { id, ok: false, error: "unknown_command" };
			return { id, ok: true, result: await fn(agent, msg.args) };
		} catch (e) {
			const error =
				e instanceof SpecError
					? e.code
					: e instanceof SyntaxError
						? "bad_json"
						: "internal";
			if (error === "internal")
				log(`Fehler: ${e instanceof Error ? e.message : e}`);
			return { id, ok: false, error };
		}
	};
	server.on("connection", (sock: Socket) => {
		let buf = "";
		sock.setEncoding("utf8");
		sock.on("data", (chunk: string) => {
			buf += chunk;
			if (buf.length > MAX_LINE && !buf.includes("\n")) {
				sock.end(
					`${JSON.stringify({ id: null, ok: false, error: "too_long" })}\n`,
				);
				return;
			}
			let nl = buf.indexOf("\n");
			while (nl >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				if (line.length > MAX_LINE) {
					sock.write(
						`${JSON.stringify({ id: null, ok: false, error: "too_long" })}\n`,
					);
				} else if (line.trim()) {
					queue = queue.then(async () => {
						const reply = await handle(line);
						if (!sock.destroyed) sock.write(`${JSON.stringify(reply)}\n`);
					});
				}
				nl = buf.indexOf("\n");
			}
		});
		sock.on("error", () => sock.destroy());
	});
}
