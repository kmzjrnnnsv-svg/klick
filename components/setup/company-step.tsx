"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveCompanyProfile } from "@/app/actions/setup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { EntityProfile } from "@/db/schema/platform";
import {
	classifyCompany,
	NIS2_SECTORS,
	type Sector,
} from "@/lib/compliance/company-profile";
import { useStepRunner } from "./step-footer";

const CUSTOMER_TYPES = ["b2b", "b2c", "public"] as const;
const num = (v: string): number | undefined => {
	const n = Number(v.replace(/\./g, "").replace(",", "."));
	return v.trim() && Number.isFinite(n) ? n : undefined;
};

// Schritt 2 (D2): Unternehmen und Größe mit Live-Einstufung (KMU-Klasse,
// NIS2) — gespeichert im Profil (org_settings.entity_profile).
export function CompanyStep({
	initial,
	sector,
	nextHref,
}: {
	initial: EntityProfile;
	sector: Sector;
	nextHref: string;
}) {
	const t = useTranslations("Setup");
	const { pending, run } = useStepRunner(nextHref);
	const [d, setD] = useState({
		legalForm: initial.legalForm ?? "",
		registerNumber: initial.registerNumber ?? "",
		country: initial.country ?? "DE",
		employees: initial.employees?.toString() ?? "",
		revenueEur: initial.revenueEur?.toString() ?? "",
		totalAssetsEur: initial.totalAssetsEur?.toString() ?? "",
		nis2Sector: initial.nis2Sector ?? "none",
		customerTypes: initial.customerTypes ?? [],
	});
	const cls = classifyCompany(
		{
			employees: num(d.employees),
			revenueEur: num(d.revenueEur),
			totalAssetsEur: num(d.totalAssetsEur),
			nis2Sector: d.nis2Sector === "none" ? undefined : d.nis2Sector,
		},
		sector,
	);
	const field = (
		key: "legalForm" | "registerNumber" | "country",
		props: React.InputHTMLAttributes<HTMLInputElement> = {},
	) => (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={`co-${key}`}>{t(key)}</Label>
			<Input
				id={`co-${key}`}
				value={d[key]}
				onChange={(e) => setD({ ...d, [key]: e.target.value })}
				{...props}
			/>
		</div>
	);
	const money = (key: "employees" | "revenueEur" | "totalAssetsEur") => (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={`co-${key}`}>{t(key)}</Label>
			<Input
				id={`co-${key}`}
				inputMode="numeric"
				value={d[key]}
				onChange={(e) => setD({ ...d, [key]: e.target.value })}
			/>
		</div>
	);

	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(e) => {
				e.preventDefault();
				run(() =>
					saveCompanyProfile({
						legalForm: d.legalForm,
						registerNumber: d.registerNumber,
						country: d.country,
						employees: num(d.employees),
						revenueEur: num(d.revenueEur),
						totalAssetsEur: num(d.totalAssetsEur),
						nis2Sector: d.nis2Sector === "none" ? "" : d.nis2Sector,
						customerTypes: d.customerTypes,
					}),
				);
			}}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				{field("legalForm", { placeholder: "GmbH", autoComplete: "off" })}
				{field("registerNumber", {
					placeholder: "HRB 12345",
					autoComplete: "off",
				})}
				{field("country", {
					maxLength: 2,
					autoComplete: "country",
					spellCheck: false,
				})}
				{money("employees")}
				{money("revenueEur")}
				{money("totalAssetsEur")}
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="co-nis2">{t("nis2Sector")}</Label>
				<Select
					value={d.nis2Sector}
					onValueChange={(v) => setD({ ...d, nis2Sector: v })}
				>
					<SelectTrigger id="co-nis2" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">{t("nis2None")}</SelectItem>
						{NIS2_SECTORS.map((s) => (
							<SelectItem key={s.key} value={s.key}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<fieldset className="flex flex-wrap gap-4 text-sm">
				<legend className="mb-1.5 font-medium text-sm">
					{t("customerTypes")}
				</legend>
				{CUSTOMER_TYPES.map((c) => (
					<label key={c} className="flex items-center gap-2">
						<Checkbox
							checked={d.customerTypes.includes(c)}
							onCheckedChange={(v) =>
								setD({
									...d,
									customerTypes: v
										? [...d.customerTypes, c]
										: d.customerTypes.filter((x) => x !== c),
								})
							}
						/>
						{t(`customer_${c}`)}
					</label>
				))}
			</fieldset>

			<section
				aria-live="polite"
				className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4 text-sm"
			>
				<h2 className="font-medium">{t("classification")}</h2>
				<div className="flex flex-wrap gap-2">
					<Badge variant="outline">
						{cls.size ? t(`size_${cls.size}`) : t("sizeUnknown")}
					</Badge>
					<Badge
						variant={
							cls.nis2 === "essential" || cls.nis2 === "important"
								? "warning"
								: "muted"
						}
					>
						{t(`nis2_${cls.nis2}`)}
					</Badge>
				</div>
				<ul className="list-disc pl-5 text-muted-foreground text-xs">
					{cls.reasons.map((r) => (
						<li key={r}>{r}</li>
					))}
				</ul>
				<p className="text-[0.7rem] text-muted-foreground">
					{t("noLegalAdvice")}
				</p>
			</section>

			<div className="flex justify-end">
				<Button type="submit" disabled={pending}>
					{t("saveNext")}
				</Button>
			</div>
		</form>
	);
}
