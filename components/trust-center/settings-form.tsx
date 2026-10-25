"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { saveTrustSettings } from "@/app/actions/trust-center";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type {
	TrustCenterSettings,
	TrustDocumentEntry,
	TrustFrameworkEntry,
} from "@/db/schema";
import { type Classification, TRUST_FRAMEWORK_STATUS } from "@/db/schema/enums";
import { documentAccessAllowed } from "@/lib/trust/rules";

type DocOption = {
	id: string;
	docNumber: string;
	title: string;
	classification: Classification;
	status: string;
};

// Entwurf des Trust Centers. Speichern ändert nur den Entwurf; öffentlich
// wird er erst mit „Veröffentlichen“.
export function TrustSettingsForm({
	slug: initialSlug,
	settings: initial,
	canEdit,
	frameworks,
	documents,
}: {
	slug: string;
	settings: TrustCenterSettings;
	canEdit: boolean;
	frameworks: { slug: string; name: string }[];
	documents: DocOption[];
}) {
	const t = useTranslations("TrustCenter");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [slug, setSlug] = useState(initialSlug);
	const [s, setS] = useState<TrustCenterSettings>(initial);
	const [errors, setErrors] = useState<Record<string, string>>({});
	// Ungespeicherte Änderungen: Warnung beim Verlassen der Seite.
	const [dirty, setDirty] = useState(false);
	useEffect(() => {
		if (!dirty) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
	const set = <K extends keyof TrustCenterSettings>(
		key: K,
		value: TrustCenterSettings[K],
	) => {
		setDirty(true);
		setS((prev) => ({ ...prev, [key]: value }));
	};

	const fwName = new Map(frameworks.map((f) => [f.slug, f.name]));
	const docById = new Map(documents.map((d) => [d.id, d]));
	const addableFrameworks = frameworks.filter(
		(f) => !s.frameworks.some((x) => x.slug === f.slug),
	);
	const addableDocs = documents.filter(
		(d) =>
			d.classification !== "secret" &&
			!s.documents.some((x) => x.documentId === d.id),
	);

	const updateFramework = (i: number, patch: Partial<TrustFrameworkEntry>) =>
		set(
			"frameworks",
			s.frameworks.map((f, j) => (j === i ? { ...f, ...patch } : f)),
		);
	const updateDocument = (i: number, patch: Partial<TrustDocumentEntry>) =>
		set(
			"documents",
			s.documents.map((d, j) => (j === i ? { ...d, ...patch } : d)),
		);

	function save() {
		setErrors({});
		start(async () => {
			const res = await saveTrustSettings({ slug, ...s });
			if (res.ok) {
				setDirty(false);
				toast.success(t("saved"));
				router.refresh();
				return;
			}
			if (res.error === "slug_taken") {
				setErrors({ slug: t("errorSlugTaken") });
				document.getElementById("tc-slug")?.focus();
				return;
			}
			if (res.error === "document_access") {
				toast.error(
					t("errorDocumentAccess", {
						ref: res.fieldErrors?.documents?.[0] ?? "",
					}),
				);
				return;
			}
			const fe = res.fieldErrors ?? {};
			const next: Record<string, string> = {};
			for (const [k, v] of Object.entries(fe)) if (v[0]) next[k] = v[0];
			setErrors(next);
			const first = Object.keys(next)[0];
			if (first) document.getElementById(`tc-${first}`)?.focus();
			toast.error(
				Object.keys(next).length > 0
					? t("errorCheckFields")
					: errorText(tc, res),
			);
		});
	}

	const fieldError = (key: string) =>
		errors[key] ? (
			<p className="text-destructive text-subhead" id={`tc-${key}-error`}>
				{errors[key]}
			</p>
		) : null;
	const a11y = (key: string) =>
		errors[key]
			? { "aria-invalid": true, "aria-describedby": `tc-${key}-error` }
			: {};

	return (
		<form
			className="flex flex-col gap-8"
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<fieldset disabled={!canEdit || pending} className="contents">
				<section className="flex flex-col gap-4">
					<h2 className="font-semibold text-title-3">{t("sectionPage")}</h2>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tc-slug">{t("fieldSlug")}</Label>
						<div className="flex items-center gap-2">
							<span className="whitespace-nowrap text-muted-foreground text-subhead">
								/vertrauen/
							</span>
							<Input
								id="tc-slug"
								value={slug}
								onChange={(e) => {
									setDirty(true);
									setSlug(e.target.value.toLowerCase());
								}}
								autoComplete="off"
								spellCheck={false}
								{...a11y("slug")}
							/>
						</div>
						<p className="text-muted-foreground text-footnote">
							{t("slugHint")}
						</p>
						{fieldError("slug")}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tc-title">{t("fieldTitle")}</Label>
						<Input
							id="tc-title"
							autoComplete="off"
							value={s.title}
							onChange={(e) => set("title", e.target.value)}
							{...a11y("title")}
						/>
						{fieldError("title")}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tc-intro">{t("fieldIntro")}</Label>
						<Textarea
							id="tc-intro"
							rows={4}
							value={s.intro}
							onChange={(e) => set("intro", e.target.value)}
							{...a11y("intro")}
						/>
						{fieldError("intro")}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tc-contactEmail">{t("fieldContact")}</Label>
						<Input
							id="tc-contactEmail"
							autoComplete="off"
							type="email"
							inputMode="email"
							spellCheck={false}
							value={s.contactEmail ?? ""}
							onChange={(e) => set("contactEmail", e.target.value || null)}
							{...a11y("contactEmail")}
						/>
						{fieldError("contactEmail")}
					</div>
					<div className="flex flex-col gap-2">
						{(
							[
								["showCoverage", t("toggleCoverage")],
								["showControls", t("toggleControls")],
								["showSubprocessors", t("toggleSubprocessors")],
								["indexable", t("toggleIndexable")],
							] as const
						).map(([key, label]) => (
							<label key={key} className="flex items-center gap-2 text-subhead">
								<Checkbox
									checked={s[key]}
									onCheckedChange={(v) => set(key, v === true)}
								/>
								{label}
							</label>
						))}
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-title-3">
						{t("sectionFrameworks")}
					</h2>
					<p className="text-muted-foreground text-subhead">
						{t("frameworksHint")}
					</p>
					{s.frameworks.length > 0 && (
						<ul className="flex flex-col gap-3">
							{s.frameworks.map((f, i) => (
								<li
									key={f.slug}
									className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_auto] sm:items-center"
								>
									<p className="font-medium text-subhead">
										{fwName.get(f.slug) ?? f.slug}
									</p>
									<Select
										value={f.status}
										onValueChange={(v) =>
											updateFramework(i, {
												status: v as TrustFrameworkEntry["status"],
											})
										}
									>
										<SelectTrigger aria-label={t("fieldStatus")}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{TRUST_FRAMEWORK_STATUS.map((st) => (
												<SelectItem key={st} value={st}>
													{t(`status_${st}`)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Input
										type="date"
										aria-label={t("fieldValidUntil")}
										value={f.validUntil ?? ""}
										onChange={(e) =>
											updateFramework(i, { validUntil: e.target.value || null })
										}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t("remove")}
										onClick={() =>
											set(
												"frameworks",
												s.frameworks.filter((_, j) => j !== i),
											)
										}
									>
										<X className="size-4" aria-hidden="true" />
									</Button>
									<Input
										className="sm:col-span-4"
										aria-label={t("fieldNote")}
										placeholder={t("notePlaceholder")}
										value={f.note ?? ""}
										onChange={(e) =>
											updateFramework(i, { note: e.target.value || null })
										}
									/>
								</li>
							))}
						</ul>
					)}
					{addableFrameworks.length > 0 && (
						<Select
							value=""
							onValueChange={(v) =>
								set("frameworks", [
									...s.frameworks,
									{
										slug: v,
										status: "in_progress",
										validUntil: null,
										note: null,
									},
								])
							}
						>
							<SelectTrigger className="sm:w-80" aria-label={t("addFramework")}>
								<Plus className="size-4" aria-hidden="true" />
								<SelectValue placeholder={t("addFramework")} />
							</SelectTrigger>
							<SelectContent>
								{addableFrameworks.map((f) => (
									<SelectItem key={f.slug} value={f.slug}>
										{f.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					{fieldError("frameworks")}
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-title-3">
						{t("sectionDocuments")}
					</h2>
					<p className="text-muted-foreground text-subhead">
						{t("documentsHint")}
					</p>
					{s.documents.length > 0 && (
						<ul className="flex flex-col gap-2">
							{s.documents.map((entry, i) => {
								const d = docById.get(entry.documentId);
								return (
									<li
										key={entry.documentId}
										className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-center"
									>
										<div className="min-w-0">
											<p className="truncate font-medium text-subhead">
												{d ? d.title : t("documentMissing")}
											</p>
											{d && (
												<p className="text-muted-foreground text-footnote">
													<span className="whitespace-nowrap font-mono">
														{d.docNumber}
													</span>{" "}
													· {t(`class_${d.classification}`)}
													{d.status !== "published" &&
														` · ${t("notYetPublished")}`}
												</p>
											)}
										</div>
										<Select
											value={entry.access}
											onValueChange={(v) =>
												updateDocument(i, {
													access: v as TrustDocumentEntry["access"],
												})
											}
										>
											<SelectTrigger aria-label={t("fieldAccess")}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{(["public", "nda"] as const).map((a) => (
													<SelectItem
														key={a}
														value={a}
														disabled={
															d
																? !documentAccessAllowed(d.classification, a)
																: false
														}
													>
														{t(`access_${a}`)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={t("remove")}
											onClick={() =>
												set(
													"documents",
													s.documents.filter((_, j) => j !== i),
												)
											}
										>
											<X className="size-4" aria-hidden="true" />
										</Button>
									</li>
								);
							})}
						</ul>
					)}
					{addableDocs.length > 0 ? (
						<Select
							value=""
							onValueChange={(v) => {
								const d = docById.get(v);
								set("documents", [
									...s.documents,
									{
										documentId: v,
										access:
											d && !documentAccessAllowed(d.classification, "public")
												? "nda"
												: "public",
									},
								]);
							}}
						>
							<SelectTrigger className="sm:w-80" aria-label={t("addDocument")}>
								<Plus className="size-4" aria-hidden="true" />
								<SelectValue placeholder={t("addDocument")} />
							</SelectTrigger>
							<SelectContent>
								{addableDocs.map((d) => (
									<SelectItem key={d.id} value={d.id}>
										{d.docNumber} · {d.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						documents.length === 0 && (
							<p className="text-muted-foreground text-subhead">
								{t("noDocuments")}
							</p>
						)
					)}
					{fieldError("documents")}
				</section>

				<section className="flex flex-col gap-1.5">
					<h2 className="font-semibold text-title-3">{t("sectionNda")}</h2>
					<Label htmlFor="tc-ndaText" className="sr-only">
						{t("sectionNda")}
					</Label>
					<Textarea
						id="tc-ndaText"
						rows={6}
						value={s.ndaText}
						onChange={(e) => set("ndaText", e.target.value)}
						{...a11y("ndaText")}
					/>
					<p className="text-muted-foreground text-footnote">{t("ndaHint")}</p>
					{fieldError("ndaText")}
				</section>

				{canEdit && (
					<div>
						<Button type="submit" disabled={pending}>
							{pending ? t("saving") : t("save")}
						</Button>
					</div>
				)}
			</fieldset>
		</form>
	);
}
