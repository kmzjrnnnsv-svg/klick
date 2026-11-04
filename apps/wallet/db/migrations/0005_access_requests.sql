CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"message" text,
	"ip_hash" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "access_requests_updated_idx" ON "access_requests" USING btree ("updated_at");