-- ╔══════════════════════════════════════════════════════╗
-- ║     LogiObra - Migración 002: Listas de precios      ║
-- ║     Ejecutar en Supabase SQL Editor                  ║
-- ╚══════════════════════════════════════════════════════╝

-- ─── Descuentos por forma de pago en proveedores ──────
ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS descuento_contado       NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_transferencia NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_tarjeta       NUMERIC(5,2) DEFAULT 0;

-- ─── Listas de precios por proveedor ──────────────────
CREATE TABLE IF NOT EXISTS listas_precios (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL DEFAULT 'Lista de precios',
  activa       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Ítems de la lista de precios ─────────────────────
CREATE TABLE IF NOT EXISTS lista_precios_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lista_id             UUID NOT NULL REFERENCES listas_precios(id) ON DELETE CASCADE,
  material_id          UUID REFERENCES materiales(id) ON DELETE SET NULL,
  descripcion_original TEXT NOT NULL,
  precio               NUMERIC(12,2) NOT NULL DEFAULT 0,
  unidad               TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_listas_proveedor ON listas_precios(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_items_lista      ON lista_precios_items(lista_id);
CREATE INDEX IF NOT EXISTS idx_items_material   ON lista_precios_items(material_id);

-- ─── RLS ──────────────────────────────────────────────
ALTER TABLE listas_precios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lista_precios_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON listas_precios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON lista_precios_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
