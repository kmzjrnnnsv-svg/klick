"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { deferSetup } from "@/app/actions/setup";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Fußleiste der Einrichtung: zurück und „Später fortsetzen“ (der
// Hauptknopf je Schritt sitzt im Formular)
export function StepFooter({
	prevHref,
	showLater,
}: {
	prevHref: string | null;
	showLater: boolean;
}) {
	const t = useTranslations("Setup");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-subhead">
			{prevHref ? (
				<Link
					href={prevHref}
					className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
				>
					{t("back")}
				</Link>
			) : (
				<span />
			)}
			{showLater && (
				<button
					type="button"
					disabled={pending}
					className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
					onClick={() =>
						start(async () => {
							const res = await deferSetup();
							if (!res.ok) return void toast.error(errorText(tc, res));
							toast.success(t("laterDone"));
							router.push("/heute");
						})
					}
				>
					{t("later")}
				</button>
			)}
		</div>
	);
}

// Gemeinsamer Ablauf: Aktion → Toast → nächster Schritt
export function useStepRunner(nextHref: string) {
	const t = useTranslations("Setup");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const run = (
		fn: () => Promise<{ ok: boolean; error?: string }>,
		message?: (res: {
			ok: true;
			data?: unknown;
		}) => string | { title: string; description?: string },
	) =>
		start(async () => {
			const res = await fn();
			if (!res.ok) {
				toast.error(
					res.error === "setup_completed"
						? t("error_setup_completed")
						: errorText(tc, res),
				);
				return;
			}
			const m = message ? message(res as { ok: true }) : t("saved");
			if (typeof m === "string") toast.success(m);
			else
				toast.success(m.title, {
					description: m.description,
					duration: m.description ? 8000 : undefined,
				});
			router.push(nextHref);
		});
	return { pending, run };
}
