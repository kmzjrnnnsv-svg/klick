"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { setWorkflowEnabled } from "@/app/actions/approvals";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { ApprovalStep } from "@/db/schema/grc";

export function WorkflowsPanel({
	workflows,
	canEdit,
}: {
	workflows: {
		kind: string;
		name: string;
		description: string;
		steps: ApprovalStep[];
		enabled: boolean;
	}[];
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<div className="flex flex-col gap-3">
			<p className="text-muted-foreground text-sm">{t("workflowsLead")}</p>
			<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
				{workflows.map((w) => (
					<li
						key={w.kind}
						className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:gap-4"
					>
						<div className="min-w-0 flex-1">
							<p className="font-medium">
								{w.name}{" "}
								<span className="font-mono text-muted-foreground text-xs">
									{w.kind}
								</span>
							</p>
							<p className="text-muted-foreground text-xs">{w.description}</p>
							<p className="mt-1 flex flex-wrap gap-1">
								{w.steps.map((s) => (
									<Badge
										key={s.order}
										variant="outline"
										className="normal-case tracking-normal"
									>
										{s.order}. {s.approverRule}
										{s.slaDays ? ` · ${s.slaDays} d` : ""}
									</Badge>
								))}
							</p>
						</div>
						<Switch
							checked={w.enabled}
							disabled={!canEdit || pending}
							aria-label={`${w.name} ${t("workflowEnabled")}`}
							onCheckedChange={(v) =>
								start(async () => {
									const res = await withStepUp(() =>
										setWorkflowEnabled({
											kind: w.kind,
											enabled: v,
										}),
									);
									if (!res.ok)
										toast.error(
											res.error === "step_up_required"
												? t("stepUp")
												: tc("error"),
										);
									else {
										toast.success(t("workflowsSaved"));
										router.refresh();
									}
								})
							}
						/>
					</li>
				))}
			</ul>
		</div>
	);
}
