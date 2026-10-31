import { eq } from "drizzle-orm";
import { assessments } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { loadOrgCatalog } from "@/lib/compliance/org-catalog-server";
import { getOrgProfile, loadApplicability } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import type { CreateAssessmentInput } from "@/lib/validation/assessments";
import { CATALOG_TEMPLATE, catalogQuestions } from "./catalog-template";
import { nextAssessmentCode } from "./state";

// Gap-Analyse anlegen (eine Frage je Control, Schnappschuss der Fragen) —
// aus /gap-analyse und aus der geführten Einrichtung (D5). Läuft in einer
// mutateOrg-Transaktion; der Audit-Eintrag geht an den Aufrufer.
export async function insertSelfAssessment(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	d: CreateAssessmentInput,
): Promise<{
	id: string;
	code: string;
	frameworks: string[];
	questions: number;
	questionCodes: string[];
	audit: AuditInput;
} | null> {
	const p = await getOrgProfile(tx, ctx.orgId);
	if (!p) return null;
	// eingeschaltete eigene Rahmenwerke zählen mit (R4)
	const catalog = await loadOrgCatalog(tx, ctx.orgId);
	const active = [...p.frameworks, ...catalog.activeCustomSlugs];
	const frameworks = (d.frameworks ?? active).filter((s) => active.includes(s));
	if (frameworks.length === 0) return null;
	const manual = new Map<string, boolean>();
	for (const [k, v] of await loadApplicability(tx, ctx.orgId))
		if (v.source === "manual") manual.set(k, v.applicable);
	const existing = await tx
		.select({
			code: assessments.code,
			kind: assessments.kind,
			status: assessments.status,
			questions: assessments.questions,
		})
		.from(assessments)
		.where(eq(assessments.organizationId, ctx.orgId));
	// Nur Neues: Controls, die keine frühere Gap-Analyse abgefragt hat.
	let onlyControls: Set<string> | undefined;
	if (d.onlyNew) {
		const asked = new Set(
			existing
				.filter((x) => x.kind === "self" && x.status !== "cancelled")
				.flatMap((x) => x.questions.map((q) => q.code)),
		);
		const all = catalogQuestions({
			sector: p.profile.sector,
			licenceStage: p.profile.licenceStage,
			caspServices: p.profile.caspServices,
			frameworks,
			tlptDesignated: p.profile.tlptDesignated,
			frameworkVariants: p.profile.frameworkVariants,
			issuesTokens: p.profile.issuesTokens,
			productRoles: p.profile.productRoles,
			asOf: d.asOf ? new Date(`${d.asOf}T12:00:00Z`) : undefined,
			manual,
			catalog,
		});
		onlyControls = new Set(
			all.map((q) => q.code).filter((code) => !asked.has(code)),
		);
	}
	const questions = catalogQuestions({
		sector: p.profile.sector,
		licenceStage: p.profile.licenceStage,
		caspServices: p.profile.caspServices,
		frameworks,
		tlptDesignated: p.profile.tlptDesignated,
		frameworkVariants: p.profile.frameworkVariants,
		issuesTokens: p.profile.issuesTokens,
		productRoles: p.profile.productRoles,
		asOf: d.asOf ? new Date(`${d.asOf}T12:00:00Z`) : undefined,
		manual,
		onlyControls,
		catalog,
	});
	if (questions.length === 0) return null;
	const code = nextAssessmentCode(
		existing.map((x) => x.code),
		"GA",
		new Date(),
	);
	const [row] = await tx
		.insert(assessments)
		.values({
			organizationId: ctx.orgId,
			code,
			kind: "self",
			templateCode: CATALOG_TEMPLATE,
			title: d.title || `Gap-Analyse ${code}`,
			frameworks,
			asOf: d.asOf ?? null,
			questions,
			status: "in_progress",
			ownerUserId: ctx.userId,
		})
		.returning({ id: assessments.id });
	if (!row) throw new Error("insert failed");
	return {
		id: row.id,
		code,
		frameworks,
		questions: questions.length,
		questionCodes: questions.map((q) => q.code),
		audit: {
			action: "assessment.create",
			target: `assessment:${row.id}`,
			after: { code, frameworks, questions: questions.length },
		},
	};
}
