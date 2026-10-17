CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"service_key" text NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text NOT NULL,
	"phone" text,
	"message" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"handled_by_user_id" uuid,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_handled_by_user_id_user_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_status_created_idx" ON "inquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_updated_idx" ON "inquiries" USING btree ("updated_at");