"use client";

import { CheckCircle2, Lock, Trash2, Unlock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	blockEmployer,
	deleteEmployer,
	unblockEmployer,
} from "@/app/actions/admin";

export function EmployerActions({
	employerId,
	isBlocked,
}: {
	employerId: string;
	isBlocked: boolean;
}) {
	const t = useTranslations("AdminCompanies.actions");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<null | "blocked" | "unblocked" | "deleted">(
		null,
	);

	function handleBlock() {
		const reason = window.prompt(t("blockReason")) ?? "";
		setError(null);
		startTransition(async () => {
			const r = await blockEmployer({ employerId, reason });
			if (!r.ok) setError(r.error);
			else setDone("blocked");
		});
	}
	function handleUnblock() {
		setError(null);
		startTransition(async () => {
			const r = await unblockEmployer(employerId);
			if (!r.ok) setError(r.error);
			else setDone("unblocked");
		});
	}
	function handleDelete() {
		if (!window.confirm(t("deleteConfirm"))) return;
		setError(null);
		startTransition(async () => {
			const r = await deleteEmployer(employerId);
			if (!r.ok) setError(r.error);
			else setDone("deleted");
		});
	}

	if (done) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs dark:text-emerald-300">
				<CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
				{t(done)}
			</span>
		);
	}

	return (
		<div className="flex items-center gap-1">
			{isBlocked ? (
				<button
					type="button"
					onClick={handleUnblock}
					disabled={isPending}
					className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
				>
					<Unlock className="inline h-3 w-3" strokeWidth={1.5} /> {t("unblock")}
				</button>
			) : (
				<button
					type="button"
					onClick={handleBlock}
					disabled={isPending}
					className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
				>
					<Lock className="inline h-3 w-3" strokeWidth={1.5} /> {t("block")}
				</button>
			)}
			<button
				type="button"
				onClick={handleDelete}
				disabled={isPending}
				className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-700 text-xs hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300"
			>
				<Trash2 className="inline h-3 w-3" strokeWidth={1.5} /> {t("delete")}
			</button>
			{error && (
				<span className="text-rose-700 text-xs dark:text-rose-300">
					{error}
				</span>
			)}
		</div>
	);
}
