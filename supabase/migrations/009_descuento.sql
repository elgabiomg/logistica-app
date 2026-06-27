-- Descuento general configurable (%). Los recargos quedan ocultos en el PDF; los descuentos se muestran.
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS descuento_general NUMERIC(6,2) DEFAULT 0;
ALTER TABLE comprobantes   ADD COLUMN IF NOT EXISTS descuento_pct NUMERIC(6,2);
