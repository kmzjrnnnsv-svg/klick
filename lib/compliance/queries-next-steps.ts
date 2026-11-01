import { sql } from "drizzle-orm";
import { catalogQuestions } from "@/lib/assessments/catalog-template";
import { orgDerived } from "@/lib/cache/org-derived";
import {
	requiredResolutions,
	resolutionCoverage,
} from "@/lib/compliance/catalog/resolutions-required";
import type { NextStepFacts } from "@/lib/compliance/next-steps";
import type { OrgCoverage } from "@/lib/compliance/queries";
import { governanceStatus, listResolutions } from "@/lib/compliance/queries-p3";
import { loadReadiness } from "@/lib/compliance/queries-readiness";
import { loadRiskProposals } from "@/lib/compliance/queries-risk-sources";
import type { ReadinessResult } from "@/lib/compliance/readiness";
import { DEFAULT_RISK_APPETITE } from "@/lib/compliance/risk";
import type { OrgTx } from "@/lib/db/with-org";
import { SETUP_STEPS, type SetupState } from "@/lib/setup/steps";

// Zahlen für „Als Nächstes“ (S2), die für die ganze Org gelten. Teuer
// (Besetzung, Beschlüsse, Prüfungsreife, Vorschläge) und deshalb über den
// Zwischenspeicher je Org: neu gerechnet nur, wenn sich in der Org etwas
// geändert hat (Kopf der Prüfsummen-Kette). Zähler laufen als count in SQL.
// Was nur die Person betrifft (Einrichtung, Gap-Analyse), ergänzt die Seite.

export type OrgNextStepFacts = Omit<NextStepFacts, "setup" | "gap">;

const n = (rows: { n: number | string | null }[]) => Number(rows[0]?.n ?? 0);

// Prüfungsreife je Rahmenwerk in Kurzform (Überblick), aus derselben Rechnung
export type ReadinessSummary = {
	framework: string;
	score: number | null;
	verdict: ReadinessResult["verdict"];
};

export async function loadOrgNextStepFacts(
	tx: OrgTx,
	orgId: string,
	now = new Date(),
): Promise<OrgNextStepFacts> {
	return (await loadOrgStatus(tx, orgId, now)).next;
}

export async function loadOrgStatus(
	tx: OrgTx,
	orgId: string,
	now = new Date(),
): Promise<{ next: OrgNextStepFacts; readiness: ReadinessSummary[] }> {
	const day = now.toISOString().slice(0, 10);
	return orgDerived(tx, orgId, `org-status:${day}`, async () => {
		// Prüfungsreife bringt die Abdeckung der Org gleich mit
		const readiness = await loadReadiness(tx, orgId, { asOf: now });
		const cov = readiness?.cov ?? null;
		const fws = [...(cov?.frameworks ?? [])];
		const stage = cov?.profile.licenceStage ?? "0_vorbereitung";
		const [gov, resolutions, proposals, counts] = await Promise.all([
			governanceStatus(tx, orgId, fws, stage),
			listResolutions(tx, orgId),
			cov
				? loadRiskProposals(tx, orgId, cov, now)
				: Promise.resolve({ proposals: [] }),
			countFacts(tx, orgId, day),
		]);
		const resCov = resolutionCoverage(
			requiredResolutions(fws, stage),
			resolutions
				.filter((r) => r.effective)
				.map((r) => ({
					requiredCode: r.requiredCode,
					date: r.date,
					resolutionNumber: r.resolutionNumber,
				})),
			now,
		);
		const top = readiness?.combined.blockers[0] ?? null;
		const controlsStarted = [...(cov?.implStatus.values() ?? [])].filter(
			(s) => s !== "not_started",
		).length;
		const next: OrgNextStepFacts = {
			overdueObligations: counts.overdueRuns,
			roleGaps: gov.coverage.gaps.length,
			overdueNonconformities: counts.overdueNcs,
			sodBlocks: gov.sod.filter((v) => v.rule.severity === "block").length,
			resolutionGaps: resCov.gaps.length,
			blocker: top
				? {
						kind: top.kind,
						severity: top.severity,
						label: top.label,
						href: top.href,
						gain: top.gain,
					}
				: null,
			controlsStarted,
			processesWithoutAccountable: counts.processesWithoutA,
			riskProposals: proposals.proposals.length,
			teamInvited: counts.members > 1 || counts.invitations > 0,
			// bestätigt, sobald es Risiken gibt, die Methode bestätigt ist oder
			// der Appetit vom Standard abweicht
			appetiteConfirmed:
				counts.risks > 0 ||
				counts.riskMethodConfirmed ||
				(counts.riskAppetite?.acceptable ??
					DEFAULT_RISK_APPETITE.acceptable) !==
					DEFAULT_RISK_APPETITE.acceptable ||
				(counts.riskAppetite?.tolerable ?? DEFAULT_RISK_APPETITE.tolerable) !==
					DEFAULT_RISK_APPETITE.tolerable,
			hasDocuments: counts.documents > 0,
			hasProviders: counts.providers > 0,
			processLinked: counts.processLinked,
		};
		return {
			next,
			readiness: (readiness?.results ?? []).map((r) => ({
				framework: r.framework,
				score: r.score,
				verdict: r.verdict,
			})),
		};
	});
}

// Alle Zähler in einer Runde, je eine indizierte Abfrage mit Org vorn
async function countFacts(tx: OrgTx, orgId: string, today: string) {
	const [
		overdueRuns,
		overdueNcs,
		processesWithoutA,
		members,
		invitations,
		risks,
		documents,
		providers,
		processLinked,
		settings,
	] = await Promise.all([
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from obligation_runs
			where organization_id = ${orgId} and status not in ('done', 'waived')
			  and completed_at is null and due_at < ${today}::date`),
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from nonconformities
			where organization_id = ${orgId} and status in ('open', 'in_progress')
			  and due_at < ${today}::date`),
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from processes p
			where p.organization_id = ${orgId} and p.status <> 'retired'
			  and not exists (select 1 from process_raci r
			    where r.organization_id = ${orgId} and r.process_id = p.id and r.raci = 'A')`),
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from member where organization_id = ${orgId}`),
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from invitation
			where organization_id = ${orgId} and status = 'pending'`),
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from (select 1 from risks
			  where organization_id = ${orgId} limit 1) x`),
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from (select 1 from documents
			  where organization_id = ${orgId} limit 1) x`),
		tx.execute<{ n: number }>(sql`
			select count(*)::int as n from (select 1 from providers
			  where organization_id = ${orgId} limit 1) x`),
		tx.execute<{ ok: boolean }>(sql`
			select exists (select 1 from processes p
			  where p.organization_id = ${orgId} and p.status = 'active'
			    and exists (select 1 from process_assets a
			      where a.organization_id = ${orgId} and a.process_id = p.id)
			    and exists (select 1 from process_providers v
			      where v.organization_id = ${orgId} and v.process_id = p.id)) as ok`),
		tx.execute<{
			appetite: { acceptable?: number; tolerable?: number } | null;
			confirmed: string | null;
		}>(sql`
			select risk_appetite as appetite,
			  setup_flags->>'riskMethodConfirmedAt' as confirmed
			from org_settings where organization_id = ${orgId}`),
	]);
	return {
		overdueRuns: n(overdueRuns),
		overdueNcs: n(overdueNcs),
		processesWithoutA: n(processesWithoutA),
		members: n(members),
		invitations: n(invitations),
		risks: n(risks),
		documents: n(documents),
		providers: n(providers),
		processLinked: Boolean(processLinked[0]?.ok),
		riskMethodConfirmed: Boolean(settings[0]?.confirmed),
		riskAppetite: settings[0]?.appetite ?? null,
	};
}

// Was nur die Person betrifft: Einrichtung fortsetzen (wer sie darf) und die
// Gap-Analyse (offene fortsetzen, sonst die erste starten, wer sie anlegen
// darf). Die Abdeckung wird nur geladen, wenn eine neue angeboten wird.
export async function personalStepFacts(opts: {
	setup: SetupState;
	canSetup: boolean;
	canCreateGap: boolean;
	gapAnalyses: readonly {
		id: string;
		title: string;
		status: string;
		answered: number;
		total: number;
	}[];
	coverage: () => Promise<OrgCoverage | null>;
}): Promise<Pick<NextStepFacts, "setup" | "gap">> {
	const { setup } = opts;
	const open = opts.gapAnalyses.find((a) =>
		["draft", "in_progress", "submitted", "in_review"].includes(a.status),
	);
	let startCount = 0;
	if (
		!opts.gapAnalyses.some((a) => a.status !== "cancelled") &&
		opts.canCreateGap
	) {
		const cov = await opts.coverage();
		if (cov)
			startCount = catalogQuestions({
				sector: cov.profile.sector,
				licenceStage: cov.profile.licenceStage,
				caspServices: cov.profile.caspServices,
				frameworks: cov.frameworks,
				tlptDesignated: cov.profile.tlptDesignated,
				frameworkVariants: cov.profile.frameworkVariants,
				issuesTokens: cov.profile.issuesTokens,
				productRoles: cov.profile.productRoles,
				catalog: cov.catalog,
			}).length;
	}
	return {
		setup:
			opts.canSetup && !setup.completed && setup.next
				? {
						next: setup.next,
						done: setup.done.length,
						total: SETUP_STEPS.length,
					}
				: null,
		gap: {
			open: open
				? {
						id: open.id,
						title: open.title,
						answered: open.answered,
						total: open.total,
					}
				: null,
			startCount,
		},
	};
}
