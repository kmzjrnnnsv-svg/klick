import { z } from "zod";
import { type FunctionKey, isFunctionKey } from "@/lib/compliance/function-key";
import { uuid } from "./common";

// „Verantwortlich“ = Funktion oder Person (Teil A). Im Formular ein Wert:
// `function:<key>` für eine Funktion (auch eigene Rolle `function:role:<id>`,
// ADR-024), sonst wie bisher die Konto-ID; leer
// bzw. null = niemand. Der Server zerlegt über resolveResponsible
// (lib/compliance/function-holders-service.ts) in owner_function und die
// aufgelöste Person (owner_user_id).

export const FUNCTION_REF = "function:";

const functionRef = z
	.string()
	.refine(
		(v) =>
			v.startsWith(FUNCTION_REF) && isFunctionKey(v.slice(FUNCTION_REF.length)),
		"Unbekannte Funktion",
	);

// Konto-ID oder `function:<key>`
export const responsibleId = z.union([uuid, functionRef]);

// ersetzt `ownerUserId: uuid.nullable().optional()` in den Schemas
export const responsibleRef = responsibleId.nullable().optional();

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
