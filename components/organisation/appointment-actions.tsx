"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
	confirmRoleMatrix,
	deleteRoleAssignment,
} from "@/app/actions/organisation";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import type { AppointmentStatus } from "@/db/schema/enums";

// Abberufen (bestellt, Antrag an die GL), Zurückziehen (Vorschlag) oder
// Entfernen (abgelehnt). Während einer Abberufung gibt es nichts zu tun.
export function RevokeAssignmentButton({
	id,
	status,
	name,
}: {
	id: string;
	status: AppointmentStatus;
	name: string;
}) {
	const ta = useTranslations("Appointments");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const appointed = status === "appointed";
	const confirm = useConfirm({
		title: appointed ? ta("revokeConfirm", { name }) : `${ta("withdraw")}?`,
		description: appointed ? ta("revokeConfirmLead") : undefined,
		confirmLabel: appointed ? ta("revoke") : ta("withdraw"),
	});
	if (status === "revocation_requested" || status === "revoked") return null;
	const run = () =>
		start(async () => {
			const res = await withStepUp(() => deleteRoleAssignment({ id }));
			if (!res.ok)
				return void toast.error(
					res.error === "noManagement"
						? ta("noManagement")
						: errorText(tc, res),
				);
			toast.success(
				appointed
					? ta("revocationRequested")
					: status === "rejected"
						? ta("removed")
						: ta("withdrawn"),
			);
			router.refresh();
		});
	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				disabled={pending}
				onClick={() => confirm.ask(run)}
			>
				{appointed
					? ta("revoke")
					: status === "rejected"
						? tc("delete")
						: ta("withdraw")}
			</Button>
			{confirm.node}
		</>
	);
}

// Sammelbeschluss „Besetzung bestätigen“ anstoßen
export function ConfirmMatrixButton() {
	const ta = useTranslations("Appointments");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			variant="secondary"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await withStepUp(() => confirmRoleMatrix());
					if (!res.ok)
						return void toast.error(
							res.error === "empty"
								? ta("confirmMatrixEmpty")
								: errorText(tc, res),
						);
					toast.success(
						res.data.approval === "pending"
							? ta("confirmMatrixPending", { number: res.data.number })
							: ta("confirmMatrixDone", { number: res.data.number }),
					);
					router.refresh();
				})
			}
		>
			{pending ? tc("working") : ta("confirmMatrix")}
		</Button>
	);
}
