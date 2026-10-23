import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { addr } from "micro-eth-signer";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	auditLog,
	walletAccounts,
	walletAddressBook,
	walletAddresses,
	walletPayouts,
	walletTransfers,
} from "@/db/schema";
import type { PayoutSpeed } from "@/db/schema/wallet";
import type { OrgTx } from "@/lib/db/with-org";
import { runWalletPayouts } from "@/lib/jobs/wallet-payouts";
import { runWalletSync } from "@/lib/jobs/wallet-sync";
import type { AssetCode } from "@/lib/wallet/core/assets";
import { deriveAddress, parseAccountKey } from "@/lib/wallet/core/derive";
import type { WalletNetwork } from "@/lib/wallet/core/networks";
import type { Policy } from "@/lib/wallet/core/policy";
import type { NodeClients } from "@/lib/wallet/node-clients";
import {
	addressIndex,
	btcCapForPayout,
	ethCapForPayout,
	excludedOutpoints,
} from "@/lib/wallet/payouts/build";
import { BitcoinRpc } from "@/lib/wallet/rpc/bitcoin";
import { EthereumRpc } from "@/lib/wallet/rpc/ethereum";
import { endpointFrom } from "@/lib/wallet/rpc/http";
import { recordAnchor } from "@/lib/wallet/signer/anchor";
import { resetSignerCache } from "@/lib/wallet/signer/status";
import { type Devchain, startDevchain } from "@/scripts/devchain/server";
import { callSigner } from "@/signer/client";
import { startSignerServer } from "@/signer/server";
import { Signer } from "@/signer/service";
import { SoftSecurityKey } from "./helpers/security-key";

// Integrationstest (DATABASE_URL_TEST, gleiche DB wie DATABASE_URL): der Job
// wallet-payouts gegen Testkette + Signer im Prozess. Freigabe per
// Software-Schlüssel, Plan aus dem Knoten, Roh-Tx vor dem Senden, erneutes
// Senden nach Absturz, Bestätigung, Erhöhung, Abbruch, Nonces, Verknüpfung
// im Sync und Einfrieren bei einer Ausgabe ohne Auszahlung.

const url = process.env.DATABASE_URL_TEST;
const d = url && process.env.DATABASE_URL === url ? describe : describe.skip;

const RP = "localhost";
const ORIGIN = "http://localhost:3201";
const BTC_DEST = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const ETH_DEST = addr.addChecksum("0x00000000000000000000000000000000000000dd");

d("Auszahlungen: Job wallet-payouts (Postgres + Testkette + Signer)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const key = new SoftSecurityKey();
	let orgId = "";
	let userId = "";
	let dir = "";
	let signer: Signer;
	let server: Awaited<ReturnType<typeof startSignerServer>>;
	let chain: Devchain;
	let clients: NodeClients;
	let btcAccount = "";
	let ethAccount = "";
	let ethFrom = "";
	let btcRpc: BitcoinRpc;

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx as unknown as OrgTx);
		});
	const app = <T = Record<string, unknown>>(cmd: string, args: unknown = {}) =>
		callSigner<T>(join(dir, "app.sock"), cmd, args);
	const admin = <T = Record<string, unknown>>(
		cmd: string,
		args: unknown = {},
	) => callSigner<T>(join(dir, "admin.sock"), cmd, args).then((r) => r.result);
	const policy = async () =>
		(await app<{ policy: Policy }>("status")).result.policy;

	async function approve(intentId: string) {
		const g = (await app<{ challenge: string }>("intent.get", { intentId }))
			.result;
		await app("approve", {
			intentId,
			...key.assert({
				rpId: RP,
				origin: ORIGIN,
				challenge: Buffer.from(g.challenge, "base64url"),
			}),
		});
	}

	async function hotAccount(network: WalletNetwork, name: string) {
		const id = randomUUID();
		const acc = (
			await app<{ xpub: string }>("account.create", {
				orgId,
				accountId: id,
				network,
			})
		).result;
		const k = parseAccountKey(acc.xpub, network);
		const address = deriveAddress(k.hd, network, 0, 0);
		await inOrg(async (tx) => {
			await tx.insert(walletAccounts).values({
				id,
				organizationId: orgId,
				name,
				network,
				kind: "hot",
				purpose: "own",
				accountKey: k.standard,
				keyFingerprint: k.hd.fingerprint.toString(16).padStart(8, "0"),
				nextReceiveIndex: 1,
				historyFrom: new Date(Date.now() - 3600_000),
				createdByUserId: userId,
			});
			await tx.insert(walletAddresses).values({
				organizationId: orgId,
				accountId: id,
				branch: 0,
				index: 0,
				address,
				issuedAt: new Date(),
				issuedByUserId: userId,
			});
		});
		return { id, address };
	}

	// Zieladresse wie die Action: Absicht im Signer, Zeile „vorgeschlagen“;
	// den Stand (aktiv nach Wartezeit 0) übernimmt der Job
	async function destination(network: WalletNetwork, address: string) {
		const w = (
			await app<{ intentId: string; expiresAt: number }>("intent.create", {
				kind: "whitelist",
				network,
				destination: address,
				initiator: userId,
			})
		).result;
		const [row] = await inOrg((tx) =>
			tx
				.insert(walletAddressBook)
				.values({
					organizationId: orgId,
					network,
					address,
					label: `Ziel ${network}`,
					intentId: w.intentId,
					expiresAt: new Date(w.expiresAt * 1000),
					screening: "clear",
					proposedByUserId: userId,
				})
				.returning(),
		);
		await approve(w.intentId);
		return row?.id as string;
	}

	// Auszahlung wie createPayout: Deckel aus dem Knoten, Absicht, Zeile
	async function payout(p: {
		accountId: string;
		network: WalletNetwork;
		asset: AssetCode;
		amount: bigint;
		destination: string;
		addressBookId: string;
		speed?: PayoutSpeed;
	}) {
		const pol = await policy();
		const speed = p.speed ?? "normal";
		const c = clients[p.network];
		if (!c) throw new Error("kein Knoten");
		let feeCap: bigint;
		if (c.chain === "bitcoin") {
			const { index, exclude } = await inOrg(async (tx) => ({
				index: await addressIndex(tx, p.accountId),
				exclude: await excludedOutpoints(tx, orgId, p.accountId),
			}));
			const cap = await btcCapForPayout(
				c.btc,
				p.accountId,
				index,
				p.amount,
				speed,
				pol,
				exclude,
			);
			if ("error" in cap) throw new Error(cap.error);
			feeCap = cap.feeCap;
		} else {
			const cap = await ethCapForPayout(
				c.eth,
				{
					network: p.network,
					asset: p.asset,
					from: ethFrom,
					destination: p.destination,
					amount: p.amount,
					speed,
				},
				pol,
			);
			if ("error" in cap) throw new Error(cap.error);
			feeCap = cap.feeCap;
		}
		const created = (
			await app<{ intentId: string; text: string; expiresAt: number }>(
				"intent.create",
				{
					kind: "payout",
					accountId: p.accountId,
					asset: p.asset,
					amount: p.amount.toString(),
					destination: p.destination,
					feeCap: feeCap.toString(),
					initiator: userId,
				},
			)
		).result;
		const [row] = await inOrg((tx) =>
			tx
				.insert(walletPayouts)
				.values({
					organizationId: orgId,
					accountId: p.accountId,
					addressBookId: p.addressBookId,
					asset: p.asset,
					amount: p.amount.toString(),
					destination: p.destination,
					destinationLabel: "Ziel",
					feeCap: feeCap.toString(),
					speed,
					intentId: created.intentId,
					intentText: created.text,
					expiresAt: new Date(created.expiresAt * 1000),
					createdByUserId: userId,
				})
				.returning(),
		);
		return row as typeof walletPayouts.$inferSelect;
	}

	const get = async (id: string) => {
		const [row] = await inOrg((tx) =>
			tx.select().from(walletPayouts).where(eq(walletPayouts.id, id)),
		);
		return row as typeof walletPayouts.$inferSelect;
	};
	const set = (id: string, v: Partial<typeof walletPayouts.$inferInsert>) =>
		inOrg((tx) =>
			tx.update(walletPayouts).set(v).where(eq(walletPayouts.id, id)),
		);
	const job = () => runWalletPayouts({ clients });
	const sync = () => runWalletSync({ clients, sanctions: new Map() });

	beforeAll(async () => {
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values (${"Payouts"}, ${`payouts-${stamp}`}, now()) returning id`;
		orgId = org?.id as string;
		const [user] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Ada', ${`payouts-${stamp}@example.test`}, true, now(), now()) returning id`;
		userId = user?.id as string;

		dir = mkdtempSync(join(tmpdir(), "klick-payouts-"));
		signer = Signer.open({ dir, kek: randomBytes(32), dev: true });
		server = await startSignerServer(signer, {
			app: { path: join(dir, "app.sock"), mode: 0o660 },
			admin: { path: join(dir, "admin.sock"), mode: 0o600 },
			log: () => {},
		});
		process.env.SIGNER_SOCKET = join(dir, "app.sock");
		process.env.CONFIRM_ORIGIN = ORIGIN;
		resetSignerCache();
		const prep = await admin<{ token: string; words: Record<string, string> }>(
			"seed.prepare",
			{ networks: ["bitcoin_signet", "ethereum_sepolia"] },
		);
		await admin("init.commit", {
			token: prep.token,
			checks: Object.fromEntries(
				Object.entries(prep.words).map(([n, w]) => {
					const words = w.split(" ");
					return [n, { 1: words[0], 2: words[1], 3: words[2] }];
				}),
			),
			orgId,
			rpId: RP,
			origin: ORIGIN,
		});
		const start = await admin<{ enrolId: string; url: string }>("enrol.start", {
			person: userId,
		});
		await app(
			"enrol.finish",
			key.enrol({
				rpId: RP,
				origin: ORIGIN,
				enrolId: start.enrolId,
				secret: new URL(start.url).hash.match(/t=([0-9a-f]{64})/)?.[1] ?? "",
			}),
		);

		chain = await startDevchain({ btcPort: 0, ethPort: 0, stateFile: null });
		btcRpc = new BitcoinRpc(
			endpointFrom(`http://dev:dev@${new URL(chain.btcUrl).host}`),
		);
		clients = {
			bitcoin_signet: { chain: "bitcoin", btc: btcRpc },
			ethereum_sepolia: {
				chain: "ethereum",
				eth: new EthereumRpc(endpointFrom(chain.ethUrl)),
			},
		};

		const btc = await hotAccount("bitcoin_signet", "Hot BTC");
		btcAccount = btc.id;
		const eth = await hotAccount("ethereum_sepolia", "Hot ETH");
		ethAccount = eth.id;
		ethFrom = eth.address;
		chain.btc.faucet(btc.address, 300_000n);
		chain.btc.faucet(btc.address, 200_000n);
		chain.btc.mine(1);
		chain.eth.faucet({ address: ethFrom, amount: (10n ** 17n).toString() });
		chain.eth.faucet({ address: ethFrom, asset: "USDC", amount: "9000000" });
		chain.eth.mine(3);
		await sync();
	}, 30_000);

	afterAll(async () => {
		delete process.env.SIGNER_SOCKET;
		delete process.env.CONFIRM_ORIGIN;
		resetSignerCache();
		// Konten stilllegen, damit spätere Läufe des Syncs sie nicht abfragen
		if (orgId)
			await inOrg((tx) =>
				tx
					.update(walletAccounts)
					.set({ status: "retired" })
					.where(eq(walletAccounts.organizationId, orgId)),
			);
		await server?.close();
		signer?.close();
		await chain?.close();
		await client.end();
	});

	it("Sync liest die Eingänge der Hot-Konten", async () => {
		const accounts = await inOrg((tx) =>
			tx
				.select()
				.from(walletAccounts)
				.where(eq(walletAccounts.organizationId, orgId)),
		);
		const btc = accounts.find((a) => a.id === btcAccount);
		const eth = accounts.find((a) => a.id === ethAccount);
		expect(btc?.balances?.BTC?.confirmed).toBe("500000");
		expect(eth?.balances?.USDC?.confirmed).toBe("9000000");
	});

	let btcDestId = "";

	it("Bitcoin: Freigabe → Plan → Signatur → Senden → bestätigt, Sync verknüpft", async () => {
		btcDestId = await destination("bitcoin_signet", BTC_DEST);
		const p = await payout({
			accountId: btcAccount,
			network: "bitcoin_signet",
			asset: "BTC",
			amount: 40_000n,
			destination: BTC_DEST,
			addressBookId: btcDestId,
		});
		expect(p.status).toBe("awaiting_approval");
		// ohne Freigabe passiert nichts
		await job();
		expect((await get(p.id)).status).toBe("awaiting_approval");

		await approve(p.intentId);
		const r = await job();
		expect(r.state).toBe("ok");
		const sent = await get(p.id);
		expect(sent.status).toBe("broadcast");
		expect(sent.rawTx).toMatch(/^[0-9a-f]+$/);
		expect(sent.txids).toEqual([sent.txid]);
		expect(BigInt(sent.fee ?? "0")).toBeLessThanOrEqual(BigInt(sent.feeCap));
		// Adressbuch hat den Stand aus dem Signer übernommen
		const [ab] = await inOrg((tx) =>
			tx
				.select()
				.from(walletAddressBook)
				.where(eq(walletAddressBook.id, btcDestId)),
		);
		expect(ab?.status).toBe("active");

		const tx = await btcRpc.getTransaction(
			`klick-${btcAccount}`,
			sent.txid as string,
		);
		expect(tx.confirmations).toBe(0);
		// Absturz nach dem Signieren: erneut senden, nie neu signieren
		await set(p.id, { status: "signed" });
		await job();
		const again = await get(p.id);
		expect(again.status).toBe("broadcast");
		expect(again.txid).toBe(sent.txid);

		chain.btc.mine(1);
		await job();
		const done = await get(p.id);
		expect(done.status).toBe("confirmed");
		expect(done.confirmedAt).not.toBeNull();

		await sync();
		const out = await inOrg((tx) =>
			tx
				.select()
				.from(walletTransfers)
				.where(
					and(
						eq(walletTransfers.accountId, btcAccount),
						eq(walletTransfers.txid, sent.txid as string),
						eq(walletTransfers.direction, "out"),
					),
				),
		);
		expect(out.length).toBeGreaterThan(0);
		for (const o of out) expect(o.payoutId).toBe(p.id);
		expect((await app<{ frozen: unknown }>("hello")).result.frozen).toBeNull();
	});

	it("Bitcoin: Beschleunigen mit denselben Eingängen, alte Fassung verdrängt", async () => {
		const p = await payout({
			accountId: btcAccount,
			network: "bitcoin_signet",
			asset: "BTC",
			amount: 30_000n,
			destination: BTC_DEST,
			addressBookId: btcDestId,
			speed: "slow",
		});
		await approve(p.intentId);
		await job();
		const sent = await get(p.id);
		expect(sent.status).toBe("broadcast");
		await set(p.id, { bumpRequested: true });
		await job();
		const bumped = await get(p.id);
		expect(bumped.txid).not.toBe(sent.txid);
		expect(bumped.txids).toEqual([sent.txid, bumped.txid]);
		expect(BigInt(bumped.fee ?? "0")).toBeGreaterThan(BigInt(sent.fee ?? "0"));
		expect(bumped.bumpRequested).toBe(false);
		expect((bumped.plan as { inputs: unknown[] }).inputs).toEqual(
			(sent.plan as { inputs: unknown[] }).inputs,
		);
		chain.btc.mine(1);
		await job();
		const done = await get(p.id);
		expect(done.status).toBe("confirmed");
		expect(done.txid).toBe(bumped.txid);
	});

	it("Bitcoin: Abbruch nach dem Senden geht an das eigene Konto", async () => {
		const p = await payout({
			accountId: btcAccount,
			network: "bitcoin_signet",
			asset: "BTC",
			amount: 20_000n,
			destination: BTC_DEST,
			addressBookId: btcDestId,
			speed: "slow",
		});
		await approve(p.intentId);
		await job();
		expect((await get(p.id)).status).toBe("broadcast");
		await set(p.id, { cancelRequested: true });
		await job();
		const cancelling = await get(p.id);
		const cancelTxid = (cancelling.plan as { cancelTxid?: string }).cancelTxid;
		expect(cancelTxid).toBe(cancelling.txid);
		expect(cancelling.txids).toHaveLength(2);
		chain.btc.mine(1);
		await job();
		expect((await get(p.id)).status).toBe("cancelled");
		await sync();
		expect((await app<{ frozen: unknown }>("hello")).result.frozen).toBeNull();
	});

	it("Ethereum: USDC und ETH nacheinander mit fortlaufender Nonce", async () => {
		const destId = await destination("ethereum_sepolia", ETH_DEST);
		const usdc = await payout({
			accountId: ethAccount,
			network: "ethereum_sepolia",
			asset: "USDC",
			amount: 2_500_000n,
			destination: ETH_DEST,
			addressBookId: destId,
		});
		const eth = await payout({
			accountId: ethAccount,
			network: "ethereum_sepolia",
			asset: "ETH",
			amount: 10n ** 15n,
			destination: ETH_DEST,
			addressBookId: destId,
		});
		await approve(usdc.intentId);
		await approve(eth.intentId);
		await job();
		const a = await get(usdc.id);
		const b = await get(eth.id);
		expect(a.status).toBe("broadcast");
		expect(b.status).toBe("broadcast");
		expect([a.nonce, b.nonce]).toEqual(["0", "1"]);
		chain.eth.mine(1);
		// noch nicht final: bleibt gesendet
		await job();
		expect((await get(usdc.id)).status).toBe("broadcast");
		chain.eth.mine(3);
		await job();
		expect((await get(usdc.id)).status).toBe("confirmed");
		expect((await get(eth.id)).status).toBe("confirmed");
		await sync();
		const out = await inOrg((tx) =>
			tx
				.select()
				.from(walletTransfers)
				.where(
					and(
						eq(walletTransfers.accountId, ethAccount),
						eq(walletTransfers.direction, "out"),
					),
				),
		);
		// Betrag und Gebühr je Zahlung, alle der Auszahlung zugeordnet
		expect(new Set(out.map((o) => o.payoutId))).toEqual(
			new Set([usdc.id, eth.id]),
		);
		expect(out.filter((o) => o.outputRef === "out:fee")).toHaveLength(2);
	});

	it("Ausgabe ohne Auszahlung in Klick: Alarm und Signer eingefroren", async () => {
		// am Klick vorbei: Absicht, Freigabe und Signatur direkt beim Signer
		const w = (
			await app<{ intentId: string }>("intent.create", {
				kind: "payout",
				accountId: btcAccount,
				asset: "BTC",
				amount: "15000",
				destination: BTC_DEST,
				feeCap: "20000",
				initiator: userId,
			})
		).result;
		await approve(w.intentId);
		const [u] = await btcRpc.listUnspent(`klick-${btcAccount}`, 1);
		const index = await inOrg((tx) => addressIndex(tx, btcAccount));
		const at = index.get((u?.address ?? "").toLowerCase());
		const prev = await btcRpc.getTransaction(
			`klick-${btcAccount}`,
			u?.txid as string,
		);
		const signed = (
			await app<{ raw: string }>("sign", {
				intentId: w.intentId,
				mode: "first",
				plan: {
					inputs: [
						{
							txid: u?.txid,
							vout: u?.vout,
							prevTxHex: prev.hex,
							branch: at?.branch,
							index: at?.index,
						},
					],
					fee: "1500",
				},
			})
		).result;
		await btcRpc.sendRawTransaction(signed.raw);
		chain.btc.mine(1);
		await sync();
		expect(
			(await app<{ frozen: { reason: string } | null }>("hello")).result.frozen
				?.reason,
		).toMatch(/^Unbekannte Ausgabe/);
		const alerts = await inOrg((tx) =>
			tx
				.select()
				.from(auditLog)
				.where(
					and(
						eq(auditLog.organizationId, orgId),
						eq(auditLog.action, "wallet.unknown_spend"),
					),
				),
		);
		expect(alerts).toHaveLength(1);
		// eingefroren: der Job signiert nichts mehr
		const p = await payout({
			accountId: btcAccount,
			network: "bitcoin_signet",
			asset: "BTC",
			amount: 10_000n,
			destination: BTC_DEST,
			addressBookId: btcDestId,
		}).catch((e: unknown) => e);
		expect(p).toBeInstanceOf(Error);
		await admin("unfreeze");
	});

	it("Journal-Anker: überholte Antwort ändert nichts, echter Rücklauf meldet", async () => {
		const { seq, head } = await app("hello");
		expect(await inOrg((tx) => recordAnchor(tx, orgId, { seq, head }))).toBe(
			"ok",
		);
		// überholt (eine Antwort von vorhin kommt später an): nichts geändert
		expect(
			await inOrg((tx) =>
				recordAnchor(tx, orgId, { seq: seq - 1, head: "0".repeat(64) }),
			),
		).toBe("stale");
		const alarms = () =>
			inOrg((tx) =>
				tx
					.select()
					.from(auditLog)
					.where(
						and(
							eq(auditLog.organizationId, orgId),
							eq(auditLog.action, "wallet.signer_head_regressed"),
						),
					),
			);
		expect(await alarms()).toHaveLength(0);
		expect(
			await inOrg((tx) =>
				recordAnchor(
					tx,
					orgId,
					{ seq: seq - 1, head: "0".repeat(64) },
					new Date(),
					{ detect: true },
				),
			),
		).toBe("regressed");
		expect(await alarms()).toHaveLength(1);
		expect(
			await inOrg((tx) =>
				recordAnchor(tx, orgId, { seq, head: "1".repeat(64) }),
			),
		).toBe("forked");
		// der Job fragt bei „stale“ frisch nach — mit dem echten Kopf ist alles gut
		expect((await job()).state).toBe("ok");
	});
});
