'use client'
import { useState, useEffect } from 'react'
import { use } from 'react'
import { getJornada, getEmpresa, type Jornada, type JornadaComprobante, type EmpresaConfig } from '@/lib/supabase'

const money = (n: number) => '$ ' + Math.round(n).toLocaleString('es-AR')
const fmtFecha = (d: string) => { const p = (d || '').split('T')[0].split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }

export default function HojaRutaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)

  useEffect(() => {
    Promise.all([getJornada(id), getEmpresa()])
      .then(([j, e]) => { setJornada(j); setEmpresa(e) })
      .catch(err => alert('Error: ' + err.message))
  }, [id])

  if (!jornada || !empresa) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando...</div>
  )

  const jcs = (jornada.jornada_comprobantes || []).sort((a, b) => a.orden - b.orden)

  // Agrupar por zona
  const porZona: Record<string, JornadaComprobante[]> = {}
  jcs.forEach(jc => {
    const zona = (jc.comprobantes as any)?.clientes?.localidad || 'Sin zona'
    if (!porZona[zona]) porZona[zona] = []
    porZona[zona].push(jc)
  })

  const totalJornada = jcs.reduce((s, jc) => s + ((jc.comprobantes as any)?.total || 0), 0)

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f5f5; font-family: Arial, sans-serif; font-size: 11px; color: #000; }

        .no-print { background: #1A1D2E; padding: 10px 20px; display: flex; align-items: center; gap: 12px; }
        .no-print button { border: none; border-radius: 6px; padding: 8px 18px; cursor: pointer; font-size: 13px; font-weight: 700; }
        .btn-print { background: #F5A623; color: #000; }
        .btn-back { background: transparent; border: 1px solid #444 !important; color: #aaa; }

        .pagina { width: 210mm; margin: 16px auto; background: #fff; padding: 15mm 15mm 10mm; }

        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; border-bottom: 2px solid #000; padding-bottom: 5mm; }
        .empresa-nombre { font-size: 18px; font-weight: 900; }
        .empresa-dato { font-size: 9px; color: #555; }
        .hoja-titulo { text-align: right; }
        .hoja-titulo h1 { font-size: 22px; font-weight: 900; letter-spacing: 1px; }
        .hoja-titulo p { font-size: 11px; color: #555; margin-top: 3px; }

        .resumen { display: flex; gap: 10mm; margin-bottom: 6mm; }
        .resumen-item { border: 1px solid #ddd; border-radius: 4px; padding: 6px 12px; text-align: center; }
        .resumen-num { font-size: 20px; font-weight: 900; }
        .resumen-label { font-size: 9px; color: #666; }

        .zona-titulo { background: #1a1a1a; color: #fff; padding: 5px 10px; font-size: 12px; font-weight: 800; margin-top: 6mm; margin-bottom: 3mm; border-radius: 3px; }
        .zona-titulo:first-of-type { margin-top: 0; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
        th { background: #f0f0f0; padding: 5px 8px; font-size: 10px; text-align: left; border: 1px solid #ddd; }
        td { padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; font-size: 10px; }
        tr:nth-child(even) td { background: #fafafa; }
        .num { text-align: center; font-weight: 800; font-size: 13px; color: #F5A623; }
        .cliente-nombre { font-weight: 700; font-size: 11px; }
        .cliente-dir { color: #666; font-size: 9px; margin-top: 2px; }
        .monto { font-weight: 800; text-align: right; }
        .pago { font-size: 9px; color: #888; text-align: center; }
        .items-cell { font-size: 9px; color: #555; line-height: 1.4; }
        .firma-cell { width: 30mm; }
        .firma-linea { border-bottom: 1px solid #999; margin-top: 12mm; }

        .total-final { text-align: right; font-size: 14px; font-weight: 900; margin-top: 4mm; padding-top: 3mm; border-top: 2px solid #000; }

        .pie { margin-top: 8mm; padding-top: 4mm; border-top: 1px dashed #ccc; font-size: 9px; color: #888; text-align: center; }

        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          .pagina { margin: 0; padding: 10mm; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      <div className="no-print">
        <button className="btn-back" onClick={() => window.history.back()}>← Volver</button>
        <button className="btn-print" onClick={() => window.print()}>🖨️ Imprimir hoja de ruta</button>
        <span style={{ marginLeft: 'auto', color: '#aaa', fontSize: 12 }}>
          {jcs.length} paradas · {fmtFecha(jornada.fecha)}
        </span>
      </div>

      <div className="pagina">
        {/* Header */}
        <div className="header">
          <div>
            {empresa.logo_url && <img src={empresa.logo_url} alt="" style={{ height: 40, marginBottom: 4, display: 'block' }} />}
            <div className="empresa-nombre">{empresa.nombre || 'El Obralista'}</div>
            {empresa.telefono && <div className="empresa-dato">Tel: {empresa.telefono}</div>}
            {empresa.direccion && <div className="empresa-dato">{empresa.direccion}{empresa.localidad ? `, ${empresa.localidad}` : ''}</div>}
          </div>
          <div className="hoja-titulo">
            <h1>HOJA DE RUTA</h1>
            <p>Fecha: {fmtFecha(jornada.fecha)}</p>
            <p>Total paradas: {jcs.length}</p>
          </div>
        </div>

        {/* Resumen */}
        <div className="resumen">
          <div className="resumen-item">
            <div className="resumen-num">{jcs.length}</div>
            <div className="resumen-label">Paradas</div>
          </div>
          <div className="resumen-item">
            <div className="resumen-num">{Object.keys(porZona).length}</div>
            <div className="resumen-label">Zonas</div>
          </div>
          <div className="resumen-item">
            <div className="resumen-num" style={{ fontSize: 14 }}>{money(totalJornada)}</div>
            <div className="resumen-label">Total a cobrar</div>
          </div>
        </div>

        {/* Tabla por zona */}
        {Object.entries(porZona).map(([zona, items]) => (
          <div key={zona}>
            <div className="zona-titulo">📍 {zona} — {items.length} parada{items.length !== 1 ? 's' : ''}</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '20px' }}>#</th>
                  <th style={{ width: '120px' }}>Cliente</th>
                  <th>Materiales</th>
                  <th style={{ width: '70px' }}>Pago</th>
                  <th style={{ width: '70px' }}>Monto</th>
                  <th style={{ width: '35mm' }}>Firma / Obs.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((jc, idx) => {
                  const comp = jc.comprobantes as any
                  const cliente = comp?.clientes || {}
                  const items2 = comp?.comprobante_items || []
                  return (
                    <tr key={jc.id}>
                      <td className="num">{jcs.indexOf(jc) + 1}</td>
                      <td>
                        <div className="cliente-nombre">{comp?.cliente_nombre || '—'}</div>
                        {cliente.direccion && <div className="cliente-dir">📍 {cliente.direccion}</div>}
                        {cliente.telefono && <div className="cliente-dir">📞 {cliente.telefono}</div>}
                      </td>
                      <td>
                        <div className="items-cell">
                          {items2.slice(0, 6).map((it: any, i: number) => (
                            <div key={i}>· {it.cantidad} {it.materiales?.unidad || ''} {it.detalle}</div>
                          ))}
                          {items2.length > 6 && <div style={{ color: '#aaa' }}>+ {items2.length - 6} más</div>}
                        </div>
                      </td>
                      <td className="pago">{comp?.condicion_pago || '—'}</td>
                      <td className="monto">{money(comp?.total || 0)}</td>
                      <td className="firma-cell">
                        <div className="firma-linea"></div>
                      </td>
                    </tr>
                  )
                })}
                {/* Subtotal zona */}
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, fontSize: 10, background: '#f9f9f9' }}>Subtotal {zona}</td>
                  <td className="monto" style={{ background: '#f9f9f9' }}>{money(items.reduce((s, jc) => s + ((jc.comprobantes as any)?.total || 0), 0))}</td>
                  <td style={{ background: '#f9f9f9' }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        <div className="total-final">TOTAL A COBRAR: {money(totalJornada)}</div>

        <div className="pie">
          Generado por {empresa.nombre || 'El Obralista'} · {new Date().toLocaleDateString('es-AR')} · Confidencial — uso interno
        </div>
      </div>
    </>
  )
}
