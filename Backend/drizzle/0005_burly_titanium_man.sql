ALTER TABLE "car_models" ADD COLUMN "year" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "car_models_brand_name_year_uniq" ON "car_models" USING btree ("brand","name","year");