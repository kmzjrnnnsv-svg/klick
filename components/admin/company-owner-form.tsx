"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { adminSetCompanyOwner } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CompanyOwnerForm({ employerId }: { employerId: string }) {
	const t = useTranslations("AdminCompanyOwner");
	const [email, setEmail] = useState("");
	const [isPending, startTransition] = useTransition();
	const [feedback, setFeedback] = useState<null | {
		userId: string | null;
		sentInvite: boolean;
	}>(null);
	const [error, setError] = useState<string | null>(null);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setFeedback(null);
		startTransition(async () => {
			const r = await adminSetCompanyOwner({ employerId, email });
			if (!r.ok) {
				setError(r.error);
				return;
			}
			setFeedback({ userId: r.userId, sentInvite: r.sentInvite });
			setEmail("");
		});
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-3">
			<label className="block space-y-1">
				<span className="text-muted-foreground text-xs">{t("emailLabel")}</span>
				<Input
					type="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="owner@firma.de"
				/>
			</label>
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("howItWorks")}
			</p>
			<div className="flex gap-2">
				<Button type="submit" disabled={isPending}>
					{isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
					) : null}
					{t("setOwner")}
				</Button>
			</div>
			{feedback && (
				<p className="flex items-start gap-2 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-800 text-xs leading-relaxed dark:text-emerald-200">
					<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
					<span>
						{feedback.userId
							? t("promoted")
							: feedback.sentInvite
								? t("invited")
								: t("done")}
					</span>
				</p>
			)}
			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</form>
	);
}
