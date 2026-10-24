// Legacy (bis K6): Wallet-Bereich in Klick, ersetzt durch both.money —
// Änderungen nur noch in apps/wallet/lib/jobs/wallet-payouts.ts.
import { hex } from "@scure/base";
import { Transaction } from "@scure/btc-signer";
import { and, eq, inArray, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import {
	type WalletAccount,
	type WalletPayout,
	walletAccounts,
	walletAddresses,
	walletPayouts,
	walletSignerAnchor,
} from "@/db/schema";
import type { PayoutStatus } from "@/db/schema/wallet";
import { audit } from "@/lib/audit";
import { type OrgTx, withOrg } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import { notify } from "@/lib/notifications/notify";
import { membersAllowed } from "@/lib/org/roles";
import {
	applyAddressBookViews,
	openAddressBookIntents,
} from "@/lib/wallet/address-book";
import { NETWORKS } from "@/lib/wallet/core/networks";
import type { Policy } from "@/lib/wallet/core/policy";
import { amountText } from "@/lib/wallet/display";
import {
	type NodeClients,
	nodeClientsFromEnv,
} from "@/lib/wallet/node-clients";
import {
	addressIndex,
	type BtcPlan,
	btcBuildPlan,
	btcWalletName,
	type EthPlan,
	ethBuildPlan,
	excludedOutpoints,
} from "@/lib/wallet/payouts/build";
import {
	bumpBtcFee,
	bumpEthFees,
	OPEN_PAYOUT_STATUS,
	payoutStatusFromView,
} from "@/lib/wallet/payouts/plan";
import { RpcError } from "@/lib/wallet/rpc/http";
import { recordAnchor } from "@/lib/wallet/signer/anchor";
import {
	SignerCallError,
	type SignerHello,
	type SignerIntentView,
	type SignResult,
	signerCall,
	signerConfigured,
} from "@/lib/wallet/signer/client";

// Job wallet-payouts (jede Minute, eine Instanz): einziger Schreiber der
// Auszahlungen. Holt den Stand aus dem Signer (Freigaben, Ablauf), baut den
// Ausgabeplan aus dem eigenen Knoten, lässt signieren, speichert die
// Roh-Transaktion VOR dem Senden (Absturz danach → erneut senden, nie neu
// signieren), verfolgt Bestätigungen, Erhöhungen und Abbrüche. Ist der
// Signer 5 min nicht erreichbar: security_alert (einmal am Tag).

const UNREACHABLE_ALERT_MS = 5 * 60_000;
const ALERT_EVERY_MS = 24 * 3600_000;

type Ctx = {
	orgId: string;
	clients: NodeClients;
	policy: Policy;
	frozen: boolean;
	now: Date;
};

type Meta = { seq: number; head: string };

export async function runWalletPayouts(
	opts: { clients?: NodeClients; now?: Date } = {},
): Promise<{ state: string; processed: number; failed: number }> {
	if (!signerConfigured()) return { state: "off", processed: 0, failed: 0 };
	const now = opts.now ?? new Date();
	let hello: SignerHello & Meta;
	try {
		const r = await signerCall<SignerHello>("hello");
		hello = { ...r.result, seq: r.seq, head: r.head };
	} catch {
		await markUnreachable(now);
		return { state: "unreachable", processed: 0, failed: 0 };
	}
	if (!hello.initialized || !hello.orgId)
		return { state: "uninitialized", processed: 0, failed: 0 };
	const orgId = hello.orgId;
	const db = { orgId, userId: null };
	const record = (h: SignerHello & Meta, detect: boolean) =>
		withOrg(db, (tx) =>
			recordAnchor(
				tx,
				orgId,
				{
					seq: h.seq,
					head: h.head,
					bundleHash: h.bundleHash,
					policyHash: h.policyHash,
					frozen: h.frozen,
				},
				now,
				{ detect },
			),
		);
	let anchor = await record(hello, false);
	// kleinere seq: vielleicht nur überholt (eine Aktion war schneller) —
	// frisch nachfragen; ist der Kopf dann immer noch zurück, Alarm
	if (anchor === "stale") {
		const again = await signerCall<SignerHello>("hello");
		anchor = await record(
			{ ...again.result, seq: again.seq, head: again.head },
			true,
		);
	}
	// Journal zurückgelaufen: nichts mehr tun, bis ein Mensch draufschaut
	if (anchor !== "ok") return { state: "anchor", processed: 0, failed: 0 };
	const status = await signerCall<{ policy: Policy }>("status");
	const ctx: Ctx = {
		orgId,
		clients: opts.clients ?? nodeClientsFromEnv(),
		policy: status.result.policy,
		frozen: Boolean(hello.frozen),
		now,
	};

	// Adressbuch: Stand aus dem Signer
	const openAb = await withOrg(db, (tx) => openAddressBookIntents(tx, orgId));
	const views = new Map<string, SignerIntentView>();
	for (const r of openAb) {
		const v = await intentView(r.intentId);
		if (v) views.set(r.intentId, v);
	}
	if (views.size > 0)
		await withOrg(db, (tx) => applyAddressBookViews(tx, orgId, views, now));

	// Auszahlungen
	const rows = await withOrg(db, (tx) =>
		tx
			.select({ payout: walletPayouts, account: walletAccounts })
			.from(walletPayouts)
			.innerJoin(walletAccounts, eq(walletAccounts.id, walletPayouts.accountId))
			.where(
				and(
					eq(walletPayouts.organizationId, orgId),
					inArray(walletPayouts.status, [...OPEN_PAYOUT_STATUS]),
				),
			)
			.orderBy(walletPayouts.createdAt),
	);
	let processed = 0;
	let failed = 0;
	for (const { payout, account } of rows) {
		processed += 1;
		try {
			await processPayout(ctx, payout, account);
		} catch (e) {
			failed += 1;
			const message = errorText(e);
			logger.warn(
				{ orgId, payoutId: payout.id, err: e },
				"wallet payout step failed",
			);
			await withOrg(db, (tx) =>
				tx
					.update(walletPayouts)
					.set({ error: message, attempts: payout.attempts + 1 })
					.where(eq(walletPayouts.id, payout.id)),
			);
		}
	}
	return { state: "ok", processed, failed };
}

const errorText = (e: unknown) =>
	(e instanceof SignerCallError
		? `signer:${e.signerCode ?? e.code}${e.detail ? `:${e.detail}` : ""}`
		: e instanceof RpcError
			? e.message
			: e instanceof Error
				? e.message
				: String(e)
	).slice(0, 300);

async function intentView(intentId: string): Promise<SignerIntentView | null> {
	try {
		return (await signerCall<SignerIntentView>("intent.get", { intentId }))
			.result;
	} catch {
		return null;
	}
}

async function processPayout(
	ctx: Ctx,
	p: WalletPayout,
	account: WalletAccount,
) {
	let payout = p;
	if (payout.status === "awaiting_approval") {
		const next = await refreshApproval(ctx, payout);
		if (!next) return;
		payout = next;
	}
	if (payout.status === "approved") {
		const next = await signFirst(ctx, payout, account);
		if (!next) return;
		payout = next;
	}
	if (payout.status === "signed") {
		const next = await broadcast(ctx, payout, account);
		if (!next) return;
		payout = next;
	}
	if (payout.status === "broadcast") await track(ctx, payout, account);
}

async function update(
	ctx: Ctx,
	id: string,
	set: Partial<WalletPayout>,
	log: { action: string; after?: Record<string, unknown> } | null,
	extra?: (tx: OrgTx) => Promise<void>,
): Promise<WalletPayout> {
	return withOrg({ orgId: ctx.orgId, userId: null }, async (tx) => {
		const [row] = await tx
			.update(walletPayouts)
			.set(set)
			.where(eq(walletPayouts.id, id))
			.returning();
		if (!row) throw new Error("payout vanished");
		if (extra) await extra(tx);
		if (log)
			await audit(
				tx,
				{ userId: null },
				{
					organizationId: ctx.orgId,
					action: log.action,
					target: `wallet_payout:${id}`,
					after: { status: row.status, ...(log.after ?? {}) },
				},
			);
		return row;
	});
}

async function tell(
	tx: OrgTx,
	ctx: Ctx,
	kind: "wallet_transfer" | "security_alert",
	title: string,
	payout: WalletPayout,
) {
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: await membersAllowed(tx, ctx.orgId, { wallet: ["read"] }),
		actorUserId: null,
		kind,
		title,
		body: `${payout.destinationLabel}`,
		link: `/wallet/auszahlungen/${payout.id}`,
		payload: { payoutId: payout.id },
	});
}

const label = (account: WalletAccount, p: WalletPayout) =>
	amountText(account.network, p.asset, p.amount);

// 1. Freigabe: Stand aus dem Signer übernehmen
async function refreshApproval(
	ctx: Ctx,
	p: WalletPayout,
): Promise<WalletPayout | null> {
	const view = await intentView(p.intentId);
	if (!view) return null;
	const next = payoutStatusFromView(view, Math.floor(ctx.now.getTime() / 1000));
	if (next === "awaiting_approval") return null;
	return update(
		ctx,
		p.id,
		{
			status: next,
			approvedAt: view.approvedAt ? new Date(view.approvedAt * 1000) : null,
			signableAt: view.signableAt ? new Date(view.signableAt * 1000) : null,
			error: null,
		},
		{
			action:
				next === "approved"
					? "wallet.payout_approval_relayed"
					: next === "expired"
						? "wallet.payout_expired"
						: "wallet.payout_cancelled",
			after: { approvals: view.approvals.length },
		},
	);
}

// 2. Signieren: Plan aus dem Knoten, Signatur vom Signer, Roh-Tx speichern
async function signFirst(
	ctx: Ctx,
	p: WalletPayout,
	account: WalletAccount,
): Promise<WalletPayout | null> {
	if (ctx.frozen) return null;
	if (p.signableAt && p.signableAt > ctx.now) return null;
	const client = ctx.clients[account.network];
	if (!client) throw new Error(`kein Knoten für ${account.network}`);
	const db = { orgId: ctx.orgId, userId: null };
	let plan: BtcPlan | EthPlan | { error: string };
	if (client.chain === "bitcoin") {
		const { index, exclude } = await withOrg(db, async (tx) => ({
			index: await addressIndex(tx, account.id),
			exclude: await excludedOutpoints(tx, ctx.orgId, account.id, p.id),
		}));
		plan = await btcBuildPlan(
			client.btc,
			account.id,
			index,
			BigInt(p.amount),
			p.speed,
			ctx.policy,
			BigInt(p.feeCap),
			exclude,
		);
	} else {
		const from = await ethFrom(ctx, account.id);
		plan = await ethBuildPlan(
			client.eth,
			{
				network: account.network,
				asset: p.asset,
				from,
				destination: p.destination,
				amount: BigInt(p.amount),
				speed: p.speed,
				feeCap: BigInt(p.feeCap),
			},
			ctx.policy,
		);
	}
	if ("error" in plan) {
		// bleibt freigegeben; das Fenster des Signers entscheidet über den Ablauf
		await update(ctx, p.id, { error: `plan:${plan.error}` }, null);
		return null;
	}
	let signed: { result: SignResult } & Meta;
	try {
		signed = await signerCall<SignResult>("sign", {
			intentId: p.intentId,
			mode: "first",
			plan,
		});
	} catch (e) {
		if (e instanceof SignerCallError && e.code === "signer") {
			if (e.signerCode === "window_closed" || e.signerCode === "intent_closed")
				return update(
					ctx,
					p.id,
					{
						status: e.signerCode === "window_closed" ? "expired" : "cancelled",
						error: e.signerCode,
					},
					{ action: "wallet.payout_expired" },
				);
			// Nonce passt nicht (z. B. frühere Auszahlung hängt): mit der vom
			// Signer erwarteten Nonce erneut
			const want = /^expected (\d+)$/.exec(e.detail ?? "")?.[1];
			if (e.signerCode === "nonce" && want && client.chain === "ethereum") {
				const from = await ethFrom(ctx, account.id);
				const retry = await ethBuildPlan(
					client.eth,
					{
						network: account.network,
						asset: p.asset,
						from,
						destination: p.destination,
						amount: BigInt(p.amount),
						speed: p.speed,
						feeCap: BigInt(p.feeCap),
					},
					ctx.policy,
					BigInt(want),
				);
				if ("error" in retry) throw e;
				plan = retry;
				signed = await signerCall<SignResult>("sign", {
					intentId: p.intentId,
					mode: "first",
					plan,
				});
			} else throw e;
		} else throw e;
	}
	const s = signed.result;
	return update(
		ctx,
		p.id,
		{
			status: "signed",
			plan: plan as Record<string, unknown>,
			rawTx: s.raw,
			txid: s.txid,
			txids: [s.txid],
			fee: s.fee,
			nonce: s.nonce ?? null,
			signedAt: ctx.now,
			error: null,
		},
		{ action: "wallet.payout_signed", after: { txid: s.txid, fee: s.fee } },
		(tx) => recordAnchor(tx, ctx.orgId, signed).then(() => undefined),
	);
}

async function ethFrom(ctx: Ctx, accountId: string): Promise<string> {
	const [a] = await withOrg({ orgId: ctx.orgId, userId: null }, (tx) =>
		tx
			.select({ address: walletAddresses.address })
			.from(walletAddresses)
			.where(
				and(
					eq(walletAddresses.accountId, accountId),
					eq(walletAddresses.branch, 0),
					eq(walletAddresses.index, 0),
				),
			)
			.limit(1),
	);
	if (!a) throw new Error("Adresse des Kontos fehlt");
	return a.address;
}

// 3. Senden (auch erneut nach einem Absturz — nie neu signieren)
async function broadcast(
	ctx: Ctx,
	p: WalletPayout,
	account: WalletAccount,
	raw = p.rawTx,
	opts: { action?: string } = {},
): Promise<WalletPayout | null> {
	if (!raw) throw new Error("Roh-Transaktion fehlt");
	const client = ctx.clients[account.network];
	if (!client) throw new Error(`kein Knoten für ${account.network}`);
	try {
		if (client.chain === "bitcoin") await client.btc.sendRawTransaction(raw);
		else await client.eth.sendRawTransaction(raw);
	} catch (e) {
		const msg = e instanceof RpcError ? e.message : "";
		const known =
			(e instanceof RpcError && e.rpcCode === -27) ||
			/already known|already in (the )?(mempool|utxo set)|txn-already/i.test(
				msg,
			);
		if (!known) throw e;
	}
	const first = p.status === "signed";
	return update(
		ctx,
		p.id,
		{ status: "broadcast", broadcastAt: p.broadcastAt ?? ctx.now, error: null },
		{
			action: opts.action ?? "wallet.payout_broadcast",
			after: { txid: p.txid },
		},
		first
			? (tx) =>
					tell(
						tx,
						ctx,
						"wallet_transfer",
						`Auszahlung gesendet: ${label(account, p)}`,
						p,
					)
			: undefined,
	);
}

// 4. Verfolgen: bestätigt, verdrängt, zurückgerollt; Erhöhung und Abbruch
async function track(ctx: Ctx, p: WalletPayout, account: WalletAccount) {
	const client = ctx.clients[account.network];
	if (!client) return;
	const cancelTxid =
		(p.plan as { cancelTxid?: string } | null)?.cancelTxid ?? null;
	const txids = [...p.txids].reverse();
	if (client.chain === "bitcoin") {
		const finality =
			(NETWORKS[account.network].finality as { n: number }).n ?? 1;
		// verdrängt nur, wenn der Knoten alle Fassungen kennt und keine mehr
		// lebt — eine Fehlantwort des Knotens ist kein Beweis
		let anyAlive = false;
		let seen = 0;
		for (const txid of txids) {
			const t = await client.btc
				.getTransaction(btcWalletName(account.id), txid)
				.catch(() => null);
			if (!t) continue;
			seen += 1;
			if (t.confirmations >= finality)
				return finish(
					ctx,
					p,
					account,
					txid,
					txid === cancelTxid ? "cancelled" : "confirmed",
				);
			if (t.confirmations >= 0) anyAlive = true;
		}
		if (!anyAlive && seen === txids.length)
			return finish(ctx, p, account, p.txid, "dropped");
	} else {
		const finalized = await client.eth.block("finalized");
		const finalHeight = finalized ? Number(BigInt(finalized.number)) : 0;
		for (const txid of txids) {
			const r = await client.eth.receipt(txid).catch(() => null);
			if (!r) continue;
			if (Number(BigInt(r.blockNumber)) > finalHeight) return;
			if (r.status === "0x1")
				return finish(
					ctx,
					p,
					account,
					txid,
					txid === cancelTxid ? "cancelled" : "confirmed",
				);
			return finish(ctx, p, account, txid, "failed");
		}
	}
	if (p.cancelRequested && !cancelTxid)
		return replace(ctx, p, account, "cancel");
	if (p.bumpRequested) return replace(ctx, p, account, "bump");
}

async function finish(
	ctx: Ctx,
	p: WalletPayout,
	account: WalletAccount,
	txid: string | null,
	status: Extract<
		PayoutStatus,
		"confirmed" | "cancelled" | "dropped" | "failed"
	>,
) {
	const ok = status === "confirmed";
	await update(
		ctx,
		p.id,
		{
			status,
			txid,
			confirmedAt: ok || status === "cancelled" ? ctx.now : null,
			bumpRequested: false,
			error: ok ? null : status,
		},
		{ action: `wallet.payout_${status}`, after: { txid } },
		(tx) =>
			tell(
				tx,
				ctx,
				ok ? "wallet_transfer" : "security_alert",
				ok
					? `Auszahlung bestätigt: ${label(account, p)}`
					: status === "cancelled"
						? `Auszahlung abgebrochen: ${label(account, p)}`
						: `Auszahlung ${status === "failed" ? "fehlgeschlagen" : "verdrängt"}: ${label(account, p)}`,
				p,
			),
	);
}

// Gebührenerhöhung bzw. Abbruch: gleiche Eingänge/Nonce, höhere Gebühr
async function replace(
	ctx: Ctx,
	p: WalletPayout,
	account: WalletAccount,
	mode: "bump" | "cancel",
) {
	if (ctx.frozen) return;
	const plan = p.plan as (BtcPlan & EthPlan & { cancelTxid?: string }) | null;
	if (!plan || !p.rawTx) return;
	const feeCap = BigInt(p.feeCap);
	let next: BtcPlan | EthPlan;
	if (NETWORKS[account.network].chain === "bitcoin") {
		const vsize = Transaction.fromRaw(hex.decode(p.rawTx), {
			allowUnknownOutputs: true,
		}).vsize;
		const fee = bumpBtcFee(BigInt(p.fee ?? plan.fee), vsize, feeCap);
		if (fee === null) {
			await update(
				ctx,
				p.id,
				{ bumpRequested: false, cancelRequested: false, error: "fee_cap" },
				null,
			);
			return;
		}
		next = { inputs: plan.inputs, fee: fee.toString() };
	} else {
		const fees = bumpEthFees(
			{
				maxFeePerGas: BigInt(plan.maxFeePerGas),
				maxPriorityFeePerGas: BigInt(plan.maxPriorityFeePerGas),
			},
			ctx.policy.feeCaps.ethMaxFeeGwei,
		);
		const gas = mode === "cancel" ? 21_000n : BigInt(plan.gasLimit);
		if (!fees || gas * fees.maxFeePerGas > feeCap) {
			await update(
				ctx,
				p.id,
				{ bumpRequested: false, cancelRequested: false, error: "fee_cap" },
				null,
			);
			return;
		}
		next = {
			nonce: plan.nonce,
			gasLimit: gas.toString(),
			maxFeePerGas: fees.maxFeePerGas.toString(),
			maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
		};
	}
	const signed = await signerCall<SignResult>("sign", {
		intentId: p.intentId,
		mode,
		plan: next,
	});
	const s = signed.result;
	const row = await update(
		ctx,
		p.id,
		{
			plan: { ...next, ...(mode === "cancel" ? { cancelTxid: s.txid } : {}) },
			rawTx: s.raw,
			txid: s.txid,
			txids: [...p.txids, s.txid],
			fee: s.fee,
			bumpRequested: false,
			error: null,
		},
		{
			action:
				mode === "bump"
					? "wallet.payout_bumped"
					: "wallet.payout_cancel_signed",
			after: { txid: s.txid, fee: s.fee },
		},
		(tx) => recordAnchor(tx, ctx.orgId, signed).then(() => undefined),
	);
	await broadcast(ctx, row, account, s.raw, {
		action: "wallet.payout_rebroadcast",
	});
}

// Signer nicht erreichbar: Zeitpunkt merken, nach 5 min einmal am Tag Alarm
async function markUnreachable(now: Date) {
	await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const anchors = await tx.select().from(walletSignerAnchor);
		for (const a of anchors) {
			const since = a.unreachableSince ?? now;
			const alert =
				now.getTime() - since.getTime() >= UNREACHABLE_ALERT_MS &&
				(!a.alertedAt ||
					now.getTime() - a.alertedAt.getTime() > ALERT_EVERY_MS);
			await tx
				.update(walletSignerAnchor)
				.set({ unreachableSince: since, ...(alert ? { alertedAt: now } : {}) })
				.where(eq(walletSignerAnchor.id, a.id));
			if (!alert) continue;
			await audit(
				tx as unknown as OrgTx,
				{ userId: null },
				{
					organizationId: a.organizationId,
					action: "wallet.signer_unreachable",
					target: `wallet_signer:${a.organizationId}`,
					after: { since: since.toISOString() },
				},
			);
			await notify(tx as unknown as OrgTx, {
				orgId: a.organizationId,
				recipients: await membersAllowed(
					tx as unknown as OrgTx,
					a.organizationId,
					{
						wallet: ["read"],
					},
				),
				actorUserId: null,
				kind: "security_alert",
				title: "Signer nicht erreichbar",
				body: "Seit mehr als 5 Minuten. Auszahlungen pausieren; Dienst klick-signer prüfen.",
				link: "/wallet/sicherheit",
			});
		}
	});
}
