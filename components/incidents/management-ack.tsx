"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { acknowledgeIncident } from "@/app/actions/incidents";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// „Zur Kenntnis genommen“ für Mitglieder der Geschäftsleitung
// (Meldungen an die Aufsicht: informieren statt vorab freigeben)
export function ManagementAckButton({ incidentId }: { incidentId: string }) {
	const t = useTranslations("Incidents");
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
					const res = await acknowledgeIncident({ incidentId });
					if (!res.ok)
						return void toast.error(
							res.error === "not_management"
								? t("ackNotManagement")
								: errorText(tc, res),
						);
					toast.success(t("ackDone"));
					router.refresh();
				})
			}
		>
			{t("ack")}
		</Button>
	);
}
