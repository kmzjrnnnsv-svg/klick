"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";

// Ein Klick: offenen Punkt der Prüfungsreife als Aufgabe anlegen (Titel
// vorbefüllt, Priorität aus der Schwere). Feinplanung danach in der Aufgabe.
export function BlockerTaskButton({
	title,
	description,
	priority,
}: {
	title: string;
	description?: string;
	priority: "low" | "normal" | "high" | "critical";
}) {
	const t = useTranslations("Readiness");
	const tc = useTranslations("Common");
	const [done, setDone] = useState(false);
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			disabled={pending || done}
			onClick={() =>
				start(async () => {
					const res = await createTask({
						title: title.slice(0, 200),
						description,
						priority,
						sourceKind: "remediation",
					});
					if (!res.ok) {
						toast.error(tc("error"));
						return;
					}
					setDone(true);
					toast.success(t("taskCreated"));
				})
			}
		>
			{done ? t("taskCreated") : pending ? `${t("asTask")}…` : t("asTask")}
		</Button>
	);
}
