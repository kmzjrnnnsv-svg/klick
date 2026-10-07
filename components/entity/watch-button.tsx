"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toggleWatch } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import type { EntityKind } from "@/db/schema/enums";

export function WatchButton({
	entityType,
	entityId,
	watching,
}: {
	entityType: EntityKind;
	entityId: string;
	watching: boolean;
}) {
	const t = useTranslations("Entity");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="ghost"
			disabled={pending}
			aria-pressed={watching}
			onClick={() =>
				start(async () => {
					await toggleWatch({ entityType, entityId });
					router.refresh();
				})
			}
			className="normal-case tracking-normal"
		>
			{watching ? <BellOff /> : <Bell />}
			{watching ? t("unwatch") : t("watch")}
		</Button>
	);
}
