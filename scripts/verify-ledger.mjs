#!/usr/bin/env node
// Verlauf prüfen — ohne Klick, nur mit Node (node:crypto, node:fs).
//
//   node pruefen.mjs [ordner]      (ordner = entpackter Verlauf, Standard: hier)
//
// Prüft (Härtung V, ADR-030):
//  1. Kette: jeder Eintrag aus kette.jsonl wird neu gehasht
//     (sha256(vorheriger Hash oder "GENESIS" + "\n" + kanonisches JSON)) und
//     muss an den vorherigen anschließen.
//  2. Je Anker: der verankerte Kopf (seq, Anzahl, Hash) steht so in der Kette,
//     das Blatt ergibt über den Merkle-Pfad die Wurzel, wurzel.bin = Wurzel.
//  3. Zeitstempel (wurzel.bin.ots, OpenTimestamps): gehört zu wurzel.bin und
//     führt zu einer Bitcoin-Beglaubigung (Blockhöhe + Merkle-Wurzel des
//     Blocks zum Abgleich) oder ist noch ausstehend.
// Den Bitcoin-Block gleichst du mit einem eigenen Knoten ab
// (bitcoin-cli getblockheader $(bitcoin-cli getblockhash <höhe>)) oder prüfst
// die .ots-Datei mit dem offiziellen Client: ots verify wurzel.bin.ots
//
// Exit-Code 0 = alles stimmig, 1 = Abweichung gefunden.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] ?? dirname(fileURLToPath(import.meta.url));
const sha256 = (b) => createHash("sha256").update(b).digest();
let failures = 0;
const fail = (msg) => {
	failures++;
	console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ── Kette ──────────────────────────────────────────────────────────────────

function normalize(v) {
	if (v === undefined || v === null) return null;
	if (Array.isArray(v)) return v.map(normalize);
	if (typeof v === "object") {
		const out = {};
		for (const k of Object.keys(v).sort()) {
			if (v[k] === undefined) continue;
			out[k] = normalize(v[k]);
		}
		return out;
	}
	return v;
}

function entryHash(prev, r) {
	const body = JSON.stringify(
		normalize({
			id: r.id,
			organizationId: r.organizationId,
			actorUserId: r.actorUserId,
			action: r.action,
			target: r.target,
			before: r.before,
			after: r.after,
			ip: r.ip,
			userAgent: r.userAgent,
			outcome: r.outcome,
			at: r.at,
		}),
	);
	return createHash("sha256")
		.update(`${prev ?? "GENESIS"}\n${body}`)
		.digest("hex");
}

console.log(`Verlauf prüfen: ${dir}\n\n1. Kette`);
const rows = readFileSync(join(dir, "kette.jsonl"), "utf8")
	.split("\n")
	.filter(Boolean)
	.map((l) => JSON.parse(l));
const bySeq = new Map();
let prev = null;
let broken = false;
for (const [i, r] of rows.entries()) {
	if (r.prevHash !== prev) {
		fail(`Eintrag ${r.seq}: schließt nicht an den vorherigen an`);
		broken = true;
		break;
	}
	if (entryHash(r.prevHash, r) !== r.hash) {
		fail(`Eintrag ${r.seq}: Inhalt passt nicht zum Hash`);
		broken = true;
		break;
	}
	bySeq.set(String(r.seq), { hash: r.hash, count: i + 1 });
	prev = r.hash;
}
if (!broken) ok(`${rows.length} Einträge, lückenlos verkettet`);

// ── Merkle-Pfad ────────────────────────────────────────────────────────────

const leafOf = (k) =>
	sha256(
		Buffer.concat([
			Buffer.of(0),
			Buffer.from(
				`klick-ledger/v1|${k.orgId}|${k.seq}|${k.count}|${k.head}`,
				"utf8",
			),
		]),
	).toString("hex");
const node = (l, r) =>
	sha256(
		Buffer.concat([Buffer.of(1), Buffer.from(l, "hex"), Buffer.from(r, "hex")]),
	).toString("hex");

// ── OpenTimestamps (Format wie python-opentimestamps) ──────────────────────

const MAGIC = Buffer.from(
	"004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294",
	"hex",
);
function reader(buf) {
	let pos = 0;
	const r = {
		byte() {
			if (pos >= buf.length) throw new Error("abgeschnitten");
			return buf[pos++];
		},
		bytes(n) {
			if (pos + n > buf.length) throw new Error("abgeschnitten");
			const out = buf.subarray(pos, pos + n);
			pos += n;
			return out;
		},
		varuint() {
			let v = 0;
			let s = 1;
			for (let i = 0; i < 9; i++) {
				const b = r.byte();
				v += (b & 0x7f) * s;
				if (!(b & 0x80)) return v;
				s *= 128;
			}
			throw new Error("varuint");
		},
		varbytes(max) {
			const n = r.varuint();
			if (n > max) throw new Error("zu lang");
			return r.bytes(n);
		},
		done: () => pos === buf.length,
	};
	return r;
}
function applyOp(tag, arg, msg) {
	switch (tag) {
		case 0xf0:
			return Buffer.concat([msg, arg]);
		case 0xf1:
			return Buffer.concat([arg, msg]);
		case 0xf2:
			return Buffer.from(msg).reverse();
		case 0xf3:
			return Buffer.from(msg.toString("hex"), "utf8");
		case 0x02:
			return createHash("sha1").update(msg).digest();
		case 0x03:
			return createHash("ripemd160").update(msg).digest();
		case 0x08:
			return sha256(msg);
		default:
			throw new Error(`unbekannte Operation ${tag.toString(16)}`);
	}
}
function readStamp(r, msg, found, depth = 0) {
	if (depth > 256) throw new Error("zu tief");
	const item = (tag) => {
		if (tag === 0x00) {
			const t = r.bytes(8).toString("hex");
			const p = reader(r.varbytes(8192));
			if (t === "0588960d73d71901")
				found.push({ kind: "bitcoin", height: p.varuint(), msg });
			else if (t === "83dfe30d2ef90c8e")
				found.push({ kind: "pending", uri: p.varbytes(1000).toString("utf8") });
			return;
		}
		const arg = tag === 0xf0 || tag === 0xf1 ? r.varbytes(4096) : null;
		readStamp(r, applyOp(tag, arg, msg), found, depth + 1);
	};
	let tag = r.byte();
	while (tag === 0xff) {
		item(r.byte());
		tag = r.byte();
	}
	item(tag);
}
function readOts(buf, file) {
	const r = reader(buf);
	if (!r.bytes(MAGIC.length).equals(MAGIC)) throw new Error("keine .ots-Datei");
	if (r.varuint() !== 1) throw new Error("unbekannte Version");
	if (r.byte() !== 0x08) throw new Error("nicht SHA-256");
	const digest = r.bytes(32);
	if (!digest.equals(sha256(file)))
		throw new Error("gehört nicht zu wurzel.bin");
	const found = [];
	readStamp(r, digest, found);
	if (!r.done()) throw new Error("Restdaten");
	return found;
}

// ── Anker ──────────────────────────────────────────────────────────────────

console.log("\n2. Anker");
const ankerDir = join(dir, "anker");
const anchors = existsSync(ankerDir) ? readdirSync(ankerDir).sort() : [];
if (anchors.length === 0) console.log("  (noch kein Anker)");
for (const a of anchors) {
	const base = join(ankerDir, a);
	const k = JSON.parse(readFileSync(join(base, "kopf.json"), "utf8"));
	console.log(`\n  ${a} (${k.createdAt})`);
	const at = bySeq.get(String(k.seq));
	if (!at) fail(`Kopf ${k.seq} fehlt in der Kette`);
	else if (at.hash !== k.head) fail("Kopf weicht vom Eintrag in der Kette ab");
	else if (at.count !== k.count) fail("Anzahl der Einträge weicht ab");
	else ok(`Kopf = Eintrag ${k.seq} (${k.count} Einträge)`);
	const leaf = leafOf(k);
	if (leaf !== k.leaf) fail("Blatt passt nicht zum Kopf");
	const root = k.path.reduce(
		(acc, s) => (s.side === "right" ? node(acc, s.hash) : node(s.hash, acc)),
		leaf,
	);
	if (root !== k.root) fail("Merkle-Pfad ergibt nicht die Wurzel");
	else ok(`Merkle-Pfad → Wurzel ${root.slice(0, 16)}…`);
	const wurzel = readFileSync(join(base, "wurzel.bin"));
	if (wurzel.toString("hex") !== k.root) fail("wurzel.bin ≠ Wurzel");
	const otsPath = join(base, "wurzel.bin.ots");
	if (!existsSync(otsPath)) {
		console.log("  · kein Zeitstempel (Kalender nicht erreicht)");
		continue;
	}
	try {
		const found = readOts(readFileSync(otsPath), wurzel);
		const btc = found
			.filter((f) => f.kind === "bitcoin")
			.sort((x, y) => x.height - y.height)[0];
		if (btc) {
			const mr = Buffer.from(btc.msg).reverse().toString("hex");
			ok(`Bitcoin-Block ${btc.height}, Merkle-Wurzel ${mr}`);
			console.log(
				`    abgleichen: bitcoin-cli getblockheader $(bitcoin-cli getblockhash ${btc.height}) | grep merkleroot`,
			);
		} else {
			const cals = found.filter((f) => f.kind === "pending").map((f) => f.uri);
			console.log(
				`  · Zeitstempel ausstehend (${cals.join(", ") || "ohne Kalender"}); später erneut herunterladen`,
			);
		}
	} catch (err) {
		fail(`wurzel.bin.ots: ${err.message}`);
	}
}

console.log(
	failures === 0
		? "\nErgebnis: stimmig."
		: `\nErgebnis: ${failures} Abweichung(en).`,
);
process.exitCode = failures === 0 ? 0 : 1;
