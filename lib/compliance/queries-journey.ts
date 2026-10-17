import {
	and,
	count,
	eq,
	exists,
	inArray,
	isNull,
	ne,
	notExists,
	or,
	sql,
} from "drizzle-orm";
import { invitation, member } from "@/db/auth-schema";
import {
	approvalRequests,
	approvalWorkflows,
	auditProgrammes,
	controlEvidence,
	controlImplementations,
	documents,
	managementReviews,
	processAssets,
	processes,
	processProviders,
	providers,
	resolutions,
	risks,
	trainingAssignments,
	trainingRequirements,
} from "@/db/schema";
import type { ApprovalStep } from "@/db/schema/grc";
import { workflowReadiness } from "@/lib/approvals/rules";
import { loadCandidates } from "@/lib/approvals/service";
import type { OrgTx } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";
import {
	requiredResolutions,
	resolutionCoverage,
} from "./catalog/resolutions-required";
import type { JourneyFacts } from "./journey";
import type { OrgCoverage } from "./queries";
import { governanceStatus } from "./queries-p3";
import { DEFAULT_RISK_APPETITE } from "./risk";

// Fakten für lib/compliance/journey.ts — nur Zählabfragen (läuft auf /heute
// bei jedem Aufruf). member/invitation haben kein RLS → Org explizit filtern.
export async function loadJourneyFacts(
	tx: OrgTx,
	orgId: string,
	cov: OrgCoverage,
): Promise<JourneyFacts> {
	const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
	const fws = cov.frameworks;
	const stage = cov.profile.licenceStage;
	const impl = (cond?: ReturnType<typeof eq>) =>
		n(
			tx
				.select({ n: count() })
				.from(controlImplementations)
				.where(
					cond
						? and(eq(controlImplementations.organizationId, orgId), cond)
						: eq(controlImplementations.organizationId, orgId),
				),
		);
	const [
		settings,
		memberCount,
		invitationCount,
		gov,
		candidates,
		workflows,
		controlsTotal,
		controlsWithOwner,
		controlsStarted,
		controlsImplemented,
		implementedWithoutEvidence,
		documentsValid,
		providerCount,
		riskCount,
		processesLinked,
		trainingReqs,
		trainingAssigned,
		effectiveResolutions,
		auditProgrammeCount,
		reviewsDone,
	] = await Promise.all([
		getOrgSettings(tx, orgId),
		n(
			tx
				.select({ n: count() })
				.from(member)
				.where(eq(member.organizationId, orgId)),
		),
		n(
			tx
				.select({ n: count() })
				.from(invitation)
				.where(
					and(
						eq(invitation.organizationId, orgId),
						eq(invitation.status, "pending"),
					),
				),
		),
		governanceStatus(tx, orgId, fws, stage),
		loadCandidates(tx, orgId),
		tx
			.select({ steps: approvalWorkflows.steps })
			.from(approvalWorkflows)
			.where(
				and(
					eq(approvalWorkflows.organizationId, orgId),
					eq(approvalWorkflows.enabled, true),
				),
			),
		impl(),
		impl(sql`${controlImplementations.ownerUserId} is not null`),
		impl(ne(controlImplementations.status, "not_started")),
		impl(eq(controlImplementations.status, "implemented")),
		impl(
			and(
				eq(controlImplementations.status, "implemented"),
				notExists(
					tx
						.select({ one: sql`1` })
						.from(controlEvidence)
						.where(
							eq(controlEvidence.implementationId, controlImplementations.id),
						),
				),
			) as ReturnType<typeof eq>,
		),
		n(
			tx
				.select({ n: count() })
				.from(documents)
				.where(
					and(
						eq(documents.organizationId, orgId),
						eq(documents.status, "published"),
					),
				),
		),
		n(
			tx
				.select({ n: count() })
				.from(providers)
				.where(eq(providers.organizationId, orgId)),
		),
		n(
			tx
				.select({ n: count() })
				.from(risks)
				.where(eq(risks.organizationId, orgId)),
		),
		n(
			tx
				.select({ n: count() })
				.from(processes)
				.where(
					and(
						eq(processes.organizationId, orgId),
						exists(
							tx
								.select({ one: sql`1` })
								.from(processAssets)
								.where(eq(processAssets.processId, processes.id)),
						),
						exists(
							tx
								.select({ one: sql`1` })
								.from(processProviders)
								.where(eq(processProviders.processId, processes.id)),
						),
					),
				),
		),
		n(
			tx
				.select({ n: count() })
				.from(trainingRequirements)
				.where(eq(trainingRequirements.organizationId, orgId)),
		),
		n(
			tx
				.select({ n: count() })
				.from(trainingAssignments)
				.where(eq(trainingAssignments.organizationId, orgId)),
		),
		// gefasst = ohne Freigabe oder mit erteilter Freigabe (wie listResolutions)
		tx
			.select({
				requiredCode: resolutions.requiredCode,
				date: resolutions.date,
				resolutionNumber: resolutions.resolutionNumber,
			})
			.from(resolutions)
			.leftJoin(
				approvalRequests,
				eq(approvalRequests.id, resolutions.approvalRequestId),
			)
			.where(
				and(
					eq(resolutions.organizationId, orgId),
					or(
						isNull(resolutions.approvalRequestId),
						eq(approvalRequests.status, "approved"),
					),
				),
			),
		n(
			tx
				.select({ n: count() })
				.from(auditProgrammes)
				.where(eq(auditProgrammes.organizationId, orgId)),
		),
		n(
			tx
				.select({ n: count() })
				.from(managementReviews)
				.where(
					and(
						eq(managementReviews.organizationId, orgId),
						inArray(managementReviews.status, ["held", "done"]),
					),
				),
		),
	]);
	const requiredRes = requiredResolutions(fws, stage);
	const resCov = resolutionCoverage(
		requiredRes,
		effectiveResolutions,
		new Date(),
	);
	const pcts = fws
		.map((f) => cov.result.byFramework.get(f)?.coveragePct)
		.filter((p): p is number => typeof p === "number");
	const flags = settings?.setupFlags ?? {};
	return {
		memberCount,
		invitationCount,
		rolesRequired: gov.required.length,
		rolesGaps: gov.coverage.gaps.length,
		workflowGaps: workflows.filter((w) =>
			workflowReadiness(w.steps as ApprovalStep[], candidates).some(
				(s) => s.state === "empty",
			),
		).length,
		appetiteConfirmed:
			Boolean(flags.appetiteConfirmedAt) ||
			riskCount > 0 ||
			JSON.stringify(settings?.riskAppetite ?? DEFAULT_RISK_APPETITE) !==
				JSON.stringify(DEFAULT_RISK_APPETITE),
		nis2: fws.includes("nis2")
			? { checked: (cov.profile.nis2Status ?? "unchecked") !== "unchecked" }
			: undefined,
		tlpt: fws.includes("dora")
			? {
					confirmed:
						Boolean(flags.tlptConfirmedAt) ||
						Boolean(cov.profile.tlptDesignated),
				}
			: undefined,
		controlsTotal,
		controlsWithOwner,
		controlsStarted,
		controlsImplemented,
		implementedWithoutEvidence,
		documentsValid,
		providers: providerCount,
		risksAssessed: riskCount,
		processesLinked,
		trainingRequirements: trainingReqs,
		trainingAssignments: trainingAssigned,
		coverageMinPct: pcts.length > 0 ? Math.min(...pcts) : null,
		resolutionsRequired: requiredRes.length,
		resolutionsGaps: resCov.gaps.length,
		auditProgrammes: auditProgrammeCount,
		managementReviewsDone: reviewsDone,
	};
}
