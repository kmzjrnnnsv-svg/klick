"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { decideAppointments } from "@/app/actions/approvals";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Posteingang: alle wartenden Bestellungen auf einmal freigeben — ein
// Step-up, ein gemeinsamer Beschluss (die GWB bekommt ihren eigenen)
export function BulkAppointmentsButton({
	requestIds,
}: {
	requestIds: string[];
}) {
	const ta = useTranslations("Appointments");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await withStepUp(() =>
						decideAppointments({ requestIds }),
					);
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(ta("approveAllDone", { n: res.data.decided }));
					router.refresh();
				})
			}
		>
			{pending ? tc("working") : ta("approveAll", { n: requestIds.length })}
		</Button>
	);
}
