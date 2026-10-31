"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { retryJob, sendTestMail } from "@/app/actions/admin-ops";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

// Admin > Betrieb: fehlgeschlagene Aufgabe erneut starten
export function RetryJobButton({ name, id }: { name: string; id: string }) {
	const t = useTranslations("AdminOps");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="secondary"
			disabled={pending}
			aria-label={t("retryFor", { name })}
			onClick={() =>
				start(async () => {
					const res = await retryJob(name, id);
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("retried"));
					router.refresh();
				})
			}
		>
			{pending ? t("retrying") : t("retry")}
		</Button>
	);
}

// Testmail an das eigene Konto; Ergebnis bleibt am Knopf stehen
export function TestMailButton() {
	const t = useTranslations("AdminOps");
	const tc = useTranslations("Common");
	const [pending, start] = useTransition();
	const [result, setResult] = useState<{
		delivered: boolean;
		path: string;
		to: string;
		hint: string | null;
	} | null>(null);
	return (
		<div className="flex flex-col items-start gap-2">
			<Button
				variant="secondary"
				disabled={pending}
				onClick={() =>
					start(async () => {
						setResult(null);
						const res = await sendTestMail();
						if (!res.ok) return void toast.error(errorText(tc, res));
						setResult(res.data);
					})
				}
			>
				{pending ? t("testMailSending") : t("testMail")}
			</Button>
			{result && (
				<p
					role="status"
					className={`text-subhead ${result.delivered ? "text-muted-foreground" : "text-destructive"}`}
				>
					{result.delivered
						? t("testMailSent", { to: result.to, path: result.path })
						: t("testMailFailed", { path: result.path })}
					{result.hint && <span className="block">{result.hint}</span>}
				</p>
			)}
		</div>
	);
}
