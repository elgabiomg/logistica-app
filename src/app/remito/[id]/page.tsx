'use client'
import { useState, useEffect } from 'react'
import { use } from 'react'
import { getJornada, getEmpresa, type JornadaComprobante, type EmpresaConfig } from '@/lib/supabase'

const money = (n: number) => '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtFecha = (d: string) => { const p = d.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }

function RemitoDoc({ jc, empresa }: { jc: JornadaComprobante; empresa: EmpresaConfig }) {
  const comp = jc.comprobantes as any
  const cliente = comp?.clientes || {}
  const items = comp?.comprobante_items || []
  const prefijo = empresa.prefijo_remito || '0001'
  const numero = jc.remito_numero ? String(jc.remito_numero).padStart(8, '0') : '--------'
  const fechaDoc = jc.fecha_entrega_real ? fmtFecha(jc.fecha_entrega_real) : fmtFecha(new Date().toISOString())

  return (
    <div className="remito-doc">
      {/* Cabecera */}
      <div className="remito-header">
        <div className="remito-empresa">
          {empresa.logo_url && <img src={empresa.logo_url} alt="Logo" className="remito-logo" />}
          <div>
            <div className="remito-nombre">{empresa.nombre || 'El Obralista'}</div>
            {empresa.direccion && <div className="remito-dato">{empresa.direccion}{empresa.localidad ? `, ${empresa.localidad}` : ''}</div>}
            {empresa.cuit && <div className="remito-dato">CUIT: {empresa.cuit}</div>}
            {empresa.condicion_iva && <div className="remito-dato">{empresa.condicion_iva}</div>}
          </div>
        </div>
        <div className="remito-titulo-box">
          <div className="remito-titulo">REMITO</div>
          <div className="remito-numero">N° {prefijo}-{numero}</div>
          <div className="remito-fecha">Fecha: {fechaDoc}</div>
        </div>
      </div>

      {/* Datos del cliente */}
      <div className="remito-cliente">
        <div className="remito-fila"><span className="remito-label">Cliente:</span> <strong>{comp?.cliente_nombre || cliente?.nombre || '—'}</strong></div>
        {(cliente?.direccion || comp?.cliente_direccion) && (
          <div className="remito-fila"><span className="remito-label">Dirección:</span> {cliente.direccion || comp.cliente_direccion}</div>
        )}
        {(cliente?.localidad) && (
          <div className="remito-fila"><span className="remito-label">Localidad:</span> {cliente.localidad}</div>
        )}
        {(cliente?.cuit || cliente?.dni) && (
          <div className="remito-fila"><span className="remito-label">{cliente.cuit ? 'CUIT' : 'DNI'}:</span> {cliente.cuit || cliente.dni}</div>
        )}
        {(cliente?.telefono) && (
          <div className="remito-fila"><span className="remito-label">Tel:</span> {cliente.telefono}</div>
        )}
      </div>

      {/* Tabla de ítems */}
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
          {items.map((it: any, i: number) => (
            <tr key={i}>
              <td className="col-cant center">{it.cantidad}</td>
              <td className="col-ud center">{it.materiales?.unidad || ''}</td>
              <td className="col-det">{it.detalle}</td>
              <td className="col-precio right">{money(it.precio_unitario)}</td>
              <td className="col-total right">{money(it.importe)}</td>
            </tr>
          ))}
          {/* Filas vacías para completar */}
          {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, i) => (
            <tr key={`e${i}`} className="row-empty"><td></td><td></td><td></td><td></td><td></td></tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div className="remito-totales">
        {comp?.descuento > 0 && <div className="remito-total-fila"><span>Subtotal</span><span>{money(comp.subtotal)}</span></div>}
        {comp?.descuento > 0 && <div className="remito-total-fila"><span>Descuento</span><span>- {money(comp.descuento)}</span></div>}
        {comp?.recargo > 0 && <div className="remito-total-fila"><span>Recargo</span><span>+ {money(comp.recargo)}</span></div>}
        <div className="remito-total-fila total"><span>TOTAL</span><span>{money(comp?.total || 0)}</span></div>
        {jc.monto_cobrado && (
          <div className="remito-total-fila cobrado">
            <span>Recibí conforme ({jc.medio_pago_cobro})</span>
            <span>{money(jc.monto_cobrado)}</span>
          </div>
        )}
      </div>

      {/* Observaciones */}
      {(comp?.observaciones || jc.obs_entrega) && (
        <div className="remito-obs">
          <strong>Obs.:</strong> {jc.obs_entrega || comp.observaciones}
        </div>
      )}

      {/* Firma recibí */}
      <div className="remito-firmas">
        <div className="remito-firma-box">
          {jc.firma_url
            ? <img src={jc.firma_url} alt="Firma" className="remito-firma-img" />
            : <div className="remito-firma-linea" />}
          <div className="remito-firma-label">Firma y aclaración receptor</div>
          {jc.nombre_receptor && <div className="remito-firma-nombre">{jc.nombre_receptor}{jc.dni_receptor ? ` · DNI ${jc.dni_receptor}` : ''}</div>}
        </div>
        <div className="remito-firma-box">
          <div className="remito-firma-linea" />
          <div className="remito-firma-label">Firma transportista</div>
        </div>
      </div>

      {/* GPS */}
      {jc.gps_lat && jc.gps_lng && (
        <div className="remito-gps">
          📍 Entregado en {jc.gps_lat.toFixed(5)}, {jc.gps_lng.toFixed(5)}
        </div>
      )}
    </div>
  )
}

export default function RemitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [jc, setJc] = useState<JornadaComprobante | null>(null)
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // id puede ser jornada_comprobante id (UUID) o "jornada_id:comprobante_id"
    const cargar = async () => {
      try {
        const emp = await getEmpresa()
        setEmpresa(emp)

        // El id en la URL es el UUID del jornada_comprobante o "jornadaId_comprobanteId"
        // Buscamos en todas las jornadas recientes
        const { supabase } = await import('@/lib/supabase')
        const { data, error: err } = await (supabase as any)
          .from('jornada_comprobantes')
          .select('*, comprobantes(*, comprobante_items(*, materiales(unidad, proveedores(nombre))), clientes(*))')
          .eq('id', id)
          .single()
        if (err) throw err
        setJc(data as JornadaComprobante)
      } catch (e: any) {
        setError(e.message || 'No se encontró el remito')
      }
    }
    cargar()
  }, [id])

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#EF4444' }}>
      Error: {error}
    </div>
  )
  if (!jc || !empresa) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando remito...</div>
  )

  const comp = jc.comprobantes as any
  const prefijo = empresa.prefijo_remito || '0001'
  const numero = jc.remito_numero ? String(jc.remito_numero).padStart(8, '0') : '--------'
  const whatsappTxt = `Remito N° ${prefijo}-${numero} — ${comp?.cliente_nombre || 'Cliente'} — ${new Date().toLocaleDateString('es-AR')}`
  const waUrl = empresa.whatsapp
    ? `https://wa.me/${empresa.whatsapp}?text=${encodeURIComponent(whatsappTxt)}`
    : null

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f0f0; font-family: Arial, sans-serif; font-size: 11px; color: #000; }

        .no-print { background: #1A1D2E; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
        .no-print button { border: none; border-radius: 6px; padding: 8px 18px; cursor: pointer; font-size: 13px; font-weight: 700; }
        .btn-print { background: #F5A623; color: #000; }
        .btn-back { background: transparent; border: 1px solid #444 !important; color: #aaa; }
        .btn-wa { background: #22C55E; color: #fff; }

        .pagina {
          width: 210mm;
          margin: 16px auto;
          background: #fff;
        }

        .remito-doc {
          width: 210mm;
          min-height: 148mm;
          padding: 10mm 12mm 8mm;
          border-bottom: 2px dashed #999;
          page-break-inside: avoid;
        }
        .remito-doc:last-child { border-bottom: none; }

        .corte-label {
          text-align: center;
          font-size: 9px;
          color: #999;
          padding: 2mm 0;
        }

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
        .col-cant { width: 40px; } .col-ud { width: 30px; } .col-det { } .col-precio { width: 70px; } .col-total { width: 75px; }
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

      {/* Barra de acciones */}
      <div className="no-print">
        <button className="btn-back" onClick={() => window.history.back()}>← Volver</button>
        <button className="btn-print" onClick={() => window.print()}>🖨️ Imprimir</button>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            <button className="btn-wa">📱 WhatsApp</button>
          </a>
        )}
        <span style={{ marginLeft: 'auto', color: '#aaa', fontSize: 12 }}>
          Remito N° {prefijo}-{numero}
        </span>
      </div>

      {/* Hoja A4 con 2 copias A5 */}
      <div className="pagina">
        <RemitoDoc jc={jc} empresa={empresa} />
        <div className="corte-label no-print">✂ ── ── ── ── cortar ── ── ── ── ✂</div>
        <RemitoDoc jc={jc} empresa={empresa} />
      </div>
    </>
  )
}
