"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	providerRatings,
	providers,
	roleAssignments,
	tasks,
} from "@/db/schema";
import type { RatingMeasure } from "@/db/schema/supplier-ratings";
import { safeAction } from "@/lib/actions/safe";
import { requestApproval } from "@/lib/approvals/service";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { SUPPLIER_MEASURE_BY_CODE } from "@/lib/compliance/catalog/supplier-criteria";
import {
	applicableCriteria,
	decisionNeedsManagement,
	decisionNeedsNote,
	nextRatingCode,
	nextReviewDate,
	outsourcingDecision,
	prefillScores,
	resolveSupplierMethod,
	summarizeRating,
} from "@/lib/compliance/supplier-rating";
import { holdsFunction } from "@/lib/compliance/top-management";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { getOrgSettings, listOrgFrameworks } from "@/lib/org/queries";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";
import {
	completeProviderRatingSchema,
	rateCriterionSchema,
	ratingIdSchema,
	saveRatingProfileSchema,
	startProviderRatingSchema,
} from "@/lib/validation/provider-ratings";

// Interne Lieferantenbewertung: Start mit Kriterien-Schnappschuss und
// Vorbelegung aus Stammdaten, Bewertung je Kriterium (mehrere Personen,
// gespeichert sofort), Steckbrief mit Auslagerungs-Entscheidung, Abschluss
// mit Maßnahmen (Aufgaben) und Freigabe — bei rotem Ergebnis über den
// Workflow provider_onboarding bzw. nur durch die Geschäftsleitung.

const PATH = "/dienstleister";

async function loadRating(tx: OrgTx, orgId: string, id: string) {
	const [r] = await tx
		.select()
		.from(providerRatings)
		.where(
			and(
				eq(providerRatings.id, id),
				eq(providerRatings.organizationId, orgId),
			),
		)
		.limit(1);
	return r ?? null;
}

async function loadProvider(tx: OrgTx, orgId: string, id: string) {
	const [p] = await tx
		.select()
		.from(providers)
		.where(and(eq(providers.id, id), eq(providers.organizationId, orgId)))
		.limit(1);
	return p ?? null;
}

async function startProviderRatingImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ provider: ["update"] });
	const parsed = startProviderRatingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const p = await loadProvider(tx, c.orgId, parsed.data.providerId);
			if (!p) return { result: fail("notFound"), audit: [] };
			// Höchstens ein Entwurf je Dienstleister — sonst fortsetzen
			const [draft] = await tx
				.select({ id: providerRatings.id })
				.from(providerRatings)
				.where(
					and(
						eq(providerRatings.organizationId, c.orgId),
						eq(providerRatings.providerId, p.id),
						eq(providerRatings.status, "draft"),
					),
				)
				.limit(1);
			if (draft)
				return { result: { ok: true, data: { id: draft.id } }, audit: [] };
			const [settings, fws, codes] = await Promise.all([
				getOrgSettings(tx, c.orgId),
				listOrgFrameworks(tx, c.orgId),
				tx
					.select({ code: providerRatings.code })
					.from(providerRatings)
					.where(eq(providerRatings.organizationId, c.orgId)),
			]);
			const method = resolveSupplierMethod(settings);
			const criteria = applicableCriteria(
				method,
				p,
				fws.map((f) => f.slug),
			);
			const now = new Date();
			const prefill = prefillScores(
				{
					...p,
					dataLocations: p.dataLocations,
				},
				criteria,
			);
			const scores = Object.fromEntries(
				Object.entries(prefill).map(([k, v]) => [
					k,
					{ ...v, ratedBy: c.userId, ratedAt: now.toISOString() },
				]),
			);
			const code = nextRatingCode(
				codes.map((x) => x.code),
				now,
			);
			const [row] = await tx
				.insert(providerRatings)
				.values({
					organizationId: c.orgId,
					providerId: p.id,
					code,
					criteria,
					areaWeights: method.areaWeights,
					scores,
					profile: {
						category: p.category,
						criticality: p.criticality,
					},
					createdByUserId: c.userId,
				})
				.returning({ id: providerRatings.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "provider_rating.start",
					target: `provider:${p.id}`,
					after: {
						ratingId: row.id,
						code,
						criteria: criteria.map((x) => x.code),
						prefilled: Object.keys(prefill),
					},
				},
			};
		},
	);
	revalidatePath(PATH, "layout");
	return res;
}

async function rateCriterionImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ provider: ["update"] });
	const parsed = rateCriterionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	return mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const r = await loadRating(tx, c.orgId, d.ratingId);
		if (!r) return { result: fail("notFound"), audit: [] };
		if (r.status !== "draft") return { result: fail("notDraft"), audit: [] };
		if (!r.criteria.some((x) => x.code === d.code))
			return { result: fail("notFound"), audit: [] };
		const before = r.scores[d.code] ?? null;
		const next = {
			score: d.score,
			note: d.note ?? before?.note,
			ratedBy: c.userId,
			ratedAt: new Date().toISOString(),
		};
		await tx
			.update(providerRatings)
			.set({ scores: { ...r.scores, [d.code]: next }, updatedAt: new Date() })
			.where(eq(providerRatings.id, r.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "provider_rating.rate",
				target: `provider_rating:${r.id}`,
				before: before ? { [d.code]: before } : null,
				after: { [d.code]: { score: d.score, note: next.note ?? null } },
			},
		};
	});
}

async function saveRatingProfileImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ provider: ["update"] });
	const parsed = saveRatingProfileSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { ratingId, ...prof } = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const r = await loadRating(tx, c.orgId, ratingId);
		if (!r) return { result: fail("notFound"), audit: [] };
		if (r.status !== "draft") return { result: fail("notDraft"), audit: [] };
		const p = await loadProvider(tx, c.orgId, r.providerId);
		if (!p) return { result: fail("notFound"), audit: [] };
		const profile = { ...r.profile, ...prof };
		const outs = outsourcingDecision(profile);
		const criticality = profile.criticalFunction
			? "critical"
			: (profile.criticality ?? p.criticality);
		const patch = {
			category: profile.category ?? p.category,
			criticality,
			...(outs.label !== "offen"
				? { isOutsourcing: outs.isOutsourcing, isMaterial: outs.isMaterial }
				: {}),
		} as const;
		await tx
			.update(providerRatings)
			.set({ profile, updatedAt: new Date() })
			.where(eq(providerRatings.id, r.id));
		await tx.update(providers).set(patch).where(eq(providers.id, p.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "provider.update",
				target: `provider:${p.id}`,
				before: {
					category: p.category,
					criticality: p.criticality,
					isOutsourcing: p.isOutsourcing,
					isMaterial: p.isMaterial,
				},
				after: { ...patch, via: `provider_rating:${r.code}` },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

type CompleteResult = {
	decision: "approved" | "approved_with_conditions" | "rejected" | "open";
	approvalPending: boolean;
	taskIds: string[];
};

async function completeProviderRatingImpl(
	input: unknown,
): Promise<ActionResult<CompleteResult>> {
	const c = await requireOrg({ provider: ["update"], assessment: ["apply"] });
	const parsed = completeProviderRatingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<CompleteResult>>(
		toOrgCtx(c),
		async (tx) => {
			const r = await loadRating(tx, c.orgId, d.ratingId);
			if (!r) return { result: fail("notFound"), audit: [] };
			if (r.status !== "draft") return { result: fail("notDraft"), audit: [] };
			const p = await loadProvider(tx, c.orgId, r.providerId);
			if (!p) return { result: fail("notFound"), audit: [] };
			const settings = await getOrgSettings(tx, c.orgId);
			const method = resolveSupplierMethod(settings);
			const sum = summarizeRating(
				r.criteria,
				r.scores,
				r.areaWeights,
				method.thresholds,
			);
			if (sum.open.length > 0 || !sum.level)
				return {
					result: fail("incomplete", {
						scores: [`${sum.open.length} Kriterien sind noch nicht bewertet.`],
					}),
					audit: [],
				};
			const missingNotes = r.criteria.filter((x) => {
				const s = r.scores[x.code];
				return (s?.score ?? 5) <= 2 && !s?.note?.trim();
			});
			if (missingNotes.length > 0)
				return {
					result: fail("incomplete", {
						scores: [
							`Begründung fehlt bei: ${missingNotes.map((x) => x.title).join(", ")}`,
						],
					}),
					audit: [],
				};
			const traffic = sum.level.traffic;
			if (
				decisionNeedsNote(traffic, d.decision) &&
				(d.decisionNote ?? "").trim().length < 10
			)
				return {
					result: fail("Eingaben prüfen", {
						decisionNote: [
							"Begründe die Entscheidung (mindestens 10 Zeichen).",
						],
					}),
					audit: [],
				};

			const now = new Date();
			const today = now.toISOString().slice(0, 10);
			// Freigabe bei Rot nur über Workflow oder Geschäftsleitung
			let decision: CompleteResult["decision"] = d.decision;
			let approvalRequestId: string | null = null;
			let approvalPending = false;
			if (decisionNeedsManagement(traffic, d.decision)) {
				const r2 = await requestApproval(tx, c, {
					kind: "provider_onboarding",
					entityType: "provider_rating",
					entityId: r.id,
					entityOwnerUserId: p.ownerUserId,
					title: `${p.name} · ${r.code} (${sum.level.level})`,
					link: `${PATH}/${p.id}/bewertung/${r.id}`,
					selfApprovalReason: d.selfApprovalReason,
				});
				if (r2.ok) {
					approvalRequestId = r2.requestId;
					if (r2.status === "pending") {
						decision = "open";
						approvalPending = true;
					}
				} else if (r2.error === "workflow_disabled") {
					const assignments = await tx
						.select({
							function: roleAssignments.function,
							userId: roleAssignments.userId,
							deputyUserId: roleAssignments.deputyUserId,
						})
						.from(roleAssignments)
						.where(eq(roleAssignments.organizationId, c.orgId));
					if (!holdsFunction(assignments, c.userId))
						return { result: fail("needsManagement"), audit: [] };
				} else {
					return { result: fail(r2.error), audit: [] };
				}
			}

			// Maßnahmen → Aufgaben am Dienstleister
			const measures: RatingMeasure[] = [];
			for (const m of d.measures) {
				const cat = SUPPLIER_MEASURE_BY_CODE.get(m.code);
				if (!cat) continue;
				const owner = m.ownerUserId ?? p.ownerUserId ?? c.userId;
				const [task] = await tx
					.insert(tasks)
					.values({
						organizationId: c.orgId,
						title: `${p.name}: ${cat.text}`.slice(0, 200),
						description: `Maßnahme aus der Lieferantenbewertung ${r.code} (${sum.level.level}). ${cat.hint}`,
						assigneeUserId: owner,
						createdByUserId: c.userId,
						priority: traffic === "red" ? "high" : "normal",
						dueAt:
							m.dueAt ??
							new Date(now.getTime() + 60 * 86_400_000)
								.toISOString()
								.slice(0, 10),
						entityType: "provider",
						entityId: p.id,
						sourceKind: "assessment",
					})
					.returning({ id: tasks.id });
				measures.push({
					code: m.code,
					title: cat.text,
					taskId: task?.id ?? null,
				});
				if (owner !== c.userId)
					await notify(tx, {
						orgId: c.orgId,
						recipients: [owner],
						actorUserId: c.userId,
						kind: "task_assigned",
						title: `Maßnahme: ${cat.text}`.slice(0, 200),
						link: `${PATH}/${p.id}?tab=bewertungen`,
					});
			}

			const nextAt = nextReviewDate(now, sum.level, p.criticality, method);
			const total = Math.round((sum.total ?? 0) * 100) / 100;
			await tx
				.update(providerRatings)
				.set({
					status: "completed",
					completedAt: now,
					generalScore: sum.general,
					securityScore: sum.security,
					totalScore: sum.total,
					level: sum.level.level,
					traffic,
					measures,
					decision,
					decisionNote: d.decisionNote?.trim() || null,
					decidedByUserId: decision === "open" ? null : c.userId,
					decidedAt: decision === "open" ? null : now,
					approvalRequestId,
					profile: { ...r.profile, requestedDecision: d.decision },
					nextAssessmentAt: nextAt,
					updatedAt: now,
				})
				.where(eq(providerRatings.id, r.id));
			const dueDiligence = {
				method: "rating",
				ratingId: r.id,
				ratingCode: r.code,
				score: String(total),
				level: sum.level.level,
				traffic,
				recommendation: sum.level.recommendation,
				decision,
				decisionNote: d.decisionNote?.trim() || null,
				assessedAt: today,
			};
			await tx
				.update(providers)
				.set({
					dueDiligence,
					lastAssessmentAt: today,
					nextAssessmentAt: nextAt,
					riskAnalysisAt: today,
				})
				.where(eq(providers.id, p.id));
			const audits: AuditInput[] = [
				{
					action: "provider.update",
					target: `provider:${p.id}`,
					before: {
						dueDiligence: p.dueDiligence,
						lastAssessmentAt: p.lastAssessmentAt,
						nextAssessmentAt: p.nextAssessmentAt,
					},
					after: {
						dueDiligence,
						lastAssessmentAt: today,
						nextAssessmentAt: nextAt,
						via: `provider_rating:${r.code}`,
					},
				},
				{
					action: "provider_rating.completed",
					target: `provider_rating:${r.id}`,
					before: { status: "draft" },
					after: {
						status: "completed",
						general: sum.general,
						security: sum.security,
						total: sum.total,
						level: sum.level.level,
						traffic,
						decision,
						requestedDecision: d.decision,
						approvalRequestId,
						measures: measures.map((m) => m.code),
					},
				},
			];
			return {
				result: {
					ok: true,
					data: {
						decision,
						approvalPending,
						taskIds: measures.flatMap((m) => (m.taskId ? [m.taskId] : [])),
					},
				},
				audit: audits,
			};
		},
	);
	revalidatePath(PATH, "layout");
	return res;
}

async function deleteRatingDraftImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ provider: ["update"] });
	const parsed = ratingIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const r = await loadRating(tx, c.orgId, parsed.data.ratingId);
		if (!r) return { result: fail("notFound"), audit: [] };
		if (r.status !== "draft") return { result: fail("notDraft"), audit: [] };
		await tx.delete(providerRatings).where(eq(providerRatings.id, r.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "provider_rating.delete",
				target: `provider:${r.providerId}`,
				before: { ratingId: r.id, code: r.code, scores: r.scores },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

export const startProviderRating = safeAction(
	"startProviderRating",
	startProviderRatingImpl,
);
export const rateCriterion = safeAction("rateCriterion", rateCriterionImpl);
export const saveRatingProfile = safeAction(
	"saveRatingProfile",
	saveRatingProfileImpl,
);
export const completeProviderRating = safeAction(
	"completeProviderRating",
	completeProviderRatingImpl,
);
export const deleteRatingDraft = safeAction(
	"deleteRatingDraft",
	deleteRatingDraftImpl,
);
