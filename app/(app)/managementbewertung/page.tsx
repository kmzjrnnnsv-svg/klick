import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { OwnerChip } from "@/components/entity/owner-chip";
import { UserChip } from "@/components/entity/user-chip";
import { EntityEvidence } from "@/components/evidence-studio/entity-evidence";
import { ReviewDigestView } from "@/components/management-review/review-digest";
import {
	CompleteReviewForm,
	ReviewForm,
	ReviewInputsChecklist,
} from "@/components/management-review/review-forms";
import { PageHeader } from "@/components/page-header";
import { ResolutionForm } from "@/components/resolutions/resolution-form";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	applicableReviewInputs,
	reviewComplete,
} from "@/lib/compliance/catalog/management-review-inputs";
import { asDigest } from "@/lib/compliance/management-review-digest";
import { fmtDate } from "@/lib/compliance/page-data";
import { getOrgProfile, listMembersForPicker } from "@/lib/compliance/queries";
import { listManagementReviews } from "@/lib/compliance/queries-p3";
import { buildReviewDigest } from "@/lib/compliance/queries-review-digest";
import { readOrg } from "@/lib/db/with-org";
import { responsibleValue } from "@/lib/validation/responsible";

const STATUS_TONE = {
	planned: "outline",
	held: "warning",
	done: "success",
} as const;

export default async function ManagementReviewPage() {
	const ctx = await requireOrgPage({ management_review: ["read"] });
	const t = await getTranslations("ManagementReview");
	const canEdit = allows(ctx, { management_review: ["update"] });
	const canResolve = allows(ctx, { resolution: ["create"] });
	const { reviews, members, inputs, live } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const profile = await getOrgProfile(tx, ctx.orgId);
			return {
				reviews: await listManagementReviews(tx, ctx.orgId),
				members: await listMembersForPicker(tx, ctx.orgId),
				inputs: applicableReviewInputs(profile?.frameworks ?? []),
				live: await buildReviewDigest(tx, ctx.orgId),
			};
		},
	);
	const sorted = [...reviews].sort(
		(a, b) =>
			b.heldAt.localeCompare(a.heldAt) ||
			b.createdAt.getTime() - a.createdAt.getTime(),
	);
	const last = reviews
		.filter((r) => r.status === "done")
		.sort((a, b) => b.heldAt.localeCompare(a.heldAt))[0];
	const yearAgo = new Date();
	yearAgo.setFullYear(yearAgo.getFullYear() - 1);
	const stale = !last || new Date(last.heldAt) < yearAgo;
	const digestLabels = {
		period: t("digestPeriod"),
		open: t("digestOpen"),
		nothing: t("digestNothing"),
	};

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={canEdit ? <ReviewForm members={members} /> : undefined}
			/>
			<div
				className={`mb-6 rounded-2xl bg-card p-3 text-subhead ${stale ? "border-warning/40 bg-warning/5" : ""}`}
			>
				{last ? (
					<>
						<span className="font-medium">{t("lastReview")}:</span>{" "}
						{fmtDate.format(new Date(last.heldAt))}
						{stale && (
							<span className="ml-2 text-warning">{t("staleHint")}</span>
						)}
					</>
				) : (
					<span className="text-warning">{t("noneYet")}</span>
				)}
			</div>
			<details
				open
				className="group mb-6 flex flex-col gap-3 rounded-2xl bg-card p-4"
			>
				<summary className="flex min-h-(--control-h-sm) cursor-pointer list-none flex-wrap items-center justify-between gap-2">
					<span className="font-semibold text-headline">
						{t("digestTitle")}
					</span>
					<a
						href="/api/export/managementbewertung.md"
						className="text-primary text-subhead underline-offset-4 hover:underline"
					>
						{t("digestExport")}
					</a>
				</summary>
				<p className="mt-1 mb-3 text-muted-foreground text-subhead">
					{t("digestLead")}
				</p>
				<ReviewDigestView digest={live} labels={digestLabels} />
			</details>
			{reviews.length === 0 ? (
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={canEdit ? <ReviewForm members={members} /> : undefined}
				/>
			) : (
				<div className="flex flex-col gap-6">
					{sorted.map((r) => {
						const check = reviewComplete(r.inputs, inputs);
						const snapshot = asDigest(r.digest);
						return (
							<article
								key={r.id}
								className="flex flex-col gap-4 rounded-2xl bg-card p-4 text-subhead"
							>
								<div className="flex flex-wrap items-center gap-3">
									<h2 className="font-semibold text-title-3">
										{fmtDate.format(new Date(r.heldAt))}
									</h2>
									<Badge variant={STATUS_TONE[r.status]}>
										{t(`status_${r.status}`)}
									</Badge>
									<span className="text-muted-foreground text-footnote">
										{t("owner")}:{" "}
										<OwnerChip
											ownerFunction={r.ownerFunction}
											name={r.ownerName}
										/>
									</span>
									{r.attendeeNames.length > 0 && (
										<span className="text-muted-foreground text-footnote">
											{t("attendees")}: {r.attendeeNames.join(", ")}
										</span>
									)}
									{canEdit && r.status !== "done" && (
										<div className="ml-auto">
											<ReviewForm
												members={members}
												initial={{
													id: r.id,
													heldAt: r.heldAt,
													attendeeUserIds: r.attendeeUserIds,
													summary: r.summary,
													decisions: r.decisions,
													ownerUserId: responsibleValue(r),
												}}
											/>
										</div>
									)}
								</div>
								<EntityEvidence
									ctx={ctx}
									code="NW-MANAGEMENTBEWERTUNG"
									entityId={r.id}
								/>
								<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
									<div>
										<h3 className="font-medium text-footnote mb-2 text-muted-foreground">
											{t("inputs")}
										</h3>
										<ReviewInputsChecklist
											reviewId={r.id}
											inputs={inputs}
											value={r.inputs}
											canEdit={canEdit && r.status !== "done"}
										/>
									</div>
									<div className="flex flex-col gap-4">
										{r.summary && (
											<div>
												<h3 className="font-medium text-footnote mb-1 text-muted-foreground">
													{t("summary")}
												</h3>
												<p className="whitespace-pre-wrap">{r.summary}</p>
											</div>
										)}
										{r.decisions && (
											<div>
												<h3 className="font-medium text-footnote mb-1 text-muted-foreground">
													{t("decisions")}
												</h3>
												<p className="whitespace-pre-wrap">{r.decisions}</p>
											</div>
										)}
										<div>
											<div className="mb-1 flex items-center justify-between gap-2">
												<h3 className="font-medium text-footnote text-muted-foreground">
													{t("outcomes")}
												</h3>
												{canResolve && (
													<ResolutionForm
														members={members}
														required={[]}
														trigger="link"
														triggerLabel={t("addResolution")}
														soloHint={members.length <= 1}
														linked={{
															type: "management_review",
															id: r.id,
															label: `${t("title")} ${fmtDate.format(new Date(r.heldAt))}`,
															date: r.heldAt,
															attendeeUserIds: r.attendeeUserIds,
														}}
													/>
												)}
											</div>
											{r.outcomes.resolutions.length +
												r.outcomes.tasks.length +
												r.outcomes.nonconformities.length ===
											0 ? (
												<p className="text-muted-foreground text-footnote">
													{t("noOutcomes")}
												</p>
											) : (
												<ul className="flex flex-col gap-1.5">
													{r.outcomes.resolutions.map((x) => (
														<li
															key={x.id}
															className="flex flex-wrap items-center gap-2"
														>
															<Badge variant="outline">
																{t("kind_resolution")}
															</Badge>
															<Link
																href="/beschluesse"
																className="hover:underline"
															>
																<span className="font-mono text-footnote">
																	{x.number}
																</span>{" "}
																{x.subject}
															</Link>
															<Badge
																variant={
																	x.effective
																		? "success"
																		: x.approvalStatus === "rejected"
																			? "destructive"
																			: "warning"
																}
															>
																{x.effective
																	? t("approvalApproved")
																	: x.approvalStatus === "rejected"
																		? t("approvalRejected")
																		: t("approvalPending")}
															</Badge>
														</li>
													))}
													{r.outcomes.tasks.map((x) => (
														<li
															key={x.id}
															className="flex flex-wrap items-center gap-2"
														>
															<Badge variant="outline">{t("kind_task")}</Badge>
															<Link
																href="/heute/aufgaben"
																className="hover:underline"
															>
																{x.title}
															</Link>
														</li>
													))}
													{r.outcomes.nonconformities.map((x) => (
														<li
															key={x.id}
															className="flex flex-wrap items-center gap-2"
														>
															<Badge variant="outline">
																{t("kind_nonconformity")}
															</Badge>
															<Link
																href={`/abweichungen/${x.id}`}
																className="hover:underline"
															>
																<span className="font-mono text-footnote">
																	{x.code}
																</span>{" "}
																{x.title}
															</Link>
														</li>
													))}
												</ul>
											)}
										</div>
										{canEdit && r.status !== "done" && (
											<CompleteReviewForm
												reviewId={r.id}
												status={r.status}
												members={members}
												complete={check.complete}
											/>
										)}
										{r.status === "done" && (
											<p className="text-muted-foreground text-footnote">
												{t("doneHint")}
											</p>
										)}
									</div>
								</div>
								{snapshot && (
									<details className="flex flex-col gap-3 border-t pt-3">
										<summary className="flex min-h-(--control-h-sm) cursor-pointer list-none flex-wrap items-center justify-between gap-2">
											<span className="font-medium text-footnote text-muted-foreground">
												{t("digestSnapshot")}
											</span>
											<a
												href={`/api/export/managementbewertung.md?id=${r.id}`}
												className="text-primary text-footnote underline-offset-4 hover:underline"
											>
												{t("digestExport")}
											</a>
										</summary>
										<div className="mt-3">
											<ReviewDigestView
												digest={snapshot}
												labels={digestLabels}
											/>
										</div>
									</details>
								)}
							</article>
						);
					})}
				</div>
			)}
		</>
	);
}
