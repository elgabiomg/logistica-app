'use client'
import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

interface ItemRow { codigo: string; detalle: string; cantidad: string; precio: string; lista?: 1|2|3|null; precioManual?: boolean; precioBase?: string }

function generarHTMLComp(comp: any, empresa: EmpresaConfig | null, opts?: { mostrarEfectivo?: boolean; mostrarFinanciacion?: boolean }): string {
  const t = TIPOS[comp.tipo as TipoComprobante]
  const cl = comp.clientes || {}
  const items: ComprobanteItem[] = comp.comprobante_items || []
  const e = empresa || {} as EmpresaConfig
  const logo = e.logo_url ? `<img src="${e.logo_url}" style="max-height:72px;max-width:120px;display:block;margin:0 auto 4px" crossorigin="anonymous"/>` : ''
  const esRemito = comp.tipo === 'remito'
  const esPresupuesto = comp.tipo === 'presupuesto'
  const esFacturaX = comp.tipo === 'factura_x'

  // ── coeficientes de financiación ──
  const descEfectivoPct   = e.descuento_contado_pct   ?? 32
  const debitoRecargoPct  = e.fin_debito_recargo_pct  ?? 5
  const visa3DescPct      = e.fin_visa_3csi_desc_pct  ?? 10
  const visa9Coef         = e.fin_visa_9_coef         ?? 149
  const visa12Coef        = e.fin_visa_12_coef        ?? 165
  const nx8Coef           = e.fin_nx_8_coef           ?? 149
  const nx10Coef          = e.fin_nx_10_coef          ?? 152
  const nx12Coef          = e.fin_nx_12_coef          ?? 165

  // Siempre usar subtotal (precio lista, antes de cualquier descuento) como base
  const lista        = comp.subtotal ?? comp.total ?? 0
  const efectivoTot  = Math.round(lista * (1 - descEfectivoPct / 100))
  const debitoTot    = Math.round(efectivoTot * (1 + debitoRecargoPct / 100))
  const visa3c       = Math.round((lista * (1 - visa3DescPct / 100)) / 3)
  const visa6c       = Math.round(lista / 6)
  const visa9c       = Math.round((efectivoTot / 9) * (visa9Coef / 100))
  const visa12c      = Math.round((efectivoTot / 12) * (visa12Coef / 100))
  const nx8c         = Math.round((efectivoTot / 8) * (nx8Coef / 100))
  const nx10c        = Math.round((efectivoTot / 10) * (nx10Coef / 100))

  const mostrarEfectivo     = opts?.mostrarEfectivo     ?? false
  const mostrarFinanciacion = opts?.mostrarFinanciacion ?? false

  const fila = (i: ComprobanteItem) => {
    if (esRemito) return `<tr><td class="c">${i.cantidad}</td><td>${i.codigo || ''}</td><td>${i.detalle}</td></tr>`
    const puEfec = Math.round(i.precio_unitario * (1 - descEfectivoPct / 100))
    const imEfec = Math.round(puEfec * i.cantidad)
    if (mostrarEfectivo) return `<tr>
        <td class="c">${i.cantidad}</td>
        <td class="c">${i.codigo || ''}</td>
        <td>${i.detalle}</td>
        <td class="r efec-td">
          <div style="font-weight:700">${money(puEfec)}</div>
          <div style="font-size:8px;color:#b0b0b0;margin-top:1px">${money(i.precio_unitario)}</div>
        </td>
        <td class="r efec-td">
          <div style="font-weight:700">${money(imEfec)}</div>
          <div style="font-size:8px;color:#b0b0b0;margin-top:1px">${money(i.importe)}</div>
        </td>
       </tr>`
    return `<tr>
        <td class="c">${i.cantidad}</td>
        <td class="c">${i.codigo || ''}</td>
        <td>${i.detalle}</td>
        <td class="r">${money(i.precio_unitario)}</td>
        <td class="r">${money(i.importe)}</td>
       </tr>`
  }

  const cuota = (lbl: string, val: number, n: number, total: number) =>
    `<td class="cval">${money(val)}<span class="csub">${lbl}</span><span class="ctot">total ${money(total)}</span></td>`

  const seccionFinanciacion = esPresupuesto ? `

  ${mostrarFinanciacion ? `
  <!-- MEDIOS DE PAGO -->
  <div class="mp-wrap">
    <div class="mp-header">Opciones de pago</div>
    <div class="mp-resumen" style="grid-template-columns:${mostrarEfectivo ? '1fr 1fr 1fr' : '1fr 1fr'}">
      <div class="mp-item">
        <div class="mp-item-lbl">Total lista</div>
        <div class="mp-item-val" style="color:#bbb;font-size:11px">${money(lista)}</div>
      </div>
      ${mostrarEfectivo ? `<div class="mp-item efec-cell">
        <div class="mp-item-lbl">Contado efectivo</div>
        <div class="mp-item-val">${money(efectivoTot)}</div>
      </div>` : ''}
      <div class="mp-item">
        <div class="mp-item-lbl">Débito / Transferencia</div>
        <div class="mp-item-val">${money(debitoTot)}</div>
      </div>
    </div>
    <div class="mp-cuotas">
      <table class="cuotas-tbl">
        <colgroup><col style="width:108px"/><col/><col/><col/><col/><col/><col/></colgroup>
        <thead>
          <tr>
            <td></td>
            <th class="cth">3 cuotas</th>
            <th class="cth">6 cuotas</th>
            <th class="cth">8 cuotas</th>
            <th class="cth">9 cuotas</th>
            <th class="cth">10 cuotas</th>
            <th class="cth">12 cuotas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="marca-lbl">&#x1F4B3; VISA / Mastercard</td>
            ${cuota('s/i', visa3c, 3, visa3c * 3)}
            ${cuota('s/i', visa6c, 6, visa6c * 6)}
            <td class="cval cvacio">—</td>
            ${cuota('fija', visa9c, 9, visa9c * 9)}
            <td class="cval cvacio">—</td>
            ${cuota('fija', visa12c, 12, visa12c * 12)}
          </tr>
          <tr>
            <td class="marca-lbl">&#x1F538; Naranja X</td>
            ${cuota('Plan Z', visa3c, 3, visa3c * 3)}
            ${cuota('s/i', visa6c, 6, visa6c * 6)}
            ${cuota('fija', nx8c, 8, nx8c * 8)}
            <td class="cval cvacio">—</td>
            ${cuota('fija', nx10c, 10, nx10c * 10)}
            ${cuota('fija', visa12c, 12, visa12c * 12)}
          </tr>
        </tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- LEGAL + INFO -->
  <div class="legal-bottom">
    <p>Los precios pueden estar sujetos a modificación sin aviso previo.</p>
    <p>Los valores y bonificaciones por cantidad se contemplan sobre el total de la compra. Las cantidades solicitadas pueden influir en el precio final del material.</p>
    <p><strong>Vigencia del presupuesto: 24 hs corridas.</strong></p>
  </div>
  <div class="info-footer">
    ${e.direccion ? `<span>&#x1F4CC; ${e.direccion}${e.localidad ? ', ' + e.localidad : ''}</span>` : ''}
    ${e.telefono ? `<span>&#x1F4DE; ${e.telefono}</span>` : ''}
    <span>&#x1F556; Lun–Vie 8:30–17:30 &middot; Sáb 8:30–14:00</span>
    <span>&#x1F69A; Entrega en 3–6 días hábiles una vez abonados los materiales</span>
  </div>
  ` : ''

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <title>${t.label} ${fmt(comp.punto_venta, comp.numero)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 16mm; }
    .lbl { color: #1c3f8f; font-weight: 700; }

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

    .empresa { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; border-bottom: 1px solid #bbb; padding: 8px 0; font-size: 10.5px; line-height: 1.7; }
    .empresa .original { text-align: center; font-weight: 800; font-size: 12px; align-self: center; padding: 0 8px; border-left: 1px solid #ccc; border-right: 1px solid #ccc; }
    .empresa .derecha { text-align: right; }
    .cliente { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-bottom: 1px solid #bbb; padding: 8px 0; font-size: 10.5px; line-height: 1.75; }

    table.items { width: 100%; border-collapse: collapse; margin-top: 10px; }
    table.items thead tr { border-bottom: 2px solid #1a1a1a; }
    table.items th { padding: 4px 5px; font-size: 9.5px; font-weight: 700; color: #1a1a1a; }
    table.items td { padding: 2px 5px; font-size: 9.5px; border-bottom: 1px solid #eee; line-height: 1.35; }
    table.items tbody tr:last-child td { border-bottom: none; }
    .c { text-align: center; } .r { text-align: right; }

    .foot { display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-top: 18px; align-items: start; }
    .legal { font-size: 10px; color: #444; line-height: 1.6; }
    .legal p { margin-bottom: 3px; }
    table.tot { border-collapse: collapse; min-width: 240px; border: 1px solid #e8e8e8; border-radius: 4px; overflow: hidden; }
    table.tot td { padding: 6px 14px; font-size: 11px; border-bottom: 1px solid #f0f0f0; }
    table.tot tr:last-child td { border-bottom: none; }
    table.tot tr.total td { font-weight: 800; font-size: 14px; background: #f0faf0; color: #2e7d32; border-top: 2px solid #a5d6a7; }
    .firma { margin-top: 30px; text-align: center; font-size: 10px; color: #444; }
    .firma-linea { border-top: 1px solid #1a1a1a; padding-top: 4px; display: inline-block; min-width: 200px; }

    /* ── COLUMNA EFECTIVO ── */
    .efec-th { background: #f0faf0; color: #2e7d32 !important; border-left: 2px solid #c8e6c9; }
    .efec-td { background: #fafff8; border-left: 2px solid #e0f0e0; color: #1a1a1a; }

    /* ── TOTALES PRESUPUESTO ── */
    table.tot { border-collapse: collapse; min-width: 240px; border: 1px solid #e0e0e0; border-radius: 6px; overflow:hidden; }
    table.tot td { padding: 6px 14px; font-size: 11px; border-bottom: 1px solid #f0f0f0; }
    table.tot tr:last-child td { border-bottom: none; }
    table.tot tr.total td { font-weight: 800; font-size: 14px; background: #f0faf0; color: #2e7d32; border-top: 2px solid #a5d6a7; }

    /* ── MEDIOS DE PAGO ── */
    .mp-wrap { margin-top: 14px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
    .mp-header { background: #f7f7f7; border-bottom: 1px solid #e0e0e0; padding: 6px 14px; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #777; }
    .mp-resumen { display: grid; border-bottom: 1px solid #e8e8e8; }
    .mp-item { padding: 10px 14px; border-right: 1px solid #eeeeee; }
    .mp-item:last-child { border-right: none; }
    .mp-item-lbl { font-size: 8px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
    .mp-item-val { font-size: 13px; font-weight: 800; color: #1a1a1a; }
    .mp-item.efec-cell { background: #f4fbf4; }
    .mp-item.efec-cell .mp-item-lbl { color: #4caf50; }
    .mp-item.efec-cell .mp-item-val { color: #2e7d32; }
    .mp-cuotas { padding: 10px 14px; }
    .mp-cuotas-tit { font-size: 9px; font-weight: 700; color: #888; margin-bottom: 7px; letter-spacing: 0.3px; }
    .cth { font-size: 8px; color: #bbb; font-weight: 600; text-align: center; padding: 0 4px 5px; }
    .marca-lbl { font-size: 9px; font-weight: 700; color: #444; padding: 5px 6px 5px 0; white-space: nowrap; }
    .cval { text-align: center; padding: 5px 3px; font-size: 10.5px; font-weight: 800; color: #222; border-left: 1px solid #f2f2f2; }
    .cval .csub { display: block; font-size: 7px; font-weight: 500; color: #bbb; margin-top: 1px; text-transform: uppercase; letter-spacing: 0.3px; }
    .cval .ctot { display: block; font-size: 7px; font-weight: 400; color: #c8e0c8; margin-top: 2px; }
    .cvacio { color: #e0e0e0; font-weight: 300; font-size: 12px; border-left: 1px solid #f5f5f5; text-align:center; padding: 5px 3px; }
    table.cuotas-tbl { width: 100%; border-collapse: collapse; }
    table.cuotas-tbl tbody tr { border-top: 1px solid #f5f5f5; }
    table.cuotas-tbl tbody tr:first-child { border-top: none; }

    /* ── LEGAL + INFO ── */
    .legal-bottom { margin-top: 14px; padding-top: 8px; border-top: 1px solid #ececec; }
    .legal-bottom p { font-size: 8.5px; color: #aaa; line-height: 1.6; margin-bottom: 1px; }
    .info-footer { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 2px 18px; font-size: 8.5px; color: #888; border-top: 1px solid #f0f0f0; padding-top: 6px; }

    @media print {
      @page { margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 12mm 16mm; }
    }
  </style>
  </head><body><div class="page">

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

  <div class="cliente">
    <div>
      <div><span class="lbl">Cliente:</span> ${comp.cliente_nombre || cl.nombre || 'Consumidor Final'}</div>
      ${cl.direccion ? `<div><span class="lbl">Dirección:</span> ${cl.direccion}</div>` : ''}
      ${cl.localidad ? `<div><span class="lbl">Localidad:</span> ${cl.localidad}</div>` : ''}
      ${cl.cuit ? `<div><span class="lbl">CUIT:</span> ${cl.cuit}</div>` : ''}
      ${cl.dni ? `<div><span class="lbl">DNI:</span> ${cl.dni}</div>` : ''}
      ${cl.telefono ? `<div><span class="lbl">Tel:</span> ${cl.telefono}</div>` : ''}
      <div style="margin-top:3px;font-weight:700">${(comp.condicion_pago || 'CONTADO').toUpperCase()}</div>
    </div>
    <div style="text-align:right">
      <div><span class="lbl">Vendedor:</span> ${comp.vendedor || ''}</div>
      <div><span class="lbl">IVA:</span> ${cl.condicion_iva || 'Consumidor Final'}</div>
      ${comp.numero ? `<div><span class="lbl">Comprobante N°:</span> ${comp.numero}</div>` : ''}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:46px">Cant.</th>
        <th class="c" style="width:72px">Código</th>
        <th>Detalle</th>
        ${esRemito ? '' : mostrarEfectivo
          ? `<th class="r efec-th" style="width:100px">P. Unit. contado</th><th class="r efec-th" style="width:110px">Importe contado</th>`
          : `<th class="r" style="width:100px">P. Unit.</th><th class="r" style="width:110px">Importe</th>`}
      </tr>
    </thead>
    <tbody>${items.map(fila).join('')}</tbody>
  </table>

  ${esRemito ? `
  <div class="foot" style="margin-top:24px">
    <div class="legal"><p>Documento no válido como comprobante fiscal.</p></div>
    <div class="firma"><div class="firma-linea">Recibí conforme — Firma y aclaración</div></div>
  </div>
  ` : esPresupuesto ? `
  <div style="margin-top:14px;display:flex;justify-content:flex-end">
    <table class="tot">
      ${mostrarEfectivo ? `
      <tr>
        <td>Total lista</td>
        <td class="r">${money(lista)}</td>
      </tr>
      <tr style="color:#2e7d32">
        <td>Descuento en efectivo</td>
        <td class="r">− ${money(lista - efectivoTot)}</td>
      </tr>
      <tr class="total" style="background:#f1f8e9;color:#2e7d32;border-top:2px solid #a5d6a7">
        <td>TOTAL CONTADO</td><td class="r">${money(efectivoTot)}</td>
      </tr>` : `
      <tr><td>Subtotal:</td><td class="r">${money(comp.subtotal)}</td></tr>
      ${Number(comp.descuento) > 0 ? `<tr><td>Descuento:</td><td class="r">− ${money(comp.descuento)}</td></tr>` : ''}
      ${Number(comp.percepciones) > 0 ? `<tr><td>Percepciones:</td><td class="r">${money(comp.percepciones)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL $</td><td class="r">${money(comp.total)}</td></tr>`}
    </table>
  </div>
  ${mostrarFinanciacion ? `<div style="text-align:right;margin-top:5px;font-size:8.5px;color:#aaa">Para pago con tarjeta, consultá las opciones abajo ↓</div>` : ''}
  ${seccionFinanciacion}
  ` : `
  <div class="foot">
    <div class="legal"><p>La entrega de los materiales se realiza en el plazo de 3-6 días hábiles.</p></div>
    <table class="tot">
      <tr><td>Subtotal:</td><td class="r">${money(comp.subtotal)}</td></tr>
      ${Number(comp.descuento) > 0 ? `<tr><td>Descuento:</td><td class="r">− ${money(comp.descuento)}</td></tr>` : ''}
      ${Number(comp.percepciones) > 0 ? `<tr><td>Percepciones:</td><td class="r">${money(comp.percepciones)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL $</td><td class="r">${money(comp.total)}</td></tr>
    </table>
  </div>
  `}

  </div></body></html>`

  return html
}

function imprimirComp(comp: any, empresa: EmpresaConfig | null, opts?: { mostrarEfectivo?: boolean; mostrarFinanciacion?: boolean }) {
  const html = generarHTMLComp(comp, empresa, opts)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html.replace('</body>', '<script>window.onload=function(){window.print()}<\/script></body>'))
  w.document.close()
}

// ── File System Access API — carpeta de presupuestos ─────────────────
const DB_NAME = 'logiobra-fs'
const DB_STORE = 'handles'
const HANDLE_KEY = 'carpeta-presupuestos'

async function abrirIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

async function guardarHandle(h: FileSystemDirectoryHandle) {
  const db = await abrirIDB()
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(h, HANDLE_KEY)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

async function leerHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await abrirIDB()
    return new Promise((res) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).get(HANDLE_KEY)
      req.onsuccess = () => res(req.result ?? null)
      req.onerror = () => res(null)
    })
  } catch { return null }
}

async function obtenerCarpetaPresupuestos(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) return null
  try {
    let root = await leerHandle()
    if (root) {
      const perm = await (root as any).requestPermission({ mode: 'readwrite' })
      if (perm !== 'granted') root = null
    }
    if (!root) {
      root = await (window as any).showDirectoryPicker({
        id: 'presupuestos',
        mode: 'readwrite',
        startIn: 'documents',
      })
      await guardarHandle(root!)
    }
    return root!
  } catch { return null }
}

async function escribirArchivo(root: FileSystemDirectoryHandle, subcarpeta: string, nombre: string, blob: Blob) {
  const dir = await root.getDirectoryHandle(subcarpeta, { create: true })
  const file = await dir.getFileHandle(nombre, { create: true })
  const writable = await (file as any).createWritable()
  await writable.write(blob)
  await writable.close()
}

function fallbackDownload(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function renderHTMLToCanvas(html: string): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, { position: 'fixed', left: '-9999px', top: '0', width: '794px', height: '1122px', border: 'none' })
  iframe.src = blobUrl
  document.body.appendChild(iframe)
  await new Promise<void>(r => { iframe.onload = () => r() })
  await new Promise(r => setTimeout(r, 600))
  const h = iframe.contentDocument!.documentElement.scrollHeight
  iframe.style.height = h + 'px'
  await new Promise(r => setTimeout(r, 200))
  try {
    return await html2canvas(iframe.contentDocument!.documentElement, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true,
      width: 794, windowWidth: 794, height: h, windowHeight: h,
    })
  } finally {
    document.body.removeChild(iframe)
    URL.revokeObjectURL(blobUrl)
  }
}

// ── Exportación PDF ───────────────────────────────────────────────────
async function exportarPDFComp(comp: any, empresa: EmpresaConfig | null, opts?: { mostrarEfectivo?: boolean; mostrarFinanciacion?: boolean }) {
  const t = TIPOS[comp.tipo as TipoComprobante]
  const nombre = comp.cliente_nombre || 'ConsumidorFinal'
  const numero = fmt(comp.punto_venta || 1, comp.numero || 0)
  const filename = `${t.label}_${numero}_${nombre.replace(/\s+/g, '_')}.pdf`
  const html = generarHTMLComp(comp, empresa, opts)
  try {
    const { jsPDF } = await import('jspdf')
    const canvas = await renderHTMLToCanvas(html)
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pdfW = pdf.internal.pageSize.getWidth()
    const pdfH = (canvas.height * pdfW) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)
    fallbackDownload(pdf.output('blob'), filename)
  } catch (e) {
    console.error('Error generando PDF:', e)
    // Fallback: ventana de impresión
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500) }
  }
}

// ── Exportación imagen ────────────────────────────────────────────────
async function exportarImagenComp(comp: any, empresa: EmpresaConfig | null, opts?: { mostrarEfectivo?: boolean; mostrarFinanciacion?: boolean }) {
  const t = TIPOS[comp.tipo as TipoComprobante]
  const nombre = comp.cliente_nombre || 'ConsumidorFinal'
  const numero = fmt(comp.punto_venta || 1, comp.numero || 0)
  const filename = `${t.label}_${numero}_${nombre.replace(/\s+/g, '_')}.png`
  const html = generarHTMLComp(comp, empresa, opts)
  try {
    const canvas = await renderHTMLToCanvas(html)
    const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/png'))
    fallbackDownload(blob, filename)
  } catch (e) {
    console.error('Error generando imagen:', e)
  }
}

function copiarMensajeWhatsApp(comp: any, empresa: EmpresaConfig | null, opts?: { mostrarEfectivo?: boolean; mostrarFinanciacion?: boolean }) {
  const e = empresa || {} as EmpresaConfig
  const items: ComprobanteItem[] = comp.comprobante_items || []
  const descEfectivoPct  = e.descuento_contado_pct   ?? 32
  const debitoRecargoPct = e.fin_debito_recargo_pct  ?? 5
  const visa3DescPct     = e.fin_visa_3csi_desc_pct  ?? 10
  const visa9Coef        = e.fin_visa_9_coef         ?? 149
  const visa12Coef       = e.fin_visa_12_coef        ?? 165
  const nx8Coef          = e.fin_nx_8_coef           ?? 149
  const nx10Coef         = e.fin_nx_10_coef          ?? 152

  const lista       = comp.subtotal ?? comp.total ?? 0
  const efec        = Math.round(lista * (1 - descEfectivoPct / 100))
  const debito      = Math.round(efec * (1 + debitoRecargoPct / 100))
  const visa3c      = Math.round((lista * (1 - visa3DescPct / 100)) / 3)
  const visa6c      = Math.round(lista / 6)
  const visa9c      = Math.round((efec / 9) * (visa9Coef / 100))
  const visa12c     = Math.round((efec / 12) * (visa12Coef / 100))
  const nx8c        = Math.round((efec / 8) * (nx8Coef / 100))
  const nx10c       = Math.round((efec / 10) * (nx10Coef / 100))
  const m = (n: number) => '$ ' + Math.round(Math.abs(n)).toLocaleString('es-AR')

  const mostrarEfectivo     = opts?.mostrarEfectivo     ?? false
  const mostrarFinanciacion = opts?.mostrarFinanciacion ?? false

  const detalleEfec = mostrarEfectivo ? items.map(it => {
    const pu = Math.round(it.precio_unitario * (1 - descEfectivoPct / 100))
    const im = Math.round(pu * it.cantidad)
    return `• ${it.detalle}${it.codigo ? ` (${it.codigo})` : ''} ×${it.cantidad} → ${m(im)}`
  }).join('\n') : ''

  const detalleLista = items.map(it =>
    `• ${it.detalle}${it.codigo ? ` (${it.codigo})` : ''} ×${it.cantidad} → ${m(it.importe)}`
  ).join('\n')

  const secEfectivo = mostrarEfectivo ? `
💸 *Precios a contado efectivo:*
${detalleEfec}
Total efectivo: ${m(efec)}
Débito / Transferencia: ${m(debito)}
` : ''

  const secTarjetas = mostrarFinanciacion ? `
💳 *VISA / Mastercard bancarizada:*
• 3 cuotas sin interés: ${m(visa3c)}/cuota
• 6 cuotas sin interés: ${m(visa6c)}/cuota
• 9 cuotas fijas: ${m(visa9c)}/cuota
• 12 cuotas fijas: ${m(visa12c)}/cuota

🔸 *Naranja X:*
• Plan Z — 3 cuotas: ${m(visa3c)}/cuota
• 6 cuotas sin interés: ${m(visa6c)}/cuota
• 8 cuotas fijas: ${m(nx8c)}/cuota
• 10 cuotas fijas: ${m(nx10c)}/cuota
• 12 cuotas fijas: ${m(visa12c)}/cuota
` : ''

  const texto = `*${e.nombre || 'Hornero Materiales'} — Presupuesto ${fmt(comp.punto_venta, comp.numero)}*

📋 *Detalle:*
${detalleLista}
${secEfectivo}${secTarjetas}
📌 ${e.direccion || ''}${e.localidad ? ', ' + e.localidad : ''}
🕖 Lun–Vie 8:30–17:30 · Sáb 8:30–14:00
🚚 Entrega en 3–6 días hábiles una vez abonados los materiales

_Cualquier consulta, estamos a disposición._`

  navigator.clipboard.writeText(texto).catch(() => {})
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
  return <Suspense><NuevoComprobanteInner /></Suspense>
}

function NuevoComprobanteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

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

  // listas de precios
  const listasPct = [null, empresa?.lista1_pct ?? 20, empresa?.lista2_pct ?? 15, empresa?.lista3_pct ?? 10] as (number|null)[]
  const listasNombre = ['Sin lista', empresa?.lista1_nombre || 'Lista 1', empresa?.lista2_nombre || 'Lista 2', empresa?.lista3_nombre || 'Lista 3']
  const [listaGlobal, setListaGlobal] = useState<1|2|3|null>(() => { try { const v = localStorage.getItem('logiobra_lista'); return v !== null && v !== '' ? Number(v) as 1|2|3 : 1 } catch { return 1 } })
  const recargoGenPct = empresa?.recargo_general ?? 47.04
  const [recargoOn, setRecargoOn] = useState<boolean>(false)

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
    { codigo: '', detalle: '', cantidad: '1', precio: '', precioManual: false },
  ])
  const [tabItems, setTabItems] = useState<'items' | 'adicional'>('items')
  const [descPct, setDescPct] = useState('0')
  const [descMonto, setDescMonto] = useState('0')
  const [percep, setPercep] = useState('0')
  const [picker, setPicker] = useState<{ idx: number; matches: Material[] } | null>(null)
  const [pickerSel, setPickerSel] = useState<Record<string, boolean>>({})
  const detRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [focusNext, setFocusNext] = useState<number | null>(null)
  const [filaActiva, setFilaActiva] = useState<number>(0)

  // estado
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [saved, setSaved] = useState(false)
  const [compGuardado, setCompGuardado] = useState<any>(null)
  const [compFlags, setCompFlags] = useState<{recargo: boolean; descContado: boolean}>({recargo: false, descContado: false})
  const [modalPost, setModalPost] = useState(false)

  // panel de medios de pago (F2)
  const [modalPago, setModalPago] = useState(false)
  const [pagos, setPagos] = useState<{medio: string; monto: string}[]>([{medio: 'efectivo', monto: ''}])

  // cargar datos
  useEffect(() => {
    const base = Promise.all([getClientes(), getVendedores(), getMateriales(), getEmpresa()])
    const compLoad = editId ? getComprobante(editId) : Promise.resolve(null)
    Promise.all([base, compLoad])
      .then(([[cls, vds, mats, emp], comp]) => {
        setClientes(cls); setVendedores(vds); setMateriales(mats as Material[]); setEmpresa(emp)
        setVendedor(getOp() || vds[0]?.nombre || '')
        setObs(emp?.pie_comprobante || '')
        setDescPct(String(emp?.descuento_general ?? 0))
        if (comp) {
          // Pre-fill form from existing comprobante
          setTipo((comp as any).tipo as TipoComprobante)
          setClienteId((comp as any).cliente_id || '')
          setClienteLibre((comp as any).cliente_id ? '' : ((comp as any).cliente_nombre || ''))
          setCliQuery((comp as any).cliente_id ? '' : ((comp as any).cliente_nombre || ''))
          setCondicion((comp as any).condicion_pago || 'CONTADO')
          setVendedor((comp as any).vendedor || getOp() || vds[0]?.nombre || '')
          setObs((comp as any).observaciones || emp?.pie_comprobante || '')
          setDescPct(String((comp as any).descuento_pct ?? (emp?.descuento_general ?? 0)))
          setPercep(String((comp as any).percepciones || 0))
          const loadedItems: ItemRow[] = ((comp as any).comprobante_items || []).map((it: any) => ({
            codigo: it.codigo || '',
            detalle: it.detalle,
            cantidad: String(it.cantidad),
            precio: String(it.precio_unitario),
          }))
          if (loadedItems.length) setItems(loadedItems)
        }
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [editId])

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
    setItems(a => a.map((it, j) => j === i ? { ...it, [k]: v, ...(k === 'precio' ? { precioManual: true } : {}) } : it))

  const addItem = () => setItems(a => [...a, { codigo: '', detalle: '', cantidad: '1', precio: '', precioManual: false }])
  const delItem = (i: number) => setItems(a => a.filter((_, j) => j !== i))

  const precioConLista = useCallback((m: Material, lista: 1|2|3|null) => {
    const base = Number(m.precio_ref || 0)
    const pct = lista ? listasPct[lista] : null
    const conLista = pct != null ? base * (1 + pct / 100) : base
    const conRecargo = recargoOn ? conLista * (1 + recargoGenPct / 100) : conLista
    return Math.round(conRecargo * 100) / 100
  }, [listasPct, recargoOn, recargoGenPct])

  const cambiarListaGlobal = (v: 1|2|3|null) => {
    setListaGlobal(v)
    try { localStorage.setItem('logiobra_lista', v ? String(v) : '') } catch {}
    setItems(a => a.map(it => {
      if (it.lista !== undefined && it.lista !== null) return it
      if (it.precioManual) return it
      const m = materiales.find(x => x.nombre === it.detalle)
      return m ? { ...it, precio: String(precioConLista(m, v) || it.precio) } : it
    }))
  }

  const cambiarRecargo = (v: boolean) => {
    setRecargoOn(v)
    setItems(a => a.map(it => {
      if (it.lista !== undefined && it.lista !== null) return it
      if (it.precioManual && it.precioBase) {
        const base = num(it.precioBase)
        const precio = Math.round((v ? base * (1 + recargoGenPct / 100) : base) * 100) / 100
        return { ...it, precio: String(precio) }
      }
      if (it.precioManual) return it
      const m = materiales.find(x => x.nombre === it.detalle)
      if (!m) return it
      const base = Number(m.precio_ref || 0)
      const pct = listaGlobal ? listasPct[listaGlobal] : null
      const conLista = pct != null ? base * (1 + pct / 100) : base
      const precio = Math.round((v ? conLista * (1 + recargoGenPct / 100) : conLista) * 100) / 100
      return { ...it, precio: String(precio || it.precio) }
    }))
  }

  const cambiarListaItem = (i: number, v: 1|2|3|null) => {
    const m = materiales.find(x => x.nombre === items[i]?.detalle)
    setItems(a => a.map((it, j) => {
      if (j !== i) return it
      const precio = m ? String(precioConLista(m, v)) || it.precio : it.precio
      return { ...it, lista: v, precio, precioManual: false, precioBase: undefined }
    }))
  }

  const aplicarMat = (i: number, m: Material) => {
    const lista = items[i]?.lista !== undefined ? items[i].lista : listaGlobal
    setItems(a => a.map((it, j) => j === i ? { ...it, codigo: m.codigo || '', detalle: m.nombre, precio: String(precioConLista(m, lista ?? null) || ''), precioManual: false } : it))
  }

  const avanzar = (i: number) => {
    setItems(a => i >= a.length - 1 ? [...a, { codigo: '', detalle: '', cantidad: '1', precio: '', precioManual: false }] : a)
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

  const agregarMateriales = (elegidos: Material[]) => {
    if (!picker || !elegidos.length) return
    let ultimo = picker.idx
    setItems(a => {
      const copy = [...a]
      const m0 = elegidos[0]
      copy[picker.idx] = { ...copy[picker.idx], codigo: m0.codigo || '', detalle: m0.nombre, precio: String(precioConLista(m0, listaGlobal) || ''), precioManual: false }
      const extra = elegidos.slice(1).map(m => ({ codigo: m.codigo || '', detalle: m.nombre, cantidad: '1', precio: String(precioConLista(m, listaGlobal) || ''), precioManual: false }))
      copy.splice(picker.idx + 1, 0, ...extra)
      ultimo = picker.idx + extra.length
      copy.push({ codigo: '', detalle: '', cantidad: '1', precio: '' })
      return copy
    })
    setPicker(null); setPickerSel({}); setFocusNext(ultimo + 1)
  }

  const confirmarPicker = () => {
    if (!picker) return
    const elegidos = picker.matches.filter(m => pickerSel[m.id])
    agregarMateriales(elegidos)
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
      const full = await getComprobante(comp.id)
      setCompGuardado(full)
      setCompFlags({ recargo: recargoOn || listaGlobal !== null, descContado: descOn })
      setSaved(true)
      setModalPost(true)
    } catch (e: any) { setErrMsg(e?.message || 'Error al guardar') } finally { setSaving(false) }
  }

  // guardar con múltiples medios de pago (F2 confirm)
  const guardarConPagos = async (pagosSelec: {medio: string; monto: string}[]) => {
    const validos = items.filter(it => it.detalle && num(it.cantidad) > 0)
    if (!validos.length) { setErrMsg('Cargá al menos un ítem'); return }
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
      const condPago = pagosSelec.some(p => p.medio === 'cuenta corriente') ? 'CUENTA CORRIENTE' : 'CONTADO'
      const comp = await createComprobante({
        tipo, punto_venta: empresa?.punto_venta || 1,
        cliente_id: clienteId || null,
        cliente_nombre: cli?.nombre || clienteLibre || 'Consumidor Final',
        vendedor: vendedor || oper, fecha, condicion_pago: condPago,
        subtotal, recargo: 0, descuento: descTotal,
        descuento_pct: num(descPct) || null, percepciones: num(percep), total,
        observaciones: obs, estado: 'emitido', pedido_id: null, creado_por: oper,
      } as any, itemsDB)
      const nombreCli = cli?.nombre || clienteLibre || 'Consumidor Final'
      logAct('Creó', TIPOS[tipo].label,
        `${TIPOS[tipo].label} N° ${fmt(empresa?.punto_venta || 1, comp.numero)} · ${nombreCli} · ${money(total)}`, comp.id)
      // registrar cada medio de pago
      for (const p of pagosSelec) {
        const montoPago = num(p.monto)
        if (!montoPago) continue
        if (p.medio === 'cuenta corriente' && clienteId) {
          await registrarCCMov(clienteId, 'debe', montoPago, `${TIPOS[tipo].label} N° ${fmt(empresa?.punto_venta || 1, comp.numero)}`, comp.id)
        } else {
          await createCajaMov({ tipo: 'ingreso', monto: montoPago, concepto: `${TIPOS[tipo].label} N° ${fmt(empresa?.punto_venta || 1, comp.numero)} · ${nombreCli}`, medio_pago: p.medio, categoria: 'Ventas contado', cliente_id: clienteId || null, comprobante_id: comp.id, fecha, creado_por: oper } as any)
        }
      }
      const full = await getComprobante(comp.id)
      setCompGuardado(full)
      setCompFlags({ recargo: recargoOn || listaGlobal !== null, descContado: descOn })
      setSaved(true)
      setModalPago(false)
      setModalPost(true)
    } catch (e: any) { setErrMsg(e?.message || 'Error al guardar') } finally { setSaving(false) }
  }

  const abrirPanelPago = () => {
    if (saved) return
    const validos = items.filter(it => it.detalle && num(it.cantidad) > 0)
    if (!validos.length) { setErrMsg('Cargá al menos un ítem'); return }
    setPagos([{medio: 'efectivo', monto: String(total)}])
    setModalPago(true)
  }

  // ── Atajos de teclado (estilo ADMGlobal) ────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // No interferir si hay un input de texto activo (excepto atajos con Ctrl)
      const tag = (document.activeElement as HTMLElement)?.tagName
      const enInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // F8 — eliminar ítem activo
      if (e.key === 'F8') {
        e.preventDefault()
        if (items.length > 1) delItem(filaActiva)
        return
      }
      // Insert — agregar nuevo ítem
      if (e.key === 'Insert') {
        e.preventDefault()
        addItem()
        setFocusNext(items.length)
        return
      }
      // Ctrl+N — nuevo comprobante
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        if (!modalPost && (saved || confirm('¿Descartás el comprobante actual y comenzás uno nuevo?'))) resetForm()
        return
      }
      // Ctrl+S / F10 — guardar
      if ((e.ctrlKey && e.key === 's') || e.key === 'F10') {
        e.preventDefault()
        if (!saving && !saved) guardar(false)
        return
      }
      // Ctrl+P — imprimir (solo si ya fue guardado)
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        if (compGuardado) imprimirComp(compGuardado, empresa, { mostrarEfectivo: compFlags.descContado, mostrarFinanciacion: compFlags.recargo })
        return
      }
      // Ctrl+E — exportar PDF
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault()
        if (compGuardado) exportarPDFComp(compGuardado, empresa, { mostrarEfectivo: compFlags.descContado, mostrarFinanciacion: compFlags.recargo })
        return
      }
      // F3 — guardar rápido
      if (e.key === 'F3') {
        e.preventDefault()
        if (saving || saved) return
        if (tipo === 'presupuesto') {
          guardar(false) // muestra modal post
        } else if (tipo === 'factura_x') {
          // guarda con pago exacto en efectivo
          const validos = items.filter(it => it.detalle && num(it.cantidad) > 0)
          if (!validos.length) { setErrMsg('Cargá al menos un ítem'); return }
          guardarConPagos([{medio: 'efectivo', monto: String(total)}])
        }
        return
      }
      // F2 — panel de medios de pago (solo factura_x)
      if (e.key === 'F2') {
        e.preventDefault()
        if (tipo === 'factura_x' && !saved) abrirPanelPago()
        return
      }
      // Escape — cerrar modales
      if (e.key === 'Escape') {
        if (modalPago) { setModalPago(false); return }
        if (picker) { setPicker(null); return }
        if (nuevoCli) { setNuevoCli(false); return }
        if (modalPost) { return } // no cerrar el modal post sin acción explícita
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, filaActiva, saving, saved, modalPost, modalPago, compGuardado, picker, nuevoCli, empresa, tipo, total, guardar, guardarConPagos, abrirPanelPago])

  const resetForm = () => {
    setTipo('presupuesto')
    setFecha(new Date().toISOString().slice(0, 10))
    setClienteId(''); setClienteLibre(''); setCliQuery('')
    setCondicion('CONTADO'); setMedioPago('efectivo')
    setItems([{ codigo: '', detalle: '', cantidad: '1', precio: '' }])
    setDescPct(String(empresa?.descuento_general ?? 0))
    setDescMonto('0'); setPercep('0')
    setObs(empresa?.pie_comprobante || '')
    setDescOn(false)
    setSaved(false); setCompGuardado(null); setModalPost(false)
    proximoNumero('presupuesto').then(setNroPreview).catch(() => {})
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
        <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{editId ? 'Editar Comprobante' : 'Nuevo Comprobante'}</span>
        {editId && !saved && <span style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>Basado en comprobante existente · al guardar se crea uno nuevo</span>}
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
          style={{ background: saving || saved ? C.surfaceAlt : C.accent, color: saving || saved ? C.textMuted : '#000', border: 'none', borderRadius: 7, padding: '7px 20px', fontSize: 13, fontWeight: 700, cursor: saving || saved ? 'not-allowed' : 'pointer' }}>
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : '💾 Guardar'}
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

          {/* Lista de precios */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: C.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>LISTA DE PRECIOS</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {([null, 1, 2, 3] as (1|2|3|null)[]).map(v => {
                const activa = listaGlobal === v
                const color = v === 1 ? C.accent : v === 2 ? '#a78bfa' : v === 3 ? '#34d399' : C.textMuted
                return (
                  <button key={String(v)} onClick={() => cambiarListaGlobal(v)}
                    style={{ background: activa ? (v ? `${color}22` : C.surfaceAlt) : C.bg, border: `1px solid ${activa ? color : C.border}`,
                      borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: activa ? color : C.textDim, fontSize: 11, fontWeight: 700 }}>
                    {v ? `L${v}\n${listasPct[v]}%` : '—'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recargo general */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: recargoOn ? `${C.accent}15` : C.surfaceAlt, border: `1px solid ${recargoOn ? C.accent : C.border}`, borderRadius: 7, padding: '9px 10px' }}>
            <input type="checkbox" checked={recargoOn} onChange={e => cambiarRecargo(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
            <span style={{ color: recargoOn ? C.accent : C.textMuted, fontSize: 12, fontWeight: 700 }}>
              Recargo {String(recargoGenPct).replace('.', ',')}%
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

          {/* Botones de acción rápida */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
            <button onClick={() => !saving && !saved && guardar(false)} disabled={saving || saved}
              style={{ padding: '10px 0', borderRadius: 8, border: 'none', background: saving || saved ? C.surfaceAlt : C.accent, color: saving || saved ? C.textMuted : '#000', fontSize: 13, fontWeight: 700, cursor: saving || saved ? 'not-allowed' : 'pointer' }}>
              {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'F3 Guardar'}
            </button>
            {tipo === 'factura_x' && !saved && (
              <button onClick={abrirPanelPago}
                style={{ padding: '10px 0', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                F2 Cobrar
              </button>
            )}
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
              {(() => {
                const n = items.filter(it => it.detalle && num(it.cantidad) > 0).length
                const MAX = 20
                const color = n >= MAX ? '#ef4444' : n >= 16 ? '#f59e0b' : C.textMuted
                return <span style={{ fontSize: 11, color, fontWeight: n >= 16 ? 700 : 400, marginRight: 10 }}>{n}/{MAX} ítems</span>
              })()}
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
                      {['#', 'Código', 'Descripción', 'Cantidad', 'EM', 'Lista', 'Precio Unit.', 'Subtotal', ''].map((h, i) => (
                        <th key={i} style={{ padding: '9px 12px', textAlign: i === 0 || i === 3 ? 'center' : i >= 4 ? 'right' : 'left', color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap', ...(i === 0 ? { width: 40 } : i === 1 ? { width: 100 } : i === 3 ? { width: 90 } : i === 4 ? { width: 50 } : i === 5 ? { width: 80 } : i === 6 ? { width: 110 } : i === 7 ? { width: 120 } : i === 8 ? { width: 40 } : {}) }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i}
                        onFocus={() => setFilaActiva(i)}
                        onClick={() => setFilaActiva(i)}
                        style={{ borderBottom: `1px solid ${C.border}`, background: filaActiva === i ? C.accentDim : i % 2 === 0 ? 'transparent' : C.surface, outline: filaActiva === i ? `1px solid ${C.accent}40` : 'none' }}
                        onMouseEnter={e => { if (filaActiva !== i) e.currentTarget.style.background = C.surfaceAlt }}
                        onMouseLeave={e => { e.currentTarget.style.background = filaActiva === i ? C.accentDim : i % 2 === 0 ? 'transparent' : C.surface }}>
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
                        {/* Lista */}
                        <td style={{ padding: '4px 4px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                            {([null, 1, 2, 3] as (1|2|3|null)[]).map(v => {
                              const listaEf = it.lista !== undefined ? it.lista : listaGlobal
                              const sel = listaEf === v
                              const color = v === 1 ? C.accent : v === 2 ? '#a78bfa' : v === 3 ? '#34d399' : C.textDim
                              return <button key={String(v)} onClick={() => cambiarListaItem(i, v)} title={v ? `${listasNombre[v]} (${listasPct[v]}%)` : 'Precio manual'}
                                style={{ background: sel ? `${color}22` : 'transparent', border: `1px solid ${sel ? color : C.border}`, borderRadius: 4, padding: '2px 4px', cursor: 'pointer', color: sel ? color : C.textDim, fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
                                {v ? `L${v}` : '—'}
                              </button>
                            })}
                          </div>
                        </td>
                        {/* Precio */}
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" value={it.precio} onChange={e => setItems(a => a.map((it2, j) => { if (j !== i) return it2; const base = recargoOn ? Math.round(num(e.target.value) / (1 + recargoGenPct / 100) * 100) / 100 : num(e.target.value); return { ...it2, precio: e.target.value, precioManual: true, precioBase: String(base) } }))}
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
            <span style={{ color: C.textDim, fontSize: 11, display: 'flex', gap: 12 }}>
              {[['Ins','+ ítem'],['F8','borrar fila'],['F3','guardar rápido'],['F2','cobrar (factura)'],['F10','guardar'],['Ctrl+N','nuevo'],['Ctrl+P','imprimir']].map(([k,v]) => (
                <span key={k}><kbd style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace' }}>{k}</kbd> {v}</span>
              ))}
            </span>
            <div style={{ color: C.accent, fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>{money(total)}</div>
          </footer>
        </main>
      </div>

      {/* ── MODAL MEDIOS DE PAGO (F2) ── */}
      {modalPago && (
        <div style={{ position: 'fixed', inset: 0, background: '#000D', zIndex: 4500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 480, boxShadow: '0 24px 80px #000C', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ color: C.text, fontSize: 16, fontWeight: 800 }}>Medios de pago</div>
            <div style={{ color: C.textMuted, fontSize: 13 }}>
              Total a cobrar: <strong style={{ color: C.accent, fontSize: 16 }}>{money(total)}</strong>
            </div>
            {pagos.map((p, i) => {
              const restante = total - pagos.reduce((s, x, xi) => xi !== i ? s + num(x.monto) : s, 0)
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={p.medio} onChange={e => setPagos(a => a.map((x, xi) => xi === i ? {...x, medio: e.target.value} : x))}
                    style={{ flex: 1.5, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia/débito">Transferencia / Débito</option>
                    <option value="tarjeta de crédito">Tarjeta de crédito</option>
                    <option value="cuenta corriente">Cuenta corriente</option>
                  </select>
                  <input type="number" placeholder="Monto" value={p.monto}
                    onChange={e => setPagos(a => a.map((x, xi) => xi === i ? {...x, monto: e.target.value} : x))}
                    onFocus={e => { if (!p.monto) setPagos(a => a.map((x, xi) => xi === i ? {...x, monto: String(Math.max(0, restante))} : x)) }}
                    style={{ width: 120, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                  {pagos.length > 1 && (
                    <button onClick={() => setPagos(a => a.filter((_, xi) => xi !== i))}
                      style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
                  )}
                </div>
              )
            })}
            {(() => {
              const cobrado = pagos.reduce((s, p) => s + num(p.monto), 0)
              const diferencia = Math.round((total - cobrado) * 100) / 100
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                  {pagos.length < 3 && diferencia > 0 && (
                    <button onClick={() => setPagos(a => [...a, {medio: 'efectivo', monto: String(diferencia)}])}
                      style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.text, borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                      + Agregar medio
                    </button>
                  )}
                  {pagos.length >= 3 || diferencia <= 0 ? <div /> : null}
                  <div style={{ color: diferencia > 0 ? '#f59e0b' : diferencia < 0 ? '#ef4444' : '#22c55e', fontSize: 13, fontWeight: 700 }}>
                    {diferencia > 0 ? `Falta: ${money(diferencia)}` : diferencia < 0 ? `Exceso: ${money(-diferencia)}` : '✓ Importe completo'}
                  </div>
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={() => setModalPago(false)}
                style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.textMuted, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                disabled={Math.round(pagos.reduce((s, p) => s + num(p.monto), 0) * 100) / 100 !== Math.round(total * 100) / 100 || saving}
                onClick={() => guardarConPagos(pagos)}
                style={{ padding: '8px 24px', borderRadius: 8, border: 'none',
                  background: Math.round(pagos.reduce((s, p) => s + num(p.monto), 0) * 100) / 100 !== Math.round(total * 100) / 100 ? C.surfaceAlt : C.accent,
                  color: Math.round(pagos.reduce((s, p) => s + num(p.monto), 0) * 100) / 100 !== Math.round(total * 100) / 100 ? C.textMuted : '#000',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Guardando...' : 'Confirmar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL POST-GUARDADO ── */}
      {modalPost && compGuardado && (
        <div style={{ position: 'fixed', inset: 0, background: '#000D', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, width: 420, boxShadow: '0 24px 80px #000C', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Ícono + título */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <div style={{ color: C.text, fontSize: 18, fontWeight: 800 }}>
                {TIPOS[compGuardado.tipo as TipoComprobante]?.label} guardado
              </div>
              <div style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
                N° {fmt(compGuardado.punto_venta, compGuardado.numero)} · {money(compGuardado.total)}
              </div>
            </div>

            {/* Opciones */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => exportarPDFComp(compGuardado, empresa, { mostrarEfectivo: compFlags.descContado, mostrarFinanciacion: compFlags.recargo })}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.accentDim, border: `1px solid ${C.accent}50`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 22 }}>📥</span>
                <div>
                  <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>Exportar PDF</div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>Guarda en tu carpeta de presupuestos</div>
                </div>
              </button>

              {compGuardado.tipo === 'presupuesto' && (
                <button onClick={() => exportarImagenComp(compGuardado, empresa, { mostrarEfectivo: compFlags.descContado, mostrarFinanciacion: compFlags.recargo })}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#7c3aed18', border: '1px solid #7c3aed50', borderRadius: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 22 }}>🖼️</span>
                  <div>
                    <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13 }}>Exportar imagen</div>
                    <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>PNG listo para enviar por WhatsApp</div>
                  </div>
                </button>
              )}

              {compGuardado.tipo === 'presupuesto' && (
                <button onClick={() => { copiarMensajeWhatsApp(compGuardado, empresa, { mostrarEfectivo: compFlags.descContado, mostrarFinanciacion: compFlags.recargo }) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#16a34a18', border: '1px solid #16a34a50', borderRadius: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 22 }}>💬</span>
                  <div>
                    <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>Copiar mensaje WhatsApp</div>
                    <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>Copia el texto con precios y cuotas al portapapeles</div>
                  </div>
                </button>
              )}

              <button onClick={() => imprimirComp(compGuardado, empresa, { mostrarEfectivo: compFlags.descContado, mostrarFinanciacion: compFlags.recargo })}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.blueDim, border: `1px solid ${C.blue}50`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 22 }}>🖨️</span>
                <div>
                  <div style={{ color: C.blue, fontWeight: 700, fontSize: 13 }}>Imprimir</div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>Enviá directamente a la impresora</div>
                </div>
              </button>

              <button onClick={resetForm}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.greenDim, border: `1px solid ${C.green}50`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 22 }}>➕</span>
                <div>
                  <div style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>Nuevo comprobante</div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>Limpia el formulario para empezar</div>
                </div>
              </button>
            </div>

            {/* Links inferiores */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
              <button onClick={() => setModalPost(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                Volver al presupuesto
              </button>
              <button onClick={() => router.push('/')}
                style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                Volver al listado
              </button>
            </div>
          </div>
        </div>
      )}

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
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: pickerSel[m.id] ? C.accentDim : C.surfaceAlt, border: `1px solid ${pickerSel[m.id] ? C.accent : C.border}`, borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }}
                  onClick={e => { e.preventDefault(); agregarMateriales([m]) }}>
                  <input type="checkbox" checked={!!pickerSel[m.id]} readOnly style={{ width: 15, height: 15, pointerEvents: 'none' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{m.nombre}</div>
                    <div style={{ color: C.textDim, fontSize: 11 }}>{m.codigo ? `#${m.codigo} · ` : ''}{m.rubro || ''}</div>
                  </div>
                  <span style={{ color: C.accent, fontWeight: 700, fontFamily: "'Space Mono', monospace", fontSize: 13 }}>{money(precioConLista(m, listaGlobal))}</span>
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
