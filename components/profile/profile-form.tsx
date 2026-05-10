"use client";

import { Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveProfile } from "@/app/actions/profile";
import { CvImporter } from "@/components/profile/cv-importer";
import { EducationCard } from "@/components/profile/education-card";
import { SalaryByCountry } from "@/components/profile/salary-by-country";
import { SectionVisibilityChip } from "@/components/profile/section-visibility-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
	CandidateProfile,
	ProfileAvailability,
	ProfileEducation,
	ProfileProject,
	ProfilePublication,
	ProfileSalaryByCountry,
	ProfileSectionKey,
	ProfileSectionVisibility,
	ProfileSocialLinks,
	ProfileVolunteering,
} from "@/db/schema";
import type { ExtractedProfile } from "@/lib/ai";
import { normalizeEducationDegree } from "@/lib/ai/normalize";
import { visibilityFor } from "@/lib/profile/visibility";

type CvItem = { id: string; filename: string; mime: string; createdAt: Date };
type Visibility = "private" | "matches_only" | "public";

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

function SectionHeader({
	title,
	section,
	visibility,
	onVisibility,
}: {
	title: string;
	section: ProfileSectionKey;
	visibility: Visibility;
	onVisibility: (next: Visibility) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<h2 className="font-medium text-sm">{title}</h2>
			<SectionVisibilityChip
				section={section}
				value={visibility}
				onChange={onVisibility}
			/>
		</div>
	);
}

export function ProfileForm({
	initial,
	cvs,
	locale,
}: {
	initial: CandidateProfile | null;
	cvs: CvItem[];
	locale?: "de" | "en";
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
	const [visibility, setVisibility] = useState<Visibility>(
		initial?.visibility ?? "matches_only",
	);
	const [experience, setExperience] = useState(initial?.experience ?? []);
	const [education, setEducation] = useState<ProfileEducation[]>(() =>
		(initial?.education ?? []).map((e) => {
			// Heile Altdaten: '(ohne Abschluss)' aus Titel ins Flag verschieben.
			const norm = normalizeEducationDegree(e.degree);
			return {
				...e,
				degree: norm.degree,
				completed: e.completed ?? norm.completed,
			};
		}),
	);

	const [publications, setPublications] = useState<ProfilePublication[]>(
		initial?.publications ?? [],
	);
	const [projects, setProjects] = useState<ProfileProject[]>(
		initial?.projects ?? [],
	);
	const [volunteering, setVolunteering] = useState<ProfileVolunteering[]>(
		initial?.volunteering ?? [],
	);
	const [drivingLicenses, setDrivingLicenses] = useState<string>(
		(initial?.drivingLicenses ?? []).join(", "),
	);
	const [availability, setAvailability] = useState<ProfileAvailability>(
		initial?.availability ?? { status: "unknown" },
	);
	const [socialLinks, setSocialLinks] = useState<ProfileSocialLinks>(
		initial?.socialLinks ?? {},
	);
	const [workPermitStatus, setWorkPermitStatus] = useState<
		"eu" | "permit" | "requires_sponsorship" | "unknown" | ""
	>(initial?.workPermitStatus ?? "");

	const [sectionVisibility, setSectionVisibility] =
		useState<ProfileSectionVisibility>(initial?.sectionVisibility ?? {});
	const [salaryByCountry, setSalaryByCountry] = useState<
		ProfileSalaryByCountry[]
	>(initial?.salaryByCountry ?? []);

	function setSV(section: ProfileSectionKey, next: Visibility) {
		setSectionVisibility((prev) => ({ ...prev, [section]: next }));
	}
	function vis(section: ProfileSectionKey): Visibility {
		return visibilityFor(section, sectionVisibility);
	}

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
				data.education.map((e) => {
					const norm = normalizeEducationDegree(e.degree);
					return {
						institution: e.institution,
						degree: norm.degree,
						start: e.start,
						end: e.end,
						completed: e.completed ?? norm.completed,
						degreeType: e.degreeType,
						grade: e.grade,
						thesisTitle: e.thesisTitle,
						focus: e.focus,
					};
				}),
			);
		if (data.publications) setPublications(data.publications);
		if (data.projects) setProjects(data.projects);
		if (data.volunteering) setVolunteering(data.volunteering);
		if (data.drivingLicenses)
			setDrivingLicenses(data.drivingLicenses.join(", "));
		if (data.availability) setAvailability(data.availability);
		if (data.socialLinks) setSocialLinks(data.socialLinks);
		if (data.workPermitStatus) setWorkPermitStatus(data.workPermitStatus);
	}

	function handleSubmit(formData: FormData) {
		formData.set("experience", JSON.stringify(experience));
		formData.set("education", JSON.stringify(education));
		formData.set("publications", JSON.stringify(publications));
		formData.set("projects", JSON.stringify(projects));
		formData.set("volunteering", JSON.stringify(volunteering));
		formData.set("availability", JSON.stringify(availability));
		formData.set("socialLinks", JSON.stringify(socialLinks));
		formData.set("sectionVisibility", JSON.stringify(sectionVisibility));
		formData.set("salaryByCountry", JSON.stringify(salaryByCountry));
		// Die UI-Sprache, in der gerade editiert wird, wird zur neuen Quell-
		// Sprache. Hintergrund-Translation in die andere Sprache läuft danach.
		if (locale) formData.set("editLocale", locale);
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

			<p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-foreground/80 text-xs leading-relaxed">
				{t("visibilityIntro")}
			</p>

			<section className="space-y-4">
				<SectionHeader
					title={t("basics")}
					section="basics"
					visibility={vis("basics")}
					onVisibility={(v) => setSV("basics", v)}
				/>
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
				<SectionHeader
					title={t("summary")}
					section="summary"
					visibility={vis("summary")}
					onVisibility={(v) => setSV("summary", v)}
				/>
				<textarea
					name="summary"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					rows={5}
					maxLength={2000}
					className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				/>
			</section>

			<section className="space-y-3">
				<SectionHeader
					title={t("skills")}
					section="skills"
					visibility={vis("skills")}
					onVisibility={(v) => setSV("skills", v)}
				/>
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
					<SectionHeader
						title={t("experience")}
						section="experience"
						visibility={vis("experience")}
						onVisibility={(v) => setSV("experience", v)}
					/>
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
					<SectionHeader
						title={t("education")}
						section="education"
						visibility={vis("education")}
						onVisibility={(v) => setSV("education", v)}
					/>
					<EducationCard items={education} />
				</section>
			)}

			{publications.length > 0 && (
				<section className="space-y-3">
					<SectionHeader
						title={t("publications")}
						section="publications"
						visibility={vis("publications")}
						onVisibility={(v) => setSV("publications", v)}
					/>
					<ul className="space-y-2">
						{publications.map((p, i) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: stable list editing
								key={`pub-${i}`}
								className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
							>
								<div className="min-w-0 flex-1 text-sm">
									<div className="font-medium">{p.title}</div>
									<div className="text-muted-foreground text-xs">
										{p.year ?? ""}
										{p.venue ? ` · ${p.venue}` : ""}
										{p.kind ? ` · ${p.kind}` : ""}
									</div>
								</div>
								<button
									type="button"
									onClick={() =>
										setPublications((prev) => prev.filter((_, j) => j !== i))
									}
									className="text-muted-foreground hover:text-foreground"
									aria-label={t("remove")}
								>
									<Trash2 className="h-4 w-4" strokeWidth={1.5} />
								</button>
							</li>
						))}
					</ul>
				</section>
			)}

			{projects.length > 0 && (
				<section className="space-y-3">
					<SectionHeader
						title={t("projects")}
						section="projects"
						visibility={vis("projects")}
						onVisibility={(v) => setSV("projects", v)}
					/>
					<ul className="space-y-2">
						{projects.map((p, i) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: stable list editing
								key={`proj-${i}`}
								className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
							>
								<div className="min-w-0 flex-1 text-sm">
									<div className="font-medium">{p.name}</div>
									{p.description && (
										<div className="text-muted-foreground text-xs">
											{p.description}
										</div>
									)}
								</div>
								<button
									type="button"
									onClick={() =>
										setProjects((prev) => prev.filter((_, j) => j !== i))
									}
									className="text-muted-foreground hover:text-foreground"
									aria-label={t("remove")}
								>
									<Trash2 className="h-4 w-4" strokeWidth={1.5} />
								</button>
							</li>
						))}
					</ul>
				</section>
			)}

			{volunteering.length > 0 && (
				<section className="space-y-3">
					<SectionHeader
						title={t("volunteering")}
						section="volunteering"
						visibility={vis("volunteering")}
						onVisibility={(v) => setSV("volunteering", v)}
					/>
					<ul className="space-y-2">
						{volunteering.map((v, i) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: stable list editing
								key={`vol-${i}`}
								className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
							>
								<div className="min-w-0 flex-1 text-sm">
									<div className="font-medium">{v.role}</div>
									<div className="text-muted-foreground text-xs">
										{v.organization}
										{v.start ? ` · ${v.start}` : ""}
										{v.end ? ` – ${v.end}` : ""}
									</div>
								</div>
								<button
									type="button"
									onClick={() =>
										setVolunteering((prev) => prev.filter((_, j) => j !== i))
									}
									className="text-muted-foreground hover:text-foreground"
									aria-label={t("remove")}
								>
									<Trash2 className="h-4 w-4" strokeWidth={1.5} />
								</button>
							</li>
						))}
					</ul>
				</section>
			)}

			<section className="space-y-3">
				<SectionHeader
					title={t("availability")}
					section="availability"
					visibility={vis("availability")}
					onVisibility={(v) => setSV("availability", v)}
				/>
				<div className="space-y-2 rounded-md border border-border bg-background p-3">
					<div className="flex flex-wrap gap-2 text-sm">
						{(
							[
								["immediate", t("availImmediateLabel")],
								["notice", t("availNoticeLabel")],
								["date", t("availDateLabel")],
								["unknown", t("availUnknownLabel")],
							] as const
						).map(([key, label]) => (
							<label
								key={key}
								className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
									availability.status === key
										? "border-primary bg-primary/10 text-primary"
										: "border-border text-muted-foreground"
								}`}
							>
								<input
									type="radio"
									className="sr-only"
									name="availability-status"
									checked={availability.status === key}
									onChange={() =>
										setAvailability((a) => ({ ...a, status: key }))
									}
								/>
								{label}
							</label>
						))}
					</div>
					{availability.status === "notice" && (
						<label className="block space-y-1">
							<span className="text-muted-foreground text-xs">
								{t("noticeWeeks")}
							</span>
							<Input
								type="number"
								min={0}
								max={52}
								value={availability.noticeWeeks?.toString() ?? ""}
								onChange={(e) =>
									setAvailability((a) => ({
										...a,
										noticeWeeks: e.target.value
											? Number(e.target.value)
											: undefined,
									}))
								}
							/>
						</label>
					)}
					{availability.status === "date" && (
						<label className="block space-y-1">
							<span className="text-muted-foreground text-xs">
								{t("availableFrom")}
							</span>
							<Input
								type="date"
								value={availability.availableFrom ?? ""}
								onChange={(e) =>
									setAvailability((a) => ({
										...a,
										availableFrom: e.target.value || undefined,
									}))
								}
							/>
						</label>
					)}
				</div>
			</section>

			<section className="space-y-3">
				<SectionHeader
					title={t("socialLinks")}
					section="socialLinks"
					visibility={vis("socialLinks")}
					onVisibility={(v) => setSV("socialLinks", v)}
				/>
				<div className="grid gap-2 sm:grid-cols-2">
					{(
						[
							["github", "GitHub"],
							["linkedin", "LinkedIn"],
							["xing", "Xing"],
							["website", t("website")],
						] as const
					).map(([key, label]) => (
						<label key={key} className="space-y-1">
							<span className="text-muted-foreground text-xs">{label}</span>
							<Input
								type="url"
								placeholder="https://"
								value={
									(socialLinks[key as keyof ProfileSocialLinks] as string) ?? ""
								}
								onChange={(e) =>
									setSocialLinks((s) => ({
										...s,
										[key]: e.target.value || undefined,
									}))
								}
							/>
						</label>
					))}
				</div>
			</section>

			<section className="space-y-3">
				<SectionHeader
					title={t("drivingLicenses")}
					section="drivingLicenses"
					visibility={vis("drivingLicenses")}
					onVisibility={(v) => setSV("drivingLicenses", v)}
				/>
				<Input
					name="drivingLicenses"
					value={drivingLicenses}
					onChange={(e) => setDrivingLicenses(e.target.value)}
					placeholder="B, BE, A2"
				/>
				<p className="text-muted-foreground text-xs">
					{t("drivingLicensesHint")}
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("workPermit")}</h2>
				<select
					name="workPermitStatus"
					value={workPermitStatus}
					onChange={(e) =>
						setWorkPermitStatus(e.target.value as typeof workPermitStatus)
					}
					className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				>
					<option value="">{t("workPermitOptions.unset")}</option>
					<option value="eu">{t("workPermitOptions.eu")}</option>
					<option value="permit">{t("workPermitOptions.permit")}</option>
					<option value="requires_sponsorship">
						{t("workPermitOptions.requires_sponsorship")}
					</option>
					<option value="unknown">{t("workPermitOptions.unknown")}</option>
				</select>
			</section>

			<section className="space-y-3 rounded-lg border border-border bg-background p-4 sm:p-6">
				<SectionHeader
					title={t("compensation")}
					section="salary"
					visibility={vis("salary")}
					onVisibility={(v) => setSV("salary", v)}
				/>
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
				<div className="border-border border-t pt-3">
					<h3 className="mb-2 font-medium text-sm">
						{t("salaryByCountry.heading")}
					</h3>
					<SalaryByCountry
						value={salaryByCountry}
						onChange={setSalaryByCountry}
					/>
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
				<p className="text-muted-foreground text-xs">{t("visibilityGlobalHint")}</p>
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
