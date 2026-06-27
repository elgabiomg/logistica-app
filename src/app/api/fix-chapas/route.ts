import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const SQL_CHECK_MAT = `
SELECT id, nombre, precio_ref, lista1_pct, lista2_pct, lista3_pct, rubro, codigo, proveedor_id
FROM materiales
WHERE activo = true
  AND nombre ILIKE '%chapa%trap%negr%25%'
ORDER BY nombre;
`

const SQL_CHECK_LISTA = `
SELECT lpi.id, lpi.descripcion_original, lpi.precio, lpi.material_id
FROM lista_precios_items lpi
JOIN listas_precios lp ON lpi.lista_id = lp.id AND lp.activa = true
WHERE lpi.descripcion_original ILIKE '%T 101%negra%25%'
   OR lpi.descripcion_original ILIKE '%T101%negra%25%'
ORDER BY lpi.descripcion_original;
`

const SQL_CHECK_COLORES = `
SELECT nombre, precio_ref, lista1_pct FROM materiales
WHERE activo = true
  AND (nombre ILIKE '%chapa%trap%azul%25%'
    OR nombre ILIKE '%chapa%trap%verde%25%'
    OR nombre ILIKE '%chapa%trap%roja%25%')
ORDER BY nombre;
`

export async function GET(req: NextRequest) {
  const pat = req.nextUrl.searchParams.get('pat')
  if (!pat) return NextResponse.json({ error: 'Falta ?pat=' }, { status: 400 })
  const action = req.nextUrl.searchParams.get('action') || 'check'
  const sqlMap: Record<string,string> = {
    check: SQL_CHECK_MAT,
    lista: SQL_CHECK_LISTA,
    colores: SQL_CHECK_COLORES,
  }
  const sql = sqlMap[action]
  if (!sql) return NextResponse.json({ error: 'action inválida' }, { status: 400 })
  const resp = await fetch(
    'https://api.supabase.com/v1/projects/jjqqnbwmaxsybhpcvdfm/database/query',
    { method: 'POST', headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) }
  )
  const data = await resp.json()
  if (!resp.ok) return NextResponse.json({ error: data }, { status: 500 })
  return NextResponse.json({ ok: true, action, data })
}
