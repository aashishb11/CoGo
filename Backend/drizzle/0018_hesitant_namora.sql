CREATE TABLE "safety_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"category" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_contacts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "fare_cents" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "boarded_at" timestamp;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "flagged_for_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "price_per_seat_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contacts" ADD CONSTRAINT "trusted_contacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_wallets_user_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "safety_incidents_reporter_created_idx" ON "safety_incidents" USING btree ("reporter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_holds_booking_active_uq" ON "wallet_holds" USING btree ("booking_id") WHERE status = 'active';