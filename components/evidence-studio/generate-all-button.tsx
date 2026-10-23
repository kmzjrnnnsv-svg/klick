"use client";

import { FileStack } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { generateFrameworkEvidence } from "@/app/actions/evidence-studio";
import { Button } from "@/components/ui/button";

// Alle fälligen Nachweise eines Rahmenwerks in einem Schritt erzeugen
export function GenerateAllButton({
	framework,
	due,
}: {
	framework: string;
	due: number;
}) {
	const t = useTranslations("EvidenceStudio");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="sm"
			disabled={pending || due === 0}
			className="gap-1.5"
			onClick={() =>
				start(async () => {
					const res = await generateFrameworkEvidence({ framework });
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						t("generatedAll", {
							created: res.data.created,
							unchanged: res.data.unchanged,
						}),
					);
					router.refresh();
				})
			}
		>
			<FileStack className="size-4" aria-hidden="true" />
			{pending ? t("generating") : t("generateAll", { count: due })}
		</Button>
	);
}
