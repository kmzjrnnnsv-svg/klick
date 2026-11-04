import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/entity/pagination";
import { RegisterFilters } from "@/components/entity/register-filters";
import { withMessages } from "@/components/i18n/with-messages";
import {
	CloseReviewButton,
	ConfirmAllButton,
	CreateEvidenceButton,
	DecisionButtons,
} from "@/components/identity/review-actions";
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
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import {
	accessReviewDetail,
	REVIEW_VIEWS,
	type ReviewView,
} from "@/lib/identity/review-queries";
import { canClose, mayDecide } from "@/lib/identity/review-rules";
import { PAGE_SIZE, pageParam, pageWindow } from "@/lib/paging";
import { cn } from "@/lib/utils";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fmtDay = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

// Eine Zugriffsprüfung (Teil D I2): je Konto bestätigen, anpassen oder
// entziehen; „Meine offenen“ zuerst. Abschluss schreibt den Test an
// CC-IAM-05 und Aufgaben; danach der Nachweis als Entwurf.
async function AccessReviewPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ identity: ["read"] });
	const { id } = await params;
	if (!UUID.test(id)) notFound();
	const sp = await searchParams;
	const t = await getTranslations("AccessReview");
	const page = pageParam(sp.seite);
	const requested = one(sp.ansicht);
	const q = one(sp.q)?.trim().slice(0, 100) || null;
	// ohne Angabe: „Meine offenen“, solange es welche gibt
	const first = await readOrg(toOrgCtx(ctx), (tx) =>
		accessReviewDetail(tx, ctx.orgId, id, {
			view: (REVIEW_VIEWS as readonly string[]).includes(requested ?? "")
				? (requested as ReviewView)
				: "meine",
			userId: ctx.userId,
			q,
			...pageWindow(page),
		}),
	);
	if (!first) notFound();
	const view: ReviewView =
		requested && (REVIEW_VIEWS as readonly string[]).includes(requested)
			? (requested as ReviewView)
			: first.mine > 0
				? "meine"
				: "alle";
	const data =
		view === "meine" || requested
			? first
			: await readOrg(toOrgCtx(ctx), (tx) =>
					accessReviewDetail(tx, ctx.orgId, id, {
						view,
						userId: ctx.userId,
						q,
						...pageWindow(page),
					}),
				);
	if (!data) notFound();
	const { review, progress } = data;
	const isOpen = review.status === "open";
	const canReview = allows(ctx, { identity: ["review"] });
	const canUpdate = allows(ctx, { identity: ["update"] });
	const canEvidence = allows(ctx, { evidence: ["create"] });
	const isOwner = ctx.orgRole === "owner";
	const counts: Record<ReviewView, number> = {
		meine: data.mine,
		offen: progress.open,
		alle: progress.total,
	};
	const viewHref = (v: ReviewView) => {
		const p = new URLSearchParams({ ansicht: v });
		if (q) p.set("q", q);
		return `/team/zugriffspruefung/${id}?${p}`;
	};
	const label = {
		confirm: t("confirmed"),
		adjust: t("adjusted"),
		revoke: t("revoked"),
	} as const;

	return (
		<>
			<PageHeader
				back={{ href: "/team/zugriffspruefung", label: t("title") }}
				title={review.title}
				lead={[
					t("startedBy", {
						date: fmtDay.format(review.startedAt),
						name: review.startedByName ?? t("unknown"),
					}),
					review.dueAt
						? t("dueAt", { date: fmtDay.format(new Date(review.dueAt)) })
						: null,
					review.closedAt
						? t("closedOn", { date: fmtDay.format(review.closedAt) })
						: null,
				]
					.filter(Boolean)
					.join(" · ")}
				actions={
					<span className="flex flex-wrap gap-2">
						{isOpen && canReview && (
							<ConfirmAllButton
								reviewId={review.id}
								count={isOwner ? progress.open : data.mine}
							/>
						)}
						{isOpen && canUpdate && (
							<CloseReviewButton
								reviewId={review.id}
								disabled={!canClose(progress)}
							/>
						)}
						{!isOpen && canEvidence && (
							<CreateEvidenceButton reviewId={review.id} />
						)}
					</span>
				}
			/>

			<dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
				{(
					[
						["total", progress.total],
						["open", progress.open],
						["confirm", progress.confirm],
						["adjust", progress.adjust],
						["revoke", progress.revoke],
					] as const
				).map(([k, n]) => (
					<div key={k} className="rounded-2xl bg-card p-3">
						<dt className="text-footnote text-muted-foreground">
							{t(`count_${k}`)}
						</dt>
						<dd className="font-semibold text-title-2 tabular-nums">{n}</dd>
					</div>
				))}
			</dl>
			{!isOpen && (
				<p className="mb-6 text-subhead">
					{t("closedHint")}{" "}
					<Link
						href="/controls/CC-IAM-05#automatisch"
						className="whitespace-nowrap text-primary underline-offset-4 hover:underline"
					>
						{t("toControl")}
					</Link>
				</p>
			)}
			{isOpen && !canClose(progress) && canUpdate && (
				<p className="mb-6 text-muted-foreground text-subhead">
					{t("closeWhenDone", { n: progress.open })}
				</p>
			)}

			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
				<nav
					aria-label={t("viewLabel")}
					className="inline-flex w-fit max-w-full overflow-x-auto rounded-xl bg-muted p-0.5 text-subhead"
				>
					{REVIEW_VIEWS.map((v) => (
						<Link
							key={v}
							href={viewHref(v)}
							aria-current={view === v ? "true" : undefined}
							className={cn(
								"hit-area inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5",
								view === v && "bg-card font-medium shadow-sm",
							)}
						>
							{t(`view_${v}`)}
							<span className="tabular-nums text-muted-foreground">
								{counts[v]}
							</span>
						</Link>
					))}
				</nav>
				<RegisterFilters
					filters={[]}
					searchPlaceholder={t("search")}
					ignore={["ansicht"]}
				/>
			</div>

			{data.items.length === 0 ? (
				<p className="text-muted-foreground text-subhead">
					{view === "meine" ? t("noneMine") : t("noMatch")}
				</p>
			) : (
				<div className="overflow-hidden rounded-2xl bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pl-4">{t("colAccount")}</TableHead>
								<TableHead className="max-md:hidden">
									{t("colRights")}
								</TableHead>
								<TableHead className="max-lg:hidden">
									{t("colSignIn")}
								</TableHead>
								<TableHead className="max-xl:hidden">
									{t("colReviewer")}
								</TableHead>
								<TableHead className="pr-4">{t("colDecision")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.items.map((i) => {
								const s = i.snapshot;
								const editable =
									isOpen &&
									canReview &&
									mayDecide({
										reviewerUserId: i.reviewerUserId,
										userId: ctx.userId,
										isOwner,
									});
								return (
									<TableRow key={i.id}>
										<TableCell className="max-w-64 pl-4 align-top">
											<span className="flex min-w-0 flex-col">
												<span className="truncate font-medium">
													{i.accountId ? (
														<Link
															href={`/team/konten/${i.accountId}`}
															className="underline-offset-4 hover:underline"
														>
															{s.name ?? s.email}
														</Link>
													) : (
														(s.name ?? s.email)
													)}
												</span>
												{s.email && (
													<span className="truncate text-footnote text-muted-foreground">
														{s.email}
													</span>
												)}
											</span>
										</TableCell>
										<TableCell className="align-top max-md:hidden">
											<span className="flex flex-wrap gap-1">
												{s.admin ? (
													<Badge variant="default">
														{s.roles?.[0] ?? t("admin")}
													</Badge>
												) : (
													<Badge variant="outline">
														{s.kind === "guest" ? t("guest") : t("member")}
													</Badge>
												)}
												{s.mfa === false && (
													<Badge variant="destructive">{t("noMfa")}</Badge>
												)}
											</span>
										</TableCell>
										<TableCell className="whitespace-nowrap align-top tabular-nums max-lg:hidden">
											{s.lastSignInAt
												? fmtDay.format(new Date(s.lastSignInAt))
												: t("never")}
										</TableCell>
										<TableCell className="align-top text-footnote text-muted-foreground max-xl:hidden">
											{i.reviewerName ?? "–"}
										</TableCell>
										<TableCell className="pr-4 align-top">
											<span className="flex flex-col items-start gap-1">
												{editable ? (
													<DecisionButtons itemId={i.id} current={i.decision} />
												) : i.decision ? (
													<Badge
														variant={
															i.decision === "revoke"
																? "destructive"
																: i.decision === "adjust"
																	? "warning"
																	: "success"
														}
													>
														{label[i.decision]}
													</Badge>
												) : (
													<span className="text-footnote text-muted-foreground">
														{t("pending")}
													</span>
												)}
												{i.note && (
													<span className="max-w-72 break-words text-footnote text-muted-foreground">
														{i.note}
													</span>
												)}
												{i.decidedAt && i.decidedByName && (
													<span className="text-footnote text-muted-foreground">
														{t("decidedBy", {
															name: i.decidedByName,
															date: fmtDay.format(i.decidedAt),
														})}
													</span>
												)}
												{i.taskId && (
													<Link
														href="/heute/aufgaben"
														className="hit-area text-footnote text-primary underline-offset-4 hover:underline"
													>
														{t("taskCreated")}
													</Link>
												)}
											</span>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
			<div className="mt-4">
				<Pagination
					page={page}
					total={data.total}
					pageSize={PAGE_SIZE}
					path={`/team/zugriffspruefung/${id}`}
					query={sp}
				/>
			</div>
		</>
	);
}

export default withMessages(AccessReviewPage, [
	"AccessReview",
	"Common",
	"Entity",
]);
