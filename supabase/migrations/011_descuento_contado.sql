-- Descuento contado: nombre y porcentaje configurables por empresa
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS descuento_contado_nombre TEXT DEFAULT 'Descuento contado',
  ADD COLUMN IF NOT EXISTS descuento_contado_pct    NUMERIC(8,2) DEFAULT 32;
