"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

export function AuditFilters({ actions }: { actions: string[] }) {
	const t = useTranslations("Admin.filters");
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
			router.push(`/admin${next.size > 0 ? `?${next}` : ""}`);
		});
	}

	const action = params.get("action") ?? "any";
	const q = params.get("q") ?? "";
	const since = params.get("since") ?? "any";

	return (
		<div
			className={`mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3 ${
				isPending ? "opacity-60" : ""
			}`}
		>
			<label className="space-y-1">
				<span className="text-muted-foreground text-xs">{t("action")}</span>
				<select
					value={action}
					onChange={(e) => update("action", e.target.value)}
					className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
				>
					<option value="any">{t("any")}</option>
					{actions.map((a) => (
						<option key={a} value={a}>
							{a}
						</option>
					))}
				</select>
			</label>
			<label className="space-y-1">
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
				<span className="text-muted-foreground text-xs">{t("since")}</span>
				<select
					value={since}
					onChange={(e) => update("since", e.target.value)}
					className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
				>
					<option value="any">{t("anyTime")}</option>
					<option value="1h">{t("since1h")}</option>
					<option value="24h">{t("since24h")}</option>
					<option value="7d">{t("since7d")}</option>
					<option value="30d">{t("since30d")}</option>
				</select>
			</label>
		</div>
	);
}
