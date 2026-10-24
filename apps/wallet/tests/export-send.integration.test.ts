import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import {
	exportOutbox,
	klickLinks,
	notifications,
	orgs,
	walletAccounts,
	walletTransfers,
} from "@wallet/db/schema";
import { readOrg, withOrg, withPlatform } from "@wallet/lib/db/with-org";
import {
	createLink,
	renewLinkToken,
	setLinkState,
} from "@wallet/lib/export/link-service";
import { closeDay } from "@wallet/lib/export/periodic";
import { runKlickExport } from "@wallet/lib/jobs/klick-export";
import { createOrg } from "@wallet/lib/orgs/service";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	batch,
	CONTRACT,
	CONTRACT_VERSION,
	eventHash,
	helloRequest,
	parseEventData,
} from "@/lib/wallet-link/contract";

// Ausgang gegen ein Klick-Double (Plan both.money, W4c): hello vor dem
// Speichern, Token nur verschlüsselt, Nachlieferung, Reihenfolge, doppelt
// gesendet = „duplicate“, Teil-Ablehnung, 500 = Wiederholung mit Abstand,
// 401 = pausiert, Token erneuern, Konten-Auswahl, Trennen.
const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;

type Received = { id: string; seq: number; type: string; data: unknown };

class KlickDouble {
	server: Server;
	origin = "";
	tokens = new Set<string>();
	mode: "ok" | "500" = "ok";
	rejectTypes = new Set<string>();
	received: Received[] = [];
	hashes = new Map<string, string>();
	hellos: unknown[] = [];
	batches = 0;

	constructor(readonly linkRef: string) {
		this.server = createServer((req, res) => {
			void this.handle(req).then(({ status, body }) => {
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify(body));
			});
		});
	}

	async start() {
		await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
		const { port } = this.server.address() as AddressInfo;
		this.origin = `http://127.0.0.1:${port}`;
	}

	stop() {
		return new Promise<void>((r) => this.server.close(() => r()));
	}

	private async handle(
		req: IncomingMessage,
	): Promise<{ status: number; body: unknown }> {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		const auth = req.headers.authorization ?? "";
		if (!this.tokens.has(auth.replace(/^Bearer /, "")))
			return { status: 401, body: { error: "unauthorized" } };
		if (this.mode === "500") return { status: 500, body: { error: "x" } };
		const head = { contract: CONTRACT, v: CONTRACT_VERSION };
		if (req.url === "/api/ingest/wallet/hello") {
			this.hellos.push(helloRequest.parse(json));
			return {
				status: 200,
				body: {
					...head,
					klickOrg: { name: "Klick Test GmbH" },
					linkRef: this.linkRef,
					lastSeq: null,
					expiresAt: "2027-10-24T00:00:00.000Z",
				},
			};
		}
		const b = batch.parse(json);
		this.batches += 1;
		const results = b.events.map((e) => {
			const hash = eventHash(e);
			const known = this.hashes.get(e.id);
			if (known)
				return known === hash
					? { id: e.id, result: "duplicate" }
					: { id: e.id, result: "rejected", code: "hash_mismatch" };
			if (this.rejectTypes.has(e.type))
				return { id: e.id, result: "rejected", code: "test_reject" };
			const parsed = parseEventData(e);
			if (!parsed.ok)
				return parsed.reason === "unknown_type"
					? { id: e.id, result: "ignored" }
					: { id: e.id, result: "rejected", code: "invalid" };
			this.hashes.set(e.id, hash);
			this.received.push({
				id: e.id,
				seq: e.seq,
				type: e.type,
				data: e.data,
			});
			return { id: e.id, result: "accepted" };
		});
		return { status: 200, body: { ...head, batchId: b.batchId, results } };
	}
}

const token = (c: string) => `klk_wallet_${c.repeat(43)}`;

d("Export nach Klick: Senden", () => {
	const stamp = Date.now();
	let orgId = "";
	let userId = "";
	const klick = new KlickDouble("wl-eins");
	const second = new KlickDouble("wl-zwei");
	let origins: string[] = [];
	let linkId = "";
	let accountA = "";
	const t0 = new Date("2026-10-24T10:00:00Z");
	const ctx = () => ({ orgId, userId });
	const sys = () => ({ orgId, userId: null });
	const run = (now = t0) => runKlickExport({ orgIds: [orgId], origins, now });
	const link = async (id = linkId) =>
		(
			await readOrg(sys(), (tx) =>
				tx.select().from(klickLinks).where(eq(klickLinks.id, id)),
			)
		)[0];
	const insertAccount = (name: string) =>
		withOrg(sys(), async (tx) => {
			const [a] = await tx
				.insert(walletAccounts)
				.values({
					organizationId: orgId,
					name,
					network: "bitcoin_signet",
					kind: "cold",
					accountKey: `tpub-${name}-${stamp}`,
					keyFingerprint: "0011aabb",
				})
				.returning({ id: walletAccounts.id });
			return a?.id as string;
		});
	let txCount = 0;
	const insertTransfer = (accountId: string) =>
		withOrg(sys(), async (tx) => {
			txCount += 1;
			const [t] = await tx
				.insert(walletTransfers)
				.values({
					organizationId: orgId,
					accountId,
					direction: "in",
					asset: "BTC",
					amount: `${1000 * txCount}`,
					txid: txCount.toString(16).padStart(64, "0"),
					outputRef: "vout:0",
					address: "tb1qexample",
					screening: "clear",
				})
				.returning({ id: walletTransfers.id });
			return t?.id as string;
		});
	const ownerNotes = () =>
		readOrg(ctx(), (tx) =>
			tx
				.select({ title: notifications.title })
				.from(notifications)
				.where(
					and(
						eq(notifications.userId, userId),
						eq(notifications.kind, "export"),
					),
				),
		);

	beforeAll(async () => {
		await klick.start();
		await second.start();
		origins = [klick.origin, second.origin];
		klick.tokens.add(token("A"));
		second.tokens.add(token("Z"));
		const [u] = await db
			.insert(user)
			.values({ name: "Ada", email: `send-${stamp}@example.org` })
			.returning({ id: user.id });
		userId = u?.id ?? "";
		orgId = (
			await createOrg(
				{ userId: null, reason: "Test: Export senden" },
				{
					name: "Senden GmbH",
					slug: `senden-${stamp}`,
					isOperator: true,
					owner: { userId },
				},
			)
		).id;
		accountA = await insertAccount("a");
		await insertTransfer(accountA);
	});

	afterAll(async () => {
		await klick.stop();
		await second.stop();
		if (orgId)
			await withPlatform({ userId: null, reason: "Test aufräumen" }, (tx) =>
				tx.delete(orgs).where(eq(orgs.id, orgId)),
			);
		if (userId) await db.delete(user).where(eq(user.id, userId));
	});

	const input = (over: Partial<Parameters<typeof createLink>[1]> = {}) => ({
		origin: klick.origin,
		token: token("A"),
		accountIds: null,
		backfillFrom: null,
		...over,
	});

	it("fremde Herkunft und falsches Token: nichts gespeichert", async () => {
		expect(
			await createLink(ctx(), input({ origin: "https://evil.example" }), {
				origins,
			}),
		).toEqual({ ok: false, error: "origin_not_allowed" });
		expect(
			await createLink(ctx(), input({ token: token("B") }), { origins }),
		).toEqual({ ok: false, error: "token_invalid" });
		const rows = await readOrg(sys(), (tx) => tx.select().from(klickLinks));
		expect(rows).toEqual([]);
	});

	it("anlegen: hello, Token verschlüsselt, Nachlieferung, Senden in Reihenfolge", async () => {
		const res = await createLink(ctx(), input(), { origins, now: t0 });
		if (!res.ok) throw new Error(res.error);
		linkId = res.data.linkId;
		expect(res.data.klickOrgName).toBe("Klick Test GmbH");
		expect(klick.hellos).toHaveLength(1);
		const l = await link();
		expect(l?.tokenEnc).not.toContain("AAAA");
		expect(l?.tokenHint).toBe("…AAAA");
		expect(l?.linkRef).toBe("wl-eins");
		expect(l?.backfilledAt).not.toBeNull();
		const scoped = await readOrg(sys(), (tx) =>
			tx
				.select({ type: exportOutbox.type })
				.from(exportOutbox)
				.where(eq(exportOutbox.linkId, linkId)),
		);
		expect(scoped.map((e) => e.type).sort()).toEqual([
			"account.upserted",
			"org.updated",
			"transfer.upserted",
		]);

		const r = await run();
		expect(r.failed).toBe(0);
		const types = klick.received.map((e) => e.type);
		expect(types).toContain("org.updated");
		expect(types).toContain("transfer.upserted");
		const seqs = klick.received.map((e) => e.seq);
		expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
		expect((await link())?.ackedSeq).toBe(seqs.at(-1));
		expect((await link())?.lastSuccessAt).not.toBeNull();

		const again = await run();
		expect(again.sent).toBe(0);
	});

	it("neue Bewegung nach dem Verbinden geht mit", async () => {
		const id = await insertTransfer(accountA);
		await run();
		const t = klick.received.find(
			(e) =>
				e.type === "transfer.upserted" &&
				(e.data as { transfer: { id: string } }).transfer.id === id,
		);
		expect(t).toBeTruthy();
	});

	it("verlorene Antwort: erneut gesendet = duplicate, kein Fehler", async () => {
		const before = (await link())?.ackedSeq ?? 0;
		const accepted = klick.received.length;
		await withOrg(sys(), (tx) =>
			tx
				.update(klickLinks)
				.set({ ackedSeq: before - 2 })
				.where(eq(klickLinks.id, linkId)),
		);
		const r = await run();
		expect(r.sent).toBe(2);
		expect(klick.received).toHaveLength(accepted);
		const l = await link();
		expect(l?.ackedSeq).toBe(before);
		expect(l?.rejected ?? []).toEqual([]);
	});

	it("Teil-Ablehnung: in der Liste, Inhaber:in benachrichtigt, Stand rückt vor", async () => {
		klick.rejectTypes.add("account.upserted");
		await insertAccount("b");
		await run();
		klick.rejectTypes.clear();
		const l = await link();
		expect(l?.rejected).toHaveLength(1);
		expect(l?.rejected?.[0]).toMatchObject({
			type: "account.upserted",
			code: "test_reject",
		});
		expect((await ownerNotes()).map((n) => n.title)).toContain(
			"Klick hat 1 Ereignis abgelehnt",
		);
		expect((await run()).sent).toBe(0);
	});

	it("500: Wiederholung mit wachsendem Abstand, dann weiter", async () => {
		klick.mode = "500";
		await insertTransfer(accountA);
		await run(t0);
		let l = await link();
		expect(l?.attempts).toBe(1);
		expect(l?.lastError).toBe("HTTP 500");
		expect(l?.nextAttemptAt?.getTime()).toBe(t0.getTime() + 60_000);
		klick.mode = "ok";
		const early = await run(new Date(t0.getTime() + 30_000));
		expect(early.sent).toBe(0);
		const later = await run(new Date(t0.getTime() + 61_000));
		expect(later.sent).toBeGreaterThan(0);
		l = await link();
		expect(l?.attempts).toBe(0);
		expect(l?.lastError).toBeNull();
	});

	it("401: pausiert mit Hinweis, neues Token setzt fort", async () => {
		klick.tokens.clear();
		await insertTransfer(accountA);
		await run();
		const l = await link();
		expect(l?.status).toBe("paused");
		expect(l?.pausedReason).toBe("unauthorized");
		expect((await ownerNotes()).map((n) => n.title)).toContain(
			"Compliance-Export pausiert",
		);
		klick.tokens.add(token("C"));
		const renewed = await renewLinkToken(ctx(), linkId, token("C"), {
			origins,
		});
		expect(renewed).toEqual({ ok: true, data: undefined });
		expect((await link())?.tokenHint).toBe("…CCCC");
		const r = await run();
		expect(r.sent).toBeGreaterThan(0);
		expect((await link())?.status).toBe("active");
	});

	it("Konten-Auswahl: andere Konten bleiben draußen, Tagesabschluss gekürzt", async () => {
		const res = await createLink(
			ctx(),
			input({
				origin: second.origin,
				token: token("Z"),
				accountIds: [accountA],
			}),
			{ origins, now: t0 },
		);
		if (!res.ok) throw new Error(res.error);
		const accountC = await insertAccount("c");
		await insertTransfer(accountC);
		await insertTransfer(accountA);
		await withOrg(sys(), (tx) =>
			closeDay(tx, orgId, new Date("2026-10-24T22:10:00Z")),
		);
		await run();
		const ids = (e: Received) =>
			JSON.stringify(e.data).includes(accountC) ? "C" : "-";
		expect(second.received.map(ids)).not.toContain("C");
		expect(klick.received.map(ids)).toContain("C");
		const day = second.received.find((e) => e.type === "day.closed");
		expect(
			(day?.data as { accounts: { accountId: string }[] }).accounts.map(
				(a) => a.accountId,
			),
		).toEqual([accountA]);
		const l = await link(res.data.linkId);
		expect(l?.ackedSeq).toBe((await link())?.ackedSeq);
	});

	it("pausieren und trennen: nichts mehr gesendet", async () => {
		expect(await setLinkState(ctx(), linkId, "pause")).toEqual({
			ok: true,
			data: undefined,
		});
		const n = klick.batches;
		await insertTransfer(accountA);
		await run();
		expect(klick.batches).toBe(n);
		expect(await setLinkState(ctx(), linkId, "revoke")).toEqual({
			ok: true,
			data: undefined,
		});
		expect(await setLinkState(ctx(), linkId, "resume")).toEqual({
			ok: false,
			error: "not_found",
		});
		await run();
		expect(klick.batches).toBe(n);
	});
});
