"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/toast";

// Fehlertexte des Compliance-Exports (Codes aus link-service.ts)
const CODES = [
	"origin_not_allowed",
	"accounts_invalid",
	"token_invalid",
	"klick_unreachable",
	"klick_error",
	"already_linked",
	"not_found",
	"not_paused",
] as const;
type Code = (typeof CODES)[number];
const isCode = (e: unknown): e is Code => CODES.includes(e as Code);

export function useExportFeedback() {
	const t = useTranslations("Export");
	const tc = useTranslations("Common");
	return (
		res: { ok: boolean; error?: string; ref?: string },
		okText?: string,
	) => {
		if (res.ok) {
			if (okText) toast.success(okText);
			return true;
		}
		if (res.error === "step_up_required") return false;
		toast.error(
			isCode(res.error)
				? t(`error_${res.error}`)
				: res.error === "invalid"
					? tc("invalid")
					: res.ref
						? tc("errorRef", { ref: res.ref })
						: tc("error"),
		);
		return false;
	};
}
