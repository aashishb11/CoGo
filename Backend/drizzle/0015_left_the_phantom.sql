CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"ride_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"passenger_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"driver_last_read_at" timestamp,
	"passenger_last_read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_user_id_user_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_passenger_id_user_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_created_idx" ON "chat_messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_threads_trip_passenger_uq" ON "chat_threads" USING btree ("trip_id","passenger_id");--> statement-breakpoint
CREATE INDEX "chat_threads_trip_id_idx" ON "chat_threads" USING btree ("trip_id");