-- ╔══════════════════════════════════════════════════════╗
-- ║  LogiObra - Migración 003: Pedidos con campos opcionales ║
-- ║  Permite guardar pedidos incompletos (borradores)        ║
-- ╚══════════════════════════════════════════════════════╝

-- Hacer opcionales fecha y hora de entrega
ALTER TABLE pedidos ALTER COLUMN fecha_entrega DROP NOT NULL;
ALTER TABLE pedidos ALTER COLUMN hora_entrega  DROP NOT NULL;

-- Hacer opcionales dirección y zona (cliente queda como mínimo recomendado)
ALTER TABLE pedidos ALTER COLUMN direccion DROP NOT NULL;
ALTER TABLE pedidos ALTER COLUMN zona      DROP NOT NULL;
