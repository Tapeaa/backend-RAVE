-- Mode de contrat location : app_default (diffusion multi-loueurs même modèle) ou custom (annonce ciblée)
ALTER TABLE loueur_vehicles
ADD COLUMN IF NOT EXISTS rental_contract_mode text NOT NULL DEFAULT 'app_default';

COMMENT ON COLUMN loueur_vehicles.rental_contract_mode IS 'app_default | custom';
