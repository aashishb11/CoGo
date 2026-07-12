CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"passenger_id" text NOT NULL,
	"ride_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"rejected_at" timestamp,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"scheduled_departure" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"origin_label" text NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"destination_label" text NOT NULL,
	"destination_lat" double precision NOT NULL,
	"destination_lng" double precision NOT NULL,
	"total_distance_km" double precision NOT NULL,
	"seats_offered" integer NOT NULL,
	"seats_occupied" integer DEFAULT 0 NOT NULL,
	"actual_co2_saved_kg" double precision,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_favorite_trips" (
	"user_id" text NOT NULL,
	"trip_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_trips_user_id_trip_id_pk" PRIMARY KEY("user_id","trip_id")
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_user_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_trips" ADD CONSTRAINT "user_favorite_trips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_trips" ADD CONSTRAINT "user_favorite_trips_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_passenger_requested_idx" ON "bookings" USING btree ("passenger_id","requested_at");--> statement-breakpoint
CREATE INDEX "bookings_ride_status_idx" ON "bookings" USING btree ("ride_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_passenger_ride_active_uq" ON "bookings" USING btree ("passenger_id","ride_id") WHERE status IN ('pending', 'accepted');--> statement-breakpoint
CREATE INDEX "rides_trip_id_scheduled_departure_idx" ON "rides" USING btree ("trip_id","scheduled_departure");--> statement-breakpoint
CREATE INDEX "rides_status_scheduled_departure_idx" ON "rides" USING btree ("status","scheduled_departure");--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN "seats_available";