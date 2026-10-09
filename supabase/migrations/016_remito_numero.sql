-- 016: Número de remito de entrega en jornada_comprobantes
ALTER TABLE jornada_comprobantes
  ADD COLUMN IF NOT EXISTS remito_numero INT;

CREATE INDEX IF NOT EXISTS idx_jornadacomp_remito ON jornada_comprobantes(remito_numero)
  WHERE remito_numero IS NOT NULL;
