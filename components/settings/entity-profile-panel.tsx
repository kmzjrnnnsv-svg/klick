"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateEntityProfile } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityProfile } from "@/db/schema/platform";

// Stammdaten der Organisation für Meldungen — LEI, Sitzland, Behörde,
// Bilanzsumme, Rechtsform, Registernummer. Pflicht fürs Informationsregister
// (B_01.01/B_01.02) und fürs Lieferantenpaket.
export function EntityProfilePanel({
	orgName,
	profile,
	canEdit,
}: {
	orgName: string;
	profile: EntityProfile;
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [state, setState] = useState({
		lei: profile.lei ?? "",
		country: profile.country ?? "DE",
		competentAuthority: profile.competentAuthority ?? "",
		totalAssetsEur:
			profile.totalAssetsEur === undefined
				? ""
				: String(profile.totalAssetsEur),
		legalForm: profile.legalForm ?? "",
		registerNumber: profile.registerNumber ?? "",
	});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const field = (
		key: keyof typeof state,
		label: string,
		props: React.ComponentProps<typeof Input> = {},
	) => (
		<div className="flex flex-col gap-1">
			<Label htmlFor={`ep-${key}`}>{label}</Label>
			<Input
				id={`ep-${key}`}
				value={state[key]}
				disabled={!canEdit}
				onChange={(e) => setState({ ...state, [key]: e.target.value })}
				aria-invalid={errors[key] ? true : undefined}
				{...props}
			/>
			{errors[key] && <p className="text-destructive text-xs">{errors[key]}</p>}
		</div>
	);
	return (
		<form
			className="flex flex-col gap-4 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await updateEntityProfile(state);
					if (!res.ok) {
						setErrors(
							Object.fromEntries(
								Object.entries(res.fieldErrors ?? {}).map(([k, v]) => [
									k,
									Array.isArray(v) ? v.join(", ") : String(v),
								]),
							),
						);
						toast.error(
							res.error === "step_up_required" ? t("stepUp") : tc("error"),
						);
					} else {
						setErrors({});
						toast.success(t("saved"));
						router.refresh();
					}
				});
			}}
		>
			<div>
				<p className="font-serif-display text-xl text-primary">{orgName}</p>
				<p className="mt-1 text-muted-foreground">{t("entityProfileLead")}</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				{field("lei", t("lei"), {
					placeholder: "5299000HVJYR6QP3DK12",
					maxLength: 20,
					className: "font-mono",
				})}
				{field("country", t("country"), { maxLength: 2, className: "w-24" })}
				{field("competentAuthority", t("competentAuthority"), {
					placeholder: "BaFin",
				})}
				{field("totalAssetsEur", t("totalAssets"), {
					type: "number",
					min: 0,
					step: 1000,
				})}
				{field("legalForm", t("legalForm"), { placeholder: "GmbH" })}
				{field("registerNumber", t("registerNumber"), {
					placeholder: "HRB 12345 (Frankfurt am Main)",
				})}
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
