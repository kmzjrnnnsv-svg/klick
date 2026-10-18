import { and, eq } from "drizzle-orm";
import {
	amlRiskAnalyses,
	assets,
	decisionRequests,
	documents,
	documentVersions,
	exceptions,
	incidents,
	nonconformities,
	objectives,
	ownFundsCalculations,
	processes,
	providerRatings,
	providers,
	risks,
	scopes,
	tasks,
	trainingRequirements,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { nonconformityFromIncident } from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { syncTrainingAssignments } from "@/lib/trainings/assignments";
import type { DecideResult } from "./service";

// Wendet den Ausgang einer Freigabe auf die Entität an. Wird vom Entscheiden
// (approvals.ts) aufgerufen; die Entitäts-Actions setzen beim Anfragen den
// Zwischenzustand (z. B. document in_review, risk bleibt in_treatment).
export async function applyApprovalOutcome(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	r: Extract<DecideResult, { ok: true }>,
): Promise<AuditInput[]> {
	const approved = r.status === "approved";
	const rejected = r.status === "rejected";
	const extra: AuditInput[] = [];
	// Auslöser des Freigabe-Designers zuerst (gleiche Entität, andere
	// Wirkung: Aufnahme vs. Akzeptanz, Maßnahmenplan vs. Abschluss …)
	switch (r.trigger) {
		case "provider.create": {
			if (approved || rejected)
				await tx
					.update(providers)
					.set({ status: approved ? "active" : "declined" })
					.where(
						and(
							eq(providers.id, r.entityId),
							eq(providers.organizationId, ctx.orgId),
							eq(providers.status, "onboarding"),
						),
					);
			return extra;
		}
		case "asset.create": {
			if (approved || rejected)
				await tx
					.update(assets)
					.set({ status: approved ? "active" : "declined" })
					.where(
						and(
							eq(assets.id, r.entityId),
							eq(assets.organizationId, ctx.orgId),
							eq(assets.status, "pending"),
						),
					);
			return extra;
		}
		case "asset.retire": {
			if (approved)
				await tx
					.update(assets)
					.set({ status: "retired" })
					.where(
						and(
							eq(assets.id, r.entityId),
							eq(assets.organizationId, ctx.orgId),
						),
					);
			return extra;
		}
		case "risk.create": {
			if (approved || rejected)
				await tx
					.update(risks)
					.set({ status: approved ? "open" : "closed" })
					.where(
						and(
							eq(risks.id, r.entityId),
							eq(risks.organizationId, ctx.orgId),
							eq(risks.status, "proposed"),
						),
					);
			return extra;
		}
		case "nonconformity.plan":
		case "nonconformity.close": {
			if (!approved) return extra;
			const closing = r.trigger === "nonconformity.close";
			await tx
				.update(nonconformities)
				.set({ status: closing ? "closed" : "in_progress" })
				.where(
					and(
						eq(nonconformities.id, r.entityId),
						eq(nonconformities.organizationId, ctx.orgId),
					),
				);
			// wie der direkte Abschluss: offene Aufgaben der Abweichung erledigt
			if (closing)
				await tx
					.update(tasks)
					.set({ status: "done", completedAt: new Date() })
					.where(
						and(
							eq(tasks.organizationId, ctx.orgId),
							eq(tasks.entityType, "nonconformity"),
							eq(tasks.entityId, r.entityId),
						),
					);
			return extra;
		}
		case "training.propose": {
			if (approved || rejected) {
				await tx
					.update(trainingRequirements)
					.set({ approvalStatus: approved ? "approved" : "rejected" })
					.where(
						and(
							eq(trainingRequirements.id, r.entityId),
							eq(trainingRequirements.organizationId, ctx.orgId),
						),
					);
				// erst freigegebene Schulungen werden zugewiesen
				if (approved) await syncTrainingAssignments(tx, ctx.orgId);
			}
			return extra;
		}
		case "process.activate":
		case "process.change": {
			// Aktivieren: erst nach Freigabe aktiv. Änderung abgelehnt → Entwurf.
			if (approved && r.trigger === "process.activate")
				await tx
					.update(processes)
					.set({ status: "active" })
					.where(
						and(
							eq(processes.id, r.entityId),
							eq(processes.organizationId, ctx.orgId),
						),
					);
			if (rejected && r.trigger === "process.change")
				await tx
					.update(processes)
					.set({ status: "draft" })
					.where(
						and(
							eq(processes.id, r.entityId),
							eq(processes.organizationId, ctx.orgId),
						),
					);
			return extra;
		}
		case "incident.report":
			// „vorab“: die Aktion prüft den Stand selbst (approvalState)
			return extra;
		default:
			break;
	}
	switch (r.entityType) {
		case "document": {
			const [doc] = await tx
				.select({
					id: documents.id,
					status: documents.status,
					version: documents.version,
				})
				.from(documents)
				.where(
					and(
						eq(documents.id, r.entityId),
						eq(documents.organizationId, ctx.orgId),
					),
				)
				.limit(1);
			if (!doc) return extra;
			if (approved) {
				await tx
					.update(documents)
					.set({ status: "approved" })
					.where(eq(documents.id, doc.id));
				await tx
					.update(documentVersions)
					.set({ approvedByUserId: ctx.userId, approvedAt: new Date() })
					.where(
						and(
							eq(documentVersions.documentId, doc.id),
							eq(documentVersions.version, doc.version),
						),
					);
			} else {
				await tx
					.update(documents)
					.set({ status: "draft" })
					.where(eq(documents.id, doc.id));
			}
			return extra;
		}
		case "risk": {
			if (approved) {
				await tx
					.update(risks)
					.set({
						status: "accepted",
						acceptedByUserId: ctx.userId,
						acceptedAt: new Date(),
					})
					.where(
						and(eq(risks.id, r.entityId), eq(risks.organizationId, ctx.orgId)),
					);
			}
			return extra;
		}
		case "exception": {
			await tx
				.update(exceptions)
				.set({ status: approved ? "approved" : "revoked" })
				.where(
					and(
						eq(exceptions.id, r.entityId),
						eq(exceptions.organizationId, ctx.orgId),
					),
				);
			return extra;
		}
		case "incident": {
			if (approved) {
				const [inc] = await tx
					.select()
					.from(incidents)
					.where(
						and(
							eq(incidents.id, r.entityId),
							eq(incidents.organizationId, ctx.orgId),
						),
					)
					.limit(1);
				if (!inc) return extra;
				await tx
					.update(incidents)
					.set({ status: "closed" })
					.where(eq(incidents.id, inc.id));
				// DORA Art. 13: schwerwiegender Vorfall → Abweichung (Lessons Learned)
				const draft = nonconformityFromIncident(inc);
				if (draft) {
					const nc = await createNonconformity(
						tx,
						{ orgId: ctx.orgId, userId: ctx.userId },
						draft,
					);
					extra.push(nc.audit);
				}
			}
			return extra;
		}
		case "scope": {
			await tx
				.update(scopes)
				.set(
					approved
						? {
								status: "approved",
								approvedByUserId: ctx.userId,
								approvedAt: new Date(),
							}
						: { status: "draft" },
				)
				.where(
					and(eq(scopes.id, r.entityId), eq(scopes.organizationId, ctx.orgId)),
				);
			return extra;
		}
		case "aml_risk_analysis": {
			if (approved) {
				// Vorherige gültige Analyse wird ersetzt; Review in zwölf Monaten.
				const next = new Date();
				next.setUTCFullYear(next.getUTCFullYear() + 1);
				await tx
					.update(amlRiskAnalyses)
					.set({ status: "superseded" })
					.where(
						and(
							eq(amlRiskAnalyses.organizationId, ctx.orgId),
							eq(amlRiskAnalyses.status, "approved"),
						),
					);
				await tx
					.update(amlRiskAnalyses)
					.set({
						status: "approved",
						approvedByUserId: ctx.userId,
						approvedAt: new Date(),
						nextReviewAt: next.toISOString().slice(0, 10),
					})
					.where(
						and(
							eq(amlRiskAnalyses.id, r.entityId),
							eq(amlRiskAnalyses.organizationId, ctx.orgId),
						),
					);
			} else {
				await tx
					.update(amlRiskAnalyses)
					.set({ status: "draft" })
					.where(
						and(
							eq(amlRiskAnalyses.id, r.entityId),
							eq(amlRiskAnalyses.organizationId, ctx.orgId),
						),
					);
			}
			return extra;
		}
		case "own_funds_calculation": {
			await tx
				.update(ownFundsCalculations)
				.set(
					approved
						? {
								status: "approved",
								approvedByUserId: ctx.userId,
								approvedAt: new Date(),
							}
						: { status: "draft" },
				)
				.where(
					and(
						eq(ownFundsCalculations.id, r.entityId),
						eq(ownFundsCalculations.organizationId, ctx.orgId),
					),
				);
			return extra;
		}
		case "objective": {
			// Ziel freigegeben (B5): zählt erst ab jetzt
			const approvalStatus =
				r.status === "approved"
					? ("approved" as const)
					: r.status === "rejected"
						? ("rejected" as const)
						: ("draft" as const);
			await tx
				.update(objectives)
				.set({
					approvalStatus,
					...(approvalStatus === "approved"
						? { approvedByUserId: ctx.userId, approvedAt: new Date() }
						: {}),
				})
				.where(
					and(
						eq(objectives.id, r.entityId),
						eq(objectives.organizationId, ctx.orgId),
					),
				);
			extra.push({
				action: "objective.release",
				target: `objective:${r.entityId}`,
				after: { approvalStatus },
			});
			return extra;
		}
		case "decision_request": {
			// Managementanfrage entschieden (E2); den Beschluss legt
			// resolutionForApproval an, die anfragende Person wird informiert.
			const [q] = await tx
				.select({
					code: decisionRequests.code,
					question: decisionRequests.question,
					requestedByUserId: decisionRequests.requestedByUserId,
				})
				.from(decisionRequests)
				.where(
					and(
						eq(decisionRequests.id, r.entityId),
						eq(decisionRequests.organizationId, ctx.orgId),
					),
				)
				.limit(1);
			if (!q) return extra;
			const outcome =
				r.status === "approved"
					? "approved"
					: r.status === "rejected"
						? "rejected"
						: "changes_requested";
			await tx
				.update(decisionRequests)
				.set({
					status: outcome === "changes_requested" ? "open" : "decided",
					outcome,
					decidedByUserId: ctx.userId,
					decidedAt: new Date(),
				})
				.where(eq(decisionRequests.id, r.entityId));
			await notify(tx, {
				orgId: ctx.orgId,
				recipients: [q.requestedByUserId],
				actorUserId: ctx.userId,
				kind: "approval_decided",
				title: `Entschieden: ${q.code} ${q.question}`.slice(0, 200),
				body:
					outcome === "approved"
						? "Die Geschäftsleitung stimmt zu."
						: outcome === "rejected"
							? "Die Geschäftsleitung lehnt ab."
							: "Die Geschäftsleitung bittet um Überarbeitung.",
				link: "/beschluesse?tab=anfragen",
			});
			extra.push({
				action: "decision_request.decided",
				target: `decision_request:${r.entityId}`,
				after: { outcome },
			});
			return extra;
		}
		case "provider_rating": {
			// Freigabe eines Lieferanten mit rotem Bewertungsergebnis
			const [rating] = await tx
				.select()
				.from(providerRatings)
				.where(
					and(
						eq(providerRatings.id, r.entityId),
						eq(providerRatings.organizationId, ctx.orgId),
					),
				)
				.limit(1);
			if (!rating) return extra;
			const decision = approved
				? (rating.profile.requestedDecision ?? "approved")
				: "rejected";
			await tx
				.update(providerRatings)
				.set({
					decision,
					decidedByUserId: ctx.userId,
					decidedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(providerRatings.id, rating.id));
			const [p] = await tx
				.select({ id: providers.id, dueDiligence: providers.dueDiligence })
				.from(providers)
				.where(eq(providers.id, rating.providerId))
				.limit(1);
			if (p?.dueDiligence?.ratingId === rating.id)
				await tx
					.update(providers)
					.set({ dueDiligence: { ...p.dueDiligence, decision } })
					.where(eq(providers.id, p.id));
			extra.push({
				action: "provider_rating.decided",
				target: `provider_rating:${rating.id}`,
				before: { decision: rating.decision },
				after: { decision, via: "approval" },
			});
			return extra;
		}
		default:
			return extra;
	}
}
