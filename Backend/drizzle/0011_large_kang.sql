CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "organization_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_domain_idx" ON "organizations" USING btree ("domain");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;