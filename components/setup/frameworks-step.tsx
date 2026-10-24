"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveSetupFrameworks } from "@/app/actions/setup";
import { SynergyPreviewPanel } from "@/components/auth/synergy-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CaspService, LicenceStage } from "@/db/schema/enums";
import type { FrameworkSuggestion } from "@/lib/compliance/company-profile";
import { useStepRunner } from "./step-footer";

// Schritt 6 (D4): Rahmenwerke aus dem Profil vorgeschlagen, mit Grund;
// abwählbar. Aktivieren legt Anwendbarkeit und Arbeitsvorrat an.
export function FrameworksStep({
	suggestions,
	all,
	active,
	profile,
	names,
	nextHref,
}: {
	suggestions: FrameworkSuggestion[];
	all: { slug: string; name: string; description: string }[];
	active: string[];
	profile: {
		sector: string;
		licenceStage: LicenceStage;
		caspServices: CaspService[];
	};
	names: Record<string, string>;
	nextHref: string;
}) {
	const t = useTranslations("Setup");
	const { pending, run } = useStepRunner(nextHref);
	const [selected, setSelected] = useState<string[]>(() => [
		...new Set([
			...active,
			...suggestions.filter((s) => s.recommended).map((s) => s.slug),
		]),
	]);
	const suggested = new Set(suggestions.map((s) => s.slug));
	const others = all.filter((f) => !suggested.has(f.slug));
	const toggle = (slug: string, on: boolean) =>
		setSelected(on ? [...selected, slug] : selected.filter((x) => x !== slug));
	const row = (slug: string, reason: string, recommended?: boolean) => {
		const isActive = active.includes(slug);
		return (
			<li key={slug}>
				<label className="flex items-start gap-3 rounded-2xl bg-card p-3 text-subhead">
					<Checkbox
						className="mt-0.5"
						checked={selected.includes(slug)}
						disabled={isActive}
						onCheckedChange={(v) => toggle(slug, Boolean(v))}
					/>
					<span className="min-w-0">
						<span className="font-medium">{names[slug] ?? slug}</span>{" "}
						{isActive ? (
							<Badge variant="success">{t("frameworksAlready")}</Badge>
						) : recommended === false ? (
							<Badge variant="muted">{t("optional")}</Badge>
						) : null}
						<span className="block text-muted-foreground text-footnote">
							{reason}
						</span>
					</span>
				</label>
			</li>
		);
	};

	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(e) => {
				e.preventDefault();
				run(
					() =>
						saveSetupFrameworks({
							frameworks: selected.filter((s) => !active.includes(s)).length
								? selected
								: active,
						}),
					(res) =>
						t("frameworksSaved", {
							n:
								(res as { data?: { controlsCreated?: number } }).data
									?.controlsCreated ?? 0,
						}),
				);
			}}
		>
			<section className="flex flex-col gap-2">
				<h2 className="font-medium text-subhead">{t("suggested")}</h2>
				<ul className="flex flex-col gap-2">
					{suggestions.map((s) => row(s.slug, s.reason, s.recommended))}
				</ul>
			</section>
			<details className="flex flex-col gap-2">
				<summary className="cursor-pointer font-medium text-subhead">
					{t("others")} ({others.length})
				</summary>
				<ul className="mt-2 flex flex-col gap-2">
					{others.map((f) => row(f.slug, f.description))}
				</ul>
			</details>
			{selected.length > 0 && (
				<SynergyPreviewPanel
					frameworks={selected}
					sector={profile.sector}
					licenceStage={profile.licenceStage}
					caspServices={profile.caspServices}
					names={names}
				/>
			)}
			<div className="flex justify-end">
				<Button type="submit" disabled={pending || selected.length === 0}>
					{t("saveNext")}
				</Button>
			</div>
		</form>
	);
}
