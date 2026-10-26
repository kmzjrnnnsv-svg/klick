"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { confirmPasskey, passkeyOptions } from "@wallet/app/actions/auth";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Purpose = "stepup" | "unlock";

// Laufende Sitzung per Passkey bestätigen (Step-up oder Entsperren).
// „cancelled“ = Browser-Dialog geschlossen bzw. abgelaufen.
export async function confirmWithPasskey(
	purpose: Purpose,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const opt = await passkeyOptions(purpose);
	if (!opt.ok) return opt;
	let response: Awaited<ReturnType<typeof startAuthentication>>;
	try {
		response = await startAuthentication({ optionsJSON: opt.data });
	} catch (e) {
		const name = e instanceof Error ? e.name : "";
		return {
			ok: false,
			error:
				name === "NotAllowedError" || name === "AbortError"
					? "cancelled"
					: "invalid",
		};
	}
	const res = await confirmPasskey(purpose, response);
	return res.ok ? { ok: true } : res;
}

export function PasskeyConfirmButton({
	purpose,
	onConfirmed,
}: {
	purpose: Purpose;
	onConfirmed: () => void;
}) {
	const t = useTranslations("Auth");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function run() {
		setBusy(true);
		setError(null);
		try {
			const res = await confirmWithPasskey(purpose);
			if (res.ok) return onConfirmed();
			setError(
				res.error === "cancelled"
					? t("passkeyCancelled")
					: res.error === "expired"
						? t("passkeyExpired")
						: res.error === "security_key_required" ||
								res.error === "no_passkey"
							? t("securityKeyRequired")
							: t("passkeyFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<Button type="button" size="lg" onClick={run} disabled={busy}>
				<KeyRound className="size-4" aria-hidden />
				{busy ? t("confirmPasskeyBusy") : t("confirmPasskey")}
			</Button>
			<p
				role="alert"
				aria-live="polite"
				className="min-h-4 text-destructive text-footnote"
			>
				{error}
			</p>
		</div>
	);
}
