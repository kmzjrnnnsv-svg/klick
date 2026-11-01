#!/usr/bin/env node
// Release-Artefakt (ADR-034): CI baut Klick und both.money, der Server holt
// nur das fertige `.next` und baut nicht mehr selbst (Build-Spitze 1,5–3 GB
// RAM, Build-Cache 1,2 GB auf der Platte).
//
//   CI:     node deploy/rollout/artefakt.mjs packen --app klick --out out
//   Server: node deploy/rollout/artefakt.mjs holen --app klick --commit <sha>
//             --repo <owner/name> --token-datei /etc/klick-release/github-token
//             --lockfile <checkout>/pnpm-lock.yaml --origin <BETTER_AUTH_URL>
//             --ziel <leerer Ordner>
//
// Nur node:*-Module: der Server ruft das Skript als root aus dem root-eigenen
// Checkout ohne node_modules auf (deploy/rollout). Eigenes tar (ustar + PAX)
// wie der eigene ZIP-Writer (ADR-014): keine Abhängigkeit, Prüfung jedes
// Eintrags vor dem Schreiben. Der Token steht nie in argv, Umgebung,
// Ausgabe oder Fehlertext.
//
// Exit: 0 bereit · 1 Prüfung fehlgeschlagen · 2 Bedienfehler ·
//       3 kein Artefakt (lokal bauen möglich) · 4 CI für den Commit rot ·
//       5 CI läuft noch

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	closeSync,
	constants,
	existsSync,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync, inflateRawSync } from "node:zlib";

export const FORMAT = "klick-release/v1";
export const WORKFLOW = ".github/workflows/ci.yml";
/** Höchstens so groß darf das Paket sein (gepackt bzw. entpackt) */
export const MAX_ARCHIVE = 400 * 1024 * 1024;
export const MAX_UNPACKED = 1536 * 1024 * 1024;
export const MAX_ENTRIES = 50_000;

/** Was je App ins Paket gehört (Pfade ab Repo-Wurzel) */
export const APPS = {
	klick: { next: ".next", files: ["dist/parse-worker.mjs"], checkOrigin: true },
	both: { next: "apps/wallet/.next", files: [], checkOrigin: false },
};

// Teile von .next, die der Server nicht braucht oder selbst schreibt
export const NEXT_EXCLUDE = new Set([
	"cache",
	"dev",
	"trace",
	"trace-build",
	"diagnostics",
	"types",
]);

export class ReleaseError extends Error {
	/** @param {string} message @param {number} [code] */
	constructor(message, code = 1) {
		super(message);
		this.code = code;
	}
}

const sha256 = (/** @type {Buffer|string} */ b) =>
	createHash("sha256").update(b).digest("hex");

// ── Pfade ────────────────────────────────────────────────────────────────

/** Pfad im Paket: relativ, posix, ohne `.`/`..`/leere Teile, nur erlaubte Orte */
export function pathAllowed(app, p) {
	const cfg = APPS[app];
	if (!cfg || typeof p !== "string" || p.length === 0 || p.length > 1024)
		return false;
	if (p.includes("\\") || p.includes("\0") || p.startsWith("/")) return false;
	if (p.split("/").some((s) => s === "" || s === "." || s === ".."))
		return false;
	return (
		p === "release.json" ||
		p === cfg.next ||
		p.startsWith(`${cfg.next}/`) ||
		cfg.files.includes(p) ||
		cfg.files.some((f) => f.startsWith(`${p}/`))
	);
}

/**
 * Symlinks gibt es nur in `.next/node_modules` (Turbopack-Verweise auf
 * Pakete); sie müssen relativ bleiben und in `node_modules/.pnpm/` enden.
 */
export function linkAllowed(app, p, target) {
	const cfg = APPS[app];
	if (!cfg || !p.startsWith(`${cfg.next}/node_modules/`)) return false;
	if (typeof target !== "string" || target.startsWith("/") || target === "")
		return false;
	if (target.includes("\\") || target.includes("\0")) return false;
	const to = posix.normalize(posix.join(posix.dirname(p), target));
	return to.startsWith("node_modules/.pnpm/") && !to.split("/").includes("..");
}

// ── tar (ustar, lange Namen über PAX) ─────────────────────────────────────

const BLOCK = 512;

/** @typedef {{ path: string, type: "file"|"dir"|"symlink", data?: Buffer, link?: string }} TarEntry */

function octal(buf, off, len, n) {
	const s = n.toString(8).padStart(len - 1, "0");
	if (s.length > len - 1) throw new ReleaseError("tar: Zahl zu groß");
	buf.write(`${s}\0`, off, len, "ascii");
}

function header(name, type, size, link = "") {
	const h = Buffer.alloc(BLOCK);
	h.write(name, 0, 100, "utf8");
	octal(h, 100, 8, type === "5" ? 0o755 : 0o644);
	octal(h, 108, 8, 0);
	octal(h, 116, 8, 0);
	octal(h, 124, 12, size);
	octal(h, 136, 12, 0);
	h.fill(0x20, 148, 156);
	h.write(type, 156, 1, "ascii");
	h.write(link, 157, 100, "utf8");
	h.write("ustar\0", 257, 6, "ascii");
	h.write("00", 263, 2, "ascii");
	let sum = 0;
	for (const b of h) sum += b;
	h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
	return h;
}

const pad = (n) => Buffer.alloc((BLOCK - (n % BLOCK)) % BLOCK);

function paxRecord(key, value) {
	const body = ` ${key}=${value}\n`;
	let len = Buffer.byteLength(body) + 1;
	while (String(len).length + Buffer.byteLength(body) !== len)
		len = String(len).length + Buffer.byteLength(body);
	return `${len}${body}`;
}

const fits = (s) => Buffer.byteLength(s) <= 100 && /^[\x20-\x7e]*$/.test(s);

/**
 * @param {TarEntry[]} entries
 */
export function packTar(entries) {
	const out = [];
	for (const e of entries) {
		const type = e.type === "dir" ? "5" : e.type === "symlink" ? "2" : "0";
		const name = e.type === "dir" ? `${e.path}/` : e.path;
		const link = e.link ?? "";
		let pax = "";
		if (!fits(name)) pax += paxRecord("path", name);
		if (!fits(link)) pax += paxRecord("linkpath", link);
		if (pax) {
			const data = Buffer.from(pax, "utf8");
			out.push(header("PaxHeader", "x", data.length), data, pad(data.length));
		}
		const data = e.type === "file" ? (e.data ?? Buffer.alloc(0)) : null;
		out.push(
			header(
				fits(name) ? name : name.slice(0, 99).replace(/[^\x20-\x7e]/g, "_"),
				type,
				data ? data.length : 0,
				fits(link) ? link : "",
			),
		);
		if (data) out.push(data, pad(data.length));
	}
	out.push(Buffer.alloc(BLOCK * 2));
	return Buffer.concat(out);
}

const str = (b, off, len) => {
	const end = b.indexOf(0, off);
	return b.toString(
		"utf8",
		off,
		end === -1 || end > off + len ? off + len : end,
	);
};

function num(b, off, len) {
	const s = str(b, off, len).trim();
	if (!/^[0-7]*$/.test(s)) throw new ReleaseError("tar: ungültige Zahl");
	return s ? Number.parseInt(s, 8) : 0;
}

function parsePax(data) {
	// Längen in PAX zählen Bytes, nicht Zeichen
	const out = {};
	let i = 0;
	while (i < data.length) {
		const sp = data.indexOf(0x20, i);
		const len = Number.parseInt(data.toString("ascii", i, sp), 10);
		if (sp < 0 || !(len > 0) || i + len > data.length)
			throw new ReleaseError("tar: PAX kaputt");
		const rec = data.toString("utf8", sp + 1, i + len - 1);
		const eq = rec.indexOf("=");
		if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
		i += len;
	}
	return out;
}

/**
 * Liest nur Dateien, Ordner, Symlinks und PAX-Kopfdaten; alles andere bricht ab.
 * @param {Buffer} buf
 * @returns {TarEntry[]}
 */
export function readTar(buf) {
	/** @type {TarEntry[]} */
	const entries = [];
	let off = 0;
	let pax = {};
	let total = 0;
	let ended = false;
	while (off + BLOCK <= buf.length) {
		const h = buf.subarray(off, off + BLOCK);
		if (h.every((b) => b === 0)) {
			ended = true;
			break;
		}
		let sum = 0;
		for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
		if (sum !== num(h, 148, 8)) throw new ReleaseError("tar: Prüfsumme falsch");
		const type = String.fromCharCode(h[156] || 0x30);
		const size = num(h, 124, 12);
		const start = off + BLOCK;
		const end = start + size;
		if (end > buf.length) throw new ReleaseError("tar: abgeschnitten");
		const data = buf.subarray(start, end);
		off = start + Math.ceil(size / BLOCK) * BLOCK;
		if (type === "x") {
			pax = parsePax(data);
			continue;
		}
		if (type === "g") continue;
		const prefix = str(h, 345, 155);
		let name =
			pax.path ?? (prefix ? `${prefix}/${str(h, 0, 100)}` : str(h, 0, 100));
		const link = pax.linkpath ?? str(h, 157, 100);
		pax = {};
		if (type === "5") {
			name = name.replace(/\/+$/, "");
			entries.push({ path: name, type: "dir" });
		} else if (type === "0") {
			entries.push({ path: name, type: "file", data });
		} else if (type === "2") {
			entries.push({ path: name, type: "symlink", link });
		} else {
			throw new ReleaseError(
				`tar: Eintragsart ${type} nicht erlaubt (${name})`,
			);
		}
		total += size;
		if (entries.length > MAX_ENTRIES || total > MAX_UNPACKED)
			throw new ReleaseError("tar: zu groß");
	}
	if (!ended) throw new ReleaseError("tar: abgeschnitten");
	return entries;
}

// ── packen (CI) ──────────────────────────────────────────────────────────

/**
 * Datei einmal öffnen (Verweise nicht folgen) und genau diesen Deskriptor
 * prüfen und lesen: kein Zeitfenster zwischen Prüfen und Lesen.
 * @param {string} file
 * @param {(st: import("node:fs").Stats) => void} [check]
 */
function readOpened(file, check) {
	const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const st = fstatSync(fd);
		if (!st.isFile()) throw new ReleaseError(`keine Datei: ${file}`);
		check?.(st);
		return readFileSync(fd);
	} finally {
		closeSync(fd);
	}
}

/** Einträge eines Ordners, sortiert; in `.next` ohne NEXT_EXCLUDE */
export function collect(root, rel, top = true) {
	const abs = join(root, rel);
	const st = lstatSync(abs);
	if (st.isSymbolicLink())
		return [{ path: rel, type: "symlink", link: readlinkSync(abs) }];
	if (st.isFile()) return [{ path: rel, type: "file", data: readOpened(abs) }];
	if (!st.isDirectory()) throw new ReleaseError(`nicht packbar: ${rel}`);
	const out = [{ path: rel, type: "dir" }];
	for (const n of readdirSync(abs).sort()) {
		if (top && NEXT_EXCLUDE.has(n)) continue;
		out.push(...collect(root, `${rel}/${n}`, false));
	}
	return out;
}

/** Manifest-Zeile je Eintrag (ohne Inhalt) */
export function describe(e) {
	if (e.type === "file")
		return {
			path: e.path,
			type: "file",
			size: e.data.length,
			sha256: sha256(e.data),
		};
	if (e.type === "symlink")
		return { path: e.path, type: "symlink", link: e.link };
	return { path: e.path, type: "dir" };
}

/**
 * @param {{ app: string, root: string, commit: string, tag?: string, origin: string, builtAt?: string }} o
 */
export function packRelease(o) {
	const cfg = APPS[o.app];
	if (!cfg) throw new ReleaseError(`unbekannte App ${o.app}`, 2);
	if (!existsSync(join(o.root, cfg.next, "BUILD_ID")))
		throw new ReleaseError(`${cfg.next}/BUILD_ID fehlt: erst bauen`, 2);
	const entries = collect(o.root, cfg.next);
	for (const f of cfg.files) {
		const parts = f.split("/");
		for (let i = 1; i < parts.length; i++)
			entries.push({ path: parts.slice(0, i).join("/"), type: "dir" });
		entries.push(...collect(o.root, f, false));
	}
	for (const e of entries) {
		if (!pathAllowed(o.app, e.path))
			throw new ReleaseError(`Pfad nicht erlaubt: ${e.path}`);
		if (e.type === "symlink" && !linkAllowed(o.app, e.path, e.link))
			throw new ReleaseError(`Verweis nicht erlaubt: ${e.path} -> ${e.link}`);
	}
	const unique = [...new Map(entries.map((e) => [e.path, e])).values()];
	const manifest = {
		format: FORMAT,
		app: o.app,
		commit: o.commit,
		tag: o.tag || null,
		builtAt: o.builtAt ?? new Date().toISOString(),
		node: process.versions.node,
		lockfileSha256: sha256(readFileSync(join(o.root, "pnpm-lock.yaml"))),
		origin: new URL(o.origin).origin,
		entries: unique.map(describe),
	};
	const json = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
	const tar = packTar([
		{ path: "release.json", type: "file", data: json },
		...unique,
	]);
	const gz = gzipSync(tar, { level: 6 });
	return {
		name: `${o.app}-${o.commit}.tar.gz`,
		data: gz,
		sha256: sha256(gz),
		manifest,
	};
}

// ── prüfen (Server) ──────────────────────────────────────────────────────

const major = (v) => String(v).split(".")[0];

/**
 * Paket entpacken und gegen Erwartung und Manifest prüfen; schreibt nichts.
 * @param {Buffer} gz
 * @param {{ app: string, commit: string, lockfileSha256: string, origin?: string, node?: string }} expect
 */
export function verifyRelease(gz, expect) {
	const cfg = APPS[expect.app];
	if (!cfg) throw new ReleaseError(`unbekannte App ${expect.app}`, 2);
	if (gz[0] !== 0x1f || gz[1] !== 0x8b)
		throw new ReleaseError("Artefakt ist kein gzip");
	let tar;
	try {
		tar = gunzipSync(gz, {
			maxOutputLength: MAX_UNPACKED + MAX_ENTRIES * 1024,
		});
	} catch {
		throw new ReleaseError(
			"Artefakt lässt sich nicht entpacken (oder zu groß)",
		);
	}
	const entries = readTar(tar);
	const [first, ...rest] = entries;
	if (first?.path !== "release.json" || first.type !== "file")
		throw new ReleaseError("release.json fehlt am Anfang");
	let m;
	try {
		m = JSON.parse(first.data.toString("utf8"));
	} catch {
		throw new ReleaseError("release.json ist kein JSON");
	}
	if (m.format !== FORMAT)
		throw new ReleaseError(`unbekanntes Format ${m.format}`);
	if (m.app !== expect.app)
		throw new ReleaseError(`App ${m.app}, erwartet ${expect.app}`);
	if (m.commit !== expect.commit)
		throw new ReleaseError(
			`gebaut aus ${m.commit}, Checkout steht auf ${expect.commit}`,
		);
	if (m.lockfileSha256 !== expect.lockfileSha256)
		throw new ReleaseError("pnpm-lock.yaml weicht vom Build ab");
	const node = expect.node ?? process.versions.node;
	if (major(m.node) !== major(node))
		throw new ReleaseError(`gebaut mit Node ${m.node}, Server hat ${node}`);
	if (cfg.checkOrigin && expect.origin) {
		const want = new URL(expect.origin).origin;
		if (m.origin !== want)
			throw new ReleaseError(
				`gebaut für ${m.origin}, Server ist ${want} (Repo-Variable in GitHub prüfen)`,
			);
	}
	const listed = new Map((m.entries ?? []).map((e) => [e.path, e]));
	if (listed.size !== rest.length)
		throw new ReleaseError("Manifest und Inhalt passen nicht zusammen");
	const links = new Set(
		rest.filter((e) => e.type === "symlink").map((e) => e.path),
	);
	for (const e of rest) {
		const want = listed.get(e.path);
		if (!want || want.type !== e.type)
			throw new ReleaseError(`nicht im Manifest: ${e.path}`);
		if (!pathAllowed(expect.app, e.path))
			throw new ReleaseError(`Pfad nicht erlaubt: ${e.path}`);
		const parts = e.path.split("/");
		for (let i = 1; i < parts.length; i++)
			if (links.has(parts.slice(0, i).join("/")))
				throw new ReleaseError(`Pfad hinter einem Verweis: ${e.path}`);
		if (
			e.type === "file" &&
			(want.size !== e.data.length || want.sha256 !== sha256(e.data))
		)
			throw new ReleaseError(`Prüfsumme falsch: ${e.path}`);
		if (
			e.type === "symlink" &&
			(want.link !== e.link || !linkAllowed(expect.app, e.path, e.link))
		)
			throw new ReleaseError(`Verweis nicht erlaubt: ${e.path}`);
	}
	if (!listed.has(`${cfg.next}/BUILD_ID`))
		throw new ReleaseError("BUILD_ID fehlt");
	return { manifest: m, entries: rest };
}

/** Geprüfte Einträge in einen neuen, leeren Ordner schreiben */
export function extract(entries, dest) {
	const root = resolve(dest);
	if (existsSync(root) && readdirSync(root).length > 0)
		throw new ReleaseError(`${dest} ist nicht leer`);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	for (const e of entries) {
		const to = resolve(root, ...e.path.split("/"));
		if (!to.startsWith(root + sep))
			throw new ReleaseError(`Pfad außerhalb: ${e.path}`);
		if (e.type === "dir") mkdirSync(to, { recursive: true, mode: 0o755 });
		else {
			mkdirSync(dirname(to), { recursive: true, mode: 0o755 });
			if (e.type === "file")
				writeFileSync(to, e.data, { flag: "wx", mode: 0o644 });
			else symlinkSync(e.link, to);
		}
	}
}

// ── GitHub ───────────────────────────────────────────────────────────────

/**
 * Lauf für genau diesen Commit: nur ci.yml, nur `push`, nur dieses Repo.
 * @returns {{ state: "ok", run: any } | { state: "running" } | { state: "failed", conclusion: string } | { state: "none" }}
 */
export function pickRun(runs, { repo, commit }) {
	const own = (runs ?? []).filter(
		(r) =>
			r.head_sha === commit &&
			String(r.path ?? "").split("@")[0] === WORKFLOW &&
			r.event === "push" &&
			r.repository?.full_name === repo &&
			r.head_repository?.full_name === repo,
	);
	const ok = own
		.filter((r) => r.status === "completed" && r.conclusion === "success")
		.sort((a, b) => (b.run_attempt ?? 0) - (a.run_attempt ?? 0) || b.id - a.id);
	if (ok[0]) return { state: "ok", run: ok[0] };
	if (own.some((r) => r.status !== "completed")) return { state: "running" };
	const bad = own.find((r) =>
		["failure", "timed_out", "startup_failure", "action_required"].includes(
			r.conclusion,
		),
	);
	if (bad) return { state: "failed", conclusion: bad.conclusion };
	return { state: "none" };
}

export function pickArtifact(artifacts, { app, commit }) {
	const name = `${app}-${commit}.tar.gz`;
	return (
		(artifacts ?? []).find(
			(a) =>
				a.name === name && a.expired !== true && a.size_in_bytes <= MAX_ARCHIVE,
		) ?? null
	);
}

const API_HEADERS = {
	Accept: "application/vnd.github+json",
	"X-GitHub-Api-Version": "2022-11-28",
	"User-Agent": "klick-rollout",
};

/** Die API nur über https oder lokal (Test-Nachbau) */
export function apiAllowed(api) {
	try {
		const u = new URL(api);
		return (
			u.protocol === "https:" ||
			(u.protocol === "http:" &&
				["127.0.0.1", "localhost"].includes(u.hostname))
		);
	} catch {
		return false;
	}
}

async function readLimited(res, max) {
	const len = Number(res.headers.get("content-length") ?? 0);
	if (len > max) throw new ReleaseError("Artefakt zu groß");
	const chunks = [];
	let total = 0;
	for await (const c of res.body) {
		total += c.length;
		if (total > max) throw new ReleaseError("Artefakt zu groß");
		chunks.push(Buffer.from(c));
	}
	return Buffer.concat(chunks);
}

/** Ein ZIP mit genau einem Eintrag (falls GitHub die Datei doch zippt) */
export function unzipSingle(buf) {
	const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	if (eocd < 0) throw new ReleaseError("ZIP ohne Verzeichnis");
	if (buf.readUInt16LE(eocd + 10) !== 1)
		throw new ReleaseError("ZIP mit mehr als einem Eintrag");
	const cd = buf.readUInt32LE(eocd + 16);
	if (buf.readUInt32LE(cd) !== 0x02014b50)
		throw new ReleaseError("ZIP-Verzeichnis kaputt");
	const method = buf.readUInt16LE(cd + 10);
	const csize = buf.readUInt32LE(cd + 20);
	const local = buf.readUInt32LE(cd + 42);
	if (buf.readUInt32LE(local) !== 0x04034b50)
		throw new ReleaseError("ZIP-Eintrag kaputt");
	const start =
		local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
	const data = buf.subarray(start, start + csize);
	if (method === 0) return Buffer.from(data);
	if (method === 8)
		return inflateRawSync(data, { maxOutputLength: MAX_ARCHIVE });
	throw new ReleaseError(`ZIP-Verfahren ${method} nicht unterstützt`);
}

/**
 * Lauf und Artefakt suchen, laden, prüfen. Der Token geht nur an die API,
 * nie an den Speicher hinter der Weiterleitung.
 * @param {{ api?: string, repo: string, app: string, commit: string, token: string, fetchImpl?: typeof fetch, timeoutMs?: number }} o
 */
export async function fetchArtifact(o) {
	const api = (o.api ?? "https://api.github.com").replace(/\/+$/, "");
	if (!apiAllowed(api)) throw new ReleaseError("API-Adresse nicht erlaubt", 2);
	if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(o.repo))
		throw new ReleaseError("Repo ungültig", 2);
	if (!/^[0-9a-f]{40}$/.test(o.commit))
		throw new ReleaseError("Commit ungültig", 2);
	const f = o.fetchImpl ?? fetch;
	const timeout = () => AbortSignal.timeout(o.timeoutMs ?? 60_000);
	const auth = { ...API_HEADERS, Authorization: `Bearer ${o.token}` };
	const json = async (path) => {
		const res = await f(`${api}${path}`, {
			headers: auth,
			redirect: "error",
			signal: timeout(),
		});
		if (res.status === 401 || res.status === 403)
			throw new ReleaseError(
				`GitHub lehnt den Token ab (${res.status}): Rechte „Actions: read“ für ${o.repo}?`,
			);
		if (!res.ok)
			throw new ReleaseError(
				`GitHub antwortet ${res.status} auf ${path.split("?")[0]}`,
			);
		return JSON.parse(
			(await readLimited(res, 16 * 1024 * 1024)).toString("utf8"),
		);
	};
	const runs = await json(
		`/repos/${o.repo}/actions/runs?head_sha=${o.commit}&event=push&per_page=100`,
	);
	const pick = pickRun(runs.workflow_runs, o);
	if (pick.state === "running")
		throw new ReleaseError(`CI für ${o.commit.slice(0, 7)} läuft noch`, 5);
	if (pick.state === "failed")
		throw new ReleaseError(
			`CI für ${o.commit.slice(0, 7)} ist rot (${pick.conclusion}): kein Release`,
			4,
		);
	if (pick.state === "none")
		throw new ReleaseError(
			`kein grüner CI-Lauf für ${o.commit.slice(0, 7)}`,
			3,
		);
	const list = await json(
		`/repos/${o.repo}/actions/runs/${pick.run.id}/artifacts?per_page=100`,
	);
	const art = pickArtifact(list.artifacts, o);
	if (!art)
		throw new ReleaseError(
			`kein Artefakt ${o.app}-${o.commit.slice(0, 7)} im Lauf ${pick.run.id}`,
			3,
		);
	// Download: API antwortet mit Weiterleitung auf den Speicher; dorthin ohne Token
	const first = await f(
		`${api}/repos/${o.repo}/actions/artifacts/${art.id}/zip`,
		{
			headers: auth,
			redirect: "manual",
			signal: timeout(),
		},
	);
	let res = first;
	for (let hop = 0; res.status >= 300 && res.status < 400; hop++) {
		const loc = res.headers.get("location");
		if (hop >= 3 || !loc)
			throw new ReleaseError("Download: zu viele Weiterleitungen");
		const next = new URL(loc, `${api}/`);
		if (next.protocol !== "https:" && !apiAllowed(next.origin))
			throw new ReleaseError("Download nur über https");
		res = await f(next, {
			headers: { "User-Agent": API_HEADERS["User-Agent"] },
			redirect: "manual",
			signal: timeout(),
		});
	}
	if (!res.ok) throw new ReleaseError(`Download: ${res.status}`);
	const raw = await readLimited(res, MAX_ARCHIVE);
	const digest = String(art.digest ?? "");
	if (digest && digest !== `sha256:${sha256(raw)}`)
		throw new ReleaseError("Download: Digest passt nicht");
	const gz = raw[0] === 0x50 && raw[1] === 0x4b ? unzipSingle(raw) : raw;
	return { gz, run: pick.run, artifact: art };
}

// ── Aufruf ───────────────────────────────────────────────────────────────

// Der gelesene Token: jede Meldung läuft vor der Ausgabe durch `redact`
let SECRET = "";
export const redact = (s) =>
	SECRET ? String(s).split(SECRET).join("***") : String(s);

/**
 * Token aus einer Datei, die nur dem Besitzer gehört; als root muss sie
 * auch root gehören. Geprüft wird der geöffnete Deskriptor, kein Pfad.
 */
export function readToken(file) {
	let raw;
	try {
		raw = readOpened(file, (st) => {
			if ((st.mode & 0o077) !== 0)
				throw new ReleaseError(`${file} ist für andere lesbar (chmod 600)`, 2);
			if (process.getuid?.() === 0 && st.uid !== 0)
				throw new ReleaseError(`${file} gehört nicht root`, 2);
		});
	} catch (e) {
		if (e instanceof ReleaseError) throw e;
		throw new ReleaseError(`${file} fehlt oder ist keine reguläre Datei`, 2);
	}
	const t = raw.toString("utf8").trim();
	if (!/^[A-Za-z0-9_]{20,255}$/.test(t))
		throw new ReleaseError(`${file} enthält keinen GitHub-Token`, 2);
	SECRET = t;
	return t;
}

function args(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--")) {
			const v = argv[i + 1];
			if (v === undefined || v.startsWith("--"))
				throw new ReleaseError(`${a} braucht einen Wert`, 2);
			out[a.slice(2)] = v;
			i++;
		} else out._.push(a);
	}
	return out;
}

const git = (root, a) => {
	try {
		return execFileSync("git", ["-C", root, ...a], {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		return "";
	}
};

async function main(argv) {
	const a = args(argv);
	const cmd = a._[0];
	if (cmd === "packen") {
		const root = resolve(a.root ?? ".");
		const app = a.app;
		const origin =
			a.origin ??
			(app === "both"
				? process.env.WALLET_AUTH_URL
				: process.env.BETTER_AUTH_URL);
		if (!origin)
			throw new ReleaseError(
				"Adresse fehlt (--origin oder BETTER_AUTH_URL/WALLET_AUTH_URL)",
				2,
			);
		const r = packRelease({
			app,
			root,
			commit: a.commit ?? git(root, ["rev-parse", "HEAD"]),
			tag: git(root, ["describe", "--tags", "--exact-match"]),
			origin,
		});
		const out = resolve(a.out ?? ".");
		mkdirSync(out, { recursive: true });
		writeFileSync(join(out, r.name), r.data);
		process.stdout.write(
			`${r.sha256}  ${r.name}  (${r.manifest.entries.length} Einträge, ${(r.data.length / 1048576).toFixed(1)} MB)\n`,
		);
		return;
	}
	if (cmd === "holen") {
		for (const k of [
			"app",
			"commit",
			"repo",
			"token-datei",
			"lockfile",
			"ziel",
		])
			if (!a[k]) throw new ReleaseError(`--${k} fehlt`, 2);
		if (!APPS[a.app]) throw new ReleaseError(`unbekannte App ${a.app}`, 2);
		const token = readToken(a["token-datei"]);
		const got = await fetchArtifact({
			api: a.api,
			repo: a.repo,
			app: a.app,
			commit: a.commit,
			token,
		});
		const { manifest, entries } = verifyRelease(got.gz, {
			app: a.app,
			commit: a.commit,
			lockfileSha256: sha256(readFileSync(a.lockfile)),
			origin: a.origin,
		});
		extract(entries, a.ziel);
		process.stdout.write(
			`Artefakt ${a.app}-${a.commit.slice(0, 7)} aus CI-Lauf ${got.run.id} geprüft: ${entries.length} Einträge, gebaut ${manifest.builtAt}, Node ${manifest.node}\n`,
		);
		return;
	}
	throw new ReleaseError("Aufruf: artefakt.mjs packen|holen …", 2);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main(process.argv.slice(2)).catch((e) => {
		const msg =
			e instanceof ReleaseError
				? e.message
				: `unerwarteter Fehler: ${e?.message ?? e}`;
		process.stderr.write(`artefakt: ${redact(msg).slice(0, 500)}\n`);
		process.exit(e instanceof ReleaseError ? e.code : 1);
	});
}
