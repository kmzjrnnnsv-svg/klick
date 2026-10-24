import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as helloRoute } from "@/app/api/ingest/wallet/hello/route";
import { POST as batchRoute } from "@/app/api/ingest/wallet/route";
import { schema } from "@/db";
import {
	cryptoAccounts,
	cryptoAlerts,
	cryptoBalances,
	cryptoMovements,
	cryptoPayouts,
	incidents,
	keyCeremonies,
	notifications,
	suspiciousReports,
	tasks,
	walletLinks,
	wallets,
} from "@/db/schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { mutateOrg } from "@/lib/db/with-org";
import { newToken } from "@/lib/security/tokens";
import { CONTRACT, CONTRACT_VERSION } from "@/lib/wallet-link/contract";
import {
	createWalletLink,
	revokeWalletLink,
} from "@/lib/wallet-link-ingest/service";

// Integrationstest (DATABASE_URL_TEST): Empfang aus both.money (Plan
// both.money, K3). hello bindet die both.money-Org; jede Ereignisart landet in
// den erwarteten Zeilen; derselbe Stapel noch einmal = nur „doppelt“; gleiche
// ID mit anderem Inhalt = abgelehnt + Meldung; Sanktionstreffer = genau ein
// Verdachtsfall; unbekannte Ausgabe = Vorfall mit Fristen; fremde Org
// unberührt; getrennt = 401.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const head = { contract: CONTRACT, v: CONTRACT_VERSION };
const iso = (s: string) => new Date(s).toISOString();

d("Empfang aus both.money (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	let ownerId = "";
	let linkId = "";
	let token = "";
	const walletOrgId = crypto.randomUUID();
	const walletLinkId = crypto.randomUUID();
	const hotAccount = crypto.randomUUID();
	const coldAccount = crypto.randomUUID();
	const transferId = crypto.randomUUID();
	const payoutId = crypto.randomUUID();
	let seq = 0;

	const inOrg = <T>(
		orgId: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	const post = (
		route: (req: Request) => Promise<Response>,
		path: string,
		body: unknown,
		bearer = token,
	) =>
		route(
			new Request(`http://localhost${path}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${bearer}`,
					"content-type": "application/json",
					"x-real-ip": "10.9.9.9",
				},
				body: JSON.stringify(body),
			}),
		);
	const hello = (over: Record<string, unknown> = {}, bearer = token) =>
		post(
			helloRoute,
			"/api/ingest/wallet/hello",
			{
				...head,
				walletOrgId,
				walletOrgName: "Raza Wallet",
				linkId: walletLinkId,
				sentAt: new Date().toISOString(),
				...over,
			},
			bearer,
		);
	const ev = (type: string, data: unknown, id = crypto.randomUUID()) => {
		seq += 1;
		return {
			id,
			seq,
			type,
			occurredAt: new Date("2026-10-24T10:00:00Z").toISOString(),
			data,
		};
	};
	const send = async (events: unknown[]) => {
		const res = await post(batchRoute, "/api/ingest/wallet", {
			...head,
			walletOrgId,
			linkId: walletLinkId,
			batchId: crypto.randomUUID(),
			sentAt: new Date().toISOString(),
			events,
		});
		return {
			status: res.status,
			json: (await res.json()) as {
				results: { id: string; result: string; code?: string }[];
			},
		};
	};
	const account = (id: string, kind: "hot" | "cold", rev: number) => ({
		account: {
			id,
			name: kind === "hot" ? "Betrieb Hot" : "Reserve Cold",
			network: "bitcoin_signet",
			kind,
			purpose: "own",
			keyFingerprint: "0011aabb",
			firstAddress: "tb1qexampleaddress",
			status: "active",
			createdAt: iso("2026-10-01T08:00:00Z"),
		},
		rev,
	});
	const transfer = (rev: number, status: string) => ({
		transfer: {
			id: transferId,
			accountId: coldAccount,
			network: "bitcoin_signet",
			direction: "in",
			asset: "BTC",
			amount: "150000",
			txid: "ab".repeat(32),
			outputRef: "vout:0",
			address: "tb1qexampleaddress",
			counterparty: null,
			blockHeight: status === "confirmed" ? 1200 : null,
			blockHash: status === "confirmed" ? "cd".repeat(32) : null,
			blockTime: null,
			confirmations: status === "confirmed" ? 6 : 0,
			status,
			screening: "clear",
			frozen: false,
			payoutId: null,
			firstSeenAt: iso("2026-10-24T09:00:00Z"),
			confirmedAt: status === "confirmed" ? iso("2026-10-24T09:30:00Z") : null,
		},
		rev,
	});
	const alert = (alertId: string, code: string, title: string) => ({
		alertId,
		code,
		severity: code === "manual_stop" ? "high" : "critical",
		title,
		detail: `${title} (Test)`,
		subject: { kind: "account", id: hotAccount },
		raisedAt: iso("2026-10-24T10:05:00Z"),
	});

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Olga Owner', ${`wl-owner-${stamp}@example.org`}, true, now(), now()) returning id`;
		ownerId = u?.id;
		for (const name of ["A", "B"]) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Krypto ${name}`}, ${`krypto-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			if (name === "A") orgA = org?.id;
			else orgB = org?.id;
		}
		await client`insert into member (organization_id, user_id, role, created_at)
			values (${orgA}, ${ownerId}, 'owner', now())`;
		const created = await mutateOrg(
			{ orgId: orgA, userId: ownerId },
			async (tx) => {
				const r = await createWalletLink(
					tx,
					{ orgId: orgA, userId: ownerId },
					{ name: "both.money" },
				);
				return { result: r, audit: r.audit };
			},
		);
		linkId = created.linkId;
		token = created.token;
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in (${orgA}, ${orgB})`;
		});
		await client`delete from "user" where id = ${ownerId}`;
		await client.end({ timeout: 5 });
	});

	it("hello: ohne oder mit fremdem Token 401, sonst gebunden", async () => {
		expect((await hello({}, "klk_wallet_kurz")).status).toBe(401);
		expect((await hello({}, newToken("ingest").token)).status).toBe(401);
		expect((await hello({}, newToken("wallet").token)).status).toBe(401);
		const res = await hello();
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			klickOrg: { name: string };
			linkRef: string;
			lastSeq: number | null;
		};
		expect(body.klickOrg.name).toBe("Krypto A");
		expect(body.linkRef).toBe(linkId);
		expect(body.lastSeq).toBeNull();
		const [l] = await inOrg(orgA, (tx) =>
			tx.select().from(walletLinks).where(eq(walletLinks.id, linkId)),
		);
		expect(l?.walletOrgId).toBe(walletOrgId);
		expect(l?.walletLinkId).toBe(walletLinkId);
	});

	it("hello einer anderen both.money-Org: 403", async () => {
		const res = await hello({ walletOrgId: crypto.randomUUID() });
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ error: "wallet_org_mismatch" });
	});

	let firstBatch: unknown[] = [];
	it("jede Ereignisart landet in den erwarteten Zeilen", async () => {
		firstBatch = [
			ev("org.updated", {
				org: { id: walletOrgId, name: "Raza Wallet", slug: "raza" },
				custodyMode: "own",
				isOperator: true,
				caspLicenceRef: null,
				rev: 1,
			}),
			ev("account.upserted", account(hotAccount, "hot", 2)),
			ev("account.upserted", account(coldAccount, "cold", 3)),
			ev("transfer.upserted", transfer(4, "pending")),
			ev("payout.upserted", {
				payout: {
					id: payoutId,
					accountId: hotAccount,
					network: "bitcoin_signet",
					asset: "BTC",
					amount: "50000",
					destination: "tb1qdestination",
					destinationLabel: "Lieferant",
					speed: "normal",
					status: "confirmed",
					intentId: "intent-1",
					feeCap: "2000",
					fee: "800",
					txid: "ef".repeat(32),
					txids: ["ef".repeat(32)],
					createdAt: iso("2026-10-24T08:00:00Z"),
					approvedAt: iso("2026-10-24T08:05:00Z"),
					signedAt: iso("2026-10-24T08:06:00Z"),
					broadcastAt: iso("2026-10-24T08:06:10Z"),
					confirmedAt: iso("2026-10-24T08:30:00Z"),
				},
				rev: 5,
			}),
			ev("destination.upserted", {
				destination: {
					id: crypto.randomUUID(),
					network: "bitcoin_signet",
					address: "tb1qdestination",
					label: "Lieferant",
					status: "active",
					screening: "clear",
					approvedAt: iso("2026-10-20T08:00:00Z"),
					activeFrom: iso("2026-10-21T08:00:00Z"),
					vetoedAt: null,
					vetoReason: null,
					createdAt: iso("2026-10-20T07:00:00Z"),
				},
				rev: 6,
			}),
			ev("ceremony.recorded", {
				recordedAt: iso("2026-10-24T07:00:00Z"),
				reason: "initialised",
				policy: { version: 1, mode: "four_eyes", hash: "aa".repeat(32) },
				keys: { active: 3, persons: 2 },
				networks: ["bitcoin_signet"],
				fingerprints: { bitcoin_signet: "0011aabb" },
			}),
			ev("day.closed", {
				date: "2026-10-23",
				timeZone: "Europe/Berlin",
				closedAt: iso("2026-10-23T22:10:00Z"),
				accounts: [
					{
						accountId: coldAccount,
						network: "bitcoin_signet",
						balances: { BTC: { confirmed: "150000", pending: "0" } },
						height: 1199,
						hash: "cd".repeat(32),
						at: iso("2026-10-23T22:09:00Z"),
						frozen: {},
					},
				],
				screening: { clear: 1, hit: 0, unchecked: 0 },
			}),
			ev("screening.list_updated", {
				source: "ofac",
				listVersion: "2026-10-23",
				total: 412,
				importedAt: iso("2026-10-23T06:00:00Z"),
			}),
			ev("heartbeat", {
				at: iso("2026-10-24T10:00:00Z"),
				signer: "ready",
				nodes: [
					{
						network: "bitcoin_signet",
						height: 1200,
						syncedAt: iso("2026-10-24T09:59:00Z"),
					},
				],
				pending: 0,
			}),
			ev("future.thing", { x: 1 }),
			ev("transfer.upserted", { transfer: { id: "kaputt" }, rev: 7 }),
		];
		const { status, json } = await send(firstBatch);
		expect(status).toBe(200);
		expect(json.results.map((r) => r.result)).toEqual([
			...Array(10).fill("accepted"),
			"ignored",
			"rejected",
		]);
		expect(json.results.at(-1)?.code).toBe("invalid");

		await inOrg(orgA, async (tx) => {
			const accs = await tx.select().from(cryptoAccounts);
			expect(accs).toHaveLength(2);
			const reg = await tx.select().from(wallets);
			expect(reg.map((w) => w.code).sort()).toEqual(["W-01", "W-02"]);
			const hot = reg.find((w) => w.kind === "hot");
			expect(hot?.quorumRequired).toBe(2);
			expect(hot?.quorumTotal).toBe(2);
			expect(hot?.lastCeremonyAt).toBe("2026-10-24");
			const cer = await tx.select().from(keyCeremonies);
			expect(cer).toHaveLength(1);
			expect(cer[0]?.kind).toBe("generation");
			const mov = await tx.select().from(cryptoMovements);
			expect(mov).toHaveLength(1);
			expect(mov[0]?.status).toBe("pending");
			expect(await tx.select().from(cryptoPayouts)).toHaveLength(1);
			const bal = await tx.select().from(cryptoBalances);
			expect(bal[0]?.day).toBe("2026-10-23");
			const [l] = await tx
				.select()
				.from(walletLinks)
				.where(eq(walletLinks.id, linkId));
			expect(l?.custodyMode).toBe("own");
			expect(l?.sanctionsList?.total).toBe(412);
			expect(l?.heartbeat?.signer).toBe("ready");
			expect(l?.lastDayClosed).toBe("2026-10-23");
			expect(l?.lastSeq).toBe(10);
		});
	});

	it("derselbe Stapel noch einmal: nur doppelt, keine neuen Zeilen", async () => {
		const { json } = await send(firstBatch);
		expect(json.results.map((r) => r.result)).toEqual([
			...Array(10).fill("duplicate"),
			"ignored",
			"rejected",
		]);
		await inOrg(orgA, async (tx) => {
			expect(await tx.select().from(wallets)).toHaveLength(2);
			expect(await tx.select().from(keyCeremonies)).toHaveLength(1);
		});
	});

	it("gleiche ID, anderer Inhalt: abgelehnt mit Meldung", async () => {
		const first = firstBatch[3] as { id: string; seq: number };
		const changed = {
			...first,
			data: transfer(4, "confirmed"),
		};
		const { json } = await send([changed]);
		expect(json.results[0]).toEqual({
			id: first.id,
			result: "rejected",
			code: "hash_mismatch",
		});
		const n = await inOrg(orgA, (tx) =>
			tx
				.select({ title: notifications.title })
				.from(notifications)
				.where(eq(notifications.kind, "security_alert")),
		);
		expect(n.map((x) => x.title)).toContain(
			"both.money: Ereignis mit gleicher ID, aber anderem Inhalt",
		);
	});

	it("neuere Fassung gewinnt, ältere überschreibt nicht", async () => {
		await send([ev("transfer.upserted", transfer(20, "confirmed"))]);
		await send([ev("transfer.upserted", transfer(15, "pending"))]);
		const [m] = await inOrg(orgA, (tx) => tx.select().from(cryptoMovements));
		expect(m?.status).toBe("confirmed");
		expect(m?.rev).toBe(20);
	});

	it("Hinweise: Vorfall, genau ein Verdachtsfall + Aufgabe, Aufgabe", async () => {
		const { json } = await send([
			ev(
				"alert.raised",
				alert("spend-1", "unknown_spend", "Ausgabe ohne Auszahlung"),
			),
			ev("alert.raised", alert("sanc-1", "sanctions_hit", "Sanktionstreffer")),
			ev("alert.raised", alert("stop-1", "manual_stop", "Alles stoppen")),
			// gleicher Hinweis noch einmal (neues Ereignis): keine zweite Wirkung
			ev("alert.raised", alert("sanc-1", "sanctions_hit", "Sanktionstreffer")),
			ev("alert.resolved", {
				alertId: "spend-1",
				code: "unknown_spend",
				resolvedAt: iso("2026-10-24T11:00:00Z"),
				note: null,
			}),
		]);
		expect(json.results.every((r) => r.result === "accepted")).toBe(true);
		await inOrg(orgA, async (tx) => {
			const inc = await tx.select().from(incidents);
			expect(inc).toHaveLength(1);
			expect(inc[0]?.title).toContain("both.money");
			expect(inc[0]?.initialDueAt).not.toBeNull();
			expect(inc[0]?.ownerUserId).toBe(ownerId);
			expect(inc[0]?.status).not.toBe("closed");
			const sar = await tx.select().from(suspiciousReports);
			expect(sar).toHaveLength(1);
			expect(sar[0]?.kind).toBe("gwg_sar");
			const al = await tx.select().from(cryptoAlerts);
			expect(al).toHaveLength(3);
			expect(
				al.find((a) => a.alertId === "spend-1")?.resolvedAt,
			).not.toBeNull();
			const sanc = al.find((a) => a.alertId === "sanc-1");
			expect(sanc?.effect).toBe("suspicious_report");
			expect(sanc?.taskId).not.toBeNull();
			const stop = al.find((a) => a.alertId === "stop-1");
			expect(stop?.effect).toBe("task");
			const [t] = await tx
				.select()
				.from(tasks)
				.where(eq(tasks.id, stop?.effectId as string));
			expect(t?.priority).toBe("high");
			expect(t?.entityType).toBe("wallet");
		});
	});

	it("fremde Org bleibt unberührt", async () => {
		await inOrg(orgB, async (tx) => {
			for (const t of [
				walletLinks,
				cryptoAccounts,
				cryptoMovements,
				cryptoAlerts,
				wallets,
				incidents,
			])
				expect(await tx.select().from(t)).toEqual([]);
		});
	});

	it("getrennt: Token gilt nicht mehr", async () => {
		await mutateOrg({ orgId: orgA, userId: ownerId }, async (tx) => {
			const a = await revokeWalletLink(
				tx,
				{ orgId: orgA, userId: ownerId },
				linkId,
			);
			return { result: undefined, audit: a ?? [] };
		});
		expect((await hello()).status).toBe(401);
		const [l] = await inOrg(orgA, (tx) =>
			tx
				.select({ status: walletLinks.status })
				.from(walletLinks)
				.where(and(eq(walletLinks.id, linkId))),
		);
		expect(l?.status).toBe("revoked");
	});
});
