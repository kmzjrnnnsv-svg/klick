import { eq } from "drizzle-orm";
import { assessments } from "@/db/schema";
import type { AssessmentQuestion } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { loadOrgCatalog } from "@/lib/compliance/org-catalog-server";
import { getOrgProfile, loadApplicability } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import type { CreateAssessmentInput } from "@/lib/validation/assessments";
import { CATALOG_TEMPLATE, catalogQuestions } from "./catalog-template";
import { extendQuestions, shortCheck } from "./short-check";
import { nextAssessmentCode } from "./state";

// Gap-Analyse anlegen (eine Frage je Control, Schnappschuss der Fragen) —
// aus /gap-analyse und aus der geführten Einrichtung (D5). Läuft in einer
// mutateOrg-Transaktion; der Audit-Eintrag geht an den Aufrufer.
// Eingaben für den Fragebogen aus dem Katalog der Org: Profil, manuelle
// Anwendbarkeit, eingeschaltete eigene Rahmenwerke (R4)
async function catalogInput(
	tx: OrgTx,
	orgId: string,
	wanted: readonly string[] | undefined,
	asOf: string | null | undefined,
) {
	const p = await getOrgProfile(tx, orgId);
	if (!p) return null;
	const catalog = await loadOrgCatalog(tx, orgId);
	const active = [...p.frameworks, ...catalog.activeCustomSlugs];
	const frameworks = (wanted ?? active).filter((s) => active.includes(s));
	if (frameworks.length === 0) return null;
	const manual = new Map<string, boolean>();
	for (const [k, v] of await loadApplicability(tx, orgId))
		if (v.source === "manual") manual.set(k, v.applicable);
	return {
		frameworks,
		questions: (onlyControls?: Set<string>) =>
			catalogQuestions({
				sector: p.profile.sector,
				licenceStage: p.profile.licenceStage,
				caspServices: p.profile.caspServices,
				frameworks,
				tlptDesignated: p.profile.tlptDesignated,
				frameworkVariants: p.profile.frameworkVariants,
				issuesTokens: p.profile.issuesTokens,
				productRoles: p.profile.productRoles,
				asOf: asOf ? new Date(`${asOf}T12:00:00Z`) : undefined,
				manual,
				onlyControls,
				catalog,
			}),
	};
}

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
	const input = await catalogInput(tx, ctx.orgId, d.frameworks, d.asOf);
	if (!input) return null;
	const { frameworks } = input;
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
		const all = input.questions();
		onlyControls = new Set(
			all.map((q) => q.code).filter((code) => !asked.has(code)),
		);
	}
	const full = input.questions(onlyControls);
	// Kurz-Check: zuerst die wichtigsten Fragen, erweitern geht später
	const questions = d.scope === "short" ? shortCheck(full) : full;
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
			after: {
				code,
				frameworks,
				questions: questions.length,
				scope: d.scope ?? "all",
			},
		},
	};
}

// Kurz-Check auf alle Fragen erweitern: dieselben Rahmenwerke und derselbe
// Stichtag wie beim Anlegen; beantwortete Fragen bleiben, wie sie sind.
export async function extendSelfAssessment(
	tx: OrgTx,
	orgId: string,
	a: {
		id: string;
		frameworks: string[];
		asOf: string | null;
		questions: AssessmentQuestion[];
	},
): Promise<{ added: number; audit: AuditInput[] } | null> {
	const input = await catalogInput(tx, orgId, a.frameworks, a.asOf);
	if (!input) return null;
	const r = extendQuestions(a.questions, input.questions());
	if (r.added === 0) return { added: 0, audit: [] };
	await tx
		.update(assessments)
		.set({ questions: r.questions })
		.where(eq(assessments.id, a.id));
	return {
		added: r.added,
		audit: [
			{
				action: "assessment.extended",
				target: `assessment:${a.id}`,
				before: { questions: a.questions.length },
				after: { questions: r.questions.length, added: r.added },
			},
		],
	};
}
