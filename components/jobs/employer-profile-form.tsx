"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateOwnEmployer } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EmployerProfileForm({
	initial,
}: {
	initial: {
		companyName: string;
		website: string | null;
		description: string | null;
		isAgency: boolean;
	};
}) {
	const t = useTranslations("EmployerProfile");
	const router = useRouter();
	const [companyName, setCompanyName] = useState(initial.companyName);
	const [website, setWebsite] = useState(initial.website ?? "");
	const [description, setDescription] = useState(initial.description ?? "");
	const [isAgency, setIsAgency] = useState(initial.isAgency);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [isPending, startTransition] = useTransition();

	function submit(formData: FormData) {
		setError(null);
		setSaved(false);
		startTransition(async () => {
			const res = await updateOwnEmployer(formData);
			if (!res.ok) setError(res.error ?? "fehlgeschlagen");
			else {
				setSaved(true);
				router.refresh();
			}
		});
	}

	return (
		<form
			action={submit}
			className="space-y-4 rounded-sm border border-border bg-background p-4 sm:p-6"
		>
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("companyNameLabel")}
				</span>
				<Input
					name="companyName"
					value={companyName}
					onChange={(e) => setCompanyName(e.target.value)}
					required
				/>
			</label>
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("websiteLabel")}
				</span>
				<Input
					name="website"
					value={website}
					onChange={(e) => setWebsite(e.target.value)}
					placeholder="https://…"
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
					rows={5}
					maxLength={2000}
					placeholder={t("descriptionPlaceholder")}
					className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
				/>
				<p className="text-[11px] text-muted-foreground">
					{t("descriptionHint")}
				</p>
			</label>
			<label className="flex cursor-pointer items-center gap-2 text-sm">
				<input
					type="checkbox"
					name="isAgency"
					checked={isAgency}
					onChange={(e) => setIsAgency(e.target.checked)}
				/>
				<span>{t("isAgencyLabel")}</span>
			</label>
			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
			{saved && (
				<p className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-700 text-xs dark:text-emerald-300">
					{t("saved")}
				</p>
			)}
			<Button type="submit" disabled={isPending}>
				{isPending ? t("saving") : t("save")}
			</Button>
		</form>
	);
}
