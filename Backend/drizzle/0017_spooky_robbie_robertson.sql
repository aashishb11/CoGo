CREATE TABLE "wallet_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"booking_id" text,
	"ride_id" text,
	"stripe_ref" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"held_cents" integer DEFAULT 0 NOT NULL,
	"stripe_connect_account_id" text,
	"payout_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_user_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_transactions_wallet_created_idx" ON "wallet_transactions" USING btree ("wallet_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_transactions_stripe_ref_uq" ON "wallet_transactions" USING btree ("stripe_ref") WHERE "wallet_transactions"."stripe_ref" is not null;