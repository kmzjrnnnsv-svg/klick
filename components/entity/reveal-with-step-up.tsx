"use client";

import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { ensureEvidenceStepUp } from "@/app/actions/evidence";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Vertraulichen Inhalt erst nach frischer Bestätigung zeigen (wie beim
// Download): Step-up im Dialog, dann lädt die Seite neu und rendert ihn.
export function RevealWithStepUp() {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="secondary"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await withStepUp(() => ensureEvidenceStepUp());
					if (!res.ok) {
						if (res.error !== "step_up_required")
							toast.error(errorText(tc, res));
						return;
					}
					router.refresh();
				})
			}
		>
			<Eye aria-hidden="true" />
			{t("revealContent")}
		</Button>
	);
}
