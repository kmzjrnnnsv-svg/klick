"use client";

import { Bookmark } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createSavedSearch } from "@/app/actions/saved-searches";

export function JobBrowseFilters() {
	const t = useTranslations("Browse.filters");
	const tSave = useTranslations("SavedSearches");
	const router = useRouter();
	const params = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [saveOpen, setSaveOpen] = useState(false);
	const [saveName, setSaveName] = useState("");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function saveCurrent() {
		setError(null);
		const name = saveName.trim() || params.get("q") || "Suche";
		startTransition(async () => {
			try {
				await createSavedSearch({
					name,
					criteria: {
						query: params.get("q") ?? undefined,
						remote:
							(params.get("remote") as "remote_only" | "no_remote" | "any") ??
							undefined,
						minSalary: params.get("minSalary")
							? Number(params.get("minSalary")) || undefined
							: undefined,
					},
				});
				setSaved(true);
				setSaveOpen(false);
				setSaveName("");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	function update(key: string, value: string | null) {
		const next = new URLSearchParams(params.toString());
		if (value && value !== "" && value !== "any") {
			next.set(key, value);
		} else {
			next.delete(key);
		}
		startTransition(() => {
			router.push(`/jobs/browse${next.size > 0 ? `?${next}` : ""}`);
		});
	}

	const q = params.get("q") ?? "";
	const remote = params.get("remote") ?? "any";
	const minSalary = params.get("minSalary") ?? "";

	return (
		<div
			className={`mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 ${
				isPending ? "opacity-60" : ""
			}`}
		>
			<label className="space-y-1 sm:col-span-2">
				<span className="text-muted-foreground text-xs">{t("query")}</span>
				<input
					type="search"
					value={q}
					onChange={(e) => update("q", e.target.value)}
					placeholder={t("queryPlaceholder")}
					className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
				/>
			</label>
			<label className="space-y-1">
				<span className="text-muted-foreground text-xs">{t("remote")}</span>
				<select
					value={remote}
					onChange={(e) => update("remote", e.target.value)}
					className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
				>
					<option value="any">{t("remoteAny")}</option>
					<option value="remote_only">{t("remoteOnly")}</option>
					<option value="no_remote">{t("noRemote")}</option>
				</select>
			</label>
			<label className="space-y-1">
				<span className="text-muted-foreground text-xs">{t("minSalary")}</span>
				<input
					type="number"
					inputMode="numeric"
					value={minSalary}
					onChange={(e) => update("minSalary", e.target.value)}
					placeholder="z. B. 70000"
					min={0}
					className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
				/>
			</label>
			<div className="sm:col-span-3">
				{!saveOpen && !saved && (
					<button
						type="button"
						onClick={() => setSaveOpen(true)}
						className="lv-eyebrow inline-flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-[0.6rem] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
					>
						<Bookmark className="h-3 w-3" strokeWidth={1.5} />
						{tSave("saveCurrentSearch")}
					</button>
				)}
				{saved && (
					<span className="lv-eyebrow text-[0.6rem] text-emerald-700 dark:text-emerald-300">
						{tSave("saved")}
					</span>
				)}
				{saveOpen && (
					<div className="flex flex-wrap items-center gap-2">
						<input
							type="text"
							value={saveName}
							onChange={(e) => setSaveName(e.target.value)}
							placeholder={tSave("namePlaceholder")}
							className="h-9 w-48 rounded-md border border-border bg-background px-2 text-sm"
						/>
						<button
							type="button"
							onClick={saveCurrent}
							disabled={isPending}
							className="lv-eyebrow rounded-sm border border-foreground/40 px-3 py-1.5 text-[0.6rem] text-foreground hover:bg-foreground hover:text-background"
						>
							{tSave("save")}
						</button>
						<button
							type="button"
							onClick={() => setSaveOpen(false)}
							className="lv-eyebrow text-[0.6rem] text-muted-foreground hover:text-foreground"
						>
							{tSave("cancel")}
						</button>
						{error && (
							<span className="text-rose-700 text-xs dark:text-rose-300">
								{error}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
