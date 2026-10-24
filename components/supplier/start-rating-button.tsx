"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { startProviderRating } from "@/app/actions/provider-ratings";
import { Button } from "@/components/ui/button";

// Startet die interne Bewertung (oder öffnet den offenen Entwurf).
export function StartRatingButton({
	providerId,
	draftId,
}: {
	providerId: string;
	draftId?: string | null;
}) {
	const t = useTranslations("Rating");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="sm"
			variant={draftId ? "outline" : "default"}
			disabled={pending}
			onClick={() =>
				start(async () => {
					if (draftId) {
						router.push(`/dienstleister/${providerId}/bewertung/${draftId}`);
						return;
					}
					const res = await startProviderRating({ providerId });
					if (!res.ok) return void toast.error(t("saveFailed"));
					router.push(`/dienstleister/${providerId}/bewertung/${res.data.id}`);
				})
			}
		>
			{draftId ? t("continueDraft") : t("start")}
		</Button>
	);
}
