ALTER TABLE loueur_vehicles ADD COLUMN IF NOT EXISTS custom_image_urls JSONB DEFAULT '[]'::jsonb;

-- Backfill: si une seule photo de couverture existe, l'ajouter à la galerie
UPDATE loueur_vehicles
SET custom_image_urls = jsonb_build_array(custom_image_url)
WHERE custom_image_url IS NOT NULL
  AND custom_image_url <> ''
  AND (custom_image_urls IS NULL OR custom_image_urls = '[]'::jsonb);
