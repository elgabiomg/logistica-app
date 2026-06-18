import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — only created in the browser, never during SSR/build
let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars not set')
  _client = createClient(url, key)
  return _client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getClient() as any)[prop]
  }
})

export type EstadoPedido = 'pendiente' | 'preparacion' | 'urgente' | 'entregado' | 'atrasado' | 'cancelado'

export interface Proveedor {
  id: string; nombre: string; telefono?: string; direccion?: string
  email?: string; notas?: string; activo: boolean; created_at: string
  descuento_contado?: number; descuento_transferencia?: number; descuento_tarjeta?: number
}
export interface Material {
  id: string; nombre: string; unidad: string; precio_ref?: number
  proveedor_id?: string; proveedores?: Proveedor; notas?: string; activo: boolean
  codigo?: string; rubro?: string; stock?: number; costo?: number; ext_id?: number; recargo?: number
}
export interface PedidoItem {
  id: string; pedido_id: string; material_id: string; cantidad: number
  precio_unitario?: number; notas?: string
  materiales?: Material & { proveedores?: Proveedor }
}
export interface Pedido {
  id: string; codigo: string; cliente: string; direccion: string; zona: string
  estado: EstadoPedido; fecha_entrega: string; hora_entrega: string
  observaciones?: string; atrasado: boolean; created_at: string; updated_at: string
  pedido_items?: PedidoItem[]
}
export interface ItemListaCompras {
  material_id: string; material: string; unidad: string; precio_ref: number
  proveedor_id: string; proveedor: string; proveedor_tel: string; proveedor_dir: string
  cantidad_total: number; costo_estimado: number
}
export interface ItemHojaRuta {
  id: string; codigo: string; cliente: string; direccion: string; zona: string
  estado: EstadoPedido; fecha_entrega: string; hora_entrega: string
  observaciones?: string; atrasado: boolean
  items: Array<{ material: string; cantidad: number; unidad: string; proveedor: string }>
}

export const getPedidos = async () => {
  const { data, error } = await getClient()
    .from('pedidos')
    .select('*, pedido_items(*, materiales(*, proveedores(*)))')
    .order('fecha_entrega').order('hora_entrega')
  if (error) throw error
  return data as Pedido[]
}

export const createPedido = async (pedido: {
  cliente: string; direccion: string; zona: string
  fecha_entrega: string; hora_entrega: string; observaciones?: string
  items: Array<{ material_id: string; cantidad: number; precio_unitario?: number }>
}) => {
  const c = getClient()
  const { count } = await c.from('pedidos').select('*', { count: 'exact', head: true })
  const codigo = `PED-${String((count || 0) + 1).padStart(3, '0')}`
  // Campos vacíos → null (permite guardar pedidos incompletos / borradores)
  const { data: nuevo, error: e1 } = await c
    .from('pedidos').insert({
      cliente: pedido.cliente || 'Sin nombre',
      direccion: pedido.direccion || null,
      zona: pedido.zona || null,
      fecha_entrega: pedido.fecha_entrega || null,
      hora_entrega: pedido.hora_entrega || null,
      observaciones: pedido.observaciones || null,
      codigo
    })
    .select().single()
  if (e1) throw e1
  // Insertar solo los ítems válidos (puede no haber ninguno)
  if (pedido.items.length) {
    const { error: e2 } = await c.from('pedido_items')
      .insert(pedido.items.map((i) => ({ ...i, pedido_id: nuevo.id })))
    if (e2) throw e2
  }
  return nuevo
}

export const updateEstadoPedido = async (id: string, estado: EstadoPedido) => {
  const { data, error } = await getClient().from('pedidos')
    .update({ estado, atrasado: estado === 'atrasado' }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export const deletePedido = async (id: string) => {
  const { error } = await getClient().from('pedidos').delete().eq('id', id)
  if (error) throw error
}

export const updatePedido = async (id: string, updates: {
  cliente?: string; direccion?: string|null; zona?: string|null
  fecha_entrega?: string|null; hora_entrega?: string|null
  observaciones?: string|null; estado?: EstadoPedido
}) => {
  const patch: any = { ...updates }
  // normalizar vacíos a null para columnas opcionales
  for (const k of ['direccion','zona','fecha_entrega','hora_entrega','observaciones'] as const) {
    if (k in patch && (patch[k] === '' || patch[k] === undefined)) patch[k] = null
  }
  if (patch.estado) patch.atrasado = patch.estado === 'atrasado'
  const { data, error } = await getClient().from('pedidos').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export const getMateriales = async () => {
  const { data, error } = await getClient()
    .from('materiales').select('*, proveedores(*)').eq('activo', true).order('nombre')
  if (error) throw error
  return data as (Material & { proveedores: Proveedor })[]
}

export const createMaterial = async (m: Partial<Material>) => {
  const { data, error } = await getClient().from('materiales').insert(m).select().single()
  if (error) throw error
  return data
}

export const updateMaterial = async (id: string, updates: Partial<Material>) => {
  const { data, error } = await getClient().from('materiales').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export const deleteMaterial = async (id: string) => {
  const { error } = await getClient().from('materiales').update({ activo: false }).eq('id', id)
  if (error) throw error
}

// Importación masiva (upsert) — para actualizar desde Excel/CSV
export const bulkUpsertClientes = async (rows: Partial<Cliente>[]) => {
  // sin ext_id: insert; con ext_id: upsert por ext_id
  const c = getClient()
  let ok = 0
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200)
    const { error } = await c.from('clientes').upsert(lote as any, { onConflict: 'ext_id', ignoreDuplicates: false })
    if (error) {
      // fallback: insertar sin upsert
      const { error: e2 } = await c.from('clientes').insert(lote as any)
      if (e2) throw e2
    }
    ok += lote.length
  }
  return ok
}

export const bulkUpsertMateriales = async (rows: Partial<Material>[]) => {
  const c = getClient()
  let ok = 0
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200)
    const { error } = await c.from('materiales').upsert(lote as any, { onConflict: 'nombre', ignoreDuplicates: false })
    if (error) throw error
    ok += lote.length
  }
  return ok
}

export const getProveedores = async () => {
  const { data, error } = await getClient()
    .from('proveedores').select('*, materiales(*)').eq('activo', true).order('nombre')
  if (error) throw error
  return data
}

export const createProveedor = async (p: Partial<Proveedor>) => {
  const { data, error } = await getClient().from('proveedores').insert(p).select().single()
  if (error) throw error
  return data
}

export const updateProveedor = async (id: string, updates: Partial<Proveedor>) => {
  const { data, error } = await getClient().from('proveedores').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export const deleteProveedor = async (id: string) => {
  const { error } = await getClient().from('proveedores').update({ activo: false }).eq('id', id)
  if (error) throw error
}

// ─── TIPOS: listas de precios ─────────────────────────────────────────────────
export interface ListaPreciosItem {
  id: string; lista_id: string; material_id?: string
  descripcion_original: string; precio: number; unidad?: string
  materiales?: Material
}
export interface ListaPrecios {
  id: string; proveedor_id: string; nombre: string; activa: boolean; created_at: string
  lista_precios_items?: ListaPreciosItem[]
}

export const getListaPrecios = async (proveedorId: string): Promise<ListaPrecios | null> => {
  const { data, error } = await getClient()
    .from('listas_precios')
    .select('*, lista_precios_items(*, materiales(*))')
    .eq('proveedor_id', proveedorId)
    .eq('activa', true)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0] as ListaPrecios) ?? null
}

// Normaliza una descripción para comparar productos entre cargas de forma robusta.
// Ignora mayúsculas, acentos, espacios, puntuación y el sufijo " (+IVA xx%)".
// Así "Cemento Loma Negra X 25kg" y "Cemento Loma Negra x 25 Kg" coinciden.
const RE_ACENTOS = /[̀-ͯ]/g
const normalizarDesc = (s: string): string =>
  s.toLowerCase()
    .normalize('NFD').replace(RE_ACENTOS, '')            // quitar acentos
    .replace(/\(\+?iva[^)]*\)/gi, '')                    // quitar "(+IVA xx%)"
    .replace(/[^a-z0-9]/g, '')                           // dejar solo letras y números

export const saveListaPrecios = async (
  proveedorId: string,
  nombre: string,
  items: Array<{ material_id?: string | null; descripcion_original: string; precio: number; unidad?: string }>
): Promise<ListaPrecios> => {
  const c = getClient()

  // ¿Ya existe una lista activa para este proveedor?
  const existente = await getListaPrecios(proveedorId)

  if (existente) {
    // ── MODO ACTUALIZACIÓN: hacer match por producto, actualizar solo precios ──
    const existentes = existente.lista_precios_items || []
    const porDesc = new Map(existentes.map(it => [normalizarDesc(it.descripcion_original), it]))

    const nuevos: typeof items = []

    for (const item of items) {
      const key = normalizarDesc(item.descripcion_original)
      const match = porDesc.get(key)
      if (match) {
        // Producto existente → actualizar precio (y descripción por si cambió el IVA),
        // preservando el enlace a material que el usuario ya configuró
        const materialFinal = match.material_id || item.material_id || null
        await c.from('lista_precios_items')
          .update({
            precio: item.precio,
            descripcion_original: item.descripcion_original,
            material_id: materialFinal,
            unidad: item.unidad ?? match.unidad
          })
          .eq('id', match.id)
        // Actualizar precio_ref del material enlazado
        if (materialFinal) {
          await c.from('materiales').update({ precio_ref: item.precio }).eq('id', materialFinal)
        }
      } else {
        nuevos.push(item)
      }
    }

    // Insertar solo los productos genuinamente nuevos
    if (nuevos.length) {
      await c.from('lista_precios_items')
        .insert(nuevos.map(i => ({
          material_id: i.material_id || null,
          descripcion_original: i.descripcion_original,
          precio: i.precio,
          unidad: i.unidad,
          lista_id: existente.id
        })))
      for (const i of nuevos) {
        if (i.material_id) {
          await c.from('materiales').update({ precio_ref: i.precio }).eq('id', i.material_id)
        }
      }
    }

    // Actualizar fecha/nombre de la lista
    await c.from('listas_precios').update({ nombre }).eq('id', existente.id)
    return existente
  }

  // ── PRIMERA CARGA: crear la lista desde cero ──
  const { data: lista, error: e1 } = await c.from('listas_precios')
    .insert({ proveedor_id: proveedorId, nombre }).select().single()
  if (e1) throw e1
  if (items.length) {
    const { error: e2 } = await c.from('lista_precios_items')
      .insert(items.map(i => ({ ...i, material_id: i.material_id || null, lista_id: lista.id })))
    if (e2) throw e2
  }
  for (const item of items) {
    if (item.material_id) {
      await c.from('materiales').update({ precio_ref: item.precio }).eq('id', item.material_id)
    }
  }
  return lista as ListaPrecios
}

export const getPreciosActivos = async (): Promise<Array<{
  material_id: string; precio: number; proveedor_id: string
}>> => {
  const { data, error } = await getClient()
    .from('lista_precios_items')
    .select('material_id, precio, listas_precios!inner(proveedor_id, activa)')
    .eq('listas_precios.activa', true)
    .not('material_id', 'is', null)
  if (error) return []
  return (data || []).map((d: any) => ({
    material_id: d.material_id,
    precio: d.precio,
    proveedor_id: d.listas_precios?.proveedor_id
  }))
}

export const getListaCompras = async () => {
  const { data, error } = await getClient().from('vista_lista_compras').select('*')
  if (error) throw error
  return data as ItemListaCompras[]
}

export const getHojasRuta = async (zona?: string) => {
  let q = getClient().from('vista_hoja_ruta').select('*')
  if (zona) q = q.eq('zona', zona)
  const { data, error } = await q
  if (error) throw error
  return data as ItemHojaRuta[]
}

export const getHistorialPedido = async (pedidoId: string) => {
  const { data, error } = await getClient().from('pedido_historial')
    .select('*').eq('pedido_id', pedidoId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const marcarAtrasados = async () => {
  const { error } = await getClient().rpc('marcar_pedidos_atrasados')
  if (error) throw error
}

export const subscribeToEstados = (callback: (pedido: Pedido) => void) => {
  return getClient().channel('pedidos-realtime')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' },
      (payload) => callback(payload.new as Pedido))
    .subscribe()
}

// ═══════════════════════════════════════════════════════════════════════════
//  ERP: empresa, clientes, vendedores, comprobantes, caja, cuenta corriente
// ═══════════════════════════════════════════════════════════════════════════

export interface EmpresaConfig {
  id: number; nombre?: string; direccion?: string; localidad?: string; provincia?: string; cp?: string
  cuit?: string; iibb?: string; condicion_iva?: string; inicio_actividad?: string
  telefono?: string; email?: string; logo_url?: string; punto_venta?: number; pie_comprobante?: string
  recargo_general?: number; descuento_general?: number
  descuento_contado_nombre?: string; descuento_contado_pct?: number
}
export interface Cliente {
  id: string; nombre: string; direccion?: string; localidad?: string; provincia?: string; cp?: string
  cuit?: string; dni?: string; condicion_iva?: string; telefono?: string; email?: string; notas?: string
  activo: boolean; created_at: string
}
export interface Vendedor { id: string; nombre: string; activo: boolean }
export type TipoComprobante = 'presupuesto' | 'remito' | 'recibo' | 'factura_x' | 'nota_credito'
export interface ComprobanteItem {
  id?: string; comprobante_id?: string; material_id?: string | null
  codigo?: string; detalle: string; cantidad: number; precio_unitario: number; importe: number
  cantidad_entregada?: number
}
export interface Comprobante {
  id: string; tipo: TipoComprobante; punto_venta: number; numero: number
  cliente_id?: string | null; cliente_nombre?: string; vendedor?: string
  fecha: string; condicion_pago: string
  subtotal: number; recargo: number; descuento: number; percepciones: number; total: number
  observaciones?: string; estado: string; pedido_id?: string | null; created_at: string
  creado_por?: string; descuento_pct?: number
  comprobante_padre_id?: string | null; entrega_estado?: string | null; destino_pendiente?: string | null
  clientes?: Cliente; comprobante_items?: ComprobanteItem[]
}

// ── Empresa ──
export const getEmpresa = async (): Promise<EmpresaConfig> => {
  const { data, error } = await getClient().from('empresa_config').select('*').eq('id', 1).single()
  if (error) throw error
  return data as EmpresaConfig
}
export const updateEmpresa = async (updates: Partial<EmpresaConfig>) => {
  const { data, error } = await getClient().from('empresa_config').update(updates).eq('id', 1).select().single()
  if (error) throw error
  return data
}

// ── Vendedores / Operadores ──
export const getVendedores = async (): Promise<Vendedor[]> => {
  const { data, error } = await getClient().from('vendedores').select('*').eq('activo', true).order('nombre')
  if (error) throw error
  return (data || []) as Vendedor[]
}
export const crearVendedor = async (nombre: string) => {
  const { data, error } = await getClient().from('vendedores').insert({ nombre }).select().single()
  if (error) throw error
  return data as Vendedor
}
export const eliminarVendedor = async (id: string) => {
  const { error } = await getClient().from('vendedores').update({ activo: false }).eq('id', id)
  if (error) throw error
}

// ── Registro de actividad (auditoría: quién hizo qué) ──
export interface Actividad {
  id: string; created_at: string; operador?: string; accion?: string; entidad?: string; entidad_id?: string; detalle?: string
}
export const registrarActividad = async (operador: string, accion: string, entidad: string, detalle: string, entidad_id?: string) => {
  try { await getClient().from('actividad').insert({ operador, accion, entidad, detalle, entidad_id: entidad_id || null }) } catch {/* no bloquear la operación principal */}
}
export const getActividad = async (limit = 300): Promise<Actividad[]> => {
  const { data, error } = await getClient().from('actividad').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []) as Actividad[]
}

// ── Clientes ──
export const getClientes = async (): Promise<Cliente[]> => {
  const { data, error } = await getClient().from('clientes').select('*').eq('activo', true).order('nombre')
  if (error) throw error
  return (data || []) as Cliente[]
}
export const createCliente = async (c: Partial<Cliente>) => {
  const { data, error } = await getClient().from('clientes').insert(c).select().single()
  if (error) throw error
  return data as Cliente
}
export const updateCliente = async (id: string, updates: Partial<Cliente>) => {
  const { data, error } = await getClient().from('clientes').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data as Cliente
}
export const deleteCliente = async (id: string) => {
  const { error } = await getClient().from('clientes').update({ activo: false }).eq('id', id)
  if (error) throw error
}
export const registrarCCMov = async (clienteId: string, tipo: 'debe' | 'haber', monto: number, concepto: string, comprobanteId?: string) => {
  const { error } = await getClient().from('cc_movimientos').insert({ cliente_id: clienteId, tipo, monto, concepto, comprobante_id: comprobanteId || null })
  if (error) throw error
}
export interface CCMov { id: string; cliente_id?: string; tipo: 'debe'|'haber'; monto: number; concepto?: string; comprobante_id?: string|null; fecha: string; created_at: string }
export const getCCMovimientos = async (clienteId: string): Promise<CCMov[]> => {
  const { data, error } = await getClient().from('cc_movimientos').select('*').eq('cliente_id', clienteId)
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as CCMov[]
}
export const getComprobantesCliente = async (clienteId: string): Promise<Comprobante[]> => {
  const { data, error } = await getClient().from('comprobantes').select('*').eq('cliente_id', clienteId)
    .order('fecha', { ascending: false }).limit(200)
  if (error) throw error
  return (data || []) as Comprobante[]
}
// Saldos de cuenta corriente por cliente (debe - haber)
export const getSaldosCC = async (): Promise<Record<string, number>> => {
  const { data, error } = await getClient().from('cc_movimientos').select('cliente_id,tipo,monto')
  if (error) return {}
  const map: Record<string, number> = {}
  for (const m of (data || []) as any[]) {
    if (!m.cliente_id) continue
    map[m.cliente_id] = (map[m.cliente_id] || 0) + (m.tipo === 'debe' ? Number(m.monto) : -Number(m.monto))
  }
  return map
}
export const getSaldoCliente = async (clienteId: string): Promise<number> => {
  const { data, error } = await getClient().from('cc_movimientos').select('tipo, monto').eq('cliente_id', clienteId)
  if (error) return 0
  return (data || []).reduce((s: number, m: any) => s + (m.tipo === 'debe' ? Number(m.monto) : -Number(m.monto)), 0)
}

// ── Comprobantes ──
export const getComprobantes = async (tipo?: TipoComprobante, limit = 300): Promise<Comprobante[]> => {
  // Listado liviano: sin traer las líneas (se cargan al abrir el detalle)
  let q = getClient().from('comprobantes').select('*, clientes(nombre,cuit)')
    .order('fecha', { ascending: false }).order('numero', { ascending: false }).limit(limit)
  if (tipo) q = q.eq('tipo', tipo)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as Comprobante[]
}
// Búsqueda de comprobantes por número, fecha (YYYY-MM-DD o DD/MM/YYYY) o nombre de cliente
export const buscarComprobantes = async (q: string): Promise<Comprobante[]> => {
  const c = getClient(); const term = q.trim()
  if (!term) return []
  const sel = '*, clientes(nombre,cuit)'
  let iso: string | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(term)) iso = term
  else { const m = term.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) iso = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` }
  if (iso) {
    const { data } = await c.from('comprobantes').select(sel).eq('fecha', iso).order('numero', { ascending: false }).limit(200)
    return (data || []) as Comprobante[]
  }
  if (/^\d+$/.test(term)) {
    const { data } = await c.from('comprobantes').select(sel).eq('numero', parseInt(term)).order('fecha', { ascending: false }).limit(200)
    return (data || []) as Comprobante[]
  }
  const res: Record<string, Comprobante> = {}
  const { data: byName } = await c.from('comprobantes').select(sel).ilike('cliente_nombre', `%${term}%`).order('fecha', { ascending: false }).limit(100)
  ;(byName || []).forEach((x: any) => res[x.id] = x)
  const { data: cliMatch } = await c.from('clientes').select('id').ilike('nombre', `%${term}%`).limit(60)
  const ids = (cliMatch || []).map((x: any) => x.id)
  if (ids.length) {
    const { data: byCli } = await c.from('comprobantes').select(sel).in('cliente_id', ids).order('fecha', { ascending: false }).limit(100)
    ;(byCli || []).forEach((x: any) => res[x.id] = x)
  }
  return Object.values(res).sort((a: any, b: any) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 200)
}
export const getComprobante = async (id: string): Promise<Comprobante> => {
  const { data, error } = await getClient().from('comprobantes')
    .select('*, clientes(*), comprobante_items(*)').eq('id', id).single()
  if (error) throw error
  return data as Comprobante
}
export const proximoNumero = async (tipo: TipoComprobante): Promise<number> => {
  const { data } = await getClient().from('comprobantes').select('numero').eq('tipo', tipo)
    .order('numero', { ascending: false }).limit(1)
  return ((data?.[0]?.numero) || 0) + 1
}
export const createComprobante = async (
  comp: Omit<Comprobante, 'id' | 'created_at' | 'numero' | 'clientes' | 'comprobante_items'> & { numero?: number },
  items: ComprobanteItem[]
): Promise<Comprobante> => {
  const c = getClient()
  const numero = comp.numero ?? await proximoNumero(comp.tipo)
  const { data: cab, error: e1 } = await c.from('comprobantes')
    .insert({ ...comp, numero }).select().single()
  if (e1) throw e1
  if (items.length) {
    const { error: e2 } = await c.from('comprobante_items')
      .insert(items.map(i => ({ ...i, comprobante_id: cab.id })))
    if (e2) throw e2
  }
  return cab as Comprobante
}
export const deleteComprobante = async (id: string) => {
  const { error } = await getClient().from('comprobantes').delete().eq('id', id)
  if (error) throw error
}

// ── Remitos derivados de una factura (entregas parciales + acopio) ──
export interface RemitoLinea {
  item_id?: string; material_id?: string | null; codigo?: string; detalle: string; precio_unitario: number; cantidad: number
}
// Remitos asociados a una factura
export const getRemitosDeFactura = async (facturaId: string): Promise<Comprobante[]> => {
  const { data } = await getClient().from('comprobantes')
    .select('*, comprobante_items(*)').eq('comprobante_padre_id', facturaId).order('created_at', { ascending: true })
  return (data || []) as Comprobante[]
}
// Emite un remito con la totalidad o parte de los artículos de una factura.
// Descuenta del stock (si hay), actualiza lo entregado en la factura y marca el destino del resto.
export const emitirRemito = async (
  factura: Comprobante,
  lineas: RemitoLinea[],
  destino: 'acopio' | 'pendiente_entrega',
  operador?: string
): Promise<Comprobante> => {
  const c = getClient()
  const entregar = lineas.filter(l => l.cantidad > 0)
  if (!entregar.length) throw new Error('No hay artículos para entregar')
  const items: ComprobanteItem[] = entregar.map(l => ({
    material_id: l.material_id || null, codigo: l.codigo, detalle: l.detalle,
    cantidad: l.cantidad, precio_unitario: l.precio_unitario, importe: Math.round(l.cantidad * l.precio_unitario * 100) / 100
  }))
  const subtotal = Math.round(items.reduce((s, i) => s + i.importe, 0) * 100) / 100
  const remito = await createComprobante({
    tipo: 'remito', punto_venta: factura.punto_venta,
    cliente_id: factura.cliente_id || null, cliente_nombre: factura.cliente_nombre,
    vendedor: operador || factura.vendedor, fecha: new Date().toISOString().slice(0, 10),
    condicion_pago: factura.condicion_pago, subtotal, recargo: 0, descuento: 0, percepciones: 0, total: subtotal,
    observaciones: `Remito de Factura X N° ${String(factura.numero).padStart(8, '0')}`,
    estado: 'emitido', pedido_id: null, creado_por: operador, comprobante_padre_id: factura.id
  } as any, items)
  // Actualizar lo entregado en la factura y descontar stock
  for (const l of entregar) {
    if (l.item_id) {
      const { data: it } = await c.from('comprobante_items').select('cantidad_entregada').eq('id', l.item_id).single()
      const nueva = Number(it?.cantidad_entregada || 0) + l.cantidad
      await c.from('comprobante_items').update({ cantidad_entregada: nueva }).eq('id', l.item_id)
    }
    if (l.material_id) {
      const { data: m } = await c.from('materiales').select('stock').eq('id', l.material_id).single()
      if (m && m.stock != null) await c.from('materiales').update({ stock: Number(m.stock) - l.cantidad }).eq('id', l.material_id)
    }
  }
  // Recalcular estado de entrega de la factura
  const { data: itemsFac } = await c.from('comprobante_items').select('cantidad,cantidad_entregada').eq('comprobante_id', factura.id)
  const completo = (itemsFac || []).every((i: any) => Number(i.cantidad_entregada || 0) >= Number(i.cantidad))
  await c.from('comprobantes').update({ entrega_estado: completo ? 'completo' : 'parcial', destino_pendiente: completo ? null : destino }).eq('id', factura.id)
  return remito
}

// ── Resumen para el Panel General ──
export const getResumenGestion = async () => {
  const c = getClient()
  const hoy = new Date()
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  try {
    const [compCount, ventasRes, cajaRes] = await Promise.all([
      c.from('comprobantes').select('*', { count: 'exact', head: true }),
      c.from('comprobantes').select('total,fecha').gte('fecha', desde),
      c.from('caja_movimientos').select('tipo,monto'),
    ])
    const vent = ventasRes.data || []
    const ventasMes = vent.reduce((s: number, r: any) => s + Number(r.total || 0), 0)
    const caja = (cajaRes.data || []).reduce((s: number, r: any) => s + (r.tipo === 'ingreso' ? 1 : -1) * Number(r.monto || 0), 0)
    return { comprobantesTotal: compCount.count || 0, ventasMes, cantMes: vent.length, cajaSaldo: caja }
  } catch {
    return { comprobantesTotal: 0, ventasMes: 0, cantMes: 0, cajaSaldo: 0 }
  }
}

// ── Caja / Flujo de caja ──
export interface CajaMov {
  id: string; tipo: 'ingreso' | 'egreso'; concepto: string; monto: number; medio_pago: string
  categoria?: string | null; creado_por?: string
  cliente_id?: string | null; comprobante_id?: string | null; fecha: string; created_at: string
}
// Categorías por defecto (unificado del software de flujo de caja)
export const CATEGORIAS_INGRESO = ['Ventas contado', 'Ventas a crédito', 'Cobros pendientes', 'Otros ingresos']
export const CATEGORIAS_EGRESO = ['Compra de materiales', 'Sueldos', 'Servicios y alquileres', 'Flete y logística', 'Gastos varios']

export const getCaja = async (desde?: string): Promise<CajaMov[]> => {
  let q = getClient().from('caja_movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (desde) q = q.gte('fecha', desde)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as CajaMov[]
}
export const createCajaMov = async (m: Partial<CajaMov>) => {
  const { data, error } = await getClient().from('caja_movimientos').insert(m).select().single()
  if (error) throw error
  return data
}
export const updateCajaMov = async (id: string, updates: Partial<CajaMov>) => {
  const { data, error } = await getClient().from('caja_movimientos').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export const deleteCajaMov = async (id: string) => {
  const { error } = await getClient().from('caja_movimientos').delete().eq('id', id)
  if (error) throw error
}
