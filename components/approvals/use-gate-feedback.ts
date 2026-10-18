"use client";

import { useTranslations } from "next-intl";

// Rückmeldung, wenn eine Aktion eine Freigabe auslöst (Freigabe-Designer):
// wartet auf Freigabe bzw. niemand kann freigeben.
const GATE_ERRORS = new Set([
	"no_approver",
	"solo_reason_required",
	"solo_not_allowed",
]);

export function useGateFeedback() {
	const t = useTranslations("Approvals");
	return {
		errorText(code: string): string | null {
			return GATE_ERRORS.has(code)
				? t(`gateError_${code}` as "gateError_no_approver")
				: null;
		},
		pendingText: () => t("gatePending"),
	};
}
