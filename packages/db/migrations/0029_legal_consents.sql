CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"content_sha256" text NOT NULL,
	"source" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_acceptances_document_known" CHECK ("legal_acceptances"."document" in ('terms', 'personal_data_consent')),
	CONSTRAINT "legal_acceptances_source_known" CHECK ("legal_acceptances"."source" in ('register_password', 'oauth_google', 'oauth_yandex', 'reconsent')),
	CONSTRAINT "legal_acceptances_sha256_hex" CHECK ("legal_acceptances"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legal_acceptances_version_not_blank" CHECK (length(btrim("legal_acceptances"."version")) > 0)
);
--> statement-breakpoint
CREATE TABLE "oauth_pending_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"next" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_pending_signups_provider_known" CHECK ("oauth_pending_signups"."provider" in ('google', 'yandex'))
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_acceptances_user_document_version_unique" ON "legal_acceptances" USING btree ("user_id","document","version");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_pending_signups_token_hash_unique" ON "oauth_pending_signups" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_pending_signups_provider_account_unique" ON "oauth_pending_signups" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "oauth_pending_signups_expires_at_idx" ON "oauth_pending_signups" USING btree ("expires_at");