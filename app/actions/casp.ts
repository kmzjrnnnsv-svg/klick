"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	cryptoAssets,
	ownFundsCalculations,
	roleAssignments,
	shareholders,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requestApproval } from "@/lib/approvals/service";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { CRYPTO_ASSETS } from "@/lib/compliance/catalog/crypto-assets";
import {
	calculateOwnFunds,
	type MicarClass,
	type OwnFundsResult,
	type RiskBearingResult,
	riskBearingCapacity,
} from "@/lib/compliance/own-funds";
import { thresholdCrossed } from "@/lib/compliance/shareholders";
import { encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	cryptoAssetSchema,
	ownFundsSchema,
	requestOwnFundsApprovalSchema,
	shareholderSchema,
} from "@/lib/validation/casp";
import { type ActionResult, fromZod } from "@/lib/validation/common";

const num = (v: number | null | undefined) =>
	v === null || v === undefined ? null : String(v);

// Zusatzdaten je Eigenmittel-Lauf (kein eigener Spaltensatz nötig).
export type OwnFundsExtras = {
	serviceKind: "money_remittance_only" | "payment_initiation_only" | "other";
	relevantIndicator: number | null;
	liquidityBuffer: number | null;
	riskAmounts: { category: string; amount: number }[];
	result: OwnFundsResult;
	rbc: RiskBearingResult | null;
};

// ── Eigenmittel (MiCAR Art. 67, ZAG §§ 12, 15; AT 4.1) ────────────────────

async function upsertOwnFundsImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; totalRequired: number }>> {
	const c = await requireOrg({ own_funds: ["create", "update"] });
	const parsed = ownFundsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const result = calculateOwnFunds({
		micar:
			d.micarClass &&
			d.fixedOverheadsPrevYear !== null &&
			d.fixedOverheadsPrevYear !== undefined
				? {
						micarClass: d.micarClass as MicarClass,
						fixedOverheadsPrevYear: d.fixedOverheadsPrevYear,
					}
				: d.micarClass
					? {
							micarClass: d.micarClass as MicarClass,
							fixedOverheadsPrevYear: 0,
						}
					: null,
		zag: d.zagMethod
			? {
					method: d.zagMethod,
					serviceKind: d.zagServiceKind,
					fixedOverheadsPrevYear: d.fixedOverheadsPrevYear ?? undefined,
					monthlyPaymentVolume: d.monthlyPaymentVolume ?? undefined,
					relevantIndicator: d.relevantIndicator ?? undefined,
				}
			: null,
		availableOwnFunds: d.availableOwnFunds ?? null,
	});
	const rbc =
		d.availableOwnFunds !== null && d.availableOwnFunds !== undefined
			? riskBearingCapacity({
					ownFunds: d.availableOwnFunds,
					liquidityBuffer: d.liquidityBuffer ?? 0,
					regulatoryMinimum: result.totalRequired,
					risks: d.riskAmounts ?? [],
				})
			: null;
	const extras: OwnFundsExtras = {
		serviceKind: d.zagServiceKind,
		relevantIndicator: d.relevantIndicator ?? null,
		liquidityBuffer: d.liquidityBuffer ?? null,
		riskAmounts: d.riskAmounts ?? [],
		result,
		rbc,
	};
	const values = {
		periodLabel: d.periodLabel,
		micarClass: d.micarClass ?? null,
		micarMinCapital: num(result.micar?.minCapital),
		fixedOverheadsPrevYear: num(d.fixedOverheadsPrevYear),
		micarRequired: num(result.micar?.required),
		zagMethod: d.zagMethod ?? null,
		monthlyPaymentVolume: num(d.monthlyPaymentVolume),
		zagRequired: num(result.zag?.required),
		zagInitialCapital: num(result.zag?.initialCapital),
		totalRequired: num(result.totalRequired),
		availableOwnFunds: num(result.availableOwnFunds),
		buffer: num(result.buffer),
		riskBearingCapacity: extras as unknown as Record<string, unknown>,
	};
	const res = await mutateOrg<
		ActionResult<{ id: string; totalRequired: number }>
	>(toOrgCtx(c), async (tx) => {
		if (d.id) {
			const [before] = await tx
				.select()
				.from(ownFundsCalculations)
				.where(
					and(
						eq(ownFundsCalculations.id, d.id),
						eq(ownFundsCalculations.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			if (before.status !== "draft")
				return { result: { ok: false, error: "notDraft" }, audit: [] };
			await tx
				.update(ownFundsCalculations)
				.set(values)
				.where(eq(ownFundsCalculations.id, d.id));
			return {
				result: {
					ok: true,
					data: { id: d.id, totalRequired: result.totalRequired },
				},
				audit: {
					action: "own_funds.update",
					target: `own_funds_calculation:${d.id}`,
					before: {
						totalRequired: before.totalRequired,
						availableOwnFunds: before.availableOwnFunds,
					},
					after: {
						totalRequired: values.totalRequired,
						availableOwnFunds: values.availableOwnFunds,
					},
				},
			};
		}
		const [row] = await tx
			.insert(ownFundsCalculations)
			.values({ organizationId: c.orgId, ...values })
			.onConflictDoNothing()
			.returning({ id: ownFundsCalculations.id });
		if (!row)
			return {
				result: {
					ok: false,
					error: "duplicate",
					fieldErrors: { periodLabel: ["duplicate"] },
				},
				audit: [],
			};
		return {
			result: {
				ok: true,
				data: { id: row.id, totalRequired: result.totalRequired },
			},
			audit: {
				action: "own_funds.create",
				target: `own_funds_calculation:${row.id}`,
				after: {
					periodLabel: d.periodLabel,
					totalRequired: values.totalRequired,
					status: result.status,
				},
			},
		};
	});
	revalidatePath("/eigenmittel");
	return res;
}

// Freigabe durch die Geschäftsleitung (Workflow own_funds: Finanzen → GL).
async function requestOwnFundsApprovalImpl(
	input: unknown,
): Promise<ActionResult<{ status: string }>> {
	const c = await requireOrg({ own_funds: ["update"] });
	const parsed = requestOwnFundsApprovalSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, selfApprovalReason } = parsed.data;
	const canApproveDirect = roleAllows(c.orgRole, { own_funds: ["approve"] });
	const res = await mutateOrg<ActionResult<{ status: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const [row] = await tx
				.select()
				.from(ownFundsCalculations)
				.where(
					and(
						eq(ownFundsCalculations.id, id),
						eq(ownFundsCalculations.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
			if (row.status !== "draft")
				return { result: { ok: false, error: "notDraft" }, audit: [] };
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "own_funds",
					entityType: "own_funds_calculation",
					entityId: row.id,
					entityOwnerUserId: null,
					entityVersionRef: row.periodLabel,
					title: `Eigenmittel ${row.periodLabel}`,
					link: "/eigenmittel",
					selfApprovalReason,
				},
			);
			if (!r.ok) {
				if (r.error === "workflow_disabled" && canApproveDirect) {
					await tx
						.update(ownFundsCalculations)
						.set({
							status: "approved",
							approvedByUserId: c.userId,
							approvedAt: new Date(),
						})
						.where(eq(ownFundsCalculations.id, row.id));
					return {
						result: { ok: true, data: { status: "approved" } },
						audit: {
							action: "own_funds.approved",
							target: `own_funds_calculation:${row.id}`,
							after: { periodLabel: row.periodLabel, via: "direct" },
						},
					};
				}
				return { result: { ok: false, error: r.error }, audit: [] };
			}
			return {
				result: {
					ok: true,
					data: { status: r.status === "approved" ? "approved" : "pending" },
				},
				audit: {
					action: "own_funds.approval_requested",
					target: `own_funds_calculation:${row.id}`,
					after: { requestId: r.requestId, periodLabel: row.periodLabel },
				},
			};
		},
	);
	revalidatePath("/eigenmittel");
	revalidatePath("/heute");
	return res;
}

// ── Kryptowerte (Art. 62(2)(r), Art. 48 ff. MiCAR) ────────────────────────
// Regel: akzeptiert nur, wenn EMT/ART mit zugelassenem Emittenten (Whitepaper)
// oder nativer Kryptowert ohne Emittent.

async function upsertCryptoAssetImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ crypto_asset: ["create", "update"] });
	const parsed = cryptoAssetSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	if (d.accepted && d.type !== "native" && d.micarStatus !== "authorised") {
		return {
			ok: false,
			error: "notAuthorised",
			fieldErrors: { accepted: ["notAuthorised"] },
		};
	}
	const values = {
		symbol: d.symbol,
		name: d.name,
		issuer: d.issuer ?? null,
		type: d.type,
		issuerAuthorisation: d.issuerAuthorisation ?? null,
		whitepaperRef: d.whitepaperRef ?? null,
		micarStatus: d.micarStatus,
		networks: d.networks,
		accepted: d.accepted,
		acceptedFrom: d.accepted
			? (d.acceptedFrom ?? new Date().toISOString().slice(0, 10))
			: null,
		perTxLimit: num(d.perTxLimit),
		reviewedAt: d.reviewedAt ?? new Date().toISOString().slice(0, 10),
		notes: d.notes ?? null,
	};
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const [before] = await tx
					.select()
					.from(cryptoAssets)
					.where(
						and(
							eq(cryptoAssets.id, id),
							eq(cryptoAssets.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx
					.update(cryptoAssets)
					.set(values)
					.where(eq(cryptoAssets.id, id));
				return {
					result: { ok: true, data: { id } },
					audit: {
						action: "crypto_asset.update",
						target: `crypto_asset:${id}`,
						before: {
							micarStatus: before.micarStatus,
							accepted: before.accepted,
							perTxLimit: before.perTxLimit,
						},
						after: {
							micarStatus: values.micarStatus,
							accepted: values.accepted,
							perTxLimit: values.perTxLimit,
						},
					},
				};
			}
			const [row] = await tx
				.insert(cryptoAssets)
				.values({ organizationId: c.orgId, ...values })
				.onConflictDoNothing()
				.returning({ id: cryptoAssets.id });
			if (!row)
				return {
					result: {
						ok: false,
						error: "duplicate",
						fieldErrors: { symbol: ["duplicate"] },
					},
					audit: [],
				};
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "crypto_asset.create",
					target: `crypto_asset:${row.id}`,
					after: {
						symbol: d.symbol,
						micarStatus: d.micarStatus,
						accepted: d.accepted,
					},
				},
			};
		},
	);
	revalidatePath("/kryptowerte");
	return res;
}

async function applyCryptoAssetSeedImpl(): Promise<
	ActionResult<{ created: number }>
> {
	const c = await requireOrg({ crypto_asset: ["create"] });
	const created = await mutateOrg(toOrgCtx(c), async (tx) => {
		const existing = new Set(
			(
				await tx
					.select({ symbol: cryptoAssets.symbol })
					.from(cryptoAssets)
					.where(eq(cryptoAssets.organizationId, c.orgId))
			).map((x) => x.symbol),
		);
		const audits: AuditInput[] = [];
		let n = 0;
		for (const a of CRYPTO_ASSETS) {
			if (existing.has(a.symbol)) continue;
			const [row] = await tx
				.insert(cryptoAssets)
				.values({
					organizationId: c.orgId,
					symbol: a.symbol,
					name: a.name,
					issuer: a.issuer,
					type: a.type,
					issuerAuthorisation: a.issuerAuthorisation,
					whitepaperRef: a.whitepaperRef,
					micarStatus: a.micarStatus,
					networks: [...a.networks],
					accepted: a.accepted,
					acceptedFrom: a.accepted
						? new Date().toISOString().slice(0, 10)
						: null,
					reviewedAt: new Date().toISOString().slice(0, 10),
					notes: a.notes ?? null,
				})
				.returning({ id: cryptoAssets.id });
			if (row) {
				n += 1;
				audits.push({
					action: "crypto_asset.create",
					target: `crypto_asset:${row.id}`,
					after: {
						symbol: a.symbol,
						micarStatus: a.micarStatus,
						accepted: a.accepted,
						via: "seed",
					},
				});
			}
		}
		return { result: n, audit: audits };
	});
	revalidatePath("/kryptowerte");
	return { ok: true, data: { created } };
}

// ── Gesellschafter (Art. 83–85 MiCAR, § 14 ZAG) ───────────────────────────

async function upsertShareholderImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; thresholdCrossed: number | null }>> {
	const c = await requireOrg({ shareholder: ["create", "update"] });
	const parsed = shareholderSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, uboChain, ...d } = parsed.data;
	const threshold = thresholdCrossed(d.sharePct, d.votingPct);
	const res = await mutateOrg<
		ActionResult<{ id: string; thresholdCrossed: number | null }>
	>(toOrgCtx(c), async (tx) => {
		const values = {
			name: d.name,
			isLegalPerson: d.isLegalPerson,
			sharePct: num(d.sharePct),
			votingPct: num(d.votingPct),
			inhaberkontrolleStatus: d.inhaberkontrolleStatus,
			thresholdCrossed: threshold,
			notifiedAt: d.notifiedAt ?? null,
			approvedAt: d.approvedAt ?? null,
			sanctionsCheckedAt: d.sanctionsCheckedAt ?? null,
		};
		const audits: AuditInput[] = [];
		let rowId: string;
		let before: typeof shareholders.$inferSelect | undefined;
		if (id) {
			[before] = await tx
				.select()
				.from(shareholders)
				.where(
					and(
						eq(shareholders.id, id),
						eq(shareholders.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			await tx.update(shareholders).set(values).where(eq(shareholders.id, id));
			rowId = id;
		} else {
			const [row] = await tx
				.insert(shareholders)
				.values({ organizationId: c.orgId, ...values })
				.returning({ id: shareholders.id });
			if (!row) throw new Error("insert failed");
			rowId = row.id;
		}
		if (uboChain !== undefined) {
			await tx
				.update(shareholders)
				.set({
					uboChain: uboChain
						? await encryptJson(
								tx,
								c.orgId,
								uboChain,
								fieldAad("shareholders", rowId, "ubo_chain"),
							)
						: null,
				})
				.where(eq(shareholders.id, rowId));
		}
		audits.push({
			action: before ? "shareholder.update" : "shareholder.create",
			target: `shareholder:${rowId}`,
			before: before
				? {
						sharePct: before.sharePct,
						votingPct: before.votingPct,
						status: before.inhaberkontrolleStatus,
						threshold: before.thresholdCrossed,
					}
				: undefined,
			after: {
				sharePct: values.sharePct,
				votingPct: values.votingPct,
				status: values.inhaberkontrolleStatus,
				threshold,
			},
		});
		// Schwelle neu überschritten ohne Anzeige → Compliance/GL informieren.
		if (
			threshold &&
			d.inhaberkontrolleStatus === "not_required" &&
			(!before || before.thresholdCrossed !== threshold)
		) {
			const [comp] = await tx
				.select({ userId: roleAssignments.userId })
				.from(roleAssignments)
				.where(
					and(
						eq(roleAssignments.organizationId, c.orgId),
						eq(roleAssignments.function, "compliance"),
					),
				)
				.limit(1);
			await notify(tx, {
				orgId: c.orgId,
				recipients: [comp?.userId],
				actorUserId: c.userId,
				kind: "entity_changed",
				title: `Inhaberkontrolle: ${d.name} ≥ ${threshold} %`,
				body: "Anzeige nach InhKontrollV prüfen — 60 Arbeitstage Beurteilungszeitraum ab vollständiger Anzeige.",
				link: "/organisation?tab=gesellschafter",
			});
		}
		return {
			result: { ok: true, data: { id: rowId, thresholdCrossed: threshold } },
			audit: audits,
		};
	});
	revalidatePath("/organisation");
	return res;
}

async function deleteShareholderImpl(input: {
	id: string;
}): Promise<ActionResult> {
	const c = await requireOrg({ shareholder: ["update"] });
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ id: shareholders.id, name: shareholders.name })
			.from(shareholders)
			.where(
				and(
					eq(shareholders.id, input.id),
					eq(shareholders.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		await tx.delete(shareholders).where(eq(shareholders.id, row.id));
		return {
			result: true,
			audit: {
				action: "shareholder.delete",
				target: `shareholder:${row.id}`,
				before: { name: row.name },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/organisation");
	return { ok: true, data: undefined };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const upsertOwnFunds = safeAction("upsertOwnFunds", upsertOwnFundsImpl);
export const requestOwnFundsApproval = safeAction(
	"requestOwnFundsApproval",
	requestOwnFundsApprovalImpl,
);
export const upsertCryptoAsset = safeAction(
	"upsertCryptoAsset",
	upsertCryptoAssetImpl,
);
export const applyCryptoAssetSeed = safeAction(
	"applyCryptoAssetSeed",
	applyCryptoAssetSeedImpl,
);
export const upsertShareholder = safeAction(
	"upsertShareholder",
	upsertShareholderImpl,
);
export const deleteShareholder = safeAction(
	"deleteShareholder",
	deleteShareholderImpl,
);
