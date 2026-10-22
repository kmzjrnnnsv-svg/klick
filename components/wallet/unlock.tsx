"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { confirmWithPasskey } from "@/components/auth/passkey-confirm";
import { Button } from "@/components/ui/button";

// Großer Knopf „Mit Passkey öffnen“; nach Erfolg zurück zur gewünschten
// Wallet-Seite (Rückweg serverseitig geprüft, walletReturnPath).
export function WalletUnlock({ returnTo }: { returnTo: string }) {
	const t = useTranslations("Wallet");
	const tAuth = useTranslations("Auth");
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function run() {
		setBusy(true);
		setError(null);
		try {
			const res = await confirmWithPasskey("wallet");
			if (res.ok) {
				router.replace(returnTo);
				router.refresh();
				return;
			}
			setError(
				res.error === "cancelled"
					? t("unlockCancelled")
					: res.error === "passkey_too_new"
						? tAuth("passkeyTooNew")
						: res.error === "forbidden"
							? t("unlockForbidden")
							: res.error === "expired"
								? tAuth("passkeyExpired")
								: t("unlockFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<Button
				type="button"
				variant="brown"
				size="lg"
				className="w-full"
				onClick={run}
				disabled={busy}
			>
				<KeyRound className="size-4" aria-hidden />
				{busy ? t("unlockBusy") : t("unlockButton")}
			</Button>
			<p
				role="alert"
				aria-live="polite"
				className="min-h-4 text-destructive text-xs"
			>
				{error}
			</p>
		</div>
	);
}
