import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	DocumentCreate,
	ImportDialog,
	TemplatesDialog,
} from "@/components/documents/document-forms";
import { EmptyState } from "@/components/entity/empty-state";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { StatusBadge } from "@/components/entity/status-badge";
import { UserChip } from "@/components/entity/user-chip";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_STATUS, DOCUMENT_TYPES } from "@/db/schema/grc";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { DOCUMENT_TEMPLATES } from "@/lib/compliance/catalog/document-templates";
import { fmtDate } from "@/lib/compliance/page-data";
import { listDocuments } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { DOCUMENT_STATUS_MACHINE } from "@/lib/entities/document";
import { env } from "@/lib/env";

type Row = Awaited<ReturnType<typeof listDocuments>>[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DocumentsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ document: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Documents");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const rows = await readOrg(toOrgCtx(ctx), (tx) =>
		listDocuments(tx, ctx.orgId),
	);
	const canCreate = roleAllows(ctx.orgRole, { document: ["create"] });
	const e = env();
	const storageAvailable = Boolean(
		e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY,
	);
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
					r.status === "published"),
		);

	const columns: Column<Row>[] = [
		{
			key: "n",
			header: t("docNumber"),
			className: "w-24 font-mono text-xs",
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
			header: t("version"),
			className: "w-16",
			mobile: false,
			cell: (r) => `v${r.version}`,
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
						r.nextReviewAt && r.nextReviewAt < today && r.status === "published"
							? "text-destructive"
							: "text-muted-foreground"
					}
				>
					{r.nextReviewAt ? fmtDate.format(new Date(r.nextReviewAt)) : "—"}
				</span>
			),
		},
	];

	const actions = canCreate ? (
		<>
			<ImportDialog storageAvailable={storageAvailable} />
			<TemplatesDialog templates={templates} />
			<DocumentCreate templates={templates.filter((x) => !x.present)} />
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
			rows={filtered}
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
					className="text-primary hover:underline"
				>
					{t("isoMandatory")} → SoA
				</Link>
			}
		/>
	);
}
