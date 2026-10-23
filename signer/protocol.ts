import type { Server, Socket } from "node:net";
import type { Signer } from "./service";
import { SignerError } from "./validate";

// Protokoll des Signers: je Zeile ein JSON-Objekt {id, cmd, args} →
// {id, ok, result | error, seq, head}. Höchstens 1 MiB je Zeile, Befehle
// strikt nacheinander (alle Methoden sind synchron). Zwei Sockets mit
// getrennten Befehlen: app.sock (Gruppe klick) kann nur bremsen und Freigaben
// weiterreichen, admin.sock (root) richtet ein und lockert.

export const MAX_LINE = 1024 * 1024;

type Handler = (s: Signer, args: unknown) => unknown;

export const APP_COMMANDS: Record<string, Handler> = {
	hello: (s) => s.hello(),
	status: (s) => s.status(),
	"journal.head": (s) => s.head,
	"account.create": (s, a) => s.accountCreate(a),
	"intent.create": (s, a) => s.intentCreate(a),
	"intent.get": (s, a) => s.intentGet(a),
	approve: (s, a) => s.approve(a),
	"enrol.info": (s, a) => s.enrolInfo(a),
	"enrol.finish": (s, a) => s.enrolFinish(a),
	sign: (s, a) => s.sign(a),
	"intent.cancel": (s, a) => s.intentCancel(a, "app"),
	"whitelist.veto": (s, a) => s.whitelistVeto(a),
	freeze: (s, a) => s.freeze(a, "app"),
	"policy.tighten": (s, a) => s.policyTighten(a),
};

export const ADMIN_COMMANDS: Record<string, Handler> = {
	hello: (s) => s.hello(),
	status: (s) => s.status(),
	"journal.head": (s) => s.head,
	"journal.verify": (s) => s.journalVerify(),
	"seed.prepare": (s, a) => s.seedPrepare(a),
	"init.commit": (s, a) => s.initCommit(a),
	"network.commit": (s, a) => s.networkCommit(a),
	"enrol.start": (s, a) => s.enrolStart(a),
	"enrol.info": (s, a) => s.enrolInfo(a),
	"key.revoke": (s, a) => s.keyRevoke(a),
	"policy.set": (s, a) => s.policySet(a),
	freeze: (s, a) => s.freeze(a, "admin"),
	unfreeze: (s) => s.unfreeze(),
	"intent.cancel": (s, a) => s.intentCancel(a, "admin"),
	"export-xpubs": (s) => s.exportXpubs(),
	rekey: (s) => s.rekey(),
};

export type Response =
	| { id: unknown; ok: true; result: unknown; seq: number; head: string }
	| {
			id: unknown;
			ok: false;
			error: { code: string; detail?: string };
			seq: number;
			head: string;
	  };

export function handleLine(
	signer: Signer,
	commands: Record<string, Handler>,
	line: string,
	log: (msg: string) => void = () => {},
): Response {
	let id: unknown = null;
	try {
		const req = JSON.parse(line) as {
			id?: unknown;
			cmd?: unknown;
			args?: unknown;
		};
		if (!req || typeof req !== "object" || Array.isArray(req))
			throw new SignerError("bad_request", "line");
		id =
			typeof req.id === "string" || typeof req.id === "number" ? req.id : null;
		const handler =
			typeof req.cmd === "string" && Object.hasOwn(commands, req.cmd)
				? commands[req.cmd]
				: undefined;
		if (!handler) throw new SignerError("unknown_command");
		const result = handler(signer, req.args ?? {});
		return { id, ok: true, result, ...signer.head };
	} catch (e) {
		if (e instanceof SyntaxError)
			return {
				id,
				ok: false,
				error: { code: "bad_request", detail: "json" },
				...signer.head,
			};
		if (e instanceof SignerError)
			return {
				id,
				ok: false,
				error: { code: e.code, ...(e.detail ? { detail: e.detail } : {}) },
				...signer.head,
			};
		// unerwartet: nur der Typ ins Log, nie Inhalte
		log(`signer internal error: ${e instanceof Error ? e.name : typeof e}`);
		return { id, ok: false, error: { code: "internal" }, ...signer.head };
	}
}

export function serve(
	server: Server,
	signer: Signer,
	commands: Record<string, Handler>,
	log: (msg: string) => void,
) {
	server.on("connection", (sock: Socket) => {
		let buf = "";
		sock.setEncoding("utf8");
		sock.on("data", (chunk: string) => {
			buf += chunk;
			let nl = buf.indexOf("\n");
			while (nl !== -1) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				if (line.length > MAX_LINE) {
					sock.destroy();
					return;
				}
				if (line.trim() !== "")
					sock.write(
						`${JSON.stringify(handleLine(signer, commands, line, log))}\n`,
					);
				nl = buf.indexOf("\n");
			}
			if (buf.length > MAX_LINE) {
				sock.end(
					`${JSON.stringify({ id: null, ok: false, error: { code: "line_too_long" }, ...signer.head })}\n`,
				);
				sock.destroy();
			}
		});
		sock.on("error", () => sock.destroy());
	});
}
