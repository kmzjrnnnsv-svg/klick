"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startSetupGapAnalysis } from "@/app/actions/setup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// Schritt 7 (D5): Gap-Analyse über die gewählten Rahmenwerke anlegen,
// vorbelegt aus der Einrichtung, und direkt öffnen
export function GapStep({
	frameworks,
}: {
	frameworks: { slug: string; name: string }[];
}) {
	const t = useTranslations("Setup");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [selected, setSelected] = useState(frameworks.map((f) => f.slug));
	if (frameworks.length === 0)
		return (
			<p className="text-sm">
				{t("gapNoFrameworks")}{" "}
				<Link
					href="/einrichtung/rahmenwerke"
					className="text-primary underline"
				>
					{t("step_rahmenwerke")}
				</Link>
			</p>
		);
	return (
		<div className="flex flex-col gap-6">
			<fieldset className="flex flex-col gap-2 text-sm">
				<legend className="mb-1.5 font-medium">{t("gapFrameworks")}</legend>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{frameworks.map((f) => (
						<label key={f.slug} className="flex items-center gap-2">
							<Checkbox
								checked={selected.includes(f.slug)}
								onCheckedChange={(v) =>
									setSelected(
										v
											? [...selected, f.slug]
											: selected.filter((x) => x !== f.slug),
									)
								}
							/>
							{f.name}
						</label>
					))}
				</div>
			</fieldset>
			<p className="text-muted-foreground text-xs">{t("gapLater")}</p>
			<div className="flex justify-end">
				<Button
					disabled={pending || selected.length === 0}
					onClick={() =>
						start(async () => {
							const res = await startSetupGapAnalysis({ frameworks: selected });
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("gapStarted", { n: res.data.prefilled }));
							router.push(`/gap-analyse/${res.data.id}`);
						})
					}
				>
					{t("gapStart")}
				</Button>
			</div>
		</div>
	);
}
