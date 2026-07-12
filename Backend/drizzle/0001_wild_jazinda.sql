CREATE TABLE "profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"bio" text,
	"phone" text,
	"locale" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profile_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "profile_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_userId_idx" ON "profile" USING btree ("user_id");