"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setupGovernanceMode } from "@/app/actions/setup";
import { setGovernanceMode } from "@/app/actions/workflows";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Standard oder individuell (ADR-024): unter Einstellungen > Freigaben und
// gleich zu Beginn in der Einrichtung (Schritt „Rollen“). Wechsel mit
// Rückfrage; zurück zum Standard nennt die Folgen.
export function GovernanceModeControl({
	mode,
	canSwitch,
	variant = "settings",
}: {
	mode: "standard" | "individual";
	canSwitch: boolean;
	// Einrichtung: ohne Step-up, solange sie offen ist; Texte zu Rollen und Freigaben
	variant?: "settings" | "setup";
}) {
	const t = useTranslations("Workflows");
	const ts = useTranslations("Setup");
	const setup = variant === "setup";
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [target, setTarget] = useState<"standard" | "individual">(mode);
	const confirm = useConfirm({
		title:
			target === "individual" ? t("toIndividualTitle") : t("toStandardTitle"),
		description:
			target === "individual" ? t("toIndividualLead") : t("toStandardLead"),
		confirmLabel: target === "individual" ? t("toIndividual") : t("toStandard"),
		destructive: target === "standard",
	});
	const pick = (next: "standard" | "individual") => {
		if (next === mode || !canSwitch) return;
		setTarget(next);
		confirm.ask(() =>
			start(async () => {
				const res = await withStepUp(() =>
					(setup ? setupGovernanceMode : setGovernanceMode)({ mode: next }),
				);
				if (!res.ok)
					return void toast.error(
						res.error === "step_up_required" ? t("stepUp") : errorText(tc, res),
					);
				toast.success(
					next === "individual" ? t("nowIndividual") : t("nowStandard"),
				);
				router.refresh();
			}),
		);
	};
	return (
		<section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
			{confirm.node}
			<div>
				<h3 className="font-medium text-headline">
					{setup ? ts("modeTitle") : t("modeTitle")}
				</h3>
				<p className="text-muted-foreground text-subhead">
					{mode === "standard"
						? setup
							? ts("modeStandardLead")
							: t("modeStandardLead")
						: setup
							? ts("modeIndividualLead")
							: t("modeIndividualLead")}
				</p>
			</div>
			<fieldset
				aria-label={setup ? ts("modeTitle") : t("modeTitle")}
				className="grid grid-cols-2 gap-1 rounded-xl border-0 bg-muted p-1 sm:max-w-md"
			>
				{(["standard", "individual"] as const).map((m) => (
					<button
						key={m}
						type="button"
						aria-pressed={mode === m}
						disabled={pending || (!canSwitch && mode !== m)}
						onClick={() => pick(m)}
						className={`min-h-(--control-h) rounded-lg px-3 text-subhead transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
							mode === m
								? "bg-background font-medium shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{m === "standard" ? t("modeStandard") : t("modeIndividual")}
					</button>
				))}
			</fieldset>
			{!canSwitch && (
				<p className="text-muted-foreground text-footnote">
					{t("modeOwnerOnly")}
				</p>
			)}
		</section>
	);
}
