import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const SQL_CHECK = `
SELECT
  m.id as mat_id, m.nombre as mat_nombre, m.precio_ref,
  lpi.id as item_id, lpi.descripcion_original, lpi.precio as item_precio, lpi.material_id
FROM materiales m
CROSS JOIN lista_precios_items lpi
JOIN listas_precios lp ON lpi.lista_id = lp.id AND lp.activa = true
WHERE m.activo = true
  AND (
    m.nombre ILIKE '%aislante%espuma%aluminizada%5%'
    OR m.nombre ILIKE '%aislante%espuma%aluminizada%10%'
  )
  AND (
    lpi.descripcion_original ILIKE '%espuma%aluminio%5%'
    OR lpi.descripcion_original ILIKE '%espuma%aluminio%10%'
    OR lpi.descripcion_original ILIKE '%aislante%espuma%5%'
    OR lpi.descripcion_original ILIKE '%aislante%espuma%10%'
    OR lpi.descripcion_original ILIKE '%espuma%aluminiz%5%'
    OR lpi.descripcion_original ILIKE '%espuma%aluminiz%10%'
  )
ORDER BY m.nombre, lpi.descripcion_original
LIMIT 20
`

const SQL_FIX = `
-- Enlazar Espuma Con Aluminio 5MM → Aislante espuma aluminizada 5mm
UPDATE lista_precios_items lpi
SET material_id = m.id
FROM materiales m
WHERE m.activo = true
  AND m.nombre ILIKE '%aislante%espuma%aluminizada%5%'
  AND lpi.material_id IS NULL
  AND (
    lpi.descripcion_original ILIKE '%espuma%aluminio%5%'
    OR lpi.descripcion_original ILIKE '%espuma%aluminiz%5%'
    OR lpi.descripcion_original ILIKE '%aislante%espuma%5%'
  );

-- Enlazar Espuma Con Aluminio 10MM → Aislante espuma aluminizada 10mm
UPDATE lista_precios_items lpi
SET material_id = m.id
FROM materiales m
WHERE m.activo = true
  AND m.nombre ILIKE '%aislante%espuma%aluminizada%10%'
  AND lpi.material_id IS NULL
  AND (
    lpi.descripcion_original ILIKE '%espuma%aluminio%10%'
    OR lpi.descripcion_original ILIKE '%espuma%aluminiz%10%'
    OR lpi.descripcion_original ILIKE '%aislante%espuma%10%'
  );

-- Actualizar precio_ref de los materiales con el precio más reciente de la lista activa
UPDATE materiales m
SET precio_ref = lpi.precio, updated_at = NOW()
FROM lista_precios_items lpi
JOIN listas_precios lp ON lpi.lista_id = lp.id
WHERE lpi.material_id = m.id
  AND lp.activa = true
  AND lpi.precio > 0
  AND m.nombre ILIKE '%aislante%espuma%aluminizada%'
  AND lp.created_at = (
    SELECT MAX(lp2.created_at)
    FROM listas_precios lp2
    JOIN lista_precios_items lpi2 ON lpi2.lista_id = lp2.id
    WHERE lpi2.material_id = m.id AND lp2.activa = true
  );

SELECT m.nombre, m.precio_ref, lpi.descripcion_original, lpi.precio
FROM materiales m
JOIN lista_precios_items lpi ON lpi.material_id = m.id
JOIN listas_precios lp ON lpi.lista_id = lp.id AND lp.activa = true
WHERE m.nombre ILIKE '%aislante%espuma%aluminizada%'
ORDER BY m.nombre;
`

export async function GET(req: NextRequest) {
  const pat = req.nextUrl.searchParams.get('pat')
  if (!pat) return NextResponse.json({ error: 'Falta ?pat=' }, { status: 400 })
  const action = req.nextUrl.searchParams.get('action') || 'check'
  const sql = action === 'fix' ? SQL_FIX : SQL_CHECK
  const resp = await fetch(
    'https://api.supabase.com/v1/projects/jjqqnbwmaxsybhpcvdfm/database/query',
    { method: 'POST', headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) }
  )
  const data = await resp.json()
  if (!resp.ok) return NextResponse.json({ error: data }, { status: 500 })
  return NextResponse.json({ ok: true, action, data })
}
