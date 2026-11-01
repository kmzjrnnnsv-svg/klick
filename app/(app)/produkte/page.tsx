import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { OwnerChip } from "@/components/entity/owner-chip";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { StatusBadge } from "@/components/entity/status-badge";
import { UserChip } from "@/components/entity/user-chip";
import { withMessages } from "@/components/i18n/with-messages";
import { NewProductDialog } from "@/components/products/product-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PRODUCT_ROLES } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { productCraStatus } from "@/lib/compliance/cra";
import { fmtDate } from "@/lib/compliance/page-data";
import { listProducts } from "@/lib/compliance/queries-products";
import { readOrg } from "@/lib/db/with-org";
import { PRODUCT_STATUS, PRODUCT_STATUSES } from "@/lib/entities/product";

type Row = Awaited<ReturnType<typeof listProducts>>[number] & {
	cra: ReturnType<typeof productCraStatus>;
};
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATE_TONE = {
	unassessed: "outline",
	out_of_scope: "muted",
	gaps: "warning",
	ready: "success",
} as const;

// Produktregister (CRA): Rolle, Anwendungsbereich, Einstufung und Stand der
// Pflichten je Produkt — daraus leitet Klick die Anwendbarkeit des CRA ab.
async function ProductsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ product: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Products");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const canCreate = allows(ctx, { product: ["create"] });
	const products = await readOrg(toOrgCtx(ctx), (tx) =>
		listProducts(tx, ctx.orgId),
	);
	const now = new Date();
	const rows: Row[] = products.map((p) => ({
		...p,
		cra: productCraStatus(p, now),
	}));
	const q = one(sp.q)?.toLowerCase();
	const role = one(sp.role);
	const status = one(sp.status);
	const gaps = one(sp.gaps) === "1";
	const unassessed = one(sp.unassessed) === "1";
	const filtered = rows
		.filter(
			(r) =>
				!q ||
				`${r.code} ${r.name} ${r.description ?? ""}`.toLowerCase().includes(q),
		)
		.filter((r) => !role || r.role === role)
		.filter((r) => !status || r.status === status)
		.filter((r) => !gaps || r.cra.state === "gaps")
		.filter((r) => !unassessed || r.cra.state === "unassessed");

	const columns: Column<Row>[] = [
		{
			key: "name",
			header: t("name"),
			cell: (r) => (
				<span>
					<span
						className="font-mono text-muted-foreground text-footnote"
						translate="no"
					>
						{r.code}
					</span>{" "}
					<span className="font-medium">{r.name}</span>
					{r.version && (
						<span className="text-muted-foreground text-footnote">
							{" "}
							· {r.version}
						</span>
					)}
				</span>
			),
		},
		{
			key: "role",
			header: t("role"),
			className: "w-32",
			cell: (r) => t(`role_${r.role}`),
		},
		{
			key: "class",
			header: t("craClass"),
			className: "w-36",
			mobile: false,
			cell: (r) =>
				r.craInScope === false ? (
					<Badge variant="muted">{t("scope_no")}</Badge>
				) : (
					t(`class_${r.craClass}`)
				),
		},
		{
			key: "cra",
			header: t("craState"),
			className: "w-40",
			cell: (r) => (
				<Badge variant={STATE_TONE[r.cra.state]}>
					{r.cra.state === "gaps"
						? t("stateGaps", { done: r.cra.done, total: r.cra.total })
						: t(`state_${r.cra.state}`)}
				</Badge>
			),
		},
		{
			key: "support",
			header: t("supportUntil"),
			className: "w-28",
			mobile: false,
			cell: (r) =>
				r.supportUntil ? fmtDate.format(new Date(r.supportUntil)) : "—",
		},
		{
			key: "status",
			header: te("status"),
			className: "w-36",
			cell: (r) => (
				<StatusBadge
					machine={PRODUCT_STATUS}
					status={r.status}
					label={ts(PRODUCT_STATUS.labelKey[r.status] as "prdDevelopment")}
				/>
			),
		},
		{
			key: "owner",
			header: t("owner"),
			className: "w-36",
			mobile: false,
			cell: (r) => (
				<OwnerChip ownerFunction={r.ownerFunction} name={r.ownerName} />
			),
		},
	];

	return (
		<RegisterPage
			title={t("title")}
			lead={t("lead")}
			actions={canCreate ? <NewProductDialog /> : undefined}
			filters={[
				{
					key: "role",
					label: t("role"),
					options: PRODUCT_ROLES.map((r) => ({
						value: r,
						label: t(`role_${r}`),
					})),
				},
				{
					key: "status",
					label: te("status"),
					options: PRODUCT_STATUSES.map((s) => ({
						value: s,
						label: ts(PRODUCT_STATUS.labelKey[s] as "prdDevelopment"),
					})),
				},
			]}
			chips={[
				{ key: "gaps", label: t("chipGaps") },
				{ key: "unassessed", label: t("chipUnassessed") },
			]}
			searchPlaceholder={t("search")}
			columns={columns}
			rows={filtered}
			rowHref={(r) => `/produkte/${r.id}`}
			empty={
				rows.length === 0 ? (
					<EmptyState
						title={t("emptyTitle")}
						lead={t("emptyLead")}
						requiredBy="CRA Art. 13, Anhang VII"
						actions={
							<>
								{canCreate && <NewProductDialog />}
								<Link
									href="/rahmenwerke/cra"
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									{t("toFramework")}
								</Link>
							</>
						}
					/>
				) : (
					<p className="text-muted-foreground text-subhead">
						{te("noMatches")}
					</p>
				)
			}
		/>
	);
}

export default withMessages(ProductsPage, [
	"Approvals",
	"Common",
	"Dlp",
	"Entity",
	"Functions",
	"Products",
]);
