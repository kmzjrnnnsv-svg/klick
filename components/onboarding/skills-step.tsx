"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveSkillsStep } from "@/app/actions/onboarding";
import { parseCvFromVault } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import type { CandidateProfile, ProfileSkill } from "@/db/schema";
import type { ExtractedProfile } from "@/lib/ai";

type CvItem = { id: string; filename: string; createdAt: Date };

function skillsToText(skills: ProfileSkill[] | null | undefined): string {
	if (!skills || skills.length === 0) return "";
	return skills
		.map((s) => (s.level ? `${s.name}: ${s.level}` : s.name))
		.join("\n");
}

export function SkillsStep({
	initial,
	cvs,
}: {
	initial: CandidateProfile | null;
	cvs: CvItem[];
}) {
	const t = useTranslations("Onboarding.skills");
	const [skillsText, setSkillsText] = useState(skillsToText(initial?.skills));
	const [summary, setSummary] = useState(initial?.summary ?? "");
	const [experience, setExperience] = useState(initial?.experience ?? []);
	const [education, setEducation] = useState(initial?.education ?? []);
	const [importPending, startImport] = useTransition();
	const [importError, setImportError] = useState<string | null>(null);

	function applyExtracted(data: ExtractedProfile) {
		if (data.skills && data.skills.length > 0) {
			setSkillsText(skillsToText(data.skills));
		}
		if (data.summary) setSummary(data.summary);
		if (data.experience && data.experience.length > 0) {
			setExperience(data.experience);
		}
		if (data.education && data.education.length > 0) {
			setEducation(data.education);
		}
	}

	function handleImport() {
		const cv = cvs[0];
		if (!cv) return;
		setImportError(null);
		startImport(async () => {
			try {
				const data = await parseCvFromVault(cv.id);
				applyExtracted(data);
			} catch (e) {
				setImportError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<form action={saveSkillsStep} className="space-y-6">
			{cvs.length > 0 && (
				<div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="font-medium text-sm">{t("importTitle")}</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								{t("importHint", { filename: cvs[0].filename })}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							onClick={handleImport}
							disabled={importPending}
						>
							{importPending ? (
								<Loader2
									className="h-3.5 w-3.5 animate-spin"
									strokeWidth={1.5}
								/>
							) : (
								<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
							)}
							{importPending ? t("importing") : t("importCta")}
						</Button>
					</div>
					{importPending && (
						<div className="mt-4 space-y-2">
							{[60, 85, 45, 75].map((w, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: cosmetic skeleton
									key={i}
									className="h-2 animate-pulse rounded-full bg-primary/15"
									style={{ width: `${w}%` }}
								/>
							))}
						</div>
					)}
					{importError && (
						<p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
							{importError}
						</p>
					)}
				</div>
			)}

			<label className="block space-y-1.5">
				<span className="font-medium text-sm">{t("skillsLabel")}</span>
				<div className="relative">
					<textarea
						name="skills"
						value={skillsText}
						onChange={(e) => setSkillsText(e.target.value)}
						rows={6}
						placeholder={t("skillsPlaceholder")}
						disabled={importPending}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
					/>
					{importPending && (
						<div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-[1px]">
							<div className="flex items-center gap-2 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-primary text-xs">
								<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
								{t("importing")}
							</div>
						</div>
					)}
				</div>
				<span className="block text-muted-foreground text-xs">
					{t("skillsHint")}
				</span>
			</label>

			<label className="block space-y-1.5">
				<span className="font-medium text-sm">{t("summaryLabel")}</span>
				<textarea
					name="summary"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					rows={4}
					placeholder={t("summaryPlaceholder")}
					maxLength={2000}
					className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				/>
			</label>

			{/* JSON shadow inputs so the server action can persist what the AI brought */}
			<input
				type="hidden"
				name="experience"
				value={JSON.stringify(experience)}
			/>
			<input type="hidden" name="education" value={JSON.stringify(education)} />

			<p className="text-muted-foreground text-xs">{t("moreLater")}</p>

			<div className="flex justify-end pt-2">
				<Button type="submit" size="lg">
					{t("next")}
				</Button>
			</div>
		</form>
	);
}
