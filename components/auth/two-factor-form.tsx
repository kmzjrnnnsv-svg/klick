"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { verifyStepUp } from "@/app/actions/security";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { PasskeyConfirmButton } from "./passkey-confirm";

// Seite vor dem Export-Klick (Referrer bleibt über die 303-Weiterleitung
// erhalten); nur eigene Herkunft, nie zurück auf Login-Seiten.
function backPath(): string {
	try {
		const ref = new URL(document.referrer);
		if (
			ref.origin === window.location.origin &&
			!ref.pathname.startsWith("/login")
		)
			return `${ref.pathname}${ref.search}`;
	} catch {
		// kein oder ungültiger Referrer
	}
	return "/heute";
}

// Zweiter Faktor beim Login oder als Step-up für eine sensible Aktion
// (setzt session.mfaVerifiedAt bzw. stepUpAt). Passkey zuerst; der Code
// (TOTP, beim Login auch Backup-Code) nur, wenn TOTP eingerichtet ist.
export function TwoFactorForm({
	stepUp,
	returnTo,
	passkey,
	totp,
}: {
	stepUp: boolean;
	returnTo: string;
	passkey: boolean;
	totp: boolean;
}) {
	const t = useTranslations("Auth");
	const router = useRouter();
	const [code, setCode] = useState("");
	const [useBackup, setUseBackup] = useState(false);
	const [busy, setBusy] = useState(false);
	// Fehler am Feld statt im Toast (gesperrt bzw. falscher Code)
	const [error, setError] = useState<string | null>(null);
	const [downloading, setDownloading] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			if (stepUp) {
				const res = await verifyStepUp(code.trim());
				if (!res.ok) {
					setError(res.error === "locked" ? t("locked") : t("invalidCode"));
					return;
				}
			} else {
				const res = useBackup
					? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
					: await authClient.twoFactor.verifyTotp({
							code: code.trim(),
							trustDevice: false,
						});
				if (res.error) {
					// Sitzung weg (abgelaufen/widerrufen): zurück zum Login statt
					// „Code ungültig“ in einer Schleife.
					if (res.error.code === "INVALID_TWO_FACTOR_COOKIE") {
						router.replace("/login?grund=sitzung-abgelaufen");
						return;
					}
					const msg = res.error.message ?? "";
					setError(/lock/i.test(msg) ? t("locked") : t("invalidCode"));
					return;
				}
			}
			proceed();
		} finally {
			setBusy(false);
			setCode("");
		}
	}

	function proceed() {
		// Rückweg auf eine Export-Route (ZIP): als echter Download laden —
		// eine Client-Navigation lädt die API-Route als Seite ins Leere.
		if (returnTo.startsWith("/api/")) {
			window.location.assign(returnTo);
			setDownloading(true);
			return;
		}
		router.replace(returnTo);
		router.refresh();
	}

	async function signOut() {
		await authClient.signOut().catch(() => {});
		router.replace("/login");
		router.refresh();
	}

	if (downloading) {
		return (
			<div className="flex flex-col gap-4" aria-live="polite">
				<p className="text-subhead">{t("downloadStarted")}</p>
				<Button onClick={() => router.replace(backPath())}>
					{t("downloadBack")}
				</Button>
			</div>
		);
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			{passkey && (
				<PasskeyConfirmButton
					purpose={stepUp ? "stepup" : "mfa"}
					autoFocus
					onConfirmed={proceed}
				/>
			)}
			{passkey && totp && (
				<p className="text-muted-foreground text-footnote">{t("orCode")}</p>
			)}
			{totp && (
				<>
					<div className="grid gap-2">
						<Label htmlFor="code">
							{useBackup ? t("backupCode") : t("code")}
						</Label>
						<Input
							id="code"
							inputMode={useBackup ? "text" : "numeric"}
							autoComplete="one-time-code"
							autoFocus={!passkey}
							required
							value={code}
							onChange={(e) => setCode(e.target.value)}
							aria-invalid={error ? true : undefined}
							className="font-mono text-lg"
						/>
					</div>
					<FormAlert message={error} />
					<Button
						type="submit"
						variant={passkey ? "outline" : "default"}
						disabled={busy || code.trim().length < 6}
					>
						{t("verify")}
					</Button>
				</>
			)}
			{!stepUp && totp && (
				<button
					type="button"
					onClick={() => setUseBackup((v) => !v)}
					className="text-left text-primary text-footnote hover:underline"
				>
					{useBackup ? t("useTotp") : t("useBackupCode")}
				</button>
			)}
			{!stepUp && (
				<button
					type="button"
					onClick={signOut}
					className="text-left text-muted-foreground text-footnote hover:underline"
				>
					{t("signOut")}
				</button>
			)}
		</form>
	);
}
