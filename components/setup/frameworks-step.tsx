"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveSetupFrameworks } from "@/app/actions/setup";
import { useWorkflowsEnabledText } from "@/components/approvals/workflows-enabled";
import { SynergyPreviewPanel } from "@/components/auth/synergy-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CaspService, LicenceStage } from "@/db/schema/enums";
import type { WorkflowEnabledByDuty } from "@/lib/compliance/catalog/approval-duties";
import {
	FRAMEWORK_RELATIONS,
	RELATION_LABEL,
} from "@/lib/compliance/catalog/framework-relations";
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
	simple = {},
	shortNames = {},
	nextHref,
}: {
	// Kurznamen für den Kasten „So hängen deine Rahmenwerke zusammen“
	shortNames?: Record<string, string>;
	// Wozu ist jedes Rahmenwerk da? (ein Satz, Teil Z7)
	simple?: Record<string, string>;
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
	const enabledText = useWorkflowsEnabledText();
	const [selected, setSelected] = useState<string[]>(() => [
		...new Set([
			...active,
			...suggestions.filter((s) => s.recommended).map((s) => s.slug),
		]),
	]);
	const suggested = new Set(suggestions.map((s) => s.slug));
	const others = all.filter((f) => !suggested.has(f.slug));
	// Wie stehen die gewählten Rahmenwerke zueinander (geht vor, baut auf …)?
	const relations = FRAMEWORK_RELATIONS.filter(
		(r) => selected.includes(r.from) && selected.includes(r.to),
	);
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
						{simple[slug] && <span className="block">{simple[slug]}</span>}
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
					(res) => {
						const data = (
							res as {
								data?: {
									controlsCreated?: number;
									workflowsEnabled?: WorkflowEnabledByDuty[];
								};
							}
						).data;
						return {
							title: t("frameworksSaved", { n: data?.controlsCreated ?? 0 }),
							description: enabledText(data?.workflowsEnabled),
						};
					},
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
			{relations.length > 0 && (
				<section
					aria-labelledby="fw-relations"
					className="flex flex-col gap-2 rounded-2xl bg-card p-4"
				>
					<h2 id="fw-relations" className="font-semibold text-subhead">
						{t("relationsTitle")}
					</h2>
					<ul className="flex flex-col gap-2 text-subhead">
						{relations.map((r) => (
							<li key={`${r.from}|${r.to}`}>
								<span className="font-medium">
									{shortNames[r.from] ?? names[r.from] ?? r.from}{" "}
									<span className="text-muted-foreground">
										{RELATION_LABEL[r.kind]}
									</span>{" "}
									{shortNames[r.to] ?? names[r.to] ?? r.to}:
								</span>{" "}
								{r.text}
							</li>
						))}
					</ul>
				</section>
			)}
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
