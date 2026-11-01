import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	DocumentCreate,
	ImportDialog,
	TemplatesDialog,
} from "@/components/documents/document-forms";
import { EmptyState } from "@/components/entity/empty-state";
import { ExportLink } from "@/components/entity/export-link";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { StatusBadge } from "@/components/entity/status-badge";
import { UserChip } from "@/components/entity/user-chip";
import { withMessages } from "@/components/i18n/with-messages";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DOCUMENT_STATUS, DOCUMENT_TYPES } from "@/db/schema/grc";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { hidesSecret, restrictedView } from "@/lib/auth/visibility";
import { DOCUMENT_TEMPLATES } from "@/lib/compliance/catalog/document-templates";
import { fmtDate } from "@/lib/compliance/page-data";
import { listDocuments } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { DOCUMENT_STATUS_MACHINE } from "@/lib/entities/document";
import { PAGE_SIZE, pageParam, pageSlice } from "@/lib/paging";

type Row = Awaited<ReturnType<typeof listDocuments>>[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function DocumentsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ document: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Documents");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	// Prüfer-Sicht: nur Dokumente mit gültiger Fassung, Stand und Nummer der
	// gültigen Fassung; streng geheime ohne Grant ohne Titel
	const restricted = restrictedView(ctx);
	const rows = (
		await readOrg(toOrgCtx(ctx), (tx) => listDocuments(tx, ctx.orgId))
	).flatMap((r) => {
		if (restricted && !r.current) return [];
		const view =
			restricted && r.current
				? { ...r, status: "published" as const, version: r.current.version }
				: r;
		return [hidesSecret(ctx, r) ? { ...view, title: t("secretTitle") } : view];
	});
	const canCreate = allows(ctx, { document: ["create"] }) && !restricted;
	const present = new Set(rows.map((r) => r.templateCode));
	const templates = DOCUMENT_TEMPLATES.map((x) => ({
		code: x.code,
		title: x.title,
		type: x.type,
		isoMandatory: x.isoMandatory,
		frameworks: x.frameworks,
		present: present.has(x.code),
	}));
	const today = new Date().toISOString().slice(0, 10);

	const q = one(sp.q)?.toLowerCase();
	const status = one(sp.status);
	const type = one(sp.type);
	const mine = one(sp.mine) === "1";
	const overdue = one(sp.overdue) === "1";
	const filtered = rows
		.filter((r) => !q || `${r.docNumber} ${r.title}`.toLowerCase().includes(q))
		.filter((r) => !status || r.status === status)
		.filter((r) => !type || r.type === type)
		.filter(
			(r) =>
				!mine ||
				r.ownerUserId === ctx.userId ||
				r.assigneeUserId === ctx.userId,
		)
		.filter(
			(r) =>
				!overdue ||
				(r.nextReviewAt !== null &&
					r.nextReviewAt < today &&
					r.current !== null),
		);
	// Liste seitenweise zeichnen (Zähler über alle Treffer)
	const paged = pageSlice(filtered, pageParam(sp.seite));

	const columns: Column<Row>[] = [
		{
			key: "n",
			header: t("docNumber"),
			className: "w-24 font-mono text-footnote",
			cell: (r) => r.docNumber,
		},
		{
			key: "title",
			header: t("titleField"),
			cell: (r) => (
				<span>
					<span className="font-medium">{r.title}</span>
					{r.isoMandatory && (
						<Badge variant="default" className="ml-2">
							(P)
						</Badge>
					)}
				</span>
			),
		},
		{
			key: "type",
			header: t("type"),
			className: "w-36",
			cell: (r) => t(`type_${r.type}`),
		},
		{
			key: "status",
			header: te("status"),
			className: "w-32",
			cell: (r) => (
				<StatusBadge
					machine={DOCUMENT_STATUS_MACHINE}
					status={r.status}
					label={ts(DOCUMENT_STATUS_MACHINE.labelKey[r.status] as "docDraft")}
				/>
			),
		},
		{
			key: "version",
			header: t("current"),
			className: "w-28",
			mobile: false,
			cell: (r) => (
				<span className="tabular-nums">
					{r.current ? `v${r.current.version}` : "—"}
					{r.current?.version !== r.version &&
						(r.status === "draft" ||
							r.status === "in_review" ||
							r.status === "approved") && (
							<span className="block text-muted-foreground text-footnote">
								{t("workingCopy", { version: r.version })}
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
			key: "review",
			header: t("nextReview"),
			className: "w-28",
			mobile: false,
			cell: (r) => (
				<span
					className={
						r.nextReviewAt && r.nextReviewAt < today && r.current !== null
							? "text-destructive"
							: "text-muted-foreground"
					}
				>
					{r.nextReviewAt ? fmtDate.format(new Date(r.nextReviewAt)) : "—"}
				</span>
			),
		},
	];

	// Paket aller gültigen Fassungen als PDF „Gelenkte Fassung“ (Step-up)
	const zip = allows(ctx, { export: ["create"] }) &&
		rows.some((r) => r.current !== null) && (
			<ExportLink
				href="/api/export/dokumente.zip"
				className={buttonVariants({ variant: "outline", size: "sm" })}
			>
				{t("zipAll")}
			</ExportLink>
		);
	const actions =
		canCreate || zip ? (
			<>
				{zip}
				{canCreate && (
					<>
						<ImportDialog />
						<TemplatesDialog templates={templates} />
						<DocumentCreate templates={templates.filter((x) => !x.present)} />
					</>
				)}
			</>
		) : undefined;

	return (
		<RegisterPage
			title={t("title")}
			lead={t("lead")}
			actions={actions}
			filters={[
				{
					key: "status",
					label: te("status"),
					options: DOCUMENT_STATUS.map((s) => ({
						value: s,
						label: ts(DOCUMENT_STATUS_MACHINE.labelKey[s] as "docDraft"),
					})),
				},
				{
					key: "type",
					label: t("type"),
					options: DOCUMENT_TYPES.map((x) => ({
						value: x,
						label: t(`type_${x}`),
					})),
				},
			]}
			chips={[
				{ key: "mine", label: te("chipMine") },
				{ key: "overdue", label: te("chipOverdue") },
			]}
			columns={columns}
			rows={paged.rows}
			paging={{
				page: paged.page,
				total: paged.total,
				pageSize: PAGE_SIZE,
				path: "/dokumente",
				query: sp,
			}}
			rowHref={(r) => `/dokumente/${encodeURIComponent(r.docNumber)}`}
			empty={
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={actions}
				/>
			}
			footer={
				<Link
					href="/rahmenwerke/iso27001?tab=soa"
					className="hit-area text-primary hover:underline"
				>
					{`${t("isoMandatory")} > SoA`}
				</Link>
			}
		/>
	);
}

export default withMessages(DocumentsPage, [
	"Ai",
	"AiSettings",
	"Auth",
	"Common",
	"Dlp",
	"Documents",
	"Entity",
	"Evidence",
	"Functions",
]);
