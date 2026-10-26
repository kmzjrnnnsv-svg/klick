import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { anchorDue, isCriticalAction, stampTree } from "@/lib/ledger/anchor";
import { calendarAllowed, configuredCalendars } from "@/lib/ledger/calendar";
import {
	leafHash,
	leafText,
	merklePath,
	merkleRoot,
	rootFromPath,
	sortLeaves,
} from "@/lib/ledger/merkle";
import {
	addOp,
	bitcoinAttestation,
	findByMsg,
	hex,
	mergeTimestamp,
	newTimestamp,
	OTS_MAGIC,
	parseOtsFile,
	parseTimestamp,
	pendingCommitments,
	serializeOtsFile,
	serializeTimestamp,
	sha256,
	unhex,
} from "@/lib/ledger/ots";

// Verlauf mit Bitcoin-Anker (Härtung V): OpenTimestamps-Format, Merkle-Baum,
// Zeitpunkte und Kalender-Allowlist — rein.

const sha = (s: Buffer | Uint8Array) =>
	createHash("sha256").update(s).digest("hex");

describe("OpenTimestamps-Format", () => {
	it("Bytes wie python-opentimestamps (Op, Beglaubigung, varbytes)", () => {
		const ts = newTimestamp(unhex("aa"));
		const after = addOp(ts, { op: "append", arg: Uint8Array.of(1, 2) });
		const hashed = addOp(after, { op: "sha256" });
		hashed.attestations.push({ kind: "pending", uri: "https://a.example" });
		const uri = Buffer.from("https://a.example");
		const payload = Buffer.concat([Buffer.of(uri.length), uri]);
		expect(hex(serializeTimestamp(ts))).toBe(
			`f0020102` + // append, varbytes(01 02)
				`08` + // sha256
				`00` + // Beglaubigung
				`83dfe30d2ef90c8e` + // ausstehend
				Buffer.concat([Buffer.of(payload.length), payload]).toString("hex"),
		);
		expect(hashed.msg).toEqual(sha256(Uint8Array.of(0xaa, 1, 2)));
	});

	it("Verzweigung: 0xff vor allen Einträgen außer dem letzten", () => {
		const ts = newTimestamp(unhex("00"));
		ts.attestations.push({ kind: "bitcoin", height: 300 });
		addOp(ts, { op: "sha256" }).attestations.push({
			kind: "bitcoin",
			height: 1,
		});
		// ff 00 <btc 300> 08 00 <btc 1>; varuint(300) = ac 02
		expect(hex(serializeTimestamp(ts))).toBe(
			"ff000588960d73d7190102ac02" + "08000588960d73d719010101",
		);
		const back = parseTimestamp(serializeTimestamp(ts), unhex("00"));
		expect(bitcoinAttestation(back)?.height).toBe(1);
	});

	it("Datei: Magic, Version, SHA-256 und Rundreise", () => {
		const digest = sha256(Buffer.from("wurzel"));
		const ts = newTimestamp(digest);
		addOp(addOp(ts, { op: "prepend", arg: unhex("beef") }), {
			op: "sha256",
		}).attestations.push({ kind: "pending", uri: "https://b.example" });
		const file = serializeOtsFile(ts);
		expect(hex(file.slice(0, OTS_MAGIC.length))).toBe(
			"004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294",
		);
		expect(file[OTS_MAGIC.length]).toBe(1);
		expect(file[OTS_MAGIC.length + 1]).toBe(0x08);
		const back = parseOtsFile(file);
		expect(hex(serializeOtsFile(back))).toBe(hex(file));
		expect(pendingCommitments(back)).toEqual([
			{
				uri: "https://b.example",
				commitment: sha256(Buffer.concat([unhex("beef"), digest])),
			},
		]);
	});

	it("Zusammenführen und Upgrade einhängen", () => {
		const msg = unhex("01");
		const a = newTimestamp(msg);
		addOp(a, { op: "sha256" }).attestations.push({
			kind: "pending",
			uri: "https://a.example",
		});
		const b = newTimestamp(msg);
		addOp(b, { op: "sha256" }).attestations.push({
			kind: "pending",
			uri: "https://b.example",
		});
		mergeTimestamp(a, b);
		expect(
			pendingCommitments(a)
				.map((p) => p.uri)
				.sort(),
		).toEqual(["https://a.example", "https://b.example"]);
		// Upgrade ab dem Commitment bis zur Bitcoin-Beglaubigung
		const commitment = sha256(msg);
		const up = newTimestamp(commitment);
		const end = addOp(up, { op: "reverse" });
		end.attestations.push({ kind: "bitcoin", height: 912345 });
		const node = findByMsg(a, commitment);
		expect(node).not.toBeNull();
		if (node) mergeTimestamp(node, up);
		expect(bitcoinAttestation(a)).toEqual({
			height: 912345,
			// Anzeige umgekehrt zur Nachricht (die selbst schon umgekehrt ist)
			merkleRoot: hex(commitment),
		});
	});

	it("lehnt kaputte Dateien ab", () => {
		const ts = newTimestamp(sha256(Buffer.from("x")));
		ts.attestations.push({ kind: "bitcoin", height: 5 });
		const ok = serializeOtsFile(ts);
		expect(() => parseOtsFile(ok.slice(0, ok.length - 1))).toThrow();
		expect(() => parseOtsFile(Uint8Array.from([...ok, 0]))).toThrow(
			"ots_trailing",
		);
		const bad = Uint8Array.from(ok);
		bad[0] = 1;
		expect(() => parseOtsFile(bad)).toThrow("ots_magic");
		expect(() => parseTimestamp(unhex("99"), unhex("00"))).toThrow();
		// zu tiefe Verschachtelung
		expect(() =>
			parseTimestamp(
				Uint8Array.from([...new Array(300).fill(0x08), 0x00]),
				unhex("00"),
			),
		).toThrow("ots_depth");
	});
});

describe("Merkle-Baum über die Köpfe", () => {
	const leaves = (n: number) =>
		Array.from({ length: n }, (_, i) =>
			leafHash({
				orgId: `org-${i}`,
				seq: String(i + 1),
				count: i + 1,
				head: sha(Buffer.of(i)),
			}),
		);
	it("Blatt mit Präfix 0x00 über den kanonischen Text", () => {
		const l = { orgId: "o", seq: "7", count: 3, head: "ab" };
		expect(leafText(l)).toBe("klick-ledger/v1|o|7|3|ab");
		expect(leafHash(l)).toBe(
			sha(Buffer.concat([Buffer.of(0), Buffer.from(leafText(l))])),
		);
	});
	it("Wurzel wie RFC 6962 und jeder Pfad führt zu ihr", () => {
		const three = leaves(3);
		const node = (a: string, b: string) =>
			sha(
				Buffer.concat([
					Buffer.of(1),
					Buffer.from(a, "hex"),
					Buffer.from(b, "hex"),
				]),
			);
		expect(merkleRoot(three)).toBe(
			node(node(three[0] as string, three[1] as string), three[2] as string),
		);
		for (const n of [1, 2, 3, 5, 8, 13]) {
			const ls = leaves(n);
			const root = merkleRoot(ls);
			ls.forEach((l, i) => {
				expect(rootFromPath(l, merklePath(ls, i))).toBe(root);
			});
		}
		const ls = leaves(5);
		const path = merklePath(ls, 2);
		const forged = path.map((s, i) =>
			i === 0 ? { ...s, hash: "00".repeat(32) } : s,
		);
		expect(rootFromPath(ls[2] as string, forged)).not.toBe(merkleRoot(ls));
	});
	it("feste Reihenfolge nach Org-ID", () => {
		const s = sortLeaves([
			{ orgId: "b", seq: "1", count: 1, head: "x" },
			{ orgId: "a", seq: "1", count: 1, head: "y" },
		]);
		expect(s.map((l) => l.orgId)).toEqual(["a", "b"]);
	});
});

describe("Wann verankert wird", () => {
	it("täglich ab 02:30 Berlin, einmal je Tag", () => {
		// 26.10.2026: MEZ (UTC+1)
		const at = (iso: string) => new Date(iso);
		expect(
			anchorDue({
				now: at("2026-10-26T01:20:00Z"),
				lastDailyAt: null,
				criticalSinceLast: 0,
			}),
		).toBeNull(); // 02:20 Berlin
		expect(
			anchorDue({
				now: at("2026-10-26T01:31:00Z"),
				lastDailyAt: null,
				criticalSinceLast: 0,
			}),
		).toBe("daily");
		expect(
			anchorDue({
				now: at("2026-10-26T15:00:00Z"),
				lastDailyAt: at("2026-10-26T01:40:00Z"),
				criticalSinceLast: 0,
			}),
		).toBeNull();
		// Sommerzeit (UTC+2): 00:31 UTC = 02:31 Berlin
		expect(
			anchorDue({
				now: at("2026-07-01T00:31:00Z"),
				lastDailyAt: null,
				criticalSinceLast: 0,
			}),
		).toBe("daily");
	});
	it("kritische Ereignisse beim nächsten Lauf", () => {
		expect(
			anchorDue({
				now: new Date("2026-10-26T15:00:00Z"),
				lastDailyAt: new Date("2026-10-26T01:40:00Z"),
				criticalSinceLast: 2,
			}),
		).toBe("event");
		expect(isCriticalAction("platform_access.used")).toBe(true);
		expect(isCriticalAction("security_change.applied")).toBe(true);
		expect(isCriticalAction("org.network_reset")).toBe(true);
		expect(isCriticalAction("risk.updated")).toBe(false);
	});
	it("Zeitstempel-Baum wie ots stamp: Prüfsumme, Zufallswert, SHA-256", () => {
		const root = sha(Buffer.from("r"));
		const nonce = Uint8Array.from(new Array(16).fill(7));
		const { file, commitment } = stampTree(root, nonce);
		expect(hex(file.msg)).toBe(sha(Buffer.from(root, "hex")));
		expect(hex(commitment.msg)).toBe(
			sha(Buffer.concat([Buffer.from(file.msg), Buffer.from(nonce)])),
		);
		expect(() => stampTree("xyz", nonce)).toThrow();
	});
});

describe("Kalender-Allowlist", () => {
	it("bekannte Hosts über https, eigene nur außerhalb der Produktion über http", () => {
		const known = "https://alice.btc.calendar.opentimestamps.org";
		expect(calendarAllowed(known, [], true)).toBe(true);
		expect(
			calendarAllowed(
				"http://alice.btc.calendar.opentimestamps.org",
				[],
				false,
			),
		).toBe(false);
		expect(calendarAllowed("https://evil.example", [], false)).toBe(false);
		expect(
			calendarAllowed("https://u:p@a.pool.opentimestamps.org", [], true),
		).toBe(false);
		expect(calendarAllowed(`${known}?x=1`, [], true)).toBe(false);
		const own = "http://127.0.0.1:9999";
		expect(calendarAllowed(own, [own], false)).toBe(true);
		expect(calendarAllowed(own, [own], true)).toBe(false);
		expect(calendarAllowed("not a url", [], false)).toBe(false);
	});
	it("Liste aus der Umgebung, sonst die öffentlichen Pools", () => {
		expect(configuredCalendars(undefined).length).toBeGreaterThanOrEqual(2);
		expect(
			configuredCalendars("https://x.example/, https://y.example"),
		).toEqual(["https://x.example", "https://y.example"]);
	});
});
