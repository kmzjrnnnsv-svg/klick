"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/toast";

// Fehlertexte aus Action-Ergebnissen (safeAction) — nie rohe Meldungen
export function useActionFeedback() {
	const tc = useTranslations("Common");
	const tm = useTranslations("Members");
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
			res.error === "last_owner"
				? tm("lastOwner")
				: res.ref
					? tc("errorRef", { ref: res.ref })
					: tc("error"),
		);
		return false;
	};
}
