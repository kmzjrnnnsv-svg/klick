"use client";

import { ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { extendAssessment } from "@/app/actions/assessments";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Kurz-Check auf alle Fragen erweitern: beantwortete Fragen bleiben
export function ExtendButton({
	assessmentId,
	missing,
}: {
	assessmentId: string;
	missing: number;
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await extendAssessment({ assessmentId });
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("extended", { n: res.data.added }));
					router.refresh();
				})
			}
		>
			<ListPlus aria-hidden="true" />
			{pending ? t("extending") : t("extend", { n: missing })}
		</Button>
	);
}
