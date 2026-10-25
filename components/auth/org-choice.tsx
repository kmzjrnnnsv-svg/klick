"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { switchOrganization } from "@/app/actions/memberships";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";

// Auswahl auf /organisationen: Wechsel über die Action (Step-up verfällt,
// Audit), abgelaufene Zugänge sind nicht wählbar.
export function SwitchOrgButton({
	orgId,
	label,
	disabled,
}: {
	orgId: string;
	label: string;
	disabled?: boolean;
}) {
	const tc = useTranslations("Common");
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="sm"
			disabled={disabled || pending}
			onClick={() =>
				start(async () => {
					const res = await switchOrganization(orgId);
					if (res && !res.ok) toast.error(errorText(tc, res));
				})
			}
		>
			{pending ? "Wird geöffnet…" : label}
		</Button>
	);
}

export function SignOutButton({ label }: { label: string }) {
	const router = useRouter();
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			onClick={async () => {
				await authClient.signOut().catch(() => {});
				router.replace("/login");
				router.refresh();
			}}
		>
			{label}
		</Button>
	);
}
