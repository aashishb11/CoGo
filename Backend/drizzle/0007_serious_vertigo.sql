ALTER TABLE "trips" RENAME COLUMN "smoke_preference" TO "smoke_allowed";--> statement-breakpoint
ALTER TABLE "trips" RENAME COLUMN "music_preference" TO "music_allowed";--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "total_distance_km" double precision;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "estimated_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "route_polyline" text;--> statement-breakpoint
UPDATE "trips" SET "type" = 'sporadic' WHERE "type" = 'one_time';--> statement-breakpoint
UPDATE "trips" SET "status" = 'active' WHERE "status" = 'full';
