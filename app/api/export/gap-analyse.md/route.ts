import { NextResponse } from "next/server";
import { productMeasures, proposeMeasures } from "@/lib/assessments/measures";
import { scoreAssessment } from "@/lib/assessments/score";
import { answerStates } from "@/lib/assessments/state";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { synergyCatalogFor } from "@/lib/compliance/catalog-view";
import { shortFrameworkName } from "@/lib/compliance/page-data";
import { getOrgProfile } from "@/lib/compliance/queries";
import { getAssessmentDetail } from "@/lib/compliance/queries-assessments";
import { prioritizePlan } from "@/lib/compliance/synergy";
import { readOrg } from "@/lib/db/with-org";
import { buildAssessmentMarkdown } from "@/lib/export/assessment-report";
import {
	auditExport,
	exportGuard,
	markdownResponse,
	stamp,
} from "@/lib/export/respond";

export const dynamic = "force-dynamic";

// Gap-Analyse-Bericht (?id=<assessment>): Ergebnis, Maßnahmenplan, alle
// Fragen mit Bewertung. Auditiert, mit Export-ID.
export async function GET(req: Request) {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const id = new URL(req.url).searchParams.get("id") ?? "";
	if (!/^[0-9a-f-]{36}$/i.test(id))
		return new NextResponse(null, { status: 404 });
	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		detail: await getAssessmentDetail(tx, ctx.orgId, id),
		profile: await getOrgProfile(tx, ctx.orgId),
	}));
	const d = data.detail;
	if (!d || !data.profile) return new NextResponse(null, { status: 404 });
	const a = d.assessment;
	const states = answerStates(a.questions, d.answers, d.controlEvidence);
	const extra = new Map(
		d.answers.map((x) => [
			x.questionCode,
			{ comment: x.comment, naReason: x.naReason },
		]),
	);
	const answers = new Map(
		[...states].map(([k, v]) => [k, { ...v, ...(extra.get(k) ?? {}) }]),
	);
	const p = data.profile.profile;
	const plan = prioritizePlan(
		a.frameworks,
		synergyCatalogFor({
			sector: p.sector,
			licenceStage: p.licenceStage,
			caspServices: p.caspServices,
			frameworks: a.frameworks,
			tlptDesignated: p.tlptDesignated,
			issuesTokens: p.issuesTokens,
			productRoles: p.productRoles,
			frameworkVariants: p.frameworkVariants,
		}),
		d.implStatus,
		300,
	);
	const score = scoreAssessment(a.questions, states);
	const org = await getOrgSummary(ctx.orgId);
	const body = buildAssessmentMarkdown({
		orgName: org?.name ?? "",
		code: a.code,
		title: a.title,
		frameworks: a.frameworks.map((s) => shortFrameworkName(s)),
		status: a.status,
		asOf: a.asOf,
		questions: a.questions,
		answers,
		score,
		measures:
			a.kind === "product" || a.kind === "supplier"
				? productMeasures({ questions: a.questions, answers: states })
				: proposeMeasures({ questions: a.questions, answers: states, plan }),
	});
	const mark = await auditExport(ctx, "assessment_md", a.questions.length, {
		assessment: a.code,
		score: score.score,
	});
	return markdownResponse(`gap-analyse-${a.code}-${stamp()}.md`, body, mark);
}
