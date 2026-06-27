-- Recargo general (configurable) + recargo por artículo
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS recargo_general NUMERIC(6,2) DEFAULT 47.04;
UPDATE empresa_config SET recargo_general = 47.04 WHERE recargo_general IS NULL;
ALTER TABLE materiales ADD COLUMN IF NOT EXISTS recargo NUMERIC(6,2);
