ALTER TABLE "trips" ADD COLUMN "external_event_provider" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "external_event_id" text;--> statement-breakpoint
CREATE INDEX "trips_external_event_idx" ON "trips" USING btree ("external_event_provider","external_event_id");