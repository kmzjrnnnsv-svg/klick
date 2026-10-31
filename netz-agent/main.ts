import { chmodSync, existsSync, lstatSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { checkPeerIp } from "@/lib/site-tunnels/rules";
import { NetzAgent } from "./agent";
import { serve } from "./protocol";
import { dryRunner, execRunner } from "./runner";

// Einstieg des Netz-Agenten (ADR-033). Im Betrieb von systemd gestartet
// (klick-netz.socket übergibt den Socket, LISTEN_FDS), gebündelt als
// /usr/local/lib/klick-netz/netz-agent.mjs (pnpm build:netz-agent im
// root-eigenen Checkout, Rollout-Phase `standorte`). Für Entwicklung:
//   KLICK_NETZ_SOCKET=… KLICK_NETZ_DIR=… SITE_PUBLIC_IP=… node … --trocken

const env = process.env;
const log = (m: string) => process.stderr.write(`klick-netz: ${m}\n`);

async function main() {
	const dry = process.argv.includes("--trocken");
	const peer = checkPeerIp(env.SITE_PUBLIC_IP ?? "");
	if (!peer.ok) {
		log("SITE_PUBLIC_IP fehlt oder ist keine öffentliche IPv4");
		process.exit(2);
	}
	const agent = new NetzAgent({
		dir: env.KLICK_NETZ_DIR ?? "/etc/klick-netz",
		swanctlDir: env.KLICK_NETZ_SWANCTL_DIR ?? "/etc/swanctl/conf.d",
		serverIp: peer.ip,
		run: dry ? dryRunner() : execRunner,
		log,
	});
	await agent.start();
	const server = createServer();
	serve(server, agent, log);
	if (Number(env.LISTEN_PID) === process.pid && Number(env.LISTEN_FDS) >= 1) {
		server.listen({ fd: 3 });
	} else {
		const p = env.KLICK_NETZ_SOCKET;
		if (!p) {
			log("kein Socket (systemd) und kein KLICK_NETZ_SOCKET");
			process.exit(2);
		}
		if (existsSync(p)) {
			if (!lstatSync(p).isSocket()) throw new Error(`kein Socket: ${p}`);
			unlinkSync(p);
		}
		server.listen(p, () => chmodSync(p, 0o660));
	}
	log(dry ? "bereit (Trockenlauf)" : "bereit");
	const stop = () => server.close(() => process.exit(0));
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
}

main().catch((e) => {
	log(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
