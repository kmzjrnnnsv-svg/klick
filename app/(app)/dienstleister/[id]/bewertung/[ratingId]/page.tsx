import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SourceRisks } from "@/components/risks/source-risks";
import { RatingWizard } from "@/components/supplier/rating-wizard";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { getRatingDetail } from "@/lib/compliance/queries-ratings";
import {
	resolveSupplierMethod,
	summarizeRating,
	TRAFFIC_TONE,
} from "@/lib/compliance/supplier-rating";
import { readOrg } from "@/lib/db/with-org";
import { getOrgSettings, listOrgFrameworks } from "@/lib/org/queries";

const UUID = /^[0-9a-f-]{36}$/i;
const fmt = (v: number | null) =>
	v === null ? "—" : v.toFixed(2).replace(".", ",");

// Interne Lieferantenbewertung: Entwurf = Assistent (Schritte per
// ?schritt=), abgeschlossen = Ergebnis mit Einzelwerten, Maßnahmen und
// Freigabe.
export default async function RatingPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string; ratingId: string }>;
	searchParams: Promise<{ schritt?: string }>;
}) {
	const { id, ratingId } = await params;
	const { schritt } = await searchParams;
	if (!UUID.test(id) || !UUID.test(ratingId)) notFound();
	const ctx = await requireOrgPage({ provider: ["read"] });
	const t = await getTranslations("Rating");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const d = await getRatingDetail(tx, ctx.orgId, id, ratingId);
		if (!d) return null;
		const [settings, fws, members] = await Promise.all([
			getOrgSettings(tx, ctx.orgId),
			listOrgFrameworks(tx, ctx.orgId),
			listMembersForPicker(tx, ctx.orgId),
		]);
		return { ...d, settings, fws, members };
	});
	if (!data) notFound();
	const { rating, provider } = data;
	const method = resolveSupplierMethod(data.settings);
	const canEdit = allows(ctx, { provider: ["update"] });
	const names = Object.fromEntries(data.names);

	if (rating.status === "draft" && canEdit)
		return (
			<>
				<PageHeader
					back={{ href: `/dienstleister/${provider.id}`, label: provider.name }}
					title={t("title", { name: provider.name })}
					lead={t("pageLead", { code: rating.code })}
				/>
				<RatingWizard
					rating={{
						id: rating.id,
						code: rating.code,
						criteria: rating.criteria,
						scores: rating.scores,
						profile: rating.profile,
						areaWeights: rating.areaWeights,
					}}
					provider={{
						id: provider.id,
						name: provider.name,
						partnerType: provider.partnerType,
						serviceDescription: provider.serviceDescription,
						category: provider.category,
						criticality: provider.criticality,
						isOutsourcing: provider.isOutsourcing,
						isMaterial: provider.isMaterial,
						processesPersonalData: provider.processesPersonalData,
						ownerUserId: provider.ownerUserId,
					}}
					thresholds={method.thresholds}
					frameworks={data.fws.map((f) => f.slug)}
					members={data.members}
					names={names}
					questionnaires={data.questionnaires}
					initialStep={schritt}
				/>
			</>
		);

	const sum = summarizeRating(
		rating.criteria,
		rating.scores,
		rating.areaWeights,
		method.thresholds,
	);
	return (
		<>
			<PageHeader
				back={{ href: `/dienstleister/${provider.id}`, label: provider.name }}
				title={t("title", { name: provider.name })}
				lead={t("resultLead", {
					code: rating.code,
					date: rating.completedAt ? fmtDate.format(rating.completedAt) : "—",
				})}
				actions={
					<span className="flex flex-wrap items-center gap-3">
						{rating.traffic && rating.traffic !== "green" && (
							<SourceRisks
								kind="provider_rating"
								id={rating.id}
								risks={[]}
								canCreate={allows(ctx, { risk: ["create"] })}
								compact
							/>
						)}
						<Link
							href={`/dienstleister/${provider.id}?tab=bewertungen`}
							className="text-primary text-subhead hover:underline"
						>
							{t("backToProvider")}
						</Link>
					</span>
				}
			/>
			<div className="flex flex-col gap-6">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
					<Stat label={t("res_general")} value={fmt(rating.generalScore)} />
					<Stat label={t("res_security")} value={fmt(rating.securityScore)} />
					<Stat label={t("res_total")} value={fmt(rating.totalScore)} />
					<Stat
						label={t("res_percent")}
						value={sum.percent === null ? "—" : `${sum.percent} %`}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-3 text-subhead">
					{rating.traffic && (
						<Badge variant={TRAFFIC_TONE[rating.traffic]}>{rating.level}</Badge>
					)}
					<span>{t(`decision_${rating.decision}`)}</span>
					{rating.decision === "open" && rating.approvalRequestId && (
						<Link
							href="/heute/freigaben"
							className="text-primary hover:underline"
						>
							{t("approvalPending")}
						</Link>
					)}
					{rating.nextAssessmentAt && (
						<span className="text-muted-foreground">
							{t("nextAt", {
								date: fmtDate.format(new Date(rating.nextAssessmentAt)),
							})}
						</span>
					)}
				</div>
				{rating.decisionNote && (
					<p className="whitespace-pre-line rounded-2xl bg-card p-3 text-subhead">
						{rating.decisionNote}
					</p>
				)}
				{(["general", "security"] as const).map((area) => (
					<section key={area} className="flex flex-col gap-2">
						<h2 className="font-medium">{t(`res_${area}`)}</h2>
						<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
							{rating.criteria
								.filter((c) => c.area === area)
								.map((c) => {
									const s = rating.scores[c.code];
									return (
										<li
											key={c.code}
											className="grid grid-cols-1 gap-1 px-3 py-2 md:grid-cols-[1fr_10rem_1fr]"
										>
											<span className="font-medium">
												{c.title}
												<span className="ml-2 font-normal text-muted-foreground text-footnote">
													{t("weight", { w: c.weight })}
												</span>
											</span>
											<span>
												{s?.score ?? "—"} ·{" "}
												{s?.score ? c.anchors[s.score - 1] || "—" : ""}
											</span>
											<span className="text-muted-foreground text-footnote">
												{s?.note}
												{s?.ratedBy ? ` · ${names[s.ratedBy] ?? "—"}` : ""}
											</span>
										</li>
									);
								})}
						</ul>
					</section>
				))}
				<section className="flex flex-col gap-2">
					<h2 className="font-medium">{t("measuresTitle")}</h2>
					{rating.measures.length === 0 ? (
						<p className="text-muted-foreground text-subhead">—</p>
					) : (
						<ul className="flex flex-col gap-1 text-subhead">
							{rating.measures.map((m) => (
								<li key={m.code}>
									{m.title}
									{m.taskId && (
										<Link
											href="/heute/aufgaben"
											className="ml-2 text-primary text-footnote hover:underline"
										>
											{t("toTask")}
										</Link>
									)}
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl bg-card p-3">
			<p className="text-muted-foreground text-footnote">{label}</p>
			<p className="font-semibold text-title-2 tabular-nums">{value}</p>
		</div>
	);
}
