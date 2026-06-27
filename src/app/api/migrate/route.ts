import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const SQL = `
CREATE TABLE IF NOT EXISTS empresa_config (
  id INT PRIMARY KEY DEFAULT 1,
  nombre TEXT, direccion TEXT, localidad TEXT, provincia TEXT, cp TEXT,
  cuit TEXT, iibb TEXT, condicion_iva TEXT DEFAULT 'Responsable Inscripto',
  inicio_actividad DATE, telefono TEXT, email TEXT, logo_url TEXT,
  punto_venta INT DEFAULT 1, pie_comprobante TEXT,
  CONSTRAINT solo_una_fila CHECK (id = 1)
);
INSERT INTO empresa_config (id, nombre, direccion, localidad, provincia, cuit, condicion_iva, inicio_actividad, telefono, pie_comprobante)
VALUES (1, 'HORNERO', 'I. Marrazzo y Saturnino Franco. Parque Industrial', 'Cipolletti', 'Río Negro',
        '20428503466', 'Responsable Inscripto', '2021-01-03', '2995474780',
        'Datos para realizar el pago por transferencia: hornero.cipo')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS vendedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL, activo BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO vendedores (nombre) SELECT 'Mostrador' WHERE NOT EXISTS (SELECT 1 FROM vendedores);

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL, direccion TEXT, localidad TEXT, provincia TEXT, cp TEXT,
  cuit TEXT, dni TEXT, condicion_iva TEXT DEFAULT 'Consumidor Final',
  telefono TEXT, email TEXT, notas TEXT,
  activo BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE materiales ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE materiales ADD COLUMN IF NOT EXISTS rubro  TEXT;
ALTER TABLE materiales ADD COLUMN IF NOT EXISTS stock  NUMERIC(12,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS comprobantes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL DEFAULT 'presupuesto', punto_venta INT DEFAULT 1, numero INT NOT NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL, cliente_nombre TEXT, vendedor TEXT,
  fecha DATE DEFAULT CURRENT_DATE, condicion_pago TEXT DEFAULT 'CONTADO',
  subtotal NUMERIC(14,2) DEFAULT 0, recargo NUMERIC(14,2) DEFAULT 0, descuento NUMERIC(14,2) DEFAULT 0,
  percepciones NUMERIC(14,2) DEFAULT 0, total NUMERIC(14,2) DEFAULT 0,
  observaciones TEXT, estado TEXT DEFAULT 'emitido',
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS comprobante_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comprobante_id UUID NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
  material_id UUID REFERENCES materiales(id) ON DELETE SET NULL,
  codigo TEXT, detalle TEXT NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL DEFAULT 1, precio_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
  importe NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL, concepto TEXT NOT NULL, monto NUMERIC(14,2) NOT NULL,
  medio_pago TEXT DEFAULT 'efectivo',
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  comprobante_id UUID REFERENCES comprobantes(id) ON DELETE SET NULL,
  fecha DATE DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cc_movimientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, monto NUMERIC(14,2) NOT NULL, concepto TEXT,
  comprobante_id UUID REFERENCES comprobantes(id) ON DELETE SET NULL,
  fecha DATE DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comprobantes_cliente ON comprobantes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_tipo ON comprobantes(tipo);
CREATE INDEX IF NOT EXISTS idx_compitems_comp ON comprobante_items(comprobante_id);
CREATE INDEX IF NOT EXISTS idx_caja_fecha ON caja_movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_cc_cliente ON cc_movimientos(cliente_id);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['empresa_config','vendedores','clientes','comprobantes','comprobante_items','caja_movimientos','cc_movimientos']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'auth_all') THEN
      EXECUTE format('CREATE POLICY "auth_all" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $rls$;
`

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const pat = req.nextUrl.searchParams.get('pat')
  if (!pat) return NextResponse.json({ error: 'Falta ?pat=TU_TOKEN' }, { status: 400 })
  const resp = await fetch(
    'https://api.supabase.com/v1/projects/jjqqnbwmaxsybhpcvdfm/database/query',
    { method: 'POST', headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: SQL }) }
  )
  const data = await resp.json()
  if (!resp.ok) return NextResponse.json({ error: 'Management API error', status: resp.status, data }, { status: 500 })
  return NextResponse.json({ ok: true, message: '✅ Migración ERP (004) aplicada — clientes, comprobantes, caja, cuenta corriente' })
}
