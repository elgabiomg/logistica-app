-- Registro de actividad (quién hizo qué) + atribución por operador
CREATE TABLE IF NOT EXISTS actividad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  operador TEXT, accion TEXT, entidad TEXT, entidad_id TEXT, detalle TEXT
);
ALTER TABLE actividad ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='actividad' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON actividad FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON actividad(created_at DESC);

ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS creado_por TEXT;
ALTER TABLE pedidos          ADD COLUMN IF NOT EXISTS creado_por TEXT;
ALTER TABLE comprobantes     ADD COLUMN IF NOT EXISTS creado_por TEXT;
ALTER TABLE clientes         ADD COLUMN IF NOT EXISTS creado_por TEXT;
