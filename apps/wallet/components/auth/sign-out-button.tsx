"use client";

import { authClient } from "@wallet/lib/auth/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
	const t = useTranslations("Auth");
	const router = useRouter();
	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={async () => {
				await authClient.signOut().catch(() => {});
				router.replace("/login");
				router.refresh();
			}}
		>
			{t("signOut")}
		</Button>
	);
}
