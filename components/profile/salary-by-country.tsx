"use client";

import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { recommendSalaryForCountry } from "@/app/actions/profile";
import { SalaryHistory } from "@/components/profile/salary-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileSalaryByCountry } from "@/db/schema";

const COUNTRIES: { code: string; label: string; currency: string }[] = [
	{ code: "DE", label: "Deutschland", currency: "EUR" },
	{ code: "AT", label: "Österreich", currency: "EUR" },
	{ code: "CH", label: "Schweiz", currency: "CHF" },
	{ code: "NL", label: "Niederlande", currency: "EUR" },
	{ code: "FR", label: "Frankreich", currency: "EUR" },
	{ code: "IT", label: "Italien", currency: "EUR" },
	{ code: "ES", label: "Spanien", currency: "EUR" },
	{ code: "GB", label: "UK", currency: "GBP" },
	{ code: "IE", label: "Irland", currency: "EUR" },
	{ code: "US", label: "USA", currency: "USD" },
	{ code: "CA", label: "Kanada", currency: "CAD" },
	{ code: "PL", label: "Polen", currency: "PLN" },
	{ code: "PT", label: "Portugal", currency: "EUR" },
	{ code: "DK", label: "Dänemark", currency: "DKK" },
	{ code: "SE", label: "Schweden", currency: "SEK" },
];

const MAX_COUNTRIES = 2;

export function SalaryByCountry({
	value,
	onChange,
}: {
	value: ProfileSalaryByCountry[];
	onChange: (next: ProfileSalaryByCountry[]) => void;
}) {
	const t = useTranslations("Profile.salaryByCountry");
	const [pendingIdx, setPendingIdx] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function addRow() {
		if (value.length >= MAX_COUNTRIES) return;
		// Default zu erstem nicht-vergebenen Land
		const used = new Set(value.map((v) => v.country));
		const first = COUNTRIES.find((c) => !used.has(c.code)) ?? COUNTRIES[0];
		onChange([...value, { country: first.code, currency: first.currency }]);
	}

	function setRow(i: number, patch: Partial<ProfileSalaryByCountry>) {
		const next = value.slice();
		next[i] = { ...next[i], ...patch };
		onChange(next);
	}

	function removeRow(i: number) {
		onChange(value.filter((_, idx) => idx !== i));
	}

	function handleCountryChange(i: number, code: string) {
		const c = COUNTRIES.find((x) => x.code === code);
		if (!c) return;
		setRow(i, { country: code, currency: c.currency });
	}

	function fetchRecommendation(i: number) {
		const row = value[i];
		setError(null);
		setPendingIdx(i);
		startTransition(async () => {
			try {
				const r = await recommendSalaryForCountry(row.country, row.currency);
				if (!r.ok) {
					setError(r.error);
					return;
				}
				setRow(i, {
					recommendation: {
						low: r.low,
						mid: r.mid,
						high: r.high,
						rationale: r.rationale,
						generatedAt: new Date().toISOString(),
					},
					// Wenn der/die User:in noch nichts eingegeben hat, mit mid vorbelegen.
					...(row.desired === undefined ? { desired: r.mid } : {}),
					...(row.min === undefined ? { min: r.low } : {}),
				});
			} finally {
				setPendingIdx(null);
			}
		});
	}

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">{t("intro")}</p>
			{value.map((row, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: list editing by index
					key={`row-${i}`}
					className="space-y-2 rounded-md border border-border bg-background p-3"
				>
					<div className="flex flex-wrap items-center gap-2">
						<select
							value={row.country}
							onChange={(e) => handleCountryChange(i, e.target.value)}
							className="h-9 rounded-sm border border-border bg-background px-2 text-sm"
						>
							{COUNTRIES.map((c) => (
								<option key={c.code} value={c.code}>
									{c.label} ({c.currency})
								</option>
							))}
						</select>
						<button
							type="button"
							onClick={() => removeRow(i)}
							className="ml-auto text-muted-foreground hover:text-foreground"
							aria-label={t("remove")}
						>
							<Trash2 className="h-4 w-4" strokeWidth={1.5} />
						</button>
					</div>
					<div className="grid gap-2 sm:grid-cols-2">
						<label className="space-y-1">
							<span className="text-muted-foreground text-xs">
								{t("min", { currency: row.currency })}
							</span>
							<Input
								type="number"
								min={0}
								step={1000}
								value={row.min?.toString() ?? ""}
								onChange={(e) =>
									setRow(i, {
										min: e.target.value
											? Number.parseInt(e.target.value, 10)
											: undefined,
									})
								}
							/>
						</label>
						<label className="space-y-1">
							<span className="text-muted-foreground text-xs">
								{t("desired", { currency: row.currency })}
							</span>
							<Input
								type="number"
								min={0}
								step={1000}
								value={row.desired?.toString() ?? ""}
								onChange={(e) =>
									setRow(i, {
										desired: e.target.value
											? Number.parseInt(e.target.value, 10)
											: undefined,
									})
								}
							/>
						</label>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => fetchRecommendation(i)}
						disabled={isPending}
					>
						{isPending && pendingIdx === i ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
						) : (
							<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
						)}
						{t("askAi")}
					</Button>
					{row.recommendation && (
						<div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
							<div className="flex flex-wrap items-baseline gap-2">
								<span className="font-mono">
									{row.recommendation.low.toLocaleString()}–
									{row.recommendation.high.toLocaleString()} {row.currency}
								</span>
								<span className="text-muted-foreground">
									{t("midHint", {
										mid: row.recommendation.mid.toLocaleString(),
									})}
								</span>
							</div>
							<p className="mt-1 text-muted-foreground leading-relaxed">
								{row.recommendation.rationale}
							</p>
						</div>
					)}
					<SalaryHistory country={row.country} />
				</div>
			))}
			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
			{value.length < MAX_COUNTRIES && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={addRow}
					disabled={isPending}
				>
					<Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
					{t("addCountry")}
				</Button>
			)}
		</div>
	);
}
