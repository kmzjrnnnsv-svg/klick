"use client";

import { useTranslations } from "next-intl";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

type WalletFailure = {
	error?: string;
	ref?: string;
	fieldErrors?: Record<string, string[]>;
};

// Text zu einem Fehler aus einer Wallet-Action: Code (`error_<code>`) vor dem
// ersten Feldfehler, sonst allgemein. Formulare zeigen ihn als FormAlert über
// dem Absenden-Knopf, alles andere als Toast (`useWalletError`). Allgemeine
// Codes (Recht, Sitzung, Drosselung, Referenz) über `errorText`.
export function useWalletErrorText() {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	return (res: WalletFailure): string => {
		const key = `error_${res.error ?? ""}`;
		const first = Object.values(res.fieldErrors ?? {})[0]?.[0];
		if (t.has(key as never)) return t(key as never);
		if (first && t.has(`error_${first}` as never))
			return t(`error_${first}` as never);
		return first ?? errorText(tc, res);
	};
}

// Fehler aus Wallet-Actions als Toast (Knöpfe ohne eigenes Formular)
export function useWalletError() {
	const text = useWalletErrorText();
	return (res: WalletFailure) => {
		toast.error(text(res));
	};
}
