"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { setWorkflowEnabled } from "@/app/actions/approvals";
import { setSelfApproval } from "@/app/actions/settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { ApprovalStep } from "@/db/schema/grc";
import type { StepReadiness } from "@/lib/approvals/rules";

type Readiness = StepReadiness & { approverNames: string[] };

// Freigabe-Workflows in Klartext: je Stufe, wer entscheidet („Compliance —
// Ben“), eine Ampel „startklar / fehlt: …“ und der Solo-Modus an einer Stelle.
export function WorkflowsPanel({
	workflows,
	canEdit,
	solo,
}: {
	workflows: {
		kind: string;
		name: string;
		description: string;
		steps: ApprovalStep[];
		enabled: boolean;
		readiness: Readiness[];
	}[];
	canEdit: boolean;
	solo: { allowed: boolean; effective: boolean };
}) {
	const t = useTranslations("Settings");
	const ta = useTranslations("Approvals");
	const tf = useTranslations("Functions");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();

	const ruleLabel = (rule: string) => {
		const [kind, value = ""] = rule.split(":");
		switch (kind) {
			case "function":
				return tf(value as "compliance");
			case "role":
				return t("ruleRole", { role: value });
			case "owner_of_entity":
				return ta("ruleOwner");
			case "not_requester":
				return ta("ruleNotRequester");
			case "user":
				return ta("ruleUser");
			default:
				return rule;
		}
	};

	const save = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
		start(async () => {
			const res = await withStepUp(fn);
			if (!res.ok)
				toast.error(
					res.error === "step_up_required" ? t("stepUp") : tc("error"),
				);
			else {
				toast.success(t("workflowsSaved"));
				router.refresh();
			}
		});

	return (
		<div className="flex flex-col gap-4">
			<p className="text-muted-foreground text-sm">{t("workflowsLead")}</p>
			<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
				{workflows.map((w) => {
					const gaps = w.readiness.filter((r) => r.state === "empty");
					return (
						<li
							key={w.kind}
							className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-4"
						>
							<div className="min-w-0 flex-1">
								<p className="flex flex-wrap items-center gap-2 font-medium">
									{w.name}
									{w.enabled &&
										(gaps.length === 0 ? (
											<Badge variant="success" className="gap-1">
												<CheckCircle2 className="size-3" />
												{t("workflowReady")}
											</Badge>
										) : (
											<Badge variant="warning" className="gap-1">
												<CircleAlert className="size-3" />
												{t("workflowGap", {
													list: gaps.map((g) => ruleLabel(g.rule)).join(", "),
												})}
											</Badge>
										))}
								</p>
								<p className="text-muted-foreground text-xs">{w.description}</p>
								<ol className="mt-2 flex flex-col gap-1 text-xs">
									{w.readiness.map((r) => {
										const step = w.steps.find((s) => s.order === r.order);
										return (
											<li key={r.order} className="flex flex-wrap gap-x-1.5">
												<span className="text-muted-foreground">
													{t("stepN", { n: r.order })}
												</span>
												<span className="font-medium">{ruleLabel(r.rule)}</span>
												<span className="text-muted-foreground">
													{r.state === "dynamic"
														? `— ${t("stepDynamic")}`
														: r.state === "empty"
															? `— ${t("stepNobody")}`
															: `— ${r.approverNames.slice(0, 3).join(", ")}${r.approverNames.length > 3 ? " …" : ""}`}
												</span>
												{step?.slaDays ? (
													<span className="text-muted-foreground">
														· {t("stepSla", { days: step.slaDays })}
													</span>
												) : null}
												{r.state === "empty" && w.enabled && (
													<Link
														href="/organisation?tab=rollen"
														className="text-primary hover:underline"
													>
														{t("fillNow")}
													</Link>
												)}
											</li>
										);
									})}
								</ol>
							</div>
							<Switch
								checked={w.enabled}
								disabled={!canEdit || pending}
								aria-label={`${w.name} ${t("workflowEnabled")}`}
								onCheckedChange={(v) =>
									save(() => setWorkflowEnabled({ kind: w.kind, enabled: v }))
								}
							/>
						</li>
					);
				})}
			</ul>
			<div className="flex items-start justify-between gap-3 rounded-md border p-3">
				<div>
					<p className="font-medium text-sm">{ta("selfApproved")}</p>
					<p className="text-muted-foreground text-xs">{ta("soloHint")}</p>
					<p className="mt-1 text-xs">
						{solo.effective ? t("soloActive") : t("soloInactive")}
					</p>
				</div>
				<Switch
					checked={solo.allowed}
					disabled={!canEdit || pending}
					aria-label={ta("selfApproved")}
					onCheckedChange={(v) => save(() => setSelfApproval({ enabled: v }))}
				/>
			</div>
		</div>
	);
}
