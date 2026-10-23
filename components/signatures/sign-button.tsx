"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	prepareEvidenceSignature,
	submitEvidenceSignature,
} from "@/app/actions/signatures";
import { Button } from "@/components/ui/button";

// Mit dem eigenen Passkey unterschreiben: ein Nachweis oder viele auf einmal
// (Sammelunterschrift über die Merkle-Wurzel). Der Browser fragt nach
// Fingerabdruck, Gesicht oder PIN — ohne Nutzerverifikation gilt nichts.
export function SignButton({
	evidenceIds,
	fn = "-",
	label,
	size = "sm",
	variant = "outline",
}: {
	evidenceIds: string[];
	fn?: string;
	label: string;
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
				purpose: "approve",
			});
			if (!prep.ok)
				return void toast.error(
					prep.error === "no_passkey" ? t("noPasskey") : t("prepareFailed"),
				);
			let response: Awaited<ReturnType<typeof startAuthentication>>;
			try {
				response = await startAuthentication({
					optionsJSON: prep.data.options,
				});
			} catch {
				return void toast.error(t("cancelled"));
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
						: res.error === "invalid"
							? t("invalid")
							: tc("error"),
				);
			toast.success(t("signed", { count: res.data.count }));
			router.refresh();
		});
	return (
		<Button
			type="button"
			size={size}
			variant={variant}
			className={size === "sm" ? "h-7 gap-1.5 px-2.5 text-xs" : "gap-1.5"}
			disabled={pending || evidenceIds.length === 0}
			onClick={run}
		>
			<PenLine className="size-3.5" aria-hidden="true" />
			{pending ? t("signing") : label}
		</Button>
	);
}
