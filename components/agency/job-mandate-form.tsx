"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteJobMandate, setJobMandate } from "@/app/actions/agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JobMandate } from "@/db/schema";

export function JobMandateForm({
	jobId,
	initial,
}: {
	jobId: string;
	initial: JobMandate | null;
}) {
	const t = useTranslations("Mandate");
	const [open, setOpen] = useState(!!initial);
	const [clientName, setClientName] = useState(initial?.clientName ?? "");
	const [clientWebsite, setClientWebsite] = useState(
		initial?.clientWebsite ?? "",
	);
	const [clientIndustry, setClientIndustry] = useState(
		initial?.clientIndustry ?? "",
	);
	const [clientNote, setClientNote] = useState(initial?.clientNote ?? "");
	const [clientVisibility, setClientVisibility] = useState<
		"private" | "anonymous" | "named"
	>(initial?.clientVisibility ?? "anonymous");
	const [commissionPct, setCommissionPct] = useState(
		initial?.commissionPct?.toString() ?? "",
	);
	const [error, setError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<Date | null>(
		initial ? initial.updatedAt : null,
	);
	const [isPending, startTransition] = useTransition();

	function save() {
		setError(null);
		if (!clientName.trim()) {
			setError(t("nameRequired"));
			return;
		}
		startTransition(async () => {
			try {
				await setJobMandate({
					jobId,
					clientName,
					clientWebsite: clientWebsite || undefined,
					clientIndustry: clientIndustry || undefined,
					clientNote: clientNote || undefined,
					clientVisibility,
					commissionPct: commissionPct
						? Math.max(0, Math.min(100, Number(commissionPct)))
						: undefined,
				});
				setSavedAt(new Date());
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	function remove() {
		if (!confirm(t("confirmDelete"))) return;
		startTransition(async () => {
			await deleteJobMandate(jobId);
			setClientName("");
			setClientWebsite("");
			setClientIndustry("");
			setClientNote("");
			setClientVisibility("anonymous");
			setCommissionPct("");
			setSavedAt(null);
			setOpen(false);
		});
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="lv-eyebrow inline-flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-[0.6rem] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
			>
				{t("openMandate")}
			</button>
		);
	}

	return (
		<div className="space-y-3 rounded-md border border-border bg-background p-4">
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("hint")}
			</p>
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="space-y-1">
					<span className="text-muted-foreground text-xs">
						{t("clientName")}
					</span>
					<Input
						value={clientName}
						onChange={(e) => setClientName(e.target.value)}
						placeholder={t("clientNamePlaceholder")}
					/>
				</label>
				<label className="space-y-1">
					<span className="text-muted-foreground text-xs">
						{t("clientWebsite")}
					</span>
					<Input
						value={clientWebsite}
						onChange={(e) => setClientWebsite(e.target.value)}
						placeholder="https://"
					/>
				</label>
				<label className="space-y-1">
					<span className="text-muted-foreground text-xs">
						{t("clientIndustry")}
					</span>
					<Input
						value={clientIndustry}
						onChange={(e) => setClientIndustry(e.target.value)}
						placeholder={t("clientIndustryPlaceholder")}
					/>
				</label>
				<label className="space-y-1">
					<span className="text-muted-foreground text-xs">
						{t("commissionPct")}
					</span>
					<Input
						type="number"
						min={0}
						max={100}
						value={commissionPct}
						onChange={(e) => setCommissionPct(e.target.value)}
						placeholder="20"
					/>
				</label>
			</div>
			<label className="block space-y-1">
				<span className="text-muted-foreground text-xs">{t("clientNote")}</span>
				<textarea
					value={clientNote}
					onChange={(e) => setClientNote(e.target.value)}
					rows={2}
					className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
					placeholder={t("clientNotePlaceholder")}
				/>
			</label>
			<fieldset className="space-y-2">
				<legend className="lv-eyebrow text-[0.55rem] text-primary">
					{t("visibility")}
				</legend>
				{(["private", "anonymous", "named"] as const).map((v) => (
					<label
						key={v}
						className="flex cursor-pointer items-start gap-3 rounded-sm border border-border bg-background p-3 has-[:checked]:border-primary"
					>
						<input
							type="radio"
							checked={clientVisibility === v}
							onChange={() => setClientVisibility(v)}
							className="mt-1"
						/>
						<div className="text-sm">
							<div className="font-medium">
								{t(`visibilityOptions.${v}.title`)}
							</div>
							<div className="text-muted-foreground text-xs">
								{t(`visibilityOptions.${v}.body`)}
							</div>
						</div>
					</label>
				))}
			</fieldset>
			{error && (
				<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
			)}
			<div className="flex items-center justify-between border-border border-t pt-3">
				<p className="text-muted-foreground text-xs">
					{savedAt
						? t("savedAt", { time: savedAt.toLocaleTimeString() })
						: t("notSaved")}
				</p>
				<div className="flex gap-2">
					{savedAt && (
						<Button
							type="button"
							onClick={remove}
							variant="ghost"
							size="sm"
							disabled={isPending}
						>
							{t("delete")}
						</Button>
					)}
					<Button type="button" onClick={save} size="sm" disabled={isPending}>
						{isPending ? t("saving") : t("save")}
					</Button>
				</div>
			</div>
		</div>
	);
}
