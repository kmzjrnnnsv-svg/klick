"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { ResponsibleOption } from "@/lib/compliance/function-holders";

// Besetzte Funktionen der Org (mit Person) für jede Auswahl „Verantwortlich“
// — einmal im App-Rahmen geladen (app/(app)/layout.tsx), damit nicht jede
// Seite sie durchreichen muss.
const Ctx = createContext<readonly ResponsibleOption[]>([]);

export function ResponsibleOptionsProvider({
	value,
	children,
}: {
	value: readonly ResponsibleOption[];
	children: ReactNode;
}) {
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResponsibleOptions(): readonly ResponsibleOption[] {
	return useContext(Ctx);
}
