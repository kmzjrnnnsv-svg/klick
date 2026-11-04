import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { BcmPlanStatus } from "@/db/schema/bcm";
import type { PlanIssue } from "@/lib/bcm/plan";
import { fmtDate } from "@/lib/compliance/page-data";

// Stand des Notfallplans am Prozess: Entwurf oder Fassung, Überprüfung,
// Hinweise; ohne Plan ein Satz und der Einstieg.
export async function PlanSummary({
	code,
	plan,
	canEdit,
	canExport,
}: {
	code: string;
	plan: {
		status: BcmPlanStatus;
		version: number;
		releasedAt: Date | null;
		reviewAt: string | null;
		issues: PlanIssue[];
	} | null;
	canEdit: boolean;
	canExport: boolean;
}) {
	const t = await getTranslations("Bcm");
	const href = `/prozesse/${encodeURIComponent(code)}/notfallplan`;
	if (!plan)
		return (
			<div className="flex flex-col gap-3">
				<p className="text-muted-foreground text-subhead">{t("planNone")}</p>
				{canEdit && (
					<div>
						<Link href={href} className={buttonVariants({ size: "sm" })}>
							{t("planCreate")}
						</Link>
					</div>
				)}
			</div>
		);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 text-subhead">
				<Badge variant={plan.status === "released" ? "success" : "outline"}>
					{plan.status === "released"
						? t("planStatusReleased", {
								version: plan.version,
								date: plan.releasedAt ? fmtDate.format(plan.releasedAt) : "",
							})
						: t("planStatusDraft")}
				</Badge>
				{plan.reviewAt && (
					<span className="text-footnote text-muted-foreground">
						{t("planReviewAt", {
							date: fmtDate.format(new Date(plan.reviewAt)),
						})}
					</span>
				)}
			</div>
			{plan.issues.length > 0 && (
				<ul className="flex flex-wrap gap-2">
					{plan.issues.map((i) => (
						<li key={i}>
							<Badge
								variant={i === "recovery_over_rto" ? "destructive" : "warning"}
							>
								{t(`planIssue_${i}`)}
							</Badge>
						</li>
					))}
				</ul>
			)}
			<div className="flex flex-wrap gap-2">
				<Link
					href={href}
					className={buttonVariants({ size: "sm", variant: "outline" })}
				>
					{canEdit ? t("planEdit") : t("planOpen")}
				</Link>
				{canExport && (
					<a
						href={`/api/export/notfallplan.pdf?prozess=${encodeURIComponent(code)}`}
						className={buttonVariants({ size: "sm", variant: "ghost" })}
					>
						{t("planPdf")}
					</a>
				)}
			</div>
		</div>
	);
}
