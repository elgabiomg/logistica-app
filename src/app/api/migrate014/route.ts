import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const SQL = `
ALTER TABLE materiales
  ADD COLUMN IF NOT EXISTS lista1_pct NUMERIC(8,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lista2_pct NUMERIC(8,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lista3_pct NUMERIC(8,2) DEFAULT NULL;

UPDATE materiales SET lista1_pct = 30, lista2_pct = 25, lista3_pct = 20
WHERE activo = true AND (
    nombre ILIKE '%plasticor%'
 OR nombre ILIKE '%cal%santa%b_rbara%'
 OR nombre ILIKE '%yeso%corral%'
 OR nombre ILIKE '%base coat%'
 OR nombre ILIKE '%porcellanato fluido%'
 OR nombre ILIKE '%rapibrick%'
 OR nombre ILIKE '%aislante%'
 OR nombre ILIKE '%lana%vidrio%'
 OR nombre ILIKE '%membrana%asfalt%'
 OR nombre ILIKE '%planchuela%'
 OR nombre ILIKE '%chapa%lisa%galv%'
 OR nombre ILIKE '%chapa%lisa%negra%'
 OR nombre ILIKE '%chapa lisa%'
);

UPDATE materiales SET lista1_pct = 50, lista2_pct = 40, lista3_pct = 30
WHERE activo = true AND (
    (nombre ILIKE '%construkor%' AND nombre ILIKE '%25%')
 OR (nombre ILIKE '%rapibrick%'  AND nombre ILIKE '%25%')
 OR nombre ILIKE '%chapa%cart%'
 OR nombre ILIKE '%cart%n%'
 OR nombre ILIKE '%pintura%asfalt%'
 OR (nombre ILIKE '%hidr%fugo%' AND (nombre ILIKE '%10%' OR nombre ILIKE '%20%'))
 OR nombre ILIKE '%acelerant%'
 OR nombre ILIKE '%sika%latex%'
 OR nombre ILIKE '%sikalatex%'
 OR nombre ILIKE '%ligante%'
 OR (nombre ILIKE '%malla%sima%' AND nombre ILIKE '%4%')
 OR nombre ILIKE '%clavo%esp%'
);

UPDATE materiales SET lista1_pct = 300, lista2_pct = 250, lista3_pct = 200
WHERE activo = true AND (
    nombre ILIKE '%pastin%'
 OR nombre ILIKE '%malla%sost%'
);

UPDATE materiales SET lista1_pct = 100, lista2_pct = 75, lista3_pct = 50
WHERE activo = true AND (
    nombre ILIKE '%capa%aislad%'
 OR (nombre ILIKE '%hidr%fugo%' AND (nombre ILIKE '%1 lt%' OR nombre ILIKE '%4 lt%' OR nombre ILIKE '%1lt%' OR nombre ILIKE '%4lt%'))
 OR nombre ILIKE '%alambre%'
 OR nombre ILIKE '%clavo%plomo%'
 OR nombre ILIKE '%autoperfor%'
);
`

export async function GET(req: NextRequest) {
  const pat = req.nextUrl.searchParams.get('pat')
  if (!pat) return NextResponse.json({ error: 'Falta ?pat=TU_TOKEN' }, { status: 400 })
  const resp = await fetch(
    'https://api.supabase.com/v1/projects/jjqqnbwmaxsybhpcvdfm/database/query',
    { method: 'POST', headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: SQL }) }
  )
  const data = await resp.json()
  if (!resp.ok) return NextResponse.json({ error: 'Management API error', data }, { status: 500 })
  return NextResponse.json({ ok: true, message: '✅ Migración 014 aplicada — porcentajes de ganancia por material' })
}
