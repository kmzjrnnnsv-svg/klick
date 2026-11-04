import { getTranslations } from "next-intl/server";
import { withMessages } from "@/components/i18n/with-messages";
import { StartReviewDialog } from "@/components/identity/review-actions";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListRow, ListSection } from "@/components/ui/list";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { identitySourceViews } from "@/lib/identity/queries";
import {
	listAccessReviews,
	reviewerOptions,
} from "@/lib/identity/review-queries";

const fmtDay = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

const PROVIDER: Record<string, string> = {
	entra: "Microsoft Entra ID",
	google: "Google Workspace",
	okta: "Okta",
};

// Zugriffsprüfung (Teil D I2): Liste und Start. Erreichbar über /team/konten
// und den Abschnitt am Control CC-IAM-05, ohne eigenen Menüeintrag.
async function AccessReviewsPage() {
	const ctx = await requireOrgPage({ identity: ["read"] });
	const t = await getTranslations("AccessReview");
	const { reviews, sources, reviewers } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			reviews: await listAccessReviews(tx, ctx.orgId),
			sources: (await identitySourceViews(tx, ctx.orgId)).filter(
				(s) => s.status !== "pending_consent",
			),
			reviewers: await reviewerOptions(tx, ctx.orgId),
		}),
	);
	const canStart = allows(ctx, { identity: ["update"] });
	const openReview = reviews.find((r) => r.status === "open");
	const quarter = Math.floor(new Date().getMonth() / 3) + 1;
	return (
		<>
			<PageHeader
				back={{ href: "/team/konten", label: t("backAccounts") }}
				title={t("title")}
				lead={t("lead")}
				actions={
					canStart && sources.length > 0 ? (
						<StartReviewDialog
							sources={sources.map((s) => ({
								id: s.id,
								label: PROVIDER[s.provider] ?? s.provider,
							}))}
							reviewers={reviewers}
							defaultReviewer={
								reviewers.some((r) => r.userId === ctx.userId)
									? ctx.userId
									: (reviewers[0]?.userId ?? "")
							}
							defaultTitle={t("defaultTitle", {
								quarter,
								year: new Date().getFullYear(),
							})}
							disabled={Boolean(openReview)}
						/>
					) : undefined
				}
			/>
			{sources.length === 0 && (
				<p className="mb-6 text-muted-foreground text-subhead">
					{t("noSource")}
				</p>
			)}
			{openReview && canStart && (
				<p className="mb-6 text-muted-foreground text-subhead">
					{t("oneOpen")}
				</p>
			)}
			{reviews.length === 0 ? (
				<p className="text-muted-foreground text-subhead">{t("empty")}</p>
			) : (
				<ListSection>
					{reviews.map((r) => (
						<ListRow
							key={r.id}
							href={`/team/zugriffspruefung/${r.id}`}
							title={r.title}
							subtitle={[
								t("startedBy", {
									date: fmtDay.format(r.startedAt),
									name: r.startedByName ?? t("unknown"),
								}),
								r.dueAt
									? t("dueAt", { date: fmtDay.format(new Date(r.dueAt)) })
									: null,
								r.status === "open"
									? t("openOf", { open: r.open, total: r.total })
									: t("closedAt", {
											date: fmtDay.format(r.closedAt ?? r.startedAt),
											total: r.total,
										}),
							]
								.filter(Boolean)
								.join(" · ")}
							accessory={
								<Badge variant={r.status === "open" ? "warning" : "success"}>
									{r.status === "open" ? t("statusOpen") : t("statusClosed")}
								</Badge>
							}
						/>
					))}
				</ListSection>
			)}
		</>
	);
}

export default withMessages(AccessReviewsPage, ["Common", "AccessReview"]);
