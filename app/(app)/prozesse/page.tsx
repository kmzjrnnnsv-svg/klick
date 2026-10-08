import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { RegisterFilters } from "@/components/entity/register-filters";
import { StatusBadge } from "@/components/entity/status-badge";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
import { DependencyMap } from "@/components/processes/dependency-map";
import {
	ApplyProcessSeedButton,
	ProcessForm,
} from "@/components/processes/process-forms";
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
import { roleAllows } from "@/lib/auth/permissions";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { dependencyMap, listProcesses } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { PROCESS_STATUS, PROCESS_STATUSES } from "@/lib/entities/process";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const CRIT_TONE = {
	critical: "destructive",
	important: "warning",
	standard: "outline",
} as const;
const CATEGORIES = ["core", "support", "management", "control"] as const;

export default async function ProcessesPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ process: ["read"] });
	const sp = await searchParams;
	const tab = one(sp.tab) ?? "landkarte";
	const t = await getTranslations("Processes");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const tf = await getTranslations("Functions");
	const canCreate = roleAllows(ctx.orgRole, { process: ["create"] });

	const { rows, members, nodes } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listProcesses(tx, ctx.orgId),
		members: await listMembersForPicker(tx, ctx.orgId),
		nodes: tab === "abhaengigkeiten" ? await dependencyMap(tx, ctx.orgId) : [],
	}));

	const q = one(sp.q)?.toLowerCase();
	const status = one(sp.status);
	const category = one(sp.category);
	const criticality = one(sp.criticality);
	const mine = one(sp.mine) === "1";
	const unowned = one(sp.unowned) === "1";
	const filtered = rows
		.filter((r) => !q || `${r.code} ${r.name}`.toLowerCase().includes(q))
		.filter((r) => !status || r.status === status)
		.filter((r) => !category || r.category === category)
		.filter((r) => !criticality || r.criticality === criticality)
		.filter(
			(r) =>
				!mine ||
				r.ownerUserId === ctx.userId ||
				r.deputyUserId === ctx.userId ||
				r.assigneeUserId === ctx.userId,
		)
		.filter((r) => !unowned || !r.ownerUserId);
	const critical = rows.filter(
		(r) =>
			r.status !== "retired" &&
			(r.criticality === "critical" || r.criticality === "important"),
	);
	const withoutA = rows.filter((r) => !r.accountable && r.status !== "retired");
	const critLabel = {
		critical: t("crit_critical"),
		important: t("crit_important"),
		standard: t("crit_standard"),
	};
	const accountableLabel = (r: (typeof rows)[number]) =>
		r.accountable
			? tf.has(r.accountable as "management_body")
				? tf(r.accountable as "management_body")
				: r.accountable
			: null;

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canCreate ? (
						<div className="flex flex-wrap gap-2">
							<ApplyProcessSeedButton />
							<ProcessForm members={members} />
						</div>
					) : undefined
				}
			/>
			<UrlTabs
				base="/prozesse"
				active={tab}
				tabs={[
					{ value: "landkarte", label: t("tabMap"), count: rows.length },
					{
						value: "kritisch",
						label: t("tabCritical"),
						count: critical.length,
					},
					{ value: "abhaengigkeiten", label: t("tabDependencies") },
				]}
			/>

			{tab === "kritisch" && (
				<>
					<p className="mb-4 text-muted-foreground text-sm">
						{t("criticalLead")}
					</p>
					{critical.length === 0 ? (
						<p className="text-sm">{t("criticalEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-20">{t("code")}</TableHead>
									<TableHead>{t("name")}</TableHead>
									<TableHead className="w-28">{t("criticality")}</TableHead>
									<TableHead className="w-20 text-right">RTO</TableHead>
									<TableHead className="w-20 text-right">RPO</TableHead>
									<TableHead className="w-20 text-right">MTPD</TableHead>
									<TableHead className="w-40">{t("raciA")}</TableHead>
									<TableHead className="w-28 text-right">
										{t("dependencies")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{critical.map((r) => (
									<TableRow key={r.id}>
										<TableCell className="font-mono text-xs">
											<Link
												href={`/prozesse/${encodeURIComponent(r.code)}`}
												className="hover:underline"
											>
												{r.code}
											</Link>
										</TableCell>
										<TableCell className="font-medium">{r.name}</TableCell>
										<TableCell>
											<Badge variant={CRIT_TONE[r.criticality]}>
												{critLabel[r.criticality]}
											</Badge>
										</TableCell>
										<TableCell className="text-right">
											{r.rtoHours ?? "—"} h
										</TableCell>
										<TableCell className="text-right">
											{r.rpoHours ?? "—"} h
										</TableCell>
										<TableCell className="text-right">
											{r.mtpdHours ?? "—"} h
										</TableCell>
										<TableCell
											className={r.accountable ? "" : "text-destructive"}
										>
											{accountableLabel(r) ?? t("noAccountable")}
										</TableCell>
										<TableCell className="text-right text-muted-foreground text-xs">
											{r.assetCount} {t("assetsShort")} · {r.providerCount}{" "}
											{t("providersShort")}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</>
			)}

			{tab === "abhaengigkeiten" && (
				<>
					<p className="mb-4 text-muted-foreground text-sm">
						{t("dependenciesLead")}
					</p>
					{nodes.length === 0 ? (
						<p className="text-sm">{t("dependenciesEmpty")}</p>
					) : (
						<DependencyMap
							nodes={nodes}
							labels={{
								assets: t("assets"),
								providers: t("providers"),
								none: "—",
								concentration: t("concentration"),
								concentrationLead: t("concentrationLead"),
								criticalProcesses: t("criticalProcessesShort"),
								processes: t("processesShort"),
								rto: "RTO",
								crit: critLabel,
							}}
						/>
					)}
				</>
			)}

			{tab === "landkarte" && (
				<>
					<div className="mb-4">
						<RegisterFilters
							filters={[
								{
									key: "status",
									label: te("status"),
									options: PROCESS_STATUSES.map((s) => ({
										value: s,
										label: ts(PROCESS_STATUS.labelKey[s] as "procDraft"),
									})),
								},
								{
									key: "category",
									label: t("category"),
									options: CATEGORIES.map((c) => ({
										value: c,
										label: t(`category_${c}`),
									})),
								},
								{
									key: "criticality",
									label: t("criticality"),
									options: (["critical", "important", "standard"] as const).map(
										(c) => ({
											value: c,
											label: critLabel[c],
										}),
									),
								},
							]}
							chips={[
								{ key: "mine", label: te("chipMine") },
								{ key: "unowned", label: te("chipUnowned") },
							]}
						/>
					</div>
					{withoutA.length > 0 && (
						<p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
							{t("withoutAccountable", { n: withoutA.length })}
						</p>
					)}
					{rows.length === 0 ? (
						<EmptyState
							title={t("empty")}
							lead={t("emptyLead")}
							requiredBy={t("requiredBy")}
							actions={
								canCreate ? (
									<>
										<ApplyProcessSeedButton variant="brown" />
										<ProcessForm members={members} />
									</>
								) : undefined
							}
						/>
					) : (
						<div className="flex flex-col gap-8">
							{CATEGORIES.map((cat) => {
								const items = filtered.filter((r) => r.category === cat);
								if (items.length === 0) return null;
								return (
									<section key={cat}>
										<h2 className="lv-eyebrow mb-2 text-[0.6rem] text-muted-foreground">
											{t(`category_${cat}`)} · {items.length}
										</h2>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-20">{t("code")}</TableHead>
													<TableHead>{t("name")}</TableHead>
													<TableHead className="w-28">
														{t("criticality")}
													</TableHead>
													<TableHead className="w-40">{t("raciA")}</TableHead>
													<TableHead className="w-40">{te("owner")}</TableHead>
													<TableHead className="w-28">{te("status")}</TableHead>
													<TableHead className="w-32 text-right">
														{t("links")}
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{items.map((r) => (
													<TableRow key={r.id}>
														<TableCell className="font-mono text-xs">
															<Link
																href={`/prozesse/${encodeURIComponent(r.code)}`}
																className="hover:underline"
															>
																{r.code}
															</Link>
														</TableCell>
														<TableCell>
															<Link
																href={`/prozesse/${encodeURIComponent(r.code)}`}
																className="font-medium hover:underline underline-offset-4"
															>
																{r.name}
															</Link>
														</TableCell>
														<TableCell>
															<Badge variant={CRIT_TONE[r.criticality]}>
																{critLabel[r.criticality]}
															</Badge>
														</TableCell>
														<TableCell
															className={
																r.accountable
																	? "text-sm"
																	: "text-destructive text-sm"
															}
														>
															{accountableLabel(r) ?? t("noAccountable")}
														</TableCell>
														<TableCell>
															<UserChip name={r.names.ownerUserId} />
														</TableCell>
														<TableCell>
															<StatusBadge
																machine={PROCESS_STATUS}
																status={r.status}
																label={ts(
																	PROCESS_STATUS.labelKey[
																		r.status
																	] as "procDraft",
																)}
															/>
														</TableCell>
														<TableCell className="text-right text-muted-foreground text-xs">
															{r.controlCount} C · {r.assetCount} A ·{" "}
															{r.providerCount} D
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</section>
								);
							})}
						</div>
					)}
				</>
			)}
		</>
	);
}
