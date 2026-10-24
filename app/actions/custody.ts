"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	custodyReconciliations,
	keyCeremonies,
	tasks,
	walletKeyHolders,
	wallets,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import {
	NC_DUE_DAYS,
	NC_EFFECTIVENESS_DAYS,
} from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { encryptJson } from "@/lib/crypto/org-dek";
import { parseDecimal } from "@/lib/custody/decimal";
import { holderLocationAad, implementationIdFor } from "@/lib/custody/queries";
import { reconcile, reviewerAllowed } from "@/lib/custody/reconcile";
import { nextBackupTestDue, nextWalletCode } from "@/lib/custody/wallet-rules";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	ceremonySchema,
	keyHolderSchema,
	reconciliationSchema,
	reviewReconciliationSchema,
	revokeKeyHolderSchema,
	walletSchema,
} from "@/lib/validation/custody";
import { nodeHoldings } from "@/lib/wallet/reconcile-source";
import { cryptoHoldingAccounts } from "@/lib/wallet-link-ingest/queries";

// Verwahrung (MiCAR Art. 70/75, CCSS): Wallet-Register, Schlüssel-
// inhaber:innen, Zeremonien und die tägliche Abstimmung des
// Kundenvermögens. Rechte wie Kryptowerte (crypto_asset). Unterdeckung
// erzeugt sofort eine Abweichung; ein fehlgeschlagener Backup-Test geht
// als Wirksamkeitstest an CC-KEY-03 (fail → Abweichung).

const PATH = "/verwahrung";
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (days: number) =>
	isoDay(new Date(Date.now() + days * 86_400_000));

async function loadWallet(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
	id: string,
) {
	const [w] = await tx
		.select()
		.from(wallets)
		.where(and(eq(wallets.id, id), eq(wallets.organizationId, orgId)))
		.limit(1);
	return w ?? null;
}

async function saveWalletImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const parsed = walletSchema.safeParse(input);
	if (!parsed.success) {
		await requireOrg({ crypto_asset: ["update"] });
		return fromZod(parsed.error);
	}
	const { id, ...d } = parsed.data;
	const c = await requireOrg({ crypto_asset: [id ? "update" : "create"] });
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const before = await loadWallet(tx, c.orgId, id);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx.update(wallets).set(d).where(eq(wallets.id, id));
				return {
					result: { ok: true, data: { id } },
					audit: {
						action: "wallet.updated",
						target: `wallet:${id}`,
						before,
						after: d,
					},
				};
			}
			const codes = await tx
				.select({ code: wallets.code })
				.from(wallets)
				.where(eq(wallets.organizationId, c.orgId));
			const code = nextWalletCode(codes.map((x) => x.code));
			const [row] = await tx
				.insert(wallets)
				.values({
					...d,
					organizationId: c.orgId,
					code,
					ownerUserId: d.ownerUserId ?? c.userId,
				})
				.returning({ id: wallets.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "wallet.created",
					target: `wallet:${row.id}`,
					after: { code, ...d },
				},
			};
		},
	);
	revalidatePath(PATH, "layout");
	return res;
}

async function addKeyHolderImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ crypto_asset: ["update"] });
	const parsed = keyHolderSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { location, ...d } = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const w = await loadWallet(tx, c.orgId, d.walletId);
		if (!w) return { result: { ok: false, error: "notFound" }, audit: [] };
		const id = crypto.randomUUID();
		const locationEnc = location
			? await encryptJson(tx, c.orgId, { location }, holderLocationAad(id))
			: null;
		await tx.insert(walletKeyHolders).values({
			id,
			organizationId: c.orgId,
			...d,
			locationEnc,
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.key_holder_added",
				target: `wallet:${w.id}`,
				after: {
					holderId: id,
					userId: d.userId,
					externalName: d.externalName,
					role: d.role,
					siteId: d.siteId,
					hasLocation: Boolean(location),
					vettedAt: d.vettedAt,
					until: d.until,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

// Entzug (CCSS 1.06): Grund ist Pflicht, Aufgabe „Schlüssel austauschen“
// an der Wallet — der Anteil der Person gilt als offengelegt.
async function revokeKeyHolderImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ crypto_asset: ["update"] });
	const parsed = revokeKeyHolderSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [h] = await tx
			.update(walletKeyHolders)
			.set({
				status: "revoked",
				revokedAt: new Date(),
				revokedReason: d.reason,
			})
			.where(
				and(
					eq(walletKeyHolders.id, d.id),
					eq(walletKeyHolders.organizationId, c.orgId),
					eq(walletKeyHolders.status, "active"),
				),
			)
			.returning({
				walletId: walletKeyHolders.walletId,
				role: walletKeyHolders.role,
			});
		if (!h) return { result: { ok: false, error: "notFound" }, audit: [] };
		const w = await loadWallet(tx, c.orgId, h.walletId);
		const [task] = await tx
			.insert(tasks)
			.values({
				organizationId: c.orgId,
				title: `${w?.code ?? "Wallet"}: Schlüssel austauschen und Quorum wiederherstellen`,
				description: `Schlüsselinhaberschaft entzogen (${d.reason}). Den betroffenen Anteil ersetzen bzw. die Wallet neu aufsetzen, Zeremonie protokollieren.`,
				assigneeUserId: w?.ownerUserId ?? c.userId,
				createdByUserId: c.userId,
				dueAt: plusDays(7),
				priority: "high",
				entityType: "wallet",
				entityId: h.walletId,
				sourceKind: "remediation",
			})
			.returning({ id: tasks.id });
		await notify(tx, {
			orgId: c.orgId,
			recipients: [w?.ownerUserId],
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `${w?.code ?? "Wallet"}: Schlüssel austauschen`,
			link: `${PATH}/${h.walletId}`,
			payload: { taskId: task?.id },
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.key_holder_revoked",
				target: `wallet:${h.walletId}`,
				before: { holderId: d.id, status: "active" },
				after: {
					holderId: d.id,
					status: "revoked",
					reason: d.reason,
					taskId: task?.id,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

async function recordCeremonyImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ crypto_asset: ["update"] });
	const parsed = ceremonySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const w = await loadWallet(tx, c.orgId, d.walletId);
		if (!w) return { result: { ok: false, error: "notFound" }, audit: [] };
		const [row] = await tx
			.insert(keyCeremonies)
			.values({ ...d, organizationId: c.orgId, createdByUserId: c.userId })
			.returning({ id: keyCeremonies.id });
		if (!row) throw new Error("insert failed");
		const audits: AuditInput[] = [];
		const isTest = d.kind === "backup_test" || d.kind === "recovery_test";
		if (isTest) {
			// Nur ein bestandener Test setzt die Frist neu.
			if (d.result === "pass")
				await tx
					.update(wallets)
					.set({
						lastBackupTestAt: d.heldAt,
						nextBackupTestDue: nextBackupTestDue(w.kind, d.heldAt),
					})
					.where(eq(wallets.id, w.id));
			const implId = await implementationIdFor(tx, c.orgId, "CC-KEY-03");
			if (implId) {
				const t = await insertControlTest(tx, c, {
					implementationId: implId,
					method: "reperformance",
					scope: `${w.code} ${w.name}`,
					testedAt: new Date(`${d.heldAt}T12:00:00Z`),
					result: d.result,
					notes: d.notes,
				});
				audits.push(...t.audits);
			}
		} else if (d.kind === "generation" || d.kind === "rotation") {
			await tx
				.update(wallets)
				.set({ lastCeremonyAt: d.heldAt })
				.where(eq(wallets.id, w.id));
		}
		audits.push({
			action: "wallet.ceremony_recorded",
			target: `wallet:${w.id}`,
			after: {
				ceremonyId: row.id,
				kind: d.kind,
				heldAt: d.heldAt,
				result: d.result,
				participants: d.participantUserIds.length,
			},
		});
		return { result: { ok: true, data: undefined }, audit: audits };
	});
	revalidatePath(PATH, "layout");
	return res;
}

// Abstimmung je Stichtag erfassen bzw. korrigieren (solange ungeprüft).
// Unterdeckung → Abweichung + Sofortmeldung an Owner; nur Überdeckung →
// Aufgabe „Differenz klären“. Beides höchstens einmal je Stichtag.
async function saveReconciliationImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; status: string; shortfall: boolean }>> {
	const c = await requireOrg({ crypto_asset: ["update"] });
	const parsed = reconciliationSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	if (d.day > isoDay(new Date())) return { ok: false, error: "future_day" };
	const result = reconcile(d.lines);
	const res = await mutateOrg<
		ActionResult<{ id: string; status: string; shortfall: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select()
			.from(custodyReconciliations)
			.where(
				and(
					eq(custodyReconciliations.organizationId, c.orgId),
					eq(custodyReconciliations.day, d.day),
				),
			)
			.limit(1);
		if (before?.status === "reviewed")
			return { result: { ok: false, error: "already_reviewed" }, audit: [] };
		// Bestand on-chain = letzter Tagesabschluss aus both.money? Dann mit
		// Blockhöhe/Hash als Quelle speichern (vom Server, nie aus der Eingabe)
		const holdings = nodeHoldings(await cryptoHoldingAccounts(tx, c.orgId));
		const lines = d.lines.map((l) => {
			const h = holdings.find((x) => x.symbol === l.symbol);
			return h && parseDecimal(h.onChain) === parseDecimal(l.onChain)
				? { ...l, source: { kind: "node" as const, refs: h.sources } }
				: { ...l, source: null };
		});
		const values = {
			lines,
			status: result.status,
			shortfall: result.shortfall,
			explanation: d.explanation,
			preparedByUserId: c.userId,
		};
		const id = before?.id ?? crypto.randomUUID();
		if (before)
			await tx
				.update(custodyReconciliations)
				.set(values)
				.where(eq(custodyReconciliations.id, id));
		else
			await tx
				.insert(custodyReconciliations)
				.values({ id, organizationId: c.orgId, day: d.day, ...values });
		const audits: AuditInput[] = [];
		const off = result.symbols.filter((s) => s.state !== "ok");
		const summary = off.map((s) => `${s.symbol} ${s.difference}`).join(", ");
		if (result.shortfall && !before?.nonconformityId) {
			const shortfalls = off.filter((s) => s.state === "shortfall");
			const nc = await createNonconformity(tx, c, {
				source: "custody_reconciliation",
				sourceRefId: id,
				title: `Unterdeckung Kundenvermögen am ${d.day}: ${shortfalls.map((s) => s.symbol).join(", ")}`,
				description: `Abstimmung vom ${d.day}: on-chain weniger als im Kundenbuch (${summary}). Ursache klären, Deckung herstellen, Meldepflichten prüfen (MiCAR Art. 70, 75).`,
				rootCause: null,
				ownerUserId: c.userId,
				dueAt: plusDays(Math.min(NC_DUE_DAYS, 3)),
				effectivenessCheckAt: plusDays(NC_EFFECTIVENESS_DAYS),
			});
			await tx
				.update(custodyReconciliations)
				.set({ nonconformityId: nc.id })
				.where(eq(custodyReconciliations.id, id));
			await notify(tx, {
				orgId: c.orgId,
				recipients: await orgOwnerIds(tx, c.orgId),
				actorUserId: c.userId,
				kind: "security_alert",
				title: `Unterdeckung Kundenvermögen am ${d.day}`,
				body: summary,
				link: `/abweichungen/${nc.id}`,
				payload: { dedupeKey: `custody_shortfall:${d.day}` },
			});
			audits.push(nc.audit);
		} else if (
			result.status === "difference" &&
			!result.shortfall &&
			!before?.taskId
		) {
			const [task] = await tx
				.insert(tasks)
				.values({
					organizationId: c.orgId,
					title: `Abstimmung ${d.day}: Differenz klären (${summary})`,
					description:
						"Überdeckung on-chain gegenüber dem Kundenbuch — z. B. nicht gebuchte Einzahlung oder Gebühren. Ursache erklären und in der Abstimmung vermerken.",
					assigneeUserId: c.userId,
					createdByUserId: c.userId,
					dueAt: plusDays(2),
					priority: "high",
					entityType: "custody_reconciliation",
					entityId: id,
					sourceKind: "review",
				})
				.returning({ id: tasks.id });
			await tx
				.update(custodyReconciliations)
				.set({ taskId: task?.id ?? null })
				.where(eq(custodyReconciliations.id, id));
		}
		audits.push({
			action: before ? "custody.reconciliation_updated" : "custody.reconciled",
			target: `custody_reconciliation:${id}`,
			before: before
				? { status: before.status, shortfall: before.shortfall }
				: null,
			after: {
				day: d.day,
				status: result.status,
				shortfall: result.shortfall,
				symbols: result.symbols,
			},
		});
		return {
			result: {
				ok: true,
				data: { id, status: result.status, shortfall: result.shortfall },
			},
			audit: audits,
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

// Prüfen im Vier-Augen-Prinzip; Differenzen nur mit Erklärung.
async function reviewReconciliationImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ crypto_asset: ["update"] });
	const parsed = reviewReconciliationSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [r] = await tx
			.select()
			.from(custodyReconciliations)
			.where(
				and(
					eq(custodyReconciliations.id, d.id),
					eq(custodyReconciliations.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!r || r.status === "reviewed")
			return { result: { ok: false, error: "notFound" }, audit: [] };
		const members = await listMembersForPicker(tx, c.orgId);
		if (
			!reviewerAllowed({
				preparedByUserId: r.preparedByUserId,
				reviewerUserId: c.userId,
				memberCount: members.length,
			})
		)
			return { result: { ok: false, error: "four_eyes" }, audit: [] };
		const explanation = d.explanation ?? r.explanation;
		if (r.status === "difference" && !explanation)
			return {
				result: { ok: false, error: "explanation_required" },
				audit: [],
			};
		await tx
			.update(custodyReconciliations)
			.set({
				status: "reviewed",
				explanation,
				reviewedByUserId: c.userId,
				reviewedAt: new Date(),
			})
			.where(eq(custodyReconciliations.id, r.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "custody.reconciliation_reviewed",
				target: `custody_reconciliation:${r.id}`,
				before: { status: r.status },
				after: {
					status: "reviewed",
					day: r.day,
					hadDifference: r.status === "difference",
					explanation,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

export const saveWallet = safeAction("saveWallet", saveWalletImpl);
export const addKeyHolder = safeAction("addKeyHolder", addKeyHolderImpl);
export const revokeKeyHolder = safeAction(
	"revokeKeyHolder",
	revokeKeyHolderImpl,
);
export const recordCeremony = safeAction("recordCeremony", recordCeremonyImpl);
export const saveReconciliation = safeAction(
	"saveReconciliation",
	saveReconciliationImpl,
);
export const reviewReconciliation = safeAction(
	"reviewReconciliation",
	reviewReconciliationImpl,
);
