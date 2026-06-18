'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  getClientes, getVendedores, getMateriales, getEmpresa,
  createCliente, createComprobante, getComprobante,
  createCajaMov, registrarCCMov, proximoNumero,
  registrarActividad,
  type Cliente, type Vendedor, type Material,
  type EmpresaConfig, type TipoComprobante, type ComprobanteItem,
} from '@/lib/supabase'

// ── Helpers ─────────────────────────────────────────────────────────
const getOp = (): string => { try { return localStorage.getItem('logiobra_operador') || '' } catch { return '' } }
const logAct = (accion: string, entidad: string, detalle: string, id?: string) =>
  registrarActividad(getOp() || '(sin operador)', accion, entidad, detalle, id)
const money = (n: number) => '$ ' + Math.round(Math.abs(n)).toLocaleString('es-AR')
const num = (s: string | number) => parseFloat(String(s).replace(',', '.')) || 0
const fmt = (pv: number, n: number) => `${String(pv || 1).padStart(4, '0')}-${String(n || 0).padStart(8, '0')}`

const TIPOS: Record<TipoComprobante, { label: string; letra: string; leyenda: string }> = {
  presupuesto:  { label: 'Presupuesto',     letra: 'X',  leyenda: 'Documento no válido como factura' },
  factura_x:    { label: 'Factura X',       letra: 'X',  leyenda: 'Documento no válido como factura' },
  remito:       { label: 'Remito',          letra: 'R',  leyenda: 'Documento no válido como factura' },
  recibo:       { label: 'Recibo',          letra: 'X',  leyenda: 'Documento no válido como factura' },
  nota_credito: { label: 'Nota de Crédito', letra: 'NC', leyenda: 'Documento no válido como factura' },
}

interface ItemRow { codigo: string; detalle: string; cantidad: string; precio: string }

function imprimirComp(comp: any, empresa: EmpresaConfig | null) {
  const t = TIPOS[comp.tipo as TipoComprobante]
  const cl = comp.clientes || {}
  const items: ComprobanteItem[] = comp.comprobante_items || []
  const e = empresa || {} as EmpresaConfig
  const logo = e.logo_url ? `<img src="${e.logo_url}" style="max-height:72px;max-width:120px;display:block;margin:0 auto 4px"/>` : ''
  const esRemito = comp.tipo === 'remito'
  const esPresupuesto = comp.tipo === 'presupuesto'
  const esFacturaX = comp.tipo === 'factura_x'

  const textoLegal = esPresupuesto
    ? `<p>Los precios pueden estar sujetos a modificación sin aviso previo.</p>
       <p>Los valores y bonif. extras por cantidad a tener en cuenta por compra total únicamente.</p>
       <p>Modificaciones en las cantidades pedidas puede influir en el valor del material.</p>
       <p style="font-weight:700">Vigencia del presupuesto: 24 hs corridas.</p>`
    : esFacturaX
    ? `<p>La entrega de los materiales se realiza en el plazo de 3-6 días hábiles.</p>`
    : (comp.observaciones || '').replace(/\n/g, '<br>')

  const fila = (i: ComprobanteItem) => esRemito
    ? `<tr><td class="c">${i.cantidad}</td><td>${i.codigo || ''}</td><td>${i.detalle}</td></tr>`
    : `<tr>
        <td class="c">${i.cantidad}</td>
        <td class="c">${i.codigo || ''}</td>
        <td>${i.detalle}</td>
        <td class="r">${money(i.precio_unitario)}</td>
        <td class="r">${money(i.importe)}</td>
       </tr>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${t.label} ${fmt(comp.punto_venta, comp.numero)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 16mm; }
    .lbl { color: #1c3f8f; font-weight: 700; }

    /* ── CABECERA ── */
    .hdr { display: grid; grid-template-columns: 1fr 80px 1fr; align-items: center; border-bottom: 2.5px solid #1a1a1a; padding-bottom: 10px; gap: 10px; }
    .hdr-empresa { display: flex; align-items: center; gap: 10px; }
    .hdr-empresa-txt { font-size: 15px; font-weight: 800; letter-spacing: .5px; }
    .hdr-empresa-sub { font-size: 10px; color: #444; margin-top: 3px; }
    .hdr-letra { text-align: center; }
    .hdr-letra .big { font-size: 56px; font-weight: 900; line-height: 1; }
    .hdr-letra .leyenda { font-size: 9px; color: #555; margin-top: 2px; }
    .hdr-num { text-align: right; }
    .hdr-num .num { font-size: 16px; font-weight: 800; letter-spacing: 1px; }
    .hdr-num .fecha { margin-top: 5px; font-size: 11px; }

    /* ── EMPRESA ── */
    .empresa { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; border-bottom: 1px solid #bbb; padding: 8px 0; font-size: 10.5px; line-height: 1.7; }
    .empresa .original { text-align: center; font-weight: 800; font-size: 12px; align-self: center; padding: 0 8px; border-left: 1px solid #ccc; border-right: 1px solid #ccc; }
    .empresa .derecha { text-align: right; }

    /* ── CLIENTE ── */
    .cliente { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-bottom: 1px solid #bbb; padding: 8px 0; font-size: 10.5px; line-height: 1.75; }

    /* ── TABLA ── */
    table.items { width: 100%; border-collapse: collapse; margin-top: 10px; }
    table.items thead tr { border-bottom: 2px solid #1a1a1a; }
    table.items th { padding: 5px 6px; font-size: 10.5px; font-weight: 700; color: #1a1a1a; }
    table.items td { padding: 4px 6px; font-size: 10.5px; border-bottom: 1px solid #eee; }
    table.items tbody tr:last-child td { border-bottom: none; }
    .c { text-align: center; }
    .r { text-align: right; }

    /* ── PIE ── */
    .foot { display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-top: 18px; align-items: start; }
    .legal { font-size: 10px; color: #444; line-height: 1.6; }
    .legal p { margin-bottom: 3px; }
    table.tot { border-collapse: collapse; min-width: 210px; }
    table.tot td { padding: 5px 12px; border: 1px solid #ccc; font-size: 11px; }
    table.tot tr.total td { font-weight: 800; font-size: 13px; background: #f0f0f0; border-top: 2px solid #1a1a1a; }
    .firma { margin-top: 30px; text-align: center; font-size: 10px; color: #444; }
    .firma-linea { border-top: 1px solid #1a1a1a; padding-top: 4px; display: inline-block; min-width: 200px; }
    .sistema { text-align: center; color: #999; font-size: 9px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 6px; }

    @media print {
      body { -webkit-print-color-adjust: exact; }
      .page { padding: 10mm 14mm; }
    }
  </style>
  </head><body><div class="page">

  <!-- CABECERA -->
  <div class="hdr">
    <div class="hdr-empresa">
      ${logo}
      <div>
        <div class="hdr-empresa-txt">${e.nombre || ''}</div>
        <div class="hdr-empresa-sub">${e.direccion || ''}${e.localidad ? ' — ' + e.localidad : ''}</div>
        <div class="hdr-empresa-sub">${e.telefono || ''}</div>
      </div>
    </div>
    <div class="hdr-letra">
      ${esFacturaX ? `<div class="big">${t.letra}</div><div class="leyenda">${t.leyenda}</div>` : `<div style="font-size:13px;font-weight:700;color:#555;text-align:center">${t.label}</div>`}
    </div>
    <div class="hdr-num">
      <div class="num">${fmt(comp.punto_venta, comp.numero)}</div>
      <div class="fecha"><span class="lbl">FECHA:</span> ${comp.fecha || ''}</div>
    </div>
  </div>

  <!-- DATOS EMPRESA -->
  <div class="empresa">
    <div>
      <div style="font-weight:800;font-size:12px;margin-bottom:2px">${e.nombre || ''}</div>
      ${e.direccion ? `<div>${e.direccion}</div>` : ''}
      ${e.localidad ? `<div>${e.localidad}${e.provincia ? ', ' + e.provincia : ''}</div>` : ''}
      ${e.condicion_iva ? `<div>${e.condicion_iva}</div>` : ''}
    </div>
    <div class="original">ORIGINAL</div>
    <div class="derecha">
      ${e.cuit ? `<div><span class="lbl">CUIT:</span> ${e.cuit}</div>` : ''}
      ${e.iibb ? `<div><span class="lbl">IIBB:</span> ${e.iibb}</div>` : ''}
      ${e.inicio_actividad ? `<div><span class="lbl">Inicio actividad:</span> ${e.inicio_actividad}</div>` : ''}
    </div>
  </div>

  <!-- DATOS CLIENTE -->
  <div class="cliente">
    <div>
      <div><span class="lbl">Cliente:</span> ${comp.cliente_nombre || cl.nombre || 'Consumidor Final'}</div>
      ${cl.direccion ? `<div><span class="lbl">Dirección:</span> ${cl.direccion}</div>` : ''}
      ${cl.localidad ? `<div><span class="lbl">Localidad:</span> ${cl.localidad}</div>` : ''}
      ${cl.cuit ? `<div><span class="lbl">CUIT:</span> ${cl.cuit}</div>` : ''}
      ${cl.dni ? `<div><span class="lbl">DNI:</span> ${cl.dni}</div>` : ''}
      <div style="margin-top:3px;font-weight:700">${(comp.condicion_pago || 'CONTADO').toUpperCase()}</div>
    </div>
    <div style="text-align:right">
      <div><span class="lbl">Vendedor:</span> ${comp.vendedor || ''}</div>
      <div><span class="lbl">IVA:</span> ${cl.condicion_iva || 'Consumidor Final'}</div>
      ${comp.numero ? `<div><span class="lbl">Comprobante N°:</span> ${comp.numero}</div>` : ''}
    </div>
  </div>

  <!-- TABLA ÍTEMS -->
  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:52px">Cant.</th>
        <th class="c" style="width:80px">Código</th>
        <th>Detalle</th>
        ${esRemito ? '' : '<th class="r" style="width:90px">P. Unit.</th><th class="r" style="width:100px">Importe</th>'}
      </tr>
    </thead>
    <tbody>${items.map(fila).join('')}</tbody>
  </table>

  <!-- PIE -->
  ${esRemito ? `
  <div class="foot" style="margin-top:24px">
    <div class="legal">${textoLegal}</div>
    <div class="firma"><div class="firma-linea">Recibí conforme — Firma y aclaración</div></div>
  </div>
  ` : `
  <div class="foot">
    <div class="legal">${textoLegal}</div>
    <table class="tot">
      <tr><td>Subtotal:</td><td class="r">${money(comp.subtotal)}</td></tr>
      ${Number(comp.descuento) > 0 ? `<tr><td>Descuento${comp.descuento_pct ? ' (' + comp.descuento_pct + '%)' : ''}:</td><td class="r">− ${money(comp.descuento)}</td></tr>` : ''}
      ${Number(comp.percepciones) > 0 ? `<tr><td>Percepciones:</td><td class="r">${money(comp.percepciones)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL $</td><td class="r">${money(comp.total)}</td></tr>
    </table>
  </div>
  `}

  </div>
  <script>window.onload=function(){window.print()}<\/script>
  </body></html>`)
  w.document.close()
}

// ── Colores ──────────────────────────────────────────────────────────
const C = {
  bg: '#0F1117', surface: '#181C27', surfaceAlt: '#1E2235', border: '#2A2F45',
  accent: '#F5A623', accentDim: '#F5A62318', text: '#E8EAF0', textMuted: '#8B92A5',
  textDim: '#5A6075', green: '#4CAF50', greenDim: '#4CAF5018',
  blue: '#4A9EFF', blueDim: '#4A9EFF18', red: '#EF5350', redDim: '#EF535018',
  header: '#141824', headerBorder: '#2A2F45',
}

// ── Componentes base ─────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6,
  padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', width: '100%',
}
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

// ── Página principal ─────────────────────────────────────────────────
export default function NuevoComprobantePage() {
  const router = useRouter()

  // datos maestros
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)
  const [loading, setLoading] = useState(true)

  // cabecera
  const [tipo, setTipo] = useState<TipoComprobante>('presupuesto')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [nroPreview, setNroPreview] = useState<number | null>(null)
  const [vendedor, setVendedor] = useState('')
  const [condicion, setCondicion] = useState('CONTADO')
  const [medioPago, setMedioPago] = useState('efectivo')
  const [obs, setObs] = useState('')

  // recargo
  const recGen = empresa?.recargo_general ?? 47.04
  const [recOn, setRecOn] = useState<boolean>(() => { try { return localStorage.getItem('logiobra_recargo') === '1' } catch { return false } })

  // descuento contado
  const descNombre = empresa?.descuento_contado_nombre || 'Descuento contado'
  const descContadoPct = empresa?.descuento_contado_pct ?? 32
  const [descOn, setDescOn] = useState<boolean>(false)

  // cliente
  const [clienteId, setClienteId] = useState('')
  const [clienteLibre, setClienteLibre] = useState('')
  const [cliQuery, setCliQuery] = useState('')
  const [cliOpen, setCliOpen] = useState(false)
  const [tabCliente, setTabCliente] = useState<'datos' | 'direccion' | 'obs'>('datos')
  const [nuevoCli, setNuevoCli] = useState(false)

  // items
  const [items, setItems] = useState<ItemRow[]>([
    { codigo: '', detalle: '', cantidad: '1', precio: '' },
  ])
  const [tabItems, setTabItems] = useState<'items' | 'adicional'>('items')
  const [descPct, setDescPct] = useState('0')
  const [descMonto, setDescMonto] = useState('0')
  const [percep, setPercep] = useState('0')
  const [picker, setPicker] = useState<{ idx: number; matches: Material[] } | null>(null)
  const [pickerSel, setPickerSel] = useState<Record<string, boolean>>({})
  const detRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [focusNext, setFocusNext] = useState<number | null>(null)

  // estado
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [saved, setSaved] = useState(false)

  // cargar datos
  useEffect(() => {
    Promise.all([getClientes(), getVendedores(), getMateriales(), getEmpresa()])
      .then(([cls, vds, mats, emp]) => {
        setClientes(cls); setVendedores(vds); setMateriales(mats as Material[]); setEmpresa(emp)
        setVendedor(getOp() || vds[0]?.nombre || '')
        setObs(emp?.pie_comprobante || '')
        setDescPct(String(emp?.descuento_general ?? 0))
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  // previsualizar número
  useEffect(() => {
    proximoNumero(tipo).then(setNroPreview).catch(() => setNroPreview(null))
  }, [tipo])

  // enfocar siguiente fila tras cargar ítem
  useEffect(() => {
    if (focusNext != null) {
      detRefs.current[focusNext]?.focus()
      setFocusNext(null)
    }
  }, [focusNext, items.length])

  // cálculos
  const subtotal = items.reduce((s, it) => s + num(it.cantidad) * num(it.precio), 0)
  const descContadoMonto = descOn ? Math.round(subtotal * descContadoPct / 100 * 100) / 100 : 0
  const descTotal = Math.round((subtotal * num(descPct) / 100 + num(descMonto) + descContadoMonto) * 100) / 100
  const total = subtotal - descTotal + num(percep)

  const cliSeleccionado = clientes.find(c => c.id === clienteId)
  const clisFiltrados = clientes.filter(c => {
    const q = cliQuery.toLowerCase()
    return c.nombre.toLowerCase().includes(q) || (c.cuit || '').includes(cliQuery) || (c.dni || '').includes(cliQuery)
  }).slice(0, 30)

  // helpers items
  const setItem = (i: number, k: keyof ItemRow, v: string) =>
    setItems(a => a.map((it, j) => j === i ? { ...it, [k]: v } : it))

  const addItem = () => setItems(a => [...a, { codigo: '', detalle: '', cantidad: '1', precio: '' }])
  const delItem = (i: number) => setItems(a => a.filter((_, j) => j !== i))

  const precioCon = useCallback((m: Material, on = recOn) => {
    const base = Number(m.precio_ref || 0)
    const rec = m.recargo != null ? Number(m.recargo) : recGen
    const p = on ? base * (1 + rec / 100) : base
    return Math.round(p * 100) / 100
  }, [recOn, recGen])

  const aplicarMat = (i: number, m: Material) =>
    setItems(a => a.map((it, j) => j === i ? { ...it, codigo: m.codigo || '', detalle: m.nombre, precio: String(precioCon(m)) } : it))

  const avanzar = (i: number) => {
    setItems(a => i >= a.length - 1 ? [...a, { codigo: '', detalle: '', cantidad: '1', precio: '' }] : a)
    setFocusNext(i + 1)
  }

  const buscarItem = (i: number, raw?: string) => {
    const it = items[i] || {}
    const term = (String(raw ?? (it.detalle || it.codigo || '')).trim()).toLowerCase()
    if (!term) return
    const matches = materiales.filter(m =>
      (m.nombre || '').toLowerCase().includes(term) || (m.codigo || '').toLowerCase().includes(term)
    )
    if (matches.length === 0) return
    if (matches.length === 1) { aplicarMat(i, matches[0]); avanzar(i); return }
    setPickerSel({}); setPicker({ idx: i, matches })
  }

  const confirmarPicker = () => {
    if (!picker) return
    const elegidos = picker.matches.filter(m => pickerSel[m.id])
    if (!elegidos.length) { setPicker(null); return }
    let ultimo = picker.idx
    setItems(a => {
      const copy = [...a]
      const m0 = elegidos[0]
      copy[picker.idx] = { ...copy[picker.idx], codigo: m0.codigo || '', detalle: m0.nombre, precio: String(precioCon(m0)) }
      const extra = elegidos.slice(1).map(m => ({ codigo: m.codigo || '', detalle: m.nombre, cantidad: '1', precio: String(precioCon(m)) }))
      copy.splice(picker.idx + 1, 0, ...extra)
      ultimo = picker.idx + extra.length
      copy.push({ codigo: '', detalle: '', cantidad: '1', precio: '' })
      return copy
    })
    setPicker(null); setFocusNext(ultimo + 1)
  }

  const toggleRec = (on: boolean) => {
    setRecOn(on)
    try { localStorage.setItem('logiobra_recargo', on ? '1' : '0') } catch { }
    setItems(a => a.map(it => {
      const p = num(it.precio)
      if (!p) return it
      const factor = 1 + recGen / 100
      const newPrecio = on
        ? Math.round(p * factor * 100) / 100
        : Math.round(p / factor * 100) / 100
      return { ...it, precio: String(newPrecio) }
    }))
  }

  // guardar
  const guardar = async (imprimir: boolean) => {
    const validos = items.filter(it => it.detalle && num(it.cantidad) > 0)
    if (!validos.length) { setErrMsg('Cargá al menos un ítem'); return }
    if (condicion === 'CUENTA CORRIENTE' && (tipo === 'factura_x' || tipo === 'recibo') && !clienteId) {
      setErrMsg('Para Cuenta Corriente elegí un cliente registrado'); return
    }
    setErrMsg(''); setSaving(true)
    try {
      const cli = clientes.find(c => c.id === clienteId)
      const itemsDB: ComprobanteItem[] = validos.map(it => ({
        codigo: it.codigo || undefined, detalle: it.detalle,
        cantidad: num(it.cantidad), precio_unitario: num(it.precio),
        importe: num(it.cantidad) * num(it.precio),
        material_id: materiales.find(m => m.nombre === it.detalle)?.id || null,
      }))
      const oper = getOp()
      const comp = await createComprobante({
        tipo, punto_venta: empresa?.punto_venta || 1,
        cliente_id: clienteId || null,
        cliente_nombre: cli?.nombre || clienteLibre || 'Consumidor Final',
        vendedor: vendedor || oper, fecha, condicion_pago: condicion,
        subtotal, recargo: 0, descuento: descTotal,
        descuento_pct: num(descPct) || null, percepciones: num(percep), total,
        observaciones: obs, estado: 'emitido', pedido_id: null, creado_por: oper,
      } as any, itemsDB)
      const nombreCli = cli?.nombre || clienteLibre || 'Consumidor Final'
      logAct('Creó', TIPOS[tipo].label,
        `${TIPOS[tipo].label} N° ${fmt(empresa?.punto_venta || 1, comp.numero)} · ${nombreCli} · ${money(total)}`, comp.id)
      const cobra = (tipo === 'factura_x' || tipo === 'recibo') && total > 0
      if (cobra) {
        if (condicion === 'CUENTA CORRIENTE' && clienteId) {
          await registrarCCMov(clienteId, 'debe', total, `${TIPOS[tipo].label} N° ${fmt(empresa?.punto_venta || 1, comp.numero)}`, comp.id)
        } else {
          await createCajaMov({ tipo: 'ingreso', monto: total, concepto: `${TIPOS[tipo].label} N° ${fmt(empresa?.punto_venta || 1, comp.numero)} · ${nombreCli}`, medio_pago: medioPago, categoria: 'Ventas contado', cliente_id: clienteId || null, comprobante_id: comp.id, fecha, creado_por: oper } as any)
        }
      }
      if (imprimir) {
        const full = await getComprobante(comp.id)
        imprimirComp(full, empresa)
      }
      setSaved(true)
      setTimeout(() => router.push('/'), 1200)
    } catch (e: any) { setErrMsg(e?.message || 'Error al guardar') } finally { setSaving(false) }
  }

  // ── Render ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.textMuted, fontSize: 14 }}>Cargando...</div>
    </div>
  )

  const pvNum = empresa?.punto_venta || 1
  const nroDisplay = fmt(pvNum, nroPreview ?? 0)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── TOP BAR ── */}
      <header style={{ background: C.header, borderBottom: `1px solid ${C.headerBorder}`, padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 10px', borderRadius: 6, transition: 'background .15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = C.surfaceAlt)}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          ← Volver
        </button>
        <div style={{ width: 1, height: 24, background: C.border }} />
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 15 }}>🧾</span>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Nuevo Comprobante</span>
        <div style={{ flex: 1 }} />
        {/* Tipo selector en header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(Object.keys(TIPOS) as TipoComprobante[]).map(k => (
            <button key={k} onClick={() => setTipo(k)}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all .15s',
                background: tipo === k ? C.accent : C.surfaceAlt,
                color: tipo === k ? '#000' : C.textMuted }}>
              {TIPOS[k].label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: C.border }} />
        <button onClick={() => guardar(false)} disabled={saving || saved}
          style={{ background: C.surfaceAlt, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? '...' : '💾 Guardar'}
        </button>
        <button onClick={() => guardar(true)} disabled={saving || saved}
          style={{ background: saving || saved ? C.surfaceAlt : C.accent, color: saving || saved ? C.textMuted : '#000', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saved ? '✓ Guardado' : saving ? '...' : '🖨️ Guardar e imprimir'}
        </button>
      </header>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── SIDEBAR IZQUIERDO ── */}
        <aside style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, flexShrink: 0, overflowY: 'auto' }}>
          {/* Número de comprobante */}
          <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>COMPROBANTE</div>
            <div style={{ color: C.accent, fontSize: 22, fontWeight: 800, fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>{nroDisplay}</div>
            <div style={{ marginTop: 8, display: 'inline-block', background: C.accentDim, border: `1px solid ${C.accent}40`, borderRadius: 20, padding: '2px 10px', fontSize: 11, color: C.accent, fontWeight: 700 }}>
              {TIPOS[tipo].letra}
            </div>
          </div>

          {/* Fecha */}
          <Field label="Fecha">
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
          </Field>

          {/* Vendedor */}
          <Field label="Vendedor">
            <select value={vendedor} onChange={e => setVendedor(e.target.value)} style={selectStyle}>
              {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
              {!vendedores.length && <option>{getOp() || 'Sin vendedor'}</option>}
            </select>
          </Field>

          {/* Condición */}
          <Field label="Condición de venta">
            <select value={condicion} onChange={e => setCondicion(e.target.value)} style={selectStyle}>
              <option value="CONTADO">💵 Contado</option>
              <option value="CUENTA CORRIENTE">📒 Cuenta corriente</option>
            </select>
          </Field>

          {condicion === 'CONTADO' && (
            <Field label="Medio de pago">
              <select value={medioPago} onChange={e => setMedioPago(e.target.value)} style={selectStyle}>
                {['efectivo', 'transferencia', 'tarjeta', 'cheque'].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          )}

          {condicion === 'CUENTA CORRIENTE' && (
            <div style={{ background: C.blueDim, border: `1px solid ${C.blue}30`, borderRadius: 7, padding: '9px 10px', color: C.blue, fontSize: 11 }}>
              📒 Suma a cuenta corriente del cliente
            </div>
          )}

          {/* Recargo */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: recOn ? C.accentDim : C.surfaceAlt, border: `1px solid ${recOn ? C.accent : C.border}`, borderRadius: 7, padding: '9px 10px' }}>
            <input type="checkbox" checked={recOn} onChange={e => toggleRec(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
            <span style={{ color: recOn ? C.accent : C.textMuted, fontSize: 12, fontWeight: 700 }}>
              Recargo {String(recGen).replace('.', ',')}%
            </span>
          </label>

          {/* Descuento contado */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: descOn ? C.greenDim : C.surfaceAlt, border: `1px solid ${descOn ? C.green : C.border}`, borderRadius: 7, padding: '9px 10px' }}>
            <input type="checkbox" checked={descOn} onChange={e => setDescOn(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
            <span style={{ color: descOn ? C.green : C.textMuted, fontSize: 12, fontWeight: 700 }}>
              {descNombre} {String(descContadoPct).replace('.', ',')}%
            </span>
          </label>

          <div style={{ flex: 1 }} />

          {/* Totales en sidebar */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <TotalRow label="Subtotal" value={subtotal} />
            {(num(descPct) > 0 || num(descMonto) > 0) && <TotalRow label={`Desc. (${descPct}%)`} value={-(Math.round((subtotal * num(descPct) / 100 + num(descMonto)) * 100) / 100)} color={C.green} />}
            {descOn && <TotalRow label={`${descNombre} (${descContadoPct}%)`} value={-descContadoMonto} color={C.green} />}
            {num(percep) > 0 && <TotalRow label="Percepciones" value={num(percep)} />}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 700 }}>TOTAL</span>
                <span style={{ color: C.accent, fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>{money(total)}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── CONTENIDO PRINCIPAL ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── PANEL CLIENTE ── */}
          <section style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {/* Tabs cliente */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 20px' }}>
              {(['datos', 'direccion', 'obs'] as const).map(tab => {
                const labels = { datos: 'Cliente', direccion: 'Dirección', obs: 'Observaciones' }
                return (
                  <button key={tab} onClick={() => setTabCliente(tab)}
                    style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tabCliente === tab ? C.accent : 'transparent'}`, color: tabCliente === tab ? C.accent : C.textMuted, fontSize: 13, fontWeight: tabCliente === tab ? 700 : 400, cursor: 'pointer', transition: 'all .15s' }}>
                    {labels[tab]}
                  </button>
                )
              })}
            </div>

            {/* Contenido tabs */}
            <div style={{ padding: '16px 20px' }}>
              {tabCliente === 'datos' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                  {/* Buscador cliente */}
                  <div style={{ position: 'relative', gridColumn: '1 / 3' }}>
                    <Field label="Cliente">
                      {clienteId
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surfaceAlt, border: `1px solid ${C.accent}55`, borderRadius: 6, padding: '7px 10px' }}>
                          <span style={{ flex: 1, color: C.text, fontSize: 13, fontWeight: 600 }}>👤 {cliSeleccionado?.nombre}</span>
                          <button onClick={() => { setClienteId(''); setCliQuery('') }}
                            style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
                        </div>
                        : <div style={{ display: 'flex', gap: 6 }}>
                          <input value={cliQuery} onChange={e => { setCliQuery(e.target.value); setCliOpen(true) }}
                            onFocus={() => setCliOpen(true)}
                            placeholder="Buscar por nombre, DNI o CUIT..."
                            style={{ ...inputStyle, flex: 1 }} />
                          <button onClick={() => setNuevoCli(true)}
                            style={{ background: C.greenDim, color: C.green, border: `1px solid ${C.green}40`, borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>+ Nuevo</button>
                        </div>}
                    </Field>
                    {/* Dropdown resultados */}
                    {cliOpen && !clienteId && cliQuery.trim().length >= 2 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 2, maxHeight: 180, overflowY: 'auto', boxShadow: '0 6px 20px #0008' }}>
                        {clisFiltrados.map(c => (
                          <div key={c.id} onClick={() => { setClienteId(c.id); setCliOpen(false); setCliQuery('') }}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                            onMouseEnter={e => (e.currentTarget.style.background = C.surfaceAlt)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{c.nombre}</div>
                            <div style={{ color: C.textDim, fontSize: 11 }}>{c.condicion_iva}{c.cuit ? ` · CUIT ${c.cuit}` : ''}{c.localidad ? ` · ${c.localidad}` : ''}</div>
                          </div>
                        ))}
                        {!clisFiltrados.length && <div style={{ padding: '8px 12px', color: C.textDim, fontSize: 12 }}>Sin resultados</div>}
                      </div>
                    )}
                    {/* Nombre libre si no hay cliente */}
                    {!clienteId && (
                      <div style={{ marginTop: 6 }}>
                        <Field label="Nombre libre (sin registrar)">
                          <input value={clienteLibre} onChange={e => setClienteLibre(e.target.value)}
                            placeholder="Consumidor Final"
                            style={inputStyle} />
                        </Field>
                      </div>
                    )}
                  </div>

                  <Field label="CUIT">
                    <input value={cliSeleccionado?.cuit || ''} readOnly placeholder="—"
                      style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                  <Field label="Condición IVA">
                    <input value={cliSeleccionado?.condicion_iva || 'Consumidor Final'} readOnly
                      style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                  <Field label="Teléfono">
                    <input value={cliSeleccionado?.telefono || ''} readOnly placeholder="—"
                      style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                  <Field label="Email">
                    <input value={cliSeleccionado?.email || ''} readOnly placeholder="—"
                      style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                </div>
              )}

              {tabCliente === 'direccion' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
                  <Field label="Dirección">
                    <input value={cliSeleccionado?.direccion || ''} readOnly placeholder="—" style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                  <Field label="Localidad">
                    <input value={cliSeleccionado?.localidad || ''} readOnly placeholder="—" style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                  <Field label="Provincia">
                    <input value={cliSeleccionado?.provincia || ''} readOnly placeholder="—" style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                  <Field label="C.P.">
                    <input value={cliSeleccionado?.cp || ''} readOnly placeholder="—" style={{ ...inputStyle, color: C.textMuted }} />
                  </Field>
                </div>
              )}

              {tabCliente === 'obs' && (
                <Field label="Observaciones / Pie del comprobante">
                  <textarea value={obs} onChange={e => setObs(e.target.value)}
                    style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} />
                </Field>
              )}
            </div>
          </section>

          {/* ── TABLA DE ÍTEMS ── */}
          <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tabs ítems */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}`, padding: '0 20px', background: C.surface, gap: 0, flexShrink: 0 }}>
              {(['items', 'adicional'] as const).map(tab => {
                const labels = { items: `Ítems (${items.filter(it => it.detalle && num(it.cantidad) > 0).length})`, adicional: 'Descuentos y percepciones' }
                return (
                  <button key={tab} onClick={() => setTabItems(tab)}
                    style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tabItems === tab ? C.accent : 'transparent'}`, color: tabItems === tab ? C.accent : C.textMuted, fontSize: 13, fontWeight: tabItems === tab ? 700 : 400, cursor: 'pointer' }}>
                    {labels[tab]}
                  </button>
                )
              })}
              <div style={{ flex: 1 }} />
              <button onClick={addItem}
                style={{ background: C.greenDim, color: C.green, border: `1px solid ${C.green}40`, borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', margin: '6px 0' }}>
                + Agregar ítem
              </button>
            </div>

            {/* Contenido tabla */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {tabItems === 'items' && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.surface, position: 'sticky', top: 0, zIndex: 10 }}>
                      {['#', 'Código', 'Descripción', 'Cantidad', 'EM', 'Precio Unit.', 'Subtotal', ''].map((h, i) => (
                        <th key={i} style={{ padding: '9px 12px', textAlign: i === 0 || i === 3 ? 'center' : i >= 4 ? 'right' : 'left', color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap', ...(i === 0 ? { width: 40 } : i === 1 ? { width: 100 } : i === 3 ? { width: 90 } : i === 4 ? { width: 60 } : i === 5 ? { width: 110 } : i === 6 ? { width: 120 } : i === 7 ? { width: 40 } : {}) }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.surfaceAlt)}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : C.surface)}>
                        {/* # */}
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: C.textDim, fontSize: 12 }}>{i + 1}</td>
                        {/* Código */}
                        <td style={{ padding: '4px 6px' }}>
                          <input value={it.codigo} onChange={e => setItem(i, 'codigo', e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarItem(i, (e.target as HTMLInputElement).value) } }}
                            placeholder="Cód."
                            style={{ ...inputStyle, padding: '5px 8px', fontSize: 12, background: 'transparent', border: `1px solid transparent` }}
                            onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
                            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')} />
                        </td>
                        {/* Descripción / Búsqueda */}
                        <td style={{ padding: '4px 6px' }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select value="" onChange={e => { const m = materiales.find(x => x.id === e.target.value); if (m) { aplicarMat(i, m); avanzar(i) } }}
                              style={{ ...selectStyle, padding: '5px 6px', fontSize: 12, background: 'transparent', border: `1px solid ${C.border}`, width: 28, color: C.textMuted }}>
                              <option value="">⬇</option>
                              {materiales.map(m => <option key={m.id} value={m.id}>{m.codigo ? `[${m.codigo}] ` : ''}{m.nombre}</option>)}
                            </select>
                            <input value={it.detalle}
                              ref={el => { detRefs.current[i] = el }}
                              onChange={e => setItem(i, 'detalle', e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarItem(i, (e.target as HTMLInputElement).value) } }}
                              placeholder="Descripción o código + Enter ↵"
                              style={{ ...inputStyle, padding: '5px 8px', fontSize: 12, flex: 1, background: 'transparent', border: `1px solid transparent` }}
                              onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
                              onBlur={e => (e.currentTarget.style.borderColor = 'transparent')} />
                            <button onClick={() => buscarItem(i)}
                              style={{ background: C.blueDim, color: C.blue, border: `1px solid ${C.blue}30`, borderRadius: 5, padding: '4px 7px', cursor: 'pointer', fontSize: 11 }}>🔍</button>
                          </div>
                        </td>
                        {/* Cantidad — Enter aquí dispara la búsqueda */}
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarItem(i) } }}
                            style={{ ...inputStyle, padding: '5px 8px', fontSize: 12, textAlign: 'center', background: 'transparent', border: `1px solid transparent` }}
                            onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
                            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')} />
                        </td>
                        {/* EM */}
                        <td style={{ padding: '4px 6px', color: C.textDim, fontSize: 11, textAlign: 'right' }}>
                          {materiales.find(m => m.nombre === it.detalle)?.unidad || ''}
                        </td>
                        {/* Precio */}
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" value={it.precio} onChange={e => setItem(i, 'precio', e.target.value)}
                            style={{ ...inputStyle, padding: '5px 8px', fontSize: 12, textAlign: 'right', color: C.accent, fontWeight: 700, background: 'transparent', border: `1px solid transparent` }}
                            onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
                            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')} />
                        </td>
                        {/* Subtotal */}
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: C.text, fontWeight: 700, fontFamily: "'Space Mono', monospace", fontSize: 13, whiteSpace: 'nowrap' }}>
                          {num(it.cantidad) * num(it.precio) > 0 ? money(num(it.cantidad) * num(it.precio)) : ''}
                        </td>
                        {/* Eliminar */}
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {items.length > 1 && (
                            <button onClick={() => delItem(i)}
                              style={{ background: C.redDim, color: C.red, border: 'none', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tabItems === 'adicional' && (
                <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, maxWidth: 600 }}>
                  <Field label="Descuento %">
                    <input type="number" value={descPct} onChange={e => setDescPct(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Descuento $ fijo">
                    <input type="number" value={descMonto} onChange={e => setDescMonto(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Percepciones $">
                    <input type="number" value={percep} onChange={e => setPercep(e.target.value)} style={inputStyle} />
                  </Field>
                  {descTotal > 0 && (
                    <div style={{ gridColumn: '1 / 4', background: C.greenDim, border: `1px solid ${C.green}30`, borderRadius: 7, padding: '10px 14px', color: C.green, fontSize: 13, fontWeight: 600 }}>
                      🏷️ Descuento total aplicado: − {money(descTotal)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── FOOTER ── */}
          <footer style={{ background: C.surface, borderTop: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.textMuted, fontSize: 12 }}>Estado:</span>
              <span style={{ background: C.greenDim, color: C.green, border: `1px solid ${C.green}30`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                {saved ? '✓ Emitido' : 'Borrador'}
              </span>
            </div>
            {errMsg && (
              <div style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>⚠️ {errMsg}</div>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ color: C.textMuted, fontSize: 12 }}>
              {items.filter(it => it.detalle && num(it.cantidad) > 0).length} ítem(s) · {(tipo === 'factura_x' || tipo === 'recibo') ? (condicion === 'CUENTA CORRIENTE' ? '📒 Suma a cta. cte.' : `💵 Ingresa a caja (${medioPago})`) : ''}
            </span>
            <div style={{ color: C.accent, fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>{money(total)}</div>
          </footer>
        </main>
      </div>

      {/* ── MODAL NUEVO CLIENTE ── */}
      {nuevoCli && (
        <div onClick={() => setNuevoCli(false)} style={{ position: 'fixed', inset: 0, background: '#000C', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: '90%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #000A' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ color: C.text, fontSize: 16, fontWeight: 800, margin: 0 }}>Nuevo Cliente</h3>
              <button onClick={() => setNuevoCli(false)} style={{ background: C.surfaceAlt, border: 'none', color: C.text, width: 30, height: 30, borderRadius: 7, cursor: 'pointer', fontSize: 15 }}>✕</button>
            </div>
            <NuevoClienteForm
              prefill={cliQuery}
              onClose={() => setNuevoCli(false)}
              onCreated={(c) => {
                setClientes(prev => [c, ...prev])
                setClienteId(c.id)
                setCliQuery('')
                setCliOpen(false)
                setNuevoCli(false)
              }} />
          </div>
        </div>
      )}

      {/* ── PICKER MÚLTIPLE ── */}
      {picker && (
        <div onClick={() => setPicker(null)} style={{ position: 'fixed', inset: 0, background: '#000C', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, width: '90%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px #000A' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ color: C.text, fontSize: 15, fontWeight: 800, margin: 0 }}>{picker.matches.length} coincidencias</h3>
              <button onClick={() => setPicker(null)} style={{ background: C.surfaceAlt, border: 'none', color: C.text, width: 30, height: 30, borderRadius: 7, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {picker.matches.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: pickerSel[m.id] ? C.accentDim : C.surfaceAlt, border: `1px solid ${pickerSel[m.id] ? C.accent : C.border}`, borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!pickerSel[m.id]} onChange={e => setPickerSel(s => ({ ...s, [m.id]: e.target.checked }))} style={{ width: 15, height: 15 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{m.nombre}</div>
                    <div style={{ color: C.textDim, fontSize: 11 }}>{m.codigo ? `#${m.codigo} · ` : ''}{m.rubro || ''}</div>
                  </div>
                  <span style={{ color: C.accent, fontWeight: 700, fontFamily: "'Space Mono', monospace", fontSize: 13 }}>{money(m.precio_ref || 0)}</span>
                </label>
              ))}
            </div>
            <button onClick={confirmarPicker} style={{ width: '100%', background: C.accent, color: '#000', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              ✓ Agregar {Object.values(pickerSel).filter(Boolean).length || ''} seleccionado(s)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const CONDICIONES_IVA = ['Consumidor Final', 'Responsable Inscripto', 'Monotributo', 'Exento', 'IVA No Alcanzado']

function NuevoClienteForm({ prefill, onClose, onCreated }: { prefill?: string; onClose: () => void; onCreated: (c: Cliente) => void }) {
  const [f, setF] = useState({ nombre: prefill || '', condicion_iva: 'Consumidor Final', cuit: '', dni: '', telefono: '', direccion: '', localidad: '', provincia: '', cp: '', email: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const guardar = async () => {
    if (!f.nombre.trim()) return
    setSaving(true)
    try {
      const nc = await createCliente({ ...f, creado_por: getOp() } as any)
      logAct('Creó', 'Cliente', f.nombre, (nc as any)?.id)
      onCreated(nc as Cliente)
    } catch { } finally { setSaving(false) }
  }
  const fi = (label: string, key: string, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>{label.toUpperCase()}</label>
      <input type={type} value={(f as any)[key]} onChange={e => set(key, e.target.value)}
        style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' }} />
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fi('Nombre / Razón social', 'nombre')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>CONDICIÓN IVA</label>
        <select value={f.condicion_iva} onChange={e => set('condicion_iva', e.target.value)}
          style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' }}>
          {CONDICIONES_IVA.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {fi('CUIT', 'cuit')}
        {fi('DNI', 'dni')}
        {fi('Teléfono', 'telefono', 'tel')}
        {fi('Email', 'email', 'email')}
      </div>
      {fi('Dirección', 'direccion')}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10 }}>
        {fi('Localidad', 'localidad')}
        {fi('Provincia', 'provincia')}
        {fi('CP', 'cp')}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onClose} style={{ flex: 1, background: C.surfaceAlt, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={guardar} disabled={saving || !f.nombre.trim()} style={{ flex: 2, background: C.accent, color: '#000', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Guardando...' : '💾 Guardar cliente'}
        </button>
      </div>
    </div>
  )
}

function TotalRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: C.textMuted, fontSize: 11 }}>{label}</span>
      <span style={{ color: color || C.text, fontSize: 12, fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>
        {value < 0 ? `− ${money(-value)}` : money(value)}
      </span>
    </div>
  )
}
