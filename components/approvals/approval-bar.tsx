import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { ApprovalStep } from "@/db/schema/grc";
import { orgRuleNamesCached } from "@/lib/approvals/designer-labels";
import { fmtDate } from "@/lib/compliance/page-data";
import { ApprovalActions } from "./approval-actions";
import { RouteProgress } from "./route-progress";

export type ApprovalBarData = {
	id: string;
	organizationId: string;
	status:
		| "pending"
		| "approved"
		| "rejected"
		| "changes_requested"
		| "withdrawn"
		| "expired";
	currentStep: number;
	dueAt: Date | null;
	requestedAt: Date;
	requestedByUserId: string | null;
	selfApproved: boolean;
	selfApprovalReason: string | null;
	workflowName: string;
	steps: ApprovalStep[];
	decisions: {
		step: number;
		approverUserId: string | null;
		decision: string;
		rule?: string | null;
		note: string | null;
		decidedAt: Date;
	}[];
};

const TONE: Record<
	ApprovalBarData["status"],
	"warning" | "success" | "destructive" | "muted" | "outline"
> = {
	pending: "warning",
	approved: "success",
	rejected: "destructive",
	changes_requested: "outline",
	withdrawn: "muted",
	expired: "muted",
};

// Freigabe-Leiste im Kopf einer Entität: Workflow, Stufe, nächste:r
// Freigeber:in-Regel, SLA, Entscheidungen; Aktionen für Berechtigte.
export async function ApprovalBar({
	data,
	names,
	eligible,
	currentUserId,
}: {
	data: ApprovalBarData | null;
	names: Map<string, string>;
	eligible: boolean;
	currentUserId: string;
}) {
	if (!data) return null;
	const ta = await getTranslations("Approvals");
	const ruleNames = await orgRuleNamesCached(
		data.organizationId,
		currentUserId,
	);
	const status = (x: string) =>
		x in TONE ? ta(`state_${x as ApprovalBarData["status"]}`) : x;
	const overdue =
		data.status === "pending" && data.dueAt !== null && data.dueAt < new Date();
	return (
		<div className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-subhead">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-footnote text-muted-foreground">
					{ta("bar")}
				</span>
				<span className="font-medium">{data.workflowName}</span>
				<Badge variant={TONE[data.status]}>{status(data.status)}</Badge>
				{data.dueAt && data.status === "pending" && (
					<span
						className={
							overdue
								? "text-destructive text-footnote"
								: "text-muted-foreground text-footnote"
						}
					>
						{overdue
							? ta("overdue")
							: `${ta("dueAt")} ${fmtDate.format(data.dueAt)}`}
					</span>
				)}
				{data.selfApproved && (
					<Badge variant="muted">{ta("selfApproved")}</Badge>
				)}
			</div>
			<RouteProgress
				steps={data.steps}
				currentStep={data.currentStep}
				status={data.status}
				decisions={data.decisions}
				names={ruleNames}
			/>
			{data.decisions.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-muted-foreground text-footnote">
					{data.decisions.map((d) => (
						<li key={`${d.step}-${d.decidedAt.toISOString()}`}>
							{ta("step", { n: d.step })} ·{" "}
							{d.approverUserId ? (names.get(d.approverUserId) ?? "—") : "—"} ·{" "}
							{status(d.decision)} {fmtDate.format(d.decidedAt)}
							{d.note ? ` — ${d.note}` : ""}
						</li>
					))}
				</ul>
			)}
			{data.status === "pending" && (
				<ApprovalActions
					requestId={data.id}
					eligible={eligible}
					mine={data.requestedByUserId === currentUserId}
					compact
				/>
			)}
		</div>
	);
}
