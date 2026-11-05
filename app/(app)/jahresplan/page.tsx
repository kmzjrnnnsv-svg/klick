import { getTranslations } from "next-intl/server";
import { SummaryCard, SummaryGrid } from "@/components/entity/summary-card";
import {
	type PlanRow,
	ProgrammeSection,
	STATE_BADGE,
} from "@/components/isms-plan/programme-section";
import { PageHeader } from "@/components/page-header";
import { SectionSwitch } from "@/components/shell/section-switch";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import {
	ISMS_PROGRAMME,
	ISMS_SCENARIO_B_OWNERS,
	type IsmsItem,
} from "@/lib/compliance/catalog/isms-programme";
import { getOrgProfile } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { loadIsmsFacts } from "@/lib/isms-plan/facts";
import { fmtFte, fmtNum, fmtRange } from "@/lib/isms-plan/format";
import { ismsTree, itemWithChildren, rollupIsms } from "@/lib/isms-plan/rollup";
import { countStates, ismsStatus } from "@/lib/isms-plan/status";

// ISMS-Jahresplan (P1): Vorlage mit Turnus, Aufwand in PT und ISB-Anteil nach
// Szenario A/B, je Punkt verknüpft mit der Stelle in Klick. Die Werte kommen
// aus dem Katalog (lib/compliance/catalog/isms-programme.ts), gerechnet in
// lib/isms-plan/rollup.ts.

async function IsmsPlanPage() {
	const ctx = await requireOrgPage({ obligation: ["read"] });
	const t = await getTranslations("IsmsPlan");
	const { profile, facts } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		profile: await getOrgProfile(tx, ctx.orgId),
		facts: await loadIsmsFacts(tx, ctx.orgId),
	}));
	const isoActive = profile?.frameworks.includes("iso27001") ?? false;
	const statuses = new Map(
		ISMS_PROGRAMME.map((i) => [i.key, ismsStatus(i, facts)] as const),
	);
	const counts = countStates([...statuses.values()]);

	const r = rollupIsms(ISMS_PROGRAMME);
	const tree = ismsTree(ISMS_PROGRAMME);
	const ops = r.sections.find((s) => s.section === "operations");

	// Baum je Abschnitt in Katalog-Reihenfolge, Unterpunkte eingerückt
	function rowsOf(items: IsmsItem[] | undefined, depth: number): PlanRow[] {
		return (items ?? []).flatMap((item) => {
			const kids = tree.get(item.key);
			return [
				{
					item,
					depth,
					status: statuses.get(item.key) ?? {
						state: "none" as const,
						code: "manual",
					},
					withChildren: kids?.length
						? itemWithChildren(item.key, ISMS_PROGRAMME).year
						: undefined,
				},
				...rowsOf(kids, depth + 1),
			];
		});
	}
	const roots = tree.get(null) ?? [];

	return (
		<>
			<SectionSwitch group="planning" current="/jahresplan" ctx={ctx} />
			<PageHeader title={t("title")} lead={t("lead")} />

			<div className="flex flex-col gap-8">
				<SummaryGrid>
					<SummaryCard title={t("cardTotal")}>
						<p className="font-bold text-title-2 tabular-nums">
							{t("ptValue", { pt: fmtRange(r.total.year) })}
						</p>
						<p className="mt-1 text-footnote text-muted-foreground">
							{t("cardTotalHint", {
								middle: fmtNum(r.middle),
								ops: fmtRange(ops?.year ?? [0, 0]),
							})}
						</p>
					</SummaryCard>
					<SummaryCard title={t("cardA")}>
						<p className="font-bold text-title-2 tabular-nums">
							{t("ptValue", { pt: fmtRange(r.total.isbA) })}
						</p>
						<p className="mt-1 text-footnote text-muted-foreground">
							{t("cardAHint", { fte: fmtFte(r.fte.a), days: r.workdays })}
						</p>
					</SummaryCard>
					<SummaryCard title={t("cardB")}>
						<p className="font-bold text-title-2 tabular-nums">
							{t("ptValue", { pt: fmtRange(r.total.isbB) })}
						</p>
						<p className="mt-1 text-footnote text-muted-foreground">
							{t("cardBHint", { fte: fmtFte(r.fte.b) })}
						</p>
						<p className="mt-1 text-footnote text-muted-foreground">
							{t("cardBExtra", {
								extra: fmtRange([
									Math.round(r.scenarioBExtra[0]),
									Math.round(r.scenarioBExtra[1]),
								]),
								owners: fmtRange(ISMS_SCENARIO_B_OWNERS),
							})}
						</p>
					</SummaryCard>
				</SummaryGrid>

				<section aria-labelledby="stand">
					<h2 id="stand" className="mb-2 font-semibold text-title-3">
						{t("colStatus")}
					</h2>
					<div className="flex flex-wrap gap-2">
						{(["ok", "due", "open", "none"] as const).map((st) => (
							<Badge key={st} variant={STATE_BADGE[st]}>
								{t(`state_${st}`)}
								<span className="tabular-nums">{counts[st]}</span>
							</Badge>
						))}
					</div>
					<p className="mt-2 max-w-[46rem] text-footnote text-muted-foreground">
						{t("statusHint")}
					</p>
				</section>

				<section aria-labelledby="ueberblick">
					<h2 id="ueberblick" className="mb-2 font-semibold text-title-3">
						{t("overviewTitle")}
					</h2>
					<div className="rounded-2xl bg-card">
						<Table className="register-table">
							<TableHeader>
								<TableRow>
									<TableHead>{t("colSection")}</TableHead>
									<TableHead className="text-right">{t("colYear")}</TableHead>
									<TableHead className="text-right">{t("colIsbA")}</TableHead>
									<TableHead className="text-right">{t("colIsbB")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{r.sections.map((s, i) => (
									<TableRow key={s.section}>
										<TableCell data-m="title" className="whitespace-normal">
											<a
												href={`#abschnitt-${s.section}`}
												className="hover:underline"
											>
												{i + 1}. {t(`section_${s.section}`)}
											</a>
										</TableCell>
										<TableCell
											data-m="meta"
											className="whitespace-nowrap text-right tabular-nums"
										>
											<span data-m-label>{t("colYear")}:</span>
											{fmtRange(s.year)}
										</TableCell>
										<TableCell
											data-m="meta"
											className="whitespace-nowrap text-right tabular-nums"
										>
											<span data-m-label>{t("colIsbA")}:</span>
											{fmtRange(s.isbA)}
										</TableCell>
										<TableCell
											data-m="meta"
											className="whitespace-nowrap text-right tabular-nums"
										>
											<span data-m-label>{t("colIsbB")}:</span>
											{fmtRange(s.isbB)}
										</TableCell>
									</TableRow>
								))}
								<TableRow className="font-semibold">
									<TableCell data-m="title">{t("total")}</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colYear")}:</span>
										{fmtRange(r.total.year)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbA")}:</span>
										{fmtRange(r.total.isbA)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbB")}:</span>
										{fmtRange(r.total.isbB)}
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell
										data-m="title"
										className="whitespace-normal text-muted-foreground"
									>
										{t("fteRow", { days: r.workdays })}
									</TableCell>
									<TableCell data-m="hide" />
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbA")}:</span>
										{fmtFte(r.fte.a)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbB")}:</span>
										{fmtFte(r.fte.b)}
									</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
					<p className="mt-2 max-w-[46rem] text-footnote text-muted-foreground">
						{t("scenarios")} {t("ownerDefault")}
					</p>
				</section>

				{r.sections.map((s, i) => (
					<ProgrammeSection
						key={s.section}
						index={i + 1}
						section={s.section}
						totals={s}
						isoActive={isoActive}
						rows={rowsOf(
							roots.filter((item) => item.section === s.section),
							0,
						)}
					/>
				))}

				<p className="max-w-[46rem] text-footnote text-muted-foreground">
					{t("source")}
				</p>
			</div>
		</>
	);
}

export default IsmsPlanPage;
