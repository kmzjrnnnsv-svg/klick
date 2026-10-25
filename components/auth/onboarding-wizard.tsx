"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createOrganizationAction } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { ROLE_FUNCTIONS, type RoleFunction } from "@/db/schema/enums";
import { slugify } from "@/lib/setup/labels";
import { cn } from "@/lib/utils";

// Onboarding (D0): nur Name, Kurzname und die eigene Funktion — danach
// begleitet die geführte Einrichtung durch Rollen, Profil, Rahmenwerke und
// Gap-Analyse (/einrichtung/rollen).
export function OnboardingWizard({
	canApplyBaseline,
}: {
	canApplyBaseline: boolean;
}) {
	const t = useTranslations("Onboarding");
	const tf = useTranslations("Functions");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [slugError, setSlugError] = useState<string | null>(null);
	// eigene Funktionen: mehrere möglich (z. B. Geschäftsführung und ISB)
	const [fns, setFns] = useState<RoleFunction[]>(["management_body"]);
	const [baseline, setBaseline] = useState(false);
	const [terms, setTerms] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setSlugError(null);
		const res = await createOrganizationAction({
			name,
			slug,
			ownFunctions: fns,
			applyBaseline: canApplyBaseline && baseline,
			termsAccepted: terms,
		});
		setBusy(false);
		if (!res.ok) {
			if (res.error === "slugTaken") setSlugError(t("slugTaken"));
			else if (res.error === "alreadyMember") {
				toast.error(t("alreadyMember"));
				router.replace("/heute");
			} else if (res.fieldErrors?.slug) setSlugError(t("slugInvalid"));
			else toast.error(errorText(tc, res));
			return;
		}
		toast.success(t("created"));
		// Kein router.refresh() — das würde /onboarding neu rendern, und dessen
		// Mitglieds-Redirect (/heute) überholt den Wechsel.
		router.replace("/einrichtung/rollen");
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-5">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ob-name">{t("orgName")}</Label>
				<Input
					id="ob-name"
					required
					maxLength={200}
					autoComplete="organization"
					value={name}
					onChange={(e) => {
						setName(e.target.value);
						if (!slugEdited) setSlug(slugify(e.target.value));
					}}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ob-slug">{t("orgSlug")}</Label>
				<Input
					id="ob-slug"
					required
					minLength={2}
					maxLength={48}
					spellCheck={false}
					autoCapitalize="none"
					value={slug}
					aria-invalid={slugError ? true : undefined}
					aria-describedby={slugError ? "ob-slug-error" : undefined}
					onChange={(e) => {
						setSlugEdited(true);
						setSlug(e.target.value.toLowerCase());
					}}
				/>
				{slugError && (
					<p id="ob-slug-error" className="text-destructive text-footnote">
						{slugError}
					</p>
				)}
			</div>
			<fieldset className="flex flex-col gap-2">
				<legend className="mb-1.5 font-medium text-subhead">
					{t("ownFunction")}
				</legend>
				<div className="flex flex-wrap gap-2">
					{ROLE_FUNCTIONS.filter((f) => f !== "other").map((f) => {
						const on = fns.includes(f);
						return (
							<button
								key={f}
								type="button"
								aria-pressed={on}
								onClick={() =>
									setFns((xs) => (on ? xs.filter((x) => x !== f) : [...xs, f]))
								}
								className={cn(
									"inline-flex h-(--control-h-sm) items-center gap-1.5 rounded-full px-3 font-medium text-footnote transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									on
										? "bg-primary-fill text-white"
										: "bg-muted text-foreground hover:bg-foreground/12",
								)}
							>
								{on && <Check aria-hidden="true" className="size-3.5" />}
								{tf(f)}
							</button>
						);
					})}
				</div>
				<p className="text-muted-foreground text-footnote">
					{fns.length === 0 ? t("ownFunctionNone") : t("ownFunctionHint")}
				</p>
			</fieldset>
			{canApplyBaseline && (
				<label className="flex items-start gap-2 text-subhead">
					<Checkbox
						id="ob-baseline"
						checked={baseline}
						onCheckedChange={(v) => setBaseline(Boolean(v))}
						className="mt-0.5"
					/>
					{t("applyBaseline")}
				</label>
			)}
			<div className="flex items-start gap-2 text-subhead">
				<Checkbox
					id="ob-terms"
					required
					checked={terms}
					onCheckedChange={(v) => setTerms(Boolean(v))}
					className="mt-0.5"
				/>
				<label htmlFor="ob-terms" className="text-subhead leading-snug">
					{t.rich("termsLabel", {
						terms: (chunks) => (
							<a
								href="/nutzungsbedingungen"
								target="_blank"
								rel="noopener"
								className="underline underline-offset-4"
							>
								{chunks}
							</a>
						),
					})}{" "}
					{t.rich("privacyHint", {
						privacy: (chunks) => (
							<a
								href="/datenschutz-erklaerung"
								target="_blank"
								rel="noopener"
								className="underline underline-offset-4"
							>
								{chunks}
							</a>
						),
					})}
				</label>
			</div>
			<Button
				type="submit"
				disabled={busy || !name.trim() || slug.length < 2 || !terms}
			>
				{t("createAndContinue")}
			</Button>
			<p className="text-muted-foreground text-footnote">{t("nextSteps")}</p>
		</form>
	);
}
