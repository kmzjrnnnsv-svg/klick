import { z } from "zod";
import { ROLE_FUNCTIONS, type RoleFunction } from "@/db/schema/enums";
import { uuid } from "./common";

// „Verantwortlich“ = Funktion oder Person (Teil A). Im Formular ein Wert:
// `function:<key>` für eine Funktion, sonst wie bisher die Konto-ID; leer
// bzw. null = niemand. Der Server zerlegt über resolveResponsible
// (lib/compliance/function-holders-service.ts) in owner_function und die
// aufgelöste Person (owner_user_id).

export const FUNCTION_REF = "function:";

const functionRef = z
	.string()
	.refine(
		(v) =>
			v.startsWith(FUNCTION_REF) &&
			(ROLE_FUNCTIONS as readonly string[]).includes(
				v.slice(FUNCTION_REF.length),
			),
		"Unbekannte Funktion",
	);

// ersetzt `ownerUserId: uuid.nullable().optional()` in den Schemas
export const responsibleRef = z
	.union([uuid, functionRef])
	.nullable()
	.optional();

export function functionOfRef(
	ref: string | null | undefined,
): RoleFunction | null {
	return ref?.startsWith(FUNCTION_REF)
		? (ref.slice(FUNCTION_REF.length) as RoleFunction)
		: null;
}

// Wert für die Auswahl aus einer Zeile mit owner_function/owner_user_id
// (ownerFunction Pflicht: wer die Spalte nicht lädt, zeigt sonst still die Person)
export function responsibleValue(row: {
	ownerFunction: RoleFunction | null;
	ownerUserId: string | null;
}): string | null {
	return row.ownerFunction
		? `${FUNCTION_REF}${row.ownerFunction}`
		: (row.ownerUserId ?? null);
}
