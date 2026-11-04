import { and, eq, inArray } from "drizzle-orm";
import { controlImplementations, controls } from "@/db/schema";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { areaOf } from "@/lib/compliance/catalog/domain-functions";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";
import { type OrgProfileRow, orgCoverage } from "@/lib/compliance/queries";
import { getAssessmentDetail } from "@/lib/compliance/queries-assessments";
import type { OrgTx } from "@/lib/db/with-org";
import { naConfirmations } from "./na-approval";
import { type PlanInputs, planInputs } from "./plan-inputs";
import {
	type FrameworkReadiness,
	frameworkReadiness,
	planSettingsOf,
	type Schedule,
	schedulePlan,
} from "./schedule";

// Umsetzungsplan auf dem Server (Teil C): Spuren aus den Verantwortlichen
// der Controls (Funktion, sonst Person, sonst Bereich) und die Rechnung, die
// Seite und Action teilen.

export type PlanOwner = {
	lane: string;
	ownerFunction: string | null;
	ownerUserId: string | null;
};

export async function planOwners(
	tx: OrgTx,
	orgId: string,
	codes: readonly string[],
): Promise<Map<string, PlanOwner>> {
	const out = new Map<string, PlanOwner>();
	if (codes.length === 0) return out;
	const rows = await tx
		.select({
			code: controls.code,
			ownerFunction: controlImplementations.ownerFunction,
			ownerUserId: controlImplementations.ownerUserId,
		})
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				inArray(controls.code, [...codes]),
			),
		);
	const byCode = new Map(rows.map((r) => [r.code, r]));
	for (const code of codes) {
		const r = byCode.get(code);
		const ctl = CONTROL_BY_CODE.get(code);
		const lane = r?.ownerFunction
			? `f:${r.ownerFunction}`
			: r?.ownerUserId
				? `u:${r.ownerUserId}`
				: `a:${ctl ? areaOf(ctl) : code}`;
		out.set(code, {
			lane,
			ownerFunction: r?.ownerFunction ?? null,
			ownerUserId: r?.ownerUserId ?? null,
		});
	}
	return out;
}

export type ImplementationPlan = PlanInputs & {
	schedule: Schedule;
	readiness: FrameworkReadiness[];
	owners: Map<string, PlanOwner>;
	settings: ReturnType<typeof planSettingsOf>;
};

export function berlinToday(now = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
	}).format(now);
}

export async function implementationPlan(
	tx: OrgTx,
	orgId: string,
	input: Omit<Parameters<typeof planInputs>[0], "profile" | "catalog"> & {
		plan: unknown;
		profile: OrgProfileRow;
		catalog: OrgCatalog;
		today?: string;
	},
): Promise<ImplementationPlan> {
	const p = input.profile;
	const inputs = planInputs({
		...input,
		profile: {
			sector: p.sector,
			licenceStage: p.licenceStage,
			caspServices: p.caspServices,
			tlptDesignated: p.tlptDesignated,
			frameworkVariants: p.frameworkVariants,
			issuesTokens: p.issuesTokens,
			productRoles: p.productRoles,
		},
	});
	const settings = planSettingsOf(input.plan, input.today ?? berlinToday());
	const owners = await planOwners(
		tx,
		orgId,
		inputs.measures.map((m) => m.controlCode),
	);
	const schedule = schedulePlan({
		measures: inputs.measures,
		controls: CONTROL_BY_CODE,
		partial: inputs.partial,
		laneOf: (code) => owners.get(code)?.lane ?? `a:${code}`,
		settings,
	});
	const readiness = frameworkReadiness({
		frameworks: input.assessment.frameworks,
		schedule,
		catalog: inputs.synergy,
		implStatus: inputs.planned,
	});
	return { ...inputs, schedule, readiness, owners, settings };
}

// Für Actions: alles laden, was die Seite schon hat, und gleich rechnen
export async function loadImplementationPlan(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
): Promise<ImplementationPlan | null> {
	const detail = await getAssessmentDetail(tx, orgId, assessmentId);
	if (!detail || detail.assessment.kind !== "self") return null;
	const cov = await orgCoverage(tx, orgId);
	if (!cov) return null;
	const confirmations = await naConfirmations(
		tx,
		orgId,
		assessmentId,
		detail.answers,
	);
	return implementationPlan(tx, orgId, {
		assessment: detail.assessment,
		answers: detail.answers,
		controlEvidence: detail.controlEvidence,
		implStatus: detail.implStatus,
		naConfirmed: (q) => confirmations.get(q.code)?.status === "confirmed",
		plan: detail.assessment.plan,
		profile: cov.profile,
		catalog: cov.catalog,
	});
}
