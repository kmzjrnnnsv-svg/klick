import { chmodSync, existsSync, lstatSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { ADMIN_COMMANDS, APP_COMMANDS, serve } from "./protocol";
import type { Signer } from "./service";

// Sockets des Signers: im Betrieb von systemd übergeben (Socket-Aktivierung,
// LISTEN_FDS/LISTEN_FDNAMES = app:admin), in Entwicklung und Tests als Pfad
// mit festen Rechten (app 0660, admin 0600).

export type Listen = { path: string; mode: number } | { fd: number };

const listen = (server: Server, target: Listen) =>
	new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		if ("fd" in target) server.listen({ fd: target.fd }, () => resolve());
		else {
			if (existsSync(target.path)) {
				if (!lstatSync(target.path).isSocket())
					return reject(new Error(`kein Socket: ${target.path}`));
				unlinkSync(target.path);
			}
			server.listen(target.path, () => {
				chmodSync(target.path, target.mode);
				resolve();
			});
		}
	});

export async function startSignerServer(
	signer: Signer,
	opts: { app: Listen; admin: Listen; log?: (msg: string) => void },
) {
	const log = opts.log ?? ((m: string) => process.stderr.write(`${m}\n`));
	const app = createServer();
	const admin = createServer();
	serve(app, signer, APP_COMMANDS, log);
	serve(admin, signer, ADMIN_COMMANDS, log);
	await listen(app, opts.app);
	await listen(admin, opts.admin);
	return {
		close: () =>
			Promise.all(
				[app, admin].map(
					(s) =>
						new Promise<void>((resolve) => {
							s.close(() => resolve());
						}),
				),
			).then(() => undefined),
	};
}

// systemd: Datei-Deskriptoren ab 3 mit Namen aus LISTEN_FDNAMES
export function systemdSockets(
	env: Record<string, string | undefined>,
	pid: number,
): { app: Listen; admin: Listen } | null {
	if (Number(env.LISTEN_PID) !== pid) return null;
	const count = Number(env.LISTEN_FDS ?? 0);
	const names = (env.LISTEN_FDNAMES ?? "").split(":");
	const fds = new Map<string, number>();
	for (let i = 0; i < count; i += 1) fds.set(names[i] ?? "", 3 + i);
	const app = fds.get("app");
	const admin = fds.get("admin");
	if (app === undefined || admin === undefined) return null;
	return { app: { fd: app }, admin: { fd: admin } };
}
