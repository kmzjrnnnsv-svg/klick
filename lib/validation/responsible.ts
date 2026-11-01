import { z } from "zod";
import { isFunctionKey } from "@/lib/compliance/function-key";
import { uuid } from "./common";
import { FUNCTION_REF } from "./responsible-ref";

export {
	FUNCTION_REF,
	functionOfRef,
	responsibleValue,
} from "./responsible-ref";

// „Verantwortlich“ = Funktion oder Person (Teil A). Im Formular ein Wert:
// `function:<key>` für eine Funktion (auch eigene Rolle `function:role:<id>`,
// ADR-024), sonst wie bisher die Konto-ID; leer
// bzw. null = niemand. Der Server zerlegt über resolveResponsible
// (lib/compliance/function-holders-service.ts) in owner_function und die
// aufgelöste Person (owner_user_id).

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
