-- Historie aller KI-Auswertungen pro User. Dient zwei Zwecken:
--   1. Konsistenz: bei der nächsten Generierung wird die letzte Auswertung
--      als Anker in den Prompt gemischt — damit Salary/Karriere-Analyse
--      nicht bei jedem Klick völlig neue Zahlen liefert.
--   2. Audit + Cost-Tracking: was hat die KI wann zu welchem Profil-Stand
--      gesagt, mit welchem Modell, welcher Provider.

CREATE TABLE IF NOT EXISTS "ai_evaluations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	-- Welche Art von Auswertung
	"kind" text NOT NULL,
	-- Optional: Sub-Key, z. B. ISO-Country-Code "DE" bei salary_country
	"key" text,
	-- Was haben wir an die KI geschickt (Profil-Snapshot)
	"input_snapshot" jsonb,
	-- Was hat die KI geliefert
	"output" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp NOT NULL DEFAULT now()
);

-- Häufige Query: jüngste N Einträge pro User+Kind+Key holen
CREATE INDEX IF NOT EXISTS "ai_evaluations_user_kind_key_created_idx"
	ON "ai_evaluations" ("user_id", "kind", "key", "created_at" DESC);
