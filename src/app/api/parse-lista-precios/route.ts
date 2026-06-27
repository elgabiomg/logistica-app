import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'

// Páginas de PDF procesadas por request (chunk pequeño = entra en el límite de 60s de Vercel)
const PAGES_PER_CHUNK = 2

// Extrae un subconjunto de páginas de un PDF como un nuevo PDF base64
async function extraerPaginas(bytes: ArrayBuffer, desde: number, cantidad: number) {
  const src = await PDFDocument.load(bytes)
  const total = src.getPageCount()
  const fin = Math.min(desde + cantidad, total)
  const nuevo = await PDFDocument.create()
  const indices: number[] = []
  for (let i = desde; i < fin; i++) indices.push(i)
  const paginas = await nuevo.copyPages(src, indices)
  paginas.forEach(p => nuevo.addPage(p))
  const out = await nuevo.save()
  return { base64: Buffer.from(out).toString('base64'), total, fin }
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const anthropicPdf = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' }
})

export const runtime = 'nodejs'
export const maxDuration = 60


// Formato CSV compacto: ~20 tokens/fila vs ~100 tokens/fila en JSON → cabe 4x más ítems
const PROMPT_TEMPLATE = (matsStr: string, continueAfter?: string) => `Analizá este archivo. Es una lista de precios de un proveedor de materiales de construcción.

${continueAfter
  ? `IMPORTANTE: Ya extraje los primeros ítems hasta "${continueAfter}". Extraé ÚNICAMENTE los productos que vienen DESPUÉS de ese ítem. No repitas los anteriores.`
  : 'Extraé TODOS los productos con precio.'}

PRIMERO, en la primera línea indicá si los precios de la lista incluyen IVA o no:
#IVA:si   (si los precios ya incluyen IVA / están con IVA incorporado)
#IVA:no   (si los precios son sin IVA / precio neto / base imponible)
#IVA:ambos (si la lista muestra ambos; en ese caso usá el precio CON IVA en los datos)

LUEGO, una fila por producto en formato CSV separado por |, sin encabezado, sin texto extra:
descripcion_del_producto|precio_numerico|unidad_o_vacio

Reglas para los precios:
- Solo el número, sin $ (ej: 5122.50)
- Si hay precio con y sin IVA, poné el precio CON IVA
- Ignorá títulos de sección, subtotales y encabezados

MATERIALES DISPONIBLES (referencia):
[${matsStr}]`

// Mapear material_id desde descripción usando similitud básica
function matchMaterial(desc: string, mats: Array<{ id: string; nombre: string }>) {
  const d = desc.toLowerCase()
  let best = { id: null as string | null, score: 0 }
  for (const m of mats) {
    const words = m.nombre.toLowerCase().split(/\s+/)
    const matches = words.filter(w => w.length > 3 && d.includes(w)).length
    const score = matches / words.length
    if (score > 0.5 && score > best.score) best = { id: m.id, score }
  }
  return best.id
}

/** Parsea precios en formato argentino (5.122,50) o internacional (5,122.50) */
function parseArgPrice(raw: string): number {
  const s = raw.replace(/[$\s ]/g, '').trim()
  if (!s) return NaN

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastComma > lastDot) {
    // Formato AR: 5.122,50 → separador miles=punto, decimal=coma
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  } else if (lastDot > lastComma) {
    // Formato US: 5,122.50 → separador miles=coma, decimal=punto
    return parseFloat(s.replace(/,/g, ''))
  } else if (lastComma !== -1) {
    // Solo coma: tratar como decimal → 5122,50 → 5122.50
    return parseFloat(s.replace(',', '.'))
  } else {
    // Solo puntos o ninguno
    // Si hay un solo punto y los dígitos después son exactamente 3, es miles: 5.122 → 5122
    const parts = s.split('.')
    if (parts.length === 2 && parts[1].length === 3) return parseFloat(parts.join(''))
    return parseFloat(s)
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const archivo = formData.get('archivo') as File | null
    const materialesJson = formData.get('materiales') as string | null

    if (!archivo) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const mats: Array<{ id: string; nombre: string; unidad: string }> =
      materialesJson ? JSON.parse(materialesJson) : []
    const matsStr = mats.map(m => `${m.nombre}|${m.id}`).join(', ')
    const continueAfter = (formData.get('continueAfter') as string | null) || undefined
    const desdePagina = parseInt((formData.get('desdePagina') as string | null) || '0', 10)

    const ext = archivo.name.split('.').pop()?.toLowerCase() ?? ''
    const bytes = await archivo.arrayBuffer()

    let content: Anthropic.MessageParam['content'] = []
    let pagina: { desde: number; hasta: number; total: number; hayMas: boolean } | null = null

    if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
      const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' })
      const lines: string[] = []
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name]
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
        if (csv.trim()) lines.push(`=== ${name} ===\n${csv}`)
      })
      content = [{ type: 'text', text: `${PROMPT_TEMPLATE(matsStr, continueAfter)}\n\nCONTENIDO:\n${lines.join('\n\n')}` }]

    } else if (ext === 'pdf') {
      // PDF → siempre visión nativa, de a pocas páginas para no exceder el límite de
      // tiempo. El frontend itera por páginas automáticamente. (La extracción de texto
      // no es confiable: muchos PDFs usan fuentes con codificación propia.)
      const { base64, total, fin } = await extraerPaginas(bytes, desdePagina, PAGES_PER_CHUNK)
      pagina = { desde: desdePagina, hasta: fin, total, hayMas: fin < total }
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
        { type: 'text', text: PROMPT_TEMPLATE(matsStr) }
      ]

    } else if (['txt', 'text'].includes(ext)) {
      const text = new TextDecoder().decode(bytes)
      content = [{ type: 'text', text: `${PROMPT_TEMPLATE(matsStr, continueAfter)}\n\nCONTENIDO:\n${text.substring(0, 60000)}` }]

    } else {
      const base64 = Buffer.from(bytes).toString('base64')
      const mediaType = (archivo.type || 'image/jpeg') as
        'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      content = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: PROMPT_TEMPLATE(matsStr, continueAfter) }
      ]
    }

    // Usar cliente con beta de PDF solo si enviamos el documento nativo (no texto extraído)
    const esPdfNativo = Array.isArray(content) && content.some((c: any) => c.type === 'document')
    const client = esPdfNativo ? anthropicPdf : anthropic

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{ role: 'user', content }]
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    // truncado por tokens, O hay más páginas por procesar
    const truncated = response.stop_reason === 'max_tokens' || (pagina?.hayMas ?? false)

    // Parsear flag IVA y CSV: descripcion|precio|unidad
    const items: any[] = []
    let incluyeIva: boolean | null = null
    const lines = raw.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Detectar flag IVA
      if (/^#IVA:/i.test(trimmed)) {
        const val = trimmed.replace(/^#IVA:/i, '').trim().toLowerCase()
        incluyeIva = val === 'si' || val === 'sí' || val === 'ambos' ? true : false
        continue
      }

      if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue
      if (/^(descripcion|producto|artículo)/i.test(trimmed)) continue

      const parts = trimmed.split('|')
      if (parts.length < 2) continue

      const desc = parts[0].trim()
      const precio = parseArgPrice(parts[1])
      const unidad = parts[2]?.trim() || null

      if (!desc || isNaN(precio) || precio <= 0) continue

      const material_id = matchMaterial(desc, mats)
      items.push({
        descripcion_original: desc,
        precio,
        unidad,
        material_id,
        confianza: material_id ? 'media' : 'baja'
      })
    }

    // nextPage: si es un PDF paginado y hay más páginas, indicar desde dónde seguir
    const nextPage = pagina?.hayMas ? pagina.hasta : null

    if (items.length === 0) {
      // Si no hubo ítems pero quedan páginas (esta venía vacía), seguir con la próxima
      if (nextPage !== null) {
        return NextResponse.json({ items: [], truncated: true, total: 0, nextPage, pagina })
      }
      // Fallback: la respuesta no era CSV, intentar JSON
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.items) return NextResponse.json({ items: parsed.items, truncated })
        }
      } catch {}
      return NextResponse.json({
        error: `No se pudieron extraer ítems. Respuesta: ${raw.substring(0, 200)}`
      }, { status: 422 })
    }

    return NextResponse.json({ items, truncated, total: items.length, nextPage, pagina, incluyeIva })

  } catch (err: any) {
    console.error('parse-lista-precios error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
