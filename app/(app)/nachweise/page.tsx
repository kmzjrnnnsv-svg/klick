import { PenLine } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { EvidenceForm } from "@/components/entity/evidence-form";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { UserChip } from "@/components/entity/user-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listEvidenceWithControls } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { evidenceValidity } from "@/lib/evidence/current";
import { berlinToday } from "@/lib/evidence-studio/queries";

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
	const ta = await getTranslations("Authoring");
	const te = await getTranslations("Entity");
	const td = await getTranslations("Dlp");
	// ersetzte Fassungen zählen nicht; auf Wunsch sichtbar (Chip)
	const allVersions = one(sp.fassungen) === "1";
	const rows = await readOrg(toOrgCtx(ctx), (tx) =>
		listEvidenceWithControls(tx, ctx.orgId, {
			includeSuperseded: allVersions,
		}),
	);
	const today = berlinToday();
	const canCreate = allows(ctx, { evidence: ["create"] });

	const q = one(sp.q)?.toLowerCase();
	const type = one(sp.type);
	const cls = one(sp.classification);
	const mine = one(sp.mine) === "1";
	const dlpOnly = one(sp.dlp) === "1";
	// DLP-Treffer: Funde, die eine Regel ausgelöst haben (nicht nur Info).
	const dlpHits = (r: Row) =>
		r.dlp && r.dlp.action !== "allow"
			? r.dlp.findings.reduce((s, f) => s + f.count, 0)
			: 0;
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
		.filter((r) => !mine || r.createdByUserId === ctx.userId)
		.filter((r) => !dlpOnly || dlpHits(r) > 0);

	const columns: Column<Row>[] = [
		{
			key: "title",
			header: t("titleField"),
			cell: (r) => {
				const state = evidenceValidity(r, today);
				return (
					<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="font-medium">{r.title}</span>
						{state === "superseded" && (
							<Badge variant="muted">{t("superseded")}</Badge>
						)}
						{state === "expired" && (
							<Badge variant="warning">{t("expired")}</Badge>
						)}
					</span>
				);
			},
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
			// Server Component: kein onClick an <Link> (nicht serialisierbar — die
			// Seite würde mit „Da ist etwas schiefgelaufen“ abbrechen, sobald ein
			// Nachweis Controls hat). Mobil ist die ganze Karte ein Link, daher aus.
			mobile: false,
			cell: (r) => (
				<span className="flex flex-wrap gap-1">
					{r.controlCodes.map((c) => (
						<Link key={c} href={`/controls/${c}`}>
							<Badge variant="outline" className="font-mono">
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
			cell: (r) => (
				<span className="flex flex-col gap-0.5">
					{t(`class_${r.classification}`)}
					{dlpHits(r) > 0 && (
						<Badge variant="outline" className="w-fit">
							{td("badgeHits", { count: dlpHits(r) })}
						</Badge>
					)}
					{r.dlp?.extraction === "unsupported" && (
						<span className="text-muted-foreground text-footnote">
							{td("notScanned")}
						</span>
					)}
				</span>
			),
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
					<div className="flex flex-wrap items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link href="/nachweise/verfassen">
								<PenLine aria-hidden="true" />
								{ta("galleryLink")}
							</Link>
						</Button>
						<EvidenceForm />
					</div>
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
			chips={[
				{ key: "mine", label: te("chipMine") },
				{ key: "dlp", label: td("filterHits") },
				{ key: "fassungen", label: t("showSuperseded") },
			]}
			columns={columns}
			rows={filtered}
			rowHref={(r) => `/nachweise/${r.id}`}
			empty={
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={
						canCreate ? (
							<div className="flex flex-wrap items-center gap-2">
								<Button asChild variant="outline" size="sm">
									<Link href="/nachweise/verfassen">
										<PenLine aria-hidden="true" />
										{ta("galleryLink")}
									</Link>
								</Button>
								<EvidenceForm />
							</div>
						) : undefined
					}
				/>
			}
		/>
	);
}
