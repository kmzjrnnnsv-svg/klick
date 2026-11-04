"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { startPolicyBuilder } from "@/app/actions/document-builder";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Eigene Datei, damit der Knopf am Entwurf den ganzen Baukasten
// (policy-builder.tsx) nicht in jede Dokumentseite zieht.

/** Aufruf am Entwurf: Baukasten starten (ersetzt den Text nach Rückfrage) */
export function StartPolicyBuilder({
	documentId,
	replacesText,
	resume,
}: {
	documentId: string;
	// der Text weicht vom Gerüst der Vorlage ab: Rückfrage
	replacesText: boolean;
	// zurück aus „Eigener Text“
	resume: boolean;
}) {
	const t = useTranslations("PolicyBuilder");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: resume ? t("resumeTitle") : t("startTitle"),
		description: resume ? t("resumeLead") : t("startLead"),
		confirmLabel: resume ? t("resume") : t("start"),
	});
	const run = () =>
		start(async () => {
			const res = await startPolicyBuilder({ documentId });
			if (!res.ok) toast.error(errorText(tc, res));
			else router.refresh();
		});
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/10 px-4 py-3">
			{confirm.node}
			<p className="min-w-0 flex-1 text-subhead">
				{resume ? t("resumeHint") : t("startHint")}
			</p>
			<Button
				type="button"
				size="sm"
				disabled={pending}
				onClick={() => (replacesText || resume ? confirm.ask(run) : run())}
			>
				{resume ? t("resume") : t("start")}
			</Button>
		</div>
	);
}
