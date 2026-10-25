-- Eigene Rollen als Funktion (ADR-024): wer eine eigene Rolle trägt, steht
-- künftig in role_assignments (function = other, org_role_id); die Rechte
-- (member_roles) folgen der Bestellung. Bestand gilt als bestellt
-- (Entscheidung 25.10.) — auch vorgemerkte Einladungen, damit niemand beim
-- Annehmen Rechte verliert.
INSERT INTO "role_assignments" (
	"organization_id", "function", "org_role_id", "status", "user_id",
	"pending_email", "appointed_at", "proposed_by_user_id"
)
SELECT mr."organization_id", 'other', mr."role_id", 'appointed', mr."user_id",
	CASE WHEN mr."user_id" IS NULL THEN lower(mr."pending_email") END,
	CURRENT_DATE, mr."created_by_user_id"
FROM "member_roles" mr
WHERE (mr."user_id" IS NOT NULL OR mr."pending_email" IS NOT NULL)
	AND NOT EXISTS (
		SELECT 1 FROM "role_assignments" ra
		WHERE ra."organization_id" = mr."organization_id"
			AND ra."org_role_id" = mr."role_id"
			AND ra."status" <> 'revoked'
			AND (
				ra."user_id" = mr."user_id"
				OR (mr."user_id" IS NULL AND lower(ra."pending_email") = lower(mr."pending_email"))
			)
	);
