"use client";

import { WebAuthnAbortService } from "@simplewebauthn/browser";
import { authClient } from "@wallet/lib/auth/client";
import { SECURITY_KEY_HINT_COOKIE } from "@wallet/lib/auth/hints";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Ohne Antwort (kein Passkey-Fenster, Server hängt) gibt der Knopf nach
// dieser Zeit wieder frei, statt auf Dauer „Warte …“ zu zeigen
const TIMEOUT_MS = 90_000;

// Grund einer Ablehnung aus dem Hinweis-Cookie (lib/auth/hints.ts), einmal
function takeSecurityKeyHint(): boolean {
	const name = SECURITY_KEY_HINT_COOKIE;
	const hit = document.cookie.split("; ").some((c) => c === `${name}=1`);
	if (hit)
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API fehlt in Firefox
		document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Strict`;
	return hit;
}

// Anmeldung nur per Passkey: Knopf oder Autofill im E-Mail-Feld
// (Conditional UI). Kein Mail-Link, kein Passwort.
export function LoginForm({ next }: { next: string }) {
	const t = useTranslations("Auth");
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Nach einem Abbruch startet die Autofill-Anfrage neu
	const [autofillRound, setAutofillRound] = useState(0);
	const cancelled = useRef(false);

	useEffect(() => {
		void autofillRound;
		let active = true;
		(async () => {
			const pkc = window.PublicKeyCredential as
				| (typeof PublicKeyCredential & {
						isConditionalMediationAvailable?: () => Promise<boolean>;
				  })
				| undefined;
			if (!(await pkc?.isConditionalMediationAvailable?.().catch(() => false)))
				return;
			const res = await authClient.signIn.passkey({ autoFill: true });
			if (active && res && !res.error) {
				router.push(next);
				router.refresh();
			} else if (active && takeSecurityKeyHint())
				setError(t("signInSecurityKey"));
		})();
		return () => {
			active = false;
		};
	}, [router, next, autofillRound, t]);

	async function passkey() {
		setBusy(true);
		setError(null);
		cancelled.current = false;
		// Laufende Autofill-Anfrage vorher beenden: Safari zeigt das
		// Passkey-Fenster sonst manchmal nicht, wenn Abbruch und neue Anfrage
		// unmittelbar aufeinander folgen
		WebAuthnAbortService.cancelCeremony();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<"timeout">((resolve) => {
			timer = setTimeout(() => resolve("timeout"), TIMEOUT_MS);
		});
		const res = await Promise.race([authClient.signIn.passkey(), timeout]);
		clearTimeout(timer);
		setBusy(false);
		if (res !== "timeout" && res && !res.error) {
			router.push(next);
			router.refresh();
			return;
		}
		setAutofillRound((n) => n + 1);
		if (cancelled.current) return;
		if (res === "timeout") {
			WebAuthnAbortService.cancelCeremony();
			return setError(t("passkeyTimeout"));
		}
		const code =
			res?.error && "code" in res.error ? String(res.error.code ?? "") : "";
		if (code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED")
			return setError(t("passkeyCancelled"));
		setError(
			takeSecurityKeyHint() || code === "SECURITY_KEY_REQUIRED"
				? t("signInSecurityKey")
				: t("passkeySignInFailed"),
		);
	}

	function cancel() {
		cancelled.current = true;
		WebAuthnAbortService.cancelCeremony();
		setBusy(false);
		setError(null);
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-2">
				<Button type="button" size="lg" onClick={passkey} disabled={busy}>
					<Fingerprint aria-hidden /> {busy ? t("passkeyBusy") : t("passkey")}
				</Button>
				{busy && (
					<Button
						type="button"
						variant="ghost"
						onClick={cancel}
						className="self-center"
					>
						{t("passkeyCancel")}
					</Button>
				)}
			</div>
			<p
				role="alert"
				aria-live="polite"
				className="min-h-4 text-destructive text-subhead"
			>
				{error}
			</p>
			<div className="grid gap-2">
				<Label htmlFor="email">{t("email")}</Label>
				<Input
					id="email"
					type="email"
					name="email"
					autoComplete="username webauthn"
					spellCheck={false}
					placeholder="name@firma.de …"
				/>
				<p className="text-muted-foreground text-footnote">{t("emailHint")}</p>
			</div>
		</div>
	);
}
