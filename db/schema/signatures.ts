import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { appendOnlyOrgPolicies } from "../rls";
import { json, orgId, pk, ts } from "./_shared";
import { evidence } from "./grc";

// Unterschriften per Passkey unter Nachweisen (N4). Nur anhängend: keine
// UPDATE-/DELETE-Policy (RLS + FORCE). Gespeichert wird alles, was eine
// Prüfung ohne Klick braucht: kanonischer Text, die vollständige Assertion
// und eine Kopie des öffentlichen Schlüssels. Sammelunterschrift: eine
// Assertion über die Merkle-Wurzel, je Nachweis eine Zeile mit Pfad.
export const evidenceSignatures = pgTable(
	"evidence_signatures",
	{
		id: pk(),
		organizationId: orgId(),
		evidenceId: uuid()
			.notNull()
			.references(() => evidence.id, { onDelete: "cascade" }),
		// SHA-256 der Datei zum Zeitpunkt der Unterschrift
		sha256: text().notNull(),
		// bewusst ohne Fremdschlüssel: die Unterschrift bleibt, auch wenn das
		// Konto später gelöscht wird
		signerUserId: uuid().notNull(),
		signerName: text().notNull(),
		function: text(),
		purpose: text({ enum: ["approve", "acknowledge", "review"] }).notNull(),
		signText: text().notNull(),
		nonce: text().notNull(),
		credentialId: text().notNull(),
		// COSE-Schlüssel, base64url
		publicKey: text().notNull(),
		authenticatorData: text().notNull(),
		clientDataJSON: text().notNull(),
		signature: text().notNull(),
		userVerified: boolean().notNull(),
		backupEligible: boolean().notNull(),
		backupState: boolean().notNull(),
		signCount: integer().notNull(),
		batchId: uuid(),
		merkleRoot: text(),
		merkleProof: json<{ side: "L" | "R"; hash: string }[]>(),
		signedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("evidence_signatures_evidence_idx").on(t.evidenceId),
		unique("evidence_signatures_nonce_unique").on(
			t.organizationId,
			t.nonce,
			t.evidenceId,
		),
		...appendOnlyOrgPolicies("evidence_signatures"),
	],
).enableRLS();

export type EvidenceSignature = typeof evidenceSignatures.$inferSelect;
