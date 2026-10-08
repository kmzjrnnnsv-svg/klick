"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	confirmSetupFlag,
	updateLicenceProfile,
} from "@/app/actions/frameworks";
import { previewStageChange } from "@/app/actions/synergy";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	CASP_SERVICES,
	type CaspService,
	LICENCE_STAGES,
	type LicenceStage,
} from "@/db/schema/enums";
import type { StageReport } from "@/lib/compliance/stage-report";

// Stufenwechsel mit Synergie-Report: „Stufe 2: +180 anwendbare Anforderungen,
// 95 bereits erfüllt, 31 neue Controls (12 S / 14 M / 5 L)". Der Wechsel
// selbst braucht eine frische MFA-Bestätigung (Step-up).
export function StagePanel({
	licenceStage,
	caspServices,
	tlptDesignated,
	tlptConfirmedAt,
	canEdit,
}: {
	licenceStage: LicenceStage;
	caspServices: CaspService[];
	tlptDesignated: boolean;
	tlptConfirmedAt: string | null;
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const to = useTranslations("Onboarding");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [stage, setStage] = useState<LicenceStage>(licenceStage);
	const [services, setServices] = useState<CaspService[]>(caspServices);
	const [report, setReport] = useState<StageReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [pending, start] = useTransition();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const changed =
		stage !== licenceStage ||
		JSON.stringify([...services].sort()) !==
			JSON.stringify([...caspServices].sort());
	const key = JSON.stringify({ stage, services });

	useEffect(() => {
		const input = JSON.parse(key) as {
			stage: LicenceStage;
			services: CaspService[];
		};
		if (timer.current) clearTimeout(timer.current);
		setLoading(true);
		timer.current = setTimeout(async () => {
			const res = await previewStageChange({
				licenceStage: input.stage,
				caspServices: input.services,
			});
			setLoading(false);
			setReport(res.ok ? res.data : null);
		}, 250);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [key]);

	const handleError = (error: string) =>
		toast.error(error === "step_up_required" ? t("stepUp") : tc("error"));

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{t("stageTitle")}</CardTitle>
				<CardDescription>{t("stageLead")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-5 text-sm">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label>{t("stage")}</Label>
						<Select
							value={stage}
							disabled={!canEdit}
							onValueChange={(v) => setStage(v as LicenceStage)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{LICENCE_STAGES.map((s) => (
									<SelectItem key={s} value={s}>
										{to(`stage${s.charAt(0)}` as "stage0")}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>{t("caspServices")}</Label>
						<div className="grid grid-cols-2 gap-1.5">
							{CASP_SERVICES.map((s) => (
								<label key={s} className="flex items-center gap-2 text-xs">
									<Checkbox
										checked={services.includes(s)}
										disabled={!canEdit}
										onCheckedChange={(v) =>
											setServices(
												v ? [...services, s] : services.filter((x) => x !== s),
											)
										}
									/>
									{to(`service_${s}` as "service_custody")}
								</label>
							))}
						</div>
					</div>
				</div>

				<div className="rounded-md border border-dashed p-4">
					<p className="lv-eyebrow text-[0.58rem] text-muted-foreground">
						{t("stageReport")}
					</p>
					{loading && !report ? (
						<div className="mt-2 flex flex-col gap-2">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
						</div>
					) : report ? (
						<div className="mt-2 grid gap-3 sm:grid-cols-4">
							<Stat
								label={t("reportApplicable")}
								value={`${report.applicableBefore} → ${report.applicableAfter}`}
							/>
							<Stat
								label={t("reportNew")}
								value={`+${report.newlyApplicable.length}${report.noLongerApplicable.length ? ` / −${report.noLongerApplicable.length}` : ""}`}
							/>
							<Stat
								label={t("reportCovered")}
								value={`${report.alreadyCovered}${report.alreadyPartial ? ` (+${report.alreadyPartial} teilweise)` : ""}`}
							/>
							<Stat
								label={t("reportControls")}
								value={`${report.newControls.length} · ${report.effortBuckets.S} S / ${report.effortBuckets.M} M / ${report.effortBuckets.L} L`}
							/>
							<p className="text-muted-foreground text-xs sm:col-span-4">
								{t("reportCoverage", {
									before: report.coverageBeforePct ?? 0,
									after: report.coverageAfterPct ?? 0,
								})}
								{report.newControls.length > 0 && (
									<>
										{" · "}
										{report.newControls.slice(0, 12).join(", ")}
										{report.newControls.length > 12 ? " …" : ""}
									</>
								)}
							</p>
						</div>
					) : (
						<p className="mt-1 text-muted-foreground">{t("reportNone")}</p>
					)}
				</div>

				{canEdit && (
					<div className="flex justify-end">
						<Button
							variant="brown"
							disabled={pending || !changed}
							onClick={() =>
								start(async () => {
									const res = await withStepUp(() =>
										updateLicenceProfile({
											licenceStage: stage,
											caspServices: services,
										}),
									);
									if (!res.ok) return void handleError(res.error);
									toast.success(
										t("stageChanged", {
											controls: res.data.controlsCreated,
											na: res.data.notApplicable,
										}),
									);
									router.refresh();
								})
							}
						>
							{t("applyStage")}
						</Button>
					</div>
				)}

				<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
					<div>
						<p className="font-medium">{t("tlptCheck")}</p>
						<p className="text-muted-foreground text-xs">
							{tlptConfirmedAt
								? t("tlptConfirmed", {
										date: new Date(tlptConfirmedAt).toLocaleDateString("de-DE"),
										status: tlptDesignated ? t("tlptYes") : t("tlptNo"),
									})
								: t("tlptUnconfirmed")}
						</p>
					</div>
					{canEdit && (
						<Button
							size="sm"
							variant="outline"
							disabled={pending}
							onClick={() =>
								start(async () => {
									const res = await withStepUp(() =>
										confirmSetupFlag({
											key: "tlptConfirmedAt",
										}),
									);
									if (!res.ok) return void handleError(res.error);
									toast.success(t("saved"));
									router.refresh();
								})
							}
						>
							{t("tlptConfirmButton")}
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
				{label}
			</dt>
			<dd className="font-serif-display text-xl text-primary">{value}</dd>
		</div>
	);
}
