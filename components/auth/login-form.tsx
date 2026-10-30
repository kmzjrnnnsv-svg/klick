"use client";

import { WebAuthnAbortService } from "@simplewebauthn/browser";
import { Building2, Fingerprint } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
	BLOCKED_HINT_COOKIE,
	SSO_HINT_COOKIE,
} from "@/lib/auth/account-status";
import { authClient } from "@/lib/auth/client";

// Hinweis-Cookie nach Passkey-Anmeldung eines gesperrten Kontos bzw. bei
// erzwungenem SSO lesen und sofort löschen (lib/auth/account-status.ts).
function takeHint(name: string): boolean {
	const hit = document.cookie.split("; ").some((c) => c === `${name}=1`);
	if (hit)
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API fehlt in Firefox
		document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Strict`;
	return hit;
}
const takeBlockedHint = () => takeHint(BLOCKED_HINT_COOKIE);
const takeSsoHint = () => takeHint(SSO_HINT_COOKIE);

// Ohne Antwort (kein Passkey-Fenster, Server hängt) gibt der Knopf nach
// dieser Zeit wieder frei, statt auf Dauer „Warte …“ zu zeigen
const TIMEOUT_MS = 90_000;

// Anmeldung „Passkey zuerst“ (ADR-019): Passkey als Hauptweg — per Knopf
// oder über das Autofill des E-Mail-Felds (Conditional UI) —, dazu SSO und
// Microsoft. Der Mail-Link ist der Notweg unter /login/notweg.
export function LoginForm({
	microsoftEnabled,
	signupAllowed,
	next,
}: {
	microsoftEnabled: boolean;
	signupAllowed: boolean;
	// Ziel nach dem Login (?weiter=, z. B. /einladung/…), bereits geprüft.
	next: string | null;
}) {
	const t = useTranslations("Auth");
	const router = useRouter();
	const target = next ?? "/heute";
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState<"passkey" | "microsoft" | "sso" | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	// Nach dem Knopf-Aufruf startet die Autofill-Anfrage neu
	const [autofillRound, setAutofillRound] = useState(0);
	// Zählt Knopf-Aufrufe: ein abgebrochener oder abgelöster Aufruf meldet
	// sich danach nicht mehr (kein „Abgebrochen“ über einem neuen Versuch)
	const attempt = useRef(0);
	const notweg = next
		? `/login/notweg?weiter=${encodeURIComponent(next)}`
		: "/login/notweg";

	const blockedText = t("accountBlocked");
	const ssoText = t("ssoRequired");

	// Conditional UI: der Browser bietet gespeicherte Passkeys direkt im
	// E-Mail-Feld an. Bricht still ab, sobald der Knopf benutzt wird.
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
			if (active && res?.error && takeSsoHint()) setError(ssoText);
			else if (active && res?.error && takeBlockedHint()) setError(blockedText);
			if (active && res && !res.error) {
				router.push(target);
				router.refresh();
			}
		})();
		return () => {
			active = false;
		};
	}, [router, target, blockedText, ssoText, autofillRound]);

	// Laufende Passkey-Anfrage beenden (Autofill oder Knopf), z. B. vor SSO
	function stopPasskey() {
		attempt.current++;
		WebAuthnAbortService.cancelCeremony();
	}

	async function passkey() {
		const mine = ++attempt.current;
		setBusy("passkey");
		setError(null);
		// Laufende Autofill-Anfrage vorher beenden: Safari zeigt das
		// Passkey-Fenster sonst manchmal nicht, wenn Abbruch und neue Anfrage
		// unmittelbar aufeinander folgen (dazwischen liegt so der Abruf der
		// Optionen)
		WebAuthnAbortService.cancelCeremony();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<"timeout">((resolve) => {
			timer = setTimeout(() => resolve("timeout"), TIMEOUT_MS);
		});
		const res = await Promise.race([authClient.signIn.passkey(), timeout]);
		clearTimeout(timer);
		if (mine !== attempt.current) return;
		if (res !== "timeout" && res && !res.error) {
			router.push(target);
			router.refresh();
			return;
		}
		setBusy(null);
		setAutofillRound((n) => n + 1);
		if (res === "timeout") {
			WebAuthnAbortService.cancelCeremony();
			setError(t("passkeyTimeout"));
			return;
		}
		const code =
			res?.error && "code" in res.error ? String(res.error.code ?? "") : "";
		if (code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED") {
			setError(t("passkeyCancelled"));
			return;
		}
		setError(
			code === "SSO_REQUIRED" || takeSsoHint()
				? t("ssoRequired")
				: code === "BANNED_USER" || takeBlockedHint()
					? t("accountBlocked")
					: t("passkeySignInFailed"),
		);
	}

	function cancel() {
		stopPasskey();
		setBusy(null);
		setError(null);
		setAutofillRound((n) => n + 1);
	}

	async function microsoft() {
		if (busy === "passkey") stopPasskey();
		setError(null);
		setBusy("microsoft");
		await authClient.signIn.social({
			provider: "microsoft",
			callbackURL: target,
		});
	}

	// SSO der eigenen Organisation: Provider wird über die E-Mail-Domain
	// gefunden (verifizierte Domain), dann Redirect zum IdP.
	async function sso() {
		const address = email.trim().toLowerCase();
		if (!address.includes("@")) {
			toast.error(t("ssoNeedsEmail"));
			return;
		}
		if (busy === "passkey") stopPasskey();
		setError(null);
		setBusy("sso");
		const res = await authClient.signIn.sso({
			email: address,
			callbackURL: target,
			errorCallbackURL: "/login?grund=sso",
		});
		if (res?.error || !res?.data?.url) {
			setBusy(null);
			setAutofillRound((n) => n + 1);
			toast.error(t("ssoNoProvider"));
			return;
		}
		window.location.assign(res.data.url);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<FormAlert message={error} />
				<Button
					type="button"
					size="lg"
					onClick={passkey}
					disabled={busy !== null}
				>
					<Fingerprint aria-hidden="true" />{" "}
					{busy === "passkey" ? t("passkeyBusy") : t("passkey")}
				</Button>
				{busy === "passkey" && (
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
			<div className="flex items-center gap-3 text-muted-foreground text-footnote">
				<span className="h-px flex-1 bg-border" />
				{t("orPasskey")}
				<span className="h-px flex-1 bg-border" />
			</div>
			<div className="flex flex-col gap-3">
				<div className="grid gap-2">
					<Label htmlFor="email">{t("email")}</Label>
					<Input
						id="email"
						type="email"
						name="email"
						autoComplete="username webauthn"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					onClick={sso}
					disabled={busy === "sso" || busy === "microsoft"}
					title={t("ssoHint")}
				>
					<Building2 aria-hidden="true" /> {t("sso")}
				</Button>
				{microsoftEnabled && (
					<Button
						type="button"
						variant="outline"
						onClick={microsoft}
						disabled={busy === "sso" || busy === "microsoft"}
					>
						{t("microsoft")}
					</Button>
				)}
			</div>
			<p className="text-muted-foreground text-subhead">
				{t("lostPasskey")}{" "}
				<Link href={notweg} className="text-primary hover:underline">
					{signupAllowed ? t("mailLinkOrSignup") : t("mailLink")}
				</Link>
			</p>
		</div>
	);
}
