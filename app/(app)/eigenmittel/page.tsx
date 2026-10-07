import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { OwnFundsExtras } from "@/app/actions/casp";
import {
	OwnFundsApproveButton,
	OwnFundsForm,
} from "@/components/casp/own-funds-form";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers } from "@/lib/auth/org";
import { roleAllows } from "@/lib/auth/permissions";
import { micarClassFor } from "@/lib/compliance/own-funds";
import { fmtDate } from "@/lib/compliance/page-data";
import { getOrgProfile } from "@/lib/compliance/queries";
import { listOwnFundsCalculations } from "@/lib/compliance/queries-p4";
import { readOrg } from "@/lib/db/with-org";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const eur = new Intl.NumberFormat("de-DE", {
	style: "currency",
	currency: "EUR",
	maximumFractionDigits: 0,
});
const money = (v: string | null | undefined) =>
	v === null || v === undefined ? "—" : eur.format(Number(v));

// /eigenmittel — Eigenmittel-Rechner (MiCAR Art. 67 + ZAG §§ 12/15) mit
// GL-Freigabe (Workflow own_funds) und Tab Risikotragfähigkeit (AT 4.1).
export default async function OwnFundsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ own_funds: ["read"] });
	const sp = await searchParams;
	const tab =
		one(sp.tab) === "risikotragfaehigkeit"
			? "risikotragfaehigkeit"
			: "berechnung";
	const t = await getTranslations("OwnFunds");
	const ts = await getTranslations("Status");
	const canEdit = roleAllows(ctx.orgRole, { own_funds: ["update"] });
	const memberCount = (await listOrgMembers(ctx.orgId)).length;
	const { rows, profile } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listOwnFundsCalculations(tx, ctx.orgId),
		profile: await getOrgProfile(tx, ctx.orgId),
	}));
	const latestApproved = rows.find((r) => r.status === "approved");
	const latest = rows[0];
	const suggestedClass = micarClassFor(profile?.profile.caspServices ?? []);
	const extrasOf = (r: (typeof rows)[number]) =>
		(r.riskBearingCapacity as unknown as OwnFundsExtras | null) ?? null;

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={canEdit ? <OwnFundsForm /> : undefined}
			/>
			<UrlTabs
				base="/eigenmittel"
				active={tab}
				tabs={[
					{ value: "berechnung", label: t("tabCalc") },
					{ value: "risikotragfaehigkeit", label: t("tabRbc") },
				]}
			/>

			{tab === "berechnung" && (
				<section className="flex flex-col gap-4">
					<div className="grid gap-3 text-sm sm:grid-cols-4">
						<div className="rounded-md border p-3">
							<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
								{t("suggestedClass")}
							</p>
							<p className="font-serif-display text-2xl text-primary">
								{suggestedClass}
							</p>
							<p className="text-muted-foreground text-xs">
								{t("suggestedClassHint")}
							</p>
						</div>
						<div className="rounded-md border p-3">
							<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
								{t("latestRequired")}
							</p>
							<p className="font-serif-display text-2xl text-primary">
								{money(latest?.totalRequired)}
							</p>
							<p className="text-muted-foreground text-xs">
								{latest?.periodLabel ?? "—"}
							</p>
						</div>
						<div className="rounded-md border p-3">
							<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
								{t("latestBuffer")}
							</p>
							<p
								className={`font-serif-display text-2xl ${latest?.buffer && Number(latest.buffer) < 0 ? "text-destructive" : "text-primary"}`}
							>
								{money(latest?.buffer)}
							</p>
						</div>
						<div className="rounded-md border p-3">
							<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
								{t("approvedRun")}
							</p>
							<p className="font-serif-display text-2xl text-primary">
								{latestApproved ? latestApproved.periodLabel : "—"}
							</p>
							<p className="text-muted-foreground text-xs">
								{latestApproved
									? t("approvedBy", {
											name: latestApproved.approvedByName ?? "",
										})
									: t("noApprovedRun")}
							</p>
						</div>
					</div>
					<p className="text-muted-foreground text-sm">{t("calcLead")}</p>
					{rows.length === 0 ? (
						<EmptyState
							title={t("empty")}
							lead={t("emptyLead")}
							requiredBy={t("requiredBy")}
							actions={canEdit ? <OwnFundsForm /> : undefined}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-24">{t("period")}</TableHead>
									<TableHead className="w-28">{t("micarRequired")}</TableHead>
									<TableHead className="w-28">{t("zagRequired")}</TableHead>
									<TableHead className="w-32">{t("totalRequired")}</TableHead>
									<TableHead className="w-32">{t("available")}</TableHead>
									<TableHead className="w-28">{t("buffer")}</TableHead>
									<TableHead className="w-28">{t("status")}</TableHead>
									<TableHead className="w-64">{t("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((r) => {
									const x = extrasOf(r);
									return (
										<TableRow key={r.id}>
											<TableCell className="font-mono text-xs">
												{r.periodLabel}
											</TableCell>
											<TableCell className="text-xs">
												{money(r.micarRequired)}
												<p className="text-muted-foreground">
													{r.micarClass
														? t("classShort", { n: r.micarClass })
														: "—"}
												</p>
											</TableCell>
											<TableCell className="text-xs">
												{money(r.zagRequired)}
												<p className="text-muted-foreground">
													{r.zagMethod
														? t("methodShort", { m: r.zagMethod })
														: "—"}
												</p>
											</TableCell>
											<TableCell className="font-medium">
												{money(r.totalRequired)}
											</TableCell>
											<TableCell>{money(r.availableOwnFunds)}</TableCell>
											<TableCell>
												{r.buffer === null ? (
													"—"
												) : (
													<Badge
														variant={
															x?.result.status === "short"
																? "destructive"
																: x?.result.status === "tight"
																	? "warning"
																	: "success"
														}
													>
														{money(r.buffer)}
													</Badge>
												)}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														r.status === "approved" ? "success" : "outline"
													}
												>
													{t(`ostatus_${r.status}`)}
												</Badge>
												{r.approvedAt && (
													<p className="text-[0.65rem] text-muted-foreground">
														{fmtDate.format(r.approvedAt)}
													</p>
												)}
											</TableCell>
											<TableCell>
												{canEdit && r.status === "draft" && (
													<div className="flex flex-wrap items-center gap-1">
														<OwnFundsForm
															initial={{
																id: r.id,
																periodLabel: r.periodLabel,
																micarClass:
																	(r.micarClass as 1 | 2 | 3 | null) ?? null,
																fixedOverheadsPrevYear:
																	r.fixedOverheadsPrevYear ?? "",
																zagMethod: r.zagMethod ?? null,
																zagServiceKind:
																	x?.serviceKind ?? "money_remittance_only",
																monthlyPaymentVolume:
																	r.monthlyPaymentVolume ?? "",
																relevantIndicator:
																	x?.relevantIndicator === null ||
																	x?.relevantIndicator === undefined
																		? ""
																		: String(x.relevantIndicator),
																availableOwnFunds: r.availableOwnFunds ?? "",
																liquidityBuffer:
																	x?.liquidityBuffer === null ||
																	x?.liquidityBuffer === undefined
																		? ""
																		: String(x.liquidityBuffer),
																riskAmounts: (x?.riskAmounts ?? []).map(
																	(a) => ({
																		category: a.category,
																		amount: String(a.amount),
																	}),
																),
															}}
														/>
														<OwnFundsApproveButton
															id={r.id}
															soloHint={memberCount <= 1}
														/>
													</div>
												)}
												{r.status === "draft" && !canEdit && (
													<span className="text-muted-foreground text-xs">
														{ts("approvalRequired")}
													</span>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
					<p className="text-muted-foreground text-xs">{t("disclaimer")}</p>
				</section>
			)}

			{tab === "risikotragfaehigkeit" && (
				<section className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">{t("rbcLead")}</p>
					{(() => {
						const run = latestApproved ?? latest;
						const x = run ? extrasOf(run) : null;
						if (!run || !x?.rbc)
							return (
								<EmptyState
									title={t("rbcEmpty")}
									lead={t("rbcEmptyLead")}
									requiredBy={t("requiredByRbc")}
									actions={canEdit ? <OwnFundsForm /> : undefined}
								/>
							);
						const rbc = x.rbc;
						return (
							<>
								<div className="grid gap-3 text-sm sm:grid-cols-4">
									<div className="rounded-md border p-3">
										<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
											{t("potential")}
										</p>
										<p className="font-serif-display text-2xl text-primary">
											{eur.format(rbc.potential)}
										</p>
										<p className="text-muted-foreground text-xs">
											{run.periodLabel}
										</p>
									</div>
									<div className="rounded-md border p-3">
										<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
											{t("totalRisk")}
										</p>
										<p className="font-serif-display text-2xl text-primary">
											{eur.format(rbc.totalRisk)}
										</p>
									</div>
									<div className="rounded-md border p-3">
										<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
											{t("utilisation")}
										</p>
										<p
											className={`font-serif-display text-2xl ${rbc.status === "exceeded" ? "text-destructive" : "text-primary"}`}
										>
											{rbc.utilisationPct === null
												? "—"
												: `${rbc.utilisationPct} %`}
										</p>
										<Progress
											value={Math.min(100, rbc.utilisationPct ?? 0)}
											className="mt-2"
										/>
									</div>
									<div className="rounded-md border p-3">
										<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
											{t("headroom")}
										</p>
										<p
											className={`font-serif-display text-2xl ${rbc.headroom < 0 ? "text-destructive" : "text-primary"}`}
										>
											{eur.format(rbc.headroom)}
										</p>
										<Badge
											variant={
												rbc.status === "exceeded"
													? "destructive"
													: rbc.status === "tight"
														? "warning"
														: "success"
											}
										>
											{t(`rbc_${rbc.status}`)}
										</Badge>
									</div>
								</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t("riskCategory")}</TableHead>
											<TableHead className="w-40 text-right">
												{t("amount")}
											</TableHead>
											<TableHead className="w-32 text-right">
												{t("share")}
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{rbc.byCategory.map((c) => (
											<TableRow key={c.category}>
												<TableCell>
													{t(`rc_${c.category}` as "rc_operational")}
												</TableCell>
												<TableCell className="text-right">
													{eur.format(c.amount)}
												</TableCell>
												<TableCell className="text-right">
													{c.sharePct} %
												</TableCell>
											</TableRow>
										))}
										{rbc.byCategory.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={3}
													className="text-muted-foreground"
												>
													{t("noRisks")}
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
								<p className="text-muted-foreground text-xs">
									{t("rbcHint")}{" "}
									<Link
										href="/risiken"
										className="text-primary hover:underline"
									>
										/risiken
									</Link>
								</p>
							</>
						);
					})()}
				</section>
			)}
		</>
	);
}
