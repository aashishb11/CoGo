CREATE TABLE "car_models" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"co2_kg_per_km" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "model_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "passenger_seats" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_model_id_car_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."car_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" DROP COLUMN "brand";--> statement-breakpoint
ALTER TABLE "cars" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "cars" DROP COLUMN "seats";