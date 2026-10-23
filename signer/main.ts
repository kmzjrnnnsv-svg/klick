/**
 * Signier-Dienst (Plan Wallet, Phase 2). Läuft als eigener Prozess ohne Netz
 * (systemd: PrivateNetwork, IPAddressDeny=any, AF_UNIX), gebündelt zu einer
 * Datei (`pnpm build:signer` → dist/signer.mjs) und gestartet mit
 *   node --jitless --disallow-code-generation-from-strings --disable-proto=delete
 * Zustand in $STATE_DIRECTORY (journal.log, seeds.json), KEK als
 * systemd-Credential `signer_kek` (LoadCredentialEncrypted).
 *
 * Entwicklung: `pnpm signer:dev` (Dev-Bundle, Zustand und Sockets in
 * QA_DIR/signer, Wartezeiten 0, ein Schlüssel genügt).
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { readKek } from "./keys";
import { startSignerServer, systemdSockets } from "./server";
import { Signer } from "./service";

declare const __DEV__: boolean | undefined;
// nur das Dev-Bundle setzt __DEV__ = true (esbuild define); aus dem Quelltext
// gestartet gilt immer der Betrieb
const DEV = typeof __DEV__ === "boolean" ? __DEV__ : false;

const fail = (msg: string): never => {
	process.stderr.write(`klick-signer: ${msg}\n`);
	process.exit(1);
};

// Code nur aus einer root-eigenen, nicht beschreibbaren Datei
function checkOwnFile(path: string) {
	for (const p of [path, dirname(path)]) {
		const st = statSync(p);
		if (st.uid !== 0) fail(`${p} gehört nicht root`);
		if (st.mode & 0o022) fail(`${p} ist für andere beschreibbar`);
	}
}

async function main() {
	const self = process.argv[1] ?? "";
	if (!DEV) checkOwnFile(self);
	const bundleHash = self.endsWith(".mjs")
		? createHash("sha256").update(readFileSync(self)).digest("hex")
		: null;
	const env = process.env;
	const dir =
		env.STATE_DIRECTORY ?? env.SIGNER_DIR ?? fail("STATE_DIRECTORY fehlt");
	const creds = env.CREDENTIALS_DIRECTORY;
	const kekPath = creds
		? join(creds, "signer_kek")
		: (env.SIGNER_KEK_FILE ?? "");
	if (!kekPath) fail("KEK fehlt (signer_kek)");
	const signer = Signer.open({
		dir,
		kek: readKek(kekPath),
		dev: DEV,
		bundleHash,
		kekNextPath: creds
			? join(creds, "signer_kek_next")
			: (env.SIGNER_KEK_NEXT_FILE ?? null),
	});
	const sockets =
		systemdSockets(env, process.pid) ??
		(DEV
			? {
					app: {
						path: env.SIGNER_APP_SOCKET ?? join(dir, "app.sock"),
						mode: 0o660,
					},
					admin: {
						path: env.SIGNER_ADMIN_SOCKET ?? join(dir, "admin.sock"),
						mode: 0o600,
					},
				}
			: fail("keine Sockets von systemd (LISTEN_FDNAMES=app:admin)"));
	const server = await startSignerServer(signer, { ...sockets });
	const h = signer.hello();
	process.stderr.write(
		`klick-signer bereit: ${h.initialized ? `Org ${h.orgId}` : "nicht eingerichtet"}, Journal ${h.seq}/${h.head.slice(0, 12)}${DEV ? " (Entwicklung)" : ""}\n`,
	);
	const stop = () => {
		server.close().then(() => {
			signer.close();
			process.exit(0);
		});
	};
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
