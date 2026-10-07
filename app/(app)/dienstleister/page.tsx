import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { UserChip } from "@/components/entity/user-chip";
import { ProviderForm } from "@/components/registers/provider-form";
import { Badge } from "@/components/ui/badge";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { listProviders } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";

type Row = Awaited<ReturnType<typeof listProviders>>[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ProvidersPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ provider: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Providers");
	const te = await getTranslations("Entity");
	const { rows, members } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listProviders(tx, ctx.orgId),
		members: await listMembersForPicker(tx, ctx.orgId),
	}));
	const canEdit = roleAllows(ctx.orgRole, { provider: ["create", "update"] });
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
			cell: (r) => t(`partner_${r.partnerType}`),
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
							criticality: r.criticality,
							isIct: r.isIct,
							isOutsourcing: r.isOutsourcing,
							isMaterial: r.isMaterial,
							country: r.country,
							processesPersonalData: r.processesPersonalData,
							contractRef: r.contractRef,
							contractEnd: r.contractEnd,
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
			actions={canEdit ? <ProviderForm members={members} /> : undefined}
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
			rowHref={() => "/dienstleister"}
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
