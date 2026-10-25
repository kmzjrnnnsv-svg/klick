"use client";

import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	createEvidenceDraft,
	deleteEvidenceDraft,
	newEvidenceVersion,
} from "@/app/actions/evidence-authoring";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

// Rohling wählen → Entwurf anlegen → Editor. Bei Listen zuerst die Vorlage.
export function StartDraft({
	template,
	templateTitle,
	presets,
	initialPreset,
	controlCode,
	sheetItem,
	title,
	primary,
}: {
	template: string;
	templateTitle: string;
	presets?: { key: string; title: string }[];
	initialPreset?: string | null;
	controlCode?: string;
	sheetItem?: string;
	title?: string;
	primary?: boolean;
}) {
	const t = useTranslations("Authoring");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [preset, setPreset] = useState<string>(initialPreset ?? "__free");
	return (
		<div className="flex flex-wrap items-center gap-2">
			{presets && presets.length > 0 && (
				<Select value={preset} onValueChange={setPreset}>
					<SelectTrigger
						className="w-full sm:w-64"
						aria-label={t("presetFor", { template: templateTitle })}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__free">{t("presetFree")}</SelectItem>
						{presets.map((p) => (
							<SelectItem key={p.key} value={p.key}>
								{p.title}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			<Button
				type="button"
				size="sm"
				variant={primary ? "default" : "outline"}
				disabled={pending}
				aria-label={t("startFor", { template: templateTitle })}
				onClick={() =>
					start(async () => {
						const res = await createEvidenceDraft({
							template,
							preset: preset === "__free" ? null : preset,
							title,
							controlCode,
							sheetItem,
						});
						if (!res.ok) return void toast.error(errorText(tc, res));
						router.push(`/nachweise/verfassen/${res.data.id}`);
					})
				}
			>
				<PenLine aria-hidden="true" />
				{pending ? t("starting") : t("start")}
			</Button>
		</div>
	);
}

export function DeleteDraftButton({
	id,
	title,
}: {
	id: string;
	title: string;
}) {
	const t = useTranslations("Authoring");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="text-destructive"
			disabled={pending}
			aria-label={t("deleteDraftNamed", { title })}
			onClick={() => {
				if (!window.confirm(t("deleteDraftLead"))) return;
				start(async () => {
					const res = await deleteEvidenceDraft({ id });
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("draftDeleted"));
					router.refresh();
				});
			}}
		>
			{t("deleteDraft")}
		</Button>
	);
}

// Verfassten Nachweis als neue Fassung bearbeiten (Inhalt wird übernommen)
export function NewVersionButton({ evidenceId }: { evidenceId: string }) {
	const t = useTranslations("Authoring");
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
					const res = await newEvidenceVersion({ evidenceId });
					if (!res.ok) return void toast.error(errorText(tc, res));
					router.push(`/nachweise/verfassen/${res.data.id}`);
				})
			}
		>
			<PenLine aria-hidden="true" />
			{pending ? t("starting") : t("newVersion")}
		</Button>
	);
}
