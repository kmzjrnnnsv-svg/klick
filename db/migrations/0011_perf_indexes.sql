CREATE INDEX "comments_org_created_idx" ON "comments" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "document_acks_org_doc_idx" ON "document_acknowledgements" USING btree ("organization_id","document_id");--> statement-breakpoint
CREATE INDEX "tasks_org_status_idx" ON "tasks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "training_assignments_org_req_idx" ON "training_assignments" USING btree ("organization_id","requirement_id");--> statement-breakpoint
CREATE INDEX "notifications_org_created_idx" ON "notifications" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unsent_idx" ON "notifications" USING btree ("organization_id","created_at") WHERE "notifications"."emailed_at" is null;