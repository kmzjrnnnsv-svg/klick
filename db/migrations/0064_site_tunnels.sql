CREATE TABLE "site_tunnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor" text NOT NULL,
	"tech" text NOT NULL,
	"peer_ip" text NOT NULL,
	"customer_nets" jsonb NOT NULL,
	"transfer_net" text,
	"wg_public_key" text,
	"secret_enc" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"agent_removed_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"down_since" timestamp with time zone,
	"last_up" boolean,
	"last_handshake_at" timestamp with time zone,
	"last_status_at" timestamp with time zone,
	"last_error" text,
	"notified_state" text
);
--> statement-breakpoint
ALTER TABLE "site_tunnels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_tunnels" ADD CONSTRAINT "site_tunnels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_tunnels" ADD CONSTRAINT "site_tunnels_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_tunnels" ADD CONSTRAINT "site_tunnels_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_tunnels_org_idx" ON "site_tunnels" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_tunnels_peer_uq" ON "site_tunnels" USING btree ("peer_ip") WHERE removed_at is null;--> statement-breakpoint
CREATE POLICY "site_tunnels_org" ON "site_tunnels" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "site_tunnels" FORCE ROW LEVEL SECURITY;
