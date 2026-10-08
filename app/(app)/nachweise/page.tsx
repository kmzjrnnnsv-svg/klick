import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { EvidenceForm } from "@/components/entity/evidence-form";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { UserChip } from "@/components/entity/user-chip";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listEvidenceWithControls } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";

type Row = Awaited<ReturnType<typeof listEvidenceWithControls>>[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EvidencePage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ evidence: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Evidence");
	const te = await getTranslations("Entity");
	const rows = await readOrg(toOrgCtx(ctx), (tx) =>
		listEvidenceWithControls(tx, ctx.orgId),
	);
	const e = env();
	const storageAvailable = Boolean(
		e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY,
	);
	const canCreate = roleAllows(ctx.orgRole, { evidence: ["create"] });

	const q = one(sp.q)?.toLowerCase();
	const type = one(sp.type);
	const cls = one(sp.classification);
	const mine = one(sp.mine) === "1";
	const filtered = rows
		.filter(
			(r) =>
				!q ||
				`${r.title} ${r.fileName ?? ""} ${r.controlCodes.join(" ")}`
					.toLowerCase()
					.includes(q),
		)
		.filter((r) => !type || r.type === type)
		.filter((r) => !cls || r.classification === cls)
		.filter((r) => !mine || r.createdByUserId === ctx.userId);

	const columns: Column<Row>[] = [
		{
			key: "title",
			header: t("titleField"),
			cell: (r) => <span className="font-medium">{r.title}</span>,
		},
		{
			key: "type",
			header: t("typeField"),
			className: "w-36",
			cell: (r) => t(`type_${r.type}`),
		},
		{
			key: "controls",
			header: t("linkedControls"),
			className: "w-56",
			cell: (r) => (
				<span className="flex flex-wrap gap-1">
					{r.controlCodes.map((c) => (
						<Link
							key={c}
							href={`/controls/${c}`}
							onClick={(ev) => ev.stopPropagation()}
						>
							<Badge
								variant="outline"
								className="font-mono normal-case tracking-normal"
							>
								{c}
							</Badge>
						</Link>
					))}
				</span>
			),
		},
		{
			key: "class",
			header: t("classification"),
			className: "w-28",
			mobile: false,
			cell: (r) => t(`class_${r.classification}`),
		},
		{
			key: "by",
			header: t("by"),
			className: "w-40",
			mobile: false,
			cell: (r) => <UserChip name={r.createdByName} />,
		},
		{
			key: "created",
			header: t("createdAt"),
			className: "w-28 text-muted-foreground",
			cell: (r) => fmtDate.format(r.createdAt),
		},
	];

	return (
		<RegisterPage
			title={t("title")}
			lead={t("lead")}
			actions={
				canCreate ? (
					<EvidenceForm storageAvailable={storageAvailable} />
				) : undefined
			}
			filters={[
				{
					key: "type",
					label: t("typeField"),
					options: (
						[
							"document",
							"screenshot",
							"link",
							"config_export",
							"attestation",
							"log_extract",
						] as const
					).map((x) => ({
						value: x,
						label: t(`type_${x}`),
					})),
				},
				{
					key: "classification",
					label: t("classification"),
					options: (
						["public", "internal", "confidential", "secret"] as const
					).map((x) => ({ value: x, label: t(`class_${x}`) })),
				},
			]}
			chips={[{ key: "mine", label: te("chipMine") }]}
			columns={columns}
			rows={filtered}
			rowHref={(r) =>
				r.storageKey ? `/api/nachweise/${r.id}` : r.url ? r.url : "/nachweise"
			}
			empty={
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={
						canCreate ? (
							<EvidenceForm storageAvailable={storageAvailable} />
						) : undefined
					}
				/>
			}
			footer={storageAvailable ? undefined : t("storageNotConfigured")}
		/>
	);
}
