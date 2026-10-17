import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { ApprovalStep } from "@/db/schema/grc";
import { fmtDate } from "@/lib/compliance/page-data";
import { cn } from "@/lib/utils";
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

// Freigabe-Leiste im Kopf einer Entität: Workflow, Stufen als Punkte-Leiste,
// wer gerade dran ist (Namen statt „function:compliance“), SLA,
// Entscheidungen; Aktionen für Berechtigte.
export async function ApprovalBar({
	data,
	names,
	eligible,
	currentUserId,
	waitingFor = [],
}: {
	data: ApprovalBarData | null;
	names: Map<string, string>;
	eligible: boolean;
	currentUserId: string;
	// Namen der Personen, die die aktuelle Stufe entscheiden dürfen
	waitingFor?: string[];
}) {
	if (!data) return null;
	const t = await getTranslations("Approvals");
	const tf = await getTranslations("Functions");
	const tt = await getTranslations("Team");
	const status = (s: string) =>
		t.has(`status_${s}` as "status_pending")
			? t(`status_${s}` as "status_pending")
			: s;
	const ruleLabel = (rule: string) => {
		const [kind, value = ""] = rule.split(":");
		if (kind === "function" && tf.has(value as "compliance"))
			return tf(value as "compliance");
		if (kind === "role") {
			const key = `role${value.charAt(0).toUpperCase()}${value.slice(1)}`;
			if (tt.has(key as "roleOwner")) return tt(key as "roleOwner");
		}
		if (kind === "owner_of_entity") return t("ruleOwner");
		if (kind === "not_requester") return t("ruleNotRequester");
		return t("ruleUser");
	};
	const ordered = [...data.steps].sort((a, b) => a.order - b.order);
	const stepDef = ordered.find((s) => s.order === data.currentStep);
	const stepIndex = ordered.findIndex((s) => s.order === data.currentStep);
	const overdue =
		data.status === "pending" && data.dueAt !== null && data.dueAt < new Date();
	return (
		<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<span className="lv-eyebrow text-[0.52rem] text-muted-foreground">
					{t("bar")}
				</span>
				<span className="font-medium">{data.workflowName}</span>
				<Badge variant={TONE[data.status]}>{status(data.status)}</Badge>
				{data.dueAt && data.status === "pending" && (
					<span
						className={
							overdue
								? "text-destructive text-xs"
								: "text-muted-foreground text-xs"
						}
					>
						{overdue
							? t("overdue")
							: `${t("dueAt")} ${fmtDate.format(data.dueAt)}`}
					</span>
				)}
				{data.selfApproved && (
					<Badge variant="muted">{t("selfApproved")}</Badge>
				)}
			</div>
			{ordered.length > 1 && (
				<ol
					className="flex flex-wrap items-center gap-1.5 text-xs"
					aria-label={t("stepsLabel")}
				>
					{ordered.map((s, i) => {
						const done =
							data.status === "approved" ||
							(data.status === "pending" && i < stepIndex);
						const current = data.status === "pending" && i === stepIndex;
						return (
							<li key={s.order} className="flex items-center gap-1.5">
								<span
									className={cn(
										"flex size-5 items-center justify-center rounded-full border text-[0.6rem]",
										done && "border-success bg-success/15 text-success",
										current && "border-warning bg-warning/15 font-medium",
									)}
									aria-current={current ? "step" : undefined}
								>
									{done ? <Check className="size-3" aria-hidden /> : i + 1}
								</span>
								<span
									className={cn(
										current ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{ruleLabel(s.approverRule)}
								</span>
								{i < ordered.length - 1 && (
									<span className="text-muted-foreground" aria-hidden>
										→
									</span>
								)}
							</li>
						);
					})}
				</ol>
			)}
			{data.status === "pending" && stepDef && (
				<p className="text-muted-foreground text-xs">
					{t("stepOf", { n: stepIndex + 1, total: ordered.length })} ·{" "}
					{waitingFor.length > 0
						? t("waitingFor", { names: waitingFor.join(", ") })
						: t("waitingForRule", { rule: ruleLabel(stepDef.approverRule) })}
				</p>
			)}
			{data.decisions.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-muted-foreground text-xs">
					{data.decisions.map((d) => (
						<li key={`${d.step}-${d.decidedAt.toISOString()}`}>
							{t("step", { n: d.step })} ·{" "}
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
