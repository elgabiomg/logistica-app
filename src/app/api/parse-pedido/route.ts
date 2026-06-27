import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const imagenes = formData.getAll('imagenes') as File[]
    const materialesJson = formData.get('materiales') as string | null

    if (!imagenes.length) {
      return NextResponse.json({ error: 'No se recibieron imágenes' }, { status: 400 })
    }

    const mats: Array<{ id: string; nombre: string; unidad: string }> =
      materialesJson ? JSON.parse(materialesJson) : []

    const matsStr = mats.length
      ? mats.map(m => `{"id":"${m.id}","nombre":"${m.nombre}","unidad":"${m.unidad}"}`).join(', ')
      : '(sin materiales cargados)'

    // Construir contenido con todas las imágenes
    const content: Anthropic.MessageParam['content'] = []

    for (const img of imagenes) {
      const bytes = await img.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const mediaType = (img.type || 'image/jpeg') as
        'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 }
      })
    }

    content.push({
      type: 'text',
      text: `Analizá ${imagenes.length > 1 ? 'estas imágenes' : 'esta imagen'} de un sistema de gestión (Hornero/Odoo) o WhatsApp.

Extraé TODA la información disponible y organizala así:
- Datos del cliente: nombre, dirección, localidad, provincia, teléfono, DNI, CUIT
- Lista de materiales: cada ítem con su cantidad

Para los materiales, intentá hacer coincidir con esta lista: [${matsStr}]

Reglas:
- Si un campo no está en la imagen, usá null
- "descripcion_original": el texto exacto de la imagen
- "cantidad": solo el número (sin unidad)
- "material_id": el id del material coincidente o null
- "confianza": "alta" si estás seguro, "media" si es probable, "baja" si es suposición

Respondé ÚNICAMENTE con JSON válido, sin texto extra, sin bloques de código:
{
  "cliente": {
    "nombre": null,
    "direccion": null,
    "localidad": null,
    "provincia": null,
    "telefono": null,
    "dni": null,
    "cuit": null
  },
  "materiales": []
}`
    })

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content }]
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    try {
      return NextResponse.json(JSON.parse(clean))
    } catch {
      return NextResponse.json({ error: 'No se pudo interpretar la respuesta', raw }, { status: 422 })
    }

  } catch (err: any) {
    console.error('parse-pedido error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
