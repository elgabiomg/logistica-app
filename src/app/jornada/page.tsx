'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getJornadas, getJornada, createJornada, updateJornada,
  agregarComprobantesAJornada, quitarComprobanteDeJornada,
  reordenarJornada, updateJornadaComprobante, registrarCobroJornada,
  generarRemitoNumero, convertirPresupuestoAFacturaX,
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

// ── Componente canvas de firma ──────────────────────────────────────────────
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
    const ctx = canvas.getContext('2d')!
    const p = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(p.x, p.y)
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
    hasFirma.current = false
    onFirma(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Firma del receptor</label>
        <button onClick={limpiar} style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 11 }}>Limpiar</button>
      </div>
      <canvas
        ref={ref} width={340} height={100}
        onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
        style={{ width: '100%', height: 100, background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}`, cursor: 'crosshair', touchAction: 'none', display: 'block' }}
      />
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>Dibujá la firma con el dedo o el mouse</div>
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

  const [comprobantesDisp, setComprobantesDisp] = useState<Comprobante[]>([])
  const [selComp, setSelComp] = useState<Set<string>>(new Set())
  const [fechaNueva, setFechaNueva] = useState(new Date().toISOString().slice(0, 10))
  const [creandoJornada, setCreandoJornada] = useState(false)

  // Modal cobro/entrega
  const [modalCobro, setModalCobro] = useState<JornadaComprobante | null>(null)
  const [cobMonto, setCobMonto] = useState('')
  const [cobMedio, setCobMedio] = useState('efectivo')
  const [cobNombreReceptor, setCobNombreReceptor] = useState('')
  const [cobDni, setCobDni] = useState('')
  const [cobObs, setCobObs] = useState('')
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [obteniendoGPS, setObteniendoGPS] = useState(false)

  // Modal conversión a Factura X
  const [modalConvertir, setModalConvertir] = useState<{ presupuestos: Comprobante[]; resto: string[] } | null>(null)
  const [convirtiendo, setConvirtiendo] = useState(false)

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
        setOrden((detalle.jornada_comprobantes || [])
          .sort((a, b) => a.orden - b.orden).map(jc => jc.comprobante_id))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  const abrirJornada = async (j: Jornada) => {
    const detalle = await getJornada(j.id)
    setJornadaActiva(detalle)
    setOrden((detalle.jornada_comprobantes || [])
      .sort((a, b) => a.orden - b.orden).map(jc => jc.comprobante_id))
    setPaso('planificar')
  }

  const abrirPlanificar = async () => {
    const todos = await getComprobantes(undefined, 200)
    const enJornada = new Set((jornadaActiva?.jornada_comprobantes || []).map(jc => jc.comprobante_id))
    setComprobantesDisp(todos.filter(c =>
      (c.tipo === 'presupuesto' || c.tipo === 'factura_x') && !enJornada.has(c.id)
    ).slice(0, 100))
    setSelComp(new Set())
  }

  const crearNuevaJornada = async () => {
    setGuardando(true)
    try {
      const j = await createJornada(fechaNueva)
      const detalle = await getJornada(j.id)
      setJornadaActiva(detalle)
      setJornadas(prev => [detalle, ...prev])
      setCreandoJornada(false)
      setPaso('planificar')
    } finally { setGuardando(false) }
  }

  // Agregar comprobantes: si hay presupuestos, preguntar si convertir a Factura X
  const iniciarAgregarSeleccionados = async () => {
    if (!jornadaActiva || !selComp.size) return
    const selArr = Array.from(selComp)
    const presupuestos = comprobantesDisp.filter(c => selArr.includes(c.id) && c.tipo === 'presupuesto')
    const resto = selArr.filter(id => !presupuestos.find(p => p.id === id))
    if (presupuestos.length > 0) {
      setModalConvertir({ presupuestos, resto })
    } else {
      await ejecutarAgregar(selArr, false)
    }
  }

  const ejecutarAgregar = async (ids: string[], convertir: boolean) => {
    if (!jornadaActiva) return
    setGuardando(true)
    try {
      let idsFinales = ids
      if (convertir && modalConvertir) {
        const convertidos = await Promise.all(
          modalConvertir.presupuestos.map(p => convertirPresupuestoAFacturaX(p.id))
        )
        idsFinales = [...modalConvertir.resto, ...convertidos.map(c => c.id)]
      }
      await agregarComprobantesAJornada(jornadaActiva.id, idsFinales)
      const detalle = await getJornada(jornadaActiva.id)
      setJornadaActiva(detalle)
      setOrden((detalle.jornada_comprobantes || [])
        .sort((a, b) => a.orden - b.orden).map(jc => jc.comprobante_id))
      setSelComp(new Set())
      setModalConvertir(null)
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

  const moverOrden = async (comprobanteId: string, dir: -1 | 1) => {
    const idx = orden.indexOf(comprobanteId)
    if (idx < 0) return
    const nuevo = [...orden]
    const swap = idx + dir
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
    setCobNombreReceptor(jc.nombre_receptor || '')
    setCobDni(jc.dni_receptor || '')
    setCobObs(jc.obs_entrega || '')
    setFirmaDataUrl(null)
    setGpsCoords(null)
  }

  const obtenerGPS = () => {
    setObteniendoGPS(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setObteniendoGPS(false) },
      () => { alert('No se pudo obtener la ubicación'); setObteniendoGPS(false) },
      { timeout: 10000 }
    )
  }

  const guardarCobro = async () => {
    if (!jornadaActiva || !modalCobro) return
    setGuardando(true)
    try {
      const comp = modalCobro.comprobantes as any
      const nombre = comp?.cliente_nombre || 'Cliente'

      // Subir firma si hay
      let firma_url: string | null = modalCobro.firma_url || null
      if (firmaDataUrl) {
        const blob = await fetch(firmaDataUrl).then(r => r.blob())
        const path = `firmas/${jornadaActiva.id}/${modalCobro.comprobante_id}.png`
        const { error: uploadErr } = await (supabase as any).storage.from('empresa').upload(path, blob, { upsert: true, contentType: 'image/png' })
        if (!uploadErr) {
          const { data: urlData } = (supabase as any).storage.from('empresa').getPublicUrl(path)
          firma_url = urlData?.publicUrl || null
        }
      }

      // Registrar cobro
      await registrarCobroJornada(jornadaActiva.id, modalCobro.comprobante_id, Number(cobMonto), cobMedio, nombre)

      // Guardar datos de entrega
      await updateJornadaComprobante(jornadaActiva.id, modalCobro.comprobante_id, {
        entregado: true,
        fecha_entrega_real: new Date().toISOString(),
        gps_lat: gpsCoords?.lat ?? null,
        gps_lng: gpsCoords?.lng ?? null,
        nombre_receptor: cobNombreReceptor || null,
        dni_receptor: cobDni || null,
        obs_entrega: cobObs || null,
        firma_url,
      })

      // Generar número de remito
      await generarRemitoNumero(jornadaActiva.id, modalCobro.comprobante_id)

      const detalle = await getJornada(jornadaActiva.id)
      setJornadaActiva(detalle)
      setModalCobro(null)
    } finally { setGuardando(false) }
  }

  const cerrarJornada = async () => {
    if (!jornadaActiva) return
    setGuardando(true)
    try {
      await updateJornada(jornadaActiva.id, { estado: 'cerrada' })
      await cargarDatos()
      setJornadaActiva(null)
      setPaso('planificar')
    } finally { setGuardando(false) }
  }

  const jcs = (jornadaActiva?.jornada_comprobantes || [])
    .sort((a, b) => a.orden - b.orden)
  const jcsPorId = new Map(jcs.map(jc => [jc.comprobante_id, jc]))

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
      Cargando...
    </div>
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
            Jornada {fmtFecha(jornadaActiva.fecha)} · {jcs.length} parada{jcs.length !== 1 ? 's' : ''}
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
              <div style={{ textAlign: 'center', color: C.textMuted, padding: '40px 0' }}>
                No hay jornadas. Creá una para empezar.
              </div>
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
                      <span style={{ fontSize: 11, fontWeight: 700, color: estadoColor, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {j.estado}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── Jornada abierta ── */
          <div>
            <button onClick={() => setJornadaActiva(null)}
              style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13, marginBottom: 12, padding: 0 }}>
              ← Todas las jornadas
            </button>

            {/* Barra de pasos */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.surface, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
              {PASOS.map(p => (
                <button key={p.id} onClick={() => { setPaso(p.id); if (p.id === 'planificar') abrirPlanificar() }}
                  style={{
                    flex: 1, border: 'none', borderRadius: 7, padding: '8px 4px', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: paso === p.id ? C.accent : 'transparent',
                    color: paso === p.id ? '#000' : C.textMuted,
                  }}>
                  <div style={{ fontSize: 16 }}>{p.icon}</div>
                  <div>{p.label}</div>
                </button>
              ))}
            </div>

            {/* ── PLANIFICAR ── */}
            {paso === 'planificar' && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                  Pedidos en la jornada ({jcs.length})
                </div>
                {jcs.length === 0 && (
                  <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>
                    Todavía no hay pedidos. Agregá abajo.
                  </div>
                )}
                {jcs.map(jc => {
                  const comp = jc.comprobantes as any
                  return (
                    <div key={jc.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{comp?.cliente_nombre || '—'}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          {comp?.tipo?.toUpperCase()} N° {String(comp?.numero || '').padStart(8, '0')} · {money(comp?.total || 0)}
                        </div>
                        {comp?.clientes?.telefono && (
                          <div style={{ fontSize: 11, color: C.textMuted }}>📞 {comp.clientes.telefono}</div>
                        )}
                      </div>
                      <button onClick={() => quitarComprobante(jc.comprobante_id)}
                        style={{ background: C.redDim, border: `1px solid ${C.red}30`, color: C.red, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                        Quitar
                      </button>
                    </div>
                  )
                })}

                {/* Agregar comprobantes */}
                <div style={{ marginTop: 16, background: C.surfaceAlt, borderRadius: 10, padding: 14, border: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Agregar comprobantes</div>
                  {comprobantesDisp.length === 0 ? (
                    <div style={{ color: C.textMuted, fontSize: 12 }}>No hay comprobantes disponibles para agregar.</div>
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
                              <div style={{ fontSize: 11, color: C.textMuted }}>
                                {c.tipo?.toUpperCase()} N° {String(c.numero).padStart(8, '0')} · {money(c.total)}
                              </div>
                            </div>
                            {c.tipo === 'presupuesto' && (
                              <span style={{ fontSize: 10, background: C.yellowDim, color: C.yellow, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
                                PRESUP.
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                      {selComp.size > 0 && (
                        <button onClick={iniciarAgregarSeleccionados} disabled={guardando}
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
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Lista de compras</div>
                {jcs.length === 0 ? (
                  <div style={{ color: C.textMuted }}>Primero agregá pedidos en el paso Planificar.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(() => {
                      const porProv: Record<string, { proveedor: string; items: any[] }> = {}
                      jcs.forEach(jc => {
                        const comp = jc.comprobantes as any
                        ;(comp?.comprobante_items || []).forEach((it: any) => {
                          const prov = it.materiales?.proveedores?.nombre || 'Sin proveedor'
                          if (!porProv[prov]) porProv[prov] = { proveedor: prov, items: [] }
                          const existing = porProv[prov].items.find((x: any) => x.detalle === it.detalle)
                          if (existing) { existing.cantidad += Number(it.cantidad) }
                          else porProv[prov].items.push({ detalle: it.detalle, cantidad: Number(it.cantidad), unidad: it.materiales?.unidad || '' })
                        })
                      })
                      return Object.values(porProv).map(g => (
                        <div key={g.proveedor} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                          <div style={{ padding: '10px 14px', background: C.surfaceAlt, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                            🏪 {g.proveedor}
                          </div>
                          {g.items.map((it, i) => {
                            const jcWithIt = jcs.find(jc => (jc.comprobantes as any)?.comprobante_items?.some((x: any) => x.detalle === it.detalle))
                            const comprado = jcWithIt?.comprado || false
                            return (
                              <div key={i} style={{ padding: '10px 14px', borderBottom: i < g.items.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" checked={comprado} onChange={e => jcWithIt && toggleCheck(jcWithIt.comprobante_id, 'comprado', e.target.checked)} style={{ width: 18, height: 18 }} />
                                <div style={{ flex: 1, textDecoration: comprado ? 'line-through' : 'none', color: comprado ? C.textMuted : C.text }}>
                                  <span style={{ fontWeight: 600 }}>{it.cantidad} {it.unidad}</span> · {it.detalle}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))
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
                      <div style={{ paddingLeft: 30, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Hoja de ruta</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
                  Usá las flechas para reordenar. Registrá entrega y cobro en cada parada.
                </div>

                {orden.map((compId, idx) => {
                  const jc = jcsPorId.get(compId)
                  if (!jc) return null
                  const comp = jc.comprobantes as any
                  return (
                    <div key={compId} style={{
                      background: C.surface,
                      border: `1px solid ${jc.entregado ? C.green : C.border}`,
                      borderRadius: 10, padding: '12px 14px', marginBottom: 10
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ background: C.accent, color: '#000', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>{comp?.cliente_nombre || '—'}</div>
                          {comp?.clientes?.direccion && <div style={{ fontSize: 11, color: C.textMuted }}>📍 {comp.clientes.direccion}</div>}
                          {comp?.clientes?.telefono && <div style={{ fontSize: 11, color: C.textMuted }}>📞 {comp.clientes.telefono}</div>}
                          <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginTop: 4 }}>
                            {money(comp?.total || 0)} · {comp?.condicion_pago || ''}
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
                        {(comp?.comprobante_items || []).length > 4 && (
                          <div style={{ fontSize: 11, color: C.textMuted }}>+ {(comp?.comprobante_items || []).length - 4} más</div>
                        )}
                      </div>

                      <div style={{ paddingLeft: 32, marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {jc.entregado ? (
                          <>
                            <div style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>
                              ✓ Entregado
                              {jc.monto_cobrado && ` · ${money(jc.monto_cobrado)} (${jc.medio_pago_cobro})`}
                            </div>
                            {jc.remito_numero && (
                              <a href={`/remito/${jc.id}`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: C.blue, fontWeight: 700, textDecoration: 'none', marginLeft: 8 }}>
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
                  let totalCobrado = 0; let entregados = 0; let noEntregados = 0
                  jcs.forEach(jc => {
                    if (jc.entregado) {
                      entregados++
                      if (jc.monto_cobrado) {
                        const mp = jc.medio_pago_cobro || 'efectivo'
                        totales[mp] = (totales[mp] || 0) + Number(jc.monto_cobrado)
                        totalCobrado += Number(jc.monto_cobrado)
                      }
                    } else { noEntregados++ }
                  })
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                        <div style={{ background: C.greenDim, border: `1px solid ${C.green}40`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: C.green }}>{entregados}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>Entregados</div>
                        </div>
                        <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: C.yellow }}>{noEntregados}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>No entregados</div>
                        </div>
                        <div style={{ background: C.accentDim, border: `1px solid ${C.accent}40`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>{money(totalCobrado)}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>Total cobrado</div>
                        </div>
                      </div>

                      {Object.entries(totales).length > 0 && (
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                          <div style={{ padding: '10px 14px', background: C.surfaceAlt, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                            Por medio de pago
                          </div>
                          {Object.entries(totales).map(([mp, monto]) => (
                            <div key={mp} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
                              <span style={{ textTransform: 'capitalize', color: C.textMuted }}>{mp}</span>
                              <span style={{ fontWeight: 700, color: C.text }}>{money(monto)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Remitos de la jornada */}
                      {jcs.some(jc => jc.remito_numero) && (
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                          <div style={{ padding: '10px 14px', background: C.surfaceAlt, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                            Remitos generados
                          </div>
                          {jcs.filter(jc => jc.remito_numero).map(jc => {
                            const comp = jc.comprobantes as any
                            return (
                              <div key={jc.id} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: 13 }}>{comp?.cliente_nombre}</span>
                                <a href={`/remito/${jc.id}`} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: 12, color: C.blue, textDecoration: 'none', fontWeight: 700 }}>
                                  🖨️ Remito {String(jc.remito_numero).padStart(4, '0')}
                                </a>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )
                })()}

                {jcs.filter(jc => !jc.entregado).length > 0 && (
                  <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.yellow, marginBottom: 8 }}>⚠️ No entregados — vuelven a pendientes</div>
                    {jcs.filter(jc => !jc.entregado).map(jc => {
                      const comp = jc.comprobantes as any
                      return (
                        <div key={jc.id} style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>
                          · {comp?.cliente_nombre} — {money(comp?.total || 0)}
                        </div>
                      )
                    })}
                  </div>
                )}

                <button onClick={cerrarJornada} disabled={guardando}
                  style={{ background: C.green, color: '#000', fontWeight: 800, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', fontSize: 15, width: '100%' }}>
                  {guardando ? '...' : '✅ Cerrar jornada'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Registrar entrega y cobro ── */}
      {modalCobro && (
        <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 999, padding: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px 14px 0 0', padding: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>Registrar entrega y cobro</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
              {(modalCobro.comprobantes as any)?.cliente_nombre}
            </div>

            {/* Monto */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Monto cobrado</label>
              <input type="number" value={cobMonto} onChange={e => setCobMonto(e.target.value)}
                style={{ width: '100%', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: '10px 12px', fontSize: 18, fontWeight: 700, boxSizing: 'border-box' }} />
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
                <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Nombre receptor</label>
                <input value={cobNombreReceptor} onChange={e => setCobNombreReceptor(e.target.value)} placeholder="Opcional"
                  style={{ width: '100%', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>DNI</label>
                <input value={cobDni} onChange={e => setCobDni(e.target.value)} placeholder="Opcional"
                  style={{ width: '100%', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Observaciones */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Observaciones</label>
              <input value={cobObs} onChange={e => setCobObs(e.target.value)} placeholder="Opcional"
                style={{ width: '100%', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {/* GPS */}
            <div style={{ marginBottom: 12 }}>
              <button onClick={obtenerGPS} disabled={obteniendoGPS}
                style={{ background: gpsCoords ? C.greenDim : C.surfaceAlt, border: `1px solid ${gpsCoords ? C.green : C.border}`, borderRadius: 7, color: gpsCoords ? C.green : C.textMuted, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {obteniendoGPS ? '📡 Obteniendo...' : gpsCoords ? `📍 ${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}` : '📍 Capturar ubicación GPS'}
              </button>
            </div>

            {/* Firma */}
            <div style={{ marginBottom: 16 }}>
              <FirmaCanvas onFirma={setFirmaDataUrl} />
              {firmaDataUrl && (
                <div style={{ marginTop: 4, fontSize: 11, color: C.green }}>✓ Firma capturada</div>
              )}
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

      {/* ── Modal: Convertir presupuestos a Factura X ── */}
      {modalConvertir && (
        <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>⚡ Convertir a Factura X</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
              {modalConvertir.presupuestos.length === 1
                ? 'El siguiente presupuesto será convertido a Factura X:'
                : `Los siguientes ${modalConvertir.presupuestos.length} presupuestos serán convertidos a Factura X:`}
            </div>
            {modalConvertir.presupuestos.map(p => (
              <div key={p.id} style={{ background: C.surfaceAlt, borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                <strong>{p.cliente_nombre}</strong> · {money(p.total)}
              </div>
            ))}
            <div style={{ fontSize: 12, color: C.yellow, marginTop: 12, marginBottom: 16 }}>
              ⚠️ Esta acción es irreversible desde aquí. El presupuesto pasará a ser Factura X.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => ejecutarAgregar(Array.from(selComp), false)} disabled={guardando}
                style={{ flex: 1, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, padding: '10px', cursor: 'pointer', fontSize: 13 }}>
                Agregar como presupuesto
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
    </div>
  )
}
