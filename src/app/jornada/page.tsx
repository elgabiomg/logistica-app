'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getJornadas, getJornada, createJornada, updateJornada,
  agregarComprobantesAJornada, quitarComprobanteDeJornada,
  reordenarJornada, updateJornadaComprobante, registrarCobroJornada,
  generarRemitoNumero, convertirPresupuestoAFacturaX,
  registrarEgresoCompra, getEgresosJornada,
  getComprobantes, getEmpresa, supabase,
  type Jornada, type JornadaComprobante, type Comprobante, type EmpresaConfig
} from '@/lib/supabase'

const C = {
  bg: '#0F1117', surface: '#1A1D2E', surfaceAlt: '#232640',
  border: '#2A2D45', text: '#E8EAF6', textMuted: '#6B7280',
  accent: '#F5A623', accentDim: '#F5A62320',
  green: '#22C55E', greenDim: '#22C55E20',
  blue: '#3B82F6', blueDim: '#3B82F620',
  red: '#EF4444', redDim: '#EF444420',
  yellow: '#EAB308', yellowDim: '#EAB30820',
  purple: '#A855F7',
}

const money = (n: number) => '$ ' + Math.round(n).toLocaleString('es-AR')
const fmtFecha = (d: string) => { const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }

type Paso = 'planificar' | 'comprar' | 'cargar' | 'repartir' | 'cerrar'
const PASOS: { id: Paso; label: string; icon: string }[] = [
  { id: 'planificar', label: 'Planificar', icon: '📋' },
  { id: 'comprar',   label: 'Comprar',    icon: '🛒' },
  { id: 'cargar',    label: 'Cargar',     icon: '🚛' },
  { id: 'repartir',  label: 'Repartir',   icon: '📍' },
  { id: 'cerrar',    label: 'Cerrar',     icon: '✅' },
]
const MEDIOS_COBRO = ['efectivo', 'transferencia', 'débito', 'crédito', 'qr']
const inp: React.CSSProperties = { width: '100%', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }

// ── Canvas de firma ──────────────────────────────────────────────────────────
function FirmaCanvas({ onFirma }: { onFirma: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasFirma = useRef(false)

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const src = 'touches' in e ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent)
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) }
  }
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = ref.current; if (!canvas) return
    const p = getPos(e, canvas)
    canvas.getContext('2d')!.beginPath()
    canvas.getContext('2d')!.moveTo(p.x, p.y)
    drawing.current = true
  }
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const p = getPos(e, canvas)
    ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = '#E8EAF6'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.stroke()
    hasFirma.current = true
  }
  const stop = () => {
    drawing.current = false
    if (hasFirma.current && ref.current) onFirma(ref.current.toDataURL('image/png'))
  }
  const limpiar = () => {
    const canvas = ref.current; if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    hasFirma.current = false; onFirma(null)
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Firma del receptor</label>
        <button onClick={limpiar} style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 11 }}>Limpiar</button>
      </div>
      <canvas ref={ref} width={340} height={90}
        onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
        style={{ width: '100%', height: 90, background: C.surfaceAlt, borderRadius: 8, border: `1px dashed ${C.border}`, cursor: 'crosshair', touchAction: 'none', display: 'block' }} />
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>Dibujá la firma con el dedo o el mouse</div>
    </div>
  )
}

export default function JornadaPage() {
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [jornadaActiva, setJornadaActiva] = useState<Jornada | null>(null)
  const [paso, setPaso] = useState<Paso>('planificar')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  // Planificar
  const [comprobantesDisp, setComprobantesDisp] = useState<Comprobante[]>([])
  const [selComp, setSelComp] = useState<Set<string>>(new Set())
  const [fechaNueva, setFechaNueva] = useState(new Date().toISOString().slice(0, 10))
  const [creandoJornada, setCreandoJornada] = useState(false)

  // Modal entrega/cobro
  const [modalCobro, setModalCobro] = useState<JornadaComprobante | null>(null)
  const [cobMonto, setCobMonto] = useState('')
  const [cobMedio, setCobMedio] = useState('efectivo')
  const [cobNombre, setCobNombre] = useState('')
  const [cobDni, setCobDni] = useState('')
  const [cobObs, setCobObs] = useState('')
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [obteniendoGPS, setObteniendoGPS] = useState(false)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  // Modal conversión Factura X
  const [modalConvertir, setModalConvertir] = useState<{ presupuestos: Comprobante[]; resto: string[] } | null>(null)

  // Modal egreso de compra
  const [modalEgreso, setModalEgreso] = useState(false)
  const [egresoConcepto, setEgresoConcepto] = useState('')
  const [egresoMonto, setEgresoMonto] = useState('')

  // Cerrar: egresos
  const [egresosJornada, setEgresosJornada] = useState(0)

  const [orden, setOrden] = useState<string[]>([])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [emp, lista] = await Promise.all([getEmpresa(), getJornadas(20)])
      setEmpresa(emp)
      setJornadas(lista)
      const activa = lista.find(j => j.estado !== 'cerrada')
      if (activa) {
        const detalle = await getJornada(activa.id)
        setJornadaActiva(detalle)
        setOrden((detalle.jornada_comprobantes || []).sort((a, b) => a.orden - b.orden).map(jc => jc.comprobante_id))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  const abrirJornada = async (j: Jornada) => {
    const detalle = await getJornada(j.id)
    setJornadaActiva(detalle)
    setOrden((detalle.jornada_comprobantes || []).sort((a, b) => a.orden - b.orden).map(jc => jc.comprobante_id))
    setPaso('planificar')
  }

  const abrirPlanificar = async () => {
    const todos = await getComprobantes(undefined, 200)
    const enJornada = new Set((jornadaActiva?.jornada_comprobantes || []).map(jc => jc.comprobante_id))
    setComprobantesDisp(todos.filter(c => (c.tipo === 'presupuesto' || c.tipo === 'factura_x') && !enJornada.has(c.id)).slice(0, 100))
    setSelComp(new Set())
  }

  const abrirCerrar = async () => {
    if (!jornadaActiva) return
    const egresos = await getEgresosJornada(jornadaActiva.fecha)
    setEgresosJornada(egresos)
  }

  const crearNuevaJornada = async () => {
    setGuardando(true)
    try {
      const j = await createJornada(fechaNueva)
      const detalle = await getJornada(j.id)
      setJornadaActiva(detalle)
      setJornadas(prev => [detalle, ...prev])
      setCreandoJornada(false); setPaso('planificar')
    } finally { setGuardando(false) }
  }

  const iniciarAgregar = async () => {
    if (!jornadaActiva || !selComp.size) return
    const selArr = Array.from(selComp)
    const presupuestos = comprobantesDisp.filter(c => selArr.includes(c.id) && c.tipo === 'presupuesto')
    const resto = selArr.filter(id => !presupuestos.find(p => p.id === id))
    if (presupuestos.length > 0) setModalConvertir({ presupuestos, resto })
    else await ejecutarAgregar(selArr, false)
  }

  const ejecutarAgregar = async (ids: string[], convertir: boolean) => {
    if (!jornadaActiva) return
    setGuardando(true)
    try {
      let idsFinales = ids
      if (convertir && modalConvertir) {
        const convertidos = await Promise.all(modalConvertir.presupuestos.map(p => convertirPresupuestoAFacturaX(p.id)))
        idsFinales = [...modalConvertir.resto, ...convertidos.map(c => c.id)]
      }
      await agregarComprobantesAJornada(jornadaActiva.id, idsFinales)
      const detalle = await getJornada(jornadaActiva.id)
      setJornadaActiva(detalle)
      setOrden((detalle.jornada_comprobantes || []).sort((a, b) => a.orden - b.orden).map(jc => jc.comprobante_id))
      setSelComp(new Set()); setModalConvertir(null)
    } finally { setGuardando(false) }
  }

  const quitarComprobante = async (comprobanteId: string) => {
    if (!jornadaActiva) return
    await quitarComprobanteDeJornada(jornadaActiva.id, comprobanteId)
    const detalle = await getJornada(jornadaActiva.id)
    setJornadaActiva(detalle)
    setOrden(detalle.jornada_comprobantes?.sort((a, b) => a.orden - b.orden).map(jc => jc.comprobante_id) || [])
  }

  const toggleCheck = async (comprobanteId: string, campo: 'comprado' | 'cargado' | 'entregado', valor: boolean) => {
    if (!jornadaActiva) return
    const patch: any = { [campo]: valor }
    if (campo === 'entregado' && valor) patch.fecha_entrega_real = new Date().toISOString()
    await updateJornadaComprobante(jornadaActiva.id, comprobanteId, patch)
    const detalle = await getJornada(jornadaActiva.id)
    setJornadaActiva(detalle)
  }

  const moverOrden = async (compId: string, dir: -1 | 1) => {
    const idx = orden.indexOf(compId); if (idx < 0) return
    const nuevo = [...orden]; const swap = idx + dir
    if (swap < 0 || swap >= nuevo.length) return
    ;[nuevo[idx], nuevo[swap]] = [nuevo[swap], nuevo[idx]]
    setOrden(nuevo)
    await reordenarJornada(jornadaActiva!.id, nuevo)
    const detalle = await getJornada(jornadaActiva!.id)
    setJornadaActiva(detalle)
  }

  const abrirModalCobro = (jc: JornadaComprobante) => {
    setModalCobro(jc)
    setCobMonto(jc.monto_cobrado ? String(jc.monto_cobrado) : String((jc.comprobantes as any)?.total || ''))
    setCobMedio(jc.medio_pago_cobro || 'efectivo')
    setCobNombre(jc.nombre_receptor || ''); setCobDni(jc.dni_receptor || ''); setCobObs(jc.obs_entrega || '')
    setFirmaDataUrl(null); setGpsCoords(null); setFotoUrl(null)
  }

  const obtenerGPS = () => {
    setObteniendoGPS(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setObteniendoGPS(false) },
      () => { alert('No se pudo obtener la ubicación'); setObteniendoGPS(false) },
      { timeout: 10000 }
    )
  }

  const subirFoto = async (file: File) => {
    if (!jornadaActiva || !modalCobro) return
    setSubiendoFoto(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `fotos-remito/${jornadaActiva.id}/${modalCobro.comprobante_id}.${ext}`
      const { error } = await (supabase as any).storage.from('empresa').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = (supabase as any).storage.from('empresa').getPublicUrl(path)
      setFotoUrl(data?.publicUrl || null)
    } catch (e: any) {
      alert('Error subiendo foto: ' + e.message)
    } finally { setSubiendoFoto(false) }
  }

  const guardarCobro = async () => {
    if (!jornadaActiva || !modalCobro) return
    setGuardando(true)
    try {
      const comp = modalCobro.comprobantes as any
      // Subir firma
      let firma_url: string | null = modalCobro.firma_url || null
      if (firmaDataUrl) {
        const blob = await fetch(firmaDataUrl).then(r => r.blob())
        const path = `firmas/${jornadaActiva.id}/${modalCobro.comprobante_id}.png`
        const { error: ue } = await (supabase as any).storage.from('empresa').upload(path, blob, { upsert: true, contentType: 'image/png' })
        if (!ue) {
          const { data: ud } = (supabase as any).storage.from('empresa').getPublicUrl(path)
          firma_url = ud?.publicUrl || null
        }
      }
      await registrarCobroJornada(jornadaActiva.id, modalCobro.comprobante_id, Number(cobMonto), cobMedio, comp?.cliente_nombre || 'Cliente')
      await updateJornadaComprobante(jornadaActiva.id, modalCobro.comprobante_id, {
        entregado: true, fecha_entrega_real: new Date().toISOString(),
        gps_lat: gpsCoords?.lat ?? null, gps_lng: gpsCoords?.lng ?? null,
        nombre_receptor: cobNombre || null, dni_receptor: cobDni || null,
        obs_entrega: cobObs || null, firma_url,
        foto_remito_url: fotoUrl || null,
      })
      await generarRemitoNumero(jornadaActiva.id, modalCobro.comprobante_id)
      const detalle = await getJornada(jornadaActiva.id)
      setJornadaActiva(detalle); setModalCobro(null)
    } finally { setGuardando(false) }
  }

  const guardarEgreso = async () => {
    if (!jornadaActiva || !egresoMonto) return
    setGuardando(true)
    try {
      await registrarEgresoCompra(egresoConcepto || 'Compra de materiales', Number(egresoMonto), jornadaActiva.id)
      setModalEgreso(false); setEgresoConcepto(''); setEgresoMonto('')
    } finally { setGuardando(false) }
  }

  const cerrarJornada = async () => {
    if (!jornadaActiva) return
    setGuardando(true)
    try {
      await updateJornada(jornadaActiva.id, { estado: 'cerrada' })
      await cargarDatos(); setJornadaActiva(null); setPaso('planificar')
    } finally { setGuardando(false) }
  }

  const jcs = (jornadaActiva?.jornada_comprobantes || []).sort((a, b) => a.orden - b.orden)
  const jcsPorId = new Map(jcs.map(jc => [jc.comprobante_id, jc]))

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>Cargando...</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/" style={{ color: C.textMuted, textDecoration: 'none', fontSize: 13 }}>← Volver</a>
        <span style={{ color: C.border }}>|</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>🚛 Jornadas de Reparto</span>
        {jornadaActiva && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textMuted }}>
            {fmtFecha(jornadaActiva.fecha)} · {jcs.length} parada{jcs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Lista de jornadas ── */}
        {!jornadaActiva ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Jornadas</h2>
              <button onClick={() => setCreandoJornada(true)}
                style={{ background: C.accent, color: '#000', fontWeight: 700, border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 14 }}>
                + Nueva jornada
              </button>
            </div>
            {creandoJornada && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Nueva jornada</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="date" value={fechaNueva} onChange={e => setFechaNueva(e.target.value)}
                    style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: '7px 10px', fontSize: 14 }} />
                  <button onClick={crearNuevaJornada} disabled={guardando}
                    style={{ background: C.accent, color: '#000', fontWeight: 700, border: 'none', borderRadius: 6, padding: '7px 18px', cursor: 'pointer' }}>
                    {guardando ? '...' : 'Crear'}
                  </button>
                  <button onClick={() => setCreandoJornada(false)}
                    style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.textMuted, padding: '7px 12px', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {jornadas.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.textMuted, padding: '40px 0' }}>No hay jornadas. Creá una para empezar.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {jornadas.map(j => {
                  const estadoColor = j.estado === 'cerrada' ? C.textMuted : j.estado === 'activa' ? C.green : C.accent
                  return (
                    <button key={j.id} onClick={() => abrirJornada(j)}
                      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 20 }}>{j.estado === 'cerrada' ? '✅' : j.estado === 'activa' ? '🚛' : '📋'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: C.text }}>{fmtFecha(j.fecha)}</div>
                        {j.notas && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{j.notas}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: estadoColor, textTransform: 'uppercase', letterSpacing: 1 }}>{j.estado}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <button onClick={() => setJornadaActiva(null)}
              style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13, marginBottom: 12, padding: 0 }}>
              ← Todas las jornadas
            </button>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.surface, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
              {PASOS.map(p => (
                <button key={p.id} onClick={() => {
                  setPaso(p.id)
                  if (p.id === 'planificar') abrirPlanificar()
                  if (p.id === 'cerrar') abrirCerrar()
                }}
                  style={{ flex: 1, border: 'none', borderRadius: 7, padding: '8px 4px', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: paso === p.id ? C.accent : 'transparent', color: paso === p.id ? '#000' : C.textMuted }}>
                  <div style={{ fontSize: 16 }}>{p.icon}</div>
                  <div>{p.label}</div>
                </button>
              ))}
            </div>

            {/* ── PLANIFICAR ── */}
            {paso === 'planificar' && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Pedidos en la jornada ({jcs.length})</div>
                {jcs.length === 0 && <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>Todavía no hay pedidos. Agregá abajo.</div>}
                {jcs.map(jc => {
                  const comp = jc.comprobantes as any
                  return (
                    <div key={jc.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{comp?.cliente_nombre || '—'}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          {comp?.tipo?.toUpperCase()} N° {String(comp?.numero || '').padStart(8, '0')} · {money(comp?.total || 0)}
                        </div>
                        {comp?.clientes?.telefono && <div style={{ fontSize: 11, color: C.textMuted }}>📞 {comp.clientes.telefono}</div>}
                      </div>
                      <button onClick={() => quitarComprobante(jc.comprobante_id)}
                        style={{ background: C.redDim, border: `1px solid ${C.red}30`, color: C.red, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                        Quitar
                      </button>
                    </div>
                  )
                })}
                <div style={{ marginTop: 16, background: C.surfaceAlt, borderRadius: 10, padding: 14, border: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Agregar comprobantes</div>
                  {comprobantesDisp.length === 0 ? (
                    <div style={{ color: C.textMuted, fontSize: 12 }}>No hay comprobantes disponibles.</div>
                  ) : (
                    <>
                      <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {comprobantesDisp.map(c => (
                          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 7, background: selComp.has(c.id) ? C.accentDim : C.surface, border: `1px solid ${selComp.has(c.id) ? C.accent : C.border}` }}>
                            <input type="checkbox" checked={selComp.has(c.id)} onChange={e => {
                              setSelComp(prev => { const s = new Set(prev); e.target.checked ? s.add(c.id) : s.delete(c.id); return s })
                            }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.cliente_nombre || '—'}</div>
                              <div style={{ fontSize: 11, color: C.textMuted }}>{c.tipo?.toUpperCase()} N° {String(c.numero).padStart(8, '0')} · {money(c.total)}</div>
                            </div>
                            {c.tipo === 'presupuesto' && (
                              <span style={{ fontSize: 10, background: C.yellowDim, color: C.yellow, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>PRESUP.</span>
                            )}
                          </label>
                        ))}
                      </div>
                      {selComp.size > 0 && (
                        <button onClick={iniciarAgregar} disabled={guardando}
                          style={{ marginTop: 10, background: C.accent, color: '#000', fontWeight: 700, border: 'none', borderRadius: 7, padding: '9px 20px', cursor: 'pointer', width: '100%' }}>
                          {guardando ? '...' : `Agregar ${selComp.size} comprobante${selComp.size > 1 ? 's' : ''}`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── COMPRAR ── */}
            {paso === 'comprar' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Lista de compras</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => {
                      // Construir datos agrupados por proveedor
                      const porProv: Record<string, { proveedor: string; items: any[] }> = {}
                      jcs.forEach(jc => {
                        const comp = jc.comprobantes as any
                        ;(comp?.comprobante_items || []).filter((it: any) => it.material_id && it.materiales?.proveedor_id).forEach((it: any) => {
                          const prov = it.materiales?.proveedores?.nombre || 'Sin proveedor'
                          if (!porProv[prov]) porProv[prov] = { proveedor: prov, items: [] }
                          const existing = porProv[prov].items.find((x: any) => x.detalle === it.detalle)
                          if (existing) existing.cantidad += Number(it.cantidad)
                          else porProv[prov].items.push({ detalle: it.detalle, cantidad: Number(it.cantidad), unidad: it.materiales?.unidad || '', costo: Number(it.materiales?.costo || 0) })
                        })
                      })
                      const fmt = (n: number) => '$ ' + Math.round(n).toLocaleString('es-AR')
                      const grupos = Object.values(porProv)
                      const totalGeneral = grupos.reduce((s, g) => s + g.items.reduce((ss, it) => ss + it.cantidad * it.costo, 0), 0)
                      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lista de Compras — ${jornadaActiva?.fecha || ''}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 15mm; }
h1 { font-size: 18px; font-weight: 900; margin-bottom: 4px; }
.fecha { font-size: 11px; color: #666; margin-bottom: 14px; }
.proveedor { margin-bottom: 14px; break-inside: avoid; }
.prov-header { background: #1a1a1a; color: #fff; padding: 6px 10px; font-size: 12px; font-weight: 800; border-radius: 3px 3px 0 0; }
table { width: 100%; border-collapse: collapse; }
th { background: #f0f0f0; padding: 5px 8px; text-align: left; border: 1px solid #ddd; font-size: 10px; }
td { padding: 5px 8px; border: 1px solid #ddd; font-size: 10px; }
tr:nth-child(even) td { background: #fafafa; }
.num { text-align: right; }
.foot { background: #f5f5f5; font-weight: 700; }
.total-final { margin-top: 16px; text-align: right; font-size: 13px; font-weight: 900; border-top: 2px solid #000; padding-top: 8px; }
@media print { @page { size: A4; margin: 10mm; } body { padding: 0; } }
</style></head><body>
<h1>Lista de Compras</h1>
<div class="fecha">Jornada: ${jornadaActiva?.fecha || ''} · Generado: ${new Date().toLocaleDateString('es-AR')}</div>
${grupos.map(g => {
  const totalLista = g.items.reduce((s, it) => s + it.cantidad * it.costo, 0)
  const totalEfectivo = totalLista * 0.94
  return `<div class="proveedor">
<div class="prov-header">🏪 ${g.proveedor}</div>
<table>
<thead><tr><th>Material</th><th style="width:50px">Cant.</th><th style="width:40px">Unid.</th>${g.items.some(i => i.costo > 0) ? '<th style="width:80px">Precio unit.</th><th style="width:85px">Subtotal</th><th style="width:85px">c/dto 6%</th>' : ''}</tr></thead>
<tbody>
${g.items.map(it => `<tr>
<td>${it.detalle}</td>
<td class="num">${it.cantidad}</td>
<td>${it.unidad}</td>
${it.costo > 0 ? `<td class="num">${fmt(it.costo)}</td><td class="num">${fmt(it.cantidad * it.costo)}</td><td class="num" style="color:#166534">${fmt(it.cantidad * it.costo * 0.94)}</td>` : (g.items.some(i => i.costo > 0) ? '<td></td><td></td><td></td>' : '')}
</tr>`).join('')}
${totalLista > 0 ? `<tr class="foot"><td colspan="4" style="text-align:right">Total lista:</td><td class="num">${fmt(totalLista)}</td><td class="num" style="color:#166534">${fmt(totalEfectivo)}</td></tr>` : ''}
</tbody></table></div>`}).join('')}
${totalGeneral > 0 ? `<div class="total-final">TOTAL GENERAL — Lista: ${fmt(totalGeneral)} · Efectivo −6%: ${fmt(totalGeneral * 0.94)}</div>` : ''}
</body></html>`
                      const w = window.open('', '_blank')
                      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
                    }}
                    style={{ background: '#1e3a5f', border: '1px solid #3B82F640', color: '#3B82F6', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      🖨️ Imprimir lista
                    </button>
                    <button onClick={() => setModalEgreso(true)}
                      style={{ background: C.redDim, border: `1px solid ${C.red}40`, color: C.red, borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      💸 Registrar gasto
                    </button>
                  </div>
                </div>
                {jcs.length === 0 ? (
                  <div style={{ color: C.textMuted }}>Primero agregá pedidos en Planificar.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(() => {
                      const porProv: Record<string, { proveedor: string; items: any[] }> = {}
                      jcs.forEach(jc => {
                        const comp = jc.comprobantes as any
                        ;(comp?.comprobante_items || []).filter((it: any) => it.material_id && it.materiales?.proveedor_id).forEach((it: any) => {
                          const prov = it.materiales?.proveedores?.nombre || 'Sin proveedor'
                          if (!porProv[prov]) porProv[prov] = { proveedor: prov, items: [] }
                          const existing = porProv[prov].items.find((x: any) => x.detalle === it.detalle)
                          if (existing) existing.cantidad += Number(it.cantidad)
                          else porProv[prov].items.push({ detalle: it.detalle, cantidad: Number(it.cantidad), unidad: it.materiales?.unidad || '', costo: Number(it.materiales?.costo || 0) })
                        })
                      })
                      const money = (n: number) => '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                      return Object.values(porProv).map(g => {
                        const totalLista = g.items.reduce((s, it) => s + it.cantidad * it.costo, 0)
                        const totalEfectivo = totalLista * 0.94
                        return (
                        <div key={g.proveedor} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                          <div style={{ padding: '10px 14px', background: C.surfaceAlt, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>🏪 {g.proveedor}</span>
                          </div>
                          {g.items.map((it, i) => {
                            const jcWithIt = jcs.find(jc => (jc.comprobantes as any)?.comprobante_items?.some((x: any) => x.detalle === it.detalle))
                            const comprado = jcWithIt?.comprado || false
                            const subtotal = it.cantidad * it.costo
                            return (
                              <div key={i} style={{ padding: '10px 14px', borderBottom: i < g.items.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" checked={comprado} onChange={e => jcWithIt && toggleCheck(jcWithIt.comprobante_id, 'comprado', e.target.checked)} style={{ width: 18, height: 18 }} />
                                <div style={{ flex: 1, textDecoration: comprado ? 'line-through' : 'none', color: comprado ? C.textMuted : C.text }}>
                                  <span style={{ fontWeight: 600 }}>{it.cantidad} {it.unidad}</span> · {it.detalle}
                                </div>
                                {it.costo > 0 && (
                                  <div style={{ textAlign: 'right', fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>
                                    <div>{money(subtotal)}</div>
                                    <div style={{ color: '#22c55e', fontSize: 11 }}>c/dto: {money(subtotal * 0.94)}</div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {totalLista > 0 && (
                            <div style={{ padding: '10px 14px', background: C.surfaceAlt, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 13 }}>
                              <div style={{ color: C.textMuted }}>Lista: <strong style={{ color: C.text }}>{money(totalLista)}</strong></div>
                              <div style={{ color: '#22c55e' }}>Efectivo −6%: <strong>{money(totalEfectivo)}</strong></div>
                            </div>
                          )}
                        </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ── CARGAR ── */}
            {paso === 'cargar' && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Control de carga por pedido</div>
                {jcs.map(jc => {
                  const comp = jc.comprobantes as any
                  return (
                    <div key={jc.id} style={{ background: C.surface, border: `1px solid ${jc.cargado ? C.green : C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <input type="checkbox" checked={jc.cargado} onChange={e => toggleCheck(jc.comprobante_id, 'cargado', e.target.checked)} style={{ width: 20, height: 20 }} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{comp?.cliente_nombre || '—'}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{money(comp?.total || 0)}</div>
                        </div>
                        {jc.cargado && <span style={{ marginLeft: 'auto', color: C.green, fontWeight: 700, fontSize: 12 }}>✓ Cargado</span>}
                      </div>
                      <div style={{ paddingLeft: 30, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {(comp?.comprobante_items || []).map((it: any, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: C.textMuted }}>
                            · {it.cantidad} {it.materiales?.unidad || ''} {it.detalle}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── REPARTIR ── */}
            {paso === 'repartir' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Hoja de ruta</div>
                  <a href={`/hoja-ruta/${jornadaActiva.id}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: C.blue, textDecoration: 'none', fontWeight: 700 }}>
                    🖨️ Imprimir hoja
                  </a>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Reordenás con las flechas. Registrá entrega y cobro al llegar.</div>

                {orden.map((compId, idx) => {
                  const jc = jcsPorId.get(compId); if (!jc) return null
                  const comp = jc.comprobantes as any
                  const totalComp = comp?.total || 0
                  const cobrado = jc.monto_cobrado || 0
                  const saldo = totalComp - cobrado
                  return (
                    <div key={compId} style={{ background: C.surface, border: `1px solid ${jc.entregado ? C.green : C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ background: C.accent, color: '#000', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>{comp?.cliente_nombre || '—'}</div>
                          {comp?.clientes?.direccion && <div style={{ fontSize: 11, color: C.textMuted }}>📍 {comp.clientes.direccion}</div>}
                          {comp?.clientes?.telefono && <div style={{ fontSize: 11, color: C.textMuted }}>📞 {comp.clientes.telefono}</div>}
                          <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginTop: 4 }}>
                            {money(totalComp)} · {comp?.condicion_pago || ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <button onClick={() => moverOrden(compId, -1)} disabled={idx === 0}
                            style={{ background: C.surfaceAlt, border: 'none', borderRadius: 4, cursor: 'pointer', color: C.text, fontSize: 12, padding: '2px 6px', opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                          <button onClick={() => moverOrden(compId, 1)} disabled={idx === orden.length - 1}
                            style={{ background: C.surfaceAlt, border: 'none', borderRadius: 4, cursor: 'pointer', color: C.text, fontSize: 12, padding: '2px 6px', opacity: idx === orden.length - 1 ? 0.3 : 1 }}>▼</button>
                        </div>
                      </div>
                      <div style={{ paddingLeft: 32, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(comp?.comprobante_items || []).slice(0, 4).map((it: any, i: number) => (
                          <div key={i} style={{ fontSize: 11, color: C.textMuted }}>· {it.cantidad} {it.detalle}</div>
                        ))}
                        {(comp?.comprobante_items || []).length > 4 && <div style={{ fontSize: 11, color: C.textMuted }}>+ {(comp?.comprobante_items || []).length - 4} más</div>}
                      </div>
                      <div style={{ paddingLeft: 32, marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {jc.entregado ? (
                          <>
                            <div style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>
                              ✓ Entregado · {money(cobrado)} ({jc.medio_pago_cobro})
                              {saldo > 0 && <span style={{ color: C.yellow, marginLeft: 6 }}>· Saldo pendiente: {money(saldo)}</span>}
                            </div>
                            {jc.remito_numero && (
                              <a href={`/remito/${jc.id}`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: C.blue, fontWeight: 700, textDecoration: 'none' }}>
                                🖨️ Remito N° {String(jc.remito_numero).padStart(4, '0')}
                              </a>
                            )}
                          </>
                        ) : (
                          <button onClick={() => abrirModalCobro(jc)}
                            style={{ background: C.greenDim, border: `1px solid ${C.green}50`, color: C.green, borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                            Registrar entrega y cobro
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── CERRAR ── */}
            {paso === 'cerrar' && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Resumen de la jornada</div>
                {(() => {
                  const totales: Record<string, number> = {}
                  let totalCobrado = 0; let entregados = 0; let noEntregados = 0; let saldoPendiente = 0
                  jcs.forEach(jc => {
                    const totalComp = (jc.comprobantes as any)?.total || 0
                    if (jc.entregado) {
                      entregados++
                      const cobrado = Number(jc.monto_cobrado || 0)
                      if (cobrado) {
                        const mp = jc.medio_pago_cobro || 'efectivo'
                        totales[mp] = (totales[mp] || 0) + cobrado
                        totalCobrado += cobrado
                      }
                      saldoPendiente += Math.max(0, totalComp - cobrado)
                    } else { noEntregados++ }
                  })
                  const resultadoNeto = totalCobrado - egresosJornada
                  return (
                    <>
                      {/* KPIs */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: C.greenDim, border: `1px solid ${C.green}40`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: C.green }}>{entregados}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>Entregados</div>
                        </div>
                        <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: C.yellow }}>{noEntregados}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>No entregados</div>
                        </div>
                        <div style={{ background: C.accentDim, border: `1px solid ${C.accent}40`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.accent }}>{money(totalCobrado)}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>Cobrado</div>
                        </div>
                      </div>

                      {/* Resultado financiero */}
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                        <div style={{ padding: '10px 14px', background: C.surfaceAlt, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                          Resultado financiero
                        </div>
                        {Object.entries(totales).map(([mp, monto]) => (
                          <div key={mp} style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                            <span style={{ textTransform: 'capitalize', color: C.textMuted }}>Cobros — {mp}</span>
                            <span style={{ fontWeight: 700, color: C.green }}>+ {money(monto)}</span>
                          </div>
                        ))}
                        {egresosJornada > 0 && (
                          <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                            <span style={{ color: C.textMuted }}>Egresos — compras</span>
                            <span style={{ fontWeight: 700, color: C.red }}>- {money(egresosJornada)}</span>
                          </div>
                        )}
                        {saldoPendiente > 0 && (
                          <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                            <span style={{ color: C.textMuted }}>Saldo pendiente por cobrar</span>
                            <span style={{ fontWeight: 700, color: C.yellow }}>{money(saldoPendiente)}</span>
                          </div>
                        )}
                        <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                          <span style={{ fontWeight: 800 }}>Resultado neto</span>
                          <span style={{ fontWeight: 800, color: resultadoNeto >= 0 ? C.green : C.red }}>{money(resultadoNeto)}</span>
                        </div>
                      </div>

                      {/* Remitos */}
                      {jcs.some(jc => jc.remito_numero) && (
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                          <div style={{ padding: '10px 14px', background: C.surfaceAlt, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                            Remitos de esta jornada
                          </div>
                          {jcs.filter(jc => jc.remito_numero).map(jc => {
                            const comp = jc.comprobantes as any
                            return (
                              <div key={jc.id} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                                <span>{comp?.cliente_nombre}</span>
                                <a href={`/remito/${jc.id}`} target="_blank" rel="noopener noreferrer"
                                  style={{ color: C.blue, textDecoration: 'none', fontWeight: 700, fontSize: 12 }}>
                                  🖨️ Rem. {String(jc.remito_numero).padStart(4, '0')}
                                </a>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* No entregados */}
                      {jcs.filter(jc => !jc.entregado).length > 0 && (
                        <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: C.yellow, marginBottom: 8 }}>⚠️ No entregados — vuelven a pendientes</div>
                          {jcs.filter(jc => !jc.entregado).map(jc => {
                            const comp = jc.comprobantes as any
                            return <div key={jc.id} style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>· {comp?.cliente_nombre} — {money(comp?.total || 0)}</div>
                          })}
                        </div>
                      )}

                      <button onClick={cerrarJornada} disabled={guardando}
                        style={{ background: C.green, color: '#000', fontWeight: 800, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', fontSize: 15, width: '100%' }}>
                        {guardando ? '...' : '✅ Cerrar jornada'}
                      </button>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Registrar entrega y cobro ── */}
      {modalCobro && (
        <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px 14px 0 0', padding: 20, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>Registrar entrega y cobro</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>
              {(modalCobro.comprobantes as any)?.cliente_nombre}
              {' · Total: '}<strong style={{ color: C.accent }}>{money((modalCobro.comprobantes as any)?.total || 0)}</strong>
            </div>

            {/* Monto cobrado */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Monto cobrado</label>
              <input type="number" value={cobMonto} onChange={e => setCobMonto(e.target.value)}
                style={{ ...inp, fontSize: 20, fontWeight: 800, padding: '10px 12px' }} />
              {cobMonto && Number(cobMonto) < ((modalCobro.comprobantes as any)?.total || 0) && (
                <div style={{ fontSize: 11, color: C.yellow, marginTop: 3 }}>
                  ⚠️ Cobro parcial · Saldo pendiente: {money(((modalCobro.comprobantes as any)?.total || 0) - Number(cobMonto))}
                </div>
              )}
            </div>

            {/* Medio de pago */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Medio de pago</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MEDIOS_COBRO.map(m => (
                  <button key={m} onClick={() => setCobMedio(m)}
                    style={{ border: `1px solid ${cobMedio === m ? C.accent : C.border}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: cobMedio === m ? 700 : 400, background: cobMedio === m ? C.accentDim : 'transparent', color: cobMedio === m ? C.accent : C.textMuted, textTransform: 'capitalize' }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Receptor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Receptor</label>
                <input value={cobNombre} onChange={e => setCobNombre(e.target.value)} placeholder="Nombre (opcional)" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>DNI</label>
                <input value={cobDni} onChange={e => setCobDni(e.target.value)} placeholder="Opcional" style={inp} />
              </div>
            </div>

            {/* Observaciones */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Observaciones</label>
              <input value={cobObs} onChange={e => setCobObs(e.target.value)} placeholder="Opcional" style={inp} />
            </div>

            {/* GPS */}
            <div style={{ marginBottom: 12 }}>
              <button onClick={obtenerGPS} disabled={obteniendoGPS}
                style={{ background: gpsCoords ? C.greenDim : C.surfaceAlt, border: `1px solid ${gpsCoords ? C.green : C.border}`, borderRadius: 7, color: gpsCoords ? C.green : C.textMuted, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {obteniendoGPS ? '📡 Obteniendo...' : gpsCoords ? `📍 ${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}` : '📍 Capturar GPS'}
              </button>
            </div>

            {/* Foto del remito */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Foto del remito</label>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && subirFoto(e.target.files[0])} />
              <button onClick={() => fotoRef.current?.click()} disabled={subiendoFoto}
                style={{ background: fotoUrl ? C.greenDim : C.surfaceAlt, border: `1px solid ${fotoUrl ? C.green : C.border}`, borderRadius: 7, color: fotoUrl ? C.green : C.textMuted, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {subiendoFoto ? 'Subiendo...' : fotoUrl ? '📷 Foto tomada ✓' : '📷 Sacar foto del remito'}
              </button>
              {fotoUrl && <img src={fotoUrl} alt="Foto remito" style={{ marginTop: 6, maxWidth: 120, borderRadius: 6 }} />}
            </div>

            {/* Firma canvas */}
            <div style={{ marginBottom: 16 }}>
              <FirmaCanvas onFirma={setFirmaDataUrl} />
              {firmaDataUrl && <div style={{ marginTop: 3, fontSize: 11, color: C.green }}>✓ Firma capturada</div>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalCobro(null)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, padding: '10px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarCobro} disabled={guardando || !cobMonto}
                style={{ flex: 2, background: C.green, color: '#000', fontWeight: 800, border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 14 }}>
                {guardando ? '...' : '✓ Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Conversión a Factura X ── */}
      {modalConvertir && (
        <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>⚡ Convertir a Factura X</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
              {modalConvertir.presupuestos.length === 1 ? 'Este presupuesto será convertido:' : `Estos ${modalConvertir.presupuestos.length} presupuestos serán convertidos:`}
            </div>
            {modalConvertir.presupuestos.map(p => (
              <div key={p.id} style={{ background: C.surfaceAlt, borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                <strong>{p.cliente_nombre}</strong> · {money(p.total)}
              </div>
            ))}
            <div style={{ fontSize: 12, color: C.yellow, marginTop: 10, marginBottom: 16 }}>⚠️ El presupuesto pasará a ser Factura X (irreversible).</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => ejecutarAgregar(Array.from(selComp), false)} disabled={guardando}
                style={{ flex: 1, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, padding: '10px', cursor: 'pointer', fontSize: 13 }}>
                Agregar tal cual
              </button>
              <button onClick={() => ejecutarAgregar(Array.from(selComp), true)} disabled={guardando}
                style={{ flex: 1, background: C.accent, color: '#000', fontWeight: 800, border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? '...' : 'Convertir y agregar'}
              </button>
            </div>
            <button onClick={() => setModalConvertir(null)}
              style={{ width: '100%', marginTop: 8, background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13, padding: '6px' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Registrar egreso de compras ── */}
      {modalEgreso && (
        <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 380 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>💸 Registrar gasto de compra</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Concepto</label>
              <input value={egresoConcepto} onChange={e => setEgresoConcepto(e.target.value)} placeholder="Compra de materiales — proveedor X" style={inp} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Monto ($)</label>
              <input type="number" value={egresoMonto} onChange={e => setEgresoMonto(e.target.value)} placeholder="0" style={{ ...inp, fontSize: 18, fontWeight: 700 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalEgreso(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, padding: '10px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarEgreso} disabled={guardando || !egresoMonto}
                style={{ flex: 1, background: C.red, color: '#fff', fontWeight: 800, border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer' }}>
                {guardando ? '...' : 'Registrar egreso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
