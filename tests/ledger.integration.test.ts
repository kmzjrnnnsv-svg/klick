import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { globalDb } from "@/db";
import { ledgerAnchors, ledgerHeads } from "@/db/schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { ledgerExportEntries } from "@/lib/ledger/export";
import {
	addOp,
	hex,
	newTimestamp,
	serializeTimestamp,
	unhex,
} from "@/lib/ledger/ots";
import { anchorNow, upgradePendingAnchors } from "@/lib/ledger/service";
import { ROOT } from "./helpers/walk";

// Integrationstest (DATABASE_URL_TEST): Verlauf mit Bitcoin-Anker (Härtung V)
// gegen einen nachgebauten OpenTimestamps-Kalender. Verankern → Köpfe je Org
// (jede Org sieht nur ihre) → Download → pruefen.mjs stimmig (ausstehend) →
// Upgrade mit Bitcoin-Beglaubigung → bestätigt → Manipulation der Kette
// wird erkannt.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Verlauf mit Bitcoin-Anker (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	const orgs: string[] = [];
	let server: Server;
	let calendar = "";
	let confirmed = false;
	const work = mkdtempSync(join(tmpdir(), "klick-ledger-"));

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		// Kalender-Nachbau: /digest → ausstehend; /timestamp/<c> → 404, nach
		// „Block“ eine Bitcoin-Beglaubigung (Höhe 912345)
		server = createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on("data", (c) => chunks.push(c));
			req.on("end", () => {
				if (req.method === "POST" && req.url === "/digest") {
					const ts = newTimestamp(Uint8Array.from(Buffer.concat(chunks)));
					addOp(addOp(ts, { op: "append", arg: unhex("c0ffee") }), {
						op: "sha256",
					}).attestations.push({ kind: "pending", uri: calendar });
					res.writeHead(200, { "content-type": "application/octet-stream" });
					return res.end(Buffer.from(serializeTimestamp(ts)));
				}
				const m = /^\/timestamp\/([0-9a-f]{64})$/.exec(req.url ?? "");
				if (req.method === "GET" && m) {
					if (!confirmed) {
						res.writeHead(404);
						return res.end("Pending confirmation in Bitcoin blockchain");
					}
					const ts = newTimestamp(unhex(m[1] as string));
					addOp(addOp(ts, { op: "prepend", arg: unhex("ab") }), {
						op: "sha256",
					}).attestations.push({ kind: "bitcoin", height: 912345 });
					res.writeHead(200);
					return res.end(Buffer.from(serializeTimestamp(ts)));
				}
				res.writeHead(400);
				res.end();
			});
		});
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		calendar = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

		for (const name of ["A", "B"]) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Verlauf ${name}`}, ${`ledger-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			orgs.push(org?.id);
			// einige Einträge in der Kette der Org
			for (const i of [1, 2, 3])
				await mutateOrg({ orgId: org?.id, userId: null }, async () => ({
					result: null,
					audit: {
						action: "test.entry",
						target: `test:${i}`,
						after: { i, name, nested: { b: 2, a: [1, "x"] } },
					},
				}));
		}
	});

	afterAll(async () => {
		setKmsForTests(null);
		server?.close();
		rmSync(work, { recursive: true, force: true });
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in ${client(orgs)}`;
		});
		await client.end({ timeout: 5 });
	});

	const exportTo = async (orgId: string, name: string) => {
		const { entries } = await ledgerExportEntries(
			{ orgId, userId: null },
			new Date(),
		);
		const dir = join(work, name);
		for (const e of entries) {
			const path = join(dir, e.name);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, e.data);
		}
		return dir;
	};
	const verify = (dir: string, ...extra: string[]) => {
		const r = spawnSync(
			process.execPath,
			[join(dir, "pruefen.mjs"), dir, ...extra],
			{ encoding: "utf8" },
		);
		return { code: r.status, out: r.stdout + r.stderr };
	};

	let anchorId = "";

	it("verankert alle Ketten; jede Org sieht nur ihren Kopf", async () => {
		const r = await anchorNow("manual", {
			calendars: [calendar],
			nonce: Uint8Array.from(new Array(16).fill(1)),
		});
		expect(r.kind).toBe("anchored");
		if (r.kind !== "anchored") return;
		expect(r.status).toBe("pending");
		anchorId = r.id;
		const [a] = await globalDb
			.select()
			.from(ledgerAnchors)
			.where(eq(ledgerAnchors.id, r.id));
		expect(a?.calendars).toEqual([calendar]);
		expect(a?.ots).toBeTruthy();
		// Org A liest unter RLS nur ihren Kopf
		const seen = await readOrg(
			{ orgId: orgs[0] as string, userId: null },
			(tx) =>
				tx.select().from(ledgerHeads).where(eq(ledgerHeads.anchorId, r.id)),
		);
		expect(seen.map((h) => h.organizationId)).toEqual([orgs[0]]);
		expect(seen[0]?.count).toBe(3);
	});

	it("Download prüfbar ohne Klick: ausstehend, dann Bitcoin-Block", async () => {
		const pending = verify(await exportTo(orgs[0] as string, "a1"));
		expect(pending.code, pending.out).toBe(0);
		expect(pending.out).toContain("3 Einträge, lückenlos verkettet");
		expect(pending.out).toContain("ausstehend");

		// Kalender noch ohne Block: bleibt ausstehend
		expect(
			(await upgradePendingAnchors({ calendars: [calendar] })).confirmed,
		).toBe(0);
		confirmed = true;
		await upgradePendingAnchors({ calendars: [calendar] });
		const [a] = await globalDb
			.select()
			.from(ledgerAnchors)
			.where(eq(ledgerAnchors.id, anchorId));
		expect(a?.status).toBe("confirmed");
		expect(a?.bitcoinHeight).toBe(912345);

		const dir = await exportTo(orgs[0] as string, "a2");
		// ohne eigenen Knoten: stimmig, aber der Block ist nicht abgeglichen (S4)
		const done = verify(dir);
		expect(done.code, done.out).toBe(2);
		expect(done.out).toContain("Bitcoin-Block 912345");
		expect(done.out).toContain(`Merkle-Wurzel ${a?.bitcoinMerkleRoot}`);
		expect(done.out).toContain("nicht geprüft");
		const checked = verify(dir, "--block", `912345:${a?.bitcoinMerkleRoot}`);
		expect(checked.code, checked.out).toBe(0);
		expect(checked.out).toContain("stimmt mit deinem Knoten");
		const wrong = verify(dir, "--block", `912345:${"0".repeat(64)}`);
		expect(wrong.code).toBe(1);
	});

	it("zählt ab dem letzten Anker weiter, Download bleibt stimmig", async () => {
		for (const i of [4, 5])
			await mutateOrg({ orgId: orgs[0] as string, userId: null }, async () => ({
				result: null,
				audit: { action: "test.entry", target: `test:${i}`, after: { i } },
			}));
		const r = await anchorNow("manual", {
			calendars: [calendar],
			nonce: Uint8Array.from(new Array(16).fill(2)),
		});
		expect(r.kind).toBe("anchored");
		if (r.kind !== "anchored") return;
		const seen = await readOrg(
			{ orgId: orgs[0] as string, userId: null },
			(tx) =>
				tx.select().from(ledgerHeads).where(eq(ledgerHeads.anchorId, r.id)),
		);
		expect(seen[0]?.count).toBe(5);
		const out = verify(await exportTo(orgs[0] as string, "a3"));
		expect(out.out).toContain("5 Einträge, lückenlos verkettet");
	});

	it("erkennt eine nachträglich geänderte Kette", async () => {
		const dir = await exportTo(orgs[1] as string, "b1");
		// stimmig, der Bitcoin-Block ist nur nicht abgeglichen
		expect(verify(dir).code).toBe(2);
		const file = join(dir, "kette.jsonl");
		const lines = readFileSync(file, "utf8").split("\n");
		lines[1] = (lines[1] as string).replace('"i":2', '"i":20');
		writeFileSync(file, lines.join("\n"));
		const r = verify(dir);
		expect(r.code).toBe(1);
		expect(r.out).toContain("Inhalt passt nicht zum Hash");
	});

	it("erkennt einen gefälschten Kopf (neu gerechnete Kette)", async () => {
		const dir = await exportTo(orgs[1] as string, "b2");
		const kopfDir = join(dir, "anker");
		const sub = readdirSync(kopfDir)[0] as string;
		const kopfPath = join(kopfDir, sub, "kopf.json");
		const kopf = JSON.parse(readFileSync(kopfPath, "utf8"));
		kopf.head = hex(unhex("00".repeat(32)));
		writeFileSync(kopfPath, JSON.stringify(kopf));
		const r = verify(dir);
		expect(r.code).toBe(1);
	});

	it("pruefen.mjs im Download = scripts/verify-ledger.mjs", async () => {
		const dir = await exportTo(orgs[0] as string, "a3");
		expect(readFileSync(join(dir, "pruefen.mjs"), "utf8")).toBe(
			readFileSync(join(ROOT, "scripts/verify-ledger.mjs"), "utf8"),
		);
	});
});
