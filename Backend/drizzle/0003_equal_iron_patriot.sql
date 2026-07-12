CREATE TABLE "cars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"plate" text NOT NULL,
	"color" text,
	"seats" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cars_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cars_userId_idx" ON "cars" USING btree ("user_id");