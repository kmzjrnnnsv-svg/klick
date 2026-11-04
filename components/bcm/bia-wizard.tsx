"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { saveProcessBia } from "@/app/actions/bcm";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { ProcessBia } from "@/db/schema/registers";
import {
	type BiaDimension,
	biaCurve,
	DATA_LOSS_OPTIONS,
	DEFAULT_BIA_STEPS,
	durationParts,
	emptyBia,
	suggestTargets,
} from "@/lib/bcm/bia";

type Draft = Omit<ProcessBia, "assessedAt" | "assessedBy">;

// Geführte BIA: je Schadensart die Stufe je Zeitstufe, daraus live der
// Vorschlag für MTPD, RTO und RPO. Eine höhere Stufe füllt spätere
// Zeitstufen mit (Schaden wächst mit der Dauer), sie lassen sich danach
// wieder senken.
export function BiaWizard({
	processId,
	code,
	initial,
	dimensions,
	impactLabels,
	anchors,
	current,
}: {
	processId: string;
	code: string;
	initial: ProcessBia | null;
	dimensions: BiaDimension[];
	impactLabels: string[];
	// Beschreibung je Schadensart und Stufe aus der Risikomethode
	anchors: Record<string, string[]>;
	current: {
		rtoHours: number | null;
		rpoHours: number | null;
		mtpdHours: number | null;
		criticality: string;
	};
}) {
	const t = useTranslations("Bcm");
	const tp = useTranslations("Processes");
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	const router = useRouter();
	const [pending, start] = useTransition();
	const levels = impactLabels.length;
	const active = dimensions.filter((d) => d.enabled);
	const [d, setD] = useState<Draft>(() => {
		const base = emptyBia(dimensions, levels);
		if (!initial) return base;
		const impacts = { ...base.impacts };
		for (const k of Object.keys(impacts))
			impacts[k] = initial.steps.map((_, i) => initial.impacts[k]?.[i] ?? 0);
		return {
			v: 1,
			steps: initial.steps,
			threshold: initial.threshold,
			impacts,
			dataLossHours: initial.dataLossHours ?? null,
			notes: initial.notes ?? null,
		};
	});
	const [stepsText, setStepsText] = useState(d.steps.join(", "));
	const [adoptCrit, setAdoptCrit] = useState(false);
	const s = useMemo(() => suggestTargets(d, dimensions), [d, dimensions]);
	const curve = useMemo(() => biaCurve(d, dimensions), [d, dimensions]);
	const labelOf = new Map(dimensions.map((x) => [x.key, x.label]));

	const dur = (h: number) => {
		const { unit, count } = durationParts(h);
		return t(`dur_${unit}`, { count });
	};
	const setLevel = (key: string, i: number, v: number) =>
		setD((prev) => {
			const row = [...(prev.impacts[key] ?? [])];
			row[i] = v;
			for (let j = i + 1; j < row.length; j++)
				if ((row[j] ?? 0) < v) row[j] = v;
			return { ...prev, impacts: { ...prev.impacts, [key]: row } };
		});
	const applySteps = (text: string) => {
		const steps = [
			...new Set(
				text
					.split(/[,;\s]+/)
					.map((x) => Number.parseInt(x, 10))
					.filter((x) => Number.isFinite(x) && x >= 1 && x <= 8760),
			),
		]
			.sort((a, b) => a - b)
			.slice(0, 8);
		if (steps.length < 2) return void toast.error(t("stepsInvalid"));
		setD((prev) => {
			const impacts: Record<string, number[]> = {};
			for (const k of Object.keys(prev.impacts))
				impacts[k] = steps.map((h) => {
					// gleiche Stunde behält ihren Wert, sonst die nächstkleinere
					let old = -1;
					prev.steps.forEach((x, i) => {
						if (x <= h) old = i;
					});
					return old >= 0 ? (prev.impacts[k]?.[old] ?? 0) : 0;
				});
			return { ...prev, steps, impacts };
		});
		setStepsText(steps.join(", "));
	};
	const save = (adopt: boolean) =>
		start(async () => {
			const res = await saveProcessBia({
				processId,
				steps: d.steps,
				threshold: d.threshold,
				impacts: d.impacts,
				dataLossHours: d.dataLossHours ?? null,
				notes: d.notes ?? undefined,
				adopt,
				adoptCriticality: adopt && adoptCrit,
			});
			if (!res.ok)
				return void toast.error(
					gate.errorText(res.error) ?? errorText(tc, res),
				);
			toast.success(
				res.data.approvalPending
					? tp("changeApprovalRequested")
					: adopt
						? t("adopted")
						: t("saved"),
			);
			router.push(`/prozesse/${encodeURIComponent(code)}`);
			router.refresh();
		});

	const levelSelect = (key: string, i: number, label: string) => (
		<Select
			value={String(d.impacts[key]?.[i] ?? 0)}
			onValueChange={(v) => setLevel(key, i, Number(v))}
		>
			<SelectTrigger
				aria-label={label}
				className={
					(d.impacts[key]?.[i] ?? 0) >= d.threshold
						? "w-full bg-destructive/10"
						: "w-full"
				}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="0">{t("levelNone")}</SelectItem>
				{impactLabels.map((l, n) => (
					<SelectItem key={l} value={String(n + 1)}>
						{l}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("matrixTitle")}</h2>
				<p className="text-muted-foreground text-subhead">{t("matrixLead")}</p>
				{/* ab 640 px als Tabelle */}
				<div className="hidden overflow-x-auto sm:block">
					<table className="w-full border-separate border-spacing-1 text-subhead">
						<thead>
							<tr>
								<th className="text-left font-medium text-footnote text-muted-foreground">
									{t("dimension")}
								</th>
								{d.steps.map((h) => (
									<th
										key={h}
										className="min-w-28 text-left font-medium text-footnote text-muted-foreground tabular-nums"
									>
										{dur(h)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{active.map((dim) => (
								<tr key={dim.key}>
									<th scope="row" className="pr-2 text-left font-normal">
										<span className="block">{dim.label}</span>
									</th>
									{d.steps.map((h, i) => (
										<td key={h}>
											{levelSelect(dim.key, i, `${dim.label}, ${dur(h)}`)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{/* am Handy je Schadensart eine Karte */}
				<div className="flex flex-col gap-4 sm:hidden">
					{active.map((dim) => (
						<fieldset key={dim.key} className="rounded-xl bg-card p-3">
							<legend className="px-1 font-semibold text-subhead">
								{dim.label}
							</legend>
							<div className="grid grid-cols-2 gap-2">
								{d.steps.map((h, i) => (
									<div key={h} className="flex flex-col gap-1">
										<span className="text-footnote text-muted-foreground">
											{dur(h)}
										</span>
										{levelSelect(dim.key, i, `${dim.label}, ${dur(h)}`)}
									</div>
								))}
							</div>
						</fieldset>
					))}
				</div>
				<details className="text-subhead">
					<summary className="cursor-default text-primary">
						{t("anchorsShow")}
					</summary>
					<dl className="mt-2 flex flex-col gap-3">
						{active.map((dim) => (
							<div key={dim.key}>
								<dt className="font-medium">{dim.label}</dt>
								<dd>
									<ol className="ml-4 list-decimal text-muted-foreground text-footnote">
										{(anchors[dim.key] ?? []).map((a, n) => (
											<li key={`${dim.key}:${a}`}>
												<span className="text-foreground">
													{impactLabels[n]}
												</span>
												: {a}
											</li>
										))}
									</ol>
								</dd>
							</div>
						))}
					</dl>
				</details>
			</section>

			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("threshold")}</Label>
					<Select
						value={String(d.threshold)}
						onValueChange={(v) => setD({ ...d, threshold: Number(v) })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{impactLabels.map((l, n) => (
								<SelectItem key={l} value={String(n + 1)}>
									{t("thresholdFrom", { level: l })}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-footnote text-muted-foreground">
						{t("thresholdHint")}
					</p>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("dataLoss")}</Label>
					<Select
						value={d.dataLossHours === null ? "none" : String(d.dataLossHours)}
						onValueChange={(v) =>
							setD({ ...d, dataLossHours: v === "none" ? null : Number(v) })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">{t("dataLossNone")}</SelectItem>
							{DATA_LOSS_OPTIONS.map((h) => (
								<SelectItem key={h} value={String(h)}>
									{h === 0 ? t("dataLossZero") : dur(h)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-footnote text-muted-foreground">
						{t("dataLossHint")}
					</p>
				</div>
				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<Label htmlFor="bia-notes">{t("notes")}</Label>
					<Textarea
						id="bia-notes"
						rows={3}
						value={d.notes ?? ""}
						onChange={(e) => setD({ ...d, notes: e.target.value })}
						placeholder={t("notesPlaceholder")}
					/>
				</div>
				<details className="text-subhead sm:col-span-2">
					<summary className="cursor-default text-primary">
						{t("stepsEdit")}
					</summary>
					<div className="mt-2 flex flex-col gap-1.5 sm:max-w-md">
						<Label htmlFor="bia-steps">{t("stepsLabel")}</Label>
						<div className="flex gap-2">
							<Input
								id="bia-steps"
								value={stepsText}
								onChange={(e) => setStepsText(e.target.value)}
								inputMode="numeric"
								autoComplete="off"
							/>
							<Button
								type="button"
								variant="outline"
								onClick={() => applySteps(stepsText)}
							>
								{t("stepsApply")}
							</Button>
						</div>
						<p className="text-footnote text-muted-foreground">
							{t("stepsHint", { steps: DEFAULT_BIA_STEPS.join(", ") })}
						</p>
					</div>
				</details>
			</section>

			<section
				className="flex flex-col gap-3 rounded-xl bg-card p-4"
				aria-live="polite"
			>
				<h2 className="font-semibold text-headline">{t("resultTitle")}</h2>
				<ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
					{curve.map((p) => (
						<li
							key={p.hours}
							className={
								p.level >= d.threshold
									? "rounded-lg bg-destructive/10 px-2.5 py-2"
									: "rounded-lg bg-muted px-2.5 py-2"
							}
						>
							<p className="font-semibold text-footnote tabular-nums">
								{dur(p.hours)}
							</p>
							<p className="text-subhead">
								{p.level > 0 ? impactLabels[p.level - 1] : t("levelNone")}
							</p>
						</li>
					))}
				</ol>
				{s.mtpdHours === null ? (
					<p className="text-subhead">{t("suggestNone")}</p>
				) : (
					<dl className="grid grid-cols-1 gap-3 sm:grid-cols-4">
						<div>
							<dt className="text-footnote text-muted-foreground">MTPD</dt>
							<dd className="font-semibold text-title-3">{dur(s.mtpdHours)}</dd>
							<dd className="text-footnote text-muted-foreground">
								{t("because", {
									dims: s.decisive.map((k) => labelOf.get(k) ?? k).join(", "),
								})}
							</dd>
						</div>
						<div>
							<dt className="text-footnote text-muted-foreground">RTO</dt>
							<dd className="font-semibold text-title-3">
								{s.rtoHours !== null ? dur(s.rtoHours) : "–"}
							</dd>
							<dd className="text-footnote text-muted-foreground">
								{t("rtoHint")}
							</dd>
						</div>
						<div>
							<dt className="text-footnote text-muted-foreground">RPO</dt>
							<dd className="font-semibold text-title-3">
								{s.rpoHours === null
									? t("dataLossNone")
									: s.rpoHours === 0
										? t("dataLossZero")
										: dur(s.rpoHours)}
							</dd>
						</div>
						<div>
							<dt className="text-footnote text-muted-foreground">
								{tp("criticality")}
							</dt>
							<dd className="font-semibold text-title-3">
								{tp(`crit_${s.criticality}`)}
							</dd>
						</div>
					</dl>
				)}
				{(current.rtoHours !== null || current.mtpdHours !== null) && (
					<p className="text-footnote text-muted-foreground">
						{t("currentValues", {
							rto: current.rtoHours === null ? "–" : dur(current.rtoHours),
							mtpd: current.mtpdHours === null ? "–" : dur(current.mtpdHours),
						})}
					</p>
				)}
				{s.mtpdHours !== null && s.criticality !== current.criticality && (
					<label
						htmlFor="bia-crit"
						className="flex items-center gap-2 text-subhead"
					>
						<Checkbox
							id="bia-crit"
							checked={adoptCrit}
							onCheckedChange={(v) => setAdoptCrit(v === true)}
						/>
						{t("adoptCriticality", {
							level: tp(`crit_${s.criticality}`),
						})}
					</label>
				)}
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						disabled={pending || s.mtpdHours === null}
						onClick={() => save(true)}
					>
						{t("saveAdopt")}
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => save(false)}
					>
						{t("saveOnly")}
					</Button>
				</div>
			</section>
		</div>
	);
}
