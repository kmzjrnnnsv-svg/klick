"use client";

import { Building2, Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export function LoginForm({
	microsoftEnabled,
	signupAllowed,
}: {
	microsoftEnabled: boolean;
	signupAllowed: boolean;
}) {
	const t = useTranslations("Auth");
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState<
		"link" | "passkey" | "microsoft" | "sso" | null
	>(null);

	async function sendLink(e: React.FormEvent) {
		e.preventDefault();
		setBusy("link");
		// Antwort ist absichtlich identisch für bekannte und unbekannte Adressen.
		await authClient.signIn.magicLink({
			email: email.trim().toLowerCase(),
			callbackURL: "/heute",
			newUserCallbackURL: "/onboarding",
			errorCallbackURL: "/login?grund=link-ungueltig",
		});
		router.push("/login/verify");
	}

	async function passkey() {
		setBusy("passkey");
		const res = await authClient.signIn.passkey();
		setBusy(null);
		if (res?.error) {
			toast.error(t("genericError"));
			return;
		}
		router.push("/heute");
		router.refresh();
	}

	async function microsoft() {
		setBusy("microsoft");
		await authClient.signIn.social({
			provider: "microsoft",
			callbackURL: "/heute",
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
			callbackURL: "/heute",
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
			<form onSubmit={sendLink} className="flex flex-col gap-4">
				<div className="grid gap-2">
					<Label htmlFor="email">{t("email")}</Label>
					<Input
						id="email"
						type="email"
						name="email"
						autoComplete="email webauthn"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</div>
				<Button
					type="submit"
					variant="brown"
					disabled={busy !== null || email.length < 3}
				>
					{t("sendLink")}
				</Button>
				{signupAllowed && (
					<p className="text-muted-foreground text-xs">{t("signupHint")}</p>
				)}
			</form>
			<div className="flex items-center gap-3 text-muted-foreground text-xs">
				<span className="h-px flex-1 bg-border" />
				{t("orPasskey")}
				<span className="h-px flex-1 bg-border" />
			</div>
			<div className="flex flex-col gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={passkey}
					disabled={busy !== null}
				>
					<Fingerprint /> {t("passkey")}
				</Button>
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
		</div>
	);
}
