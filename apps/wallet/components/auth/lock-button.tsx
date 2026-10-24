"use client";

import { lock } from "@wallet/app/actions/auth";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function LockButton() {
	const t = useTranslations("Unlock");
	const router = useRouter();
	return (
		<Button
			variant="outline"
			size="sm"
			onClick={async () => {
				await lock();
				router.refresh();
			}}
		>
			<Lock aria-hidden /> {t("lock")}
		</Button>
	);
}
