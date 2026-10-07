import { Badge } from "@/components/ui/badge";
import type { ApprovalStep } from "@/db/schema/grc";
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
export function ApprovalBar({
	data,
	names,
	eligible,
	currentUserId,
	labels,
}: {
	data: ApprovalBarData | null;
	names: Map<string, string>;
	eligible: boolean;
	currentUserId: string;
	labels: {
		title: string;
		step: (n: number) => string;
		dueAt: string;
		overdue: string;
		selfApproved: string;
		history: string;
		status: (s: string) => string;
	};
}) {
	if (!data) return null;
	const stepDef = data.steps.find((s) => s.order === data.currentStep);
	const overdue =
		data.status === "pending" && data.dueAt !== null && data.dueAt < new Date();
	return (
		<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<span className="lv-eyebrow text-[0.52rem] text-muted-foreground">
					{labels.title}
				</span>
				<span className="font-medium">{data.workflowName}</span>
				<Badge variant={TONE[data.status]}>{labels.status(data.status)}</Badge>
				{data.status === "pending" && (
					<span className="text-muted-foreground text-xs">
						{labels.step(data.currentStep)} · {stepDef?.approverRule}
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
							? labels.overdue
							: `${labels.dueAt} ${fmtDate.format(data.dueAt)}`}
					</span>
				)}
				{data.selfApproved && (
					<Badge variant="muted">{labels.selfApproved}</Badge>
				)}
			</div>
			{data.decisions.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-muted-foreground text-xs">
					{data.decisions.map((d) => (
						<li key={`${d.step}-${d.decidedAt.toISOString()}`}>
							{labels.step(d.step)} ·{" "}
							{d.approverUserId ? (names.get(d.approverUserId) ?? "—") : "—"} ·{" "}
							{labels.status(d.decision)} {fmtDate.format(d.decidedAt)}
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
