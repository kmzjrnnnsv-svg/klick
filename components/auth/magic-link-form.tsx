"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";

// Anmelde-Link per Mail — nur noch der Notweg (/login/notweg, ADR-019):
// Passkey verloren mit TOTP als Rückfall, Einladung ohne Passkey-Gerät,
// Selbst-Registrierung (AUTH_ALLOW_SIGNUP). Danach gilt die MFA-Pflicht.
export function MagicLinkForm({
	signupAllowed,
	next,
}: {
	signupAllowed: boolean;
	// Ziel nach dem Login (?weiter=, z. B. /einladung/…), bereits geprüft.
	next: string | null;
}) {
	const t = useTranslations("Auth");
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState(false);

	async function sendLink(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		// Antwort ist absichtlich identisch für bekannte und unbekannte Adressen.
		try {
			const res = await authClient.signIn.magicLink({
				email: email.trim().toLowerCase(),
				callbackURL: next ?? "/heute",
				newUserCallbackURL: next ?? "/onboarding",
				errorCallbackURL: next
					? `/login/notweg?grund=link-ungueltig&weiter=${encodeURIComponent(next)}`
					: "/login/notweg?grund=link-ungueltig",
			});
			if (res?.error) {
				setBusy(false);
				toast.error(
					res.error.status === 429 ? t("tooManyLinks") : t("genericError"),
				);
				return;
			}
		} catch {
			setBusy(false);
			toast.error(t("genericError"));
			return;
		}
		router.push("/login/verify");
	}

	return (
		<form
			onSubmit={sendLink}
			method="post"
			action="/login/notweg"
			className="flex flex-col gap-4"
		>
			<div className="grid gap-2">
				<Label htmlFor="email">{t("email")}</Label>
				<Input
					id="email"
					type="email"
					name="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<Button type="submit" disabled={busy || email.length < 3}>
				{busy ? t("sendingLink") : t("sendLink")}
			</Button>
			{signupAllowed && (
				<p className="text-muted-foreground text-footnote">{t("signupHint")}</p>
			)}
		</form>
	);
}
