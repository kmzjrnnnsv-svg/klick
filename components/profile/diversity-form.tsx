"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteMyDiversity, saveDiversity } from "@/app/actions/diversity";
import { Button } from "@/components/ui/button";
import type { DiversityResponse } from "@/db/schema";

const GENDER = [
	"female",
	"male",
	"non_binary",
	"self_describe",
	"prefer_not_to_say",
];
const AGE_RANGES = ["18_24", "25_34", "35_44", "45_54", "55_plus"];

export function DiversityForm({
	initial,
}: {
	initial: DiversityResponse | null;
}) {
	const t = useTranslations("Diversity");
	const [open, setOpen] = useState(!!initial);
	const [genderIdentity, setGenderIdentity] = useState(
		initial?.genderIdentity ?? "",
	);
	const [ethnicity, setEthnicity] = useState(initial?.ethnicity ?? "");
	const [ageRange, setAgeRange] = useState(initial?.ageRange ?? "");
	const [hasDisability, setHasDisability] = useState<"yes" | "no" | "">(
		initial?.hasDisability === true
			? "yes"
			: initial?.hasDisability === false
				? "no"
				: "",
	);
	const [savedAt, setSavedAt] = useState<Date | null>(
		initial?.consentedAt ?? null,
	);
	const [isPending, startTransition] = useTransition();

	function save() {
		startTransition(async () => {
			await saveDiversity({
				genderIdentity: genderIdentity || undefined,
				ethnicity: ethnicity || undefined,
				ageRange: ageRange || undefined,
				hasDisability:
					hasDisability === "yes"
						? true
						: hasDisability === "no"
							? false
							: null,
			});
			setSavedAt(new Date());
		});
	}

	function remove() {
		startTransition(async () => {
			await deleteMyDiversity();
			setGenderIdentity("");
			setEthnicity("");
			setAgeRange("");
			setHasDisability("");
			setSavedAt(null);
			setOpen(false);
		});
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="lv-eyebrow inline-flex rounded-sm border border-border px-3 py-1.5 text-[0.55rem] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
			>
				{t("openOptIn")}
			</button>
		);
	}

	return (
		<div className="space-y-4 rounded-sm border border-border bg-background p-4">
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("consentBlurb")}
			</p>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<label className="space-y-1">
					<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
						{t("genderIdentity")}
					</span>
					<select
						value={genderIdentity}
						onChange={(e) => setGenderIdentity(e.target.value)}
						className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm"
					>
						<option value="">{t("notSpecified")}</option>
						{GENDER.map((g) => (
							<option key={g} value={g}>
								{t(`gender.${g}`)}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
						{t("ageRange")}
					</span>
					<select
						value={ageRange}
						onChange={(e) => setAgeRange(e.target.value)}
						className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm"
					>
						<option value="">{t("notSpecified")}</option>
						{AGE_RANGES.map((a) => (
							<option key={a} value={a}>
								{t(`age.${a}`)}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1 sm:col-span-2">
					<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
						{t("ethnicity")}
					</span>
					<input
						type="text"
						value={ethnicity}
						onChange={(e) => setEthnicity(e.target.value)}
						placeholder={t("ethnicityPlaceholder")}
						className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm"
					/>
				</label>
				<label className="space-y-1">
					<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
						{t("disability")}
					</span>
					<select
						value={hasDisability}
						onChange={(e) =>
							setHasDisability(e.target.value as "yes" | "no" | "")
						}
						className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm"
					>
						<option value="">{t("notSpecified")}</option>
						<option value="yes">{t("yes")}</option>
						<option value="no">{t("no")}</option>
					</select>
				</label>
			</div>
			<div className="flex items-center justify-between border-border border-t pt-3">
				<p className="text-muted-foreground text-xs">
					{savedAt
						? t("lastSavedAt", { time: savedAt.toLocaleDateString() })
						: t("notSavedYet")}
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
							{t("withdraw")}
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
