"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { acknowledgeDocument } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";

export function AckButton({
	documentId,
	label,
}: {
	documentId: string;
	label?: string;
}) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await acknowledgeDocument({ documentId });
					if (!res.ok) toast.error(tc("error"));
					else {
						toast.success(t("acknowledged"));
						router.refresh();
					}
				})
			}
		>
			<Check />
			{label ?? t("acknowledge")}
		</Button>
	);
}
