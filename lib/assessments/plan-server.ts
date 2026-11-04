import { and, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { controlImplementations, controls } from "@/db/schema";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { areaOf } from "@/lib/compliance/catalog/domain-functions";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { type FunctionKey, functionLabel } from "@/lib/compliance/function-key";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";
import {
	listMembersForPicker,
	type OrgProfileRow,
	orgCoverage,
} from "@/lib/compliance/queries";
import { getAssessmentDetail } from "@/lib/compliance/queries-assessments";
import type { OrgTx } from "@/lib/db/with-org";
import { orgRoleNames } from "@/lib/org/roles";
import { naConfirmations } from "./na-approval";
import {
	type LaneLabelDeps,
	laneLabelFor,
	type PlanExportInput,
} from "./plan-export";
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

// Für Actions und Exporte: alles laden, was die Seite schon hat, und
// gleich rechnen
async function loadPlanContext(tx: OrgTx, orgId: string, assessmentId: string) {
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
	const plan = await implementationPlan(tx, orgId, {
		assessment: detail.assessment,
		answers: detail.answers,
		controlEvidence: detail.controlEvidence,
		implStatus: detail.implStatus,
		naConfirmed: (q) => confirmations.get(q.code)?.status === "confirmed",
		plan: detail.assessment.plan,
		profile: cov.profile,
		catalog: cov.catalog,
	});
	return { detail, catalog: cov.catalog, plan };
}

export async function loadImplementationPlan(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
): Promise<ImplementationPlan | null> {
	return (await loadPlanContext(tx, orgId, assessmentId))?.plan ?? null;
}

// Exporte (CSV, PDF, Gap-Bericht): Plan mit Namen für Spuren, Controls und
// Rahmenwerke
export async function loadPlanExport(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
): Promise<
	| (PlanExportInput & {
			assessment: { code: string; title: string; frameworks: string[] };
	  })
	| null
> {
	const c = await loadPlanContext(tx, orgId, assessmentId);
	if (!c) return null;
	const laneLabel = await loadLaneLabel(tx, orgId);
	return {
		assessment: {
			code: c.detail.assessment.code,
			title: c.detail.assessment.title,
			frameworks: c.detail.assessment.frameworks,
		},
		schedule: c.plan.schedule,
		readiness: c.plan.readiness,
		title: (code) => CONTROL_BY_CODE.get(code)?.title ?? code,
		laneLabel,
		frameworkName: (slug) => shortFrameworkName(slug, c.catalog),
	};
}

// Namen der Spuren (Funktion, Person, Bereich ohne Zuständigkeit) für Seite
// und Exporte; dieselben Texte wie im Balkenplan
export async function laneLabelDeps(input: {
	members: readonly { userId: string; name: string }[];
	roleNames: Readonly<Record<string, string>>;
}): Promise<LaneLabelDeps> {
	const t = await getTranslations("Assessment");
	const tf = await getTranslations("Functions");
	const tcl = await getTranslations("Controls");
	const names = new Map(input.members.map((m) => [m.userId, m.name]));
	return {
		fn: (key) =>
			functionLabel(key as FunctionKey, (fn) => tf(fn), input.roleNames),
		member: (id) => names.get(id),
		person: t("planPerson"),
		area: (area) =>
			t("planNoOwner", {
				area: tcl.has(`domain_${area}` as "domain_risk")
					? tcl(`domain_${area}` as "domain_risk")
					: area === "privacy"
						? t("planAreaPrivacy")
						: area,
			}),
	};
}

export async function loadLaneLabel(
	tx: OrgTx,
	orgId: string,
): Promise<(lane: string) => string> {
	const deps = await laneLabelDeps({
		members: await listMembersForPicker(tx, orgId),
		roleNames: await orgRoleNames(tx, orgId),
	});
	return (lane) => laneLabelFor(lane, deps);
}
