import { Check, ChevronRight, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ApprovalStep } from "@/db/schema/grc";
import {
	type RuleNames,
	ruleLabel,
	stepApproversText,
} from "@/lib/approvals/designer";
import { ruleStates } from "@/lib/approvals/rules";

type Decision = {
	step: number;
	decision: string;
	rule?: string | null;
};

// Ablauf eines Antrags: Stufen mit Freigebenden, entfallene Stufen mit Grund,
// im Modus „alle“ der Stand je Stelle („Recht ✓ · Informationssicherheit offen“).
export async function RouteProgress({
	steps,
	currentStep,
	status,
	decisions,
	names,
}: {
	steps: readonly ApprovalStep[];
	currentStep: number;
	status: string;
	decisions: readonly Decision[];
	names: RuleNames;
}) {
	const t = await getTranslations("Approvals");
	const tw = await getTranslations("Workflows");
	const words = { and: tw("and"), or: tw("or") };
	const onStep = (order: number) =>
		decisions
			.filter((d) => d.step === order)
			.map((d) => ({
				decision: d.decision as "approved" | "rejected" | "changes_requested",
				rule: d.rule ?? null,
			}));
	return (
		<ol
			aria-label={t("route")}
			className="flex flex-wrap items-center gap-x-1 gap-y-1 text-footnote"
		>
			{[...steps]
				.sort((a, b) => a.order - b.order)
				.map((s, i) => {
					// „alle Personen“: Stellen vor der Auflösung als Titel
					const title =
						s.label ||
						(s.expandedFrom?.length
							? t("stepEveryone", {
									stelle: stepApproversText(
										{
											approverRule: s.expandedFrom[0] ?? "",
											approvers: s.expandedFrom,
											mode: "any",
										},
										names,
										words,
									),
								})
							: stepApproversText(s, names, words));
					const pending = status === "pending";
					const current = pending && s.order === currentStep;
					const rejected =
						status === "rejected" &&
						s.order === currentStep &&
						onStep(s.order).some((d) => d.decision === "rejected");
					const done =
						!s.skipped &&
						!rejected &&
						(status === "approved" || s.order < currentStep);
					const states = current ? ruleStates(s, onStep(s.order)) : [];
					return (
						<li key={s.order} className="flex items-center gap-1">
							{i > 0 && (
								<ChevronRight
									aria-hidden
									className="size-3 shrink-0 text-muted-foreground"
								/>
							)}
							<span
								className={
									s.skipped
										? "text-muted-foreground line-through decoration-muted-foreground/50"
										: current
											? "rounded bg-warning/15 px-1 font-medium"
											: done
												? "text-foreground"
												: "text-muted-foreground"
								}
							>
								{done && (
									<Check
										aria-hidden
										className="mr-0.5 inline size-3 text-success"
									/>
								)}
								{rejected && (
									<X
										aria-hidden
										className="mr-0.5 inline size-3 text-destructive"
									/>
								)}
								{s.order}. {title}
								{!s.skipped && (
									<span className="sr-only">
										{" "}
										(
										{done
											? t("stepDone")
											: rejected
												? t("stepRejected")
												: current
													? t("stepCurrent")
													: t("stepLater")}
										)
									</span>
								)}
							</span>
							{s.skipped && (
								<span className="text-muted-foreground">
									(
									{s.skipped.by === "requester"
										? s.given?.length
											? t("stepGivenOnly", {
													names: s.given
														.map((u) => ruleLabel(`user:${u}`, names))
														.join(", "),
												})
											: t("stepSkippedRequester", {
													name: ruleLabel(s.skipped.rule, names),
												})
										: s.skipped.by === "vacant"
											? t("stepSkippedVacant")
											: t("stepSkippedCondition")}
									)
								</span>
							)}
							{!s.skipped && s.given && s.given.length > 0 && (
								<span className="text-muted-foreground">
									(
									{t("stepGiven", {
										names: s.given
											.map((u) => ruleLabel(`user:${u}`, names))
											.join(", "),
									})}
									)
								</span>
							)}
							{states.length > 0 && (
								<span className="text-muted-foreground">
									(
									{states.map((r, j) => (
										<span key={r.rule}>
											{j > 0 ? " · " : ""}
											{ruleLabel(r.rule, names)}{" "}
											{r.done ? (
												<>
													<Check
														aria-hidden
														className="inline size-3 text-success"
													/>
													<span className="sr-only">{t("ruleDone")}</span>
												</>
											) : (
												t("ruleOpen")
											)}
										</span>
									))}
									)
								</span>
							)}
						</li>
					);
				})}
		</ol>
	);
}
