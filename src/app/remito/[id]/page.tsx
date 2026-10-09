'use client'
import { useState, useEffect } from 'react'
import { use } from 'react'
import { supabase, getEmpresa, type EmpresaConfig } from '@/lib/supabase'

const money = (n: number) => '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtFecha = (d: string) => { const p = d.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }

// Datos que vienen del snapshot (inmutables) o del live join (fallback)
interface RemitoData {
  remito_numero: number
  prefijo_remito: string
  fecha_entrega: string | null
  empresa_nombre: string | null
  empresa_cuit: string | null
  empresa_direccion: string | null
  empresa_localidad: string | null
  empresa_telefono: string | null
  empresa_logo_url: string | null
  empresa_logo_url_bw: string | null
  empresa_condicion_iva: string | null
  cliente_nombre: string | null
  cliente_direccion: string | null
  cliente_localidad: string | null
  cliente_telefono: string | null
  cliente_cuit: string | null
  condicion_pago: string | null
  comp_tipo: string | null
  comp_numero: number | null
  items: Array<{ detalle: string; cantidad: number; unidad: string; precio_unitario: number; importe: number }>
  subtotal: number; descuento: number; recargo: number; total: number
  monto_cobrado: number | null; medio_pago_cobro: string | null
  nombre_receptor: string | null; dni_receptor: string | null
  obs_entrega: string | null; firma_url: string | null; foto_remito_url: string | null
  gps_lat: number | null; gps_lng: number | null
  fromSnapshot: boolean
}

function RemitoDoc({ d }: { d: RemitoData }) {
  const numero = String(d.remito_numero).padStart(8, '0')
  const fechaDoc = d.fecha_entrega ? fmtFecha(d.fecha_entrega) : fmtFecha(new Date().toISOString())

  return (
    <div className="remito-doc">
      <div className="remito-header">
        <div className="remito-empresa">
          {(d.empresa_logo_url_bw || d.empresa_logo_url) && <img src={d.empresa_logo_url_bw || d.empresa_logo_url!} alt="Logo" className="remito-logo" />}
          <div>
            <div className="remito-nombre">{d.empresa_nombre || 'El Obralista'}</div>
            {d.empresa_direccion && <div className="remito-dato">{d.empresa_direccion}{d.empresa_localidad ? `, ${d.empresa_localidad}` : ''}</div>}
            {d.empresa_cuit && <div className="remito-dato">CUIT: {d.empresa_cuit}</div>}
            {d.empresa_condicion_iva && <div className="remito-dato">{d.empresa_condicion_iva}</div>}
          </div>
        </div>
        <div className="remito-titulo-box">
          <div className="remito-titulo">REMITO</div>
          <div className="remito-numero">N° {d.prefijo_remito}-{numero}</div>
          <div className="remito-fecha">Fecha: {fechaDoc}</div>
          {!d.fromSnapshot && <div style={{ fontSize: 8, color: '#e88', marginTop: 3 }}>⚠ datos en vivo</div>}
        </div>
      </div>

      <div className="remito-cliente">
        <div className="remito-fila"><span className="remito-label">Cliente:</span> <strong>{d.cliente_nombre || '—'}</strong></div>
        {d.cliente_direccion && <div className="remito-fila"><span className="remito-label">Dirección:</span> {d.cliente_direccion}</div>}
        {d.cliente_localidad && <div className="remito-fila"><span className="remito-label">Localidad:</span> {d.cliente_localidad}</div>}
        {(d.cliente_cuit) && <div className="remito-fila"><span className="remito-label">CUIT:</span> {d.cliente_cuit}</div>}
        {d.cliente_telefono && <div className="remito-fila"><span className="remito-label">Tel:</span> {d.cliente_telefono}</div>}
      </div>

      <table className="remito-tabla">
        <thead>
          <tr>
            <th className="col-cant">Cant.</th>
            <th className="col-ud">U.</th>
            <th className="col-det">Descripción</th>
            <th className="col-precio">P.Unit.</th>
            <th className="col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((it, i) => (
            <tr key={i}>
              <td className="col-cant center">{it.cantidad}</td>
              <td className="col-ud center">{it.unidad}</td>
              <td className="col-det">{it.detalle}</td>
              <td className="col-precio right">{money(it.precio_unitario)}</td>
              <td className="col-total right">{money(it.importe)}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 8 - d.items.length) }).map((_, i) => (
            <tr key={`e${i}`} className="row-empty"><td></td><td></td><td></td><td></td><td></td></tr>
          ))}
        </tbody>
      </table>

      <div className="remito-totales">
        {d.descuento > 0 && <div className="remito-total-fila"><span>Subtotal</span><span>{money(d.subtotal)}</span></div>}
        {d.descuento > 0 && <div className="remito-total-fila"><span>Descuento</span><span>- {money(d.descuento)}</span></div>}
        {d.recargo > 0 && <div className="remito-total-fila"><span>Recargo</span><span>+ {money(d.recargo)}</span></div>}
        <div className="remito-total-fila total"><span>TOTAL</span><span>{money(d.total)}</span></div>
        {d.monto_cobrado != null && (
          <div className="remito-total-fila cobrado">
            <span>Recibí conforme{d.medio_pago_cobro ? ` (${d.medio_pago_cobro})` : ''}</span>
            <span>{money(d.monto_cobrado)}</span>
          </div>
        )}
      </div>

      {(d.obs_entrega) && (
        <div className="remito-obs"><strong>Obs.:</strong> {d.obs_entrega}</div>
      )}

      <div className="remito-firmas">
        <div className="remito-firma-box">
          {d.firma_url
            ? <img src={d.firma_url} alt="Firma" className="remito-firma-img" />
            : <div className="remito-firma-linea" />}
          <div className="remito-firma-label">Firma y aclaración receptor</div>
          {d.nombre_receptor && (
            <div className="remito-firma-nombre">{d.nombre_receptor}{d.dni_receptor ? ` · DNI ${d.dni_receptor}` : ''}</div>
          )}
        </div>
        <div className="remito-firma-box">
          <div className="remito-firma-linea" />
          <div className="remito-firma-label">Firma transportista</div>
        </div>
      </div>

      {d.gps_lat && d.gps_lng && (
        <div className="remito-gps">📍 {d.gps_lat.toFixed(5)}, {d.gps_lng.toFixed(5)}</div>
      )}
    </div>
  )
}

export default function RemitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<RemitoData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cargar = async () => {
      try {
        // 1) Intentar snapshot (datos inmutables)
        const { data: snap } = await (supabase as any)
          .from('remito_snapshots')
          .select('*')
          .eq('jornada_comprobante_id', id)
          .single()

        if (snap) {
          setData({ ...snap, fromSnapshot: true })
          return
        }

        // 2) Fallback: leer live de jornada_comprobantes
        const { data: jc, error: err } = await (supabase as any)
          .from('jornada_comprobantes')
          .select('*, comprobantes(*, comprobante_items(*, materiales(unidad)), clientes(*))')
          .eq('id', id)
          .single()
        if (err) throw err

        const [emp] = await Promise.all([getEmpresa()])
        const comp = jc.comprobantes
        const cliente = comp?.clientes || {}
        setData({
          remito_numero: jc.remito_numero || 0,
          prefijo_remito: emp.prefijo_remito || '0001',
          fecha_entrega: jc.fecha_entrega_real,
          empresa_nombre: emp.nombre, empresa_cuit: emp.cuit,
          empresa_direccion: emp.direccion, empresa_localidad: emp.localidad,
          empresa_telefono: emp.telefono, empresa_logo_url: emp.logo_url, empresa_logo_url_bw: emp.logo_url_bw || null,
          empresa_condicion_iva: emp.condicion_iva,
          cliente_nombre: comp?.cliente_nombre, cliente_cuit: cliente.cuit,
          cliente_direccion: cliente.direccion, cliente_localidad: cliente.localidad,
          cliente_telefono: cliente.telefono,
          condicion_pago: comp?.condicion_pago, comp_tipo: comp?.tipo, comp_numero: comp?.numero,
          items: (comp?.comprobante_items || []).map((it: any) => ({
            detalle: it.detalle, cantidad: Number(it.cantidad),
            unidad: it.materiales?.unidad || '',
            precio_unitario: Number(it.precio_unitario), importe: Number(it.importe),
          })),
          subtotal: Number(comp?.subtotal || 0), descuento: Number(comp?.descuento || 0),
          recargo: Number(comp?.recargo || 0), total: Number(comp?.total || 0),
          monto_cobrado: jc.monto_cobrado, medio_pago_cobro: jc.medio_pago_cobro,
          nombre_receptor: jc.nombre_receptor, dni_receptor: jc.dni_receptor,
          obs_entrega: jc.obs_entrega, firma_url: jc.firma_url,
          foto_remito_url: jc.foto_remito_url,
          gps_lat: jc.gps_lat, gps_lng: jc.gps_lng,
          fromSnapshot: false,
        })
      } catch (e: any) {
        setError(e.message || 'No se encontró el remito')
      }
    }
    cargar()
  }, [id])

  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#EF4444' }}>Error: {error}</div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando remito...</div>

  const waUrl = data.empresa_telefono
    ? `https://wa.me/${data.empresa_telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Remito N° ${data.prefijo_remito}-${String(data.remito_numero).padStart(8,'0')} — ${data.cliente_nombre}`)}`
    : null

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f0f0; font-family: Arial, sans-serif; font-size: 11px; color: #000; }
        .no-print { background: #1A1D2E; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
        .no-print button, .no-print a button { border: none; border-radius: 6px; padding: 8px 18px; cursor: pointer; font-size: 13px; font-weight: 700; }
        .btn-print { background: #F5A623; color: #000; }
        .btn-back { background: transparent; border: 1px solid #444 !important; color: #aaa; }
        .btn-wa { background: #22C55E; color: #fff; }
        .snap-badge { font-size: 11px; color: #22C55E; margin-left: 8px; }
        .pagina { width: 210mm; margin: 16px auto; background: #fff; }
        .remito-doc { width: 210mm; min-height: 148mm; padding: 10mm 12mm 8mm; border-bottom: 2px dashed #999; page-break-inside: avoid; }
        .remito-doc:last-child { border-bottom: none; }
        .corte-label { text-align: center; font-size: 9px; color: #999; padding: 2mm 0; }
        .remito-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6mm; }
        .remito-empresa { display: flex; gap: 8px; align-items: flex-start; }
        .remito-logo { width: 50px; height: 50px; object-fit: contain; }
        .remito-nombre { font-size: 14px; font-weight: bold; }
        .remito-dato { font-size: 9px; color: #555; }
        .remito-titulo-box { text-align: right; border: 2px solid #000; padding: 6px 10px; border-radius: 4px; }
        .remito-titulo { font-size: 18px; font-weight: 900; letter-spacing: 2px; }
        .remito-numero { font-size: 13px; font-weight: bold; margin-top: 2px; }
        .remito-fecha { font-size: 10px; color: #555; margin-top: 2px; }
        .remito-cliente { border: 1px solid #ccc; border-radius: 4px; padding: 4px 8px; margin-bottom: 4mm; }
        .remito-fila { font-size: 10px; margin-bottom: 2px; }
        .remito-label { color: #666; }
        .remito-tabla { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
        .remito-tabla th { background: #333; color: #fff; padding: 3px 5px; font-size: 9px; text-align: left; }
        .remito-tabla td { padding: 3px 5px; border-bottom: 1px solid #eee; font-size: 10px; vertical-align: middle; }
        .remito-tabla tr.row-empty td { border-bottom: 1px dotted #ddd; height: 14px; }
        .col-cant { width: 40px; } .col-ud { width: 30px; } .col-precio { width: 70px; } .col-total { width: 75px; }
        .center { text-align: center; } .right { text-align: right; }
        .remito-totales { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; margin-bottom: 3mm; }
        .remito-total-fila { display: flex; gap: 20px; font-size: 10px; }
        .remito-total-fila.total { font-weight: 900; font-size: 13px; border-top: 2px solid #000; padding-top: 2px; }
        .remito-total-fila.cobrado { color: #16a34a; font-weight: 700; }
        .remito-obs { font-size: 9px; color: #555; margin-bottom: 3mm; border-top: 1px dashed #ccc; padding-top: 2mm; }
        .remito-firmas { display: flex; gap: 10mm; margin-top: 4mm; }
        .remito-firma-box { flex: 1; }
        .remito-firma-linea { border-bottom: 1px solid #000; margin-bottom: 3px; height: 20mm; }
        .remito-firma-img { max-width: 100%; max-height: 20mm; object-fit: contain; display: block; margin-bottom: 3px; }
        .remito-firma-label { font-size: 8px; color: #666; text-align: center; }
        .remito-firma-nombre { font-size: 9px; font-weight: bold; text-align: center; margin-top: 2px; }
        .remito-gps { font-size: 8px; color: #888; margin-top: 2mm; }
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          .pagina { margin: 0; width: 210mm; }
          .remito-doc { break-inside: avoid; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      <div className="no-print">
        <button className="btn-back" onClick={() => window.history.back()}>← Volver</button>
        <button className="btn-print" onClick={() => window.print()}>🖨️ Imprimir</button>
        {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer"><button className="btn-wa">📱 WhatsApp</button></a>}
        <span className="snap-badge">{data.fromSnapshot ? '✓ Snapshot guardado' : '⚠ Datos en vivo'}</span>
        <span style={{ marginLeft: 'auto', color: '#aaa', fontSize: 12 }}>
          Remito N° {data.prefijo_remito}-{String(data.remito_numero).padStart(8, '0')}
        </span>
      </div>

      <div className="pagina">
        <RemitoDoc d={data} />
        <div className="corte-label no-print">✂ ── ── ── cortar ── ── ── ✂</div>
        <RemitoDoc d={data} />
      </div>
    </>
  )
}
