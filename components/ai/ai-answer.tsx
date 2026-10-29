"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import type { AiAnswer } from "@/lib/ai/service";

// KI-Vorschlag (ADR-032): immer als Vorschlag gekennzeichnet, mit Anbieter
// und Modell; der Text wird nur angezeigt (React escaped ihn), nie als HTML
// oder Markdown gerendert und nie selbst übernommen.

// Fehlercodes der KI: eigene Texte aus „Ai“, dann aus den Einstellungen,
// sonst die allgemeinen
export function useAiError() {
	const t = useTranslations("Ai");
	const ts = useTranslations("AiSettings");
	const tc = useTranslations("Common");
	return (res: { error?: string; ref?: string }) => {
		const code = res.error ?? "";
		const key = `err_${code}` as "err_ai_no_changes";
		if (t.has(key)) return t(key);
		if (ts.has(key as "err_ai_off")) return ts(key as "err_ai_off");
		return errorText(tc, res);
	};
}

export function AiAnswerCard({
	answer,
	onClose,
	children,
}: {
	answer: AiAnswer;
	onClose: () => void;
	// weitere Knöpfe (übernehmen, als Kommentar speichern …)
	children?: ReactNode;
}) {
	const t = useTranslations("Ai");
	const ts = useTranslations("AiSettings");
	const providerKey = `provider_${answer.provider}` as "provider_anthropic";
	const provider = ts.has(providerKey) ? ts(providerKey) : answer.provider;
	return (
		<section
			aria-label={t("answerLabel")}
			className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4"
		>
			<header className="flex flex-col gap-0.5">
				<p className="flex items-center gap-1.5 font-semibold text-subhead">
					<Sparkles aria-hidden="true" className="size-4 text-primary" />
					{t("answerTitle", { provider, model: answer.model })}
				</p>
				<p className="text-footnote text-muted-foreground">
					{t("answerCheck")}
				</p>
			</header>
			<div className="whitespace-pre-wrap break-words text-subhead">
				{answer.text}
			</div>
			{answer.redacted > 0 && (
				<p className="text-footnote text-muted-foreground">
					{t("redacted", { n: answer.redacted })}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-2">
				{children}
				<Button
					type="button"
					size="sm"
					variant="secondary"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(answer.text);
							toast.success(t("copied"));
						} catch {
							toast.error(t("copyFailed"));
						}
					}}
				>
					{t("copy")}
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onClose}>
					{t("close")}
				</Button>
			</div>
		</section>
	);
}
