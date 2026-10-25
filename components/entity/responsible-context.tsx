"use client";

import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useCallback, useContext } from "react";
import type { ResponsibleOption } from "@/lib/compliance/function-holders";
import { type FunctionKey, functionLabel } from "@/lib/compliance/function-key";

// Besetzte Funktionen der Org (mit Person) für jede Auswahl „Verantwortlich“
// und die Namen eigener Rollen (`role:<id>`) — einmal im App-Rahmen geladen
// (app/(app)/layout.tsx), damit nicht jede Seite sie durchreichen muss.
type Value = {
	options: readonly ResponsibleOption[];
	roleNames: Readonly<Record<string, string>>;
};
const NONE: Readonly<Record<string, string>> = {};
const Ctx = createContext<Value>({ options: [], roleNames: NONE });

export function ResponsibleOptionsProvider({
	value,
	roleNames = NONE,
	children,
}: {
	value: readonly ResponsibleOption[];
	roleNames?: Readonly<Record<string, string>>;
	children: ReactNode;
}) {
	return (
		<Ctx.Provider value={{ options: value, roleNames }}>
			{children}
		</Ctx.Provider>
	);
}

export function useResponsibleOptions(): readonly ResponsibleOption[] {
	return useContext(Ctx).options;
}

// Anzeigename eines Funktionsschlüssels: Katalog-Funktion übersetzt, eigene
// Rolle mit ihrem Namen
export function useFunctionLabel(): (key: FunctionKey) => string {
	const tf = useTranslations("Functions");
	const te = useTranslations("Entity");
	const { roleNames } = useContext(Ctx);
	return useCallback(
		(key: FunctionKey) =>
			functionLabel(key, (fn) => tf(fn), roleNames, te("roleRemoved")),
		[tf, te, roleNames],
	);
}
