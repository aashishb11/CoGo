CREATE TABLE "user_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"rater_id" text NOT NULL,
	"ratee_id" text NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_ratings_score_range_chk" CHECK ("user_ratings"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_rater_id_user_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_ratee_id_user_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_ratings_ride_rater_ratee_uq" ON "user_ratings" USING btree ("ride_id","rater_id","ratee_id");--> statement-breakpoint
CREATE INDEX "user_ratings_ratee_created_idx" ON "user_ratings" USING btree ("ratee_id","created_at" DESC NULLS LAST);