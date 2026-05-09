"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateCompanyAsAdmin } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CompanyEditForm({
	employerId,
	initial,
}: {
	employerId: string;
	initial: {
		companyName: string;
		website: string | null;
		description: string | null;
		isAgency: boolean;
	};
}) {
	const t = useTranslations("AdminCompanies");
	const router = useRouter();
	const [companyName, setCompanyName] = useState(initial.companyName);
	const [website, setWebsite] = useState(initial.website ?? "");
	const [description, setDescription] = useState(initial.description ?? "");
	const [isAgency, setIsAgency] = useState(initial.isAgency);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		startTransition(async () => {
			const res = await updateCompanyAsAdmin({
				employerId,
				companyName,
				website,
				description,
				isAgency,
			});
			if (!res.ok) setError(res.error ?? "fehlgeschlagen");
			else router.refresh();
		});
	}

	return (
		<div className="space-y-3">
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("companyNameLabel")}
				</span>
				<Input
					value={companyName}
					onChange={(e) => setCompanyName(e.target.value)}
				/>
			</label>
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("websiteLabel")}
				</span>
				<Input value={website} onChange={(e) => setWebsite(e.target.value)} />
			</label>
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("descriptionLabel")}
				</span>
				<textarea
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					rows={4}
					maxLength={2000}
					className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
				/>
			</label>
			<label className="flex cursor-pointer items-center gap-2 text-xs">
				<input
					type="checkbox"
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
			<Button onClick={submit} disabled={isPending} size="sm">
				{isPending ? t("saving") : t("save")}
			</Button>
		</div>
	);
}
