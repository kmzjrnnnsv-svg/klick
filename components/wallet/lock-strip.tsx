"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { lockWallet } from "@/app/actions/security";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Leiste über jeder entsperrten Wallet-Seite: Netz, Restzeit, Sperren.
// Läuft die Zeit ab, lädt die Seite neu — der Guard leitet dann auf
// /wallet/entsperren (Aktivität verlängert die Entsperrung nicht).
export function WalletLockStrip({ closesAt }: { closesAt: string }) {
	const t = useTranslations("Wallet");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [minutes, setMinutes] = useState<number | null>(null);

	useEffect(() => {
		const end = new Date(closesAt).getTime();
		const tick = () => {
			const left = end - Date.now();
			if (left <= 0) {
				router.refresh();
				return false;
			}
			setMinutes(Math.ceil(left / 60_000));
			return true;
		};
		if (!tick()) return;
		const id = window.setInterval(() => {
			if (!tick()) window.clearInterval(id);
		}, 15_000);
		return () => window.clearInterval(id);
	}, [closesAt, router]);

	return (
		<div className="mb-6 flex items-center gap-x-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
			<Badge variant="warning">{t("homeTestnet")}</Badge>
			<span className="text-muted-foreground" aria-live="polite">
				{minutes !== null ? t("openFor", { minutes }) : " "}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="ml-auto"
				disabled={pending}
				onClick={() =>
					start(async () => {
						await lockWallet();
						router.push("/wallet/entsperren");
					})
				}
			>
				<Lock className="size-3.5" aria-hidden />
				<span className="sr-only sm:not-sr-only">{t("lockNow")}</span>
			</Button>
		</div>
	);
}
