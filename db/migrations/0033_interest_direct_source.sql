-- Erlaubt Interests die nicht aus einer Match-Liste kommen (Direct-
-- Outreach via Public-Share-Link, oder Recruiter-Empfehlung).

ALTER TABLE "interests" ALTER COLUMN "match_id" DROP NOT NULL;
ALTER TABLE "interests" ALTER COLUMN "job_id" DROP NOT NULL;

ALTER TABLE "interests" ADD COLUMN "source" text
	DEFAULT 'match' NOT NULL;
-- Werte: 'match' | 'direct' | 'recommendation'

-- Recruiter-Empfehlung: Snapshot welcher Recruiter den Kandidat dem
-- Employer empfohlen hat. Null für source='match' und 'direct'.
ALTER TABLE "interests" ADD COLUMN "recommender_user_id" text
	REFERENCES "users"("id") ON DELETE SET NULL;
