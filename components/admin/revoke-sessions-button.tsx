"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { revokeUserSessions } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Admin > Nutzer:innen > [Person]: alle Sitzungen beenden, mit Rückfrage.
// Faktoren bleiben, die Person meldet sich neu an.
export function RevokeSessionsButton({
	userId,
	name,
	count,
}: {
	userId: string;
	name: string;
	count: number;
}) {
	const t = useTranslations("AdminUsers");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("revokeTitle", { name }),
		description: t("revokeDescription", { n: count }),
		confirmLabel: t("revoke"),
	});
	return (
		<>
			<Button
				variant="secondary"
				disabled={pending || count === 0}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await revokeUserSessions(userId);
							if (!res.ok) return void toast.error(errorText(tc, res));
							toast.success(t("revoked", { n: res.data.revoked }));
							router.refresh();
						}),
					)
				}
			>
				{pending ? t("revoking") : t("revoke")}
			</Button>
			{confirm.node}
		</>
	);
}
