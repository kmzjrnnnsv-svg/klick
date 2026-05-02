"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { removeAgent } from "@/app/actions/agency";

export function RemoveAgentButton({ id }: { id: string }) {
	const t = useTranslations("Agency");
	const [isPending, startTransition] = useTransition();

	return (
		<button
			type="button"
			disabled={isPending}
			onClick={() => {
				if (!confirm(t("confirmRemove"))) return;
				startTransition(async () => {
					await removeAgent(id);
				});
			}}
			className="text-muted-foreground hover:text-rose-700 disabled:opacity-50"
			aria-label={t("remove")}
		>
			<Trash2 className="h-4 w-4" strokeWidth={1.5} />
		</button>
	);
}
