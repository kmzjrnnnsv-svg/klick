CREATE TABLE "incident_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "incident_assets_incidentId_assetId_unique" UNIQUE("incident_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "incident_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "incident_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	CONSTRAINT "incident_processes_incidentId_processId_unique" UNIQUE("incident_id","process_id")
);
--> statement-breakpoint
ALTER TABLE "incident_processes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "incident_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	CONSTRAINT "incident_providers_incidentId_providerId_unique" UNIQUE("incident_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "incident_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident_assets" ADD CONSTRAINT "incident_assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_assets" ADD CONSTRAINT "incident_assets_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_assets" ADD CONSTRAINT "incident_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_processes" ADD CONSTRAINT "incident_processes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_processes" ADD CONSTRAINT "incident_processes_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_processes" ADD CONSTRAINT "incident_processes_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_providers" ADD CONSTRAINT "incident_providers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_providers" ADD CONSTRAINT "incident_providers_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_providers" ADD CONSTRAINT "incident_providers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_assets_asset_idx" ON "incident_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "incident_processes_process_idx" ON "incident_processes" USING btree ("process_id");--> statement-breakpoint
CREATE INDEX "incident_providers_provider_idx" ON "incident_providers" USING btree ("provider_id");--> statement-breakpoint
CREATE POLICY "incident_assets_org" ON "incident_assets" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "incident_processes_org" ON "incident_processes" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "incident_providers_org" ON "incident_providers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "incident_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident_providers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident_processes" FORCE ROW LEVEL SECURITY;