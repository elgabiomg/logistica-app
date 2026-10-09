-- 017: Snapshots de remitos de entrega
CREATE TABLE IF NOT EXISTS remito_snapshots (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jornada_comprobante_id UUID NOT NULL REFERENCES jornada_comprobantes(id) ON DELETE CASCADE,
  remito_numero         INT NOT NULL,

  -- Snapshot de empresa (al momento de generar el remito)
  empresa_nombre        TEXT,
  empresa_cuit          TEXT,
  empresa_direccion     TEXT,
  empresa_localidad     TEXT,
  empresa_telefono      TEXT,
  empresa_logo_url      TEXT,
  empresa_condicion_iva TEXT,
  prefijo_remito        TEXT DEFAULT '0001',

  -- Snapshot de cliente/comprobante
  cliente_nombre        TEXT,
  cliente_direccion     TEXT,
  cliente_localidad     TEXT,
  cliente_telefono      TEXT,
  cliente_cuit          TEXT,
  condicion_pago        TEXT,
  comp_tipo             TEXT,
  comp_numero           INT,

  -- Ítems y totales (snapshot inmutable)
  items                 JSONB NOT NULL DEFAULT '[]',
  subtotal              NUMERIC(14,2) DEFAULT 0,
  descuento             NUMERIC(14,2) DEFAULT 0,
  recargo               NUMERIC(14,2) DEFAULT 0,
  total                 NUMERIC(14,2) DEFAULT 0,

  -- Datos de entrega (referencia)
  monto_cobrado         NUMERIC(14,2),
  medio_pago_cobro      TEXT,
  nombre_receptor       TEXT,
  dni_receptor          TEXT,
  obs_entrega           TEXT,
  firma_url             TEXT,
  foto_remito_url       TEXT,
  gps_lat               NUMERIC(10,7),
  gps_lng               NUMERIC(10,7),
  fecha_entrega         TIMESTAMPTZ,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (jornada_comprobante_id)
);

ALTER TABLE remito_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON remito_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_remito_snap_jc ON remito_snapshots(jornada_comprobante_id);
CREATE INDEX IF NOT EXISTS idx_remito_snap_num ON remito_snapshots(remito_numero);
