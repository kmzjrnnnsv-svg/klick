"use client";

import { Save, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteJob, saveJob, suggestRequirements } from "@/app/actions/jobs";
import { JobUploader } from "@/components/jobs/job-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Job, JobRequirement } from "@/db/schema";
import type { ExtractedJobPosting } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const REMOTE_OPTIONS = ["onsite", "hybrid", "remote"] as const;
const TYPE_OPTIONS = [
	"fulltime",
	"parttime",
	"contract",
	"internship",
] as const;
const STATUS_OPTIONS = ["draft", "published", "archived"] as const;

type LocalRequirement = JobRequirement & { _key: string };

function withKey(r: JobRequirement): LocalRequirement {
	return { ...r, _key: crypto.randomUUID() };
}

export function JobForm({
	initial,
	templates,
}: {
	initial: Job | null;
	templates: { id: string; name: string; isDefault: boolean }[];
}) {
	const t = useTranslations("Jobs");
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isSuggesting, startSuggesting] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const defaultTemplateId =
		initial?.templateId ??
		templates.find((tt) => tt.isDefault)?.id ??
		templates[0]?.id ??
		"";
	const [templateId, setTemplateId] = useState(defaultTemplateId);
	const [honestPostingFlag, setHonestPostingFlag] = useState<
		"open" | "internal_preferred" | "compliance_only"
	>(
		(initial?.honestPostingFlag as
			| "open"
			| "internal_preferred"
			| "compliance_only") ?? "open",
	);

	const [title, setTitle] = useState(initial?.title ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [location, setLocation] = useState(initial?.location ?? "");
	const [remotePolicy, setRemotePolicy] = useState<
		(typeof REMOTE_OPTIONS)[number]
	>(initial?.remotePolicy ?? "hybrid");
	const [employmentType, setEmploymentType] = useState<
		(typeof TYPE_OPTIONS)[number]
	>(initial?.employmentType ?? "fulltime");
	const [salaryMin, setSalaryMin] = useState(
		initial?.salaryMin?.toString() ?? "",
	);
	const [salaryMax, setSalaryMax] = useState(
		initial?.salaryMax?.toString() ?? "",
	);
	const [yearsExperienceMin, setYearsExperienceMin] = useState(
		initial?.yearsExperienceMin?.toString() ?? "0",
	);
	const [languages, setLanguages] = useState(
		(initial?.languages ?? []).join(", "),
	);
	const [requirements, setRequirements] = useState<LocalRequirement[]>(
		(initial?.requirements ?? []).map(withKey),
	);
	const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>(
		initial?.status ?? "draft",
	);
	const [teamSize, setTeamSize] = useState(initial?.teamSize?.toString() ?? "");
	const [growthStage, setGrowthStage] = useState(initial?.growthStage ?? "");
	const [techStackDetail, setTechStackDetail] = useState(
		initial?.techStackDetail ?? "",
	);
	const [decisionProcess, setDecisionProcess] = useState(
		initial?.decisionProcess ?? "",
	);
	const [remoteOnsiteRatio, setRemoteOnsiteRatio] = useState(
		initial?.remoteOnsiteRatio?.toString() ?? "",
	);
	const [mustReasoning, setMustReasoning] = useState(
		initial?.mustReasoning ?? "",
	);
	const [first90DaysGoals, setFirst90DaysGoals] = useState(
		initial?.first90DaysGoals ?? "",
	);

	function addRequirement() {
		setRequirements([...requirements, withKey({ name: "", weight: "nice" })]);
	}
	function updateRequirement(key: string, patch: Partial<JobRequirement>) {
		setRequirements(
			requirements.map((r) => (r._key === key ? { ...r, ...patch } : r)),
		);
	}
	function removeRequirement(key: string) {
		setRequirements(requirements.filter((r) => r._key !== key));
	}

	function handleSuggest() {
		setError(null);
		startSuggesting(async () => {
			try {
				const out = await suggestRequirements({ title, description });
				if (out.length === 0) return;
				const existingNames = new Set(
					requirements.map((r) => r.name.toLowerCase()),
				);
				const additions = out
					.filter((o) => !existingNames.has(o.name.toLowerCase()))
					.map(withKey);
				setRequirements([...requirements, ...additions]);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	function applyExtracted(data: ExtractedJobPosting) {
		if (data.title) setTitle(data.title);
		if (data.description) setDescription(data.description);
		if (data.location !== undefined) setLocation(data.location);
		if (data.remotePolicy) setRemotePolicy(data.remotePolicy);
		if (data.employmentType) setEmploymentType(data.employmentType);
		if (data.salaryMin !== undefined) setSalaryMin(String(data.salaryMin));
		if (data.salaryMax !== undefined) setSalaryMax(String(data.salaryMax));
		if (data.yearsExperienceMin !== undefined) {
			setYearsExperienceMin(String(data.yearsExperienceMin));
		}
		if (data.languages && data.languages.length > 0) {
			setLanguages(data.languages.join(", "));
		}
		if (data.requirements && data.requirements.length > 0) {
			setRequirements(data.requirements.map(withKey));
		}
	}

	function handleSubmit(formData: FormData) {
		const stripped: JobRequirement[] = requirements.map(
			({ _key: _ignore, ...rest }) => rest,
		);
		formData.set("requirements", JSON.stringify(stripped));
		setError(null);
		startTransition(async () => {
			try {
				const { id } = await saveJob(initial?.id ?? null, formData);
				if (!initial) router.push(`/jobs/${id}`);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	function handleDelete() {
		if (!initial) return;
		if (!confirm(t("confirmDelete"))) return;
		startTransition(async () => {
			try {
				await deleteJob(initial.id);
				router.push("/jobs");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<form action={handleSubmit} className="space-y-6 sm:space-y-8">
			{!initial && (
				<JobUploader onExtracted={applyExtracted} disabled={isPending} />
			)}
			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("section.basics")}</h2>
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("titleLabel")}
					</span>
					<Input
						name="title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						required
						autoFocus={!initial}
						placeholder={t("titlePlaceholder")}
					/>
				</label>
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("descriptionLabel")}
					</span>
					<textarea
						name="description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						required
						rows={8}
						placeholder={t("descriptionPlaceholder")}
						className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					/>
				</label>
			</section>

			<section className="space-y-3">
				<div className="flex items-end justify-between gap-3">
					<h2 className="font-medium text-sm">{t("section.requirements")}</h2>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleSuggest}
						disabled={
							isSuggesting || !title.trim() || description.trim().length < 20
						}
					>
						<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
						{isSuggesting ? t("suggesting") : t("suggestSkills")}
					</Button>
				</div>
				{requirements.length === 0 && (
					<p className="text-muted-foreground text-xs">
						{t("requirementsEmpty")}
					</p>
				)}
				<ul className="space-y-2">
					{requirements.map((r) => (
						<li
							key={r._key}
							className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center"
						>
							<Input
								value={r.name}
								onChange={(e) =>
									updateRequirement(r._key, { name: e.target.value })
								}
								placeholder={t("skillName")}
								className="flex-1"
							/>
							<select
								value={r.weight}
								onChange={(e) =>
									updateRequirement(r._key, {
										weight: e.target.value as "must" | "nice",
									})
								}
								className="h-11 rounded-md border border-border bg-background px-2 text-sm sm:w-32"
							>
								<option value="must">{t("weight.must")}</option>
								<option value="nice">{t("weight.nice")}</option>
							</select>
							<select
								value={r.minLevel ?? ""}
								onChange={(e) => {
									const v = e.target.value;
									updateRequirement(r._key, {
										minLevel: v ? (Number(v) as 1 | 2 | 3 | 4 | 5) : undefined,
									});
								}}
								className="h-11 rounded-md border border-border bg-background px-2 text-sm sm:w-28"
							>
								<option value="">{t("levelAny")}</option>
								{[1, 2, 3, 4, 5].map((l) => (
									<option key={l} value={l}>
										≥ {l}
									</option>
								))}
							</select>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => removeRequirement(r._key)}
								aria-label={t("remove")}
							>
								<X className="h-4 w-4" strokeWidth={1.5} />
							</Button>
						</li>
					))}
				</ul>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={addRequirement}
				>
					{t("addRequirement")}
				</Button>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("section.context")}</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("location")}
						</span>
						<Input
							name="location"
							value={location}
							onChange={(e) => setLocation(e.target.value)}
							placeholder="Berlin, DE"
						/>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("yearsExperienceMin")}
						</span>
						<Input
							name="yearsExperienceMin"
							type="number"
							min={0}
							max={40}
							value={yearsExperienceMin}
							onChange={(e) => setYearsExperienceMin(e.target.value)}
						/>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("remotePolicy")}
						</span>
						<select
							name="remotePolicy"
							value={remotePolicy}
							onChange={(e) =>
								setRemotePolicy(
									e.target.value as (typeof REMOTE_OPTIONS)[number],
								)
							}
							className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
						>
							{REMOTE_OPTIONS.map((o) => (
								<option key={o} value={o}>
									{t(`remoteOptions.${o}`)}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("employmentType")}
						</span>
						<select
							name="employmentType"
							value={employmentType}
							onChange={(e) =>
								setEmploymentType(
									e.target.value as (typeof TYPE_OPTIONS)[number],
								)
							}
							className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
						>
							{TYPE_OPTIONS.map((o) => (
								<option key={o} value={o}>
									{t(`typeOptions.${o}`)}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1 sm:col-span-2">
						<span className="text-muted-foreground text-xs">
							{t("languages")}
						</span>
						<Input
							name="languages"
							value={languages}
							onChange={(e) => setLanguages(e.target.value)}
							placeholder="de:c1, en:c1"
						/>
					</label>
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("section.salary")}</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("salaryMin")}
						</span>
						<Input
							name="salaryMin"
							type="number"
							min={0}
							value={salaryMin}
							onChange={(e) => setSalaryMin(e.target.value)}
							placeholder="55000"
						/>
					</label>
					<label className="space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("salaryMax")}
						</span>
						<Input
							name="salaryMax"
							type="number"
							min={0}
							value={salaryMax}
							onChange={(e) => setSalaryMax(e.target.value)}
							placeholder="75000"
						/>
					</label>
				</div>
			</section>

			<details className="rounded-md border border-border bg-background">
				<summary className="cursor-pointer p-3 font-medium text-sm">
					{t("section.deepContext")}
				</summary>
				<div className="space-y-3 p-3 pt-0">
					<p className="text-muted-foreground text-xs leading-relaxed">
						{t("deepContextHint")}
					</p>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="space-y-1">
							<span className="text-muted-foreground text-xs">
								{t("teamSize")}
							</span>
							<Input
								name="teamSize"
								type="number"
								min={0}
								value={teamSize}
								onChange={(e) => setTeamSize(e.target.value)}
								placeholder="8"
							/>
						</label>
						<label className="space-y-1">
							<span className="text-muted-foreground text-xs">
								{t("growthStage")}
							</span>
							<select
								name="growthStage"
								value={growthStage}
								onChange={(e) =>
									setGrowthStage(e.target.value as typeof growthStage)
								}
								className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
							>
								<option value="">{t("growthStageNone")}</option>
								{(
									[
										"pre_seed",
										"seed",
										"series_a",
										"series_b",
										"series_c_plus",
										"profitable",
										"public",
										"non_profit",
										"agency",
									] as const
								).map((s) => (
									<option key={s} value={s}>
										{t(`growthStages.${s}`)}
									</option>
								))}
							</select>
						</label>
						<label className="space-y-1">
							<span className="text-muted-foreground text-xs">
								{t("remoteOnsiteRatio")}
							</span>
							<Input
								name="remoteOnsiteRatio"
								type="number"
								min={0}
								max={100}
								value={remoteOnsiteRatio}
								onChange={(e) => setRemoteOnsiteRatio(e.target.value)}
								placeholder="60"
							/>
						</label>
					</div>
					<label className="block space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("techStackDetail")}
						</span>
						<textarea
							name="techStackDetail"
							value={techStackDetail}
							onChange={(e) => setTechStackDetail(e.target.value)}
							rows={2}
							placeholder={t("techStackDetailPlaceholder")}
							className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</label>
					<label className="block space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("decisionProcess")}
						</span>
						<textarea
							name="decisionProcess"
							value={decisionProcess}
							onChange={(e) => setDecisionProcess(e.target.value)}
							rows={2}
							placeholder={t("decisionProcessPlaceholder")}
							className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</label>
					<label className="block space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("mustReasoning")}
						</span>
						<textarea
							name="mustReasoning"
							value={mustReasoning}
							onChange={(e) => setMustReasoning(e.target.value)}
							rows={2}
							placeholder={t("mustReasoningPlaceholder")}
							className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</label>
					<label className="block space-y-1">
						<span className="text-muted-foreground text-xs">
							{t("first90DaysGoals")}
						</span>
						<textarea
							name="first90DaysGoals"
							value={first90DaysGoals}
							onChange={(e) => setFirst90DaysGoals(e.target.value)}
							rows={3}
							placeholder={t("first90DaysGoalsPlaceholder")}
							className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</label>
				</div>
			</details>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("section.process")}</h2>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t("processHint")}
				</p>
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("templateLabel")}
					</span>
					<select
						name="templateId"
						value={templateId}
						onChange={(e) => setTemplateId(e.target.value)}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					>
						{templates.length === 0 && (
							<option value="">{t("templateNoneAvailable")}</option>
						)}
						{templates.map((tt) => (
							<option key={tt.id} value={tt.id}>
								{tt.name}
								{tt.isDefault ? ` · ${t("templateDefault")}` : ""}
							</option>
						))}
					</select>
				</label>
				<p className="text-muted-foreground text-[11px] leading-relaxed">
					{t("templateHint")}{" "}
					<a
						href="/templates"
						className="underline underline-offset-2 hover:text-foreground"
					>
						{t("templateManageLink")}
					</a>
					.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("section.honestPosting")}</h2>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t("honestPostingHint")}
				</p>
				<div className="space-y-2">
					{(["open", "internal_preferred", "compliance_only"] as const).map(
						(f) => (
							<label
								key={f}
								className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 has-[:checked]:border-primary"
							>
								<input
									type="radio"
									name="honestPostingFlag"
									value={f}
									checked={honestPostingFlag === f}
									onChange={() => setHonestPostingFlag(f)}
									className="mt-0.5"
								/>
								<div className="text-sm">
									<div className="font-medium">
										{t(`honestPosting.${f}.title`)}
									</div>
									<div className="text-muted-foreground text-xs">
										{t(`honestPosting.${f}.body`)}
									</div>
								</div>
							</label>
						),
					)}
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="font-medium text-sm">{t("section.status")}</h2>
				<div className="space-y-2">
					{STATUS_OPTIONS.map((s) => (
						<label
							key={s}
							className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 has-[:checked]:border-primary"
						>
							<input
								type="radio"
								name="status"
								value={s}
								checked={status === s}
								onChange={() => setStatus(s)}
								className="mt-0.5"
							/>
							<div className="text-sm">
								<div className="font-medium">
									{t(`statusOptions.${s}.title`)}
								</div>
								<div className="text-muted-foreground text-xs">
									{t(`statusOptions.${s}.body`)}
								</div>
							</div>
						</label>
					))}
				</div>
				{status === "published" && (
					<p className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs leading-relaxed dark:text-amber-200">
						{t("publishGuard")}
					</p>
				)}
			</section>

			{error && (
				<p
					className={cn(
						"rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-sm dark:text-rose-300",
					)}
				>
					{error}
				</p>
			)}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<Button type="submit" disabled={isPending}>
					<Save className="h-4 w-4" strokeWidth={1.5} />
					{isPending ? t("saving") : initial ? t("save") : t("create")}
				</Button>
				{initial && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleDelete}
						disabled={isPending}
					>
						<Trash2 className="h-4 w-4" strokeWidth={1.5} />
						{t("delete")}
					</Button>
				)}
			</div>
		</form>
	);
}
