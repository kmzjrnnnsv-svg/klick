"use client";

import { Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { duplicateJob } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";

export function DuplicateJobButton({ jobId }: { jobId: string }) {
	const t = useTranslations("Jobs.duplicate");
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handle() {
		if (!window.confirm(t("confirm"))) return;
		setError(null);
		startTransition(async () => {
			const r = await duplicateJob(jobId);
			if (!r.ok) {
				setError(r.error);
				return;
			}
			router.push(`/jobs/${r.jobId}`);
		});
	}

	return (
		<div className="inline-flex items-center gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={handle}
				disabled={isPending}
			>
				{isPending ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
				) : (
					<Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
				)}
				{t("label")}
			</Button>
			{error && (
				<span className="text-rose-700 text-xs dark:text-rose-300">
					{error}
				</span>
			)}
		</div>
	);
}
