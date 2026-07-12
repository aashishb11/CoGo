CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"settings" jsonb DEFAULT '{"traffic_alerts":true}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "last_traffic_delay_notified_seconds" integer;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");