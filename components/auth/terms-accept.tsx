"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { acceptTerms } from "@/app/actions/terms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";

// Erster Einstieg einer Inhaber:in in eine Organisation, die der Klick-
// Betrieb angelegt hat: Nutzungsbedingungen bestätigen, dann weiter.
export function TermsAccept() {
	const t = useTranslations("TermsGate");
	const to = useTranslations("Onboarding");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [checked, setChecked] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				setError(null);
				start(async () => {
					const res = await acceptTerms(checked);
					if (!res.ok) {
						setError(
							res.error === "terms_required"
								? t("required")
								: errorText(tc, res),
						);
						return;
					}
					router.replace("/heute");
					router.refresh();
				});
			}}
		>
			<div className="flex items-start gap-3 rounded-2xl bg-card p-4">
				<Checkbox
					id="terms-accept"
					required
					checked={checked}
					onCheckedChange={(v) => setChecked(Boolean(v))}
					className="mt-0.5"
				/>
				<label htmlFor="terms-accept" className="text-subhead leading-snug">
					{t.rich("label", {
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
					{to.rich("privacyHint", {
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
			<FormAlert message={error} />
			<Button type="submit" disabled={pending || !checked}>
				{pending ? tc("saving") : t("submit")}
			</Button>
		</form>
	);
}
