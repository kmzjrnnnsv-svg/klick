"use client";

import { Building2, Fingerprint } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BLOCKED_HINT_COOKIE } from "@/lib/auth/account-status";
import { authClient } from "@/lib/auth/client";

// Hinweis-Cookie nach Passkey-Anmeldung eines gesperrten Kontos lesen und
// sofort löschen (lib/auth/account-status.ts).
function takeBlockedHint(): boolean {
	const hit = document.cookie
		.split("; ")
		.some((c) => c === `${BLOCKED_HINT_COOKIE}=1`);
	if (hit)
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API fehlt in Firefox
		document.cookie = `${BLOCKED_HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Strict`;
	return hit;
}

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
	const notweg = next
		? `/login/notweg?weiter=${encodeURIComponent(next)}`
		: "/login/notweg";

	const blockedText = t("accountBlocked");

	// Conditional UI: der Browser bietet gespeicherte Passkeys direkt im
	// E-Mail-Feld an. Bricht still ab, sobald der Knopf benutzt wird.
	useEffect(() => {
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
			if (active && res?.error && takeBlockedHint()) toast.error(blockedText);
			if (active && res && !res.error) {
				router.push(target);
				router.refresh();
			}
		})();
		return () => {
			active = false;
		};
	}, [router, target, blockedText]);

	async function passkey() {
		setBusy("passkey");
		const res = await authClient.signIn.passkey();
		setBusy(null);
		if (res?.error) {
			const code = "code" in res.error ? String(res.error.code ?? "") : "";
			// Abbrechen im Browser-Dialog ist kein Fehler.
			if (code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED")
				return;
			toast.error(
				code === "BANNED_USER" || takeBlockedHint()
					? t("accountBlocked")
					: t("passkeySignInFailed"),
			);
			return;
		}
		router.push(target);
		router.refresh();
	}

	async function microsoft() {
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
		setBusy("sso");
		const res = await authClient.signIn.sso({
			email: address,
			callbackURL: target,
			errorCallbackURL: "/login?grund=sso",
		});
		if (res?.error || !res?.data?.url) {
			setBusy(null);
			toast.error(t("ssoNoProvider"));
			return;
		}
		window.location.assign(res.data.url);
	}

	return (
		<div className="flex flex-col gap-6">
			<Button
				type="button"
				size="lg"
				onClick={passkey}
				disabled={busy !== null}
			>
				<Fingerprint /> {busy === "passkey" ? t("passkeyBusy") : t("passkey")}
			</Button>
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
					disabled={busy !== null}
					title={t("ssoHint")}
				>
					<Building2 /> {t("sso")}
				</Button>
				{microsoftEnabled && (
					<Button
						type="button"
						variant="outline"
						onClick={microsoft}
						disabled={busy !== null}
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
