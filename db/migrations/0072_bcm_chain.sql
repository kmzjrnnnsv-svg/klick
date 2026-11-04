ALTER TABLE "assets" ADD COLUMN "rto_hours" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "rpo_hours" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "redundancy" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "rto_hours" integer;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "rpo_hours" integer;