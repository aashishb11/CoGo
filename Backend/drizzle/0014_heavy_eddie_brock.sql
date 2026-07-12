ALTER TABLE "profile" ADD COLUMN "xp_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "rides_as_driver" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "rides_as_passenger" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "badges" jsonb DEFAULT '[]'::jsonb NOT NULL;