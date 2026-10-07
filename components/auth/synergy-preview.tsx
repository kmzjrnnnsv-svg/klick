"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { previewSynergy, type SynergyPreview } from "@/app/actions/synergy";
import { Skeleton } from "@/components/ui/skeleton";
import type { CaspService, LicenceStage } from "@/db/schema/enums";

// Live-Vorschau im Onboarding (Schritt 2) und in den Einstellungen:
// „ISO 27001 + DORA + NIS2 = 158 Anforderungen → 112 Controls; 61 Controls
// erfüllen ≥ 2 Rahmenwerke; Überlappung 71 %; Aufwand 38 S / 52 M / 22 L".
export function SynergyPreviewPanel({
	frameworks,
	sector,
	licenceStage,
	caspServices,
	current,
	names,
}: {
	frameworks: string[];
	sector: string;
	licenceStage: LicenceStage;
	caspServices: CaspService[];
	// Bereits aktive Rahmenwerke → Was-wäre-wenn für die neuen
	current?: string[];
	names?: Record<string, string>;
}) {
	const t = useTranslations("Onboarding");
	const [data, setData] = useState<SynergyPreview | null>(null);
	const [loading, setLoading] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Alle Eingaben in einem Schlüssel: der Effekt hängt nur davon ab und
	// liest die Werte daraus — keine veralteten Closures, keine Array-Identitäten.
	const key = JSON.stringify({
		frameworks,
		sector,
		licenceStage,
		caspServices,
		current: current ?? null,
	});

	useEffect(() => {
		const input = JSON.parse(key) as {
			frameworks: string[];
			sector: string;
			licenceStage: LicenceStage;
			caspServices: CaspService[];
			current: string[] | null;
		};
		if (input.frameworks.length === 0) {
			setData(null);
			return;
		}
		if (timer.current) clearTimeout(timer.current);
		setLoading(true);
		timer.current = setTimeout(async () => {
			const res = await previewSynergy({
				frameworks: input.frameworks,
				sector: input.sector,
				licenceStage: input.licenceStage,
				caspServices: input.caspServices,
				current: input.current ?? undefined,
			});
			setLoading(false);
			setData(res.ok ? res.data : null);
		}, 250);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [key]);

	const label = (slug: string) => names?.[slug] ?? slug;

	return (
		<div className="rounded-md border border-dashed p-4 text-sm">
			<p className="lv-eyebrow text-[0.58rem] text-muted-foreground">
				{t("synergyPreview")}
			</p>
			{frameworks.length === 0 ? (
				<p className="mt-1 text-muted-foreground">{t("synergyNone")}</p>
			) : loading && !data ? (
				<div className="mt-2 flex flex-col gap-2">
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			) : data ? (
				<div className="mt-2 flex flex-col gap-2">
					<p>
						<span className="font-medium">
							{frameworks.map(label).join(" + ")}
						</span>{" "}
						= {t("synergyRequirements", { n: data.synergy.requirementCount })} →{" "}
						<span className="font-medium">
							{t("synergyControls", { n: data.synergy.controlCount })}
						</span>
					</p>
					{data.synergy.overlapPct !== null && (
						<p className="text-muted-foreground">
							{t("synergyShared", {
								n: data.synergy.multiFrameworkControls,
								pct: data.synergy.overlapPct,
							})}
						</p>
					)}
					<p className="text-muted-foreground">
						{t("synergyEffort", {
							s: data.synergy.effortBuckets.S,
							m: data.synergy.effortBuckets.M,
							l: data.synergy.effortBuckets.L,
						})}
					</p>
					{data.synergy.requirementCount === 0 && (
						<p className="text-muted-foreground text-xs">
							{t("synergyNoIndex")}
						</p>
					)}
					{data.whatIf.length > 0 && (
						<ul className="mt-1 flex flex-col gap-1 border-t pt-2 text-muted-foreground">
							{data.whatIf.map((w) => (
								<li key={w.candidate}>
									<span className="font-medium text-foreground">
										{label(w.candidate)}
									</span>
									:{" "}
									{t("synergyWhatIf", {
										newControls: w.newControls.length,
										shared: w.alreadyNeededControls,
										pct: w.alreadyCoveredPct ?? 0,
									})}
								</li>
							))}
						</ul>
					)}
				</div>
			) : (
				<p className="mt-1 text-muted-foreground">{t("synergyError")}</p>
			)}
		</div>
	);
}
