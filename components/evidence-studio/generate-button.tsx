"use client";

import { FileOutput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { generateEvidence } from "@/app/actions/evidence-studio";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// „In Klick erzeugen“: Nachweis aus den Registern als PDF mit Schnappschuss
export function GenerateButton({
	kindCode,
	entityId,
	label,
}: {
	kindCode: string;
	entityId?: string;
	label: string;
}) {
	const t = useTranslations("EvidenceStudio");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			className="h-(--control-h-sm) gap-1.5 px-2.5 text-footnote"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await generateEvidence({ kindCode, entityId });
					if (!res.ok)
						return void toast.error(
							res.error === "not_found" ? t("noData") : errorText(tc, res),
						);
					toast.success(res.data.reused ? t("generateReused") : t("generated"));
					router.refresh();
				})
			}
		>
			<FileOutput className="size-3.5" aria-hidden="true" />
			{pending ? t("generating") : label}
		</Button>
	);
}
