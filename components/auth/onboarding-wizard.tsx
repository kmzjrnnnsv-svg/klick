"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { createOrganizationAction } from "@/app/actions/onboarding";
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
import { ROLE_FUNCTIONS, type RoleFunction } from "@/db/schema/enums";
import { slugify } from "@/lib/setup/labels";

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
	const [fn, setFn] = useState<RoleFunction | "none">("management_body");
	const [baseline, setBaseline] = useState(false);
	const [terms, setTerms] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setSlugError(null);
		const res = await createOrganizationAction({
			name,
			slug,
			ownFunction: fn === "none" ? undefined : fn,
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
			else toast.error(tc("error"));
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
					<p id="ob-slug-error" className="text-destructive text-xs">
						{slugError}
					</p>
				)}
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ob-fn">{t("ownFunction")}</Label>
				<Select value={fn} onValueChange={(v) => setFn(v as typeof fn)}>
					<SelectTrigger id="ob-fn" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ROLE_FUNCTIONS.filter((f) => f !== "other").map((f) => (
							<SelectItem key={f} value={f}>
								{tf(f)}
							</SelectItem>
						))}
						<SelectItem value="none">{t("ownFunctionNone")}</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-xs">{t("ownFunctionHint")}</p>
			</div>
			{canApplyBaseline && (
				<label className="flex items-start gap-2 text-sm">
					<Checkbox
						id="ob-baseline"
						checked={baseline}
						onCheckedChange={(v) => setBaseline(Boolean(v))}
						className="mt-0.5"
					/>
					{t("applyBaseline")}
				</label>
			)}
			<div className="flex items-start gap-2 text-sm">
				<Checkbox
					id="ob-terms"
					required
					checked={terms}
					onCheckedChange={(v) => setTerms(Boolean(v))}
					className="mt-0.5"
				/>
				<label htmlFor="ob-terms" className="text-sm leading-snug">
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
			<p className="text-muted-foreground text-xs">{t("nextSteps")}</p>
		</form>
	);
}
