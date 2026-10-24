"use client";

import { authClient } from "@wallet/lib/auth/client";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Anmeldung nur per Passkey: Knopf oder Autofill im E-Mail-Feld
// (Conditional UI). Kein Mail-Link, kein Passwort.
export function LoginForm({ next }: { next: string }) {
	const t = useTranslations("Auth");
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			if (active && res && !res.error) {
				router.push(next);
				router.refresh();
			}
		})();
		return () => {
			active = false;
		};
	}, [router, next]);

	async function passkey() {
		setBusy(true);
		setError(null);
		const res = await authClient.signIn.passkey();
		setBusy(false);
		if (res?.error) {
			const code = "code" in res.error ? String(res.error.code ?? "") : "";
			if (code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED")
				return setError(t("passkeyCancelled"));
			return setError(t("passkeySignInFailed"));
		}
		router.push(next);
		router.refresh();
	}

	return (
		<div className="flex flex-col gap-5">
			<Button type="button" size="lg" onClick={passkey} disabled={busy}>
				<Fingerprint aria-hidden /> {busy ? t("passkeyBusy") : t("passkey")}
			</Button>
			<p
				role="alert"
				aria-live="polite"
				className="min-h-4 text-destructive text-sm"
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
				<p className="text-muted-foreground text-xs">{t("emailHint")}</p>
			</div>
		</div>
	);
}
