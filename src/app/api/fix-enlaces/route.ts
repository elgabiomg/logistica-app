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
-- Enlazar Espuma Con Aluminio 5MM → Aislante espuma aluminizada 5mm (IDs exactos)
UPDATE lista_precios_items
SET material_id = 'b5a5569f-d9e7-4e20-9e91-dcc6f0e9d06f'
WHERE id = '45e49d65-d9d2-4e5c-ac09-9e63e29add79';

-- Enlazar Espuma Con Aluminio 10MM → Aislante espuma aluminizada 10mm (IDs exactos)
UPDATE lista_precios_items
SET material_id = 'bb21792a-99e6-4b54-974d-d250bc60ca15'
WHERE id = '64ce1d5b-49ad-42b6-81d5-8876e6c7e550';

-- Actualizar precio_ref con los precios correctos (con IVA)
UPDATE materiales SET precio_ref = 28329.09, updated_at = NOW()
WHERE id = 'b5a5569f-d9e7-4e20-9e91-dcc6f0e9d06f';

UPDATE materiales SET precio_ref = 44104.73, updated_at = NOW()
WHERE id = 'bb21792a-99e6-4b54-974d-d250bc60ca15';

-- Verificar resultado
SELECT m.nombre, m.precio_ref, lpi.descripcion_original, lpi.precio
FROM materiales m
JOIN lista_precios_items lpi ON lpi.material_id = m.id
WHERE m.id IN ('b5a5569f-d9e7-4e20-9e91-dcc6f0e9d06f','bb21792a-99e6-4b54-974d-d250bc60ca15')
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
