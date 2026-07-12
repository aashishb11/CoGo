ALTER TABLE "user" ADD COLUMN "agenda_feed_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_agenda_feed_token_unique" UNIQUE("agenda_feed_token");