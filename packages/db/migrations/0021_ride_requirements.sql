CREATE TABLE "ride_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"text" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_requirements_text_length" CHECK (char_length("ride_requirements"."text") between 1 and 120),
	CONSTRAINT "ride_requirements_position_non_negative" CHECK ("ride_requirements"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ride_requirements" ADD CONSTRAINT "ride_requirements_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requirements_ride_id_position_unique" ON "ride_requirements" USING btree ("ride_id","position");