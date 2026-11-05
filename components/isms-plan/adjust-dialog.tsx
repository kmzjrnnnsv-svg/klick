"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	saveIsmsPlanItem,
	saveIsmsPlanWorkdays,
} from "@/app/actions/isms-plan";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { IsmsBasis, Range } from "@/lib/compliance/catalog/isms-programme";
import {
	adjustedNumbers,
	type IsmsItemAdjust,
	unitsLine,
} from "@/lib/isms-plan/adjust-math";
import { fmtRange } from "@/lib/isms-plan/format";

// Anpassung eines Punkts im ISMS-Jahresplan (P2b): entfällt in der Org (mit
// Begründung), Anzahl je Jahr, eigener Aufwand. Die Vorschau rechnet wie der
// Server (lib/isms-plan/adjust-math.ts).

const REASON_MIN = 10;

function num(v: string): number | undefined {
	if (v.trim() === "") return undefined;
	const n = Number(v.replace(",", "."));
	return Number.isFinite(n) ? n : undefined;
}

export function IsmsAdjustDialog({
	itemKey,
	title,
	template,
	adjust,
}: {
	itemKey: string;
	title: string;
	template: {
		year: Range;
		isb: { a: Range; b: Range };
		basis?: readonly IsmsBasis[];
	};
	adjust: IsmsItemAdjust | null;
}) {
	const t = useTranslations("IsmsPlan");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const line = unitsLine(template.basis);
	const initial = () => ({
		off: Boolean(adjust?.off),
		reason: adjust?.off?.reason ?? "",
		units: adjust?.units !== undefined ? String(adjust.units) : "",
		yearMin: adjust?.year ? String(adjust.year[0]) : "",
		yearMax: adjust?.year ? String(adjust.year[1]) : "",
	});
	const [d, setD] = useState(initial);
	const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) =>
		setD((prev) => ({ ...prev, [k]: v }));

	const yearMin = num(d.yearMin);
	const yearMax = num(d.yearMax);
	const units = num(d.units);
	const rangeBad =
		(yearMin === undefined) !== (yearMax === undefined) ||
		(yearMin !== undefined && yearMax !== undefined && yearMin > yearMax);
	const preview = adjustedNumbers(template, {
		year:
			yearMin !== undefined && yearMax !== undefined && !rangeBad
				? [yearMin, yearMax]
				: undefined,
		units: line && units !== undefined ? Math.round(units) : undefined,
	});

	function save(reset: boolean) {
		start(async () => {
			setError(null);
			if (!reset && d.off && d.reason.trim().length < REASON_MIN)
				return setError(t("adjustOffReasonShort"));
			if (!reset && rangeBad) return setError(t("adjustYearRange"));
			const res = await saveIsmsPlanItem(
				reset
					? { key: itemKey, off: false }
					: {
							key: itemKey,
							off: d.off,
							offReason: d.off ? d.reason.trim() : undefined,
							yearMin,
							yearMax,
							units:
								line && units !== undefined ? Math.round(units) : undefined,
						},
			);
			if (!res.ok) return setError(errorText(tc, res));
			toast.success(reset ? t("adjustResetDone") : t("adjustSaved"));
			setOpen(false);
			router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) setD(initial());
				else setError(null);
			}}
		>
			<DialogTrigger asChild>
				<Button
					size="sm"
					variant="ghost"
					className="-ml-2 h-(--control-h-sm) px-2"
				>
					{t("adjust")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						save(false);
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("adjustTitle", { title })}</DialogTitle>
						<DialogDescription>{t("adjustLead")}</DialogDescription>
					</DialogHeader>

					<div className="flex items-start justify-between gap-4">
						<div className="flex flex-col gap-0.5">
							<Label htmlFor={`off-${itemKey}`}>{t("adjustOff")}</Label>
							<p className="text-footnote text-muted-foreground">
								{t("adjustOffHint")}
							</p>
						</div>
						<Switch
							id={`off-${itemKey}`}
							checked={d.off}
							onCheckedChange={(v) => set("off", v)}
						/>
					</div>
					{d.off && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`reason-${itemKey}`}>
								{t("adjustOffReason")}
							</Label>
							<Textarea
								id={`reason-${itemKey}`}
								rows={3}
								value={d.reason}
								maxLength={500}
								onChange={(e) => set("reason", e.target.value)}
								placeholder={t("adjustOffReasonHint")}
								required
							/>
						</div>
					)}

					{!d.off && (
						<>
							{line?.units !== undefined && (
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`units-${itemKey}`}>{t("adjustUnits")}</Label>
									<Input
										id={`units-${itemKey}`}
										type="number"
										inputMode="numeric"
										min={1}
										max={100}
										step={1}
										value={d.units}
										onChange={(e) => set("units", e.target.value)}
										placeholder={String(line.units)}
										className="max-w-32"
										autoComplete="off"
									/>
									<p className="text-footnote text-muted-foreground">
										{t("adjustUnitsHint", { units: line.units })}
									</p>
								</div>
							)}

							<fieldset className="flex flex-col gap-1.5">
								<legend className="mb-1.5 font-medium text-subhead">
									{t("adjustYear")}
								</legend>
								<div className="flex items-center gap-2">
									<Label htmlFor={`ymin-${itemKey}`} className="sr-only">
										{t("adjustYearMin")}
									</Label>
									<Input
										id={`ymin-${itemKey}`}
										type="number"
										inputMode="decimal"
										min={0}
										max={365}
										step={0.5}
										value={d.yearMin}
										onChange={(e) => set("yearMin", e.target.value)}
										placeholder={String(template.year[0])}
										className="max-w-28"
										autoComplete="off"
									/>
									<span aria-hidden="true">–</span>
									<Label htmlFor={`ymax-${itemKey}`} className="sr-only">
										{t("adjustYearMax")}
									</Label>
									<Input
										id={`ymax-${itemKey}`}
										type="number"
										inputMode="decimal"
										min={0}
										max={365}
										step={0.5}
										value={d.yearMax}
										onChange={(e) => set("yearMax", e.target.value)}
										placeholder={String(template.year[1])}
										className="max-w-28"
										autoComplete="off"
									/>
								</div>
								<p className="text-footnote text-muted-foreground">
									{t("adjustYearHint", { pt: fmtRange(template.year) })}
								</p>
							</fieldset>

							<p
								className="rounded-xl bg-muted px-3 py-2 text-footnote tabular-nums"
								aria-live="polite"
							>
								{t("adjustPreview", {
									year: fmtRange(preview.year),
									a: fmtRange(preview.isbA),
									b: fmtRange(preview.isbB),
								})}
							</p>
						</>
					)}

					<FormAlert message={error} />
					<DialogFooter className="gap-2 sm:justify-between">
						{adjust ? (
							<Button
								type="button"
								variant="ghost"
								disabled={pending}
								onClick={() => save(true)}
							>
								{t("adjustReset")}
							</Button>
						) : (
							<span />
						)}
						<Button type="submit" disabled={pending}>
							{t("adjustSave")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function IsmsWorkdaysDialog({
	workdays,
	bounds,
}: {
	workdays: number;
	bounds: readonly [number, number];
}) {
	const t = useTranslations("IsmsPlan");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [value, setValue] = useState(String(workdays));
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) setValue(String(workdays));
				else setError(null);
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="secondary">
					{t("workdaysEdit")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							setError(null);
							const n = num(value);
							if (
								n === undefined ||
								!Number.isInteger(n) ||
								n < bounds[0] ||
								n > bounds[1]
							)
								return setError(
									t("workdaysHint", { min: bounds[0], max: bounds[1] }),
								);
							const res = await saveIsmsPlanWorkdays({ workdays: n });
							if (!res.ok) return setError(errorText(tc, res));
							toast.success(t("workdaysSaved"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("workdaysTitle")}</DialogTitle>
						<DialogDescription>{t("workdaysLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="isms-workdays">{t("workdays")}</Label>
						<Input
							id="isms-workdays"
							type="number"
							inputMode="numeric"
							min={bounds[0]}
							max={bounds[1]}
							step={1}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							className="max-w-32"
							autoComplete="off"
							required
						/>
						<p className="text-footnote text-muted-foreground">
							{t("workdaysHint", { min: bounds[0], max: bounds[1] })}
						</p>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button type="submit" disabled={pending}>
							{t("adjustSave")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
