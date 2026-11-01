"use client";

import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { confirmPasskey, passkeyOptions } from "@/app/actions/security";
import { Button } from "@/components/ui/button";

type Purpose = "mfa" | "stepup";

// WebAuthn erst laden, wenn bestätigt wird (nicht im Rahmen jeder Seite);
// die Knöpfe laden vorab, sobald sie erscheinen.
export const loadWebAuthn = () => import("@simplewebauthn/browser");

// Passkey für die laufende Sitzung bestätigen (zweiter Faktor oder Step-up).
// „cancelled“ = Browser-Dialog geschlossen bzw. abgelaufen.
export async function confirmWithPasskey(
	purpose: Purpose,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const opt = await passkeyOptions(purpose);
	if (!opt.ok) return opt;
	let response: AuthenticationResponseJSON;
	try {
		const { startAuthentication } = await loadWebAuthn();
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
	autoFocus,
}: {
	purpose: Purpose;
	onConfirmed: () => void;
	autoFocus?: boolean;
}) {
	const t = useTranslations("Auth");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// vorab laden, damit der Klick nicht auf den Download wartet
	useEffect(() => {
		void loadWebAuthn();
	}, []);

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
						: t("passkeyFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<Button type="button" onClick={run} disabled={busy} autoFocus={autoFocus}>
				<KeyRound className="size-4" aria-hidden />
				{busy ? t("confirmPasskeyBusy") : t("confirmPasskey")}
			</Button>
			{error && (
				<p role="alert" className="text-destructive text-footnote">
					{error}
				</p>
			)}
		</div>
	);
}
