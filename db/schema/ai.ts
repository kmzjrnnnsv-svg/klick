import { index, pgTable, text } from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { orgId, pk, ts, userRef } from "./_shared";
import { AI_PROVIDERS } from "./enums";

// API-Schlüssel der Organisation für ihren KI-Anbieter (ADR-032). Nur
// verschlüsselt mit dem Org-DEK (enc1, AAD ai_credentials:<id>:key_enc),
// angezeigt wird nur key_hint (letzte vier Zeichen). Wirksam ist ein
// Schlüssel erst, wenn org_settings.ai_policy.credentialId auf ihn zeigt
// (Vier-Augen). Nie im Org-Export (lib/export/org-export.ts). Schreiben nur
// über lib/ai/credentials.ts.
export const aiCredentials = pgTable(
	"ai_credentials",
	{
		id: pk(),
		organizationId: orgId(),
		provider: text({ enum: AI_PROVIDERS }).notNull(),
		keyEnc: text().notNull(),
		keyHint: text().notNull(),
		createdBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		lastTestAt: ts(),
		lastTestOk: text({ enum: ["ok", "failed"] }),
	},
	(t) => [
		index("ai_credentials_org_idx").on(t.organizationId),
		orgPolicy("ai_credentials"),
	],
).enableRLS();

export type AiCredential = typeof aiCredentials.$inferSelect;
