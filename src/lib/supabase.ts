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

export type EstadoPedido = 'pendiente' | 'preparacion' | 'urgente' | 'entregado' | 'atrasado'

export interface Proveedor {
  id: string; nombre: string; telefono?: string; direccion?: string
  email?: string; notas?: string; activo: boolean; created_at: string
}
export interface Material {
  id: string; nombre: string; unidad: string; precio_ref?: number
  proveedor_id?: string; proveedores?: Proveedor; notas?: string; activo: boolean
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
  const { data: nuevo, error: e1 } = await c
    .from('pedidos').insert({ cliente: pedido.cliente, direccion: pedido.direccion,
      zona: pedido.zona, fecha_entrega: pedido.fecha_entrega,
      hora_entrega: pedido.hora_entrega, observaciones: pedido.observaciones, codigo })
    .select().single()
  if (e1) throw e1
  const { error: e2 } = await c.from('pedido_items')
    .insert(pedido.items.map((i) => ({ ...i, pedido_id: nuevo.id })))
  if (e2) throw e2
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
