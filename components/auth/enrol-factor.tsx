"use client";

import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { EnrolTwoFactor } from "./enrol-two-factor";

// Ersteinrichtung des zweiten Faktors (ADR-019): Passkey zuerst, TOTP als
// Alternative. Der erste Passkey bestätigt zugleich diese Sitzung
// (authAfterHook setzt mfaVerifiedAt).
export function EnrolFactor() {
	const t = useTranslations("Auth");
	const ts = useTranslations("Settings");
	const router = useRouter();
	const [mode, setMode] = useState<"choose" | "totp" | "done">("choose");
	const [busy, setBusy] = useState(false);
	const [count, setCount] = useState(0);

	async function addPasskey() {
		setBusy(true);
		const res = await authClient.passkey.addPasskey();
		setBusy(false);
		if (res?.error) {
			const code = "code" in res.error ? String(res.error.code ?? "") : "";
			if (code !== "ERROR_CEREMONY_ABORTED" && code !== "AUTH_CANCELLED")
				toast.error(
					code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
						? ts("passkeyExists")
						: t("genericError"),
				);
			return;
		}
		setCount((n) => n + 1);
		setMode("done");
	}

	if (mode === "totp")
		return (
			<div className="flex flex-col gap-4">
				<p className="text-muted-foreground text-subhead">
					{t("enrolTotpLead")}
				</p>
				<EnrolTwoFactor />
			</div>
		);

	if (mode === "done")
		return (
			<div className="flex flex-col gap-4">
				<p className="text-subhead" role="status">
					{t("enrolPasskeyDone")}
				</p>
				{count < 2 && (
					<p className="text-muted-foreground text-subhead">
						{t("enrolPasskeyLead")}
					</p>
				)}
				<Button variant="outline" onClick={addPasskey} disabled={busy}>
					<Fingerprint /> {t("enrolAnotherPasskey")}
				</Button>
				<Button
					onClick={() => {
						router.replace("/heute");
						router.refresh();
					}}
				>
					{t("enrolDone")}
				</Button>
			</div>
		);

	return (
		<div className="flex flex-col gap-4">
			<Button size="lg" onClick={addPasskey} disabled={busy}>
				<Fingerprint /> {busy ? t("passkeyBusy") : t("enrolPasskey")}
			</Button>
			<p className="text-muted-foreground text-footnote">
				{t("enrolPasskeyLead")}
			</p>
			<button
				type="button"
				onClick={() => setMode("totp")}
				className="text-left text-primary text-subhead hover:underline"
			>
				{t("enrolTotp")}
			</button>
		</div>
	);
}
