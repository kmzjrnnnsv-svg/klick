"use client";

import { Languages, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { persistTranslation } from "@/app/actions/profile";
import { translateTexts } from "@/app/actions/translate";
import { Button } from "@/components/ui/button";
import type {
	ProfileEducation,
	ProfileExperience,
	ProfileProject,
	ProfilePublication,
	ProfileTranslationFields,
	ProfileVolunteering,
} from "@/db/schema";

// Vereinfachter Editor für die Übersetzungs-Tab. Zeigt NUR die
// übersetzbaren Freitext-Felder (kein Salary, kein Commute, keine
// Visibility-Chips — die sind sprach-unabhängig und werden im DE-Tab
// editiert). Speichert direkt in translations[targetLocale].
//
// "Auto-fill"-Knopf oben übersetzt alle Quell-Felder auf einen Schlag
// via Claude und füllt die Inputs vor — der User kann dann einzelne
// Felder verfeinern und speichern.
export function ProfileTranslationForm({
	targetLocale,
	sourceLocale,
	source,
	initialTranslation,
}: {
	targetLocale: "de" | "en";
	sourceLocale: "de" | "en";
	source: {
		headline: string | null;
		summary: string | null;
		mobility: string | null;
		industries: string[] | null;
		awards: string[] | null;
		experience: ProfileExperience[] | null;
		education: ProfileEducation[] | null;
		projects: ProfileProject[] | null;
		publications: ProfilePublication[] | null;
		volunteering: ProfileVolunteering[] | null;
	};
	initialTranslation: ProfileTranslationFields | null;
}) {
	const t = useTranslations("Profile");
	const [headline, setHeadline] = useState(
		initialTranslation?.headline ?? source.headline ?? "",
	);
	const [summary, setSummary] = useState(
		initialTranslation?.summary ?? source.summary ?? "",
	);
	const [mobility, setMobility] = useState(
		initialTranslation?.mobility ?? source.mobility ?? "",
	);
	const [industries, setIndustries] = useState(
		(initialTranslation?.industries ?? source.industries ?? []).join(", "),
	);
	const [awards, setAwards] = useState(
		(initialTranslation?.awards ?? source.awards ?? []).join("\n"),
	);
	const [experience, setExperience] = useState<
		Array<{ role: string; description: string }>
	>(
		(source.experience ?? []).map((src, i) => {
			const tr = initialTranslation?.experience?.[i];
			return {
				role: tr?.role ?? src.role,
				description: tr?.description ?? src.description ?? "",
			};
		}),
	);
	const [education, setEducation] = useState<
		Array<{ degree: string; thesisTitle: string; focus: string }>
	>(
		(source.education ?? []).map((src, i) => {
			const tr = initialTranslation?.education?.[i];
			return {
				degree: tr?.degree ?? src.degree,
				thesisTitle: tr?.thesisTitle ?? src.thesisTitle ?? "",
				focus: tr?.focus ?? src.focus ?? "",
			};
		}),
	);
	const [projects, setProjects] = useState<
		Array<{ name: string; role: string; description: string }>
	>(
		(source.projects ?? []).map((src, i) => {
			const tr = initialTranslation?.projects?.[i];
			return {
				name: tr?.name ?? src.name,
				role: tr?.role ?? src.role ?? "",
				description: tr?.description ?? src.description ?? "",
			};
		}),
	);
	const [publications, setPublications] = useState<
		Array<{ title: string; venue: string }>
	>(
		(source.publications ?? []).map((src, i) => {
			const tr = initialTranslation?.publications?.[i];
			return {
				title: tr?.title ?? src.title,
				venue: tr?.venue ?? src.venue ?? "",
			};
		}),
	);
	const [volunteering, setVolunteering] = useState<
		Array<{ organization: string; role: string; description: string }>
	>(
		(source.volunteering ?? []).map((src, i) => {
			const tr = initialTranslation?.volunteering?.[i];
			return {
				organization: tr?.organization ?? src.organization,
				role: tr?.role ?? src.role,
				description: tr?.description ?? src.description ?? "",
			};
		}),
	);

	const [isAutoFilling, startAutoFill] = useTransition();
	const [isSaving, startSaving] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<Date | null>(null);

	function autoFillAll() {
		setError(null);
		startAutoFill(async () => {
			// Sammle ALLE Quell-Texte und schicke sie in einem translateTexts-
			// Call durch — minimal Tokens.
			const texts: string[] = [
				source.headline ?? "",
				source.summary ?? "",
				source.mobility ?? "",
				...(source.industries ?? []),
				...(source.awards ?? []),
				...experience.flatMap((_, i) => [
					source.experience?.[i]?.role ?? "",
					source.experience?.[i]?.description ?? "",
				]),
				...education.flatMap((_, i) => [
					source.education?.[i]?.degree ?? "",
					source.education?.[i]?.thesisTitle ?? "",
					source.education?.[i]?.focus ?? "",
				]),
				...projects.flatMap((_, i) => [
					source.projects?.[i]?.name ?? "",
					source.projects?.[i]?.role ?? "",
					source.projects?.[i]?.description ?? "",
				]),
				...publications.flatMap((_, i) => [
					source.publications?.[i]?.title ?? "",
					source.publications?.[i]?.venue ?? "",
				]),
				...volunteering.flatMap((_, i) => [
					source.volunteering?.[i]?.organization ?? "",
					source.volunteering?.[i]?.role ?? "",
					source.volunteering?.[i]?.description ?? "",
				]),
			];

			const r = await translateTexts({
				texts,
				from: sourceLocale,
				to: targetLocale,
				context:
					"Kandidat:innen-Profilfelder. Firmen, Schulen, Frameworks, Norm-Namen (ISO 27001, AWS, CISSP) UNVERÄNDERT lassen.",
			});
			if (!r.ok) {
				setError(r.error);
				return;
			}
			let idx = 0;
			setHeadline(r.texts[idx++] ?? "");
			setSummary(r.texts[idx++] ?? "");
			setMobility(r.texts[idx++] ?? "");
			const inds: string[] = [];
			for (const _v of source.industries ?? []) inds.push(r.texts[idx++] ?? "");
			setIndustries(inds.join(", "));
			const aw: string[] = [];
			for (const _v of source.awards ?? []) aw.push(r.texts[idx++] ?? "");
			setAwards(aw.join("\n"));
			setExperience(
				experience.map(() => {
					const role = r.texts[idx++] ?? "";
					const description = r.texts[idx++] ?? "";
					return { role, description };
				}),
			);
			setEducation(
				education.map(() => {
					const degree = r.texts[idx++] ?? "";
					const thesisTitle = r.texts[idx++] ?? "";
					const focus = r.texts[idx++] ?? "";
					return { degree, thesisTitle, focus };
				}),
			);
			setProjects(
				projects.map(() => {
					const name = r.texts[idx++] ?? "";
					const role = r.texts[idx++] ?? "";
					const description = r.texts[idx++] ?? "";
					return { name, role, description };
				}),
			);
			setPublications(
				publications.map(() => {
					const title = r.texts[idx++] ?? "";
					const venue = r.texts[idx++] ?? "";
					return { title, venue };
				}),
			);
			setVolunteering(
				volunteering.map(() => {
					const organization = r.texts[idx++] ?? "";
					const role = r.texts[idx++] ?? "";
					const description = r.texts[idx++] ?? "";
					return { organization, role, description };
				}),
			);
		});
	}

	function save() {
		setError(null);
		startSaving(async () => {
			const patch: Parameters<typeof persistTranslation>[0]["patch"] = {
				headline: headline.trim() || undefined,
				summary: summary.trim() || undefined,
				mobility: mobility.trim() || undefined,
				industries: industries
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
				awards: awards
					.split("\n")
					.map((s) => s.trim())
					.filter(Boolean),
				experience: experience.map((e) => ({
					role: e.role.trim(),
					description: e.description.trim() || undefined,
				})),
				education: education.map((e) => ({
					degree: e.degree.trim(),
					thesisTitle: e.thesisTitle.trim() || undefined,
					focus: e.focus.trim() || undefined,
				})),
				projects: projects.map((p) => ({
					name: p.name.trim(),
					role: p.role.trim() || undefined,
					description: p.description.trim() || undefined,
				})),
				publications: publications.map((p) => ({
					title: p.title.trim(),
					venue: p.venue.trim() || undefined,
				})),
				volunteering: volunteering.map((v) => ({
					organization: v.organization.trim(),
					role: v.role.trim(),
					description: v.description.trim() || undefined,
				})),
			};
			const r = await persistTranslation({ targetLocale, patch });
			if (!r.ok) {
				setError(r.error);
				return;
			}
			setSavedAt(new Date());
		});
	}

	const inputCls =
		"w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none";

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
			className="space-y-6"
		>
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
				<p className="text-xs leading-relaxed">
					{t("translationTabHint", {
						lang: targetLocale.toUpperCase(),
						source: sourceLocale.toUpperCase(),
					})}
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={autoFillAll}
					disabled={isAutoFilling}
				>
					{isAutoFilling ? (
						<Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
					) : (
						<Languages className="h-4 w-4" strokeWidth={1.5} />
					)}
					{isAutoFilling ? t("autoFillPending") : t("autoFillAll")}
				</Button>
			</div>

			<section className="space-y-3">
				<label className="block">
					<span className="font-medium text-sm">{t("headline")}</span>
					<input
						type="text"
						value={headline}
						onChange={(e) => setHeadline(e.target.value)}
						className={`mt-1 ${inputCls}`}
					/>
				</label>
				<label className="block">
					<span className="font-medium text-sm">{t("summary")}</span>
					<textarea
						value={summary}
						onChange={(e) => setSummary(e.target.value)}
						rows={5}
						className={`mt-1 ${inputCls}`}
					/>
				</label>
				<label className="block">
					<span className="font-medium text-sm">{t("mobility")}</span>
					<input
						type="text"
						value={mobility}
						onChange={(e) => setMobility(e.target.value)}
						className={`mt-1 ${inputCls}`}
					/>
				</label>
				<label className="block">
					<span className="font-medium text-sm">{t("industries")}</span>
					<input
						type="text"
						value={industries}
						onChange={(e) => setIndustries(e.target.value)}
						className={`mt-1 ${inputCls}`}
					/>
				</label>
				<label className="block">
					<span className="font-medium text-sm">{t("awards")}</span>
					<textarea
						value={awards}
						onChange={(e) => setAwards(e.target.value)}
						rows={3}
						className={`mt-1 ${inputCls}`}
					/>
				</label>
			</section>

			{experience.length > 0 && (
				<section className="space-y-3">
					<h3 className="font-medium text-sm">{t("experience")}</h3>
					{experience.map((it, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed 1:1 mapping with source.experience[i]
							key={`exp-${i}`}
							className="space-y-2 rounded-md border border-border bg-background p-3"
						>
							<p className="font-mono text-[10px] text-muted-foreground">
								{source.experience?.[i]?.company} ·{" "}
								{source.experience?.[i]?.start}
								{source.experience?.[i]?.end
									? ` – ${source.experience[i].end}`
									: ""}
							</p>
							<input
								type="text"
								value={it.role}
								onChange={(e) =>
									setExperience((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, role: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Role"
							/>
							<textarea
								value={it.description}
								onChange={(e) =>
									setExperience((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, description: e.target.value } : c,
										),
									)
								}
								rows={4}
								className={inputCls}
								placeholder="Description"
							/>
						</div>
					))}
				</section>
			)}

			{education.length > 0 && (
				<section className="space-y-3">
					<h3 className="font-medium text-sm">{t("education")}</h3>
					{education.map((it, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed 1:1 mapping with source.education[i]
							key={`edu-${i}`}
							className="space-y-2 rounded-md border border-border bg-background p-3"
						>
							<p className="font-mono text-[10px] text-muted-foreground">
								{source.education?.[i]?.institution}
							</p>
							<input
								type="text"
								value={it.degree}
								onChange={(e) =>
									setEducation((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, degree: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Degree"
							/>
							<input
								type="text"
								value={it.thesisTitle}
								onChange={(e) =>
									setEducation((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, thesisTitle: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Thesis title"
							/>
							<input
								type="text"
								value={it.focus}
								onChange={(e) =>
									setEducation((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, focus: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Focus / specialization"
							/>
						</div>
					))}
				</section>
			)}

			{projects.length > 0 && (
				<section className="space-y-3">
					<h3 className="font-medium text-sm">{t("projects")}</h3>
					{projects.map((it, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed 1:1 mapping with source.projects[i]
							key={`proj-${i}`}
							className="space-y-2 rounded-md border border-border bg-background p-3"
						>
							<input
								type="text"
								value={it.name}
								onChange={(e) =>
									setProjects((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, name: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Name"
							/>
							<input
								type="text"
								value={it.role}
								onChange={(e) =>
									setProjects((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, role: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Role"
							/>
							<textarea
								value={it.description}
								onChange={(e) =>
									setProjects((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, description: e.target.value } : c,
										),
									)
								}
								rows={3}
								className={inputCls}
								placeholder="Description"
							/>
						</div>
					))}
				</section>
			)}

			{publications.length > 0 && (
				<section className="space-y-3">
					<h3 className="font-medium text-sm">{t("publications")}</h3>
					{publications.map((it, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed 1:1 mapping with source.publications[i]
							key={`pub-${i}`}
							className="space-y-2 rounded-md border border-border bg-background p-3"
						>
							<input
								type="text"
								value={it.title}
								onChange={(e) =>
									setPublications((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, title: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Title"
							/>
							<input
								type="text"
								value={it.venue}
								onChange={(e) =>
									setPublications((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, venue: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Venue"
							/>
						</div>
					))}
				</section>
			)}

			{volunteering.length > 0 && (
				<section className="space-y-3">
					<h3 className="font-medium text-sm">{t("volunteering")}</h3>
					{volunteering.map((it, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed 1:1 mapping with source.volunteering[i]
							key={`vol-${i}`}
							className="space-y-2 rounded-md border border-border bg-background p-3"
						>
							<input
								type="text"
								value={it.organization}
								onChange={(e) =>
									setVolunteering((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, organization: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Organization"
							/>
							<input
								type="text"
								value={it.role}
								onChange={(e) =>
									setVolunteering((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, role: e.target.value } : c,
										),
									)
								}
								className={inputCls}
								placeholder="Role"
							/>
							<textarea
								value={it.description}
								onChange={(e) =>
									setVolunteering((cur) =>
										cur.map((c, j) =>
											j === i ? { ...c, description: e.target.value } : c,
										),
									)
								}
								rows={3}
								className={inputCls}
								placeholder="Description"
							/>
						</div>
					))}
				</section>
			)}

			{error && (
				<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-sm dark:text-rose-300">
					{error}
				</p>
			)}

			<div className="flex items-center gap-3">
				<Button type="submit" disabled={isSaving}>
					<Save className="h-4 w-4" strokeWidth={1.5} />
					{isSaving ? t("saving") : t("save")}
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
