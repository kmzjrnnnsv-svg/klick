-- Prüfer-Sicht (V3): Berater:innen arbeiten mit und sehen Entwürfe und
-- Verlauf; bestehende Zugänge bekommen den Grant wie neue Beitritte
UPDATE "member_access" ma
SET "grants" = ma."grants" || '["work_in_progress"]'::jsonb
FROM "member" m
WHERE m."id" = ma."member_id"
	AND m."role" = 'consultant'
	AND NOT ma."grants" @> '["work_in_progress"]'::jsonb;
