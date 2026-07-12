ALTER TABLE "profile" DROP CONSTRAINT "profile_user_id_unique";--> statement-breakpoint
DROP INDEX "profile_userId_idx";--> statement-breakpoint
ALTER TABLE "profile" DROP CONSTRAINT "profile_pkey";--> statement-breakpoint
ALTER TABLE "profile" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "profile" ADD PRIMARY KEY ("user_id");
