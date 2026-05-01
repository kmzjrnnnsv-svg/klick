CREATE TABLE "geocode_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"resolved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "max_commute_minutes" integer;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "transport_mode" text;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "address_lat" double precision;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "address_lng" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "location_lat" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "location_lng" double precision;