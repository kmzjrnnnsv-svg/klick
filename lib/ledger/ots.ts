import { createHash } from "node:crypto";

// OpenTimestamps-Format (Verlauf mit Bitcoin-Anker, Härtung V) — rein, ohne
// Abhängigkeit, wie ZIP- und PDF-Writer. Nachbau des Formats von
// python-opentimestamps (Timestamp, Op, TimeAttestation, DetachedTimestampFile):
//
//   Datei   = MAGIC · varuint(1) · 0x08 (SHA-256) · digest(32) · Timestamp
//   Timestamp = Folge von Einträgen; vor jedem außer dem letzten 0xff.
//     Eintrag = 0x00 · Beglaubigung | Op · Timestamp(Ergebnis der Op)
//   Beglaubigung = Tag(8) · varbytes(Nutzlast)
//     ausstehend (Kalender) 83dfe30d2ef90c8e: varbytes(URI)
//     Bitcoin-Block         0588960d73d71901: varuint(Höhe)
//   Op: append f0/prepend f1 · varbytes(arg); sha256 08, sha1 02,
//       ripemd160 03, reverse f2, hexlify f3, keccak256 67 (nur gelesen)
//
// Geprüft wird mit dem offiziellen Client (`ots verify wurzel.bin.ots`) oder
// scripts/verify-ledger.mjs; Bitcoin-Beglaubigung = Nachricht am Ende ist die
// Merkle-Wurzel des Blocks (interne Bytefolge).

export const OTS_MAGIC = Uint8Array.from([
	0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d,
	0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2,
	0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
export const OTS_VERSION = 1;

const TAG_PENDING = "83dfe30d2ef90c8e";
const TAG_BITCOIN = "0588960d73d71901";
const MAX_URI = 1000;
const MAX_ARG = 4096;
const MAX_DEPTH = 256;

export type OtsOp =
	| { op: "append" | "prepend"; arg: Uint8Array }
	| { op: "sha256" | "sha1" | "ripemd160" | "reverse" | "hexlify" };

export type OtsAttestation =
	| { kind: "pending"; uri: string }
	| { kind: "bitcoin"; height: number }
	| { kind: "unknown"; tag: string; payload: Uint8Array };

export type OtsTimestamp = {
	msg: Uint8Array;
	attestations: OtsAttestation[];
	ops: { op: OtsOp; next: OtsTimestamp }[];
};

const OP_TAG: Record<OtsOp["op"], number> = {
	append: 0xf0,
	prepend: 0xf1,
	reverse: 0xf2,
	hexlify: 0xf3,
	sha1: 0x02,
	ripemd160: 0x03,
	sha256: 0x08,
};
const TAG_OP = new Map<number, OtsOp["op"]>(
	Object.entries(OP_TAG).map(([k, v]) => [v, k as OtsOp["op"]]),
);

export const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
export const unhex = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const concat = (...parts: Uint8Array[]) =>
	Uint8Array.from(Buffer.concat(parts));

export function sha256(data: Uint8Array): Uint8Array {
	return Uint8Array.from(createHash("sha256").update(data).digest());
}

export function applyOp(op: OtsOp, msg: Uint8Array): Uint8Array {
	switch (op.op) {
		case "append":
			return concat(msg, op.arg);
		case "prepend":
			return concat(op.arg, msg);
		case "sha256":
			return sha256(msg);
		case "sha1":
			return Uint8Array.from(createHash("sha1").update(msg).digest());
		case "ripemd160":
			return Uint8Array.from(createHash("ripemd160").update(msg).digest());
		case "reverse":
			return Uint8Array.from(msg).reverse();
		case "hexlify":
			return Uint8Array.from(Buffer.from(hex(msg), "utf8"));
	}
}

export function newTimestamp(msg: Uint8Array): OtsTimestamp {
	return { msg, attestations: [], ops: [] };
}

/** Op an einen Knoten hängen (oder vorhandenen Zweig derselben Op nehmen). */
export function addOp(ts: OtsTimestamp, op: OtsOp): OtsTimestamp {
	const key = opKey(op);
	const hit = ts.ops.find((o) => opKey(o.op) === key);
	if (hit) return hit.next;
	const next = newTimestamp(applyOp(op, ts.msg));
	ts.ops.push({ op, next });
	return next;
}

// ── Schreiben ───────────────────────────────────────────────────────────────

class Writer {
	parts: number[] = [];
	byte(b: number) {
		this.parts.push(b & 0xff);
	}
	bytes(b: Uint8Array) {
		for (const x of b) this.parts.push(x);
	}
	varuint(n: number) {
		if (!Number.isSafeInteger(n) || n < 0) throw new Error("ots_varuint");
		let v = n;
		for (;;) {
			const b = v % 128;
			v = Math.floor(v / 128);
			if (v > 0) this.byte(b | 0x80);
			else {
				this.byte(b);
				break;
			}
		}
	}
	varbytes(b: Uint8Array) {
		this.varuint(b.length);
		this.bytes(b);
	}
	out() {
		return Uint8Array.from(this.parts);
	}
}

function attestationBytes(a: OtsAttestation): Uint8Array {
	const w = new Writer();
	const payload = new Writer();
	let tag: string;
	if (a.kind === "pending") {
		tag = TAG_PENDING;
		payload.varbytes(Uint8Array.from(Buffer.from(a.uri, "utf8")));
	} else if (a.kind === "bitcoin") {
		tag = TAG_BITCOIN;
		payload.varuint(a.height);
	} else {
		tag = a.tag;
		payload.bytes(a.payload);
	}
	w.bytes(unhex(tag));
	w.varbytes(payload.out());
	return w.out();
}

function opBytes(op: OtsOp): Uint8Array {
	const w = new Writer();
	w.byte(OP_TAG[op.op]);
	if (op.op === "append" || op.op === "prepend") w.varbytes(op.arg);
	return w.out();
}

const opKey = (op: OtsOp) => hex(opBytes(op));
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function writeTimestamp(w: Writer, ts: OtsTimestamp): void {
	const atts = ts.attestations
		.map(attestationBytes)
		.sort((a, b) => cmp(hex(a), hex(b)));
	const ops = [...ts.ops].sort((a, b) => cmp(opKey(a.op), opKey(b.op)));
	if (atts.length === 0 && ops.length === 0) throw new Error("ots_empty");
	const items: (() => void)[] = [
		...atts.map((a) => () => {
			w.byte(0x00);
			w.bytes(a);
		}),
		...ops.map((o) => () => {
			w.bytes(opBytes(o.op));
			writeTimestamp(w, o.next);
		}),
	];
	items.forEach((write, i) => {
		if (i < items.length - 1) w.byte(0xff);
		write();
	});
}

export function serializeTimestamp(ts: OtsTimestamp): Uint8Array {
	const w = new Writer();
	writeTimestamp(w, ts);
	return w.out();
}

/** Detached-Datei (.ots) für eine SHA-256-Prüfsumme. */
export function serializeOtsFile(ts: OtsTimestamp): Uint8Array {
	if (ts.msg.length !== 32) throw new Error("ots_digest");
	const w = new Writer();
	w.bytes(OTS_MAGIC);
	w.varuint(OTS_VERSION);
	w.byte(OP_TAG.sha256);
	w.bytes(ts.msg);
	writeTimestamp(w, ts);
	return w.out();
}

// ── Lesen ───────────────────────────────────────────────────────────────────

class Reader {
	pos = 0;
	constructor(private readonly buf: Uint8Array) {}
	byte(): number {
		const b = this.buf[this.pos];
		if (b === undefined) throw new Error("ots_truncated");
		this.pos++;
		return b;
	}
	bytes(n: number): Uint8Array {
		if (this.pos + n > this.buf.length) throw new Error("ots_truncated");
		const out = this.buf.slice(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}
	varuint(): number {
		let value = 0;
		let shift = 1;
		for (let i = 0; i < 9; i++) {
			const b = this.byte();
			value += (b & 0x7f) * shift;
			if (!(b & 0x80)) return value;
			shift *= 128;
		}
		throw new Error("ots_varuint");
	}
	varbytes(max: number): Uint8Array {
		const n = this.varuint();
		if (n > max) throw new Error("ots_too_long");
		return this.bytes(n);
	}
	done() {
		return this.pos === this.buf.length;
	}
}

function readAttestation(r: Reader): OtsAttestation {
	const tag = hex(r.bytes(8));
	const payload = r.varbytes(8192);
	const p = new Reader(payload);
	if (tag === TAG_PENDING) {
		const uri = Buffer.from(p.varbytes(MAX_URI)).toString("utf8");
		if (!p.done()) throw new Error("ots_payload");
		return { kind: "pending", uri };
	}
	if (tag === TAG_BITCOIN) {
		const height = p.varuint();
		if (!p.done()) throw new Error("ots_payload");
		return { kind: "bitcoin", height };
	}
	return { kind: "unknown", tag, payload };
}

function readOp(r: Reader, tag: number): OtsOp {
	const op = TAG_OP.get(tag);
	if (!op) throw new Error(`ots_op_${tag.toString(16)}`);
	if (op === "append" || op === "prepend")
		return { op, arg: r.varbytes(MAX_ARG) };
	return { op };
}

function readTimestamp(
	r: Reader,
	msg: Uint8Array,
	depth: number,
): OtsTimestamp {
	if (depth > MAX_DEPTH) throw new Error("ots_depth");
	const ts = newTimestamp(msg);
	const item = (tag: number) => {
		if (tag === 0x00) ts.attestations.push(readAttestation(r));
		else {
			const op = readOp(r, tag);
			ts.ops.push({
				op,
				next: readTimestamp(r, applyOp(op, msg), depth + 1),
			});
		}
	};
	let tag = r.byte();
	while (tag === 0xff) {
		item(r.byte());
		tag = r.byte();
	}
	item(tag);
	return ts;
}

export function parseTimestamp(
	bytes: Uint8Array,
	msg: Uint8Array,
): OtsTimestamp {
	const r = new Reader(bytes);
	const ts = readTimestamp(r, msg, 0);
	if (!r.done()) throw new Error("ots_trailing");
	return ts;
}

export function parseOtsFile(bytes: Uint8Array): OtsTimestamp {
	const r = new Reader(bytes);
	if (hex(r.bytes(OTS_MAGIC.length)) !== hex(OTS_MAGIC))
		throw new Error("ots_magic");
	if (r.varuint() !== OTS_VERSION) throw new Error("ots_version");
	if (r.byte() !== OP_TAG.sha256) throw new Error("ots_file_hash");
	const ts = readTimestamp(r, r.bytes(32), 0);
	if (!r.done()) throw new Error("ots_trailing");
	return ts;
}

// ── Zusammenführen und Auswerten ────────────────────────────────────────────

/** `other` in `ts` einhängen (gleiche Nachricht), wie Timestamp.merge. */
export function mergeTimestamp(ts: OtsTimestamp, other: OtsTimestamp): void {
	if (hex(ts.msg) !== hex(other.msg)) throw new Error("ots_merge_msg");
	const have = new Set(ts.attestations.map((a) => hex(attestationBytes(a))));
	for (const a of other.attestations)
		if (!have.has(hex(attestationBytes(a)))) ts.attestations.push(a);
	for (const o of other.ops) {
		const hit = ts.ops.find((x) => opKey(x.op) === opKey(o.op));
		if (hit) mergeTimestamp(hit.next, o.next);
		else ts.ops.push(o);
	}
}

export type AttestationAt = { msg: Uint8Array; attestation: OtsAttestation };

/** Alle Beglaubigungen mit der Nachricht, für die sie gelten. */
export function attestations(ts: OtsTimestamp): AttestationAt[] {
	const out: AttestationAt[] = [];
	const walk = (t: OtsTimestamp) => {
		for (const a of t.attestations) out.push({ msg: t.msg, attestation: a });
		for (const o of t.ops) walk(o.next);
	};
	walk(ts);
	return out;
}

/** Niedrigste Bitcoin-Beglaubigung (frühester Beweis), sonst null. */
export function bitcoinAttestation(
	ts: OtsTimestamp,
): { height: number; merkleRoot: string } | null {
	const hits = attestations(ts).flatMap((a) =>
		a.attestation.kind === "bitcoin"
			? [
					{
						height: a.attestation.height,
						// Anzeige wie bitcoin-cli getblockheader (umgekehrte Bytes)
						merkleRoot: hex(Uint8Array.from(a.msg).reverse()),
					},
				]
			: [],
	);
	return hits.sort((a, b) => a.height - b.height)[0] ?? null;
}

/** Offene Kalender-Beglaubigungen: (Kalender, Nachricht) zum Nachfragen. */
export function pendingCommitments(
	ts: OtsTimestamp,
): { uri: string; commitment: Uint8Array }[] {
	return attestations(ts).flatMap((a) =>
		a.attestation.kind === "pending"
			? [{ uri: a.attestation.uri, commitment: a.msg }]
			: [],
	);
}

/** Knoten mit dieser Nachricht suchen (für das Einhängen eines Upgrades). */
export function findByMsg(
	ts: OtsTimestamp,
	msg: Uint8Array,
): OtsTimestamp | null {
	if (hex(ts.msg) === hex(msg)) return ts;
	for (const o of ts.ops) {
		const hit = findByMsg(o.next, msg);
		if (hit) return hit;
	}
	return null;
}
