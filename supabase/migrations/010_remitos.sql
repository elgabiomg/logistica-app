-- Remitos derivados de una factura (entregas parciales) + acopio / pendiente de entrega
ALTER TABLE comprobantes      ADD COLUMN IF NOT EXISTS comprobante_padre_id UUID REFERENCES comprobantes(id) ON DELETE SET NULL;
ALTER TABLE comprobantes      ADD COLUMN IF NOT EXISTS entrega_estado TEXT;          -- 'completo' | 'parcial' (solo en facturas con remitos)
ALTER TABLE comprobantes      ADD COLUMN IF NOT EXISTS destino_pendiente TEXT;       -- 'acopio' | 'pendiente_entrega'
ALTER TABLE comprobante_items ADD COLUMN IF NOT EXISTS cantidad_entregada NUMERIC DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_comprobantes_padre ON comprobantes(comprobante_padre_id);
