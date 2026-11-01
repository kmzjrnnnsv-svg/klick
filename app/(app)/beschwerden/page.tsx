import { getTranslations } from "next-intl/server";
import {
	ComplaintForm,
	TransitionButtons,
	WhistleblowingForm,
} from "@/components/complaints/complaint-forms";
import { EmptyState } from "@/components/entity/empty-state";
import { OwnerChip } from "@/components/entity/owner-chip";
import { UrlTabs } from "@/components/entity/url-tabs";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { isExternal } from "@/lib/auth/memberships";
import { allows } from "@/lib/auth/permissions";
import { aggregateCases, clockState } from "@/lib/compliance/complaints";
import { listMembersForPicker } from "@/lib/compliance/queries";
import {
	listComplaints,
	listWhistleblowingReports,
} from "@/lib/compliance/queries-p3";
import { decryptMany, fieldAad } from "@/lib/crypto/org-dek";
import { readOrg } from "@/lib/db/with-org";
import { responsibleValue } from "@/lib/validation/responsible-ref";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const CLOCK_TONE = {
	done: "success",
	ok: "outline",
	soon: "warning",
	overdue: "destructive",
} as const;
const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// Beschwerden & Hinweise: Prüfer:innen ohne Grant sehen nur Zähler; Details
// (Pseudonym, Zusammenfassung) sind feldverschlüsselt und nur für Bearbeitende.
async function ComplaintsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ complaint: ["read"] });
	const sp = await searchParams;
	const tab = one(sp.tab) === "hinweise" ? "hinweise" : "beschwerden";
	const t = await getTranslations("Complaints");
	const tf = await getTranslations("Functions");
	const now = new Date();
	const canEditComplaints = allows(ctx, { complaint: ["update"] });
	const canSeeWb =
		allows(ctx, { whistleblowing: ["read"] }) ||
		ctx.grants.includes("whistleblowing_detail");
	const canEditWb = allows(ctx, { whistleblowing: ["update"] });
	const detailComplaints =
		!isExternal(ctx.orgRole) || ctx.grants.includes("complaints_detail");

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const complaints = await listComplaints(tx, ctx.orgId);
		const members = await listMembersForPicker(tx, ctx.orgId);
		const refs = canEditComplaints
			? await decryptMany<string>(
					tx,
					ctx.orgId,
					complaints.map((c) => ({
						stored: c.complainantRef,
						aad: fieldAad("complaints", c.id, "complainant_ref"),
					})),
				)
			: complaints.map(() => null);
		const reports = canSeeWb
			? await listWhistleblowingReports(tx, ctx.orgId)
			: [];
		const summaries = canEditWb
			? await decryptMany<string>(
					tx,
					ctx.orgId,
					reports.map((r) => ({
						stored: r.summary,
						aad: fieldAad("whistleblowing_reports", r.id, "summary"),
					})),
				)
			: reports.map(() => null);
		return { complaints, members, refs, reports, summaries };
	});
	const functionLabels = Object.fromEntries(
		ROLE_FUNCTIONS.map((f) => [f, tf(f)]),
	) as Record<string, string>;
	const aggC = aggregateCases(
		data.complaints,
		now,
		(r) => r.responseDueAt,
		(r) => r.resolvedAt,
	);
	const aggW = aggregateCases(
		data.reports,
		now,
		(r) => r.feedbackDueAt,
		(r) => r.feedbackAt,
	);

	const Stats = ({ a }: { a: typeof aggC }) => (
		<div className="mb-4 grid grid-cols-1 gap-3 text-subhead sm:grid-cols-4">
			<div className="rounded-2xl bg-card p-3">
				<p className="font-medium text-footnote text-muted-foreground">
					{t("open")}
				</p>
				<p className="font-bold text-title-2">{a.open}</p>
			</div>
			<div className="rounded-2xl bg-card p-3">
				<p className="font-medium text-footnote text-muted-foreground">
					{t("ackOverdue")}
				</p>
				<p
					className={`font-bold text-title-2 ${a.ackOverdue ? "text-destructive" : "text-primary"}`}
				>
					{a.ackOverdue}
				</p>
			</div>
			<div className="rounded-2xl bg-card p-3">
				<p className="font-medium text-footnote text-muted-foreground">
					{t("responseOverdue")}
				</p>
				<p
					className={`font-bold text-title-2 ${a.responseOverdue ? "text-destructive" : "text-primary"}`}
				>
					{a.responseOverdue}
				</p>
			</div>
			<div className="rounded-2xl bg-card p-3">
				<p className="font-medium text-footnote text-muted-foreground">
					{t("last90")}
				</p>
				<p className="font-bold text-title-2">{a.last90Days}</p>
			</div>
		</div>
	);

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					tab === "beschwerden" && canEditComplaints ? (
						<ComplaintForm members={data.members} />
					) : tab === "hinweise" && canEditWb ? (
						<WhistleblowingForm functionLabels={functionLabels} />
					) : undefined
				}
			/>
			<UrlTabs
				base="/beschwerden"
				active={tab}
				tabs={[
					{
						value: "beschwerden",
						label: t("tabComplaints"),
						count: aggC.open || undefined,
					},
					{
						value: "hinweise",
						label: t("tabReports"),
						count: canSeeWb ? aggW.open || undefined : undefined,
					},
				]}
			/>

			{tab === "beschwerden" && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-subhead">
						{t("complaintsLead")}
					</p>
					<Stats a={aggC} />
					{!detailComplaints ? (
						<p className="rounded-2xl bg-card p-3 text-subhead">
							{t("aggregatedOnly")}
						</p>
					) : data.complaints.length === 0 ? (
						<EmptyState
							title={t("complaintsEmpty")}
							lead={t("complaintsEmptyLead")}
							requiredBy={t("requiredByComplaints")}
							actions={
								canEditComplaints ? (
									<ComplaintForm members={data.members} />
								) : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-28">{t("code")}</TableHead>
									<TableHead className="w-36">{t("receivedAt")}</TableHead>
									<TableHead>{t("category")}</TableHead>
									<TableHead className="w-32">{t("ack")}</TableHead>
									<TableHead className="w-32">{t("response")}</TableHead>
									<TableHead className="w-36">{t("owner")}</TableHead>
									<TableHead className="w-56">{t("status")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.complaints.map((c, i) => {
									const ack = clockState(c.ackDueAt, c.acknowledgedAt, now);
									const resp = clockState(c.responseDueAt, c.resolvedAt, now);
									const next =
										c.status === "open"
											? [
													{
														to: "acknowledged",
														label: t("acknowledge"),
														primary: true,
													},
												]
											: c.status === "acknowledged"
												? [
														{
															to: "resolved",
															label: t("resolve"),
															primary: true,
														},
													]
												: c.status === "resolved"
													? [
															{
																to: "closed",
																label: t("close"),
																primary: true,
															},
															{ to: "open", label: t("reopen") },
														]
													: [{ to: "open", label: t("reopen") }];
									return (
										<TableRow key={c.id}>
											<TableCell className="whitespace-nowrap font-mono text-footnote">
												{c.code}
											</TableCell>
											<TableCell className="text-footnote">
												{fmt.format(c.receivedAt)}
												<br />
												<span className="text-muted-foreground">
													{c.channel ?? ""}
												</span>
											</TableCell>
											<TableCell>
												<p className="font-medium">{c.category ?? "—"}</p>
												{c.description && (
													<p className="line-clamp-2 text-muted-foreground text-footnote">
														{c.description}
													</p>
												)}
												{data.refs[i] && (
													<p className="text-footnote text-muted-foreground">
														{t("complainantRef")}: {data.refs[i]}
													</p>
												)}
												{c.escalatedToRegulator && (
													<Badge variant="warning" className="mt-1">
														{t("escalatedShort")}
													</Badge>
												)}
											</TableCell>
											<TableCell>
												<Badge variant={CLOCK_TONE[ack]}>
													{t(`clock_${ack}`)}
												</Badge>
												{c.ackDueAt && (
													<p className="text-footnote text-muted-foreground">
														{fmt.format(c.ackDueAt)}
													</p>
												)}
											</TableCell>
											<TableCell>
												<Badge variant={CLOCK_TONE[resp]}>
													{t(`clock_${resp}`)}
												</Badge>
												{c.responseDueAt && (
													<p className="text-footnote text-muted-foreground">
														{fmt.format(c.responseDueAt)}
													</p>
												)}
											</TableCell>
											<TableCell>
												<OwnerChip
													ownerFunction={c.ownerFunction}
													name={c.ownerName}
												/>
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap items-center gap-1">
													<Badge
														variant={
															c.status === "closed"
																? "muted"
																: c.status === "open"
																	? "destructive"
																	: "outline"
														}
													>
														{t(`cstatus_${c.status}`)}
													</Badge>
													{canEditComplaints && (
														<>
															<TransitionButtons
																id={c.id}
																kind="complaint"
																options={next}
															/>
															<ComplaintForm
																members={data.members}
																initial={{
																	id: c.id,
																	receivedAt: c.receivedAt
																		.toISOString()
																		.slice(0, 16),
																	channel: c.channel,
																	category: c.category,
																	description: c.description,
																	complainantRef: data.refs[i] ?? "",
																	ownerUserId: responsibleValue(c),
																	outcome: c.outcome,
																	escalatedToRegulator: c.escalatedToRegulator,
																}}
															/>
														</>
													)}
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{tab === "hinweise" && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-subhead">
						{t("reportsLead")}
					</p>
					{!canSeeWb ? (
						<p className="rounded-2xl bg-card p-3 text-subhead">
							{t("aggregatedOnly")}
						</p>
					) : (
						<>
							<Stats a={aggW} />
							{data.reports.length === 0 ? (
								<EmptyState
									title={t("reportsEmpty")}
									lead={t("reportsEmptyLead")}
									requiredBy={t("requiredByReports")}
									actions={
										canEditWb ? (
											<WhistleblowingForm functionLabels={functionLabels} />
										) : undefined
									}
								/>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-28">{t("ref")}</TableHead>
											<TableHead className="w-36">{t("receivedAt")}</TableHead>
											<TableHead>{t("category")}</TableHead>
											<TableHead className="w-32">{t("ack7")}</TableHead>
											<TableHead className="w-32">{t("feedback3m")}</TableHead>
											<TableHead className="w-40">
												{t("ownerFunction")}
											</TableHead>
											<TableHead className="w-56">{t("status")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{data.reports.map((r, i) => {
											const ack = clockState(r.ackDueAt, r.acknowledgedAt, now);
											const fb = clockState(r.feedbackDueAt, r.feedbackAt, now);
											const next =
												r.status === "received"
													? [
															{
																to: "acknowledged",
																label: t("acknowledge"),
																primary: true,
															},
														]
													: r.status === "acknowledged"
														? [
																{
																	to: "in_review",
																	label: t("startReview"),
																	primary: true,
																},
															]
														: r.status === "in_review"
															? [
																	{
																		to: "closed",
																		label: t("closeWithFeedback"),
																		primary: true,
																	},
																]
															: [{ to: "received", label: t("reopen") }];
											return (
												<TableRow key={r.id}>
													<TableCell className="font-mono text-footnote">
														{r.internalRef}
													</TableCell>
													<TableCell className="text-footnote">
														{fmt.format(r.receivedAt)}
														<br />
														<span className="text-muted-foreground">
															{r.channel ?? ""}
														</span>
													</TableCell>
													<TableCell>
														<p className="font-medium">{r.category ?? "—"}</p>
														{data.summaries[i] && (
															<p className="line-clamp-2 text-muted-foreground text-footnote">
																{data.summaries[i]}
															</p>
														)}
													</TableCell>
													<TableCell>
														<Badge variant={CLOCK_TONE[ack]}>
															{t(`clock_${ack}`)}
														</Badge>
														{r.ackDueAt && (
															<p className="text-footnote text-muted-foreground">
																{fmt.format(r.ackDueAt)}
															</p>
														)}
													</TableCell>
													<TableCell>
														<Badge variant={CLOCK_TONE[fb]}>
															{t(`clock_${fb}`)}
														</Badge>
														{r.feedbackDueAt && (
															<p className="text-footnote text-muted-foreground">
																{fmt.format(r.feedbackDueAt)}
															</p>
														)}
													</TableCell>
													<TableCell className="text-footnote">
														{functionLabels[r.ownerFunction]}
													</TableCell>
													<TableCell>
														<div className="flex flex-wrap items-center gap-1">
															<Badge
																variant={
																	r.status === "closed"
																		? "muted"
																		: r.status === "received"
																			? "destructive"
																			: "outline"
																}
															>
																{t(`wstatus_${r.status}`)}
															</Badge>
															{canEditWb && (
																<>
																	<TransitionButtons
																		id={r.id}
																		kind="whistleblowing"
																		options={next}
																	/>
																	<WhistleblowingForm
																		functionLabels={functionLabels}
																		initial={{
																			id: r.id,
																			receivedAt: r.receivedAt
																				.toISOString()
																				.slice(0, 16),
																			channel: r.channel,
																			category: r.category,
																			summary: data.summaries[i] ?? "",
																			ownerFunction: r.ownerFunction,
																		}}
																	/>
																</>
															)}
														</div>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							)}
						</>
					)}
				</section>
			)}
		</>
	);
}

export default withMessages(ComplaintsPage, [
	"Auth",
	"Common",
	"Complaints",
	"Entity",
	"Functions",
	"Organisation",
]);
