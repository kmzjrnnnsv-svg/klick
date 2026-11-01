// „Verantwortlich“ als Formularwert, ohne zod (Browser-Bausteine importieren
// von hier; lib/validation/responsible.ts re-exportiert und prüft).
import type { FunctionKey } from "@/lib/compliance/function-key";

export const FUNCTION_REF = "function:";

export function functionOfRef(
	ref: string | null | undefined,
): FunctionKey | null {
	return ref?.startsWith(FUNCTION_REF)
		? (ref.slice(FUNCTION_REF.length) as FunctionKey)
		: null;
}

// Wert für die Auswahl aus einer Zeile mit owner_function/owner_user_id
// (ownerFunction Pflicht: wer die Spalte nicht lädt, zeigt sonst still die Person)
export function responsibleValue(row: {
	ownerFunction: FunctionKey | null;
	ownerUserId: string | null;
}): string | null {
	return row.ownerFunction
		? `${FUNCTION_REF}${row.ownerFunction}`
		: (row.ownerUserId ?? null);
}
