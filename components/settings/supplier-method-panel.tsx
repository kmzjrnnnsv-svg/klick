"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSupplierMethod } from "@/app/actions/settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
	Five,
	SupplierArea,
	SupplierCriterion,
	SupplierMethod,
	SupplierThreshold,
} from "@/db/schema/platform";
import { cn } from "@/lib/utils";

const TRAFFIC_CLS: Record<SupplierThreshold["traffic"], string> = {
	red: "bg-destructive/10",
	amber: "bg-warning/15",
	green: "bg-success/10",
};

// Lieferantenbewertung je Org: Bereichsgewichte, Kriterien (an/aus,
// Gewicht, Anker), Schwellen mit Ampel, Empfehlung und Wiedervorlage.
export function SupplierMethodPanel({
	method,
	stored,
	template,
	canEdit,
}: {
	method: SupplierMethod;
	stored: boolean;
	template: SupplierMethod;
	canEdit: boolean;
}) {
	const t = useTranslations("SupplierMethod");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [d, setD] = useState<SupplierMethod>(() =>
		JSON.parse(JSON.stringify(method)),
	);
	// Schwellen haben keine eigene ID; Reihenfolge ist fest (aufsteigend)
	const thresholdKeys = ["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"];
	const setCrit = (code: string, patch: Partial<SupplierCriterion>) =>
		setD((x) => ({
			...x,
			criteria: x.criteria.map((c) =>
				c.code === code ? { ...c, ...patch } : c,
			),
		}));
	const setThr = (i: number, patch: Partial<SupplierThreshold>) =>
		setD((x) => ({
			...x,
			thresholds: x.thresholds.map((th, k) =>
				k === i ? { ...th, ...patch } : th,
			),
		}));
	const sumOf = (area: SupplierArea) =>
		d.criteria
			.filter(
				(c) => c.area === area && c.enabled && !c.frameworks && !c.partnerTypes,
			)
			.reduce((s, c) => s + c.weight, 0);
	const dirty = JSON.stringify(d) !== JSON.stringify(method) || !stored;
	const changed = JSON.stringify(d) !== JSON.stringify(method);
	useEffect(() => {
		if (!changed || pending || !canEdit) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [changed, pending, canEdit]);

	return (
		<form
			className="flex flex-col gap-8 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await withStepUp(() => updateSupplierMethod(d));
					if (!res.ok)
						toast.error(
							res.error === "step_up_required"
								? t("stepUp")
								: res.fieldErrors
									? [...new Set(Object.values(res.fieldErrors).flat())].join(
											" ",
										)
									: tc("error"),
						);
					else {
						toast.success(t("saved"));
						router.refresh();
					}
				});
			}}
		>
			<p className="text-muted-foreground">{t("lead")}</p>

			<section className="flex flex-col gap-3" aria-labelledby="sm-area">
				<h3 id="sm-area" className="font-medium">
					1 · {t("areasTitle")}
				</h3>
				<div className="grid grid-cols-1 max-w-md gap-3 sm:grid-cols-2">
					{(["general", "security"] as const).map((a) => (
						<div key={a} className="flex flex-col gap-1">
							<Label htmlFor={`sm-w-${a}`}>{t(`area_${a}`)}</Label>
							<Input
								id={`sm-w-${a}`}
								type="number"
								inputMode="decimal"
								step="0.05"
								min={0}
								max={1}
								value={d.areaWeights[a]}
								disabled={!canEdit}
								onChange={(e) =>
									setD((x) => ({
										...x,
										areaWeights: {
											...x.areaWeights,
											[a]: Number(e.target.value),
										},
									}))
								}
							/>
						</div>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="sm-crit">
				<h3 id="sm-crit" className="font-medium">
					2 · {t("criteriaTitle")}
				</h3>
				<p className="text-muted-foreground text-xs">{t("criteriaLead")}</p>
				{(["general", "security"] as const).map((area) => (
					<div key={area} className="flex flex-col gap-2">
						<h4 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
							{t(`area_${area}`)} ·{" "}
							{t("baseSum", { sum: sumOf(area).toFixed(2) })}
						</h4>
						<ul className="flex flex-col gap-1.5">
							{d.criteria
								.filter((c) => c.area === area)
								.map((c) => (
									<li key={c.code} className="rounded-md border">
										<details>
											<summary className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2">
												<span
													className={cn(
														"min-w-0 flex-1",
														!c.enabled && "text-muted-foreground line-through",
													)}
												>
													{c.title}
												</span>
												{(c.frameworks || c.partnerTypes) && (
													<span className="text-muted-foreground text-xs">
														{t("addon", {
															scope: [
																...(c.frameworks ?? []),
																...(c.partnerTypes ?? []),
															].join(", "),
														})}
													</span>
												)}
												<span className="text-muted-foreground text-xs tabular-nums">
													{t("weightShort", { w: c.weight })}
												</span>
											</summary>
											<div className="flex flex-col gap-3 border-t p-3">
												<div className="flex flex-wrap items-end gap-3">
													<div className="flex min-w-60 flex-1 flex-col gap-1">
														<Label htmlFor={`sm-t-${c.code}`}>
															{t("criterion")}
														</Label>
														<Input
															id={`sm-t-${c.code}`}
															value={c.title}
															maxLength={200}
															disabled={!canEdit}
															onChange={(e) =>
																setCrit(c.code, { title: e.target.value })
															}
														/>
													</div>
													<div className="flex w-28 flex-col gap-1">
														<Label htmlFor={`sm-cw-${c.code}`}>
															{t("weight")}
														</Label>
														<Input
															id={`sm-cw-${c.code}`}
															type="number"
															inputMode="decimal"
															step="0.05"
															min={0}
															max={1}
															value={c.weight}
															disabled={!canEdit}
															onChange={(e) =>
																setCrit(c.code, {
																	weight: Number(e.target.value),
																})
															}
														/>
													</div>
													<label className="flex items-center gap-2 pb-2">
														<Switch
															checked={c.enabled}
															disabled={!canEdit}
															onCheckedChange={(v) =>
																setCrit(c.code, { enabled: v })
															}
														/>
														{t("enabled")}
													</label>
												</div>
												<ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
													{[1, 2, 3, 4, 5].map((level) => (
														<li key={level} className="flex flex-col gap-1">
															<span className="text-muted-foreground text-xs">
																{level}
															</span>
															<Textarea
																aria-label={`${c.title} – ${level}`}
																className="min-h-16 text-xs"
																value={c.anchors[level - 1] ?? ""}
																maxLength={400}
																disabled={!canEdit}
																onChange={(e) =>
																	setCrit(c.code, {
																		anchors: c.anchors.map((x, k) =>
																			k === level - 1 ? e.target.value : x,
																		) as Five<string>,
																	})
																}
															/>
														</li>
													))}
												</ol>
											</div>
										</details>
									</li>
								))}
						</ul>
					</div>
				))}
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="sm-thr">
				<h3 id="sm-thr" className="font-medium">
					3 · {t("thresholdsTitle")}
				</h3>
				<p className="text-muted-foreground text-xs">{t("thresholdsLead")}</p>
				<ol className="flex flex-col gap-2">
					{d.thresholds.map((th, i) => (
						<li
							key={thresholdKeys[i]}
							className={cn(
								"grid gap-2 rounded-md border p-2 md:grid-cols-[6rem_9rem_8rem_1fr_6rem]",
								TRAFFIC_CLS[th.traffic],
							)}
						>
							<div className="flex flex-col gap-1">
								<Label htmlFor={`sm-min-${i}`} className="text-xs">
									{t("from")}
								</Label>
								<Input
									id={`sm-min-${i}`}
									type="number"
									inputMode="decimal"
									step="0.05"
									min={0}
									max={5}
									value={th.min}
									disabled={!canEdit || i === 0}
									onChange={(e) => setThr(i, { min: Number(e.target.value) })}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={`sm-lvl-${i}`} className="text-xs">
									{t("level")}
								</Label>
								<Input
									id={`sm-lvl-${i}`}
									value={th.level}
									maxLength={40}
									disabled={!canEdit}
									onChange={(e) => setThr(i, { level: e.target.value })}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={`sm-tr-${i}`} className="text-xs">
									{t("traffic")}
								</Label>
								<select
									id={`sm-tr-${i}`}
									className="h-9 rounded-sm border border-input bg-background px-2 text-foreground"
									value={th.traffic}
									disabled={!canEdit}
									onChange={(e) =>
										setThr(i, {
											traffic: e.target.value as SupplierThreshold["traffic"],
										})
									}
								>
									{(["red", "amber", "green"] as const).map((x) => (
										<option key={x} value={x}>
											{t(`traffic_${x}`)}
										</option>
									))}
								</select>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={`sm-rec-${i}`} className="text-xs">
									{t("recommendation")}
								</Label>
								<Input
									id={`sm-rec-${i}`}
									value={th.recommendation}
									maxLength={200}
									disabled={!canEdit}
									onChange={(e) =>
										setThr(i, {
											recommendation: e.target.value,
											status: th.status,
										})
									}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={`sm-mo-${i}`} className="text-xs">
									{t("months")}
								</Label>
								<Input
									id={`sm-mo-${i}`}
									type="number"
									inputMode="numeric"
									min={1}
									max={60}
									value={th.months}
									disabled={!canEdit}
									onChange={(e) =>
										setThr(i, { months: Number(e.target.value) || 1 })
									}
								/>
							</div>
						</li>
					))}
				</ol>
				<div className="flex max-w-xs flex-col gap-1">
					<Label htmlFor="sm-crit-max">{t("criticalMax")}</Label>
					<Input
						id="sm-crit-max"
						type="number"
						inputMode="numeric"
						min={1}
						max={60}
						value={d.criticalMaxMonths}
						disabled={!canEdit}
						onChange={(e) =>
							setD((x) => ({
								...x,
								criticalMaxMonths: Number(e.target.value) || 12,
							}))
						}
					/>
				</div>
			</section>

			{canEdit && (
				<div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setD(JSON.parse(JSON.stringify(template)))}
					>
						{t("loadTemplate")}
					</Button>
					<Button type="submit" size="sm" disabled={pending || !dirty}>
						{t("save")}
					</Button>
				</div>
			)}
		</form>
	);
}
