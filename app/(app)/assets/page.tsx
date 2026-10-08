import { getTranslations } from "next-intl/server";
import { importAssetsCsv } from "@/app/actions/imports";
import { CsvImport } from "@/components/entity/csv-import";
import { EmptyState } from "@/components/entity/empty-state";
import { LinkChips } from "@/components/entity/link-chips";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { UserChip } from "@/components/entity/user-chip";
import { AssetForm } from "@/components/registers/asset-form";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { linkIndex } from "@/lib/compliance/queries-links";
import { listAssets, listProviders } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";

type Row = Awaited<ReturnType<typeof listAssets>>[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AssetsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ asset: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Assets");
	const te = await getTranslations("Entity");
	const { rows, members, providers, links } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			rows: await listAssets(tx, ctx.orgId),
			links: await linkIndex(tx, ctx.orgId),
			members: await listMembersForPicker(tx, ctx.orgId),
			providers: (await listProviders(tx, ctx.orgId)).map((p) => ({
				id: p.id,
				name: p.name,
			})),
		}),
	);
	const canEdit = roleAllows(ctx.orgRole, { asset: ["create", "update"] });
	const q = one(sp.q)?.toLowerCase();
	const type = one(sp.type);
	const cls = one(sp.classification);
	const keys = one(sp.keys) === "1";
	const unowned = one(sp.unowned) === "1";
	const filtered = rows
		.filter(
			(r) => !q || `${r.name} ${r.description ?? ""}`.toLowerCase().includes(q),
		)
		.filter((r) => !type || r.type === type)
		.filter((r) => !cls || r.classification === cls)
		.filter((r) => !keys || r.type === "key_material" || r.type === "hsm")
		.filter((r) => !unowned || !r.ownerUserId);
	const columns: Column<Row>[] = [
		{
			key: "name",
			header: t("name"),
			cell: (r) => (
				<span>
					<span className="font-medium">{r.name}</span>
					{r.description && (
						<span className="block text-muted-foreground text-xs">
							{r.description}
						</span>
					)}
				</span>
			),
		},
		{
			key: "type",
			header: t("type"),
			className: "w-32",
			cell: (r) => t(`type_${r.type}`),
		},
		{
			key: "class",
			header: t("classification"),
			className: "w-28",
			cell: (r) => (
				<Badge
					variant={
						r.classification === "secret"
							? "destructive"
							: r.classification === "confidential"
								? "warning"
								: "muted"
					}
				>
					{r.classification}
				</Badge>
			),
		},
		{
			key: "provider",
			header: t("provider"),
			className: "w-40",
			mobile: false,
			cell: (r) => r.providerName ?? "—",
		},
		{
			key: "processes",
			header: t("processes"),
			className: "w-44",
			mobile: false,
			cell: (r) => (
				<LinkChips
					items={(links.processesByAsset.get(r.id) ?? []).map((p) => ({
						key: p.code,
						label: p.code,
						title: p.name,
						href: `/prozesse/${encodeURIComponent(p.code)}`,
					}))}
				/>
			),
		},
		{
			key: "owner",
			header: t("owner"),
			className: "w-40",
			cell: (r) => <UserChip name={r.ownerName} />,
		},
		{
			key: "rot",
			header: t("rotationDue"),
			className: "w-28",
			mobile: false,
			cell: (r) =>
				r.rotationDue ? (
					fmtDate.format(new Date(r.rotationDue))
				) : r.isLegacy ? (
					<Badge variant="outline">{t("isLegacy")}</Badge>
				) : (
					"—"
				),
		},
		{
			key: "edit",
			header: "",
			className: "w-20",
			mobile: false,
			cell: (r) =>
				canEdit ? (
					<AssetForm
						trigger="link"
						members={members}
						providers={providers}
						initial={{
							assetId: r.id,
							name: r.name,
							type: r.type,
							classification: r.classification,
							providerId: r.providerId,
							ownerUserId: r.ownerUserId,
							location: r.location,
							description: r.description,
							isLegacy: r.isLegacy,
							custodian: r.custodian,
							backupLocation: r.backupLocation,
							rotationDue: r.rotationDue,
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
				canEdit ? (
					<>
						<CsvImport
							title={t("importTitle")}
							columns="name;type;classification;location;description;isLegacy"
							action={importAssetsCsv}
						/>
						<AssetForm members={members} providers={providers} />
					</>
				) : undefined
			}
			filters={[
				{
					key: "type",
					label: t("type"),
					options: (
						[
							"system",
							"application",
							"data",
							"service",
							"device",
							"facility",
							"key_material",
							"hsm",
						] as const
					).map((c) => ({ value: c, label: t(`type_${c}`) })),
				},
				{
					key: "classification",
					label: t("classification"),
					options: (
						["public", "internal", "confidential", "secret"] as const
					).map((c) => ({ value: c, label: c })),
				},
			]}
			chips={[
				{ key: "keys", label: t("keys") },
				{ key: "unowned", label: te("chipUnowned") },
			]}
			columns={columns}
			rows={filtered}
			rowHref={() => "/assets"}
			empty={
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={
						canEdit ? (
							<AssetForm members={members} providers={providers} />
						) : undefined
					}
				/>
			}
		/>
	);
}
