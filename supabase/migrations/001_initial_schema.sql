-- ╔══════════════════════════════════════════════════════╗
-- ║     LogiObra - Schema inicial de base de datos       ║
-- ║     Ejecutar en Supabase SQL Editor                  ║
-- ╚══════════════════════════════════════════════════════╝

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── PROVEEDORES ──────────────────────────────────────────
CREATE TABLE proveedores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  telefono    TEXT,
  direccion   TEXT,
  email       TEXT,
  notas       TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MATERIALES ───────────────────────────────────────────
CREATE TABLE materiales (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre          TEXT NOT NULL UNIQUE,
  unidad          TEXT NOT NULL,
  precio_ref      NUMERIC(12,2),
  proveedor_id    UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  notas           TEXT,
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PEDIDOS ──────────────────────────────────────────────
CREATE TABLE pedidos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo          TEXT UNIQUE NOT NULL,
  cliente         TEXT NOT NULL,
  direccion       TEXT NOT NULL,
  zona            TEXT NOT NULL,
  latitud         NUMERIC(10,7),
  longitud        NUMERIC(10,7),
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','preparacion','urgente','entregado','atrasado')),
  fecha_entrega   DATE NOT NULL,
  hora_entrega    TIME NOT NULL,
  observaciones   TEXT,
  atrasado        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ITEMS DEL PEDIDO ─────────────────────────────────────
CREATE TABLE pedido_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  material_id     UUID NOT NULL REFERENCES materiales(id) ON DELETE RESTRICT,
  cantidad        NUMERIC(12,2) NOT NULL,
  precio_unitario NUMERIC(12,2),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── HISTORIAL DE ESTADOS ─────────────────────────────────
CREATE TABLE pedido_historial (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo    TEXT NOT NULL,
  nota            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ÍNDICES ──────────────────────────────────────────────
CREATE INDEX idx_pedidos_estado        ON pedidos(estado);
CREATE INDEX idx_pedidos_fecha         ON pedidos(fecha_entrega);
CREATE INDEX idx_pedidos_zona          ON pedidos(zona);
CREATE INDEX idx_pedido_items_pedido   ON pedido_items(pedido_id);
CREATE INDEX idx_pedido_items_material ON pedido_items(material_id);

-- ─── TRIGGERS updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_materiales_updated_at
  BEFORE UPDATE ON materiales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_proveedores_updated_at
  BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── TRIGGER historial de estados ─────────────────────────
CREATE OR REPLACE FUNCTION log_estado_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO pedido_historial (pedido_id, estado_anterior, estado_nuevo)
    VALUES (NEW.id, OLD.estado, NEW.estado);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_estado
  AFTER UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION log_estado_change();

-- ─── FUNCIÓN: marcar atrasados ────────────────────────────
CREATE OR REPLACE FUNCTION marcar_pedidos_atrasados()
RETURNS void AS $$
  UPDATE pedidos
  SET atrasado = TRUE, estado = 'atrasado'
  WHERE estado NOT IN ('entregado', 'atrasado')
    AND (fecha_entrega < CURRENT_DATE
      OR (fecha_entrega = CURRENT_DATE AND hora_entrega < CURRENT_TIME));
$$ LANGUAGE sql;

-- ─── VISTA: lista de compras ──────────────────────────────
CREATE VIEW vista_lista_compras AS
SELECT
  m.id             AS material_id,
  m.nombre         AS material,
  m.unidad,
  m.precio_ref,
  p.id             AS proveedor_id,
  p.nombre         AS proveedor,
  p.telefono       AS proveedor_tel,
  p.direccion      AS proveedor_dir,
  SUM(pi.cantidad) AS cantidad_total,
  SUM(pi.cantidad) * COALESCE(m.precio_ref, 0) AS costo_estimado
FROM pedido_items pi
JOIN materiales m ON m.id = pi.material_id
JOIN pedidos ped ON ped.id = pi.pedido_id
LEFT JOIN proveedores p ON p.id = m.proveedor_id
WHERE ped.estado NOT IN ('entregado')
GROUP BY m.id, m.nombre, m.unidad, m.precio_ref, p.id, p.nombre, p.telefono, p.direccion
ORDER BY p.nombre, m.nombre;

-- ─── VISTA: hoja de ruta ──────────────────────────────────
CREATE VIEW vista_hoja_ruta AS
SELECT
  ped.id, ped.codigo, ped.cliente, ped.direccion, ped.zona,
  ped.estado, ped.fecha_entrega, ped.hora_entrega,
  ped.observaciones, ped.atrasado,
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'material',  m.nombre,
      'cantidad',  pi.cantidad,
      'unidad',    m.unidad,
      'proveedor', prov.nombre
    ) ORDER BY m.nombre
  ) AS items
FROM pedidos ped
JOIN pedido_items pi ON pi.pedido_id = ped.id
JOIN materiales m ON m.id = pi.material_id
LEFT JOIN proveedores prov ON prov.id = m.proveedor_id
WHERE ped.estado != 'entregado'
GROUP BY ped.id, ped.codigo, ped.cliente, ped.direccion,
         ped.zona, ped.estado, ped.fecha_entrega, ped.hora_entrega,
         ped.observaciones, ped.atrasado
ORDER BY
  CASE ped.estado
    WHEN 'urgente'     THEN 1
    WHEN 'atrasado'    THEN 2
    WHEN 'preparacion' THEN 3
    ELSE 4
  END, ped.hora_entrega;

-- ─── RLS ──────────────────────────────────────────────────
ALTER TABLE pedidos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON pedidos          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON pedido_items     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON materiales       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON proveedores      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON pedido_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── DATOS DE EJEMPLO ─────────────────────────────────────
INSERT INTO proveedores (nombre, telefono, direccion) VALUES
  ('Cementera ABC',        '011-4444-1234', 'Ruta 3 Km 45'),
  ('Ferrería Central',     '011-4555-5678', 'Av. Industrial 900'),
  ('Arenal del Sur',       '011-4666-9012', 'Acceso Sur Km 12'),
  ('Ladrillera Los Andes', '0220-4777-3456','Ruta 6 Km 8'),
  ('Piedra y Más',         '011-4888-7890', 'Av. Circunvalación 2400'),
  ('Revestimientos SA',    '011-4999-2345', 'Monroe 1800');

INSERT INTO materiales (nombre, unidad, precio_ref, proveedor_id) VALUES
  ('Cemento Portland',    'bolsas', 4200,  (SELECT id FROM proveedores WHERE nombre='Cementera ABC')),
  ('Cal',                 'bolsas', 2800,  (SELECT id FROM proveedores WHERE nombre='Cementera ABC')),
  ('Cemento blanco',      'bolsas', 5500,  (SELECT id FROM proveedores WHERE nombre='Cementera ABC')),
  ('Arena fina',          'm³',     18000, (SELECT id FROM proveedores WHERE nombre='Arenal del Sur')),
  ('Arena gruesa',        'm³',     16000, (SELECT id FROM proveedores WHERE nombre='Arenal del Sur')),
  ('Hierro 8mm',          'barras', 1800,  (SELECT id FROM proveedores WHERE nombre='Ferrería Central')),
  ('Hierro 12mm',         'barras', 2900,  (SELECT id FROM proveedores WHERE nombre='Ferrería Central')),
  ('Malla electrosoldada','rollos', 12000, (SELECT id FROM proveedores WHERE nombre='Ferrería Central')),
  ('Ladrillos huecos',    'u',      85,    (SELECT id FROM proveedores WHERE nombre='Ladrillera Los Andes')),
  ('Adoquines',           'u',      320,   (SELECT id FROM proveedores WHERE nombre='Piedra y Más')),
  ('Porcelanato',         'm²',     8500,  (SELECT id FROM proveedores WHERE nombre='Revestimientos SA'));
