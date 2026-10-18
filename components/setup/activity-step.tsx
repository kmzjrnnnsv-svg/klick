"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveActivity } from "@/app/actions/setup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	CASP_SERVICES,
	type CaspService,
	LICENCE_STAGES,
	type LicenceStage,
} from "@/db/schema/enums";
import type { Sector } from "@/lib/compliance/company-profile";
import { useStepRunner } from "./step-footer";

const SECTORS: { value: Sector; key: string }[] = [
	{ value: "casp", key: "sectorCasp" },
	{ value: "payment", key: "sectorPayment" },
	{ value: "emi", key: "sectorEmi" },
	{ value: "bank", key: "sectorBank" },
	{ value: "other", key: "sectorOther" },
];
const TOKENS = ["none", "art", "emt", "other"] as const;

type Activity = {
	sector: Sector;
	licenceStage: LicenceStage;
	caspServices: CaspService[];
	issuesTokens: (typeof TOKENS)[number];
	digitalProducts: boolean;
};

// Schritt 4 (D3): Tätigkeit, Lizenzstufe, Krypto-Dienste, Token-Ausgabe,
// Produkte — Anwendbarkeit und Arbeitsvorrat folgen sofort.
export function ActivityStep({
	initial,
	nextHref,
}: {
	initial: Activity;
	nextHref: string;
}) {
	const t = useTranslations("Setup");
	const to = useTranslations("Onboarding");
	const { pending, run } = useStepRunner(nextHref);
	const [d, setD] = useState<Activity>(initial);
	const showCasp = d.sector === "casp" || d.caspServices.length > 0;

	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(e) => {
				e.preventDefault();
				run(() => saveActivity(d));
			}}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ac-sector">{to("sector")}</Label>
					<Select
						value={d.sector}
						onValueChange={(v) => setD({ ...d, sector: v as Sector })}
					>
						<SelectTrigger id="ac-sector" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SECTORS.map((s) => (
								<SelectItem key={s.value} value={s.value}>
									{to(s.key as "sectorCasp")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ac-stage">{to("licenceStage")}</Label>
					<Select
						value={d.licenceStage}
						onValueChange={(v) =>
							setD({ ...d, licenceStage: v as LicenceStage })
						}
					>
						<SelectTrigger id="ac-stage" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LICENCE_STAGES.map((s, i) => (
								<SelectItem key={s} value={s}>
									{to(`stage${i}` as "stage0")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<Label htmlFor="ac-tokens">{t("issuesTokens")}</Label>
					<Select
						value={d.issuesTokens}
						onValueChange={(v) =>
							setD({ ...d, issuesTokens: v as Activity["issuesTokens"] })
						}
					>
						<SelectTrigger id="ac-tokens" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TOKENS.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`tokens_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{showCasp && (
				<fieldset className="flex flex-col gap-2 text-sm">
					<legend className="mb-1.5 font-medium">{to("caspServices")}</legend>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{CASP_SERVICES.map((s) => (
							<label key={s} className="flex items-center gap-2">
								<Checkbox
									checked={d.caspServices.includes(s)}
									onCheckedChange={(v) =>
										setD({
											...d,
											caspServices: v
												? [...d.caspServices, s]
												: d.caspServices.filter((x) => x !== s),
										})
									}
								/>
								{to(`service_${s}`)}
							</label>
						))}
					</div>
				</fieldset>
			)}

			<label className="flex items-start gap-2 text-sm">
				<Checkbox
					className="mt-0.5"
					checked={d.digitalProducts}
					onCheckedChange={(v) => setD({ ...d, digitalProducts: Boolean(v) })}
				/>
				{t("digitalProducts")}
			</label>

			<div className="flex justify-end">
				<Button type="submit" variant="brown" disabled={pending}>
					{t("saveNext")}
				</Button>
			</div>
		</form>
	);
}
