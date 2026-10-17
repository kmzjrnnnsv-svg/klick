import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { importProvidersCsv } from "@/app/actions/imports";
import { CsvImport } from "@/components/entity/csv-import";
import { EmptyState } from "@/components/entity/empty-state";
import { LinkChips } from "@/components/entity/link-chips";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
import { ProviderForm } from "@/components/registers/provider-form";
import { RatingOverview } from "@/components/supplier/rating-overview";
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
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { TOOL_LANDSCAPE } from "@/lib/compliance/catalog/tool-landscape";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { linkIndex } from "@/lib/compliance/queries-links";
import { listProviders } from "@/lib/compliance/queries-p2";
import { latestRatingsByProvider } from "@/lib/compliance/queries-ratings";
import { TRAFFIC_TONE } from "@/lib/compliance/supplier-rating";
import { readOrg } from "@/lib/db/with-org";

type Row = Awaited<ReturnType<typeof listProviders>>[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ProvidersPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ provider: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Providers");
	const te = await getTranslations("Entity");
	const tr = await getTranslations("Rating");
	const { rows, members, links, ratings } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			rows: await listProviders(tx, ctx.orgId),
			members: await listMembersForPicker(tx, ctx.orgId),
			links: await linkIndex(tx, ctx.orgId),
			ratings: await latestRatingsByProvider(tx, ctx.orgId),
		}),
	);
	const today = new Date().toISOString().slice(0, 10);
	const canEdit = roleAllows(ctx.orgRole, { provider: ["create", "update"] });
	const canExport = roleAllows(ctx.orgRole, { export: ["create"] });
	const tabParam = one(sp.tab);
	const tab =
		tabParam === "werkzeuge" || tabParam === "uebersicht"
			? tabParam
			: "register";
	const tabs = [
		{ value: "register", label: t("tabRegister"), count: rows.length },
		{ value: "uebersicht", label: t("tabOverview") },
		{ value: "werkzeuge", label: t("tabTools") },
	];
	if (tab === "uebersicht") {
		return (
			<>
				<PageHeader
					title={t("title")}
					lead={t("lead")}
					actions={
						canExport ? (
							<a
								href="/api/export/lieferantenbewertung.csv"
								className="text-primary text-sm underline-offset-4 hover:underline"
							>
								{tr("exportCsv")}
							</a>
						) : undefined
					}
				/>
				<UrlTabs base="/dienstleister" active={tab} tabs={tabs} />
				<RatingOverview providers={rows} ratings={ratings} today={today} />
			</>
		);
	}
	if (tab === "werkzeuge") {
		return (
			<>
				<PageHeader title={t("title")} lead={t("toolsLead")} />
				<UrlTabs base="/dienstleister" active={tab} tabs={tabs} />
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-48">{t("toolCategory")}</TableHead>
							<TableHead>{t("covers")}</TableHead>
							<TableHead className="w-56">{t("startup")}</TableHead>
							<TableHead className="w-56">{t("scale")}</TableHead>
							<TableHead className="w-40">{t("asProvider")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{TOOL_LANDSCAPE.map((cat) => (
							<TableRow key={cat.code}>
								<TableCell className="font-medium">{cat.name}</TableCell>
								<TableCell className="text-xs">
									<p>{cat.covers}</p>
									<p className="mt-1 flex flex-wrap gap-1">
										{cat.controls.map((c) => (
											<Link
												key={c}
												href={`/controls/${c}`}
												className="font-mono text-[0.65rem] text-primary hover:underline"
												title={CONTROL_BY_CODE.get(c)?.title}
											>
												{c}
											</Link>
										))}
									</p>
								</TableCell>
								<TableCell className="text-xs">
									{cat.startup.join(", ")}
								</TableCell>
								<TableCell className="text-xs">
									{cat.scale.join(", ")}
								</TableCell>
								<TableCell>
									{canEdit && (
										<ProviderForm
											members={members}
											trigger="link"
											triggerLabel={t("createFromTool")}
											initial={{
												name: "",
												partnerType: cat.provider.partnerType,
												serviceType: cat.provider.serviceType,
												serviceDescription: `${cat.name} — ${cat.covers}`,
												criticality: cat.provider.criticality,
												isIct: cat.provider.isIct,
												isOutsourcing: cat.provider.isOutsourcing,
												isMaterial: cat.provider.criticality === "critical",
												processesPersonalData:
													cat.provider.processesPersonalData,
											}}
										/>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<p className="mt-4 text-muted-foreground text-xs">
					{t("toolsDisclaimer")}
				</p>
			</>
		);
	}
	const q = one(sp.q)?.toLowerCase();
	const crit = one(sp.criticality);
	const pt = one(sp.partnerType);
	const filtered = rows
		.filter(
			(r) =>
				!q ||
				`${r.name} ${r.serviceDescription ?? ""}`.toLowerCase().includes(q),
		)
		.filter((r) => !crit || r.criticality === crit)
		.filter((r) => !pt || r.partnerType === pt);
	const columns: Column<Row>[] = [
		{
			key: "name",
			header: t("name"),
			cell: (r) => (
				<span>
					<span className="font-medium">{r.name}</span>
					{r.serviceDescription && (
						<span className="block text-muted-foreground text-xs">
							{r.serviceDescription}
						</span>
					)}
				</span>
			),
		},
		{
			key: "type",
			header: t("partnerType"),
			className: "w-36",
			cell: (r) => (
				<span>
					{t(`partner_${r.partnerType}`)}
					{r.category && (
						<span className="block text-muted-foreground text-xs">
							{t(`category_${r.category}`)}
						</span>
					)}
				</span>
			),
		},
		{
			key: "crit",
			header: t("criticality"),
			className: "w-28",
			cell: (r) => (
				<Badge
					variant={
						r.criticality === "critical"
							? "destructive"
							: r.criticality === "important"
								? "warning"
								: "muted"
					}
				>
					{t(`crit_${r.criticality}`)}
				</Badge>
			),
		},
		{
			key: "rating",
			header: tr("colRating"),
			className: "w-40",
			cell: (r) => {
				const x = ratings.get(r.id);
				if (!x) return <span className="text-muted-foreground">—</span>;
				if (x.totalScore === null)
					return <Badge variant="muted">{tr("draft")}</Badge>;
				return (
					<span className="flex flex-col gap-0.5">
						<span className="flex items-center gap-1.5">
							{x.traffic && (
								<Badge variant={TRAFFIC_TONE[x.traffic]}>{x.level}</Badge>
							)}
							<span className="tabular-nums text-xs">
								{Math.round((x.totalScore / 5) * 100)} %
							</span>
						</span>
						<span className="text-muted-foreground text-xs">
							{tr(`decision_${x.decision}` as "decision_open")}
						</span>
					</span>
				);
			},
		},
		{
			key: "next",
			header: tr("colNext"),
			className: "w-28",
			mobile: false,
			cell: (r) =>
				r.nextAssessmentAt ? (
					<span
						className={
							r.nextAssessmentAt < today ? "text-destructive" : undefined
						}
					>
						{fmtDate.format(new Date(r.nextAssessmentAt))}
					</span>
				) : (
					"—"
				),
		},
		{
			key: "flags",
			header: "DORA",
			className: "w-40",
			mobile: false,
			cell: (r) => (
				<span className="flex flex-wrap gap-1 text-xs">
					{r.isOutsourcing && (
						<Badge variant="outline">{t("isOutsourcing")}</Badge>
					)}
					{r.isMaterial && <Badge variant="outline">{t("isMaterial")}</Badge>}
					{r.processesPersonalData && !r.dpaSignedAt && (
						<Badge variant="destructive">{t("dpaMissing")}</Badge>
					)}
				</span>
			),
		},
		{
			key: "country",
			header: t("country"),
			className: "w-16",
			mobile: false,
			cell: (r) => r.country ?? "—",
		},
		{
			key: "end",
			header: t("contractEnd"),
			className: "w-28",
			mobile: false,
			cell: (r) =>
				r.contractEnd ? fmtDate.format(new Date(r.contractEnd)) : "—",
		},
		{
			key: "links",
			header: t("linked"),
			className: "w-48",
			mobile: false,
			cell: (r) => (
				<span className="flex flex-col gap-1">
					<LinkChips
						items={(links.processesByProvider.get(r.id) ?? []).map((p) => ({
							key: p.code,
							label: p.code,
							title: p.name,
							href: `/prozesse/${encodeURIComponent(p.code)}`,
						}))}
					/>
					{(links.assetsByProvider.get(r.id)?.length ?? 0) > 0 && (
						<span className="text-muted-foreground text-xs">
							{t("assetsCount", {
								n: links.assetsByProvider.get(r.id)?.length ?? 0,
							})}
						</span>
					)}
				</span>
			),
		},
		{
			key: "owner",
			header: t("owner"),
			className: "w-40",
			cell: (r) => <UserChip name={r.names.ownerUserId} />,
		},
		{
			key: "edit",
			header: "",
			className: "w-20",
			mobile: false,
			cell: (r) =>
				canEdit ? (
					<ProviderForm
						trigger="link"
						members={members}
						initial={{
							providerId: r.id,
							name: r.name,
							partnerType: r.partnerType,
							serviceType: r.serviceType,
							serviceDescription: r.serviceDescription,
							category: r.category,
							status: r.status,
							criticality: r.criticality,
							isIct: r.isIct,
							isOutsourcing: r.isOutsourcing,
							isMaterial: r.isMaterial,
							country: r.country,
							processesPersonalData: r.processesPersonalData,
							contractRef: r.contractRef,
							contractStart: r.contractStart,
							contractEnd: r.contractEnd,
							dataLocations: r.dataLocations,
							noticePeriodDays: r.noticePeriodDays,
							ownerUserId: r.ownerUserId,
							notes: r.notes,
						}}
					/>
				) : null,
		},
	];
	return (
		<RegisterPage
			title={t("title")}
			lead={t("lead")}
			actions={
				<span className="flex flex-wrap items-center gap-2">
					<Link
						href="/dienstleister?tab=uebersicht"
						className="text-primary text-sm hover:underline underline-offset-4"
					>
						{t("tabOverview")}
					</Link>
					<Link
						href="/dienstleister?tab=werkzeuge"
						className="text-primary text-sm hover:underline underline-offset-4"
					>
						{t("tabTools")}
					</Link>
					{canExport && (
						<>
							<a
								href="/api/export/informationsregister.zip"
								className="text-primary text-sm underline-offset-4 hover:underline"
								title={t("exportRegisterHint")}
							>
								{t("exportRegister")}
							</a>
							<a
								href="/api/export/lieferantenpaket.zip"
								className="text-primary text-sm underline-offset-4 hover:underline"
								title={t("exportSupplierPackHint")}
							>
								{t("exportSupplierPack")}
							</a>
						</>
					)}
					{canEdit && (
						<CsvImport
							title={t("importTitle")}
							columns="name;partnerType;category;serviceType;criticality;country;isOutsourcing;isMaterial;processesPersonalData;serviceDescription;contractEnd"
							action={importProvidersCsv}
						/>
					)}
					{canEdit && <ProviderForm members={members} />}
				</span>
			}
			filters={[
				{
					key: "criticality",
					label: t("criticality"),
					options: (["critical", "important", "standard"] as const).map(
						(c) => ({ value: c, label: t(`crit_${c}`) }),
					),
				},
				{
					key: "partnerType",
					label: t("partnerType"),
					options: (
						[
							"ict",
							"outsourcing",
							"licence_partner",
							"bank",
							"issuer",
							"exchange",
							"custodian",
							"distribution",
						] as const
					).map((c) => ({ value: c, label: t(`partner_${c}`) })),
				},
			]}
			columns={columns}
			rows={filtered}
			rowHref={(r) => `/dienstleister/${r.id}`}
			empty={
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={canEdit ? <ProviderForm members={members} /> : undefined}
				/>
			}
			footer={te("requiredBy", { list: "CC-TPR-01" })}
		/>
	);
}
