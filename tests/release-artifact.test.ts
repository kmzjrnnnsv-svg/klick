import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateRawSync, gunzipSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	extract,
	fetchArtifact,
	linkAllowed,
	packRelease,
	packTar,
	pathAllowed,
	pickArtifact,
	pickRun,
	ReleaseError,
	readTar,
	readToken,
	unzipSingle,
	verifyRelease,
} from "@/deploy/rollout/artefakt.mjs";

// Release-Artefakt (ADR-034): CI packt das fertige .next, der Server holt es
// über die GitHub-API, prüft es und packt es aus, statt selbst zu bauen.
// Hier: eigenes tar, Pfad- und Verweisregeln, Manifest, Auswahl von Lauf und
// Artefakt, Download gegen einen nachgebauten GitHub-Dienst.

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "deploy/rollout/artefakt.mjs");
const tmp = mkdtempSync(join(tmpdir(), "artefakt-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const sha = (b: Buffer | string) =>
	createHash("sha256").update(b).digest("hex");
const COMMIT = "a".repeat(40);
const REPO = "kmzjrnnnsv-svg/klick";
const TOKEN = "github_pat_TESTTOKEN0123456789abcdefABCDEF";

// Kleiner Klick-Checkout mit Build
function fixture(name: string) {
	const root = join(tmp, name);
	const w = (p: string, c: string) => {
		mkdirSync(join(root, p, ".."), { recursive: true });
		writeFileSync(join(root, p), c);
	};
	w("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
	w(".next/BUILD_ID", "build-1");
	w(".next/server/app/page.js", "export default 1;\n");
	w(`.next/server/${"tief/".repeat(30)}datei.js`, "lang\n");
	w(".next/static/chunks/a.js", "console.log(1)\n");
	w(".next/cache/turbopack/riesig", "x".repeat(1000));
	w(".next/dev/log", "dev");
	w(".next/trace", "trace");
	w("dist/parse-worker.mjs", "// parser\n");
	mkdirSync(join(root, ".next/node_modules"), { recursive: true });
	symlinkSync(
		"../../node_modules/.pnpm/pino@10.3.1/node_modules/pino",
		join(root, ".next/node_modules/pino-2e79642258e38174"),
	);
	return root;
}

const lock = (root: string) => sha(readFileSync(join(root, "pnpm-lock.yaml")));
const expectFor = (root: string) => ({
	app: "klick",
	commit: COMMIT,
	lockfileSha256: lock(root),
	origin: "https://raza.work",
});

function pack(root: string) {
	return packRelease({
		app: "klick",
		root,
		commit: COMMIT,
		origin: "https://raza.work",
		builtAt: "2026-11-01T12:00:00.000Z",
	});
}

// Paket mit verändertem Inhalt neu bauen (Manifest bleibt, wenn nicht ersetzt)
function repack(
	gz: Buffer,
	change: (entries: ReturnType<typeof readTar>) => ReturnType<typeof readTar>,
) {
	return gzipSync(packTar(change(readTar(gunzipSync(gz)))));
}

describe("tar", () => {
	it("Rundreise mit langen Namen, Umlauten, Ordnern und Verweisen", () => {
		const long = `${"x".repeat(120)}/datei-äöü.js`;
		const link = `../../${"n".repeat(110)}/ziel`;
		const entries = [
			{ path: "a", type: "dir" as const },
			{ path: "a/b.txt", type: "file" as const, data: Buffer.from("hallo") },
			{ path: long, type: "file" as const, data: Buffer.alloc(1025, 7) },
			{ path: "a/l", type: "symlink" as const, link },
			{ path: "leer", type: "file" as const, data: Buffer.alloc(0) },
		];
		const back = readTar(packTar(entries));
		expect(back.map((e) => [e.path, e.type])).toEqual(
			entries.map((e) => [e.path, e.type]),
		);
		expect(back[2]?.data?.length).toBe(1025);
		expect(back[3]?.link).toBe(link);
		expect(back[1]?.data?.toString()).toBe("hallo");
	});

	it("lehnt kaputte Köpfe und andere Eintragsarten ab", () => {
		const t = packTar([
			{ path: "a.txt", type: "file", data: Buffer.from("x") },
		]);
		const bad = Buffer.from(t);
		bad[0] = 0x41; // Name geändert, Prüfsumme passt nicht mehr
		expect(() => readTar(bad)).toThrow(/Prüfsumme/);
		const hard = Buffer.from(t);
		hard[156] = 0x31; // Typ 1 = harter Link
		let sum = 0;
		for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : hard[i];
		hard.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
		expect(() => readTar(hard)).toThrow(/nicht erlaubt/);
		expect(() => readTar(t.subarray(0, 600))).toThrow(/abgeschnitten/);
	});
});

describe("Pfade und Verweise", () => {
	it("nur .next und die Bündel der App, nie .. oder absolut", () => {
		expect(pathAllowed("klick", ".next/server/app/page.js")).toBe(true);
		expect(pathAllowed("klick", "dist/parse-worker.mjs")).toBe(true);
		expect(pathAllowed("klick", "dist")).toBe(true);
		expect(pathAllowed("klick", "release.json")).toBe(true);
		for (const p of [
			"dist/anderes.mjs",
			"package.json",
			".next/../etc/passwd",
			"/etc/passwd",
			".next//x",
			".next/./x",
			".next\\x",
			"apps/wallet/.next/BUILD_ID",
			"",
		])
			expect(pathAllowed("klick", p), p).toBe(false);
		expect(pathAllowed("both", "apps/wallet/.next/BUILD_ID")).toBe(true);
		expect(pathAllowed("both", ".next/BUILD_ID")).toBe(false);
		expect(pathAllowed("andere", ".next/BUILD_ID")).toBe(false);
	});

	it("Verweise nur aus .next/node_modules nach node_modules/.pnpm", () => {
		const p = ".next/node_modules/pino-1";
		expect(
			linkAllowed(
				"klick",
				p,
				"../../node_modules/.pnpm/pino@1/node_modules/pino",
			),
		).toBe(true);
		expect(
			linkAllowed(
				"both",
				"apps/wallet/.next/node_modules/pino-1",
				"../../../../node_modules/.pnpm/pino@1/node_modules/pino",
			),
		).toBe(true);
		for (const t of [
			"/etc/passwd",
			"../../../etc",
			"../../node_modules/pino",
			"../../node_modules/.pnpm/../../etc",
			"",
		])
			expect(linkAllowed("klick", p, t), t).toBe(false);
		expect(
			linkAllowed(
				"klick",
				".next/server/x",
				"../../node_modules/.pnpm/pino@1/node_modules/pino",
			),
		).toBe(false);
	});
});

describe("packen und prüfen", () => {
	let root = "";
	let gz = Buffer.alloc(0);
	beforeAll(() => {
		root = fixture("klick");
		gz = pack(root).data;
	});

	it("packt .next ohne Cache, Dev und Trace, dazu den Parser", () => {
		const r = pack(root);
		expect(r.name).toBe(`klick-${COMMIT}.tar.gz`);
		expect(r.sha256).toBe(sha(r.data));
		const paths = r.manifest.entries.map((e: { path: string }) => e.path);
		expect(paths).toContain(".next/BUILD_ID");
		expect(paths).toContain("dist/parse-worker.mjs");
		expect(paths).toContain(".next/node_modules/pino-2e79642258e38174");
		expect(paths.some((p: string) => /\.next\/(cache|dev|trace)/.test(p))).toBe(
			false,
		);
		expect(r.manifest).toMatchObject({
			format: "klick-release/v1",
			app: "klick",
			commit: COMMIT,
			origin: "https://raza.work",
			lockfileSha256: lock(root),
		});
	});

	it("ohne Build bricht das Packen ab", () => {
		const leer = join(tmp, "leer");
		mkdirSync(leer, { recursive: true });
		writeFileSync(join(leer, "pnpm-lock.yaml"), "x");
		expect(() =>
			packRelease({
				app: "klick",
				root: leer,
				commit: COMMIT,
				origin: "https://raza.work",
			}),
		).toThrow(/BUILD_ID/);
	});

	it("Verweis aus dem Projekt heraus wird nicht gepackt", () => {
		const r2 = fixture("boese-link");
		symlinkSync("/etc", join(r2, ".next/node_modules/etc"));
		expect(() => pack(r2)).toThrow(/Verweis nicht erlaubt/);
	});

	it("passt und packt in einen leeren Ordner aus", () => {
		const { entries, manifest } = verifyRelease(gz, expectFor(root));
		expect(manifest.commit).toBe(COMMIT);
		const dest = join(tmp, "aus");
		extract(entries, dest);
		expect(readFileSync(join(dest, ".next/BUILD_ID"), "utf8")).toBe("build-1");
		expect(readFileSync(join(dest, "dist/parse-worker.mjs"), "utf8")).toBe(
			"// parser\n",
		);
		expect(
			readlinkSync(join(dest, ".next/node_modules/pino-2e79642258e38174")),
		).toBe("../../node_modules/.pnpm/pino@10.3.1/node_modules/pino");
		expect(readdirSync(join(dest, ".next")).sort()).toEqual([
			"BUILD_ID",
			"node_modules",
			"server",
			"static",
		]);
		expect(() => extract(entries, dest)).toThrow(/nicht leer/);
	});

	it("lehnt anderen Commit, anderes Lockfile, andere Node-Version, andere Adresse ab", () => {
		const e = expectFor(root);
		expect(() => verifyRelease(gz, { ...e, commit: "b".repeat(40) })).toThrow(
			/Checkout steht auf/,
		);
		expect(() => verifyRelease(gz, { ...e, lockfileSha256: sha("x") })).toThrow(
			/pnpm-lock/,
		);
		expect(() => verifyRelease(gz, { ...e, node: "24.1.0" })).toThrow(/Node/);
		expect(() =>
			verifyRelease(gz, { ...e, origin: "https://andere.example" }),
		).toThrow(/gebaut für https:\/\/raza\.work/);
		expect(() => verifyRelease(gz, { ...e, app: "both" })).toThrow(/App klick/);
		expect(() => verifyRelease(Buffer.from("kein gzip"), e)).toThrow(/gzip/);
	});

	it("lehnt veränderte, zusätzliche und gefährliche Einträge ab", () => {
		const e = expectFor(root);
		const changed = repack(gz, (es) =>
			es.map((x) =>
				x.path === ".next/static/chunks/a.js"
					? { ...x, data: Buffer.from("boese()") }
					: x,
			),
		);
		expect(() => verifyRelease(changed, e)).toThrow(/Prüfsumme falsch/);
		const extra = repack(gz, (es) => [
			...es,
			{ path: ".next/zusatz.js", type: "file", data: Buffer.from("x") },
		]);
		expect(() => verifyRelease(extra, e)).toThrow(/Manifest/);
		// Manifest passend gefälscht: Verweis nach außen, Pfad mit ..
		const forge = (entry: {
			path: string;
			type: "file" | "symlink";
			data?: Buffer;
			link?: string;
		}) =>
			repack(gz, (es) => {
				const [m, ...rest] = es;
				const json = JSON.parse(m?.data?.toString() ?? "{}");
				json.entries.push(
					entry.type === "file"
						? {
								path: entry.path,
								type: "file",
								size: entry.data?.length,
								sha256: sha(entry.data ?? ""),
							}
						: { path: entry.path, type: "symlink", link: entry.link },
				);
				return [
					{
						path: "release.json",
						type: "file",
						data: Buffer.from(JSON.stringify(json)),
					},
					...rest,
					entry,
				];
			});
		expect(() =>
			verifyRelease(
				forge({ path: ".next/node_modules/x", type: "symlink", link: "/etc" }),
				e,
			),
		).toThrow(/Verweis nicht erlaubt/);
		expect(() =>
			verifyRelease(
				forge({
					path: ".next/../../etc/cron.d/x",
					type: "file",
					data: Buffer.from("x"),
				}),
				e,
			),
		).toThrow(/Pfad nicht erlaubt/);
		expect(() =>
			verifyRelease(
				forge({
					path: ".next/node_modules/pino-2e79642258e38174/index.js",
					type: "file",
					data: Buffer.from("x"),
				}),
				e,
			),
		).toThrow(/hinter einem Verweis/);
	});

	it("both.money prüft die Adresse nicht (keine fest gerenderte Seite)", () => {
		const r = join(tmp, "both");
		mkdirSync(join(r, "apps/wallet/.next/server"), { recursive: true });
		writeFileSync(join(r, "pnpm-lock.yaml"), "x");
		writeFileSync(join(r, "apps/wallet/.next/BUILD_ID"), "w");
		const p = packRelease({
			app: "both",
			root: r,
			commit: COMMIT,
			origin: "https://both.money",
		});
		const { entries } = verifyRelease(p.data, {
			app: "both",
			commit: COMMIT,
			lockfileSha256: sha("x"),
			origin: "https://anders.example",
		});
		expect(entries.map((x) => x.path)).toContain("apps/wallet/.next/BUILD_ID");
	});
});

describe("Lauf und Artefakt wählen", () => {
	const run = (o: Record<string, unknown> = {}) => ({
		id: 10,
		head_sha: COMMIT,
		path: ".github/workflows/ci.yml",
		event: "push",
		status: "completed",
		conclusion: "success",
		repository: { full_name: REPO },
		head_repository: { full_name: REPO },
		...o,
	});
	const want = { repo: REPO, commit: COMMIT };

	it("nur grüne Push-Läufe von ci.yml aus diesem Repo", () => {
		expect(pickRun([run()], want).state).toBe("ok");
		expect(
			pickRun([run({ path: ".github/workflows/ci.yml@refs/heads/main" })], want)
				.state,
		).toBe("ok");
		for (const o of [
			{ event: "pull_request" },
			{ head_repository: { full_name: "fork/klick" } },
			{ path: ".github/workflows/zap.yml" },
			{ head_sha: "b".repeat(40) },
		])
			expect(pickRun([run(o)], want).state, JSON.stringify(o)).toBe("none");
		expect(
			pickRun([run({ status: "in_progress", conclusion: null })], want).state,
		).toBe("running");
		expect(pickRun([run({ conclusion: "failure" })], want)).toEqual({
			state: "failed",
			conclusion: "failure",
		});
		expect(pickRun([run({ conclusion: "cancelled" })], want).state).toBe(
			"none",
		);
		// erneuter Versuch grün: der zählt
		const r = pickRun(
			[
				run({ id: 11, conclusion: "failure", run_attempt: 1 }),
				run({ id: 11, run_attempt: 2 }),
			],
			want,
		);
		expect(r.state).toBe("ok");
	});

	it("Artefakt mit Namen der Datei, nicht abgelaufen, nicht zu groß", () => {
		const a = (o: Record<string, unknown> = {}) => ({
			id: 1,
			name: `klick-${COMMIT}.tar.gz`,
			expired: false,
			size_in_bytes: 1000,
			...o,
		});
		const w = { app: "klick", commit: COMMIT };
		expect(pickArtifact([a()], w)?.id).toBe(1);
		expect(pickArtifact([a({ expired: true })], w)).toBeNull();
		expect(pickArtifact([a({ name: `both-${COMMIT}.tar.gz` })], w)).toBeNull();
		expect(
			pickArtifact([a({ size_in_bytes: 500 * 1024 * 1024 })], w),
		).toBeNull();
	});
});

describe("Download gegen nachgebauten GitHub-Dienst", () => {
	let server: Server;
	let base = "";
	let root = "";
	let gz = Buffer.alloc(0);
	let mode: Record<string, string> = {};
	const seen: { path: string; auth?: string }[] = [];

	function zipOf(name: string, data: Buffer) {
		const comp = deflateRawSync(data);
		const n = Buffer.from(name);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(8, 8);
		local.writeUInt32LE(comp.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(n.length, 26);
		const cd = Buffer.alloc(46);
		cd.writeUInt32LE(0x02014b50, 0);
		cd.writeUInt16LE(8, 10);
		cd.writeUInt32LE(comp.length, 20);
		cd.writeUInt32LE(data.length, 24);
		cd.writeUInt16LE(n.length, 28);
		cd.writeUInt32LE(0, 42);
		const cdOff = local.length + n.length + comp.length;
		const end = Buffer.alloc(22);
		end.writeUInt32LE(0x06054b50, 0);
		end.writeUInt16LE(1, 8);
		end.writeUInt16LE(1, 10);
		end.writeUInt32LE(cd.length + n.length, 12);
		end.writeUInt32LE(cdOff, 16);
		return Buffer.concat([local, n, comp, cd, n, end]);
	}

	beforeAll(async () => {
		root = fixture("dl");
		gz = pack(root).data;
		server = createServer((req: IncomingMessage, res) => {
			const url = new URL(req.url ?? "/", "http://x");
			seen.push({ path: url.pathname, auth: req.headers.authorization });
			const send = (status: number, body: unknown) => {
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify(body));
			};
			if (url.pathname.endsWith("/actions/runs")) {
				if (mode.runs === "401")
					return send(401, { message: "Bad credentials" });
				return send(200, {
					workflow_runs: [
						{
							id: 77,
							head_sha: url.searchParams.get("head_sha"),
							path: ".github/workflows/ci.yml",
							event: "push",
							status: mode.runs === "running" ? "in_progress" : "completed",
							conclusion:
								mode.runs === "red"
									? "failure"
									: mode.runs === "running"
										? null
										: "success",
							repository: { full_name: REPO },
							head_repository: { full_name: REPO },
						},
					],
				});
			}
			if (url.pathname.endsWith("/runs/77/artifacts")) {
				const data = mode.zip ? zipOf(`klick-${COMMIT}.tar.gz`, gz) : gz;
				return send(200, {
					artifacts:
						mode.artifact === "none"
							? []
							: [
									{
										id: 5,
										name: `klick-${COMMIT}.tar.gz`,
										expired: false,
										size_in_bytes: data.length,
										digest: `sha256:${mode.digest === "bad" ? sha("x") : sha(data)}`,
									},
								],
				});
			}
			if (url.pathname.endsWith("/artifacts/5/zip")) {
				res.writeHead(302, {
					location:
						mode.redirect === "extern"
							? "http://evil.example/blob"
							: `${base}/blob`,
				});
				return res.end();
			}
			if (url.pathname === "/blob") {
				res.writeHead(200);
				return res.end(mode.zip ? zipOf(`klick-${COMMIT}.tar.gz`, gz) : gz);
			}
			send(404, {});
		});
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(() => new Promise<void>((r) => server.close(() => r())));

	const get = () =>
		fetchArtifact({
			api: base,
			repo: REPO,
			app: "klick",
			commit: COMMIT,
			token: TOKEN,
		});

	it("holt das Paket; der Token geht nur an die API, nie an den Speicher", async () => {
		mode = {};
		seen.length = 0;
		const r = await get();
		expect(r.gz.equals(gz)).toBe(true);
		expect(seen.find((s) => s.path.endsWith("/actions/runs"))?.auth).toBe(
			`Bearer ${TOKEN}`,
		);
		expect(seen.find((s) => s.path === "/blob")?.auth).toBeUndefined();
		expect(verifyRelease(r.gz, expectFor(root)).entries.length).toBeGreaterThan(
			5,
		);
	});

	it("auch als ZIP mit einem Eintrag", async () => {
		mode = { zip: "1" };
		expect((await get()).gz.equals(gz)).toBe(true);
	});

	it("Codes für rot, läuft noch, kein Artefakt; Fehler ohne Token", async () => {
		const code = async () => {
			try {
				await get();
				return 0;
			} catch (e) {
				expect(String((e as Error).message)).not.toContain(TOKEN);
				return (e as ReleaseError).code;
			}
		};
		mode = { runs: "red" };
		expect(await code()).toBe(4);
		mode = { runs: "running" };
		expect(await code()).toBe(5);
		mode = { artifact: "none" };
		expect(await code()).toBe(3);
		mode = { runs: "401" };
		expect(await code()).toBe(1);
		mode = { digest: "bad" };
		await expect(get()).rejects.toThrow(/Digest/);
		mode = { redirect: "extern" };
		await expect(get()).rejects.toThrow(/https/);
	});

	// Skript als eigener Prozess; asynchron, damit der Nachbau hier antworten kann
	const run = (args: string[]) =>
		new Promise<{ status: number | null; stdout: string; stderr: string }>(
			(done) => {
				const p = spawn(process.execPath, [SCRIPT, ...args]);
				let stdout = "";
				let stderr = "";
				p.stdout.on("data", (c) => {
					stdout += c;
				});
				p.stderr.on("data", (c) => {
					stderr += c;
				});
				p.on("close", (status) => done({ status, stdout, stderr }));
			},
		);

	it("Aufruf als Skript: holen packt aus, Token nur aus einer Datei mit 0600", async () => {
		mode = {};
		const tokenFile = join(tmp, "token");
		writeFileSync(tokenFile, `${TOKEN}\n`);
		chmodSync(tokenFile, 0o644);
		const holen = (ziel: string, extra: string[] = []) =>
			run([
				"holen",
				"--app",
				"klick",
				"--commit",
				COMMIT,
				"--repo",
				REPO,
				"--api",
				base,
				"--token-datei",
				tokenFile,
				"--lockfile",
				join(root, "pnpm-lock.yaml"),
				"--ziel",
				ziel,
				...extra,
			]);
		const offen = await holen(join(tmp, "cli-a"));
		expect(offen.status).toBe(2);
		expect(offen.stderr).toMatch(/für andere lesbar/);
		chmodSync(tokenFile, 0o600);
		const ziel = join(tmp, "cli-aus");
		const ok = await holen(ziel, ["--origin", "https://raza.work"]);
		expect(ok.stderr).toBe("");
		expect(ok.status).toBe(0);
		expect(ok.stdout).toMatch(/geprüft/);
		expect(readFileSync(join(ziel, ".next/BUILD_ID"), "utf8")).toBe("build-1");
		mode = { runs: "401" };
		const abgelehnt = await holen(join(tmp, "cli-b"));
		expect(abgelehnt.status).toBe(1);
		expect(abgelehnt.stderr).toMatch(/lehnt den Token ab/);
		expect(abgelehnt.stderr + abgelehnt.stdout).not.toContain(TOKEN);
		mode = { runs: "red" };
		expect((await holen(join(tmp, "cli-c"))).status).toBe(4);
		expect((await run(["holen"])).status).toBe(2);
	});

	it("readToken lehnt Unsinn ab", () => {
		const f = join(tmp, "kein-token");
		writeFileSync(f, "hallo welt");
		chmodSync(f, 0o600);
		expect(() => readToken(f)).toThrow(/keinen GitHub-Token/);
		expect(() => readToken(join(tmp, "fehlt"))).toThrow(/fehlt/);
		// Verweis auf eine Token-Datei: nicht folgen
		const echt = join(tmp, "echt-token");
		writeFileSync(echt, `${TOKEN}\n`);
		chmodSync(echt, 0o600);
		expect(readToken(echt)).toBe(TOKEN);
		const verweis = join(tmp, "token-verweis");
		symlinkSync(echt, verweis);
		expect(() => readToken(verweis)).toThrow(/keine reguläre Datei/);
	});
});

describe("Aufruf packen", () => {
	it("schreibt das Paket mit Prüfsumme", () => {
		const root = fixture("cli-pack");
		const out = join(tmp, "cli-out");
		const r = execFileSync(
			process.execPath,
			[
				SCRIPT,
				"packen",
				"--app",
				"klick",
				"--root",
				root,
				"--commit",
				COMMIT,
				"--origin",
				"https://raza.work",
				"--out",
				out,
			],
			{ encoding: "utf8" },
		);
		const file = join(out, `klick-${COMMIT}.tar.gz`);
		expect(r).toContain(sha(readFileSync(file)));
		expect(() =>
			unzipSingle(Buffer.from("PK\u0005\u0006".padEnd(22, "\0"))),
		).toThrow(ReleaseError);
	});
});
