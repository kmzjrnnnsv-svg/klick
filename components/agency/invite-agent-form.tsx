"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { inviteAgent } from "@/app/actions/agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InviteAgentForm() {
	const t = useTranslations("Agency");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"owner" | "recruiter" | "viewer">(
		"recruiter",
	);
	const [error, setError] = useState<string | null>(null);
	const [sentEmail, setSentEmail] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		startTransition(async () => {
			try {
				await inviteAgent({ email, role });
				setSentEmail(email);
				setEmail("");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<div className="space-y-3">
			<div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
				<Input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder={t("emailPlaceholder")}
				/>
				<select
					value={role}
					onChange={(e) =>
						setRole(e.target.value as "owner" | "recruiter" | "viewer")
					}
					className="h-11 rounded-sm border border-border bg-background px-2 text-sm"
				>
					<option value="recruiter">{t("role.recruiter")}</option>
					<option value="owner">{t("role.owner")}</option>
					<option value="viewer">{t("role.viewer")}</option>
				</select>
				<Button onClick={submit} disabled={isPending || !email}>
					{isPending ? t("sending") : t("invite")}
				</Button>
			</div>
			{sentEmail && (
				<p className="text-emerald-700 text-xs dark:text-emerald-300">
					{t("sentTo", { email: sentEmail })}
				</p>
			)}
			{error && (
				<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
			)}
		</div>
	);
}
