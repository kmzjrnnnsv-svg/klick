import { env } from "@/lib/env";
import { type LegalEntity, legalEntityFrom } from "./entity";

// Anbieterkennzeichnung aus der laufenden Env (Server). Pure Logik in entity.ts.
export const legalEntity = (): LegalEntity => legalEntityFrom(env());
