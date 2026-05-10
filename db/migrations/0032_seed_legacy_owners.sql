-- Backfill: für jede Firma, deren employer.userId existiert aber für die
-- kein agency_members-Eintrag mit role='owner' vorliegt, legen wir die
-- Owner-Row nach. Damit funktionieren Owner-Cap (max 2) + Team-Verwaltung
-- auch für Firmen, die vor 0032 angelegt wurden.

INSERT INTO "agency_members"
	("id", "employer_id", "user_id", "invite_email", "role", "joined_at", "invited_at")
SELECT
	gen_random_uuid()::text,
	e.id,
	e.user_id,
	u.email,
	'owner',
	e.created_at,
	e.created_at
FROM "employers" e
JOIN "users" u ON u.id = e.user_id
WHERE NOT EXISTS (
	SELECT 1 FROM "agency_members" m
	WHERE m.employer_id = e.id
		AND m.role = 'owner'
		AND m.user_id = e.user_id
)
ON CONFLICT DO NOTHING;
