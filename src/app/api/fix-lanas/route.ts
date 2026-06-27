import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const SQL_CHECK = `
-- Materiales lanas de vidrio
SELECT m.id, m.nombre, m.precio_ref, m.lista1_pct, m.lista2_pct, m.lista3_pct
FROM materiales m
WHERE m.activo = true
  AND (m.nombre ILIKE '%lana%vidrio%' OR m.nombre ILIKE '%l.%vidrio%' OR m.nombre ILIKE '%l. vidrio%')
ORDER BY m.nombre;
`

const SQL_CHECK2 = `
-- Items de lista activa relacionados con lana de vidrio
SELECT lpi.id, lpi.descripcion_original, lpi.precio, lpi.material_id
FROM lista_precios_items lpi
JOIN listas_precios lp ON lpi.lista_id = lp.id AND lp.activa = true
WHERE lpi.descripcion_original ILIKE '%vidrio%'
   OR lpi.descripcion_original ILIKE '%fieltro%'
   OR lpi.descripcion_original ILIKE '%rolac%'
ORDER BY lpi.descripcion_original;
`

const SQL_FIX = `
-- 1. Setear porcentajes L1 30% L2 25% L3 20% a TODAS las lanas de vidrio
UPDATE materiales
SET lista1_pct = 30, lista2_pct = 25, lista3_pct = 20, updated_at = NOW()
WHERE activo = true
  AND (nombre ILIKE '%lana%vidrio%' OR nombre ILIKE '%l.%vidrio%' OR nombre ILIKE '%l. vidrio%');

-- 2. Enlazar items de lista a materiales por precio coincidente (técnica exacta)
UPDATE lista_precios_items lpi
SET material_id = m.id
FROM materiales m,
     listas_precios lp
WHERE lp.activa = true
  AND lpi.lista_id = lp.id
  AND m.activo = true
  AND (m.nombre ILIKE '%lana%vidrio%' OR m.nombre ILIKE '%l.%vidrio%' OR m.nombre ILIKE '%l. vidrio%')
  AND ABS(lpi.precio - m.precio_ref) < 1;

-- 3. Verificar resultado
SELECT m.nombre, m.precio_ref, m.lista1_pct, lpi.descripcion_original, lpi.precio
FROM materiales m
LEFT JOIN lista_precios_items lpi ON lpi.material_id = m.id
WHERE m.activo = true
  AND (m.nombre ILIKE '%lana%vidrio%' OR m.nombre ILIKE '%l.%vidrio%' OR m.nombre ILIKE '%l. vidrio%')
ORDER BY m.nombre;
`

export async function GET(req: NextRequest) {
  const pat = req.nextUrl.searchParams.get('pat')
  if (!pat) return NextResponse.json({ error: 'Falta ?pat=' }, { status: 400 })
  const action = req.nextUrl.searchParams.get('action') || 'check'
  const sql = action === 'fix' ? SQL_FIX : action === 'check2' ? SQL_CHECK2 : SQL_CHECK
  const resp = await fetch(
    'https://api.supabase.com/v1/projects/jjqqnbwmaxsybhpcvdfm/database/query',
    { method: 'POST', headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) }
  )
  const data = await resp.json()
  if (!resp.ok) return NextResponse.json({ error: data }, { status: 500 })
  return NextResponse.json({ ok: true, action, data })
}
