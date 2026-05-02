CREATE TABLE "reference_disclosures" (
	"id" text PRIMARY KEY NOT NULL,
	"interest_id" text NOT NULL,
	"reference_check_id" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "reference_disclosures_unique" UNIQUE("interest_id","reference_check_id")
);
--> statement-breakpoint
ALTER TABLE "reference_disclosures" ADD CONSTRAINT "reference_disclosures_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_disclosures" ADD CONSTRAINT "reference_disclosures_reference_check_id_reference_checks_id_fk" FOREIGN KEY ("reference_check_id") REFERENCES "public"."reference_checks"("id") ON DELETE cascade ON UPDATE no action;