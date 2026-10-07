"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateRiskSettings } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Five = [string, string, string, string, string];

// Fünf feste Stufen — die Position ist die Identität der Skalenbeschriftung.
const SCALE_LEVELS = [1, 2, 3, 4, 5] as const;

export function RiskSettingsPanel({
	likelihood,
	impact,
	acceptable,
	tolerable,
	allowSelfApproval,
	canEdit,
}: {
	likelihood: Five;
	impact: Five;
	acceptable: number;
	tolerable: number;
	allowSelfApproval: boolean;
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const ta = useTranslations("Approvals");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [l, setL] = useState<Five>(likelihood);
	const [i, setI] = useState<Five>(impact);
	const [acc, setAcc] = useState(acceptable);
	const [tol, setTol] = useState(tolerable);
	const [solo, setSolo] = useState(allowSelfApproval);
	const upd = (arr: Five, idx: number, v: string): Five =>
		arr.map((x, k) => (k === idx ? v : x)) as Five;
	return (
		<form
			className="flex flex-col gap-5 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await updateRiskSettings({
						likelihood: l,
						impact: i,
						acceptable: acc,
						tolerable: tol,
						allowSelfApproval: solo,
					});
					if (!res.ok)
						toast.error(
							res.error === "step_up_required"
								? t("stepUp")
								: res.fieldErrors
									? Object.values(res.fieldErrors).flat().join(", ")
									: tc("error"),
						);
					else {
						toast.success(t("saved"));
						router.refresh();
					}
				});
			}}
		>
			<p className="text-muted-foreground">{t("riskScalesLead")}</p>
			<div className="grid gap-6 sm:grid-cols-2">
				<fieldset className="flex flex-col gap-2">
					<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
						{t("likelihoodLabels")}
					</legend>
					{SCALE_LEVELS.map((level) => (
						<div key={`l-${level}`} className="flex items-center gap-2">
							<span className="w-4 text-muted-foreground">{level}</span>
							<Input
								value={l[level - 1] ?? ""}
								disabled={!canEdit}
								onChange={(e) => setL(upd(l, level - 1, e.target.value))}
								maxLength={40}
							/>
						</div>
					))}
				</fieldset>
				<fieldset className="flex flex-col gap-2">
					<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
						{t("impactLabels")}
					</legend>
					{SCALE_LEVELS.map((level) => (
						<div key={`i-${level}`} className="flex items-center gap-2">
							<span className="w-4 text-muted-foreground">{level}</span>
							<Input
								value={i[level - 1] ?? ""}
								disabled={!canEdit}
								onChange={(e) => setI(upd(i, level - 1, e.target.value))}
								maxLength={40}
							/>
						</div>
					))}
				</fieldset>
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="rs-acc">{t("acceptable")}</Label>
					<Input
						id="rs-acc"
						type="number"
						min={1}
						max={24}
						value={acc}
						disabled={!canEdit}
						onChange={(e) => setAcc(Number(e.target.value))}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="rs-tol">{t("tolerable")}</Label>
					<Input
						id="rs-tol"
						type="number"
						min={2}
						max={25}
						value={tol}
						disabled={!canEdit}
						onChange={(e) => setTol(Number(e.target.value))}
					/>
				</div>
				<div className="flex items-end justify-between gap-3 rounded-md border p-3">
					<div>
						<Label htmlFor="rs-solo">{ta("selfApproved")}</Label>
						<p className="text-muted-foreground text-xs">{ta("soloHint")}</p>
					</div>
					<Switch
						id="rs-solo"
						checked={solo}
						disabled={!canEdit}
						onCheckedChange={setSolo}
					/>
				</div>
			</div>
			{canEdit && (
				<div className="flex justify-end">
					<Button type="submit" size="sm" disabled={pending}>
						{tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}
