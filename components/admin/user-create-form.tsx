"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createUserAsAdmin } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UserCreateForm({
	tenants,
}: {
	tenants: { id: string; slug: string; name: string }[];
}) {
	const t = useTranslations("AdminUsers");
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<"candidate" | "employer" | "admin">(
		"candidate",
	);
	const [locale, setLocale] = useState<"de" | "en">("de");
	const [tenantSlug, setTenantSlug] = useState(tenants[0]?.slug ?? "default");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		startTransition(async () => {
			const res = await createUserAsAdmin({
				email,
				role,
				name: name || undefined,
				locale,
				tenantSlug,
			});
			if (!res.ok) setError(res.error);
			else router.push("/admin/users");
		});
	}

	return (
		<div className="space-y-4 rounded-sm border border-border bg-background p-4">
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">{t("emailLabel")}</span>
				<Input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					autoFocus
				/>
			</label>
			<label className="block space-y-1.5">
				<span className="text-muted-foreground text-xs">{t("nameLabel")}</span>
				<Input value={name} onChange={(e) => setName(e.target.value)} />
			</label>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("roleLabel")}
					</span>
					<select
						value={role}
						onChange={(e) =>
							setRole(e.target.value as "candidate" | "employer" | "admin")
						}
						className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
					>
						<option value="candidate">{t("role.candidate")}</option>
						<option value="employer">{t("role.employer")}</option>
						<option value="admin">{t("role.admin")}</option>
					</select>
				</label>
				<label className="block space-y-1.5">
					<span className="text-muted-foreground text-xs">
						{t("localeLabel")}
					</span>
					<select
						value={locale}
						onChange={(e) => setLocale(e.target.value as "de" | "en")}
						className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
					>
						<option value="de">Deutsch</option>
						<option value="en">English</option>
					</select>
				</label>
			</div>
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
			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
			<div className="flex gap-2">
				<Button onClick={submit} disabled={isPending || !email}>
					{isPending ? t("saving") : t("createUser")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() => router.push("/admin/users")}
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
