import { connect } from "node:net";
import { env } from "@/lib/env";
import { checkPeerIp } from "./rules";

// Verbindung zum Netz-Agenten klick-netz (ADR-033) über den Unix-Socket
// /run/klick-netz/app.sock (Gruppe klick). Je Aufruf eine Verbindung, eine
// Zeile hin, eine zurück; Fehler des Agenten als `agent_<code>`.

export type AgentTunnel = {
	id: string;
	tech: "ipsec" | "wireguard";
	up: boolean;
	lastHandshakeAt: string | null;
	error: string | null;
};
export type AgentStatus = {
	wgPublicKey: string | null;
	baseError: string | null;
	tunnels: AgentTunnel[];
};

export class AgentError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

const TIMEOUT_MS = 30_000;

export type SiteConfig = {
	enabled: boolean;
	socket: string | null;
	publicIp: string | null;
	wgPublicKey: string | null;
	/** Name von Klick, z. B. raza.work */
	host: string;
};

/** Ist der Standort-Tunnel auf diesem Server eingerichtet? */
export function siteConfig(): SiteConfig {
	const e = env();
	const ip = e.SITE_PUBLIC_IP ? checkPeerIp(e.SITE_PUBLIC_IP) : null;
	const publicIp = ip?.ok ? ip.ip : null;
	const socket = e.SITE_AGENT_SOCKET || null;
	let host = "localhost";
	try {
		host = new URL(e.BETTER_AUTH_URL).hostname;
	} catch {}
	return {
		enabled: Boolean(socket && publicIp),
		socket,
		publicIp,
		wgPublicKey: e.SITE_WG_PUBLIC_KEY || null,
		host,
	};
}

export function agentCall<T>(
	socket: string,
	cmd: "hello" | "status" | "apply" | "remove",
	args?: unknown,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const id = crypto.randomUUID();
		const c = connect(socket);
		let buf = "";
		const timer = setTimeout(() => {
			c.destroy();
			reject(new AgentError("timeout"));
		}, TIMEOUT_MS);
		c.setEncoding("utf8");
		c.on("connect", () => c.write(`${JSON.stringify({ id, cmd, args })}\n`));
		c.on("data", (d: string) => {
			buf += d;
			const nl = buf.indexOf("\n");
			if (nl < 0) return;
			clearTimeout(timer);
			c.end();
			try {
				const reply = JSON.parse(buf.slice(0, nl)) as
					| { id: string; ok: true; result: T }
					| { id: string; ok: false; error: string };
				if (reply.id !== id) return reject(new AgentError("mismatch"));
				if (reply.ok) resolve(reply.result);
				else reject(new AgentError(reply.error));
			} catch {
				reject(new AgentError("bad_reply"));
			}
		});
		c.on("error", () => {
			clearTimeout(timer);
			reject(new AgentError("unreachable"));
		});
	});
}
