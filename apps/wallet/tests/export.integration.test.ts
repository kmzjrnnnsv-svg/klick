import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import {
	exportAlerts,
	exportChanges,
	exportOutbox,
	klickLinks,
	orgs,
	walletAccounts,
	walletSignerAnchor,
	walletTransfers,
} from "@wallet/db/schema";
import {
	mutateOrg,
	readOrg,
	withOrg,
	withPlatform,
} from "@wallet/lib/db/with-org";
import { convertChanges } from "@wallet/lib/export/convert";
import {
	closeDay,
	heartbeatIfDue,
	pruneOutbox,
} from "@wallet/lib/export/periodic";
import { createOrg } from "@wallet/lib/orgs/service";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventHash, parseEventData } from "@/lib/wallet-link/contract";

// Ausgang nach Klick (Plan both.money, W4b): Trigger vermerken Änderungen
// in derselben Transaktion (Rollback = nichts), die Umwandlung schreibt
// Ereignisse mit steigender seq, Auffälligkeiten kommen aus dem Protokoll und
// aus dem Signer-Stand, Tagesabschluss und Lebenszeichen sind gültig.
const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;

d("Export nach Klick: Ausgang", () => {
	const stamp = Date.now();
	let orgId = "";
	let userId = "";
	const ctx = () => ({ orgId, userId: null });
	const changes = () =>
		readOrg(ctx(), (tx) =>
			tx
				.select({ entity: exportChanges.entity })
				.from(exportChanges)
				.orderBy(asc(exportChanges.id)),
		);
	const outbox = () =>
		readOrg(ctx(), (tx) =>
			tx.select().from(exportOutbox).orderBy(asc(exportOutbox.seq)),
		);
	const insertAccount = (name: string) =>
		withOrg(ctx(), async (tx) => {
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

	beforeAll(async () => {
		const [u] = await db
			.insert(user)
			.values({ name: "Ada", email: `export-${stamp}@example.org` })
			.returning({ id: user.id });
		userId = u?.id ?? "";
		orgId = (
			await createOrg(
				{ userId: null, reason: "Test: Export" },
				{
					name: "Export GmbH",
					slug: `export-${stamp}`,
					isOperator: true,
					owner: { userId },
				},
			)
		).id;
	});

	afterAll(async () => {
		if (orgId)
			await withPlatform({ userId: null, reason: "Test aufräumen" }, (tx) =>
				tx.delete(orgs).where(eq(orgs.id, orgId)),
			);
		if (userId) await db.delete(user).where(eq(user.id, userId));
	});

	it("ohne Verbindung wird nichts vermerkt", async () => {
		await insertAccount("ohne");
		expect(await changes()).toEqual([]);
	});

	it("mit Verbindung: Änderung vermerkt, Rollback lässt nichts zurück", async () => {
		await withOrg(ctx(), (tx) =>
			tx.insert(klickLinks).values({
				organizationId: orgId,
				origin: "https://raza.work",
				tokenEnc: "enc1:test",
				tokenHint: "abcd",
			}),
		);
		const accountId = await insertAccount("mit");
		expect(await changes()).toEqual([{ entity: "account" }]);
		await expect(
			withOrg(ctx(), async (tx) => {
				await tx
					.update(walletAccounts)
					.set({ name: "umbenannt" })
					.where(eq(walletAccounts.id, accountId));
				throw new Error("abbrechen");
			}),
		).rejects.toThrow("abbrechen");
		expect(await changes()).toHaveLength(1);

		// Bewegung: neue Bestätigung allein löst nichts aus, Status schon
		const transferId = await withOrg(ctx(), async (tx) => {
			const [t] = await tx
				.insert(walletTransfers)
				.values({
					organizationId: orgId,
					accountId,
					direction: "in",
					asset: "BTC",
					amount: "150000",
					txid: "ab".repeat(32),
					outputRef: "vout:0",
					address: "tb1qexample",
					screening: "clear",
				})
				.returning({ id: walletTransfers.id });
			return t?.id as string;
		});
		await withOrg(ctx(), (tx) =>
			tx
				.update(walletTransfers)
				.set({ confirmations: 3 })
				.where(eq(walletTransfers.id, transferId)),
		);
		expect((await changes()).map((c) => c.entity)).toEqual([
			"account",
			"transfer",
		]);
		await withOrg(ctx(), (tx) =>
			tx
				.update(walletTransfers)
				.set({ status: "confirmed", blockHeight: 120, confirmedAt: new Date() })
				.where(eq(walletTransfers.id, transferId)),
		);
		expect(await changes()).toHaveLength(3);
	});

	it("Umwandlung: je Entität ein Ereignis mit letztem Stand, seq steigt", async () => {
		const r = await withOrg(ctx(), (tx) => convertChanges(tx, orgId));
		expect(r.events).toBe(2);
		expect(await changes()).toEqual([]);
		const events = await outbox();
		expect(events.map((e) => e.type)).toEqual([
			"account.upserted",
			"transfer.upserted",
		]);
		expect(events.map((e) => e.seq)).toEqual([1, 2]);
		for (const e of events) {
			const raw = {
				id: e.id,
				seq: e.seq,
				type: e.type,
				occurredAt: e.occurredAt.toISOString(),
				data: e.data,
			};
			expect(parseEventData(raw).ok).toBe(true);
			expect(eventHash(raw)).toBe(e.hash);
		}
		const transfer = events[1]?.data as {
			transfer: { status: string; blockHeight: number };
			rev: number;
		};
		expect(transfer.transfer.status).toBe("confirmed");
		expect(transfer.transfer.blockHeight).toBe(120);
		expect(transfer.rev).toBe(2);
		expect(JSON.stringify(events)).not.toContain("tpub-");
	});

	it("Auffälligkeiten aus dem Protokoll und aus dem Signer-Stand", async () => {
		const [account] = await readOrg(ctx(), (tx) =>
			tx.select({ id: walletAccounts.id }).from(walletAccounts).limit(1),
		);
		await mutateOrg(ctx(), async () => ({
			result: null,
			audit: {
				action: "wallet.unknown_spend",
				target: `wallet_account:${account?.id}`,
				after: { txid: "cd".repeat(32), signerFrozen: true },
			},
		}));
		await mutateOrg(ctx(), async (tx) => {
			await tx.insert(walletSignerAnchor).values({
				organizationId: orgId,
				seq: 3,
				head: "00",
				frozen: true,
				frozenReason: "Notfallübung",
			});
			return {
				result: null,
				audit: {
					action: "wallet.signer_frozen",
					target: `wallet_signer:${orgId}`,
					after: { reason: "Notfallübung", by: "app" },
				},
			};
		});
		await withOrg(ctx(), (tx) => convertChanges(tx, orgId));
		let alerts = (await outbox()).filter((e) => e.type.startsWith("alert."));
		expect(alerts.map((e) => (e.data as { code: string }).code).sort()).toEqual(
			["manual_stop", "unknown_spend"],
		);
		// zweiter Lauf ändert nichts
		await withOrg(ctx(), (tx) => convertChanges(tx, orgId));
		expect(
			(await outbox()).filter((e) => e.type.startsWith("alert.")),
		).toHaveLength(2);
		// aufgetaut → erledigt
		await withOrg(ctx(), (tx) =>
			tx
				.update(walletSignerAnchor)
				.set({ frozen: false, frozenReason: null })
				.where(eq(walletSignerAnchor.organizationId, orgId)),
		);
		await withOrg(ctx(), (tx) => convertChanges(tx, orgId));
		alerts = (await outbox()).filter((e) => e.type === "alert.resolved");
		expect(alerts.map((e) => (e.data as { code: string }).code)).toEqual([
			"manual_stop",
		]);
		const open = await readOrg(ctx(), (tx) => tx.select().from(exportAlerts));
		expect(open.filter((a) => !a.resolvedAt).map((a) => a.code)).toEqual([
			"unknown_spend",
		]);
	});

	it("Tagesabschluss und Lebenszeichen", async () => {
		const at = new Date("2026-10-23T22:10:00Z");
		expect(await withOrg(ctx(), (tx) => closeDay(tx, orgId, at))).toBe(true);
		expect(
			await withOrg(ctx(), (tx) => heartbeatIfDue(tx, orgId, "ready", at)),
		).toBe(true);
		expect(
			await withOrg(ctx(), (tx) =>
				heartbeatIfDue(tx, orgId, "ready", new Date(at.getTime() + 60_000)),
			),
		).toBe(false);
		const events = await outbox();
		const day = events.find((e) => e.type === "day.closed");
		const beat = events.find((e) => e.type === "heartbeat");
		for (const e of [day, beat]) {
			if (!e) throw new Error("fehlt");
			expect(
				parseEventData({
					id: e.id,
					seq: e.seq,
					type: e.type,
					occurredAt: e.occurredAt.toISOString(),
					data: e.data,
				}).ok,
			).toBe(true);
		}
		expect((day?.data as { date: string }).date).toBe("2026-10-23");
		const seqs = events.map((e) => e.seq);
		expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
		expect(new Set(seqs).size).toBe(seqs.length);
	});

	it("Aufräumen: nur bestätigte Ereignisse, erst nach 30 Tagen", async () => {
		const before = (await outbox()).length;
		await withOrg(ctx(), (tx) =>
			tx
				.update(klickLinks)
				.set({ ackedSeq: 2 })
				.where(eq(klickLinks.organizationId, orgId)),
		);
		await withOrg(ctx(), (tx) => pruneOutbox(tx, orgId, new Date()));
		expect(await outbox()).toHaveLength(before);
		const later = new Date(Date.now() + 31 * 86_400_000);
		await withOrg(ctx(), (tx) => pruneOutbox(tx, orgId, later));
		const left = await outbox();
		expect(left).toHaveLength(before - 2);
		expect(Math.min(...left.map((e) => e.seq))).toBe(3);
	});
});
