"use client";

import { FileOutput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { generateEvidence } from "@/app/actions/evidence-studio";
import { Button } from "@/components/ui/button";

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
							res.error === "not_found" ? t("noData") : tc("error"),
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
