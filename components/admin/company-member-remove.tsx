"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { adminRemoveCompanyMember } from "@/app/actions/admin";

export function CompanyMemberRemove({ memberId }: { memberId: string }) {
	const t = useTranslations("AdminCompanyOwner");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleRemove() {
		if (!window.confirm(t("removeConfirm"))) return;
		setError(null);
		startTransition(async () => {
			const r = await adminRemoveCompanyMember(memberId);
			if (!r.ok) setError(r.error);
		});
	}

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={handleRemove}
				disabled={isPending}
				title={t("removeMember")}
				className="text-muted-foreground hover:text-rose-600 disabled:opacity-50"
			>
				<Trash2 className="h-4 w-4" strokeWidth={1.5} />
			</button>
			{error && (
				<span className="text-rose-700 text-xs dark:text-rose-300">
					{error}
				</span>
			)}
		</div>
	);
}
