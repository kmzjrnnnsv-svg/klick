"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

export function MatchFilters() {
	const t = useTranslations("Matches.filters");
	const router = useRouter();
	const params = useSearchParams();
	const [isPending, startTransition] = useTransition();

	function update(key: string, value: string | null) {
		const next = new URLSearchParams(params.toString());
		if (value && value !== "" && value !== "any") {
			next.set(key, value);
		} else {
			next.delete(key);
		}
		startTransition(() => {
			router.push(`/matches${next.size > 0 ? `?${next}` : ""}`);
		});
	}

	const remote = params.get("remote") ?? "any";
	const minSalary = params.get("minSalary") ?? "";
	const maxCommute = params.get("maxCommuteMinutes") ?? "";

	return (
		<div
			className={`mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 ${isPending ? "opacity-60" : ""}`}
		>
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
			<label className="space-y-1">
				<span className="text-muted-foreground text-xs">{t("maxCommute")}</span>
				<input
					type="number"
					inputMode="numeric"
					value={maxCommute}
					onChange={(e) => update("maxCommuteMinutes", e.target.value)}
					placeholder={t("maxCommutePlaceholder")}
					min={0}
					max={240}
					className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
				/>
			</label>
		</div>
	);
}
