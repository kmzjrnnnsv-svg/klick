CREATE TABLE "export_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"alert_id" text NOT NULL,
	"code" text NOT NULL,
	"subject_kind" text,
	"subject_id" text,
	"raised_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "export_alerts_organizationId_alertId_unique" UNIQUE("organization_id","alert_id")
);
--> statement-breakpoint
ALTER TABLE "export_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "export_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "export_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "export_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "export_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"link_id" uuid,
	"seq" bigint NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_outbox_organizationId_seq_unique" UNIQUE("organization_id","seq")
);
--> statement-breakpoint
ALTER TABLE "export_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "klick_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"token_enc" text NOT NULL,
	"token_hint" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"account_ids" jsonb,
	"backfill_from" timestamp with time zone,
	"backfilled_at" timestamp with time zone,
	"klick_org_name" text,
	"link_ref" text,
	"token_expires_at" timestamp with time zone,
	"acked_seq" bigint DEFAULT 0 NOT NULL,
	"last_hello_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"paused_reason" text,
	"rejected" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "klick_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_signer_anchor" ADD COLUMN "ceremony" jsonb;--> statement-breakpoint
ALTER TABLE "export_alerts" ADD CONSTRAINT "export_alerts_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_changes" ADD CONSTRAINT "export_changes_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_outbox" ADD CONSTRAINT "export_outbox_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_outbox" ADD CONSTRAINT "export_outbox_link_id_klick_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."klick_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klick_links" ADD CONSTRAINT "klick_links_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klick_links" ADD CONSTRAINT "klick_links_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_changes_org_idx" ON "export_changes" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "export_outbox_type_idx" ON "export_outbox" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "klick_links_org_idx" ON "klick_links" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "export_alerts_org" ON "export_alerts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "export_changes_org" ON "export_changes" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "export_outbox_org" ON "export_outbox" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "klick_links_org" ON "klick_links" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
-- FORCE RLS (gilt auch für den Tabellen-Owner)
ALTER TABLE "export_alerts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "klick_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Änderungen für den Export nach Klick in derselben Transaktion vermerken
-- (Plan both.money, W4). Nur fachlich relevante Spalten lösen aus — nicht
-- jede neue Bestätigung oder jeder Sync-Zeitstempel.
CREATE OR REPLACE FUNCTION export_capture() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- nur mit Verbindung nach Klick (sonst wüchse die Tabelle ohne Abnehmer;
  -- die Nachlieferung holt den Stand beim Verbinden)
  IF EXISTS (SELECT 1 FROM klick_links
             WHERE organization_id = NEW.organization_id AND status <> 'revoked') THEN
    INSERT INTO export_changes (organization_id, entity, entity_id)
    VALUES (NEW.organization_id, TG_ARGV[0], NEW.id);
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER wallet_accounts_export_ins AFTER INSERT ON wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION export_capture('account');--> statement-breakpoint
CREATE TRIGGER wallet_accounts_export_upd AFTER UPDATE ON wallet_accounts
  FOR EACH ROW WHEN ((OLD.name, OLD.status, OLD.purpose, OLD.kind)
    IS DISTINCT FROM (NEW.name, NEW.status, NEW.purpose, NEW.kind))
  EXECUTE FUNCTION export_capture('account');--> statement-breakpoint
CREATE TRIGGER wallet_transfers_export_ins AFTER INSERT ON wallet_transfers
  FOR EACH ROW EXECUTE FUNCTION export_capture('transfer');--> statement-breakpoint
CREATE TRIGGER wallet_transfers_export_upd AFTER UPDATE ON wallet_transfers
  FOR EACH ROW WHEN ((OLD.status, OLD.frozen, OLD.screening, OLD.payout_id, OLD.block_height, OLD.block_hash)
    IS DISTINCT FROM (NEW.status, NEW.frozen, NEW.screening, NEW.payout_id, NEW.block_height, NEW.block_hash))
  EXECUTE FUNCTION export_capture('transfer');--> statement-breakpoint
CREATE TRIGGER wallet_payouts_export_ins AFTER INSERT ON wallet_payouts
  FOR EACH ROW EXECUTE FUNCTION export_capture('payout');--> statement-breakpoint
CREATE TRIGGER wallet_payouts_export_upd AFTER UPDATE ON wallet_payouts
  FOR EACH ROW WHEN ((OLD.status, OLD.txid, OLD.fee, OLD.txids, OLD.approved_at, OLD.signed_at, OLD.broadcast_at, OLD.confirmed_at)
    IS DISTINCT FROM (NEW.status, NEW.txid, NEW.fee, NEW.txids, NEW.approved_at, NEW.signed_at, NEW.broadcast_at, NEW.confirmed_at))
  EXECUTE FUNCTION export_capture('payout');--> statement-breakpoint
CREATE TRIGGER wallet_address_book_export_ins AFTER INSERT ON wallet_address_book
  FOR EACH ROW EXECUTE FUNCTION export_capture('destination');--> statement-breakpoint
CREATE TRIGGER wallet_address_book_export_upd AFTER UPDATE ON wallet_address_book
  FOR EACH ROW WHEN ((OLD.status, OLD.screening, OLD.approved_at, OLD.active_from, OLD.vetoed_at)
    IS DISTINCT FROM (NEW.status, NEW.screening, NEW.approved_at, NEW.active_from, NEW.vetoed_at))
  EXECUTE FUNCTION export_capture('destination');
