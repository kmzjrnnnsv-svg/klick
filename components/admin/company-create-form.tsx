"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createCompanyAsAdmin } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CompanyCreateForm({
	tenants,
}: {
	tenants: { id: string; slug: string; name: string }[];
}) {
	const t = useTranslations("AdminCompanies");
	const router = useRouter();
	const [companyName, setCompanyName] = useState("");
	const [ownerEmail, setOwnerEmail] = useState("");
	const [ownerName, setOwnerName] = useState("");
	const [website, setWebsite] = useState("");
	const [description, setDescription] = useState("");
	const [isAgency, setIsAgency] = useState(false);
	const [tenantSlug, setTenantSlug] = useState(tenants[0]?.slug ?? "default");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		startTransition(async () => {
			const res = await createCompanyAsAdmin({
				companyName,
				ownerEmail,
				ownerName: ownerName || undefined,
				website: website || undefined,
				description: description || undefined,
				isAgency,
				tenantSlug,
			});
			if (!res.ok) setError(res.error);
			else router.push(`/admin/companies/${res.employerId}`);
		});
	}

	return (
		<div className="space-y-4 rounded-sm border border-border bg-background p-4">
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("companyNameLabel")}
				</span>
				<Input
					value={companyName}
					onChange={(e) => setCompanyName(e.target.value)}
					required
					autoFocus
				/>
			</label>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("ownerEmailLabel")}
					</span>
					<Input
						type="email"
						value={ownerEmail}
						onChange={(e) => setOwnerEmail(e.target.value)}
						required
					/>
				</label>
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("ownerNameLabel")}
					</span>
					<Input
						value={ownerName}
						onChange={(e) => setOwnerName(e.target.value)}
					/>
				</label>
			</div>
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">
					{t("websiteLabel")}
				</span>
				<Input
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
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					rows={4}
					maxLength={2000}
					className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
				/>
			</label>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("tenantLabel")}
					</span>
					<select
						value={tenantSlug}
						onChange={(e) => setTenantSlug(e.target.value)}
						className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
					>
						{tenants.map((tt) => (
							<option key={tt.id} value={tt.slug}>
								{tt.name} ({tt.slug})
							</option>
						))}
					</select>
				</label>
				<label className="flex cursor-pointer items-end gap-2 pb-2 text-xs">
					<input
						type="checkbox"
						checked={isAgency}
						onChange={(e) => setIsAgency(e.target.checked)}
					/>
					<span>{t("isAgencyLabel")}</span>
				</label>
			</div>
			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					onClick={submit}
					disabled={isPending || !companyName || !ownerEmail}
				>
					{isPending ? t("saving") : t("createCompany")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() => router.push("/admin/companies")}
				>
					{t("cancel")}
				</Button>
			</div>
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("createNote")}
			</p>
		</div>
	);
}
