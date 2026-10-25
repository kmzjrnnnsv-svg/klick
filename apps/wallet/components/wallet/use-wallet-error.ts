"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/toast";

// Fehler aus Wallet-Actions als Toast: Code (`error_<code>`) vor dem ersten
// Feldfehler, sonst allgemein
export function useWalletError() {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	return (res: { error?: string; fieldErrors?: Record<string, string[]> }) => {
		const key = `error_${res.error ?? ""}`;
		const first = Object.values(res.fieldErrors ?? {})[0]?.[0];
		if (t.has(key as never)) toast.error(t(key as never));
		else if (first && t.has(`error_${first}` as never))
			toast.error(t(`error_${first}` as never));
		else toast.error(first ?? tc("error"));
	};
}
