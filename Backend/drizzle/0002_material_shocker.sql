CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"car_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"origin_label" text NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"destination_label" text NOT NULL,
	"destination_lat" double precision NOT NULL,
	"destination_lng" double precision NOT NULL,
	"conversation_style" text,
	"smoke_preference" boolean DEFAULT false NOT NULL,
	"music_preference" boolean DEFAULT false NOT NULL,
	"music_genre" text,
	"departure_at" timestamp,
	"schedule" jsonb,
	"seats_offered" integer NOT NULL,
	"seats_available" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trips_driver_id_idx" ON "trips" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "trips_type_idx" ON "trips" USING btree ("type");--> statement-breakpoint
CREATE INDEX "trips_status_idx" ON "trips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trips_departure_at_idx" ON "trips" USING btree ("departure_at");
