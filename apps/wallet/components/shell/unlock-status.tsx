"use client";

import { lock } from "@wallet/app/actions/auth";
import { Lock, LockOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

// Entsperrt bis … (15 min ab Passkey, ADR-022/H9). Nach Ablauf lädt die
// Seite neu und der Guard leitet zu /unlock.
export function UnlockStatus({ until }: { until: string | null }) {
	const t = useTranslations("Shell");
	const tu = useTranslations("Unlock");
	const router = useRouter();
	const [expired, setExpired] = useState(
		!until || new Date(until).getTime() <= Date.now(),
	);

	useEffect(() => {
		if (!until) return;
		const ms = new Date(until).getTime() - Date.now();
		if (ms <= 0) return setExpired(true);
		const id = setTimeout(() => {
			setExpired(true);
			router.refresh();
		}, ms + 500);
		return () => clearTimeout(id);
	}, [until, router]);

	if (expired || !until)
		return (
			<Link
				href="/unlock"
				className={buttonVariants({ variant: "outline", size: "sm" })}
			>
				<Lock aria-hidden /> {t("unlock")}
			</Link>
		);
	const time = new Intl.DateTimeFormat("de-DE", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/Berlin",
	}).format(new Date(until));
	return (
		<div className="flex shrink-0 items-center gap-2">
			<span className="hidden items-center gap-1 text-muted-foreground text-footnote lg:flex">
				<LockOpen className="size-3.5" aria-hidden />{" "}
				{t("unlockedUntil", { time })}
			</span>
			<Button
				variant="outline"
				size="sm"
				aria-label={tu("lock")}
				className="min-w-(--control-h-sm)"
				onClick={async () => {
					await lock();
					router.refresh();
				}}
			>
				<Lock aria-hidden />{" "}
				<span className="hidden lg:inline">{tu("lock")}</span>
			</Button>
		</div>
	);
}
