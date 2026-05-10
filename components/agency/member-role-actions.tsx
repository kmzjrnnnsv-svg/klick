"use client";

import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { demoteMember, promoteMember } from "@/app/actions/agency";

export function MemberRoleActions({
	memberId,
	role,
	canPromote,
}: {
	memberId: string;
	role: "owner" | "recruiter" | "viewer";
	canPromote: boolean;
}) {
	const t = useTranslations("Agency.roleActions");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function promote() {
		setError(null);
		startTransition(async () => {
			const r = await promoteMember(memberId);
			if (!r.ok) setError(r.error);
		});
	}
	function demote() {
		setError(null);
		startTransition(async () => {
			const r = await demoteMember(memberId);
			if (!r.ok) setError(r.error);
		});
	}

	return (
		<div className="flex items-center gap-1">
			{role !== "owner" && canPromote && (
				<button
					type="button"
					onClick={promote}
					disabled={isPending}
					title={t("promote")}
					className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary text-xs hover:bg-primary/10 disabled:opacity-50"
				>
					{isPending ? (
						<Loader2 className="inline h-3 w-3 animate-spin" strokeWidth={1.5} />
					) : (
						<ArrowUp className="inline h-3 w-3" strokeWidth={1.5} />
					)}{" "}
					{t("promote")}
				</button>
			)}
			{role === "owner" && (
				<button
					type="button"
					onClick={demote}
					disabled={isPending}
					title={t("demote")}
					className="rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground text-xs hover:bg-muted disabled:opacity-50"
				>
					<ArrowDown className="inline h-3 w-3" strokeWidth={1.5} /> {t("demote")}
				</button>
			)}
			{error && (
				<span className="text-rose-700 text-xs dark:text-rose-300">
					{error}
				</span>
			)}
		</div>
	);
}
