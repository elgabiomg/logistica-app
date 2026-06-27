import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'
export const maxDuration = 30

const SYSTEM = 'Sos un asistente de contabilidad para un negocio de materiales de construcción en Argentina. ' +
  'Analizá la foto del ticket o factura y devolvé SOLO un JSON con esta estructura exacta: ' +
  '{ "proveedor": string, "fecha": string (formato YYYY-MM-DD), "total": number (en pesos, sin símbolos ni puntos de miles), ' +
  '"categoria": string (una de: Compra de materiales, Flete y logística, Servicios y alquileres, Sueldos, Gastos varios), ' +
  '"nota": string (descripción breve de los ítems principales) }. ' +
  'Si no podés leer algún campo, usá null. No agregues texto fuera del JSON.'

function extractJSON(text: string): any {
  try { return JSON.parse(text) } catch {}
  const md = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (md) return JSON.parse(md[1])
  const raw = text.match(/\{[\s\S]*\}/)
  if (raw) return JSON.parse(raw[0])
  throw new Error('No se encontró JSON')
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  }
  try {
    const fd = await req.formData()
    const img = fd.get('ticket') as File | null
    if (!img) return NextResponse.json({ error: 'No se recibió imagen' }, { status: 400 })
    const bytes = await img.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = (img.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1024, system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'Analizá este ticket/factura y devolvé el JSON.' }
      ] }]
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    return NextResponse.json(extractJSON(raw))
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al analizar el ticket' }, { status: 500 })
  }
}
