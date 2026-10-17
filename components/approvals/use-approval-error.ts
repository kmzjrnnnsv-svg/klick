"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

// Freigabe-Fehler als Satz mit Lösung: „Für diese Freigabe fehlt die
// Compliance-Funktion (Stufe 2)“ + Knopf „Jetzt besetzen“ — statt eines
// allgemeinen Hinweises, der nicht sagt, was genau fehlt.
type Failure = {
	error: string;
	detail?: Record<string, string>;
};

export function useApprovalErrorToast(): (res: Failure) => boolean {
	const t = useTranslations("Status");
	const tf = useTranslations("Functions");
	const tt = useTranslations("Team");
	const router = useRouter();

	function ruleLabel(rule: string): string {
		const [kind, value = ""] = rule.split(":");
		if (kind === "function" && tf.has(value as "compliance"))
			return tf(value as "compliance");
		if (kind === "role") {
			const key = `role${value.charAt(0).toUpperCase()}${value.slice(1)}`;
			if (tt.has(key as "roleOwner")) return tt(key as "roleOwner");
		}
		if (kind === "owner_of_entity") return t("approverOwner");
		return rule;
	}

	return (res) => {
		if (res.error === "no_approver") {
			const rule = res.detail?.rule;
			toast.error(
				rule
					? t("approvalMissing", {
							who: ruleLabel(rule),
							step: res.detail?.step ?? "1",
						})
					: t("approvalError_no_approver"),
				{
					duration: 10_000,
					action: {
						label: t("approvalMissingAction"),
						onClick: () => router.push("/organisation?tab=rollen"),
					},
				},
			);
			return true;
		}
		if (res.error === "solo_not_allowed" || res.error === "workflow_disabled") {
			toast.error(
				t(`approvalError_${res.error}` as "approvalError_no_approver"),
			);
			return true;
		}
		return false;
	};
}
