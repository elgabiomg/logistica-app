-- Migración 015: El Obralista — campos de marca + jornadas de reparto

-- ─── EMPRESA CONFIG: campos de marca ─────────────────────────────────────────
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS eslogan        TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp       TEXT,
  ADD COLUMN IF NOT EXISTS color_primario TEXT DEFAULT '#F5A623',
  ADD COLUMN IF NOT EXISTS color_secundario TEXT DEFAULT '#1a1a1a',
  ADD COLUMN IF NOT EXISTS prefijo_remito TEXT DEFAULT '0001';

-- Actualizar datos a El Obralista
UPDATE empresa_config SET
  nombre            = 'El Obralista',
  eslogan           = 'Toda obra necesita su Obralista',
  whatsapp          = '2995857943',
  color_primario    = '#F5A623',
  color_secundario  = '#1a1a1a',
  pie_comprobante   = 'Datos para transferencia: escribinos por WhatsApp al 299 585-7943'
WHERE id = 1;

-- ─── JORNADAS DE REPARTO ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jornadas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  estado      TEXT NOT NULL DEFAULT 'planificada', -- planificada | activa | cerrada
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Comprobantes incluidos en una jornada (con datos de entrega y cobro)
CREATE TABLE IF NOT EXISTS jornada_comprobantes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jornada_id      UUID NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
  comprobante_id  UUID NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
  orden           INT DEFAULT 0,               -- para drag & drop en hoja de ruta

  -- Control de carga
  comprado        BOOLEAN DEFAULT FALSE,
  cargado         BOOLEAN DEFAULT FALSE,

  -- Entrega
  entregado       BOOLEAN DEFAULT FALSE,
  fecha_entrega_real TIMESTAMPTZ,
  gps_lat         NUMERIC(10,7),
  gps_lng         NUMERIC(10,7),
  nombre_receptor TEXT,
  dni_receptor    TEXT,
  obs_entrega     TEXT,
  foto_remito_url TEXT,
  firma_url       TEXT,

  -- Cobro
  monto_cobrado   NUMERIC(14,2),
  medio_pago_cobro TEXT,                       -- efectivo | transferencia | debito | credito | qr
  comision_pct    NUMERIC(6,2),
  fecha_acreditacion DATE,
  cobro_caja_id   UUID REFERENCES caja_movimientos(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (jornada_id, comprobante_id)
);

-- Un comprobante solo puede estar en una jornada activa/planificada a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_jornada_comp_activa
  ON jornada_comprobantes (comprobante_id)
  WHERE (SELECT estado FROM jornadas WHERE id = jornada_id) IN ('planificada', 'activa');

-- Índices
CREATE INDEX IF NOT EXISTS idx_jornadas_fecha       ON jornadas(fecha);
CREATE INDEX IF NOT EXISTS idx_jornadas_estado      ON jornadas(estado);
CREATE INDEX IF NOT EXISTS idx_jornadacomp_jornada  ON jornada_comprobantes(jornada_id);
CREATE INDEX IF NOT EXISTS idx_jornadacomp_comp     ON jornada_comprobantes(comprobante_id);

-- RLS
DO $rls$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['jornadas','jornada_comprobantes']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'auth_all') THEN
      EXECUTE format('CREATE POLICY "auth_all" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $rls$;
