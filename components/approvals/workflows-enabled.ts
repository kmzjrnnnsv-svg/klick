import { useTranslations } from "next-intl";
import type { WorkflowEnabledByDuty } from "@/lib/compliance/catalog/approval-duties";

// Hinweis im Toast, wenn ein Rahmenwerk Freigabe-Abläufe eingeschaltet hat
export function useWorkflowsEnabledText() {
	const t = useTranslations("Workflows");
	return (
		list: readonly Pick<WorkflowEnabledByDuty, "name" | "basis">[] | undefined,
	): string | undefined =>
		list && list.length > 0
			? t("enabledByFramework", {
					list: list
						.map((w) =>
							w.basis.length > 0 ? `${w.name} (${w.basis.join(", ")})` : w.name,
						)
						.join("; "),
				})
			: undefined;
}
