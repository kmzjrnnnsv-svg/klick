"use client";

import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
	prepareEvidenceSignature,
	submitEvidenceSignature,
} from "@/app/actions/signatures";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Mit dem eigenen Passkey unterschreiben: ein Nachweis oder viele auf einmal
// (Sammelunterschrift über die Merkle-Wurzel). Der Browser fragt nach
// Fingerabdruck, Gesicht oder PIN — ohne Nutzerverifikation gilt nichts.
export function SignButton({
	evidenceIds,
	fn = "-",
	purpose = "approve",
	label,
	fullLabel,
	size = "sm",
	variant = "outline",
}: {
	evidenceIds: string[];
	fn?: string;
	// approve = Freigabe, acknowledge = Kenntnisnahme (z. B. Bericht an die GL)
	purpose?: "approve" | "acknowledge" | "review";
	label: string;
	// ausführlicher Name für Screenreader/Tooltip (enthält `label`)
	fullLabel?: string;
	size?: "sm" | "default";
	variant?: "outline" | "default";
}) {
	const t = useTranslations("Signatures");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const run = () =>
		start(async () => {
			const prep = await prepareEvidenceSignature({
				evidenceIds,
				function: fn,
				purpose,
			});
			if (!prep.ok)
				return void toast.error(
					prep.error === "no_passkey"
						? t("noPasskey")
						: prep.error === "security_key_required"
							? t("securityKeyRequired")
							: t("prepareFailed"),
				);
			let response: AuthenticationResponseJSON;
			try {
				const { startAuthentication } = await import("@simplewebauthn/browser");
				response = await startAuthentication({
					optionsJSON: prep.data.options,
				});
			} catch {
				// Abbrechen ist kein Fehler: kurze, neutrale Meldung
				return void toast(t("cancelled"));
			}
			const res = await submitEvidenceSignature({
				evidenceIds,
				text: prep.data.text,
				seal: prep.data.seal,
				response,
			});
			if (!res.ok)
				return void toast.error(
					res.error === "expired"
						? t("expired")
						: res.error === "security_key_required"
							? t("securityKeyRequired")
							: res.error === "invalid"
								? t("invalid")
								: errorText(tc, res),
				);
			toast.success(t("signed", { count: res.data.count }));
			router.refresh();
		});
	return (
		<Button
			type="button"
			size={size}
			variant={variant}
			className={
				size === "sm"
					? "h-(--control-h-sm) gap-1.5 px-2.5 text-footnote"
					: "gap-1.5"
			}
			disabled={pending || evidenceIds.length === 0}
			onClick={run}
			title={fullLabel}
			aria-label={fullLabel}
		>
			<PenLine className="size-3.5" aria-hidden="true" />
			{pending ? t("signing") : label}
		</Button>
	);
}
