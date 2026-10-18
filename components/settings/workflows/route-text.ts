"use client";

import { useTranslations } from "next-intl";
import type { ApprovalCondition, ApprovalStep } from "@/db/schema/grc";
import {
	type RuleNames,
	ruleLabel,
	stepApproversText,
} from "@/lib/approvals/designer";
import type { FactInfo } from "@/lib/approvals/designer-labels";

// Ablauf als Text: „Finanzen (entfällt, wenn …) → Recht und
// Informationssicherheit (alle stimmen zu)“
export function useRouteText(names: RuleNames, facts: readonly FactInfo[]) {
	const t = useTranslations("Workflows");
	const words = { and: t("and"), or: t("or") };
	const optionLabel = (f: FactInfo | undefined, v: unknown) =>
		f?.options.find((o) => o.value === v)?.label ?? String(v ?? "");

	function condition(c: ApprovalCondition): string {
		const f = facts.find((x) => x.key === c.field);
		const label = f?.label ?? c.field;
		switch (c.op) {
			case "is_true":
				return `${label}: ${t("yes")}`;
			case "is_false":
				return `${label}: ${t("no")}`;
			case "in":
				return `${label} ${t("op_in")} ${(Array.isArray(c.value) ? c.value : [])
					.map((v) => optionLabel(f, v))
					.join(", ")}`;
			default:
				return `${label} ${t(`op_${c.op}`)} ${optionLabel(f, c.value)}`;
		}
	}

	const conditions = (cs: readonly ApprovalCondition[]) =>
		cs.map(condition).join(` ${t("and")} `);

	const approvers = (s: ApprovalStep) =>
		stepApproversText(s, names, words) || t("unknownStelle");

	function extras(s: ApprovalStep): string[] {
		const out: string[] = [];
		if (s.mode === "all" && (s.approvers?.length ?? 0) > 1)
			out.push(t("previewAll"));
		if (s.minApprovers && s.minApprovers > 1)
			out.push(t("previewMin", { n: s.minApprovers }));
		if (s.skipIf?.length)
			out.push(
				t("previewSkip", {
					list: s.skipIf.map((r) => ruleLabel(r, names)).join(` ${t("or")} `),
				}),
			);
		if (s.onlyIf?.length)
			out.push(t("previewOnly", { conditions: conditions(s.onlyIf) }));
		if (s.slaDays) out.push(t("previewSla", { n: s.slaDays }));
		return out;
	}

	return { condition, conditions, approvers, extras };
}
