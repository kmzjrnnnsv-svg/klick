"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { acknowledgeDocument } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

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
					if (!res.ok) toast.error(errorText(tc, res));
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
