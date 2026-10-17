import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { ApprovalStep } from "@/db/schema/grc";
import { ROLE_LABEL } from "@/lib/auth/memberships";
import { fmtDate } from "@/lib/compliance/page-data";
import { ApprovalActions } from "./approval-actions";

export type ApprovalBarData = {
	id: string;
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
	const tf = await getTranslations("Functions");
	const status = (x: string) =>
		x in TONE ? ta(`state_${x as ApprovalBarData["status"]}`) : x;
	const rule = (r: string | undefined) => {
		if (!r) return "";
		const [kind, arg] = r.split(":");
		if (kind === "function" && arg) return tf(arg as never);
		if (kind === "role" && arg)
			return ta("rule_role", {
				role: ROLE_LABEL[arg as keyof typeof ROLE_LABEL] ?? arg,
			});
		if (kind === "owner_of_entity") return ta("rule_owner_of_entity");
		if (kind === "not_requester") return ta("rule_not_requester");
		if (kind === "user") return ta("rule_user");
		return r;
	};
	const stepDef = data.steps.find((s) => s.order === data.currentStep);
	const overdue =
		data.status === "pending" && data.dueAt !== null && data.dueAt < new Date();
	return (
		<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<span className="lv-eyebrow text-[0.52rem] text-muted-foreground">
					{ta("bar")}
				</span>
				<span className="font-medium">{data.workflowName}</span>
				<Badge variant={TONE[data.status]}>{status(data.status)}</Badge>
				{data.status === "pending" && (
					<span className="text-muted-foreground text-xs">
						{ta("step", { n: data.currentStep })} ·{" "}
						{rule(stepDef?.approverRule)}
					</span>
				)}
				{data.dueAt && data.status === "pending" && (
					<span
						className={
							overdue
								? "text-destructive text-xs"
								: "text-muted-foreground text-xs"
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
			{data.decisions.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-muted-foreground text-xs">
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
