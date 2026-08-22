ALTER TABLE loueur_vehicles
ADD COLUMN IF NOT EXISTS listing_extras JSONB DEFAULT '{}'::jsonb;
