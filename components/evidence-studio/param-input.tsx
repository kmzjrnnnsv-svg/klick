"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSheetParam } from "@/app/actions/evidence-studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Eigene Frist je Rahmenwerk und Thema (Monate, Stunden oder Jahre)
export function ParamInput({
	controlCode,
	framework,
	frameworkName,
	topic,
	unit,
	initial,
	disabled,
}: {
	controlCode: string;
	framework: string;
	frameworkName: string;
	topic: string;
	unit: string;
	initial: number | null;
	disabled?: boolean;
}) {
	const t = useTranslations("EvidenceStudio");
	const tc = useTranslations("Common");
	const [value, setValue] = useState(initial === null ? "" : String(initial));
	const [pending, start] = useTransition();
	const parsed = value.trim() === "" ? null : Number(value.replace(",", "."));
	const valid = parsed === null || (Number.isFinite(parsed) && parsed > 0);
	const dirty = parsed !== initial;

	const save = (v: number | null) =>
		start(async () => {
			const res = await saveSheetParam({
				controlCode,
				framework,
				topic,
				value: v,
			});
			if (res.ok) {
				toast.success(t("saved"));
				if (v === null) setValue("");
			} else toast.error(tc("error"));
		});

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Input
				type="number"
				inputMode="decimal"
				min={0}
				step="any"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				aria-label={`${t("ownValue")} ${frameworkName}`}
				className="h-8 w-20 text-sm tabular-nums"
				disabled={disabled || pending}
				autoComplete="off"
			/>
			<span className="text-muted-foreground text-xs">{unit}</span>
			{dirty && valid && !disabled && (
				<Button
					size="sm"
					variant="outline"
					onClick={() => save(parsed)}
					disabled={pending}
				>
					{t("save")}
				</Button>
			)}
			{initial !== null && !disabled && (
				<Button
					size="sm"
					variant="ghost"
					onClick={() => save(null)}
					disabled={pending}
				>
					{t("ownRemove")}
				</Button>
			)}
		</div>
	);
}
