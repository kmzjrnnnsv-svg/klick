"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { createBcmExercise } from "@/app/actions/bcm";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Übung anlegen und gleich öffnen: Drehbuch kommt aus dem Notfallplan, Art
// und Termin legst du auf der Übungsseite fest
export function CreateExerciseButton({
	processId,
	siteId,
	size = "sm",
	variant = "outline",
}: {
	processId?: string;
	siteId?: string;
	size?: "sm" | "default";
	variant?: "outline" | "default" | "ghost";
}) {
	const t = useTranslations("Bcm");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size={size}
			variant={variant}
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await createBcmExercise({
						processId: processId ?? null,
						siteId: siteId ?? null,
						kind: "tabletop",
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
					router.push(`/testprogramm/uebungen/${res.data.id}`);
				})
			}
		>
			<Plus />
			{t("exCreate")}
		</Button>
	);
}
