"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveProfile } from "@/app/actions/profile";
import { CvImporter } from "@/components/profile/cv-importer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CandidateProfile } from "@/db/schema";
import type { ExtractedProfile } from "@/lib/ai";

type CvItem = { id: string; filename: string; mime: string; createdAt: Date };

function skillsToText(skills: CandidateProfile["skills"] | undefined): string {
	if (!skills || skills.length === 0) return "";
	return skills
		.map((s) => (s.level ? `${s.name}: ${s.level}` : s.name))
		.join("\n");
}

function languagesToText(
	langs: CandidateProfile["languages"] | undefined,
): string {
	if (!langs || langs.length === 0) return "";
	return langs.join(", ");
}

export function ProfileForm({
	initial,
	cvs,
}: {
	initial: CandidateProfile | null;
	cvs: CvItem[];
}) {
	const t = useTranslations("Profile");
	const [isPending, startTransition] = useTransition();
	const [savedAt, setSavedAt] = useState<Date | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
	const [headline, setHeadline] = useState(initial?.headline ?? "");
	const [location, setLocation] = useState(initial?.location ?? "");
	const [yearsExperience, setYearsExperience] = useState(
		initial?.yearsExperience?.toString() ?? "",
	);
	const [languages, setLanguages] = useState(
		languagesToText(initial?.languages),
	);
	const [skillsText, setSkillsText] = useState(skillsToText(initial?.skills));
	const [summary, setSummary] = useState(initial?.summary ?? "");
	const [salaryMin, setSalaryMin] = useState(
		initial?.salaryMin?.toString() ?? "",
	);
	const [salaryDesired, setSalaryDesired] = useState(
		initial?.salaryDesired?.toString() ?? "",
	);
	const [canBeContactedBy, setCanBeContactedBy] = useState<
		"all" | "employers_only" | "none"
	>(initial?.canBeContactedBy ?? "all");
	const [openToOffers, setOpenToOffers] = useState(
		initial?.openToOffers ?? true,
	);
	const [visibility, setVisibility] = useState<
		"private" | "matches_only" | "public"
	>(initial?.visibility ?? "matches_only");
	const [experience, setExperience] = useState(initial?.experience ?? []);
	const [education, setEducation] = useState(initial?.education ?? []);

	function applyExtracted(data: ExtractedProfile) {
		if (data.displayName !== undefined) setDisplayName(data.displayName);
		if (data.headline !== undefined) setHeadline(data.headline);
		if (data.location !== undefined) setLocation(data.location);
		if (data.yearsExperience !== undefined)
			setYearsExperience(String(data.yearsExperience));
		if (data.languages) setLanguages(data.languages.join(", "));
		if (data.skills)
			setSkillsText(
				data.skills
					.map((s) => (s.level ? `${s.name}: ${s.level}` : s.name))
					.join("\n"),
			);
		if (data.summary !== undefined) setSummary(data.summary);
		if (data.experience)
			setExperience(
				data.experience.map((e) => ({
					company: e.company,
					role: e.role,
					start: e.start,
					end: e.end,
					description: e.description,
				})),
			);
		if (data.education)
			setEducation(
				data.education.map((e) => ({
					institution: e.institution,
					degree: e.degree,
					start: e.start,
					end: e.end,
				})),
			);
	}

	function handleSubmit(formData: FormData) {
		formData.set("experience", JSON.stringify(experience));
		formData.set("education", JSON.stringify(education));
		setError(null);
		startTransition(async () => {
			try {
				await saveProfile(formData);
				setSavedAt(new Date());
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<form action={handleSubmit} className="space-y-8">
			<section className="rounded-lg border border-border bg-background p-4 sm:p-6">
				<h2 className="font-medium text-sm">{t("importFromCv")}</h2>
				<p className="mt-1 mb-4 text-muted-foreground text-xs leading-relaxed">
					{t("importDisclaimer")}
				</p>
				<CvImporter cvs={cvs} onExtracted={applyExtracted} />
			</section>

			<section className="space-y-4">
				<h2 className="font-medium text-sm">{t("basics")}</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("displayName")}
						</span>
						<Input
							name="displayName"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("headline")}
						</span>
						<Input
							name="headline"
							value={headline}
							onChange={(e) => setHeadline(e.target.value)}
						/>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("location")}
						</span>
						<Input
							name="location"
							value={location}
							onChange={(e) => setLocation(e.target.value)}
						/>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("yearsExperience")}
						</span>
						<Input
							name="yearsExperience"
							type="number"
							min={0}
							max={80}
							value={yearsExperience}
							onChange={(e) => setYearsExperience(e.target.value)}
						/>
					</label>
					<label className="space-y-1 sm:col-span-2">
						<span className="text-muted-foreground text-xs">
							{t("languages")}
						</span>
						<Input
							name="languages"
							value={languages}
							onChange={(e) => setLanguages(e.target.value)}
							placeholder="de:native, en:c1"
						/>
					</label>
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("skills")}</h2>
				<textarea
					name="skills"
					value={skillsText}
					onChange={(e) => setSkillsText(e.target.value)}
					rows={6}
					placeholder="TypeScript: 5&#10;React: 4&#10;PostgreSQL"
					className="block w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				/>
				<p className="text-muted-foreground text-xs">{t("skillsHint")}</p>
			</section>

			{experience.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-medium text-sm">{t("experience")}</h2>
					<ul className="space-y-2">
						{experience.map((e) => (
							<li
								key={`${e.company}-${e.role}-${e.start}`}
								className="rounded-md border border-border bg-background p-3"
							>
								<div className="font-medium text-sm">{e.role}</div>
								<div className="text-muted-foreground text-xs">
									{e.company} · {e.start}
									{e.end ? ` – ${e.end}` : ""}
								</div>
								{e.description && (
									<div className="mt-1 text-muted-foreground text-xs">
										{e.description}
									</div>
								)}
							</li>
						))}
					</ul>
				</section>
			)}

			{education.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-medium text-sm">{t("education")}</h2>
					<ul className="space-y-2">
						{education.map((e) => (
							<li
								key={`${e.institution}-${e.degree}-${e.start ?? ""}`}
								className="rounded-md border border-border bg-background p-3"
							>
								<div className="font-medium text-sm">{e.degree}</div>
								<div className="text-muted-foreground text-xs">
									{e.institution}
									{e.start ? ` · ${e.start}` : ""}
									{e.end ? ` – ${e.end}` : ""}
								</div>
							</li>
						))}
					</ul>
				</section>
			)}

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("summary")}</h2>
				<textarea
					name="summary"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					rows={5}
					maxLength={2000}
					className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				/>
			</section>

			<section className="space-y-3 rounded-lg border border-border bg-background p-4 sm:p-6">
				<h2 className="font-medium text-sm">{t("compensation")}</h2>
				<p className="text-muted-foreground text-xs">{t("compensationHint")}</p>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("salaryMin")}
						</span>
						<Input
							name="salaryMin"
							type="number"
							min={0}
							step={1000}
							value={salaryMin}
							onChange={(e) => setSalaryMin(e.target.value)}
							placeholder="65000"
						/>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("salaryDesired")}
						</span>
						<Input
							name="salaryDesired"
							type="number"
							min={0}
							step={1000}
							value={salaryDesired}
							onChange={(e) => setSalaryDesired(e.target.value)}
							placeholder="80000"
						/>
					</label>
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("contactability")}</h2>
				<p className="text-muted-foreground text-xs">
					{t("contactabilityHint")}
				</p>
				<div className="space-y-2">
					{(["all", "employers_only", "none"] as const).map((v) => (
						<label
							key={v}
							className="flex items-start gap-3 rounded-md border border-border bg-background p-3 has-[:checked]:border-primary"
						>
							<input
								type="radio"
								name="canBeContactedBy"
								value={v}
								checked={canBeContactedBy === v}
								onChange={() => setCanBeContactedBy(v)}
								className="mt-0.5"
							/>
							<div className="text-sm">
								<div className="font-medium">
									{t(`contactabilityOptions.${v}.title`)}
								</div>
								<div className="text-muted-foreground text-xs">
									{t(`contactabilityOptions.${v}.body`)}
								</div>
							</div>
						</label>
					))}
				</div>
				<label className="mt-2 flex items-start gap-3 rounded-md border border-border bg-background p-3 has-[:checked]:border-primary">
					<input
						type="checkbox"
						name="openToOffers"
						checked={openToOffers}
						onChange={(e) => setOpenToOffers(e.target.checked)}
						className="mt-1"
					/>
					<div className="text-sm">
						<div className="font-medium">{t("openToOffers")}</div>
						<div className="text-muted-foreground text-xs">
							{t("openToOffersHint")}
						</div>
					</div>
				</label>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("visibility")}</h2>
				<div className="space-y-2">
					{(["private", "matches_only", "public"] as const).map((v) => (
						<label
							key={v}
							className="flex items-start gap-3 rounded-md border border-border bg-background p-3 has-[:checked]:border-primary"
						>
							<input
								type="radio"
								name="visibility"
								value={v}
								checked={visibility === v}
								onChange={() => setVisibility(v)}
								className="mt-0.5"
							/>
							<div className="text-sm">
								<div className="font-medium">
									{t(`visibilityOptions.${v}.title`)}
								</div>
								<div className="text-muted-foreground text-xs">
									{t(`visibilityOptions.${v}.body`)}
								</div>
							</div>
						</label>
					))}
				</div>
			</section>

			{error && (
				<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-sm dark:text-rose-300">
					{error}
				</p>
			)}

			<div className="flex items-center gap-3">
				<Button type="submit" disabled={isPending}>
					<Save className="h-4 w-4" strokeWidth={1.5} />
					{isPending ? t("saving") : t("save")}
				</Button>
				{savedAt && (
					<span className="text-muted-foreground text-xs">
						{t("savedAt", { time: savedAt.toLocaleTimeString() })}
					</span>
				)}
			</div>
		</form>
	);
}
