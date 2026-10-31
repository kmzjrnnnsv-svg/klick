"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveSignaturePolicy } from "@/app/actions/signature-policy";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { errorText, isFourEyesNotice } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

// Unterschriften nur mit Sicherheitsschlüssel (AP9.1b): einschalten sofort,
// ausschalten über Vier-Augen (Hinweis statt Fehler)
export function SignaturePolicyPanel({
	securityKeysOnly,
	isOwner,
}: {
	securityKeysOnly: boolean;
	isOwner: boolean;
}) {
	const t = useTranslations("SignaturePolicy");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const change = (next: boolean) =>
		start(async () => {
			setError(null);
			const res = await withStepUp(() =>
				saveSignaturePolicy({ securityKeysOnly: next }),
			);
			if (res.ok) {
				toast.success(t("saved"));
				router.refresh();
				return;
			}
			if (isFourEyesNotice(res)) {
				toast.notice(errorText(tc, res));
				router.refresh();
				return;
			}
			if (res.error !== "step_up_required") setError(errorText(tc, res));
		});
	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-title-3">{t("title")}</h2>
			<p className="text-muted-foreground text-subhead">{t("lead")}</p>
			<div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3">
				<Label
					htmlFor="sig-keys-only"
					className="flex flex-col items-start gap-0.5 text-left"
				>
					<span>{t("keysOnly")}</span>
					<span className="font-normal text-footnote text-muted-foreground">
						{isOwner ? t("keysOnlyHint") : t("ownerOnly")}
					</span>
				</Label>
				<Switch
					id="sig-keys-only"
					checked={securityKeysOnly}
					disabled={!isOwner || pending}
					onCheckedChange={change}
				/>
			</div>
			<p className="text-footnote text-muted-foreground">{t("note")}</p>
			<FormAlert message={error} />
		</section>
	);
}
