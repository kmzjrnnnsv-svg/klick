CREATE TABLE "ledger_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"root" text NOT NULL,
	"leaf_count" integer NOT NULL,
	"platform" jsonb,
	"ots" "bytea",
	"status" text DEFAULT 'pending' NOT NULL,
	"calendars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bitcoin_height" integer,
	"bitcoin_merkle_root" text,
	"confirmed_at" timestamp with time zone,
	"last_upgrade_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"anchor_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"count" integer NOT NULL,
	"head" text NOT NULL,
	"leaf" text NOT NULL,
	"path" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_heads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_heads" ADD CONSTRAINT "ledger_heads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_heads" ADD CONSTRAINT "ledger_heads_anchor_id_ledger_anchors_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."ledger_anchors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_anchors_status_idx" ON "ledger_anchors" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ledger_heads_org_idx" ON "ledger_heads" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE POLICY "ledger_heads_org" ON "ledger_heads" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "ledger_heads" FORCE ROW LEVEL SECURITY;
