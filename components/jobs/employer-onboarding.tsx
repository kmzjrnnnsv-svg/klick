"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ensureEmployer } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EmployerOnboarding() {
	const t = useTranslations("Jobs");
	const [companyName, setCompanyName] = useState("");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleSubmit(formData: FormData) {
		const name = String(formData.get("companyName") ?? "").trim();
		if (!name) return;
		setError(null);
		startTransition(async () => {
			try {
				await ensureEmployer(name);
				window.location.reload();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<form
			action={handleSubmit}
			className="rounded-lg border border-border bg-background p-6 sm:p-8"
		>
			<h2 className="font-medium text-base">{t("onboardingTitle")}</h2>
			<p className="mt-1 mb-5 text-muted-foreground text-sm leading-relaxed">
				{t("onboardingHint")}
			</p>
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("companyName")}
				</span>
				<Input
					name="companyName"
					value={companyName}
					onChange={(e) => setCompanyName(e.target.value)}
					placeholder="Acme GmbH"
					required
					autoFocus
				/>
			</label>
			<div className="mt-5">
				<Button type="submit" disabled={isPending || !companyName.trim()}>
					{isPending ? t("creating") : t("create")}
				</Button>
			</div>
			{error && (
				<p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</form>
	);
}
