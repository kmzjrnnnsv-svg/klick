import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
	cryptoAccounts,
	cryptoAlerts,
	cryptoBalances,
	cryptoMovements,
	cryptoPayouts,
	keyCeremonies,
	tasks,
	type WalletLink,
	walletLinks,
	wallets,
} from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { createSuspiciousReport } from "@/lib/compliance/aml-service";
import { functionResponsible } from "@/lib/compliance/function-holders-service";
import { createIncidentRecord } from "@/lib/compliance/incident-service";
import { nextWalletCode } from "@/lib/custody/wallet-rules";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import { ASSETS } from "@/lib/wallet/core/assets";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import type { WalletEvent } from "@/lib/wallet-link/contract";
import type { EventData } from "@/lib/wallet-link/events";
import {
	ALERT_TODO,
	alertEffect,
	berlinDay,
	ceremonyKind,
	quorumFrom,
	registerWallet,
	taskPriority,
} from "./rules";

// Wirkung eines angenommenen Ereignisses aus both.money in Klick (Plan
// both.money, K3). Läuft in der Transaktion des Empfangs (eine je Ereignis),
// ohne handelnde Person: Verantwortliche kommen aus den Funktionen, sonst
// Inhaber:innen. Zustands-Ereignisse tragen rev — die neuere Fassung gewinnt.

export type IngestCtx = {
	orgId: string;
	userId: null;
	ip?: string | null;
	userAgent?: string | null;
};

const SOURCE = "both.money";
const day = (d: Date) => d.toISOString().slice(0, 10);

async function responsible(
	tx: OrgTx,
	orgId: string,
	fn: RoleFunction,
): Promise<string | null> {
	return (
		(await functionResponsible(tx, orgId, fn)) ??
		(await orgOwnerIds(tx, orgId))[0] ??
		null
	);
}

async function insertTask(
	tx: OrgTx,
	ctx: IngestCtx,
	t: {
		title: string;
		description: string;
		assigneeUserId: string | null;
		priority: "critical" | "high" | "normal";
		entityType?: "wallet" | "incident" | "suspicious_report";
		entityId?: string | null;
	},
): Promise<string> {
	const [row] = await tx
		.insert(tasks)
		.values({
			organizationId: ctx.orgId,
			title: t.title,
			description: t.description,
			assigneeUserId: t.assigneeUserId,
			createdByUserId: null,
			dueAt: day(new Date()),
			entityType: t.entityType ?? null,
			entityId: t.entityId ?? null,
			sourceKind: "system",
			priority: t.priority,
		})
		.returning({ id: tasks.id });
	if (!row) throw new Error("insert failed");
	if (t.assigneeUserId)
		await notify(tx, {
			orgId: ctx.orgId,
			recipients: [t.assigneeUserId],
			actorUserId: null,
			kind: "task_assigned",
			title: t.title,
			link: "/heute/aufgaben",
		});
	return row.id;
}

async function applyOrgUpdated(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	d: EventData<"org.updated">,
): Promise<AuditInput[]> {
	await tx
		.update(walletLinks)
		.set({
			walletOrgName: d.org.name,
			walletOrgSlug: d.org.slug,
			custodyMode: d.custodyMode,
			isOperator: d.isOperator,
			caspLicenceRef: d.caspLicenceRef,
		})
		.where(eq(walletLinks.id, link.id));
	if (!link.custodyMode || link.custodyMode === d.custodyMode) return [];
	const taskId = await insertTask(tx, ctx, {
		title: `both.money: Verwahrmodus von „${link.custodyMode}“ auf „${d.custodyMode}“ geändert`,
		description:
			"Prüfen, ob Erlaubnis, Verwahrungs-Register, Abstimmung und Kundenbuch zum neuen Modus passen (MiCAR Art. 75).",
		assigneeUserId: await responsible(tx, ctx.orgId, "compliance"),
		priority: "high",
	});
	return [
		{
			action: "wallet_link.custody_mode_changed",
			target: `wallet_link:${link.id}`,
			before: { custodyMode: link.custodyMode },
			after: { custodyMode: d.custodyMode, taskId },
		},
	];
}

async function applyAccount(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	d: EventData<"account.upserted">,
): Promise<AuditInput[]> {
	const a = d.account;
	const reg = registerWallet(a);
	const [existing] = await tx
		.select()
		.from(cryptoAccounts)
		.where(
			and(
				eq(cryptoAccounts.organizationId, link.organizationId),
				eq(cryptoAccounts.linkId, link.id),
				eq(cryptoAccounts.walletAccountId, a.id),
			),
		)
		.limit(1);
	if (existing) {
		if (existing.rev >= d.rev) return [];
		await tx
			.update(cryptoAccounts)
			.set({
				name: a.name,
				kind: a.kind,
				purpose: a.purpose,
				firstAddress: a.firstAddress,
				status: a.status,
				rev: d.rev,
			})
			.where(eq(cryptoAccounts.id, existing.id));
		if (existing.walletId)
			await tx
				.update(wallets)
				.set({
					name: reg.name,
					kind: reg.kind,
					purpose: reg.purpose,
					addressLabel: reg.addressLabel,
					status: reg.status,
				})
				.where(eq(wallets.id, existing.walletId));
		return [];
	}
	// Erstes Mal: Eintrag im Verwahrungs-Register
	const codes = await tx
		.select({ code: wallets.code })
		.from(wallets)
		.where(eq(wallets.organizationId, ctx.orgId));
	const code = nextWalletCode(codes.map((c) => c.code));
	const network = a.network as WalletNetwork;
	const quorum =
		link.ceremony && reg.kind === "hot" ? quorumFrom(link.ceremony) : null;
	const [w] = await tx
		.insert(wallets)
		.values({
			organizationId: ctx.orgId,
			code,
			name: reg.name,
			kind: reg.kind,
			technology: "single_key",
			purpose: reg.purpose,
			networks: [NETWORKS[network]?.label ?? a.network],
			assetSymbols: (ASSETS[network] ?? []).map((x) => x.code),
			quorumRequired: quorum?.required ?? 1,
			quorumTotal: quorum?.total ?? 1,
			addressLabel: reg.addressLabel,
			ownerUserId: await responsible(tx, ctx.orgId, "isb_ciso"),
			status: reg.status,
			notes:
				"Aus both.money übernommen — Technik, Schlüsselinhaber:innen und Backup-Test im Register prüfen.",
		})
		.returning({ id: wallets.id });
	if (!w) throw new Error("insert failed");
	await tx.insert(cryptoAccounts).values({
		organizationId: ctx.orgId,
		linkId: link.id,
		walletAccountId: a.id,
		name: a.name,
		network: a.network,
		kind: a.kind,
		purpose: a.purpose,
		keyFingerprint: a.keyFingerprint,
		firstAddress: a.firstAddress,
		status: a.status,
		walletId: w.id,
		openedAt: new Date(a.createdAt),
		rev: d.rev,
	});
	return [
		{
			action: "wallet.created",
			target: `wallet:${w.id}`,
			after: { code, name: reg.name, kind: reg.kind, source: SOURCE },
		},
	];
}

async function applyTransfer(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	d: EventData<"transfer.upserted">,
): Promise<void> {
	const t = d.transfer;
	const values = {
		walletAccountId: t.accountId,
		network: t.network,
		direction: t.direction,
		asset: t.asset,
		amount: t.amount,
		txid: t.txid,
		outputRef: t.outputRef,
		address: t.address,
		counterparty: t.counterparty,
		blockHeight: t.blockHeight,
		blockHash: t.blockHash,
		blockTime: t.blockTime ? new Date(t.blockTime) : null,
		confirmations: t.confirmations,
		status: t.status,
		screening: t.screening,
		frozen: t.frozen,
		payoutId: t.payoutId,
		firstSeenAt: new Date(t.firstSeenAt),
		confirmedAt: t.confirmedAt ? new Date(t.confirmedAt) : null,
		rev: d.rev,
	};
	await tx
		.insert(cryptoMovements)
		.values({
			organizationId: ctx.orgId,
			linkId: link.id,
			transferId: t.id,
			...values,
		})
		.onConflictDoUpdate({
			target: [
				cryptoMovements.organizationId,
				cryptoMovements.linkId,
				cryptoMovements.transferId,
			],
			set: { ...values, updatedAt: new Date() },
			setWhere: sql`excluded.rev > ${cryptoMovements.rev}`,
		});
}

async function applyPayout(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	d: EventData<"payout.upserted">,
): Promise<void> {
	const p = d.payout;
	const values = {
		walletAccountId: p.accountId,
		network: p.network,
		asset: p.asset,
		amount: p.amount,
		destination: p.destination,
		destinationLabel: p.destinationLabel,
		speed: p.speed,
		status: p.status,
		intentId: p.intentId,
		feeCap: p.feeCap,
		fee: p.fee,
		txid: p.txid,
		txids: p.txids,
		requestedAt: new Date(p.createdAt),
		approvedAt: p.approvedAt ? new Date(p.approvedAt) : null,
		signedAt: p.signedAt ? new Date(p.signedAt) : null,
		broadcastAt: p.broadcastAt ? new Date(p.broadcastAt) : null,
		confirmedAt: p.confirmedAt ? new Date(p.confirmedAt) : null,
		rev: d.rev,
	};
	await tx
		.insert(cryptoPayouts)
		.values({
			organizationId: ctx.orgId,
			linkId: link.id,
			payoutId: p.id,
			...values,
		})
		.onConflictDoUpdate({
			target: [
				cryptoPayouts.organizationId,
				cryptoPayouts.linkId,
				cryptoPayouts.payoutId,
			],
			set: { ...values, updatedAt: new Date() },
			setWhere: sql`excluded.rev > ${cryptoPayouts.rev}`,
		});
}

async function applyDayClosed(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	d: EventData<"day.closed">,
	seq: number,
): Promise<void> {
	const values = {
		closedAt: new Date(d.closedAt),
		accounts: d.accounts.map((a) => ({
			accountId: a.accountId,
			network: a.network,
			balances: a.balances as Record<
				string,
				{ confirmed: string; pending: string }
			>,
			height: a.height,
			hash: a.hash,
			at: a.at,
			frozen: a.frozen as Record<string, string>,
		})),
		screening: d.screening,
		// Tagesabschluss trägt kein rev: die spätere Folge-Nr. gewinnt
		rev: seq,
	};
	await tx
		.insert(cryptoBalances)
		.values({
			organizationId: ctx.orgId,
			linkId: link.id,
			day: d.date,
			...values,
		})
		.onConflictDoUpdate({
			target: [
				cryptoBalances.organizationId,
				cryptoBalances.linkId,
				cryptoBalances.day,
			],
			set: { ...values, updatedAt: new Date() },
			setWhere: sql`excluded.rev > ${cryptoBalances.rev}`,
		});
	if (!link.lastDayClosed || link.lastDayClosed < d.date)
		await tx
			.update(walletLinks)
			.set({ lastDayClosed: d.date })
			.where(eq(walletLinks.id, link.id));
}

// Zeremonie: Stand an der Verbindung; Quorum der Hot-Wallets aus der
// Richtlinie; Erzeugung/Schlüsselwechsel als Zeremonie im Register
async function applyCeremony(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	d: EventData<"ceremony.recorded">,
): Promise<AuditInput[]> {
	const ceremony = {
		recordedAt: d.recordedAt,
		reason: d.reason,
		policy: d.policy,
		keys: d.keys,
		networks: d.networks,
	};
	await tx
		.update(walletLinks)
		.set({ ceremony })
		.where(eq(walletLinks.id, link.id));
	const hot = await tx
		.select({ walletId: cryptoAccounts.walletId })
		.from(cryptoAccounts)
		.where(
			and(
				eq(cryptoAccounts.organizationId, link.organizationId),
				eq(cryptoAccounts.linkId, link.id),
				eq(cryptoAccounts.kind, "hot"),
			),
		);
	const ids = hot.map((h) => h.walletId).filter((x): x is string => Boolean(x));
	if (ids.length === 0) return [];
	const q = quorumFrom(d);
	const heldAt = berlinDay(new Date(d.recordedAt));
	const kind = ceremonyKind(d.reason);
	await tx
		.update(wallets)
		.set({
			quorumRequired: q.required,
			quorumTotal: q.total,
			...(kind ? { lastCeremonyAt: heldAt } : {}),
		})
		.where(inArray(wallets.id, ids));
	const audits: AuditInput[] = [];
	if (kind)
		for (const walletId of ids) {
			const [row] = await tx
				.insert(keyCeremonies)
				.values({
					organizationId: ctx.orgId,
					walletId,
					kind,
					heldAt,
					participantUserIds: [],
					result: "pass",
					notes: `${SOURCE}: Richtlinie v${d.policy.version} (${d.policy.mode}), ${d.keys.active} Sicherheitsschlüssel von ${d.keys.persons} Person(en). Teilnehmende und Zeug:innen ergänzen.`,
				})
				.returning({ id: keyCeremonies.id });
			audits.push({
				action: "wallet.ceremony_recorded",
				target: `wallet:${walletId}`,
				after: { ceremonyId: row?.id, kind, heldAt, source: SOURCE },
			});
		}
	return audits;
}

async function applyAlertRaised(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	d: EventData<"alert.raised">,
): Promise<AuditInput[]> {
	const [known] = await tx
		.select({ id: cryptoAlerts.id })
		.from(cryptoAlerts)
		.where(
			and(
				eq(cryptoAlerts.organizationId, link.organizationId),
				eq(cryptoAlerts.linkId, link.id),
				eq(cryptoAlerts.alertId, d.alertId),
			),
		)
		.limit(1);
	if (known) return [];
	const effect = alertEffect(d.code);
	const raisedAt = new Date(d.raisedAt);
	const subject = d.subject
		? ` Betroffen: ${d.subject.kind} ${d.subject.id}.`
		: "";
	const audits: AuditInput[] = [];
	let effectId: string | null = null;
	let taskId: string | null = null;
	// Konto als Bezug, wenn das Register es kennt
	const [acc] =
		d.subject?.kind === "account"
			? await tx
					.select({ walletId: cryptoAccounts.walletId })
					.from(cryptoAccounts)
					.where(
						and(
							eq(cryptoAccounts.organizationId, link.organizationId),
							eq(cryptoAccounts.linkId, link.id),
							eq(cryptoAccounts.walletAccountId, d.subject.id),
						),
					)
					.limit(1)
			: [];
	if (effect === "incident") {
		const r = await createIncidentRecord(
			tx,
			ctx,
			{
				title: `${SOURCE}: ${d.title}`.slice(0, 200),
				description: `${d.detail}${subject}\n\n${ALERT_TODO[d.code]}`,
				awareAt: raisedAt,
				regimes: ["dora"],
				affectsPayments: false,
				affectsCustomers: false,
				productId: null,
			},
			{ source: SOURCE },
		);
		effectId = r.id;
		audits.push(r.audit);
	} else if (effect === "suspicious_report") {
		const r = await createSuspiciousReport(
			tx,
			ctx,
			{
				kind: "gwg_sar",
				detectedAt: raisedAt,
				category: "Sanktionstreffer (both.money)",
			},
			{ source: SOURCE },
		);
		effectId = r.id;
		audits.push(r.audit);
		taskId = await insertTask(tx, ctx, {
			title: `${r.internalRef}: Sanktionstreffer aus both.money prüfen`,
			description: `${d.detail}${subject}\n\n${ALERT_TODO[d.code]}`,
			assigneeUserId: r.ownerUserId,
			priority: "critical",
			entityType: "suspicious_report",
			entityId: r.id,
		});
	} else {
		effectId = await insertTask(tx, ctx, {
			title: `${SOURCE}: ${d.title}`.slice(0, 200),
			description: `${d.detail}${subject}\n\n${ALERT_TODO[d.code]}`,
			assigneeUserId: await responsible(tx, ctx.orgId, "isb_ciso"),
			priority: taskPriority(d.severity),
			...(acc?.walletId
				? { entityType: "wallet" as const, entityId: acc.walletId }
				: {}),
		});
	}
	const [row] = await tx
		.insert(cryptoAlerts)
		.values({
			organizationId: ctx.orgId,
			linkId: link.id,
			alertId: d.alertId,
			code: d.code,
			severity: d.severity,
			title: d.title,
			detail: d.detail,
			subject: d.subject,
			raisedAt,
			effect,
			effectId,
			taskId,
		})
		.returning({ id: cryptoAlerts.id });
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: await orgOwnerIds(tx, ctx.orgId),
		actorUserId: null,
		kind: "security_alert",
		title: `${SOURCE}: ${d.title}`,
		body: d.detail,
		link: "/krypto?tab=hinweise",
	});
	audits.push({
		action: "wallet_link.alert_raised",
		target: `crypto_alert:${row?.id}`,
		after: { code: d.code, severity: d.severity, effect, effectId },
	});
	return audits;
}

async function applyAlertResolved(
	tx: OrgTx,
	link: WalletLink,
	d: EventData<"alert.resolved">,
): Promise<AuditInput[]> {
	const rows = await tx
		.update(cryptoAlerts)
		.set({ resolvedAt: new Date(d.resolvedAt) })
		.where(
			and(
				eq(cryptoAlerts.organizationId, link.organizationId),
				eq(cryptoAlerts.linkId, link.id),
				eq(cryptoAlerts.alertId, d.alertId),
				isNull(cryptoAlerts.resolvedAt),
			),
		)
		.returning({ id: cryptoAlerts.id });
	// Vorfälle und Aufgaben schließen nie automatisch
	return rows.map((r) => ({
		action: "wallet_link.alert_resolved",
		target: `crypto_alert:${r.id}`,
		after: { code: d.code, note: d.note },
	}));
}

export async function applyEvent(
	tx: OrgTx,
	ctx: IngestCtx,
	link: WalletLink,
	e: WalletEvent,
): Promise<AuditInput[]> {
	switch (e.type) {
		case "org.updated":
			return applyOrgUpdated(tx, ctx, link, e.data);
		case "account.upserted":
			return applyAccount(tx, ctx, link, e.data);
		case "transfer.upserted":
			await applyTransfer(tx, ctx, link, e.data);
			return [];
		case "payout.upserted":
			await applyPayout(tx, ctx, link, e.data);
			return [];
		case "destination.upserted":
			// nur im Ereignisprotokoll (wallet_link_events)
			return [];
		case "day.closed":
			await applyDayClosed(tx, ctx, link, e.data, e.seq);
			return [];
		case "ceremony.recorded":
			return applyCeremony(tx, ctx, link, e.data);
		case "screening.list_updated":
			await tx
				.update(walletLinks)
				.set({ sanctionsList: e.data })
				.where(eq(walletLinks.id, link.id));
			return [];
		case "alert.raised":
			return applyAlertRaised(tx, ctx, link, e.data);
		case "alert.resolved":
			return applyAlertResolved(tx, link, e.data);
		case "heartbeat":
			await tx
				.update(walletLinks)
				.set({ lastHeartbeatAt: new Date(e.data.at), heartbeat: e.data })
				.where(eq(walletLinks.id, link.id));
			return [];
	}
}
