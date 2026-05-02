"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { reportOutcome } from "@/app/actions/outcomes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OutcomePrompt({
	jobId,
	candidateUserId,
	actor,
	existing,
}: {
	jobId: string;
	candidateUserId: string;
	actor: "candidate" | "employer";
	existing: {
		kind: string;
		finalSalary: number | null;
		notes: string | null;
	} | null;
}) {
	const t = useTranslations("Outcome");
	const [open, setOpen] = useState(!existing);
	const [done, setDone] = useState(!!existing);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit(formData: FormData) {
		setError(null);
		const kind = formData.get("kind")?.toString();
		if (!kind) return;
		const salaryRaw = formData.get("finalSalary")?.toString() ?? "";
		const salary = salaryRaw ? Number(salaryRaw) : undefined;
		startTransition(async () => {
			try {
				await reportOutcome({
					jobId,
					candidateUserId,
					kind: kind as
						| "hired"
						| "declined_by_candidate"
						| "declined_by_employer"
						| "in_negotiation"
						| "no_response",
					notes: formData.get("notes")?.toString() || undefined,
					finalSalary: Number.isFinite(salary) ? salary : undefined,
				});
				setDone(true);
				setOpen(false);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	if (done && !open) {
		return (
			<div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-3">
				<p className="text-emerald-700 text-xs dark:text-emerald-300">
					{t("thanksRecorded")}
				</p>
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="lv-eyebrow mt-1 text-[0.55rem] text-muted-foreground hover:text-foreground"
				>
					{t("editOutcome")}
				</button>
			</div>
		);
	}

	return (
		<div className="rounded-sm border border-border bg-muted/30 p-4">
			<p className="lv-eyebrow text-[0.6rem] text-primary">{t("eyebrow")}</p>
			<p className="mt-2 mb-3 text-muted-foreground text-xs leading-relaxed">
				{actor === "employer" ? t("hintEmployer") : t("hintCandidate")}
			</p>
			<form action={submit} className="space-y-3">
				<select
					name="kind"
					required
					defaultValue={existing?.kind ?? ""}
					className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm"
				>
					<option value="">{t("selectKind")}</option>
					<option value="hired">{t("kind.hired")}</option>
					<option value="declined_by_candidate">
						{t("kind.declined_by_candidate")}
					</option>
					<option value="declined_by_employer">
						{t("kind.declined_by_employer")}
					</option>
					<option value="in_negotiation">{t("kind.in_negotiation")}</option>
					<option value="no_response">{t("kind.no_response")}</option>
				</select>
				<Input
					name="finalSalary"
					type="number"
					min={0}
					step={1000}
					defaultValue={existing?.finalSalary?.toString() ?? ""}
					placeholder={t("finalSalaryPlaceholder")}
				/>
				<Input
					name="notes"
					defaultValue={existing?.notes ?? ""}
					placeholder={t("notesPlaceholder")}
				/>
				{error && (
					<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
				)}
				<Button type="submit" disabled={isPending} size="sm" className="w-full">
					{isPending ? t("saving") : t("save")}
				</Button>
			</form>
		</div>
	);
}
