'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'

// ─── STORE GLOBAL DE ESCANEOS (persiste aunque el componente se desmonte) ─────
type ScanState = { status:'loading'|'done'|'error'; items?:any[]; msg?:string; nombre:string; truncated?:boolean }
const _scanMap = new Map<string, ScanState>()
const _scanCbs = new Set<()=>void>()
const setScan = (id:string, s:ScanState) => { _scanMap.set(id,s); _scanCbs.forEach(f=>f()) }
const clearScan = (id:string) => { _scanMap.delete(id); _scanCbs.forEach(f=>f()) }
function useScanStore() {
  const [,tick] = useState(0)
  useEffect(()=>{ const f=()=>tick(n=>n+1); _scanCbs.add(f); return()=>{ _scanCbs.delete(f) } },[])
  return _scanMap
}
import {
  supabase, getPedidos, createPedido, updateEstadoPedido, updatePedido, deletePedido,
  getMateriales, getProveedores, createProveedor, updateProveedor, deleteProveedor,
  createMaterial, updateMaterial, deleteMaterial, bulkUpsertClientes, bulkUpsertMateriales,
  getListaCompras, getHojasRuta, marcarAtrasados, subscribeToEstados,
  getListaPrecios, saveListaPrecios, getPreciosActivos,
  getEmpresa, updateEmpresa, getVendedores, crearVendedor, eliminarVendedor,
  registrarActividad, getActividad, type Actividad,
  getClientes, createCliente, updateCliente, deleteCliente, getSaldoCliente, registrarCCMov,
  getCCMovimientos, getComprobantesCliente, getSaldosCC, type CCMov,
  getComprobantes, getComprobante, buscarComprobantes, createComprobante, deleteComprobante, proximoNumero,
  emitirRemito, getRemitosDeFactura, type RemitoLinea,
  getCaja, createCajaMov, updateCajaMov, deleteCajaMov, getResumenGestion,
  CATEGORIAS_INGRESO, CATEGORIAS_EGRESO,
  type Pedido, type EstadoPedido, type Material, type Proveedor,
  type ItemListaCompras, type ItemHojaRuta, type ListaPrecios, type ListaPreciosItem,
  type EmpresaConfig, type Cliente, type Vendedor, type Comprobante, type ComprobanteItem, type TipoComprobante, type CajaMov
} from '@/lib/supabase'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const C = {
  bg:'#0F1117',surface:'#1A1D27',surfaceAlt:'#21263A',border:'#2A2F45',
  accent:'#F5A623',accentDim:'#3D2D0A',blue:'#4A90E2',blueDim:'#0E2040',
  green:'#27AE60',greenDim:'#0A2615',red:'#E74C3C',redDim:'#2D0B09',
  purple:'#8E44AD',purpleDim:'#1E0A2D',text:'#E8ECF4',textMuted:'#7B8299',textDim:'#4A5068',
}
const ESTADOS: Record<EstadoPedido, {label:string;color:string;bg:string;icon:string}> = {
  pendiente:   {label:'Pendiente',      color:C.blue,   bg:C.blueDim,   icon:'⏳'},
  preparacion: {label:'En Preparación', color:C.accent, bg:C.accentDim, icon:'🔧'},
  urgente:     {label:'Urgente',        color:C.red,    bg:C.redDim,    icon:'🚨'},
  entregado:   {label:'Entregado',      color:C.green,  bg:C.greenDim,  icon:'✅'},
  atrasado:    {label:'Atrasado',       color:C.purple, bg:C.purpleDim, icon:'⚠️'},
  cancelado:   {label:'Cancelado',      color:C.textMuted, bg:C.surfaceAlt, icon:'🚫'},
}

// Formato seguro de hora/fecha (pueden venir vacías en pedidos incompletos)
const fmtHora = (h?: string|null) => h ? h.slice(0,5) : '—'
const fmtFecha = (f?: string|null) => f || 'sin fecha'

// Operador activo (quién está usando esta PC) — persistido por dispositivo
const getOperador = ():string => { try{ return localStorage.getItem('logiobra_operador')||'' }catch{ return '' } }
const logAct = (accion:string, entidad:string, detalle:string, id?:string) => { registrarActividad(getOperador()||'(sin operador)', accion, entidad, detalle, id) }

// ─── UI PRIMITIVOS ────────────────────────────────────────────────────────────
function Badge({estado}:{estado:EstadoPedido}) {
  const e = ESTADOS[estado]
  return <span style={{background:e.bg,color:e.color,border:`1px solid ${e.color}40`,
    borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:700,
    display:'inline-flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
    {e.icon} {e.label}</span>
}

function Btn({children,onClick,variant='primary',size='md',style:s={},disabled=false}:any) {
  const base:any = {border:'none',borderRadius:8,cursor:disabled?'not-allowed':'pointer',
    fontFamily:'inherit',fontWeight:700,display:'inline-flex',alignItems:'center',
    gap:6,transition:'opacity 0.15s',opacity:disabled?0.5:1}
  const variants:any = {
    primary:{background:C.accent,color:'#000',padding:size==='sm'?'6px 12px':'11px 18px',fontSize:size==='sm'?13:15},
    secondary:{background:C.surfaceAlt,color:C.text,border:`1px solid ${C.border}`,padding:size==='sm'?'6px 12px':'11px 18px',fontSize:size==='sm'?13:14},
    danger:{background:C.redDim,color:C.red,border:`1px solid ${C.red}40`,padding:'6px 12px',fontSize:13},
    ghost:{background:'transparent',color:C.textMuted,padding:'6px 10px',fontSize:13},
  }
  return <button onClick={onClick} disabled={disabled} style={{...base,...variants[variant],...s}}>{children}</button>
}

function Input({label,value,onChange,type='text',placeholder='',required=false}:any) {
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    {label && <label style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>{label.toUpperCase()}{required&&' *'}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required}
      style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,
        padding:'10px 12px',color:C.text,fontSize:14,width:'100%',outline:'none'}} />
  </div>
}

function Select({label,value,onChange,options,placeholder='Seleccionar...'}:any) {
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    {label && <label style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>{label.toUpperCase()}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,
        padding:'10px 12px',color:value?C.text:C.textMuted,fontSize:14,outline:'none'}}>
      <option value="">{placeholder}</option>
      {options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
}

function Modal({onClose,children,title}:{onClose:()=>void;children:any;title?:string}) {
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'#000C',
    zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center',
    padding:'0'}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,
      border:`1px solid ${C.border}`,borderRadius:'16px 16px 0 0',
      padding:24,width:'100%',maxWidth:640,maxHeight:'90vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        {title && <h3 style={{color:C.text,fontSize:18,fontWeight:800}}>{title}</h3>}
        <button onClick={onClose} style={{background:C.surfaceAlt,border:'none',color:C.text,
          width:32,height:32,borderRadius:8,cursor:'pointer',fontSize:16,marginLeft:'auto'}}>✕</button>
      </div>
      {children}
    </div>
  </div>
}

function Toast({msg,type='ok',onDone}:{msg:string;type?:string;onDone:()=>void}) {
  useEffect(()=>{const t=setTimeout(onDone,2800);return()=>clearTimeout(t)},[onDone])
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',
    background:type==='error'?C.redDim:C.greenDim,color:type==='error'?C.red:C.green,
    border:`1px solid ${type==='error'?C.red:C.green}40`,borderRadius:10,padding:'10px 20px',
    fontSize:14,fontWeight:700,zIndex:2000,whiteSpace:'nowrap',boxShadow:'0 4px 24px #0008'}}>
    {type==='error'?'⚠️':'✅'} {msg}</div>
}

function Spinner() {
  return <div style={{display:'flex',justifyContent:'center',padding:40,color:C.textMuted}}>
    <div style={{width:32,height:32,border:`3px solid ${C.border}`,
      borderTop:`3px solid ${C.accent}`,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
}

// ─── PANELES (uno por módulo) ─────────────────────────────────────────────────
function PCard({icon,label,val,color}:{icon:string;label:string;val:any;color:string}){
  const s=String(val)
  const fs = s.length>11?15 : s.length>8?17 : 20
  return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'13px 14px',minWidth:0}}>
    <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
    <div style={{fontSize:fs,fontWeight:800,color,fontFamily:"'Space Mono',monospace",lineHeight:1.15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={s}>{val}</div>
    <div style={{fontSize:11,color:C.textMuted,fontWeight:600,marginTop:2}}>{label}</div>
  </div>
}
function PanelHead({titulo}:{titulo:string}){
  return <>
    <h2 style={{color:C.text,fontSize:20,fontWeight:800,marginBottom:4}}>{titulo}</h2>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:18}}>
      {new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
  </>
}
function Atencion({titulo,children}:{titulo:string;children:any}){
  return <><h3 style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:1,textTransform:'uppercase',margin:'18px 0 10px'}}>{titulo}</h3>{children}</>
}

function Dashboard({modulo,pedidos,clientes,materiales}:{modulo:string;pedidos:Pedido[];clientes:any[];materiales:any[]}){
  if(modulo==='logistica') return <PanelLogistica pedidos={pedidos}/>
  if(modulo==='caja') return <PanelCaja/>
  return <PanelGestion pedidos={pedidos} clientes={clientes} materiales={materiales}/>
}

// ── Panel GESTIÓN ──
function PanelGestion({pedidos,clientes,materiales}:{pedidos:Pedido[];clientes:any[];materiales:any[]}){
  const [res,setRes]=useState<{comprobantesTotal:number;ventasMes:number;cantMes:number;cajaSaldo:number}|null>(null)
  useEffect(()=>{ getResumenGestion().then(setRes).catch(()=>{}) },[])
  const sinStockArr = materiales.filter((m:any)=>(m.stock??0)<=0)
  const sinTel = clientes.filter((c:any)=>!c.telefono).length
  return <div>
    <PanelHead titulo="Panel · Gestión"/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:8}}>
      <PCard icon="💰" label={`Ventas del mes (${res?.cantMes??0})`} val={moneyC(res?.ventasMes??0)} color={C.green}/>
      <PCard icon="🧾" label="Comprobantes" val={(res?.comprobantesTotal??0).toLocaleString('es-AR')} color={C.blue}/>
      <PCard icon="👥" label="Clientes" val={clientes.length} color={C.blue}/>
      <PCard icon="📦" label="Productos" val={materiales.length} color={C.accent}/>
      <PCard icon="⚠️" label="Sin stock" val={sinStockArr.length} color={sinStockArr.length>0?C.red:C.green}/>
      <PCard icon="💵" label="Caja (saldo)" val={moneyC(res?.cajaSaldo??0)} color={res&&res.cajaSaldo<0?C.red:C.accent}/>
    </div>
    {sinStockArr.length>0&&<Atencion titulo="🔔 Requieren atención">
      <div style={{background:C.surfaceAlt,border:`1px solid ${C.accent}40`,borderRadius:10,padding:'12px 16px'}}>
        <div style={{color:C.accent,fontWeight:700,fontSize:13,marginBottom:6}}>📦 {sinStockArr.length} productos sin stock</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {sinStockArr.slice(0,12).map((m:any)=><span key={m.id} style={{background:C.redDim,color:C.red,borderRadius:5,padding:'2px 8px',fontSize:11}}>{m.nombre}</span>)}
          {sinStockArr.length>12&&<span style={{color:C.textDim,fontSize:11}}>+{sinStockArr.length-12} más</span>}
        </div>
      </div>
    </Atencion>}
    {sinStockArr.length===0&&<div style={{background:C.greenDim,border:`1px solid ${C.green}40`,borderRadius:10,padding:'14px 18px',color:C.green,fontWeight:700,textAlign:'center',marginTop:14}}>✅ Stock al día</div>}
  </div>
}

// ── Panel LOGÍSTICA ──
function PanelLogistica({pedidos}:{pedidos:Pedido[]}){
  const activos = pedidos.filter(p=>p.estado!=='entregado'&&p.estado!=='cancelado')
  const stats={ activos:activos.length, urgentes:pedidos.filter(p=>p.estado==='urgente').length,
    entregados:pedidos.filter(p=>p.estado==='entregado').length, atrasados:pedidos.filter(p=>p.atrasado).length }
  const hoyStr=new Date().toISOString().slice(0,10)
  const entregasHoy=pedidos.filter(p=>p.fecha_entrega===hoyStr&&p.estado!=='entregado'&&p.estado!=='cancelado').length
  const totalCerrables=stats.entregados+stats.activos
  const pct=totalCerrables>0?Math.round(stats.entregados/totalCerrables*100):0
  const alertas=pedidos.filter(p=>p.estado==='urgente'||p.atrasado)
  return <div>
    <PanelHead titulo="Panel · Logística"/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,marginBottom:14}}>
      <PCard icon="📋" label="Pedidos activos" val={stats.activos} color={C.blue}/>
      <PCard icon="📅" label="Entregas hoy" val={entregasHoy} color={C.accent}/>
      <PCard icon="🚨" label="Urgentes" val={stats.urgentes} color={C.red}/>
      <PCard icon="⚠️" label="Atrasados" val={stats.atrasados} color={C.purple}/>
      <PCard icon="✅" label="Entregados" val={stats.entregados} color={C.green}/>
    </div>
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'14px 16px',marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
        <span style={{color:C.textMuted,fontSize:13}}>Progreso de entregas</span>
        <span style={{color:C.text,fontSize:13,fontWeight:700,fontFamily:"'Space Mono',monospace"}}>{pct}%</span>
      </div>
      <div style={{background:C.border,borderRadius:99,height:8}}>
        <div style={{background:`linear-gradient(90deg,${C.green},${C.blue})`,width:`${pct}%`,height:'100%',borderRadius:99,transition:'width 0.5s'}}/>
      </div>
    </div>
    {alertas.length>0&&<Atencion titulo="🔔 Requieren atención">
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {alertas.map(p=>{const e=ESTADOS[p.estado]; return <div key={p.id} style={{background:C.surfaceAlt,border:`1px solid ${e.color}40`,
          borderLeft:`3px solid ${e.color}`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div><div style={{color:C.text,fontWeight:700,fontSize:14}}>{p.cliente}</div>
            <div style={{color:C.textMuted,fontSize:12}}>📍 {p.direccion||'sin dirección'} · 🕐 {fmtHora(p.hora_entrega)}</div></div>
          <Badge estado={p.estado}/></div>})}
      </div>
    </Atencion>}
    {alertas.length===0&&pedidos.length>0&&<div style={{background:C.greenDim,border:`1px solid ${C.green}40`,borderRadius:10,padding:'14px 18px',color:C.green,fontWeight:700,textAlign:'center'}}>✅ Todo en orden, sin urgencias ni atrasos</div>}
  </div>
}

// ── Panel CAJA ──
function PanelCaja(){
  const [movs,setMovs]=useState<CajaMov[]>([])
  const [loading,setLoading]=useState(true)
  useEffect(()=>{ getCaja().then(d=>{setMovs(d);setLoading(false)}).catch(()=>setLoading(false)) },[])
  const saldo=movs.reduce((s,m)=>s+(m.tipo==='ingreso'?Number(m.monto):-Number(m.monto)),0)
  const mes=new Date().toISOString().slice(0,7)
  const delMes=movs.filter(m=>(m.fecha||'').startsWith(mes))
  const ing=delMes.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+Number(m.monto),0)
  const egr=delMes.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+Number(m.monto),0)
  const porCat:Record<string,number>={}
  delMes.filter(m=>m.tipo==='egreso').forEach(m=>{const k=m.categoria||'Sin categoría';porCat[k]=(porCat[k]||0)+Number(m.monto)})
  const topEgr=Object.entries(porCat).sort((a,b)=>b[1]-a[1]).slice(0,5)
  return <div>
    <PanelHead titulo="Panel · Caja"/>
    {loading&&<Spinner/>}
    {!loading&&<>
      <div style={{background:`linear-gradient(135deg,${saldo>=0?C.greenDim:C.redDim},${C.surfaceAlt})`,
        border:`1px solid ${(saldo>=0?C.green:C.red)}40`,borderRadius:12,padding:'16px 18px',marginBottom:12}}>
        <div style={{color:C.textMuted,fontSize:12,fontWeight:700}}>SALDO ACTUAL</div>
        <div style={{color:saldo>=0?C.green:C.red,fontSize:28,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>{money(saldo)}</div>
        {saldo<LOW_BALANCE&&<div style={{color:C.accent,fontSize:12,fontWeight:700,marginTop:4}}>⚠️ Saldo bajo (menos de {money(LOW_BALANCE)})</div>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:14}}>
        <PCard icon="📈" label="Ingresos del mes" val={moneyC(ing)} color={C.green}/>
        <PCard icon="📉" label="Egresos del mes" val={moneyC(egr)} color={C.red}/>
        <PCard icon="⚖️" label="Neto del mes" val={moneyC(ing-egr)} color={(ing-egr)>=0?C.green:C.red}/>
      </div>
      {topEgr.length>0&&<Atencion titulo="🔻 Mayores gastos del mes">
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px'}}>
          {topEgr.map(([cat,v])=><div key={cat} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}>
            <span style={{color:C.text}}>{cat}</span><span style={{color:C.red,fontFamily:"'Space Mono',monospace"}}>−{money(v)}</span></div>)}
        </div>
      </Atencion>}
      {delMes.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:30}}>Sin movimientos este mes</div>}
    </>}
  </div>
}

function parseArgPrecio(s: string): number {
  const c = s.replace(/[$\s ]/g,'').trim()
  const lc=c.lastIndexOf(','), ld=c.lastIndexOf('.')
  if(lc>ld) return parseFloat(c.replace(/\./g,'').replace(',','.'))
  if(ld>lc) return parseFloat(c.replace(/,/g,''))
  if(lc!==-1) return parseFloat(c.replace(',','.'))
  const p=c.split('.'); if(p.length===2&&p[1].length===3) return parseFloat(p.join(''))
  return parseFloat(c)
}

// ─── NUEVO PEDIDO FORM ────────────────────────────────────────────────────────
type ItemForm = {material_id:string;cantidad:string;hint?:string}

const DRAFT_KEY = 'logiobra_pedido_draft'
const FORM_VACIO = {cliente:'',direccion:'',zona:'',localidad:'',fecha_entrega:'',hora_entrega:'',observaciones:''}
function leerDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)||'null') } catch { return null }
}

function NuevoPedidoForm({materiales,onSave,onClose}:{materiales:(Material&{proveedores:Proveedor})[];onSave:()=>void;onClose:()=>void}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const draft = leerDraft()
  const [form,setForm] = useState(draft?.form || FORM_VACIO)
  const [items,setItems] = useState<ItemForm[]>(draft?.items || [{material_id:'',cantidad:''}])
  const [saving,setSaving] = useState(false)
  const [scanning,setScanning] = useState(false)
  const [previews,setPreviews] = useState<string[]>([])
  const [scanMsg,setScanMsg] = useState<{text:string;ok:boolean}|null>(null)
  const [errMsg,setErrMsg] = useState('')
  const set=(k:string,v:string)=>setForm((f:typeof FORM_VACIO)=>({...f,[k]:v}))

  // Guardar borrador automáticamente mientras se completa (sobrevive al cambio de pestaña)
  useEffect(()=>{
    const hayContenido = Object.values(form).some(v=>v) || items.some(i=>i.material_id||i.cantidad)
    try {
      if(hayContenido) localStorage.setItem(DRAFT_KEY,JSON.stringify({form,items}))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {}
  },[form,items])

  const limpiarDraft=()=>{ try{localStorage.removeItem(DRAFT_KEY)}catch{} }

  const addItem=()=>setItems(i=>[...i,{material_id:'',cantidad:''}])
  const removeItem=(idx:number)=>setItems(i=>i.filter((_,j)=>j!==idx))
  const setItem=(idx:number,k:string,v:string)=>setItems(i=>i.map((item,j)=>j===idx?{...item,[k]:v}:item))

  const handleSave=async()=>{
    // Se puede guardar incompleto: solo pedimos que haya algo cargado (nombre, dirección o algún material)
    const validItems=items.filter(i=>i.material_id&&i.cantidad)
    if(!form.cliente && !form.direccion && validItems.length===0){
      setErrMsg('Cargá al menos el cliente, la dirección o un material para guardar.')
      return
    }
    setErrMsg('')
    setSaving(true)
    try {
      const dirFull = form.localidad && form.direccion
        ? `${form.direccion}, ${form.localidad}`
        : (form.direccion || form.localidad)
      const mat=validItems.map(i=>({material_id:i.material_id,cantidad:parseFloat(i.cantidad)}))
      const np=await createPedido({...form,direccion:dirFull,items:mat})
      logAct('Creó','Pedido',`Pedido ${(np as any)?.codigo||''} · ${form.cliente||'sin nombre'}`,(np as any)?.id)
      limpiarDraft()
      onSave()
    } catch(e:any){
      console.error(e)
      setErrMsg(e?.message||'No se pudo guardar el pedido')
    } finally {setSaving(false)}
  }

  const handleFiles=async(files:FileList|null)=>{
    if(!files||!files.length) return
    const arr=Array.from(files)

    // Generar previews
    const urls=await Promise.all(arr.map(f=>new Promise<string>(res=>{
      const r=new FileReader(); r.onload=e=>res(e.target?.result as string); r.readAsDataURL(f)
    })))
    setPreviews(urls)
    setScanMsg(null)
    setScanning(true)

    try {
      const fd=new FormData()
      arr.forEach(f=>fd.append('imagenes',f))
      fd.append('materiales',JSON.stringify(materiales.map(m=>({id:m.id,nombre:m.nombre,unidad:m.unidad}))))

      const res=await fetch('/api/parse-pedido',{method:'POST',body:fd})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error||'Error al procesar')

      // Completar datos del cliente
      const c=data.cliente||{}
      if(c.nombre)    set('cliente',c.nombre)
      if(c.direccion) set('direccion',c.direccion)
      if(c.localidad) set('localidad',c.localidad)
      const obs=[c.telefono?`Tel: ${c.telefono}`:'',c.dni?`DNI: ${c.dni}`:'',c.cuit?`CUIT: ${c.cuit}`:''].filter(Boolean).join(' · ')
      if(obs) set('observaciones',obs)

      // Completar materiales
      const mats=data.materiales||[]
      if(mats.length) {
        setItems(mats.map((it:any)=>({
          material_id:it.material_id||'',
          cantidad:String(it.cantidad||1),
          hint:it.material_id?undefined:it.descripcion_original
        })))
      }

      const clienteOk=!!(c.nombre||c.direccion)
      const matsOk=mats.length>0
      const matched=mats.filter((i:any)=>i.material_id).length

      let msg=''
      if(clienteOk&&matsOk) msg=`Cliente y ${mats.length} material${mats.length>1?'es':''} cargados (${matched} identificado${matched!==1?'s':''})`
      else if(clienteOk)    msg=`Datos del cliente cargados`
      else if(matsOk)       msg=`${mats.length} material${mats.length>1?'es':''} encontrado${mats.length>1?'s':''} (${matched} identificado${matched!==1?'s':''})`
      else                  msg='No se encontró información reconocible'

      setScanMsg({text:msg, ok:clienteOk||matsOk})
    } catch(e:any) {
      setScanMsg({text:e.message,ok:false})
    } finally {
      setScanning(false)
    }
  }

  const zonas=['Norte','Sur','Centro','Este','Oeste']
  const matOptions=materiales.map(m=>({value:m.id,label:`${m.nombre} (${m.unidad})`}))

  return <div style={{display:'flex',flexDirection:'column',gap:14}}>

    {/* ── Escáner ── */}
    <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}}
      onChange={e=>handleFiles(e.target.files)} />

    <div onClick={()=>!scanning&&fileRef.current?.click()}
      style={{background:C.surfaceAlt,border:`2px dashed ${scanning?C.accent:C.border}`,
        borderRadius:12,padding:16,cursor:scanning?'wait':'pointer',
        transition:'border-color 0.2s',minHeight:80}}>

      {scanning ? (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:'8px 0'}}>
          <div style={{width:28,height:28,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,
            borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
          <span style={{color:C.accent,fontSize:13,fontWeight:700}}>Identificando información...</span>
        </div>
      ) : previews.length > 0 ? (
        <div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
            {previews.map((src,i)=><img key={i} src={src} alt=""
              style={{width:72,height:72,objectFit:'cover',borderRadius:8,border:`1px solid ${C.border}`}}/>)}
          </div>
          <div style={{color:C.textMuted,fontSize:11}}>Tocá para cambiar las fotos</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'4px 0'}}>
          <span style={{fontSize:32}}>📷</span>
          <span style={{color:C.text,fontSize:14,fontWeight:700}}>Cargar capturas</span>
          <span style={{color:C.textMuted,fontSize:11,textAlign:'center'}}>
            Podés subir una o más fotos (cliente, materiales, WhatsApp…)
          </span>
        </div>
      )}
    </div>

    {scanMsg&&<div style={{padding:'9px 13px',borderRadius:8,fontSize:12,fontWeight:600,
      background:scanMsg.ok?C.greenDim:C.redDim,
      color:scanMsg.ok?C.green:C.red,
      border:`1px solid ${scanMsg.ok?C.green:C.red}40`}}>
      {scanMsg.ok?'✅':'⚠️'} {scanMsg.text}
    </div>}

    <div style={{color:C.textDim,fontSize:11,marginTop:-4}}>Todos los campos son opcionales — podés guardar y completar después</div>
    <Input label="Cliente / Obra" value={form.cliente} onChange={(v:string)=>set('cliente',v)} />
    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10}}>
      <Input label="Dirección" value={form.direccion} onChange={(v:string)=>set('direccion',v)} />
      <Input label="Localidad" value={form.localidad} onChange={(v:string)=>set('localidad',v)} placeholder="Cipolletti..." />
    </div>
    <Select label="Zona" value={form.zona} onChange={(v:string)=>set('zona',v)}
      options={zonas.map(z=>({value:z,label:`Zona ${z}`}))} />
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Input label="Fecha de entrega" value={form.fecha_entrega} onChange={(v:string)=>set('fecha_entrega',v)} type="date" />
      <Input label="Hora" value={form.hora_entrega} onChange={(v:string)=>set('hora_entrega',v)} type="time" />
    </div>
    <Input label="Observaciones / Teléfono" value={form.observaciones} onChange={(v:string)=>set('observaciones',v)} />

    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <span style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>MATERIALES</span>
        <Btn onClick={addItem} variant="secondary" size="sm">+ Agregar</Btn>
      </div>
      {items.map((item,idx)=><div key={idx} style={{marginBottom:8}}>
        {item.hint&&<div style={{fontSize:10,color:C.accent,marginBottom:3,paddingLeft:2}}>
          📋 "{item.hint}" — seleccioná el material:
        </div>}
        <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
          <div style={{flex:2}}>
            <Select value={item.material_id} onChange={(v:string)=>setItem(idx,'material_id',v)}
              options={matOptions} placeholder="Material..." />
          </div>
          <div style={{flex:1}}>
            <Input value={item.cantidad} onChange={(v:string)=>setItem(idx,'cantidad',v)}
              type="number" placeholder="Cant." />
          </div>
          {items.length>1&&<Btn onClick={()=>removeItem(idx)} variant="danger" size="sm">✕</Btn>}
        </div>
      </div>)}
    </div>

    {errMsg&&<div style={{padding:'9px 13px',borderRadius:8,fontSize:12,fontWeight:600,
      background:C.redDim,color:C.red,border:`1px solid ${C.red}40`}}>⚠️ {errMsg}</div>}

    <div style={{color:C.textDim,fontSize:11,textAlign:'center',marginTop:2}}>
      💾 El borrador se guarda solo — podés salir y volver a completarlo
    </div>
    <div style={{display:'flex',gap:10,marginTop:2}}>
      <Btn onClick={()=>{limpiarDraft();setForm(FORM_VACIO);setItems([{material_id:'',cantidad:''}]);onClose()}}
        variant="danger" style={{flex:1}}>🗑️ Descartar</Btn>
      <Btn onClick={onClose} variant="secondary" style={{flex:1}}>Cerrar</Btn>
      <Btn onClick={handleSave} disabled={saving||scanning} style={{flex:2}}>
        {saving?'Guardando...':'💾 Guardar'}
      </Btn>
    </div>
  </div>
}

// ─── EDITAR PEDIDO (detalle editable) ─────────────────────────────────────────
function EditarPedido({pedido,onClose,onRefresh,onDelete}:{
  pedido:Pedido; onClose:()=>void; onRefresh:()=>void; onDelete:(p:Pedido)=>void}) {
  const limpio = (s?:string|null)=>(s||'').replace(/\s*⟦procesado⟧/g,'').trim()
  const [form,setForm]=useState({
    cliente:pedido.cliente||'', direccion:limpio(pedido.direccion), zona:pedido.zona||'',
    fecha_entrega:pedido.fecha_entrega||'', hora_entrega:(pedido.hora_entrega||'').slice(0,5),
    observaciones:limpio(pedido.observaciones), estado:pedido.estado as EstadoPedido})
  const [saving,setSaving]=useState(false)
  const [msg,setMsg]=useState('')
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))

  const guardar=async()=>{
    setSaving(true); setMsg('')
    try {
      await updatePedido(pedido.id,{
        cliente:form.cliente||'Sin nombre',
        direccion:form.direccion, zona:form.zona,
        fecha_entrega:form.fecha_entrega, hora_entrega:form.hora_entrega,
        observaciones:form.observaciones, estado:form.estado})
      onRefresh()
      setMsg('✅ Guardado — los cambios se reflejan en todas las pestañas')
    } catch(e:any){ setMsg('⚠️ '+(e?.message||'No se pudo guardar')) }
    finally{ setSaving(false) }
  }

  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <Input label="Cliente / Obra" value={form.cliente} onChange={(v:string)=>set('cliente',v)} />
    <Input label="Dirección" value={form.direccion} onChange={(v:string)=>set('direccion',v)} />
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Input label="Zona / Localidad" value={form.zona} onChange={(v:string)=>set('zona',v)} placeholder="Cipolletti..." />
      <Select label="Estado" value={form.estado} onChange={(v:string)=>set('estado',v)}
        options={(Object.keys(ESTADOS) as EstadoPedido[]).map(k=>({value:k,label:`${ESTADOS[k].icon} ${ESTADOS[k].label}`}))} />
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Input label="Fecha de entrega" value={form.fecha_entrega} onChange={(v:string)=>set('fecha_entrega',v)} type="date" />
      <Input label="Hora" value={form.hora_entrega} onChange={(v:string)=>set('hora_entrega',v)} type="time" />
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      <label style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>OBSERVACIONES / TELÉFONO / MATERIALES</label>
      <textarea value={form.observaciones} onChange={e=>set('observaciones',e.target.value)}
        style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,
          padding:'10px 12px',color:C.text,fontSize:13,minHeight:80,resize:'vertical',
          outline:'none',fontFamily:'inherit'}} />
    </div>

    {/* Materiales enlazados (solo lectura) */}
    {pedido.pedido_items&&pedido.pedido_items.length>0&&<div>
      <div style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5,marginBottom:8}}>MATERIALES ENLAZADOS</div>
      {pedido.pedido_items.map((item,i)=><div key={i} style={{
        background:C.surfaceAlt,borderRadius:7,padding:'8px 12px',marginBottom:6,
        display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{color:C.text,fontSize:13,fontWeight:600}}>{item.materiales?.nombre}</div>
          <div style={{color:C.textMuted,fontSize:11}}>{item.materiales?.proveedores?.nombre}</div>
        </div>
        <div style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>
          {item.cantidad} {item.materiales?.unidad}</div>
      </div>)}
    </div>}

    {msg&&<div style={{padding:'8px 12px',borderRadius:7,fontSize:12,fontWeight:600,
      background:msg.startsWith('✅')?C.greenDim:C.redDim,
      color:msg.startsWith('✅')?C.green:C.red,
      border:`1px solid ${msg.startsWith('✅')?C.green:C.red}40`}}>{msg}</div>}

    <div style={{display:'flex',gap:10}}>
      <Btn onClick={()=>onDelete(pedido)} variant="danger" style={{flex:1}}>🗑️ Borrar</Btn>
      <Btn onClick={guardar} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar cambios'}</Btn>
    </div>
  </div>
}

// ─── PEDIDOS VIEW ─────────────────────────────────────────────────────────────
function PedidosView({pedidos,materiales,onRefresh}:{pedidos:Pedido[];materiales:(Material&{proveedores:Proveedor})[];onRefresh:()=>void}) {
  const [filtro,setFiltro]=useState<string>('todos')
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState<Pedido|null>(null)
  // Si quedó un borrador a medio cargar, reabrir el modal automáticamente al volver
  const [showNuevo,setShowNuevo]=useState(()=>!!leerDraft())
  const [changing,setChanging]=useState<string|null>(null)
  const [seleccionados,setSeleccionados]=useState<Set<string>>(new Set())
  const [bulkChanging,setBulkChanging]=useState(false)

  const filtered=pedidos.filter(p=>{
    const mf=filtro==='todos'||p.estado===filtro||(filtro==='atrasado'&&p.atrasado)
    const q=search.toLowerCase()
    const ms=(p.cliente||'').toLowerCase().includes(q)||
      (p.codigo||'').toLowerCase().includes(q)||
      (p.zona||'').toLowerCase().includes(q)
    return mf&&ms
  })

  const toggleSel=(id:string)=>setSeleccionados(s=>{
    const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n
  })
  const todosSeleccionados=filtered.length>0&&filtered.every(p=>seleccionados.has(p.id))
  const selAll=()=>setSeleccionados(todosSeleccionados?new Set():new Set(filtered.map(p=>p.id)))

  const handleEstado=async(id:string,estado:EstadoPedido)=>{
    setChanging(id)
    try { await updateEstadoPedido(id,estado); onRefresh() }
    catch(e){console.error(e)} finally {setChanging(null)}
  }

  const handleBulkEstado=async(estado:EstadoPedido)=>{
    if(!seleccionados.size||bulkChanging) return
    setBulkChanging(true)
    try {
      await Promise.all([...seleccionados].map(id=>updateEstadoPedido(id,estado)))
      setSeleccionados(new Set())
      onRefresh()
    } catch(e){console.error(e)} finally{setBulkChanging(false)}
  }

  const handleDelete=async(p:Pedido)=>{
    if(!confirm(`¿Borrar el pedido ${p.codigo} de "${p.cliente}"?\n\nEsta acción no se puede deshacer.`)) return
    try { await deletePedido(p.id); logAct('Borró','Pedido',`Pedido ${p.codigo} · ${p.cliente}`,p.id); setSelected(null); onRefresh() }
    catch(e){console.error(e); alert('No se pudo borrar el pedido')}
  }

  return <div style={{paddingBottom:seleccionados.size>0?100:0}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Pedidos</h2>
      <Btn onClick={()=>setShowNuevo(true)}>+ Nuevo</Btn>
    </div>

    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Buscar..."
      style={{width:'100%',background:C.surfaceAlt,border:`1px solid ${C.border}`,
        borderRadius:8,padding:'9px 12px',color:C.text,fontSize:14,marginBottom:12,outline:'none'}} />

    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
      {[['todos','Todos'],['urgente','Urgentes'],['atrasado','Atrasados'],
        ['preparacion','Preparando'],['pendiente','Pendiente'],['entregado','Entregado'],['cancelado','Cancelado']].map(([k,l])=>
        <button key={k} onClick={()=>setFiltro(k)} style={{
          background:filtro===k?C.accent:C.surfaceAlt,
          color:filtro===k?'#000':C.textMuted,
          border:`1px solid ${filtro===k?C.accent:C.border}`,
          borderRadius:6,padding:'5px 12px',fontSize:12,cursor:'pointer',fontWeight:filtro===k?700:400}}>
          {l}</button>
      )}
    </div>

    {/* Fila seleccionar todos */}
    {filtered.length>0&&<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,padding:'4px 2px'}}>
      <input type="checkbox" checked={todosSeleccionados} onChange={selAll}
        style={{width:16,height:16,cursor:'pointer'}}/>
      <span style={{color:C.textMuted,fontSize:12,flex:1}}>
        {seleccionados.size>0
          ?`${seleccionados.size} seleccionado${seleccionados.size>1?'s':''}`
          :`Seleccionar todos (${filtered.length})`}
      </span>
      {seleccionados.size>0&&<button onClick={()=>setSeleccionados(new Set())}
        style={{background:'none',border:'none',color:C.textMuted,fontSize:11,cursor:'pointer',padding:'0 4px'}}>
        ✕ Limpiar</button>}
    </div>}

    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {filtered.map(p=>{
        const e=ESTADOS[p.estado]
        const esSel=seleccionados.has(p.id)
        return <div key={p.id}
          style={{background:esSel?C.accentDim:C.surface,
            border:`1px solid ${esSel?C.accent:p.atrasado?C.purple:C.border}`,
            borderLeft:`4px solid ${e.color}`,borderRadius:10,padding:'14px 16px',
            transition:'background 0.15s,border-color 0.15s'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,marginBottom:10}}>
            <div style={{display:'flex',gap:10,alignItems:'flex-start',flex:1,minWidth:0}}>
              <input type="checkbox" checked={esSel} onChange={()=>toggleSel(p.id)}
                style={{width:16,height:16,cursor:'pointer',marginTop:3,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}>
                  <span style={{color:C.textDim,fontSize:11,fontFamily:"'Space Mono',monospace"}}>{p.codigo}</span>
                  {p.atrasado&&<span style={{background:C.purpleDim,color:C.purple,fontSize:10,padding:'1px 6px',borderRadius:4,fontWeight:700}}>ATRASADO</span>}
                </div>
                <div style={{color:C.text,fontWeight:700,fontSize:15,cursor:'pointer'}} onClick={()=>setSelected(p)}>{p.cliente}</div>
                <div style={{color:C.textMuted,fontSize:12,marginTop:2}}>📍 {p.direccion}</div>
                <div style={{color:C.textMuted,fontSize:12}}>🕐 {fmtHora(p.hora_entrega)} · 📅 {fmtFecha(p.fecha_entrega)} · 🗺️ {p.zona?`Zona ${p.zona}`:'sin zona'}</div>
              </div>
            </div>
            <Badge estado={p.estado}/>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {(Object.keys(ESTADOS) as EstadoPedido[]).filter(k=>k!==p.estado).map(k=>{const ec=ESTADOS[k]; return <button key={k}
              onClick={()=>handleEstado(p.id,k)} disabled={changing===p.id||bulkChanging}
              style={{background:ec.bg,color:ec.color,border:`1px solid ${ec.color}40`,
                borderRadius:5,padding:'3px 9px',fontSize:11,cursor:'pointer',fontWeight:600,
                opacity:(changing===p.id||bulkChanging)?0.6:1}}>
              → {ec.label}</button>})}
            <button onClick={()=>handleDelete(p)} title="Borrar pedido"
              style={{background:C.redDim,color:C.red,border:`1px solid ${C.red}40`,
                borderRadius:5,padding:'3px 9px',fontSize:11,cursor:'pointer',fontWeight:600,marginLeft:'auto'}}>
              🗑️</button>
          </div>
        </div>
      })}
      {filtered.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>Sin pedidos</div>}
    </div>

    {/* Barra de acciones masivas */}
    {seleccionados.size>0&&<div style={{
      position:'fixed',bottom:56,left:0,right:0,zIndex:200,
      background:C.surface,borderTop:`2px solid ${C.accent}`,
      padding:'10px 16px',boxShadow:'0 -4px 24px #000B'}}>
      <div style={{maxWidth:680,margin:'0 auto'}}>
        <div style={{color:C.accent,fontSize:12,fontWeight:700,marginBottom:8}}>
          ✓ {seleccionados.size} pedido{seleccionados.size>1?'s':''} seleccionado{seleccionados.size>1?'s':''}
          {bulkChanging?' · Aplicando...':''}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          {(Object.keys(ESTADOS) as EstadoPedido[]).map(k=>{const ec=ESTADOS[k]; return <button key={k}
            onClick={()=>handleBulkEstado(k)} disabled={bulkChanging}
            style={{background:ec.bg,color:ec.color,border:`1px solid ${ec.color}40`,
              borderRadius:6,padding:'5px 11px',fontSize:12,cursor:'pointer',fontWeight:700,
              opacity:bulkChanging?0.5:1}}>
            {ec.icon} {ec.label}</button>})}
          <button onClick={()=>setSeleccionados(new Set())} disabled={bulkChanging}
            style={{background:C.surfaceAlt,color:C.textMuted,border:`1px solid ${C.border}`,
              borderRadius:6,padding:'5px 11px',fontSize:12,cursor:'pointer',fontWeight:600,marginLeft:'auto'}}>
            Cancelar</button>
        </div>
      </div>
    </div>}

    {selected&&<Modal onClose={()=>setSelected(null)} title={`✏️ ${selected.codigo}`}>
      <EditarPedido pedido={selected} onClose={()=>setSelected(null)}
        onRefresh={onRefresh} onDelete={handleDelete} />
    </Modal>}

    {showNuevo&&<Modal onClose={()=>setShowNuevo(false)} title="Nuevo Pedido">
      <NuevoPedidoForm materiales={materiales} onClose={()=>setShowNuevo(false)}
        onSave={()=>{setShowNuevo(false);onRefresh()}}/>
    </Modal>}
  </div>
}

// ─── RUTAS VIEW ───────────────────────────────────────────────────────────────
function RutasView({pedidos}:{pedidos:Pedido[]}) {
  const zonas=Array.from(new Set(pedidos.map(p=>p.zona))).sort()
  const [zona,setZona]=useState(zonas[0]||'')
  useEffect(()=>{if(zonas.length&&!zona)setZona(zonas[0])},[zonas.length])

  const ruta=pedidos
    .filter(p=>p.zona===zona&&p.estado!=='entregado'&&p.estado!=='cancelado')
    .sort((a,b)=>{
      const p:any={urgente:0,atrasado:1,preparacion:2,pendiente:3,entregado:4}
      return (p[a.estado]??5)-(p[b.estado]??5)||(a.hora_entrega||'').localeCompare(b.hora_entrega||'')
    })

  return <div>
    <h2 style={{color:C.text,fontSize:20,fontWeight:800,marginBottom:4}}>Hojas de Ruta</h2>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Ordenadas por prioridad · Zona activa</p>

    <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
      {zonas.map(z=><button key={z} onClick={()=>setZona(z)} style={{
        background:zona===z?C.accent:C.surfaceAlt,
        color:zona===z?'#000':C.textMuted,
        border:`1px solid ${zona===z?C.accent:C.border}`,
        borderRadius:7,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
        🗺️ {z}</button>)}
    </div>

    {ruta.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>
      {zona?'✅ Todos los pedidos de esta zona están entregados':'Seleccioná una zona'}</div>}

    <div style={{display:'flex',flexDirection:'column'}}>
      {ruta.map((p,i)=>{const e=ESTADOS[p.estado]; return <div key={p.id} style={{display:'flex',gap:0}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginRight:14}}>
          <div style={{width:34,height:34,borderRadius:'50%',background:e.bg,border:`2px solid ${e.color}`,
            display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:e.color,fontSize:13,flexShrink:0}}>
            {i+1}</div>
          {i<ruta.length-1&&<div style={{width:2,flex:1,background:C.border,minHeight:24,margin:'3px 0'}}/>}
        </div>
        <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,
          padding:'12px 14px',marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:6}}>
            <div>
              <div style={{color:C.text,fontWeight:700,fontSize:14}}>{p.cliente}</div>
              <div style={{color:C.textMuted,fontSize:12}}>📍 {p.direccion}</div>
              <div style={{color:C.textMuted,fontSize:12}}>🕐 {fmtHora(p.hora_entrega)}</div>
            </div>
            <Badge estado={p.estado}/>
          </div>
          <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:5}}>
            {p.pedido_items?.map((it,j)=><span key={j} style={{background:C.surfaceAlt,color:C.textMuted,
              borderRadius:4,padding:'2px 8px',fontSize:11,border:`1px solid ${C.border}`}}>
              {it.cantidad} {it.materiales?.unidad} {it.materiales?.nombre}</span>)}
          </div>
        </div>
      </div>})}
    </div>

    {ruta.length>0&&<div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,
      borderRadius:10,padding:'12px 16px',marginTop:4}}>
      <div style={{color:C.accent,fontWeight:700,fontSize:13,marginBottom:4}}>📋 Resumen Zona {zona}</div>
      <div style={{color:C.textMuted,fontSize:13}}>
        {ruta.length} paradas · {ruta.reduce((a,p)=>a+(p.pedido_items?.length||0),0)} ítems totales</div>
    </div>}
  </div>
}

// ─── COMPRAS VIEW ─────────────────────────────────────────────────────────────
type FormaPago = 'lista'|'contado'|'transferencia'|'tarjeta'
const FORMAS_PAGO:{id:FormaPago;label:string;emoji:string}[]=[
  {id:'lista',label:'Lista',emoji:'📋'},
  {id:'contado',label:'Contado',emoji:'💵'},
  {id:'transferencia',label:'Transferencia',emoji:'🏦'},
  {id:'tarjeta',label:'Tarjeta',emoji:'💳'},
]

function ComprasView({pedidos,materiales,proveedores,onRefresh}:
  {pedidos:Pedido[];materiales:(Material&{proveedores:Proveedor})[];proveedores:any[];onRefresh:()=>void}) {

  const [showMat,setShowMat]=useState(false)
  const [matForm,setMatForm]=useState({nombre:'',unidad:'',precio_ref:'',proveedor_id:''})
  const [saving,setSaving]=useState(false)
  const [formaPago,setFormaPago]=useState<FormaPago>('lista')

  // Descuento del proveedor según forma de pago
  const getDescuento=(provId:string):number=>{
    const prov=proveedores.find((p:any)=>p.id===provId)
    if(!prov) return 0
    if(formaPago==='contado') return prov.descuento_contado||0
    if(formaPago==='transferencia') return prov.descuento_transferencia||0
    if(formaPago==='tarjeta') return prov.descuento_tarjeta||0
    return 0
  }

  // Calcular lista de compras desde pedidos activos
  const listaMap:Record<string,any>={}
  pedidos.filter(p=>p.estado!=='entregado'&&p.estado!=='cancelado').forEach(p=>{
    p.pedido_items?.forEach(item=>{
      const m=item.materiales; if(!m) return
      const k=m.id
      if(!listaMap[k]) listaMap[k]={
        nombre:m.nombre,unidad:m.unidad,precio_ref:m.precio_ref||0,
        proveedor:m.proveedores?.nombre||'Sin asignar',
        proveedor_id:m.proveedor_id||'',
        proveedor_tel:m.proveedores?.telefono||'',
        cantidad_total:0,pedidos:[]}
      listaMap[k].cantidad_total+=item.cantidad
      listaMap[k].pedidos.push(p.codigo)
    })
  })
  const lista=Object.values(listaMap)
  const porProv:Record<string,any[]>={}
  lista.forEach((i:any)=>{if(!porProv[i.proveedor])porProv[i.proveedor]=[];porProv[i.proveedor].push(i)})

  const calcPrecio=(precio:number,provId:string)=>precio*(1-getDescuento(provId)/100)
  const total=lista.reduce((a:number,i:any)=>a+calcPrecio(i.precio_ref,i.proveedor_id)*i.cantidad_total,0)
  const totalSinDesc=lista.reduce((a:number,i:any)=>a+i.precio_ref*i.cantidad_total,0)
  const ahorro=totalSinDesc-total

  const handleSaveMat=async()=>{
    if(!matForm.nombre||!matForm.unidad) return; setSaving(true)
    try {
      await createMaterial({nombre:matForm.nombre,unidad:matForm.unidad,
        precio_ref:matForm.precio_ref?parseFloat(matForm.precio_ref):undefined,
        proveedor_id:matForm.proveedor_id||undefined,activo:true})
      onRefresh(); setShowMat(false); setMatForm({nombre:'',unidad:'',precio_ref:'',proveedor_id:''})
    } catch(e){console.error(e)} finally{setSaving(false)}
  }

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Lista de Compras</h2>
      <Btn onClick={()=>setShowMat(true)} variant="secondary" size="sm">+ Material</Btn>
    </div>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Calculada automáticamente de pedidos activos</p>

    {/* Selector de forma de pago */}
    <div style={{display:'flex',gap:6,marginBottom:18,flexWrap:'wrap'}}>
      {FORMAS_PAGO.map(fp=><button key={fp.id} onClick={()=>setFormaPago(fp.id)} style={{
        background:formaPago===fp.id?C.accent:C.surfaceAlt,
        color:formaPago===fp.id?'#000':C.textMuted,
        border:`1px solid ${formaPago===fp.id?C.accent:C.border}`,
        borderRadius:7,padding:'6px 14px',fontSize:13,fontWeight:700,cursor:'pointer'}}>
        {fp.emoji} {fp.label}</button>)}
    </div>

    {/* Totales */}
    <div style={{background:`linear-gradient(135deg,${C.accentDim},${C.surfaceAlt})`,
      border:`1px solid ${C.accent}40`,borderRadius:12,padding:'18px 20px',marginBottom:22}}>
      <div style={{color:C.textMuted,fontSize:12,fontWeight:700,marginBottom:4}}>
        COSTO TOTAL · {FORMAS_PAGO.find(f=>f.id===formaPago)?.label.toUpperCase()}
      </div>
      <div style={{color:C.accent,fontSize:30,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>
        ${total.toLocaleString('es-AR',{maximumFractionDigits:0})}</div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:6,flexWrap:'wrap',gap:6}}>
        <div style={{color:C.textMuted,fontSize:13}}>
          {lista.length} productos · {Object.keys(porProv).length} proveedores</div>
        {ahorro>0&&<div style={{color:C.green,fontSize:13,fontWeight:700}}>
          🏷️ Ahorro: ${ahorro.toLocaleString('es-AR',{maximumFractionDigits:0})}</div>}
      </div>
    </div>

    {Object.entries(porProv).map(([prov,items])=>{
      const provId=(items as any[])[0]?.proveedor_id||''
      const desc=getDescuento(provId)
      const subtotalBase=(items as any[]).reduce((a,i)=>a+i.precio_ref*i.cantidad_total,0)
      const subtotal=(items as any[]).reduce((a,i)=>a+calcPrecio(i.precio_ref,provId)*i.cantidad_total,0)
      const provInfo=proveedores.find((p:any)=>p.nombre===prov)
      return <div key={prov} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:14,overflow:'hidden'}}>
        <div style={{background:C.surfaceAlt,padding:'12px 16px',
          display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{color:C.text,fontWeight:800,fontSize:15}}>🏭 {prov}</div>
            {provInfo?.telefono&&<div style={{color:C.textMuted,fontSize:12}}>📞 {provInfo.telefono}</div>}
            {desc>0&&<div style={{color:C.green,fontSize:12,fontWeight:700}}>🏷️ {desc}% descuento</div>}
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{color:C.accent,fontWeight:800,fontFamily:"'Space Mono',monospace",fontSize:16}}>
              ${subtotal.toLocaleString('es-AR',{maximumFractionDigits:0})}</div>
            {desc>0&&<div style={{color:C.textMuted,fontSize:11,textDecoration:'line-through'}}>
              ${subtotalBase.toLocaleString('es-AR',{maximumFractionDigits:0})}</div>}
          </div>
        </div>
        <div style={{padding:'10px 16px',display:'flex',flexDirection:'column',gap:8}}>
          {(items as any[]).map((item,i)=>{
            const precioFinal=calcPrecio(item.precio_ref,provId)
            return <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6}}>
              <div>
                <div style={{color:C.text,fontSize:14,fontWeight:600}}>{item.nombre}</div>
                <div style={{color:C.textDim,fontSize:11}}>{item.pedidos.join(', ')}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{color:C.text,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>
                  {item.cantidad_total} {item.unidad}</div>
                {precioFinal>0&&<div style={{color:C.accent,fontSize:12}}>
                  ${(precioFinal*item.cantidad_total).toLocaleString('es-AR',{maximumFractionDigits:0})}
                  {desc>0&&<span style={{color:C.textMuted,fontSize:10,marginLeft:4,textDecoration:'line-through'}}>
                    ${(item.precio_ref*item.cantidad_total).toLocaleString('es-AR',{maximumFractionDigits:0})}</span>}
                </div>}
              </div>
            </div>
          })}
        </div>
      </div>
    })}

    {lista.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>
      No hay materiales pendientes de comprar</div>}

    {showMat&&<Modal onClose={()=>setShowMat(false)} title="Nuevo Material">
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <Input label="Nombre del material" value={matForm.nombre} onChange={(v:string)=>setMatForm(f=>({...f,nombre:v}))} required />
        <Input label="Unidad (bolsas, m³, u, barras...)" value={matForm.unidad} onChange={(v:string)=>setMatForm(f=>({...f,unidad:v}))} required />
        <Input label="Precio de referencia (por unidad)" value={matForm.precio_ref} onChange={(v:string)=>setMatForm(f=>({...f,precio_ref:v}))} type="number" />
        <Select label="Proveedor" value={matForm.proveedor_id} onChange={(v:string)=>setMatForm(f=>({...f,proveedor_id:v}))}
          options={proveedores.map((p:any)=>({value:p.id,label:p.nombre}))} />
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={()=>setShowMat(false)} variant="secondary" style={{flex:1}}>Cancelar</Btn>
          <Btn onClick={handleSaveMat} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar'}</Btn>
        </div>
      </div>
    </Modal>}
  </div>
}

// ─── PEGAR LISTA DE PRECIOS ───────────────────────────────────────────────────
function PasteListaPrecios({materiales,onDone}:{materiales:any[];onDone:(items:any[])=>void}) {
  const [text,setText]=useState('')
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState('')

  const handleParse=async()=>{
    if(!text.trim()) return
    setLoading(true); setErr('')
    try {
      const fd=new FormData()
      const blob=new Blob([text],{type:'text/plain'})
      fd.append('archivo',blob,'lista.txt')
      fd.append('materiales',JSON.stringify(materiales.map((m:any)=>({id:m.id,nombre:m.nombre,unidad:m.unidad}))))
      const res=await fetch('/api/parse-lista-precios',{method:'POST',body:fd})
      const raw=await res.text()
      let data:any
      try{data=JSON.parse(raw)}catch{throw new Error(raw.substring(0,200))}
      if(!res.ok) throw new Error(data.error||'Error')
      onDone(data.items||[])
      setText('')
    } catch(e:any){setErr(e.message)} finally{setLoading(false)}
  }

  return <div style={{display:'flex',flexDirection:'column',gap:8}}>
    <textarea value={text} onChange={e=>setText(e.target.value)}
      placeholder={'Pegá aquí el texto de la lista de precios\n(copiá el contenido del PDF, Excel o cualquier fuente)'}
      style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,
        padding:'10px 12px',color:C.text,fontSize:12,resize:'vertical',minHeight:100,
        outline:'none',fontFamily:'inherit'}} />
    {err&&<div style={{color:C.red,fontSize:11}}>{err}</div>}
    {text.trim()&&<Btn onClick={handleParse} disabled={loading} variant="secondary">
      {loading?'⏳ Procesando...':'🔍 Identificar productos'}
    </Btn>}
  </div>
}

function mergeItems(existing:any[], newItems:any[]):any[] {
  const seen=new Set(existing.map((i:any)=>i.descripcion_original?.toLowerCase().trim()))
  const fresh=newItems.filter((i:any)=>!seen.has(i.descripcion_original?.toLowerCase().trim()))
  return [...existing,...fresh]
}

// ─── PROVEEDOR DETAIL MODAL ───────────────────────────────────────────────────
function ProveedorDetail({proveedor,materiales,onClose,onRefresh}:{
  proveedor:any;materiales:any[];onClose:()=>void;onRefresh:()=>void}) {
  const fileRef=useRef<HTMLInputElement>(null)
  const lastFileRef=useRef<File|null>(null)
  const [tab,setTab]=useState<'datos'|'descuentos'|'precios'>('datos')
  const [form,setForm]=useState({
    nombre:proveedor.nombre||'',telefono:proveedor.telefono||'',
    direccion:proveedor.direccion||'',email:proveedor.email||'',notas:proveedor.notas||''})
  const [descuentos,setDescuentos]=useState({
    descuento_contado:proveedor.descuento_contado||0,
    descuento_transferencia:proveedor.descuento_transferencia||0,
    descuento_tarjeta:proveedor.descuento_tarjeta||0})
  const [lista,setLista]=useState<ListaPrecios|null>(null)
  const [loadingLista,setLoadingLista]=useState(false)
  const [parsedItems,setParsedItems]=useState<any[]|null>(null)
  const [scanning,setScanning]=useState(false)
  const [saving,setSaving]=useState(false)
  const [truncated,setTruncated]=useState(false)
  const [msg,setMsg]=useState<{text:string;ok:boolean}|null>(null)
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))
  const scans=useScanStore()

  // Al montar: verificar si hay un escaneo en progreso o completado para este proveedor
  useEffect(()=>{
    const scan=scans.get(proveedor.id)
    if(scan?.status==='done'&&scan.items){
      setParsedItems(scan.items)
      setTruncated(!!scan.truncated)
      setMsg({text:`✅ ${scan.items.length} productos listos${scan.msg||''}`,ok:true})
      clearScan(proveedor.id)
    } else if(scan?.status==='loading'){
      setScanning(true)
      setMsg({text:'⏳ Procesando en segundo plano...',ok:true})
    }
  },[])

  // Suscribirse a cambios del store (progreso en vivo y resultado final)
  useEffect(()=>{
    const checkStore=()=>{
      const scan=scans.get(proveedor.id)
      if(!scan) return
      if(scan.status==='loading'){
        // Mostrar progreso parcial mientras carga en segundo plano
        if(scan.items) setParsedItems(scan.items)
        setMsg({text:`⏳ Cargando... ${scan.msg||''}`,ok:true})
      } else if(scan.status==='done'&&scan.items){
        setScanning(false)
        setParsedItems(scan.items)
        setTruncated(!!scan.truncated)
        setMsg({text:`✅ ${scan.items.length} productos cargados — revisá y guardá`,ok:true})
        clearScan(proveedor.id)
      } else if(scan.status==='error'){
        setScanning(false)
        setMsg({text:`⚠️ ${scan.msg||'Error'}`,ok:false})
        clearScan(proveedor.id)
      }
    }
    _scanCbs.add(checkStore)
    return()=>{ _scanCbs.delete(checkStore) }
  },[proveedor.id])

  useEffect(()=>{
    if(tab==='precios'&&!lista&&!loadingLista){
      setLoadingLista(true)
      getListaPrecios(proveedor.id).then(l=>{setLista(l);setLoadingLista(false)}).catch(()=>setLoadingLista(false))
    }
  },[tab])

  const handleSaveDatos=async()=>{
    setSaving(true); setMsg(null)
    try { await updateProveedor(proveedor.id,form); onRefresh(); setMsg({text:'Guardado',ok:true}) }
    catch(e:any){setMsg({text:e.message,ok:false})} finally{setSaving(false)}
  }

  const handleSaveDescuentos=async()=>{
    setSaving(true); setMsg(null)
    try { await updateProveedor(proveedor.id,descuentos); onRefresh(); setMsg({text:'Descuentos guardados',ok:true}) }
    catch(e:any){setMsg({text:e.message,ok:false})} finally{setSaving(false)}
  }

  const handleDelete=async()=>{
    if(!confirm(`¿Eliminar ${proveedor.nombre}?`)) return
    try { await deleteProveedor(proveedor.id); onRefresh(); onClose() }
    catch(e:any){setMsg({text:'No se pudo eliminar',ok:false})}
  }

  // Una sola request al endpoint
  const fetchChunk=useCallback(async(file:File, opts:{continueAfter?:string;desdePagina?:number})=>{
    const fd=new FormData()
    fd.append('archivo',file)
    fd.append('materiales',JSON.stringify(materiales.map(m=>({id:m.id,nombre:m.nombre,unidad:m.unidad}))))
    if(opts.continueAfter) fd.append('continueAfter',opts.continueAfter)
    if(opts.desdePagina!=null) fd.append('desdePagina',String(opts.desdePagina))
    const res=await fetch('/api/parse-lista-precios',{method:'POST',body:fd})
    const text=await res.text()
    let data:any
    try{data=JSON.parse(text)}catch{throw new Error(`Error del servidor: ${text.substring(0,200)}`)}
    if(!res.ok) throw new Error(data.error||'Error')
    return data
  },[materiales])

  // Procesa el archivo completo: recorre páginas automáticamente si es un PDF largo
  const doFetch=useCallback((file:File, existingItems?:any[], continueAfter?:string)=>{
    setScanning(true)
    if(!existingItems?.length){ setParsedItems(null) }
    setScan(proveedor.id,{status:'loading',nombre:proveedor.nombre})

    ;(async()=>{
      let acumulados:any[]=existingItems||[]
      let desdePagina:number|undefined=undefined
      let nextContinue:string|undefined=continueAfter
      let vueltas=0

      while(vueltas<20){ // tope de seguridad
        vueltas++
        const data=await fetchChunk(file,{continueAfter:nextContinue,desdePagina})
        const nuevos=data.items||[]
        acumulados=mergeItems(acumulados,nuevos)

        // Progreso visible mientras carga en segundo plano
        const pag=data.pagina
        const progreso=pag
          ? ` (página ${pag.hasta}/${pag.total})`
          : ''
        setScan(proveedor.id,{status:'loading',items:acumulados,
          nombre:proveedor.nombre,msg:`${acumulados.length} productos${progreso}`})

        // ¿Continuar?
        if(data.nextPage!=null){
          // PDF paginado → seguir con la próxima página automáticamente
          desdePagina=data.nextPage
          continue
        } else if(data.truncated && nuevos.length>0 && !pag){
          // Texto/imagen truncado por tokens → continuar desde el último ítem
          nextContinue=acumulados[acumulados.length-1]?.descripcion_original||''
          continue
        }
        break // terminado
      }

      setScan(proveedor.id,{status:'done',items:acumulados,
        nombre:proveedor.nombre,truncated:false,
        msg:` · ✅ ${acumulados.length} productos en total`})
    })().catch((e:any)=>setScan(proveedor.id,{status:'error',msg:e.message,nombre:proveedor.nombre}))
  },[proveedor.id,fetchChunk])

  const handleArchivo=useCallback((file:File)=>{
    setScanning(true); setParsedItems(null); setMsg(null)
    lastFileRef.current=file
    doFetch(file)
  },[doFetch])

  const handleCargarMas=useCallback(()=>{
    if(!parsedItems||!lastFileRef.current) return
    const lastItem=parsedItems[parsedItems.length-1]?.descripcion_original||''
    doFetch(lastFileRef.current, parsedItems, lastItem)
  },[parsedItems,doFetch])

  const handleSaveLista=async()=>{
    if(!parsedItems?.length) return
    setSaving(true); setMsg(null)
    try {
      const nombre=`Lista ${new Date().toLocaleDateString('es-AR')}`
      await saveListaPrecios(proveedor.id,nombre,parsedItems.map(i=>{
        const base=parseArgPrecio(String(i.precio))||0
        const iva=parseFloat(i.iva)||0
        const precioFinal=base*(1+iva)
        return {
          material_id:i.material_id||null,
          descripcion_original:`${i.descripcion_original}${iva>0?` (+IVA ${iva*100}%)`:''}`,
          precio:parseFloat(precioFinal.toFixed(2)),
          unidad:i.unidad||undefined
        }
      }))
      const l=await getListaPrecios(proveedor.id); setLista(l)
      setParsedItems(null); onRefresh()
      setMsg({text:'Lista de precios guardada y precios actualizados',ok:true})
    } catch(e:any){setMsg({text:e.message,ok:false})} finally{setSaving(false)}
  }

  const TABS=[{id:'datos',label:'📋 Datos'},{id:'descuentos',label:'🏷️ Descuentos'},{id:'precios',label:'💰 Lista de precios'}]

  return <div style={{display:'flex',flexDirection:'column',gap:0}}>
    {/* Tabs */}
    <div style={{display:'flex',gap:4,marginBottom:16}}>
      {TABS.map(t=><button key={t.id} onClick={()=>{setTab(t.id as any);setMsg(null)}} style={{
        flex:1,padding:'8px 4px',fontSize:12,fontWeight:700,cursor:'pointer',
        background:tab===t.id?C.accent:C.surfaceAlt,
        color:tab===t.id?'#000':C.textMuted,
        border:`1px solid ${tab===t.id?C.accent:C.border}`,
        borderRadius:7}}>{t.label}</button>)}
    </div>

    {msg&&<div style={{marginBottom:12,padding:'8px 12px',borderRadius:7,fontSize:12,fontWeight:600,
      background:msg.ok?C.greenDim:C.redDim,color:msg.ok?C.green:C.red,
      border:`1px solid ${msg.ok?C.green:C.red}40`}}>
      {msg.ok?'✅':'⚠️'} {msg.text}</div>}

    {/* ── TAB DATOS ── */}
    {tab==='datos'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
      <Input label="Nombre" value={form.nombre} onChange={(v:string)=>set('nombre',v)} required />
      <Input label="Teléfono" value={form.telefono} onChange={(v:string)=>set('telefono',v)} type="tel" />
      <Input label="Dirección" value={form.direccion} onChange={(v:string)=>set('direccion',v)} />
      <Input label="Email" value={form.email} onChange={(v:string)=>set('email',v)} type="email" />
      <Input label="Notas" value={form.notas} onChange={(v:string)=>set('notas',v)} />
      <div style={{display:'flex',gap:10}}>
        <Btn onClick={handleDelete} variant="danger" style={{flex:1}}>🗑️ Eliminar</Btn>
        <Btn onClick={handleSaveDatos} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar cambios'}</Btn>
      </div>
    </div>}

    {/* ── TAB DESCUENTOS ── */}
    {tab==='descuentos'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
      <p style={{color:C.textMuted,fontSize:13,marginBottom:4}}>
        Configurá el descuento que te da este proveedor según la forma de pago. Se aplica automáticamente en el informe de compras.
      </p>
      {([['descuento_contado','💵 Pago en efectivo / contado'],
         ['descuento_transferencia','🏦 Transferencia bancaria'],
         ['descuento_tarjeta','💳 Tarjeta de crédito/débito']] as [keyof typeof descuentos,string][]).map(([k,label])=>
        <div key={k} style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{color:C.text,fontSize:13,flex:1}}>{label}</span>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="number" min="0" max="100" step="0.5"
              value={descuentos[k]}
              onChange={e=>setDescuentos(d=>({...d,[k]:parseFloat(e.target.value)||0}))}
              style={{width:64,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:7,
                padding:'8px 10px',color:C.text,fontSize:14,textAlign:'right',outline:'none'}} />
            <span style={{color:C.textMuted,fontSize:13}}>%</span>
          </div>
        </div>
      )}
      <Btn onClick={handleSaveDescuentos} disabled={saving}>{saving?'Guardando...':'💾 Guardar descuentos'}</Btn>
    </div>}

    {/* ── TAB LISTA DE PRECIOS ── */}
    {tab==='precios'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Upload */}
      <input ref={fileRef} type="file"
        accept=".xlsx,.xls,.csv,.ods,.pdf,.txt,.text,.jpg,.jpeg,.png,.webp"
        style={{display:'none'}} onChange={e=>e.target.files?.[0]&&handleArchivo(e.target.files[0])} />

      <div onClick={()=>!scanning&&fileRef.current?.click()}
        style={{background:C.surfaceAlt,border:`2px dashed ${scanning?C.accent:C.border}`,
          borderRadius:10,padding:16,cursor:scanning?'wait':'pointer',textAlign:'center',
          transition:'border-color 0.2s'}}>
        {scanning
          ? <><div style={{width:24,height:24,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,
              borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}}/>
             <div style={{color:C.accent,fontSize:13,fontWeight:700}}>Procesando archivo...</div></>
          : <><div style={{fontSize:28,marginBottom:6}}>📂</div>
             <div style={{color:C.text,fontSize:13,fontWeight:700}}>Cargar lista de precios</div>
             <div style={{color:C.textMuted,fontSize:11,marginTop:3}}>Excel · CSV · Texto · Imagen</div>
             <div style={{color:C.accent,fontSize:10,marginTop:2}}>PDF: puede tardar hasta 60s</div></>}
      </div>

      {/* Opción pegar texto */}
      {!scanning&&!parsedItems&&<div style={{marginTop:8}}>
        <div style={{color:C.textMuted,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:6,textAlign:'center'}}>
          — O PEGÁ EL TEXTO DIRECTO —
        </div>
        <PasteListaPrecios materiales={materiales} onDone={(items)=>{setParsedItems(items);setMsg({text:`${items.length} productos extraídos · Revisá y guardá`,ok:true})}} />
      </div>}

      {/* Previsualización de ítems parseados */}
      {parsedItems&&parsedItems.length>0&&<>
        {/* Header con IVA global */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div style={{color:C.textMuted,fontSize:11,fontWeight:700,letterSpacing:0.5}}>
            {parsedItems.length} PRODUCTOS EXTRAÍDOS
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{color:C.textMuted,fontSize:11}}>Aplicar IVA a todos:</span>
            {[{label:'Sin IVA',val:0},{label:'10.5%',val:0.105},{label:'21%',val:0.21}].map(o=>
              <button key={o.val} onClick={()=>setParsedItems(items=>items!.map(it=>({...it,iva:o.val})))}
                style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:5,
                  padding:'3px 8px',fontSize:11,color:C.text,cursor:'pointer',fontWeight:600}}>
                {o.label}
              </button>
            )}
          </div>
        </div>

        <div style={{maxHeight:300,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
          {parsedItems.map((item,i)=>{
            const iva=item.iva??0
            const precioBase=parseFloat(item.precio)||0
            const precioConIva=precioBase*(1+iva)
            return <div key={i} style={{
              background:C.surfaceAlt,borderRadius:7,padding:'9px 12px',
              borderLeft:`3px solid ${item.material_id?C.green:C.accent}`}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:120}}>
                  <div style={{color:C.text,fontSize:13,fontWeight:600}}>{item.descripcion_original}</div>
                  {item.material_id
                    ? <div style={{color:C.green,fontSize:11}}>→ {materiales.find(m=>m.id===item.material_id)?.nombre}</div>
                    : <div style={{color:C.accent,fontSize:11}}>⚠️ Sin enlazar</div>}
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
                  {/* Precio base */}
                  <input type="number" value={item.precio}
                    onChange={e=>setParsedItems(items=>items!.map((it,j)=>j===i?{...it,precio:e.target.value}:it))}
                    style={{width:80,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                      padding:'4px 8px',color:C.accent,fontSize:13,fontWeight:700,outline:'none',textAlign:'right'}} />
                  {/* Selector IVA */}
                  <select value={iva}
                    onChange={e=>setParsedItems(items=>items!.map((it,j)=>j===i?{...it,iva:parseFloat(e.target.value)}:it))}
                    style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                      padding:'4px 6px',color:iva>0?C.blue:C.textMuted,fontSize:11,outline:'none'}}>
                    <option value={0}>Sin IVA</option>
                    <option value={0.105}>+10.5%</option>
                    <option value={0.21}>+21%</option>
                  </select>
                  {/* Precio final */}
                  {iva>0&&<div style={{color:C.blue,fontWeight:700,fontSize:12,fontFamily:"'Space Mono',monospace",minWidth:60,textAlign:'right'}}>
                    ={precioConIva.toLocaleString('es-AR',{maximumFractionDigits:2})}
                  </div>}
                  {/* Material */}
                  <select value={item.material_id||''}
                    onChange={e=>setParsedItems(items=>items!.map((it,j)=>j===i?{...it,material_id:e.target.value||null}:it))}
                    style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                      padding:'4px 6px',color:C.text,fontSize:11,outline:'none',maxWidth:120}}>
                    <option value="">Sin enlazar</option>
                    {materiales.map(m=><option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>
            </div>
          })}
        </div>
        {truncated&&<Btn onClick={handleCargarMas} disabled={scanning} variant="secondary">
          {scanning?'⏳ Cargando más...':`📥 Cargar más productos (hay ${parsedItems.length} hasta ahora)`}
        </Btn>}
        <Btn onClick={handleSaveLista} disabled={saving}>
          {saving?'Guardando...':`💾 Guardar lista (${parsedItems.length} productos)`}
        </Btn>
      </>}

      {/* Lista actual */}
      {!parsedItems&&(loadingLista
        ? <Spinner/>
        : lista?.lista_precios_items?.length
          ? <>
              <div style={{color:C.textMuted,fontSize:11,fontWeight:700,letterSpacing:0.5}}>
                LISTA ACTUAL · {new Date(lista.created_at).toLocaleDateString('es-AR')}
                {' '}· {lista.lista_precios_items.length} PRODUCTOS
              </div>
              <div style={{maxHeight:300,overflowY:'auto',display:'flex',flexDirection:'column',gap:5}}>
                {lista.lista_precios_items.map((item,i)=><div key={i} style={{
                  background:C.surfaceAlt,borderRadius:7,padding:'8px 12px',
                  display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,
                  borderLeft:`3px solid ${item.material_id?C.blue:C.border}`}}>
                  <div>
                    <div style={{color:C.text,fontSize:13}}>{item.descripcion_original}</div>
                    {item.material_id&&<div style={{color:C.blue,fontSize:11}}>
                      → {(item as any).materiales?.nombre}</div>}
                  </div>
                  <div style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13,whiteSpace:'nowrap'}}>
                    ${item.precio.toLocaleString('es-AR')} {item.unidad&&`/ ${item.unidad}`}
                  </div>
                </div>)}
              </div>
            </>
          : <div style={{color:C.textMuted,textAlign:'center',padding:32,fontSize:13}}>
              No hay lista de precios cargada · Subí un archivo para comenzar
            </div>
      )}
    </div>}
  </div>
}

// ─── PROVEEDORES VIEW ─────────────────────────────────────────────────────────
function ProveedoresView({proveedores,materiales,onRefresh}:{proveedores:any[];materiales:any[];onRefresh:()=>void}) {
  const [show,setShow]=useState(false)
  const [selected,setSelected]=useState<any>(null)
  const [form,setForm]=useState({nombre:'',telefono:'',direccion:'',email:'',notas:''})
  const [saving,setSaving]=useState(false)
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))

  const handleSave=async()=>{
    if(!form.nombre) return; setSaving(true)
    try { await createProveedor(form); onRefresh(); setShow(false); setForm({nombre:'',telefono:'',direccion:'',email:'',notas:''}) }
    catch(e){console.error(e)} finally{setSaving(false)}
  }

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Proveedores</h2>
      <Btn onClick={()=>setShow(true)}>+ Proveedor</Btn>
    </div>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:20}}>Tocá un proveedor para editar, cargar lista de precios o configurar descuentos</p>

    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {proveedores.map((p:any)=><div key={p.id}
        onClick={()=>setSelected(p)}
        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,
          padding:'14px 16px',cursor:'pointer',transition:'border-color 0.2s'}}
        onMouseEnter={e=>(e.currentTarget.style.borderColor=C.accent)}
        onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
          <div style={{flex:1}}>
            <div style={{color:C.text,fontWeight:800,fontSize:15,marginBottom:4}}>🏭 {p.nombre}</div>
            {p.telefono&&<div style={{color:C.textMuted,fontSize:13}}>📞 {p.telefono}</div>}
            {p.direccion&&<div style={{color:C.textMuted,fontSize:13}}>📍 {p.direccion}</div>}
            {(p.descuento_contado>0||p.descuento_transferencia>0||p.descuento_tarjeta>0)&&
              <div style={{color:C.green,fontSize:12,marginTop:4,fontWeight:600}}>
                🏷️ {[p.descuento_contado>0&&`Contado ${p.descuento_contado}%`,
                      p.descuento_transferencia>0&&`Transf. ${p.descuento_transferencia}%`,
                      p.descuento_tarjeta>0&&`Tarjeta ${p.descuento_tarjeta}%`].filter(Boolean).join(' · ')}</div>}
            {p.materiales?.length>0&&<div style={{marginTop:8}}>
              <span style={{background:C.accentDim,color:C.accent,borderRadius:4,
                padding:'2px 9px',fontSize:11,fontWeight:600}}>
                📦 {p.materiales.length} {p.materiales.length===1?'producto':'productos'}</span>
            </div>}
          </div>
          <span style={{color:C.textMuted,fontSize:18}}>›</span>
        </div>
      </div>)}
    </div>

    {/* Modal nuevo proveedor */}
    {show&&<Modal onClose={()=>setShow(false)} title="Nuevo Proveedor">
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <Input label="Nombre" value={form.nombre} onChange={(v:string)=>set('nombre',v)} required />
        <Input label="Teléfono" value={form.telefono} onChange={(v:string)=>set('telefono',v)} type="tel" />
        <Input label="Dirección" value={form.direccion} onChange={(v:string)=>set('direccion',v)} />
        <Input label="Email" value={form.email} onChange={(v:string)=>set('email',v)} type="email" />
        <Input label="Notas" value={form.notas} onChange={(v:string)=>set('notas',v)} />
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={()=>setShow(false)} variant="secondary" style={{flex:1}}>Cancelar</Btn>
          <Btn onClick={handleSave} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar'}</Btn>
        </div>
      </div>
    </Modal>}

    {/* Modal detalle / edición */}
    {selected&&<Modal onClose={()=>{setSelected(null);onRefresh()}} title={selected.nombre}>
      <ProveedorDetail
        proveedor={proveedores.find(p=>p.id===selected.id)||selected}
        materiales={materiales}
        onClose={()=>setSelected(null)}
        onRefresh={onRefresh} />
    </Modal>}
  </div>
}

// ─── INDICADOR DE TAREAS EN SEGUNDO PLANO ─────────────────────────────────────
function BgTaskIndicator() {
  const scans = useScanStore()
  const loading = Array.from(scans.entries()).filter(([,s])=>s.status==='loading')
  if (loading.length === 0) return null
  return <div style={{
    position:'fixed',bottom:72,left:'50%',transform:'translateX(-50%)',
    background:C.surface,border:`1px solid ${C.accent}`,borderRadius:20,
    padding:'8px 16px',display:'flex',alignItems:'center',gap:10,
    zIndex:500,boxShadow:'0 4px 20px #0008',whiteSpace:'nowrap'}}>
    <div style={{width:14,height:14,border:`2px solid ${C.border}`,
      borderTop:`2px solid ${C.accent}`,borderRadius:'50%',
      animation:'spin 0.8s linear infinite',flexShrink:0}}/>
    <span style={{color:C.text,fontSize:12,fontWeight:700}}>
      Cargando lista: {loading.map(([,s])=>s.nombre).join(', ')}
    </span>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
}

// ═══ HELPERS ERP ════════════════════════════════════════════════════════════
const money = (n:number)=>'$ '+(Number(n)||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
// Compacto para tarjetas de panel: monto exacto sin centavos
const moneyC = (n:number)=>'$ '+Math.round(Number(n)||0).toLocaleString('es-AR')
const TIPOS_COMP: Record<TipoComprobante,{label:string;letra:string;leyenda:string}> = {
  presupuesto:  {label:'Presupuesto',    letra:'X',  leyenda:'Documento no válido como factura'},
  factura_x:    {label:'Factura X',      letra:'X',  leyenda:'Documento no válido como factura'},
  remito:       {label:'Remito',         letra:'R',  leyenda:'Documento no válido como factura'},
  recibo:       {label:'Recibo',         letra:'X',  leyenda:'Documento no válido como factura'},
  nota_credito: {label:'Nota de Crédito',letra:'NC', leyenda:'Documento no válido como factura'},
}
const fmtNumComp = (pv:number,num:number)=>`${String(pv||1).padStart(4,'0')}-${String(num||0).padStart(8,'0')}`
const CONDICIONES_IVA = ['Consumidor Final','Responsable Inscripto','Monotributo','Exento','IVA No Alcanzado']

// Logo del hornero (SVG). Si la empresa tiene logo_url, se usa esa imagen.
const LOGO_HORNERO = `<svg viewBox="0 0 120 120" width="74" height="74" xmlns="http://www.w3.org/2000/svg">
  <g fill="#1f5f78">
    <path d="M86 38c-2-8-9-14-18-14-7 0-13 3-17 9-2-1-4-1-6-1-3 0-5 2-5 4 0 1 1 2 2 3-6 4-10 11-10 19 0 4 1 8 3 11l-7 18c-1 2 0 3 2 3 1 0 2-1 3-2l7-15c4 3 9 5 15 5 14 0 25-11 25-25 0-3-1-6-2-9 4-2 8-5 10-9 1-1 0-3-2-3-1 0-2 0-3 1z"/>
  </g>
  <circle cx="78" cy="36" r="3.2" fill="#fff"/>
  <circle cx="78.5" cy="36.5" r="1.6" fill="#0e2c38"/>
  <path d="M92 36l14-4-12 9z" fill="#e8a23b"/>
  <path d="M40 88l-3 14M52 90l-2 13" stroke="#1f5f78" stroke-width="3" stroke-linecap="round"/>
  <rect x="20" y="100" width="80" height="4" rx="2" fill="#8a5a2b"/>
</svg>`

function imprimirComprobante(comp:Comprobante, empresa:EmpresaConfig|null){
  const t = TIPOS_COMP[comp.tipo]
  const cl:any = comp.clientes || {}
  const items = comp.comprobante_items || []
  const e = empresa || {} as EmpresaConfig
  const logo = e.logo_url ? `<img src="${e.logo_url}" style="max-width:90px;max-height:80px"/>` : LOGO_HORNERO
  const esRemito = comp.tipo==='remito'   // el remito es de entrega: sin precios ni totales
  const fila = (i:ComprobanteItem)=> esRemito
    ? `<tr><td class="c">${i.cantidad}</td><td>${i.codigo||''}</td><td>${i.detalle||''}</td></tr>`
    : `<tr>
    <td class="c">${i.cantidad}</td>
    <td>${i.codigo||''}</td>
    <td>${i.detalle||''}</td>
    <td class="r">${money(i.precio_unitario)}</td>
    <td class="r">${money(i.importe)}</td></tr>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${t.label} ${fmtNumComp(comp.punto_venta,comp.numero)}</title>
  <style>
    *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
    body{margin:0;padding:26px 30px;color:#1a1a1a;font-size:11px}
    .r{text-align:right}.c{text-align:center}
    .azul{color:#1c3f8f}
    .hdr{display:flex;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:10px}
    .hdr>div{flex:1}
    .big{font-size:48px;font-weight:800;text-align:center;line-height:.9}
    .sub{display:flex;justify-content:space-between;margin-top:10px;padding-bottom:10px;border-bottom:1px solid #aaa}
    .lbl{color:#1c3f8f}
    .cli{margin-top:10px;border-bottom:1px solid #aaa;padding-bottom:8px;display:flex;justify-content:space-between}
    table.items{width:100%;border-collapse:collapse;margin-top:6px}
    table.items th{border-bottom:1.5px solid #1a1a1a;text-align:left;padding:4px 6px;font-size:11px}
    table.items td{padding:3px 6px;font-size:11px;border:none}
    .foot{display:flex;justify-content:space-between;margin-top:24px;align-items:flex-start}
    table.tot{border-collapse:collapse;min-width:230px}
    table.tot td{padding:4px 10px;border:1px solid #ccc}
    table.tot tr:last-child td{font-weight:800;font-size:14px;background:#f3f3f3}
    .pie{text-align:center;color:#666;font-size:10px;margin-top:26px;border-top:1px solid #ccc;padding-top:6px}
  </style></head><body>

  <div class="hdr">
    <div style="text-align:center;max-width:120px">
      ${logo}
      <div style="font-weight:800;letter-spacing:1px;font-size:13px;margin-top:2px">${e.nombre||'HORNERO'}</div>
    </div>
    <div><div class="big">${t.letra}</div>
      <div class="c" style="font-size:9px;color:#444;margin-top:4px">${t.leyenda}</div></div>
    <div class="r">
      <div style="font-weight:800;font-size:15px">${fmtNumComp(comp.punto_venta,comp.numero)}</div>
      <div style="margin-top:6px"><b class="lbl">FECHA:</b> ${comp.fecha||''}</div>
    </div>
  </div>

  <div class="sub">
    <div style="max-width:46%">
      <div style="font-weight:800;font-size:13px">${e.nombre||'HORNERO'}</div>
      <div style="margin-top:6px">${e.direccion||''}</div>
      <div>${e.localidad||''}${e.provincia?', '+e.provincia:''}</div>
      <div>${e.telefono||''}</div>
      <div>${e.condicion_iva||''}</div>
    </div>
    <div class="c" style="padding-top:6px"><b>ORIGINAL</b></div>
    <div class="r">
      <div><b class="lbl">CUIT:</b> ${e.cuit||''}</div>
      <div><b class="lbl">Ingresos Brutos:</b> ${e.iibb||''}</div>
      <div><b class="lbl">Inicio de Actividad:</b> ${e.inicio_actividad||''}</div>
      <div style="margin-top:6px">${e.condicion_iva||''}</div>
    </div>
  </div>

  <div class="cli">
    <div style="line-height:1.6">
      <div><b class="lbl">Cliente:</b> ${comp.cliente_nombre||cl.nombre||''}</div>
      <div><b class="lbl">Dirección:</b> ${cl.direccion||''}</div>
      <div><b class="lbl">Localidad:</b> ${cl.localidad||''}　<b class="lbl">Provincia:</b> ${cl.provincia||''}</div>
      <div><b class="lbl">C.Postal:</b> ${cl.cp||''}</div>
      <div><b class="lbl">CUIT:</b> ${cl.cuit||''}　<b class="lbl">DNI:</b> ${cl.dni||''}　<b class="lbl">Contacto:</b> ${cl.telefono||''}</div>
      <div style="margin-top:4px"><b>${(comp.condicion_pago||'CONTADO').toUpperCase()}</b></div>
    </div>
    <div class="r" style="line-height:1.6;color:#444">
      <div><b class="lbl">Comprob.</b> ${comp.numero||''}</div>
      <div><b class="lbl">Vendedor</b> ${comp.vendedor||''}</div>
      <div><b class="lbl">IVA</b> ${cl.condicion_iva||'Consumidor Final'}</div>
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th class="c" style="width:55px">Cantidad</th><th style="width:90px">Código</th>
      <th>Detalle</th>${esRemito?'':'<th class="r" style="width:95px">P.Unitario</th><th class="r" style="width:100px">Importe</th>'}
    </tr></thead>
    <tbody>${items.map(fila).join('')}</tbody>
  </table>

  ${esRemito ? `
  <div class="foot">
    <div style="max-width:55%;font-size:10px;color:#333">
      <b>Obs.:</b> ${(comp.observaciones||e.pie_comprobante||'').replace(/\n/g,'<br>')}
    </div>
    <div style="text-align:center;font-size:10px;color:#333;min-width:240px;margin-top:30px">
      <div style="border-top:1px solid #1a1a1a;padding-top:5px">Recibí conforme — Firma y aclaración</div>
    </div>
  </div>` : `
  <div class="foot">
    <div style="max-width:55%;font-size:10px;color:#333">
      <b>Obs.:</b> ${(comp.observaciones||e.pie_comprobante||'').replace(/\n/g,'<br>')}
    </div>
    <table class="tot">
      <tr><td>Subtotal:</td><td class="r">${money(comp.subtotal)}</td></tr>
      ${Number(comp.descuento)>0?`<tr><td>Descuento${comp.descuento_pct?` (${String(comp.descuento_pct).replace('.',',')}%)`:''}:</td><td class="r">− ${money(comp.descuento)}</td></tr>`:''}
      ${Number(comp.percepciones)>0?`<tr><td>Percepciones:</td><td class="r">${money(comp.percepciones)}</td></tr>`:''}
      <tr><td>TOTAL: $</td><td class="r">${money(comp.total)}</td></tr>
    </table>
  </div>`}

  <div class="pie">Comprobante generado por Hornero — Sistema de Gestión</div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`
  const w = window.open('', '_blank')
  if(w){ w.document.write(html); w.document.close() }
}

// ─── CLIENTES VIEW ────────────────────────────────────────────────────────────
function ClienteForm({cliente,onSaved,onClose,onCreated,prefillNombre}:{cliente?:Cliente|null;onSaved:()=>void;onClose:()=>void;onCreated?:(c:Cliente)=>void;prefillNombre?:string}){
  const [f,setF]=useState({
    nombre:cliente?.nombre||prefillNombre||'',condicion_iva:cliente?.condicion_iva||'Consumidor Final',
    cuit:cliente?.cuit||'',dni:cliente?.dni||'',telefono:cliente?.telefono||'',
    direccion:cliente?.direccion||'',localidad:cliente?.localidad||'',provincia:cliente?.provincia||'',
    cp:cliente?.cp||'',email:cliente?.email||'',notas:cliente?.notas||''})
  const [saving,setSaving]=useState(false)
  const set=(k:string,v:string)=>setF(p=>({...p,[k]:v}))
  const guardar=async()=>{
    if(!f.nombre){return}
    setSaving(true)
    try{
      if(cliente){ await updateCliente(cliente.id,f); logAct('Editó','Cliente',f.nombre,cliente.id) }
      else { const nc=await createCliente({...f,creado_por:getOperador()} as any); logAct('Creó','Cliente',f.nombre,(nc as any)?.id); onCreated?.(nc as Cliente) }
      onSaved() }
    catch(e){console.error(e)} finally{setSaving(false)}
  }
  const borrar=async()=>{ if(cliente&&confirm(`¿Eliminar cliente ${cliente.nombre}?`)){ await deleteCliente(cliente.id); onSaved() } }
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <Input label="Nombre / Razón social" value={f.nombre} onChange={(v:string)=>set('nombre',v)} required/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Select label="Condición IVA" value={f.condicion_iva} onChange={(v:string)=>set('condicion_iva',v)}
        options={CONDICIONES_IVA.map(c=>({value:c,label:c}))}/>
      <Input label="Teléfono / Contacto" value={f.telefono} onChange={(v:string)=>set('telefono',v)} type="tel"/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Input label="CUIT" value={f.cuit} onChange={(v:string)=>set('cuit',v)}/>
      <Input label="DNI" value={f.dni} onChange={(v:string)=>set('dni',v)}/>
    </div>
    <Input label="Dirección" value={f.direccion} onChange={(v:string)=>set('direccion',v)}/>
    <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr',gap:10}}>
      <Input label="Localidad" value={f.localidad} onChange={(v:string)=>set('localidad',v)}/>
      <Input label="Provincia" value={f.provincia} onChange={(v:string)=>set('provincia',v)}/>
      <Input label="CP" value={f.cp} onChange={(v:string)=>set('cp',v)}/>
    </div>
    <Input label="Email" value={f.email} onChange={(v:string)=>set('email',v)} type="email"/>
    <Input label="Notas" value={f.notas} onChange={(v:string)=>set('notas',v)}/>
    <div style={{display:'flex',gap:10}}>
      {cliente&&<Btn onClick={borrar} variant="danger" style={{flex:1}}>🗑️</Btn>}
      <Btn onClick={onClose} variant="secondary" style={{flex:1}}>Cancelar</Btn>
      <Btn onClick={guardar} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar'}</Btn>
    </div>
  </div>
}

// ─── FICHA DE CLIENTE (cuenta corriente + compras) ────────────────────────────
function FichaCliente({cliente,empresa,onClose,onRefresh}:{cliente:Cliente;empresa:EmpresaConfig|null;onClose:()=>void;onRefresh:()=>void}){
  const [tab,setTab]=useState<'cuenta'|'compras'|'datos'>('cuenta')
  const [ccs,setCcs]=useState<CCMov[]>([])
  const [comps,setComps]=useState<Comprobante[]>([])
  const [loading,setLoading]=useState(true)
  const [cobro,setCobro]=useState({monto:'',medio:'efectivo'})
  const [saving,setSaving]=useState(false)
  const cargar=useCallback(()=>{ setLoading(true)
    Promise.all([getCCMovimientos(cliente.id),getComprobantesCliente(cliente.id)])
      .then(([cc,co])=>{setCcs(cc);setComps(co);setLoading(false)}).catch(()=>setLoading(false)) },[cliente.id])
  useEffect(()=>{cargar()},[cargar])
  const saldo=ccs.reduce((s,m)=>s+(m.tipo==='debe'?Number(m.monto):-Number(m.monto)),0)
  const registrarCobro=async()=>{
    const monto=parseFloat(String(cobro.monto).replace(',','.')); if(!monto)return; setSaving(true)
    try{
      await registrarCCMov(cliente.id,'haber',monto,`Cobro (${cobro.medio})`)
      await createCajaMov({tipo:'ingreso',monto,concepto:`Cobro cta. cte. · ${cliente.nombre}`,medio_pago:cobro.medio,categoria:'Cobros pendientes',cliente_id:cliente.id,creado_por:getOperador()} as any)
      logAct('Registró','Cobro',`${money(monto)} · ${cliente.nombre}`)
      setCobro({monto:'',medio:'efectivo'}); cargar(); onRefresh()
    }catch(e){console.error(e)} finally{setSaving(false)}
  }
  const imprimir=async(c:Comprobante)=>{ try{const full=await getComprobante(c.id); imprimirComprobante(full,empresa)}catch{} }
  const totalCompras=comps.reduce((s,c)=>s+Number(c.total||0),0)
  const TABS=[['cuenta','📒 Cuenta'],['compras','🧾 Compras'],['datos','📋 Datos']] as const
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'flex',gap:4}}>
      {TABS.map(([k,l])=><button key={k} onClick={()=>setTab(k as any)} style={{flex:1,padding:'8px 4px',fontSize:12,fontWeight:700,cursor:'pointer',
        background:tab===k?C.accent:C.surfaceAlt,color:tab===k?'#000':C.textMuted,border:`1px solid ${tab===k?C.accent:C.border}`,borderRadius:7}}>{l}</button>)}
    </div>

    {tab==='cuenta'&&<>
      <div style={{background:`linear-gradient(135deg,${saldo>0?C.redDim:C.greenDim},${C.surfaceAlt})`,border:`1px solid ${(saldo>0?C.red:C.green)}40`,borderRadius:12,padding:'16px 18px'}}>
        <div style={{color:C.textMuted,fontSize:12,fontWeight:700}}>SALDO EN CUENTA CORRIENTE</div>
        <div style={{color:saldo>0?C.red:C.green,fontSize:26,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>{money(saldo)}</div>
        <div style={{color:C.textDim,fontSize:11,marginTop:2}}>{saldo>0?'El cliente debe':saldo<0?'Saldo a favor del cliente':'Sin deuda'}</div>
      </div>
      <div style={{background:C.surfaceAlt,borderRadius:10,padding:'12px 14px'}}>
        <div style={{color:C.green,fontSize:12,fontWeight:700,marginBottom:8}}>💵 Registrar cobro</div>
        <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
          <input value={cobro.monto} onChange={e=>setCobro(c=>({...c,monto:e.target.value}))} type="number" placeholder="Monto"
            style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 10px',color:C.text,fontSize:14,outline:'none'}}/>
          <select value={cobro.medio} onChange={e=>setCobro(c=>({...c,medio:e.target.value}))} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px',color:C.text,fontSize:13,outline:'none'}}>
            {['efectivo','transferencia','tarjeta','cheque'].map(x=><option key={x} value={x}>{x}</option>)}
          </select>
          <Btn onClick={registrarCobro} disabled={saving}>{saving?'...':'Cobrar'}</Btn>
        </div>
      </div>
      <div style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>MOVIMIENTOS</div>
      {loading&&<Spinner/>}
      {!loading&&<div style={{display:'flex',flexDirection:'column',gap:5}}>
        {ccs.map(m=><div key={m.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div style={{color:C.text,fontSize:13}}>{m.concepto}</div><div style={{color:C.textDim,fontSize:11}}>📅 {m.fecha}</div></div>
          <span style={{color:m.tipo==='debe'?C.red:C.green,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>{m.tipo==='debe'?'+':'−'}{money(m.monto)}</span>
        </div>)}
        {ccs.length===0&&<div style={{color:C.textDim,fontSize:13,padding:'8px 0'}}>Sin movimientos de cuenta corriente</div>}
      </div>}
    </>}

    {tab==='compras'&&<>
      <div style={{display:'flex',justifyContent:'space-between',color:C.textMuted,fontSize:12,fontWeight:700}}>
        <span>{comps.length} comprobantes</span><span>Total: {money(totalCompras)}</span></div>
      {loading&&<Spinner/>}
      {!loading&&<div style={{display:'flex',flexDirection:'column',gap:6}}>
        {comps.map(c=><div key={c.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <div><div style={{color:C.text,fontSize:13,fontWeight:600}}>{TIPOS_COMP[c.tipo]?.label||c.tipo} {fmtNumComp(c.punto_venta,c.numero)}</div>
            <div style={{color:C.textDim,fontSize:11}}>📅 {c.fecha} · {c.condicion_pago}{c.creado_por?` · ${c.creado_por}`:''}</div></div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>{money(c.total)}</span>
            <button onClick={()=>imprimir(c)} style={{background:C.blueDim,color:C.blue,border:`1px solid ${C.blue}40`,borderRadius:5,padding:'3px 8px',fontSize:11,cursor:'pointer'}}>🖨️</button>
          </div>
        </div>)}
        {comps.length===0&&<div style={{color:C.textDim,fontSize:13,padding:'8px 0'}}>Este cliente todavía no tiene compras</div>}
      </div>}
    </>}

    {tab==='datos'&&<ClienteForm cliente={cliente} onClose={onClose} onSaved={()=>{onRefresh();onClose()}}/>}
  </div>
}

// ─── CUENTAS CORRIENTES (deudores) ────────────────────────────────────────────
function CuentasView({clientes,empresa,onRefresh}:{clientes:Cliente[];empresa:EmpresaConfig|null;onRefresh:()=>void}){
  const [saldos,setSaldos]=useState<Record<string,number>>({})
  const [sel,setSel]=useState<Cliente|null>(null)
  const [search,setSearch]=useState('')
  const cargar=useCallback(()=>{ getSaldosCC().then(setSaldos).catch(()=>{}) },[])
  useEffect(()=>{cargar()},[cargar])
  const conSaldo=clientes.map(c=>({c,saldo:saldos[c.id]||0})).filter(x=>Math.abs(x.saldo)>0.01).sort((a,b)=>b.saldo-a.saldo)
  const totalDeuda=conSaldo.filter(x=>x.saldo>0).reduce((s,x)=>s+x.saldo,0)
  const q=search.toLowerCase()
  // Buscador: si escribís, busca en TODOS los clientes (para ver historial de cualquiera)
  const lista = q ? clientes.filter(c=>c.nombre.toLowerCase().includes(q)||(c.cuit||'').includes(search)||(c.dni||'').includes(search)).slice(0,40).map(c=>({c,saldo:saldos[c.id]||0})) : conSaldo
  return <div>
    <h2 style={{color:C.text,fontSize:20,fontWeight:800,marginBottom:4}}>Cuentas Corrientes</h2>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:14}}>Tocá un cliente para ver su cuenta y todas sus compras</p>
    <div style={{background:`linear-gradient(135deg,${C.redDim},${C.surfaceAlt})`,border:`1px solid ${C.red}40`,borderRadius:12,padding:'14px 16px',marginBottom:14}}>
      <div style={{color:C.textMuted,fontSize:12,fontWeight:700}}>TOTAL POR COBRAR</div>
      <div style={{color:C.red,fontSize:26,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>{money(totalDeuda)}</div>
      <div style={{color:C.textDim,fontSize:11}}>{conSaldo.filter(x=>x.saldo>0).length} clientes con deuda</div>
    </div>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Buscar cualquier cliente (nombre, DNI, CUIT)..."
      style={{width:'100%',background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:14,marginBottom:14,outline:'none'}}/>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {lista.map(({c,saldo})=><div key={c.id} onClick={()=>setSel(c)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <div style={{minWidth:0}}>
          <div style={{color:C.text,fontWeight:700,fontSize:14}}>👤 {c.nombre}</div>
          <div style={{color:C.textDim,fontSize:11}}>{c.cuit?`CUIT ${c.cuit}`:c.dni?`DNI ${c.dni}`:''}{c.localidad?` · ${c.localidad}`:''}</div>
        </div>
        <span style={{color:saldo>0?C.red:saldo<0?C.green:C.textDim,fontWeight:800,fontFamily:"'Space Mono',monospace",fontSize:14,whiteSpace:'nowrap'}}>{money(saldo)}</span>
      </div>)}
      {lista.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>{q?'Sin resultados':'Sin clientes con saldo'}</div>}
    </div>
    {sel&&<Modal onClose={()=>setSel(null)} title={sel.nombre}>
      <FichaCliente cliente={sel} empresa={empresa} onClose={()=>setSel(null)} onRefresh={()=>{cargar();onRefresh()}}/></Modal>}
  </div>
}

function ClientesView({clientes,empresa,onRefresh}:{clientes:Cliente[];empresa:EmpresaConfig|null;onRefresh:()=>void}){
  const [show,setShow]=useState(false)
  const [edit,setEdit]=useState<Cliente|null>(null)
  const [search,setSearch]=useState('')
  const q=search.toLowerCase()
  const filtered=clientes.filter(c=>c.nombre.toLowerCase().includes(q)||(c.cuit||'').includes(search)||(c.localidad||'').toLowerCase().includes(q))
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Clientes</h2>
      <Btn onClick={()=>setShow(true)}>+ Nuevo</Btn>
    </div>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Buscar por nombre, CUIT, localidad..."
      style={{width:'100%',background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:14,marginBottom:14,outline:'none'}}/>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {filtered.map(c=><div key={c.id} onClick={()=>setEdit(c)} style={{background:C.surface,border:`1px solid ${C.border}`,
        borderRadius:10,padding:'12px 14px',cursor:'pointer'}}>
        <div style={{color:C.text,fontWeight:700,fontSize:15}}>👤 {c.nombre}</div>
        <div style={{color:C.textMuted,fontSize:12,marginTop:2}}>
          {c.condicion_iva}{c.cuit?` · CUIT ${c.cuit}`:''}{c.dni?` · DNI ${c.dni}`:''}</div>
        {(c.telefono||c.localidad)&&<div style={{color:C.textMuted,fontSize:12}}>
          {c.telefono?`📞 ${c.telefono}`:''}{c.localidad?` · 📍 ${c.localidad}`:''}</div>}
      </div>)}
      {filtered.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>Sin clientes</div>}
    </div>
    {show&&<Modal onClose={()=>setShow(false)} title="Nuevo Cliente">
      <ClienteForm onClose={()=>setShow(false)} onSaved={()=>{setShow(false);onRefresh()}}/></Modal>}
    {edit&&<Modal onClose={()=>setEdit(null)} title={edit.nombre}>
      <FichaCliente cliente={edit} empresa={empresa} onClose={()=>setEdit(null)} onRefresh={onRefresh}/></Modal>}
  </div>
}

// ─── COMPROBANTES VIEW ──────────────────────────────────────────────────────
type CompItemForm = {codigo:string;detalle:string;cantidad:string;precio:string}
type PrefillComp = {tipo:TipoComprobante;clienteId:string;clienteLibre:string;items:CompItemForm[];descPct:string;percep:string;obs:string}
function ComprobanteForm({clientes,vendedores,materiales,empresa,onSaved,onClose,inicial}:{
  clientes:Cliente[];vendedores:Vendedor[];materiales:any[];empresa:EmpresaConfig|null;onSaved:()=>void;onClose:()=>void;inicial?:PrefillComp}){
  const [tipo,setTipo]=useState<TipoComprobante>(inicial?.tipo??'presupuesto')
  const [clienteId,setClienteId]=useState(inicial?.clienteId??'')
  const [clienteLibre,setClienteLibre]=useState(inicial?.clienteLibre??'')
  const [cliQuery,setCliQuery]=useState('')
  const [cliOpen,setCliOpen]=useState(false)
  const [nuevoCli,setNuevoCli]=useState(false)
  const [extraCli,setExtraCli]=useState<Cliente[]>([])
  const [vendedor,setVendedor]=useState(getOperador()||vendedores[0]?.nombre||'')
  const [condicion,setCondicion]=useState('CONTADO')
  const [medioPago,setMedioPago]=useState('efectivo')
  const [fecha,setFecha]=useState(new Date().toISOString().slice(0,10))
  const [items,setItems]=useState<CompItemForm[]>(inicial?.items?.length?inicial.items:[{codigo:'',detalle:'',cantidad:'1',precio:''}])
  const [descPct,setDescPct]=useState(inicial?inicial.descPct:String(empresa?.descuento_general??0))
  const [descuento,setDescuento]=useState('0')
  const [percep,setPercep]=useState(inicial?.percep??'0')
  const [obs,setObs]=useState(inicial?inicial.obs:(empresa?.pie_comprobante||''))
  const [saving,setSaving]=useState(false)

  const setItem=(i:number,k:string,v:string)=>setItems(a=>a.map((it,j)=>j===i?{...it,[k]:v}:it))
  const addItem=()=>setItems(a=>[...a,{codigo:'',detalle:'',cantidad:'1',precio:''}])
  const delItem=(i:number)=>setItems(a=>a.filter((_,j)=>j!==i))
  // Recargo: general (config) + por artículo (override). Toggle persistido por dispositivo.
  const recGen = empresa?.recargo_general ?? 47.04
  const [recOn,setRecOn]=useState<boolean>(()=>{ try{return localStorage.getItem('logiobra_recargo')==='1'}catch{return false} })
  const recDe=(m:any)=> (m?.recargo!=null?Number(m.recargo):recGen)
  const precioCon=(m:any, on=recOn)=>{ const base=Number(m?.precio_ref||0); const p= on? base*(1+recDe(m)/100) : base; return Math.round(p*100)/100 }
  const aplicarMat=(i:number,m:any)=>setItems(a=>a.map((it,j)=>j===i?{...it,codigo:m.codigo||'',detalle:m.nombre,precio:String(precioCon(m))}:it))
  const toggleRec=(on:boolean)=>{ setRecOn(on); try{localStorage.setItem('logiobra_recargo',on?'1':'0')}catch{}
    setItems(a=>a.map(it=>{ const m=materiales.find((x:any)=>x.nombre===it.detalle); return m?{...it,precio:String(precioCon(m,on))}:it })) }
  const elegirMaterial=(i:number,mid:string)=>{ const m=materiales.find(x=>x.id===mid); if(m) aplicarMat(i,m) }
  // Buscar por código/descripción + Enter
  const [picker,setPicker]=useState<{idx:number;matches:any[]}|null>(null)
  const [sel,setSel]=useState<Record<string,boolean>>({})
  const [buscarMsg,setBuscarMsg]=useState<{idx:number;txt:string}|null>(null)
  const detalleRefs=useRef<Record<number,HTMLInputElement|null>>({})
  const [focusNext,setFocusNext]=useState<number|null>(null)
  useEffect(()=>{ if(focusNext!=null){ const el=detalleRefs.current[focusNext]; if(el){el.focus()} setFocusNext(null) } },[focusNext,items.length])
  // Tras cargar un ítem: asegura una fila vacía a continuación y la enfoca
  const avanzar=(i:number)=>{ setItems(a=> i>=a.length-1 ? [...a,{codigo:'',detalle:'',cantidad:'1',precio:''}] : a); setFocusNext(i+1) }
  const buscarItem=(i:number, raw?:string)=>{
    const it=items[i]||{}
    const term=(String(raw ?? (it.detalle||it.codigo||'')).trim()).toLowerCase()
    if(!term){ return }
    const matches=materiales.filter((m:any)=>(m.nombre||'').toLowerCase().includes(term)||(m.codigo||'').toLowerCase().includes(term))
    if(matches.length===0){ setBuscarMsg({idx:i,txt:`Sin coincidencias para "${term}"`}); return }
    setBuscarMsg(null)
    if(matches.length===1){ aplicarMat(i,matches[0]); avanzar(i); return }
    setSel({}); setPicker({idx:i,matches})
  }
  const confirmarPicker=()=>{
    if(!picker) return
    const elegidos=picker.matches.filter((m:any)=>sel[m.id])
    if(elegidos.length===0){ setPicker(null); return }
    let ultimo=picker.idx
    setItems(a=>{
      const copy=[...a]
      const m0=elegidos[0]
      copy[picker.idx]={...copy[picker.idx],codigo:m0.codigo||'',detalle:m0.nombre,precio:String(precioCon(m0))}
      const extra=elegidos.slice(1).map((m:any)=>({codigo:m.codigo||'',detalle:m.nombre,cantidad:'1',precio:String(precioCon(m))}))
      copy.splice(picker.idx+1,0,...extra)
      ultimo=picker.idx+extra.length
      // fila vacía al final para seguir cargando
      copy.push({codigo:'',detalle:'',cantidad:'1',precio:''})
      return copy
    })
    setPicker(null)
    setFocusNext(ultimo+1)
  }
  const num=(s:string)=>parseFloat(String(s).replace(',','.'))||0
  const subtotal=items.reduce((s,it)=>s+num(it.cantidad)*num(it.precio),0)
  const descMonto=Math.round((subtotal*num(descPct)/100 + num(descuento))*100)/100
  const total=subtotal-descMonto+num(percep)

  const allCli=[...extraCli,...clientes]
  const [errMsg,setErrMsg]=useState('')
  const guardar=async(imprimir:boolean)=>{
    const validos=items.filter(it=>it.detalle&&num(it.cantidad)>0)
    if(validos.length===0){ setErrMsg('Cargá al menos un ítem'); return }
    if(condicion==='CUENTA CORRIENTE' && (tipo==='factura_x'||tipo==='recibo') && !clienteId){
      setErrMsg('Para Cuenta Corriente elegí un cliente registrado'); return }
    setErrMsg('')
    setSaving(true)
    try{
      const cli=allCli.find(c=>c.id===clienteId)
      const itemsDB:ComprobanteItem[]=validos.map(it=>({
        codigo:it.codigo||undefined, detalle:it.detalle,
        cantidad:num(it.cantidad), precio_unitario:num(it.precio), importe:num(it.cantidad)*num(it.precio),
        material_id: materiales.find(m=>m.nombre===it.detalle)?.id || null
      }))
      const oper = getOperador()
      const comp=await createComprobante({
        tipo, punto_venta:empresa?.punto_venta||1,
        cliente_id:clienteId||null, cliente_nombre: cli?.nombre || clienteLibre || 'Consumidor Final',
        vendedor: vendedor||oper, fecha, condicion_pago:condicion,
        subtotal, recargo:0, descuento:descMonto, descuento_pct:num(descPct)||null, percepciones:num(percep), total,
        observaciones:obs, estado:'emitido', pedido_id:null, creado_por:oper
      } as any, itemsDB)
      const nombreCli = cli?.nombre||clienteLibre||'Consumidor Final'
      logAct('Creó', TIPOS_COMP[tipo].label,
        `${TIPOS_COMP[tipo].label} N° ${fmtNumComp(empresa?.punto_venta||1, comp.numero)} · ${nombreCli} · ${money(total)}`, comp.id)
      // Registrar el cobro: facturas y recibos generan movimiento. Presupuesto/remito no.
      const cobra = (tipo==='factura_x'||tipo==='recibo') && total>0
      if(cobra){
        if(condicion==='CUENTA CORRIENTE' && clienteId){
          await registrarCCMov(clienteId,'debe',total,`${TIPOS_COMP[tipo].label} N° ${fmtNumComp(empresa?.punto_venta||1,comp.numero)}`,comp.id)
        } else {
          await createCajaMov({tipo:'ingreso',monto:total,concepto:`${TIPOS_COMP[tipo].label} N° ${fmtNumComp(empresa?.punto_venta||1,comp.numero)} · ${nombreCli}`,
            medio_pago:medioPago,categoria:'Ventas contado',cliente_id:clienteId||null,comprobante_id:comp.id,fecha,creado_por:oper} as any)
        }
      }
      if(imprimir){
        const full=await getComprobante(comp.id)
        imprimirComprobante(full, empresa)
      }
      onSaved()
    }catch(e){console.error(e)} finally{setSaving(false)}
  }

  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Select label="Tipo" value={tipo} onChange={(v:string)=>setTipo(v as TipoComprobante)}
        options={(Object.keys(TIPOS_COMP) as TipoComprobante[]).map(k=>({value:k,label:TIPOS_COMP[k].label}))}/>
      <Input label="Fecha" value={fecha} onChange={setFecha} type="date"/>
    </div>
    {/* Buscador de cliente */}
    <div style={{display:'flex',flexDirection:'column',gap:5,position:'relative'}}>
      <label style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>CLIENTE</label>
      {clienteId
        ? <div style={{display:'flex',alignItems:'center',gap:8,background:C.surfaceAlt,border:`1px solid ${C.accent}55`,borderRadius:8,padding:'9px 12px'}}>
            <span style={{flex:1,color:C.text,fontSize:14,fontWeight:600}}>👤 {allCli.find(c=>c.id===clienteId)?.nombre}</span>
            <button onClick={()=>{setClienteId('');setCliQuery('')}} style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:13}}>✕ quitar</button>
          </div>
        : <>
          <div style={{display:'flex',gap:6}}>
            <input value={cliQuery} onChange={e=>{setCliQuery(e.target.value);setCliOpen(true)}} onFocus={()=>setCliOpen(true)}
              placeholder="🔍 Buscar por nombre, DNI o CUIT... (vacío = Consumidor Final)"
              style={{flex:1,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:14,outline:'none'}}/>
            <button onClick={()=>setNuevoCli(true)} title="Crear cliente nuevo" style={{background:C.greenDim,color:C.green,border:`1px solid ${C.green}40`,borderRadius:8,padding:'0 12px',cursor:'pointer',fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>+ Cliente</button>
          </div>
          {cliOpen&&cliQuery.trim().length>=2&&<div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:C.surface,
            border:`1px solid ${C.border}`,borderRadius:8,marginTop:4,maxHeight:200,overflowY:'auto',boxShadow:'0 6px 20px #0008'}}>
            {allCli.filter(c=>{const q=cliQuery.toLowerCase();return c.nombre.toLowerCase().includes(q)||(c.cuit||'').includes(cliQuery)||(c.dni||'').includes(cliQuery)}).slice(0,30).map(c=>
              <div key={c.id} onClick={()=>{setClienteId(c.id);setCliOpen(false);setClienteLibre('')}} style={{padding:'8px 12px',cursor:'pointer',borderBottom:`1px solid ${C.border}`}}>
                <div style={{color:C.text,fontSize:13,fontWeight:600}}>{c.nombre}</div>
                <div style={{color:C.textDim,fontSize:11}}>{c.condicion_iva}{c.cuit?` · CUIT ${c.cuit}`:''}{c.dni?` · DNI ${c.dni}`:''}{c.localidad?` · ${c.localidad}`:''}</div>
              </div>)}
            {allCli.filter(c=>{const q=cliQuery.toLowerCase();return c.nombre.toLowerCase().includes(q)||(c.cuit||'').includes(cliQuery)||(c.dni||'').includes(cliQuery)}).length===0&&
              <div onClick={()=>setNuevoCli(true)} style={{padding:'8px 12px',color:C.green,fontSize:12,cursor:'pointer',fontWeight:600}}>➕ Crear cliente nuevo "{cliQuery}"</div>}
          </div>}
          {cliQuery.trim()&&<Input label="" value={clienteLibre||cliQuery} onChange={(v:string)=>setClienteLibre(v)} placeholder="Nombre del cliente sin registrar"/>}
        </>}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Select label="Vendedor" value={vendedor} onChange={setVendedor}
        options={vendedores.map(v=>({value:v.nombre,label:v.nombre}))}/>
      <Select label="Condición de venta" value={condicion} onChange={setCondicion}
        options={[{value:'CONTADO',label:'💵 Contado'},{value:'CUENTA CORRIENTE',label:'📒 Cuenta corriente'}]}/>
    </div>
    {condicion==='CONTADO'
      ? <Select label="Medio de pago" value={medioPago} onChange={setMedioPago} options={['efectivo','transferencia','tarjeta','cheque'].map(x=>({value:x,label:x}))}/>
      : <div style={{background:C.blueDim,border:`1px solid ${C.blue}40`,borderRadius:8,padding:'9px 12px',color:C.blue,fontSize:12}}>
          📒 Se sumará el total al saldo en cuenta corriente del cliente {!clienteId&&<b>(elegí un cliente registrado)</b>}</div>}

    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,flexWrap:'wrap',gap:8}}>
        <span style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>ÍTEMS ({items.filter(it=>it.detalle&&num(it.cantidad)>0).length})</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <label title="Aplica el recargo al precio de cada producto cargado"
            style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:recOn?C.accentDim:C.surfaceAlt,
              border:`1px solid ${recOn?C.accent:C.border}`,borderRadius:7,padding:'5px 9px'}}>
            <input type="checkbox" checked={recOn} onChange={e=>toggleRec(e.target.checked)} style={{width:15,height:15}}/>
            <span style={{color:recOn?C.accent:C.textMuted,fontSize:12,fontWeight:700}}>Recargo {recGen.toString().replace('.',',')}%</span>
          </label>
          <Btn onClick={addItem} variant="secondary" size="sm">+ Ítem</Btn>
        </div>
      </div>
      {items.map((it,i)=><div key={i} style={{marginBottom:10,background:C.surfaceAlt,borderRadius:8,padding:10}}>
        <select value="" onChange={e=>elegirMaterial(i,e.target.value)}
          style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.textMuted,fontSize:12,marginBottom:6,outline:'none'}}>
          <option value="">🔍 Elegir del catálogo (o escribir abajo)...</option>
          {materiales.map(m=><option key={m.id} value={m.id}>{m.codigo?`[${m.codigo}] `:''}{m.nombre} — {money(m.precio_ref||0)}</option>)}
        </select>
        <div style={{display:'flex',gap:6,marginBottom:6}}>
          <input value={it.codigo} onChange={e=>setItem(i,'codigo',e.target.value)} placeholder="Código"
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();buscarItem(i,(e.target as HTMLInputElement).value)}}}
            style={{width:80,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 8px',color:C.text,fontSize:12,outline:'none'}}/>
          <input value={it.detalle} ref={el=>{detalleRefs.current[i]=el}}
            onChange={e=>{setItem(i,'detalle',e.target.value);if(buscarMsg?.idx===i)setBuscarMsg(null)}} placeholder="Descripción o código + Enter ↵"
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();buscarItem(i,(e.target as HTMLInputElement).value)}}}
            style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 8px',color:C.text,fontSize:12,outline:'none'}}/>
          <button onClick={()=>buscarItem(i)} title="Buscar en catálogo" style={{background:C.blueDim,color:C.blue,border:`1px solid ${C.blue}40`,borderRadius:6,padding:'0 10px',cursor:'pointer',fontSize:13}}>🔍</button>
        </div>
        {buscarMsg?.idx===i&&<div style={{color:C.accent,fontSize:11,marginBottom:6}}>⚠️ {buscarMsg.txt}</div>}
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <input value={it.cantidad} onChange={e=>setItem(i,'cantidad',e.target.value)} type="number" placeholder="Cant."
            style={{width:64,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 8px',color:C.text,fontSize:12,outline:'none',textAlign:'center'}}/>
          <span style={{color:C.textDim}}>×</span>
          <input value={it.precio} onChange={e=>setItem(i,'precio',e.target.value)} type="number" placeholder="P.Unit."
            style={{width:90,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 8px',color:C.accent,fontSize:12,fontWeight:700,outline:'none',textAlign:'right'}}/>
          <span style={{flex:1,textAlign:'right',color:C.text,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>{money(num(it.cantidad)*num(it.precio))}</span>
          {items.length>1&&<button onClick={()=>delItem(i)} style={{background:C.redDim,color:C.red,border:'none',borderRadius:6,padding:'4px 8px',cursor:'pointer'}}>✕</button>}
        </div>
      </div>)}
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
      <Input label="Descuento %" value={descPct} onChange={setDescPct} type="number"/>
      <Input label="Descuento $" value={descuento} onChange={setDescuento} type="number"/>
      <Input label="Percep. $" value={percep} onChange={setPercep} type="number"/>
    </div>
    {descMonto>0&&<div style={{color:C.green,fontSize:12,fontWeight:600,marginTop:-4}}>🏷️ Descuento aplicado: −{money(descMonto)}</div>}
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      <label style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>OBSERVACIONES</label>
      <textarea value={obs} onChange={e=>setObs(e.target.value)}
        style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',color:C.text,fontSize:13,minHeight:60,resize:'vertical',outline:'none',fontFamily:'inherit'}}/>
    </div>

    <div style={{background:`linear-gradient(135deg,${C.accentDim},${C.surfaceAlt})`,border:`1px solid ${C.accent}40`,
      borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{color:C.textMuted,fontSize:13}}>TOTAL</span>
      <span style={{color:C.accent,fontSize:24,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>{money(total)}</span>
    </div>

    {(tipo==='factura_x'||tipo==='recibo')&&total>0&&<div style={{color:C.textMuted,fontSize:12}}>
      {condicion==='CUENTA CORRIENTE'?'📒 Suma a cuenta corriente del cliente':`💵 Ingresa a Caja (${medioPago}) como "Ventas contado"`}</div>}
    {errMsg&&<div style={{color:C.red,fontSize:13,fontWeight:600}}>⚠️ {errMsg}</div>}
    <div style={{display:'flex',gap:10}}>
      <Btn onClick={onClose} variant="secondary" style={{flex:1}}>Cancelar</Btn>
      <Btn onClick={()=>guardar(false)} disabled={saving} variant="secondary" style={{flex:1}}>{saving?'...':'💾 Guardar'}</Btn>
      <Btn onClick={()=>guardar(true)} disabled={saving} style={{flex:1}}>{saving?'...':'🖨️ Guardar e imprimir'}</Btn>
    </div>

    {picker&&<div onClick={()=>setPicker(null)} style={{position:'fixed',inset:0,background:'#000C',zIndex:3000,
      display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,
        borderRadius:'16px 16px 0 0',padding:20,width:'100%',maxWidth:640,maxHeight:'85vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <h3 style={{color:C.text,fontSize:16,fontWeight:800}}>{picker.matches.length} coincidencias — elegí cuáles</h3>
          <button onClick={()=>setPicker(null)} style={{background:C.surfaceAlt,border:'none',color:C.text,width:32,height:32,borderRadius:8,cursor:'pointer',fontSize:16}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
          {picker.matches.map((m:any)=><label key={m.id} style={{display:'flex',alignItems:'center',gap:10,background:sel[m.id]?C.accentDim:C.surfaceAlt,
            border:`1px solid ${sel[m.id]?C.accent:C.border}`,borderRadius:8,padding:'9px 12px',cursor:'pointer'}}>
            <input type="checkbox" checked={!!sel[m.id]} onChange={e=>setSel(s=>({...s,[m.id]:e.target.checked}))} style={{width:16,height:16}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.text,fontSize:13,fontWeight:600}}>{m.nombre}</div>
              <div style={{color:C.textDim,fontSize:11}}>{m.codigo?`#${m.codigo} · `:''}{m.rubro||''}</div>
            </div>
            <span style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13,whiteSpace:'nowrap'}}>{money(m.precio_ref||0)}</span>
          </label>)}
        </div>
        <Btn onClick={confirmarPicker} style={{width:'100%',justifyContent:'center'}}>
          ✓ Agregar {Object.values(sel).filter(Boolean).length||''} seleccionado(s)</Btn>
      </div>
    </div>}

    {nuevoCli&&<Modal onClose={()=>setNuevoCli(false)} title="Nuevo Cliente">
      <ClienteForm
        prefillNombre={cliQuery}
        onClose={()=>setNuevoCli(false)}
        onSaved={()=>setNuevoCli(false)}
        onCreated={(c)=>{ setExtraCli(a=>[c,...a]); setClienteId(c.id); setCliQuery(''); setCliOpen(false); setNuevoCli(false) }}/>
    </Modal>}
  </div>
}

// ─── REMITO FORM (entrega total o parcial desde una factura) ────────────────
function RemitoForm({factura,empresa,onClose,onDone}:{factura:Comprobante;empresa:EmpresaConfig|null;onClose:()=>void;onDone:(r:Comprobante)=>void}){
  const items=(factura.comprobante_items||[])
  const pendDe=(it:ComprobanteItem)=>Math.max(0,Number(it.cantidad)-Number(it.cantidad_entregada||0))
  const conPend=items.filter(it=>pendDe(it)>0)
  const [cant,setCant]=useState<Record<string,string>>(()=>{ const o:Record<string,string>={}; items.forEach(it=>{o[it.id!]=String(pendDe(it))}); return o })
  const [destino,setDestino]=useState<'acopio'|'pendiente_entrega'>('acopio')
  const [saving,setSaving]=useState(false)
  const [err,setErr]=useState('')
  const num=(s:string)=>parseFloat(String(s).replace(',','.'))||0
  const aEntregar=(it:ComprobanteItem)=>Math.min(num(cant[it.id!]||'0'),pendDe(it))
  const totalEntregar=items.reduce((s,it)=>s+aEntregar(it),0)
  const restoPend=items.reduce((s,it)=>s+(pendDe(it)-aEntregar(it)),0)
  const setTodo=()=>setCant(()=>{const o:Record<string,string>={};items.forEach(it=>{o[it.id!]=String(pendDe(it))});return o})
  const setNada=()=>setCant(()=>{const o:Record<string,string>={};items.forEach(it=>{o[it.id!]='0'});return o})
  const guardar=async()=>{
    const lineas:RemitoLinea[]=items.map(it=>({item_id:it.id,material_id:it.material_id,codigo:it.codigo,detalle:it.detalle,precio_unitario:it.precio_unitario,cantidad:aEntregar(it)})).filter(l=>l.cantidad>0)
    if(!lineas.length){ setErr('Indicá al menos una cantidad a entregar'); return }
    setErr(''); setSaving(true)
    try{
      const r=await emitirRemito(factura,lineas,destino,getOperador())
      logAct('Emitió','Remito',`Remito N° ${fmtNumComp(r.punto_venta,r.numero)} de Factura N° ${fmtNumComp(factura.punto_venta,factura.numero)} · ${lineas.length} ítem(s)`,r.id)
      onDone(r)
    }catch(e:any){ setErr(e?.message||'Error al emitir el remito') } finally{ setSaving(false) }
  }
  if(conPend.length===0) return <div style={{color:C.textMuted,fontSize:13,padding:10}}>Todos los artículos de esta factura ya fueron entregados.</div>
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{color:C.textMuted,fontSize:12}}>Elegí cuánto entregás de cada artículo. Lo entregado se descuenta del stock; el resto queda según el destino elegido.</div>
    <div style={{display:'flex',gap:8}}>
      <button onClick={setTodo} style={{flex:1,background:C.greenDim,color:C.green,border:`1px solid ${C.green}40`,borderRadius:7,padding:'7px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Entregar todo</button>
      <button onClick={setNada} style={{flex:1,background:C.surfaceAlt,color:C.textMuted,border:`1px solid ${C.border}`,borderRadius:7,padding:'7px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Vaciar</button>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {items.map(it=>{ const pend=pendDe(it); const ya=Number(it.cantidad_entregada||0)
        return <div key={it.id} style={{background:C.surfaceAlt,borderRadius:7,padding:'8px 11px',display:'flex',alignItems:'center',gap:10,opacity:pend>0?1:0.5}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:C.text,fontSize:13}}>{it.detalle}</div>
            <div style={{color:C.textDim,fontSize:11}}>Total {it.cantidad}{ya>0?` · ya entregado ${ya}`:''} · pendiente {pend}</div>
          </div>
          <input type="number" value={cant[it.id!]??'0'} disabled={pend<=0}
            onChange={e=>setCant(c=>({...c,[it.id!]:e.target.value}))}
            style={{width:80,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 9px',color:C.text,fontSize:14,textAlign:'right',outline:'none'}}/>
        </div>})}
    </div>
    {restoPend>0&&<div style={{background:C.accentDim,borderRadius:8,padding:'10px 12px'}}>
      <div style={{color:C.accent,fontSize:12,fontWeight:700,marginBottom:6}}>Quedan {restoPend} unidad(es) sin entregar. ¿Dónde quedan?</div>
      <div style={{display:'flex',gap:8}}>
        {([['acopio','📦 Acopio'],['pendiente_entrega','🚚 Pendiente de entrega']] as const).map(([v,l])=>
          <button key={v} onClick={()=>setDestino(v)} style={{flex:1,background:destino===v?C.accent:C.surfaceAlt,color:destino===v?'#000':C.textMuted,
            border:`1px solid ${destino===v?C.accent:C.border}`,borderRadius:7,padding:'8px',fontSize:12,fontWeight:700,cursor:'pointer'}}>{l}</button>)}
      </div>
    </div>}
    {err&&<div style={{color:C.red,fontSize:12}}>{err}</div>}
    <Btn onClick={guardar} disabled={saving||totalEntregar<=0}>{saving?'Emitiendo…':`📦 Emitir remito (${totalEntregar} u.)`}</Btn>
  </div>
}

function ComprobantesView({clientes,vendedores,materiales,empresa,onRefresh}:{
  clientes:Cliente[];vendedores:Vendedor[];materiales:any[];empresa:EmpresaConfig|null;onRefresh:()=>void}){
  const [comps,setComps]=useState<Comprobante[]>([])
  const [loading,setLoading]=useState(true)
  const [show,setShow]=useState(false)
  const [filtro,setFiltro]=useState<string>('todos')
  const [detalle,setDetalle]=useState<Comprobante|null>(null)
  const [loadingDet,setLoadingDet]=useState(false)
  const [busqueda,setBusqueda]=useState('')
  const [resultados,setResultados]=useState<Comprobante[]|null>(null)
  const [buscando,setBuscando]=useState(false)
  const [convertir,setConvertir]=useState<PrefillComp|null>(null)
  const [remitos,setRemitos]=useState<Comprobante[]>([])
  const [remitoFactura,setRemitoFactura]=useState<Comprobante|null>(null)
  const cargar=useCallback(()=>{ setLoading(true); getComprobantes().then(d=>{setComps(d);setLoading(false)}).catch(()=>setLoading(false)) },[])
  useEffect(()=>{ cargar() },[cargar])
  // Búsqueda en servidor (número / fecha / cliente) con debounce
  useEffect(()=>{
    const q=busqueda.trim()
    if(q.length<2){ setResultados(null); setBuscando(false); return }
    setBuscando(true)
    const t=setTimeout(()=>{ buscarComprobantes(q).then(d=>{setResultados(d);setBuscando(false)}).catch(()=>{setResultados([]);setBuscando(false)}) },350)
    return ()=>clearTimeout(t)
  },[busqueda])
  const base = resultados!==null ? resultados : comps
  const filtered = filtro==='todos' ? base : base.filter(c=>c.tipo===filtro)

  const borrar=async(c:Comprobante)=>{ if(confirm(`¿Anular/borrar ${TIPOS_COMP[c.tipo].label} ${fmtNumComp(c.punto_venta,c.numero)}?`)){ await deleteComprobante(c.id); logAct('Borró',TIPOS_COMP[c.tipo].label,`${TIPOS_COMP[c.tipo].label} N° ${fmtNumComp(c.punto_venta,c.numero)} · ${money(c.total)}`,c.id); setDetalle(null); cargar() } }
  const imprimir=async(c:Comprobante)=>{ try{ const full=await getComprobante(c.id); imprimirComprobante(full,empresa) }catch{ imprimirComprobante(c,empresa) } }
  const verDetalle=async(c:Comprobante)=>{ setLoadingDet(true); setDetalle(c); setRemitos([]); try{ const full=await getComprobante(c.id); setDetalle(full); if(full.tipo==='factura_x'){ getRemitosDeFactura(full.id).then(setRemitos).catch(()=>{}) } }catch{} finally{ setLoadingDet(false) } }
  // Pasar un presupuesto a factura: abre el formulario precargado con los datos del presupuesto
  const pasarAFactura=async(c:Comprobante)=>{
    setLoadingDet(true)
    try{
      const full=await getComprobante(c.id)
      setConvertir({
        tipo:'factura_x',
        clienteId:full.cliente_id||'',
        clienteLibre: full.cliente_id? '' : (full.cliente_nombre||full.clientes?.nombre||''),
        items:(full.comprobante_items||[]).map(it=>({codigo:it.codigo||'',detalle:it.detalle,cantidad:String(it.cantidad),precio:String(it.precio_unitario)})),
        descPct: full.descuento_pct? String(full.descuento_pct) : '0',
        percep: String(full.percepciones||0),
        obs: full.observaciones||''
      })
      setDetalle(null)
    }catch{} finally{ setLoadingDet(false) }
  }

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Comprobantes</h2>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={()=>window.location.href='/comprobantes/nuevo'} style={{background:C.accent,color:'#000',fontWeight:800}}>+ Nuevo comprobante</Btn>
        <Btn onClick={()=>setShow(true)} variant="secondary">+ Rápido</Btn>
      </div>
    </div>
    <div style={{position:'relative',marginBottom:12}}>
      <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
        placeholder="🔍 Buscar por N° de comprobante, fecha (15/06/2026) o nombre de cliente..."
        style={{width:'100%',background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 13px',color:C.text,fontSize:14,outline:'none'}}/>
      {busqueda&&<button onClick={()=>setBusqueda('')} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:C.textMuted,cursor:'pointer',fontSize:15}}>✕</button>}
    </div>
    {resultados!==null&&<div style={{color:C.textMuted,fontSize:12,marginBottom:10}}>{buscando?'Buscando…':`${filtered.length} resultado(s) para “${busqueda.trim()}”`}</div>}
    <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
      {[['todos','Todos'],...Object.keys(TIPOS_COMP).map(k=>[k,TIPOS_COMP[k as TipoComprobante].label])].map(([k,l])=>
        <button key={k} onClick={()=>setFiltro(k)} style={{background:filtro===k?C.accent:C.surfaceAlt,
          color:filtro===k?'#000':C.textMuted,border:`1px solid ${filtro===k?C.accent:C.border}`,
          borderRadius:6,padding:'5px 11px',fontSize:12,cursor:'pointer',fontWeight:filtro===k?700:400}}>{l}</button>)}
    </div>
    {loading&&<Spinner/>}
    {!loading&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
      {filtered.map(c=><div key={c.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,flexWrap:'wrap'}}>
          <div onClick={()=>verDetalle(c)} style={{cursor:'pointer',flex:1,minWidth:0}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{background:C.accentDim,color:C.accent,borderRadius:4,padding:'1px 7px',fontSize:10,fontWeight:700}}>{TIPOS_COMP[c.tipo].label}</span>
              <span style={{color:C.textDim,fontSize:11,fontFamily:"'Space Mono',monospace"}}>{fmtNumComp(c.punto_venta,c.numero)}</span>
            </div>
            <div style={{color:C.text,fontWeight:700,fontSize:14,marginTop:3}}>{c.cliente_nombre||c.clientes?.nombre||'Consumidor Final'}</div>
            <div style={{color:C.textMuted,fontSize:12}}>📅 {c.fecha} · {c.condicion_pago} · <span style={{color:C.blue}}>ver detalle ›</span></div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{color:C.accent,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>{money(c.total)}</div>
            <div style={{display:'flex',gap:6,marginTop:6}}>
              <button onClick={()=>imprimir(c)} style={{background:C.blueDim,color:C.blue,border:`1px solid ${C.blue}40`,borderRadius:5,padding:'4px 9px',fontSize:11,cursor:'pointer',fontWeight:600}}>🖨️ Imprimir</button>
              <button onClick={()=>borrar(c)} style={{background:C.redDim,color:C.red,border:`1px solid ${C.red}40`,borderRadius:5,padding:'4px 9px',fontSize:11,cursor:'pointer',fontWeight:600}}>🗑️</button>
            </div>
          </div>
        </div>
      </div>)}
      {filtered.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>Sin comprobantes</div>}
    </div>}
    {show&&<Modal onClose={()=>setShow(false)} title="Nuevo Comprobante">
      <ComprobanteForm clientes={clientes} vendedores={vendedores} materiales={materiales} empresa={empresa}
        onClose={()=>setShow(false)} onSaved={()=>{setShow(false);cargar();onRefresh()}}/></Modal>}

    {detalle&&<Modal onClose={()=>setDetalle(null)} title={`${TIPOS_COMP[detalle.tipo].label} ${fmtNumComp(detalle.punto_venta,detalle.numero)}`}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{color:C.text,fontWeight:800,fontSize:16}}>{detalle.cliente_nombre||detalle.clientes?.nombre||'Consumidor Final'}</div>
            <div style={{color:C.textMuted,fontSize:12}}>📅 {detalle.fecha} · {detalle.condicion_pago}{detalle.vendedor?` · 🧑‍💼 ${detalle.vendedor}`:''}</div>
            {detalle.clientes?.cuit&&<div style={{color:C.textMuted,fontSize:12}}>CUIT: {detalle.clientes.cuit}</div>}
            {detalle.clientes?.direccion&&<div style={{color:C.textMuted,fontSize:12}}>📍 {detalle.clientes.direccion}{detalle.clientes?.localidad?', '+detalle.clientes.localidad:''}</div>}
          </div>
          <span style={{background:detalle.estado==='anulado'?C.redDim:C.greenDim,color:detalle.estado==='anulado'?C.red:C.green,
            border:`1px solid ${detalle.estado==='anulado'?C.red:C.green}40`,borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700,height:'fit-content'}}>
            {detalle.estado==='anulado'?'ANULADO':'EMITIDO'}</span>
        </div>

        <div>
          <div style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5,marginBottom:8}}>ÍTEMS</div>
          {loadingDet&&<Spinner/>}
          {!loadingDet&&<div style={{display:'flex',flexDirection:'column',gap:5}}>
            {(detalle.comprobante_items||[]).map((it,i)=>{
              const entr=Number(it.cantidad_entregada||0), pend=Number(it.cantidad)-entr
              const esFac=detalle.tipo==='factura_x'
              return <div key={i} style={{background:C.surfaceAlt,borderRadius:7,
              padding:'8px 11px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
              <div style={{minWidth:0}}>
                <div style={{color:C.text,fontSize:13}}>{it.detalle}</div>
                <div style={{color:C.textDim,fontSize:11}}>{it.cantidad} × {money(it.precio_unitario)}{it.codigo?` · #${it.codigo}`:''}</div>
                {esFac&&entr>0&&<div style={{fontSize:11,marginTop:2,color:pend<=0?C.green:C.blue}}>
                  {pend<=0?'✓ Entregado completo':`📦 Entregado ${entr} · pendiente ${pend}`}</div>}
              </div>
              <div style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13,whiteSpace:'nowrap'}}>{money(it.importe)}</div>
            </div>})}
            {(!detalle.comprobante_items||detalle.comprobante_items.length===0)&&!loadingDet&&
              <div style={{color:C.textDim,fontSize:13,padding:'8px 0'}}>Sin ítems detallados</div>}
          </div>}
        </div>

        {detalle.observaciones&&<div style={{background:C.accentDim,borderRadius:8,padding:'9px 12px'}}>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,marginBottom:2}}>OBSERVACIONES</div>
          <div style={{color:C.text,fontSize:12}}>{detalle.observaciones}</div></div>}

        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10}}>
          {[['Subtotal',detalle.subtotal],['Recargo',detalle.recargo],['Descuento',detalle.descuento],['Percepciones',detalle.percepciones]]
            .filter(([,v])=>Number(v))
            .map(([l,v])=><div key={l as string} style={{display:'flex',justifyContent:'space-between',color:C.textMuted,fontSize:13,padding:'2px 0'}}>
              <span>{l}</span><span style={{fontFamily:"'Space Mono',monospace"}}>{money(v as number)}</span></div>)}
          <div style={{display:'flex',justifyContent:'space-between',color:C.text,fontSize:17,fontWeight:800,marginTop:6}}>
            <span>TOTAL</span><span style={{color:C.accent,fontFamily:"'Space Mono',monospace"}}>{money(detalle.total)}</span></div>
        </div>

        {detalle.tipo==='presupuesto'&&<button onClick={()=>pasarAFactura(detalle)} disabled={loadingDet}
          style={{background:C.green,color:'#000',border:'none',borderRadius:8,padding:'11px',fontSize:14,fontWeight:800,cursor:'pointer',width:'100%'}}>
          🧾 Pasar a Factura X (efectuar venta)</button>}

        {detalle.tipo==='factura_x'&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>ENTREGAS / REMITOS</span>
            {detalle.entrega_estado&&<span style={{background:detalle.entrega_estado==='completo'?C.greenDim:C.blueDim,
              color:detalle.entrega_estado==='completo'?C.green:C.blue,border:`1px solid ${(detalle.entrega_estado==='completo'?C.green:C.blue)}40`,
              borderRadius:6,padding:'2px 9px',fontSize:11,fontWeight:700}}>
              {detalle.entrega_estado==='completo'?'✓ Entregado completo':`Entrega parcial${detalle.destino_pendiente?` · resto en ${detalle.destino_pendiente==='acopio'?'acopio':'pendiente de entrega'}`:''}`}</span>}
          </div>
          {remitos.map(r=><div key={r.id} onClick={()=>imprimir(r)} style={{background:C.surfaceAlt,borderRadius:7,padding:'7px 11px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}}>
            <span style={{color:C.text,fontSize:12}}>📄 Remito {fmtNumComp(r.punto_venta,r.numero)} · {r.fecha}</span>
            <span style={{color:C.blue,fontSize:11}}>🖨️ imprimir</span>
          </div>)}
          {detalle.entrega_estado!=='completo'&&<button onClick={()=>setRemitoFactura(detalle)}
            style={{background:C.blue,color:'#fff',border:'none',borderRadius:8,padding:'11px',fontSize:14,fontWeight:800,cursor:'pointer',width:'100%'}}>
            📦 Emitir remito (entrega)</button>}
        </div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={()=>borrar(detalle)} variant="danger" style={{flex:1}}>🗑️ Borrar</Btn>
          <Btn onClick={()=>imprimir(detalle)} style={{flex:2}}>🖨️ Imprimir</Btn>
        </div>
      </div>
    </Modal>}

    {convertir&&<Modal onClose={()=>setConvertir(null)} title="Pasar presupuesto a Factura X">
      <ComprobanteForm clientes={clientes} vendedores={vendedores} materiales={materiales} empresa={empresa} inicial={convertir}
        onClose={()=>setConvertir(null)} onSaved={()=>{setConvertir(null);cargar();onRefresh()}}/></Modal>}

    {remitoFactura&&<Modal onClose={()=>setRemitoFactura(null)} title={`Emitir remito · Factura ${fmtNumComp(remitoFactura.punto_venta,remitoFactura.numero)}`}>
      <RemitoForm factura={remitoFactura} empresa={empresa}
        onClose={()=>setRemitoFactura(null)}
        onDone={async(r)=>{ const fac=remitoFactura; setRemitoFactura(null); try{ imprimirComprobante(await getComprobante(r.id),empresa) }catch{} verDetalle(fac); cargar(); onRefresh() }}/></Modal>}
  </div>
}

// ─── CAJA VIEW ──────────────────────────────────────────────────────────────
const LOW_BALANCE = 200000
const hoyISO = ()=>new Date().toISOString().slice(0,10)
const mesActual = ()=>new Date().toISOString().slice(0,7)

function CajaView({clientes,onRefresh}:{clientes:Cliente[];onRefresh:()=>void}){
  const fileRef=useRef<HTMLInputElement>(null)
  const [movs,setMovs]=useState<CajaMov[]>([])
  const [loading,setLoading]=useState(true)
  const [show,setShow]=useState(false)
  const [edit,setEdit]=useState<CajaMov|null>(null)
  const [mes,setMes]=useState(mesActual())
  const [scanning,setScanning]=useState(false)
  const [scanMsg,setScanMsg]=useState('')
  const vacio={tipo:'ingreso',concepto:'',monto:'',categoria:'',medio_pago:'efectivo',cliente_id:'',fecha:hoyISO()}
  const [f,setF]=useState<any>(vacio)
  const [saving,setSaving]=useState(false)

  const cargar=useCallback(()=>{ setLoading(true); getCaja().then(d=>{setMovs(d);setLoading(false)}).catch(()=>setLoading(false)) },[])
  useEffect(()=>{ cargar() },[cargar])

  const saldoTotal=movs.reduce((s,m)=>s+(m.tipo==='ingreso'?Number(m.monto):-Number(m.monto)),0)
  const delMes=movs.filter(m=>(m.fecha||'').startsWith(mes))
  const ingMes=delMes.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+Number(m.monto),0)
  const egrMes=delMes.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+Number(m.monto),0)
  const meses=Array.from(new Set(movs.map(m=>(m.fecha||'').slice(0,7)).filter(Boolean))).sort().reverse()
  if(!meses.includes(mes)) meses.unshift(mes)
  // resumen por categoría del mes
  const porCat:Record<string,{ing:number;egr:number}>={}
  delMes.forEach(m=>{ const k=m.categoria||'Sin categoría'; if(!porCat[k])porCat[k]={ing:0,egr:0}; porCat[k][m.tipo==='ingreso'?'ing':'egr']+=Number(m.monto) })

  const set=(k:string,v:string)=>setF((p:any)=>({...p,[k]:v}))
  const abrirNuevo=(pre?:any)=>{ setEdit(null); setF({...vacio,...pre}); setShow(true) }
  const abrirEdit=(m:CajaMov)=>{ setEdit(m); setF({tipo:m.tipo,concepto:m.concepto,monto:String(m.monto),categoria:m.categoria||'',medio_pago:m.medio_pago||'efectivo',cliente_id:m.cliente_id||'',fecha:m.fecha||hoyISO()}); setShow(true) }
  const guardar=async()=>{
    if(!f.concepto||!parseFloat(f.monto)) return
    setSaving(true)
    const data:any={tipo:f.tipo,concepto:f.concepto,monto:parseFloat(f.monto),categoria:f.categoria||null,medio_pago:f.medio_pago,cliente_id:f.cliente_id||null,fecha:f.fecha||hoyISO()}
    try{
      if(edit){ await updateCajaMov(edit.id,data); logAct('Editó','Caja',`${data.tipo} ${money(data.monto)} · ${data.concepto}`,edit.id) }
      else { const m=await createCajaMov({...data,creado_por:getOperador()}); logAct('Registró','Caja',`${data.tipo==='ingreso'?'Ingreso':'Egreso'} ${money(data.monto)} · ${data.concepto}`,(m as any)?.id) }
      setShow(false); setF(vacio); cargar() }
    catch(e){console.error(e)} finally{setSaving(false)}
  }
  const borrar=async(m:CajaMov)=>{ if(confirm('¿Borrar este movimiento?')){ await deleteCajaMov(m.id); logAct('Borró','Caja',`${m.tipo} ${money(m.monto)} · ${m.concepto}`,m.id); cargar() } }

  const escanear=async(file:File)=>{
    setScanning(true); setScanMsg('')
    try{
      const fd=new FormData(); fd.append('ticket',file)
      const res=await fetch('/api/scan-ticket',{method:'POST',body:fd})
      const d=await res.json()
      if(!res.ok) throw new Error(d.error||'Error')
      abrirNuevo({tipo:'egreso',monto:d.total?String(d.total):'',categoria:d.categoria||'Compra de materiales',
        fecha:d.fecha||hoyISO(),concepto:[d.proveedor,d.nota].filter(Boolean).join(' — ')||'Gasto'})
    }catch(e:any){ setScanMsg('⚠️ '+e.message) }
    finally{ setScanning(false) }
  }
  const cats = f.tipo==='ingreso'?CATEGORIAS_INGRESO:CATEGORIAS_EGRESO

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Flujo de Caja</h2>
      <div style={{display:'flex',gap:8}}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&escanear(e.target.files[0])}/>
        <Btn onClick={()=>fileRef.current?.click()} variant="secondary" disabled={scanning}>{scanning?'⏳':'📷'} Escanear</Btn>
        <Btn onClick={()=>abrirNuevo()}>+ Movimiento</Btn>
      </div>
    </div>
    {scanMsg&&<div style={{color:C.red,fontSize:12,marginBottom:10}}>{scanMsg}</div>}

    {/* Saldo + mes */}
    <div style={{background:`linear-gradient(135deg,${saldoTotal>=0?C.greenDim:C.redDim},${C.surfaceAlt})`,
      border:`1px solid ${(saldoTotal>=0?C.green:C.red)}40`,borderRadius:12,padding:'16px 18px',marginBottom:12}}>
      <div style={{color:C.textMuted,fontSize:12,fontWeight:700}}>SALDO ACTUAL</div>
      <div style={{color:saldoTotal>=0?C.green:C.red,fontSize:28,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>{money(saldoTotal)}</div>
      {saldoTotal<LOW_BALANCE&&<div style={{color:C.accent,fontSize:12,fontWeight:700,marginTop:4}}>⚠️ Saldo bajo (menos de {money(LOW_BALANCE)})</div>}
    </div>

    {/* Selector de mes + ingresos/egresos del mes */}
    <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center',flexWrap:'wrap'}}>
      <select value={mes} onChange={e=>setMes(e.target.value)} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,
        borderRadius:7,padding:'6px 10px',color:C.text,fontSize:13,outline:'none'}}>
        {meses.map(m=><option key={m} value={m}>{m}</option>)}
      </select>
      <div style={{flex:1,display:'flex',gap:8}}>
        <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px'}}>
          <div style={{color:C.textMuted,fontSize:10}}>Ingresos</div>
          <div style={{color:C.green,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>+{money(ingMes)}</div>
        </div>
        <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px'}}>
          <div style={{color:C.textMuted,fontSize:10}}>Egresos</div>
          <div style={{color:C.red,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>−{money(egrMes)}</div>
        </div>
        <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px'}}>
          <div style={{color:C.textMuted,fontSize:10}}>Neto</div>
          <div style={{color:(ingMes-egrMes)>=0?C.green:C.red,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>{money(ingMes-egrMes)}</div>
        </div>
      </div>
    </div>

    {/* Resumen por categoría */}
    {Object.keys(porCat).length>0&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px',marginBottom:14}}>
      <div style={{color:C.textMuted,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:6}}>POR CATEGORÍA ({mes})</div>
      {Object.entries(porCat).sort((a,b)=>(b[1].ing+b[1].egr)-(a[1].ing+a[1].egr)).map(([cat,v])=>
        <div key={cat} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0'}}>
          <span style={{color:C.text}}>{cat}</span>
          <span style={{fontFamily:"'Space Mono',monospace"}}>
            {v.ing>0&&<span style={{color:C.green}}>+{money(v.ing)} </span>}
            {v.egr>0&&<span style={{color:C.red}}>−{money(v.egr)}</span>}
          </span>
        </div>)}
    </div>}

    {loading&&<Spinner/>}
    {!loading&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
      {delMes.map(m=><div key={m.id} onClick={()=>abrirEdit(m)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:'10px 14px',
        display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,cursor:'pointer'}}>
        <div style={{minWidth:0}}>
          <div style={{color:C.text,fontSize:14,fontWeight:600}}>{m.concepto}</div>
          <div style={{color:C.textMuted,fontSize:12}}>📅 {m.fecha} · {m.medio_pago}{m.categoria?` · ${m.categoria}`:''}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{color:m.tipo==='ingreso'?C.green:C.red,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>
            {m.tipo==='ingreso'?'+':'−'}{money(m.monto)}</span>
          <button onClick={(e)=>{e.stopPropagation();borrar(m)}} style={{background:'none',border:'none',color:C.textDim,cursor:'pointer',fontSize:14}}>🗑️</button>
        </div>
      </div>)}
      {delMes.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>Sin movimientos en {mes}</div>}
    </div>}

    {show&&<Modal onClose={()=>setShow(false)} title={edit?'Editar Movimiento':'Nuevo Movimiento'}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <Select label="Tipo" value={f.tipo} onChange={(v:string)=>{set('tipo',v);set('categoria','')}} options={[{value:'ingreso',label:'💵 Ingreso (cobro)'},{value:'egreso',label:'💸 Egreso (pago)'}]}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <Input label="Monto" value={f.monto} onChange={(v:string)=>set('monto',v)} type="number"/>
          <Input label="Fecha" value={f.fecha} onChange={(v:string)=>set('fecha',v)} type="date"/>
        </div>
        <Select label="Categoría" value={f.categoria} onChange={(v:string)=>set('categoria',v)} options={cats.map(c=>({value:c,label:c}))} placeholder="Sin categoría"/>
        <Input label="Concepto / Nota" value={f.concepto} onChange={(v:string)=>set('concepto',v)} required/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <Select label="Medio de pago" value={f.medio_pago} onChange={(v:string)=>set('medio_pago',v)}
            options={['efectivo','transferencia','tarjeta','cheque'].map(x=>({value:x,label:x}))}/>
          <Select label="Cliente (opcional)" value={f.cliente_id} onChange={(v:string)=>set('cliente_id',v)}
            options={clientes.map(c=>({value:c.id,label:c.nombre}))} placeholder="Sin asignar"/>
        </div>
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={()=>setShow(false)} variant="secondary" style={{flex:1}}>Cancelar</Btn>
          <Btn onClick={guardar} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar'}</Btn>
        </div>
      </div>
    </Modal>}
  </div>
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
// ─── PRODUCTOS (ABM artículos) ────────────────────────────────────────────────
function ProductosView({materiales,proveedores,onRefresh}:{materiales:any[];proveedores:any[];onRefresh:()=>void}){
  const [search,setSearch]=useState('')
  const [sel,setSel]=useState<any>(null)
  const [nuevo,setNuevo]=useState(false)
  const filt=materiales.filter((m:any)=>{
    const q=search.toLowerCase()
    return !q || (m.nombre||'').toLowerCase().includes(q) || (m.codigo||'').toLowerCase().includes(q) || (m.rubro||'').toLowerCase().includes(q)
  }).slice(0,300)
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Productos <span style={{color:C.textDim,fontSize:13,fontWeight:400}}>({materiales.length})</span></h2>
      <Btn onClick={()=>setNuevo(true)}>+ Producto</Btn>
    </div>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Buscar por nombre, código o rubro..."
      style={{width:'100%',background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:14,marginBottom:12,outline:'none'}} />
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {filt.map((m:any)=><div key={m.id} onClick={()=>setSel(m)} style={{background:C.surface,border:`1px solid ${C.border}`,
        borderRadius:9,padding:'10px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <div style={{minWidth:0}}>
          <div style={{color:C.text,fontSize:14,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.nombre}</div>
          <div style={{color:C.textDim,fontSize:11}}>
            {m.codigo?`#${m.codigo} · `:''}{m.rubro||'sin rubro'}{m.proveedores?.nombre?` · ${m.proveedores.nombre}`:''}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>{money(m.precio_ref||0)}</div>
          <div style={{color:(m.stock>0?C.green:C.textDim),fontSize:11}}>stock: {m.stock??0} {m.unidad}</div>
        </div>
      </div>)}
      {filt.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:30}}>Sin resultados</div>}
      {materiales.filter((m:any)=>{const q=search.toLowerCase();return !q||(m.nombre||'').toLowerCase().includes(q)}).length>300&&
        <div style={{color:C.textDim,textAlign:'center',fontSize:12,padding:8}}>Mostrando 300 — afiná la búsqueda para ver más</div>}
    </div>
    {(sel||nuevo)&&<Modal onClose={()=>{setSel(null);setNuevo(false)}} title={nuevo?'Nuevo Producto':'Editar Producto'}>
      <ProductoForm prod={sel} proveedores={proveedores} onClose={()=>{setSel(null);setNuevo(false)}} onSaved={()=>{setSel(null);setNuevo(false);onRefresh()}}/>
    </Modal>}
  </div>
}
function ProductoForm({prod,proveedores,onClose,onSaved}:{prod:any;proveedores:any[];onClose:()=>void;onSaved:()=>void}){
  const [f,setF]=useState({nombre:prod?.nombre||'',codigo:prod?.codigo||'',unidad:prod?.unidad||'u',
    precio_ref:String(prod?.precio_ref??''),costo:String(prod?.costo??''),stock:String(prod?.stock??''),
    rubro:prod?.rubro||'',proveedor_id:prod?.proveedor_id||'',recargo:prod?.recargo!=null?String(prod.recargo):''})
  const [saving,setSaving]=useState(false);const [msg,setMsg]=useState('')
  const set=(k:string,v:string)=>setF(s=>({...s,[k]:v}))
  const guardar=async()=>{
    if(!f.nombre){setMsg('El nombre es obligatorio');return}
    setSaving(true);setMsg('')
    const data:any={nombre:f.nombre,codigo:f.codigo||null,unidad:f.unidad||'u',
      precio_ref:f.precio_ref?parseFloat(f.precio_ref):null,costo:f.costo?parseFloat(f.costo):null,
      stock:f.stock?parseFloat(f.stock):0,rubro:f.rubro||null,proveedor_id:f.proveedor_id||null,
      recargo:f.recargo!==''?parseFloat(f.recargo):null}
    try{ if(prod) await updateMaterial(prod.id,data); else await createMaterial({...data,activo:true}); onSaved() }
    catch(e:any){setMsg(e.message||'Error');setSaving(false)}
  }
  const del=async()=>{ if(!prod||!confirm(`¿Eliminar ${prod.nombre}?`))return; try{await deleteMaterial(prod.id);onSaved()}catch{} }
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <Input label="Nombre" value={f.nombre} onChange={(v:string)=>set('nombre',v)} required/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Input label="Código" value={f.codigo} onChange={(v:string)=>set('codigo',v)}/>
      <Input label="Unidad" value={f.unidad} onChange={(v:string)=>set('unidad',v)}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
      <Input label="Precio" value={f.precio_ref} onChange={(v:string)=>set('precio_ref',v)} type="number"/>
      <Input label="Costo" value={f.costo} onChange={(v:string)=>set('costo',v)} type="number"/>
      <Input label="Stock" value={f.stock} onChange={(v:string)=>set('stock',v)} type="number"/>
    </div>
    <Input label="Recargo % (opcional — vacío usa el general)" value={f.recargo} onChange={(v:string)=>set('recargo',v)} type="number" placeholder="ej: 47.04"/>
    <Input label="Rubro" value={f.rubro} onChange={(v:string)=>set('rubro',v)}/>
    <Select label="Proveedor" value={f.proveedor_id} onChange={(v:string)=>set('proveedor_id',v)}
      options={proveedores.map((p:any)=>({value:p.id,label:p.nombre}))}/>
    {msg&&<div style={{color:C.red,fontSize:12}}>{msg}</div>}
    <div style={{display:'flex',gap:10}}>
      {prod&&<Btn onClick={del} variant="danger" style={{flex:1}}>🗑️</Btn>}
      <Btn onClick={onClose} variant="secondary" style={{flex:1}}>Cancelar</Btn>
      <Btn onClick={guardar} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar'}</Btn>
    </div>
  </div>
}

// ─── IMPORTAR (Excel/CSV) ─────────────────────────────────────────────────────
function ImportarView({onRefresh}:{onRefresh:()=>void}){
  const fileRef=useRef<HTMLInputElement>(null)
  const [tipo,setTipo]=useState<'clientes'|'productos'>('clientes')
  const [rows,setRows]=useState<any[]|null>(null)
  const [cols,setCols]=useState<string[]>([])
  const [map,setMap]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState<{t:string;ok:boolean}|null>(null)
  const campos = tipo==='clientes'
    ? [['nombre','Nombre'],['cuit','CUIT'],['dni','DNI'],['direccion','Dirección'],['localidad','Localidad'],['provincia','Provincia'],['cp','CP'],['telefono','Teléfono'],['email','Email'],['condicion_iva','Cond. IVA']]
    : [['nombre','Nombre'],['codigo','Código'],['precio_ref','Precio'],['costo','Costo'],['stock','Stock'],['rubro','Rubro'],['unidad','Unidad']]

  const onFile=async(file:File)=>{
    setBusy(true);setMsg(null);setRows(null)
    try{
      const XLSX=await import('xlsx')
      const buf=await file.arrayBuffer()
      const wb=XLSX.read(buf,{type:'array'})
      const ws=wb.Sheets[wb.SheetNames[0]]
      const json:any[]=XLSX.utils.sheet_to_json(ws,{defval:''})
      if(!json.length){setMsg({t:'El archivo está vacío',ok:false});setBusy(false);return}
      const c=Object.keys(json[0])
      setCols(c);setRows(json)
      // auto-map por nombre similar
      const auto:Record<string,string>={}
      campos.forEach(([k])=>{ const hit=c.find(col=>col.toLowerCase().replace(/[^a-z]/g,'').includes(k.replace('_ref','').replace('_iva','').slice(0,4))); if(hit)auto[k]=hit })
      setMap(auto)
    }catch(e:any){setMsg({t:'No se pudo leer: '+e.message,ok:false})}
    setBusy(false)
  }
  const importar=async()=>{
    if(!rows)return; setBusy(true);setMsg(null)
    try{
      const data=rows.map(r=>{
        const o:any={}
        campos.forEach(([k])=>{ if(map[k]&&r[map[k]]!=='') o[k]=r[map[k]] })
        return o
      }).filter(o=>o.nombre)
      // convertir numéricos en productos
      if(tipo==='productos') data.forEach((o:any)=>{['precio_ref','costo','stock'].forEach(k=>{if(o[k]!=null)o[k]=parseFloat(String(o[k]).replace(/[^\d.,-]/g,'').replace(/\./g,'').replace(',','.'))||0})})
      const n=tipo==='clientes'?await bulkUpsertClientes(data):await bulkUpsertMateriales(data)
      setMsg({t:`✅ ${n} ${tipo} importados/actualizados`,ok:true}); onRefresh()
    }catch(e:any){setMsg({t:'Error: '+e.message,ok:false})}
    setBusy(false)
  }
  return <div>
    <h2 style={{color:C.text,fontSize:20,fontWeight:800,marginBottom:4}}>Importar / Actualizar</h2>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Subí un Excel o CSV para cargar o actualizar datos en masa</p>
    <div style={{display:'flex',gap:8,marginBottom:16}}>
      {(['clientes','productos'] as const).map(t=><button key={t} onClick={()=>{setTipo(t);setRows(null);setMap({})}} style={{
        flex:1,padding:'10px',borderRadius:8,fontWeight:700,cursor:'pointer',fontSize:14,
        background:tipo===t?C.accent:C.surfaceAlt,color:tipo===t?'#000':C.textMuted,border:`1px solid ${tipo===t?C.accent:C.border}`}}>
        {t==='clientes'?'👥 Clientes':'📦 Productos'}</button>)}
    </div>
    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&onFile(e.target.files[0])}/>
    <div onClick={()=>!busy&&fileRef.current?.click()} style={{background:C.surfaceAlt,border:`2px dashed ${C.border}`,
      borderRadius:12,padding:20,textAlign:'center',cursor:'pointer',marginBottom:14}}>
      <div style={{fontSize:30,marginBottom:6}}>📂</div>
      <div style={{color:C.text,fontWeight:700,fontSize:14}}>{busy?'Procesando...':'Elegir archivo Excel/CSV'}</div>
      <div style={{color:C.textDim,fontSize:11,marginTop:3}}>La primera fila debe tener los nombres de columna</div>
    </div>
    {rows&&<>
      <div style={{color:C.textMuted,fontSize:12,fontWeight:700,marginBottom:8}}>MAPEO DE COLUMNAS — {rows.length} filas detectadas</div>
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
        {campos.map(([k,label])=><div key={k} style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{color:C.text,fontSize:13,width:110}}>{label}</span>
          <select value={map[k]||''} onChange={e=>setMap(m=>({...m,[k]:e.target.value}))}
            style={{flex:1,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:7,padding:'7px 9px',color:C.text,fontSize:13,outline:'none'}}>
            <option value="">— ignorar —</option>
            {cols.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>)}
      </div>
      <Btn onClick={importar} disabled={busy} style={{width:'100%',justifyContent:'center'}}>{busy?'Importando...':`💾 Importar ${rows.length} ${tipo}`}</Btn>
    </>}
    {msg&&<div style={{marginTop:12,padding:'9px 13px',borderRadius:8,fontSize:13,fontWeight:600,
      background:msg.ok?C.greenDim:C.redDim,color:msg.ok?C.green:C.red,border:`1px solid ${msg.ok?C.green:C.red}40`}}>{msg.t}</div>}
  </div>
}

// ─── CONFIGURACIÓN (empresa + recargo general) ────────────────────────────────
function ConfigView({empresa,onRefresh}:{empresa:EmpresaConfig|null;onRefresh:()=>void}){
  const e=empresa||{} as EmpresaConfig
  const [f,setF]=useState<any>({
    nombre:e.nombre||'',cuit:e.cuit||'',iibb:e.iibb||'',condicion_iva:e.condicion_iva||'Responsable Inscripto',
    inicio_actividad:e.inicio_actividad||'',direccion:e.direccion||'',localidad:e.localidad||'',provincia:e.provincia||'',
    cp:e.cp||'',telefono:e.telefono||'',email:e.email||'',punto_venta:String(e.punto_venta??1),
    recargo_general:String(e.recargo_general??47.04),descuento_general:String(e.descuento_general??0),logo_url:e.logo_url||'',pie_comprobante:e.pie_comprobante||''})
  const [saving,setSaving]=useState(false);const [msg,setMsg]=useState('')
  const logoRef=useRef<HTMLInputElement>(null)
  const set=(k:string,v:string)=>setF((s:any)=>({...s,[k]:v}))
  const cargarLogo=(file:File)=>{
    const reader=new FileReader()
    reader.onload=ev=>{
      const img=new Image()
      img.onload=()=>{
        const max=400; let w=img.width,h=img.height
        if(w>max||h>max){ const r=Math.min(max/w,max/h); w=Math.round(w*r); h=Math.round(h*r) }
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h
        cv.getContext('2d')?.drawImage(img,0,0,w,h)
        set('logo_url', cv.toDataURL('image/png'))
      }
      img.src=ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }
  const guardar=async()=>{
    setSaving(true);setMsg('')
    try{
      await updateEmpresa({...f, punto_venta:parseInt(f.punto_venta)||1, recargo_general:parseFloat(String(f.recargo_general).replace(',','.'))||0, descuento_general:parseFloat(String(f.descuento_general).replace(',','.'))||0})
      onRefresh(); setMsg('✅ Configuración guardada')
    }catch(err:any){setMsg('⚠️ '+(err.message||'Error'))}
    finally{setSaving(false)}
  }
  return <div>
    <h2 style={{color:C.text,fontSize:20,fontWeight:800,marginBottom:14}}>Configuración</h2>

    <div style={{background:`linear-gradient(135deg,${C.accentDim},${C.surfaceAlt})`,border:`1px solid ${C.accent}40`,borderRadius:12,padding:'14px 16px',marginBottom:18}}>
      <label style={{color:C.accent,fontSize:12,fontWeight:700,letterSpacing:0.5}}>RECARGO GENERAL (%)</label>
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
        <input value={f.recargo_general} onChange={e=>set('recargo_general',e.target.value)} type="number" step="0.01"
          style={{width:120,background:C.bg,border:`1px solid ${C.accent}55`,borderRadius:8,padding:'10px 12px',color:C.accent,fontSize:18,fontWeight:800,outline:'none',textAlign:'right'}}/>
        <span style={{color:C.textMuted,fontSize:13}}>% — recargo oculto sobre los productos (activable al cargar comprobantes, no se muestra en el PDF)</span>
      </div>
      <label style={{color:C.green,fontSize:12,fontWeight:700,letterSpacing:0.5,marginTop:14,display:'block'}}>DESCUENTO GENERAL (%)</label>
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
        <input value={f.descuento_general} onChange={e=>set('descuento_general',e.target.value)} type="number" step="0.01"
          style={{width:120,background:C.bg,border:`1px solid ${C.green}55`,borderRadius:8,padding:'10px 12px',color:C.green,fontSize:18,fontWeight:800,outline:'none',textAlign:'right'}}/>
        <span style={{color:C.textMuted,fontSize:13}}>% — descuento sugerido por defecto (sí se muestra en el PDF)</span>
      </div>
    </div>

    <h3 style={{color:C.textMuted,fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Datos de la empresa (encabezado de comprobantes)</h3>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <Input label="Nombre / Razón social" value={f.nombre} onChange={(v:string)=>set('nombre',v)}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <Input label="CUIT" value={f.cuit} onChange={(v:string)=>set('cuit',v)}/>
        <Input label="Ingresos Brutos" value={f.iibb} onChange={(v:string)=>set('iibb',v)}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10}}>
        <Select label="Condición IVA" value={f.condicion_iva} onChange={(v:string)=>set('condicion_iva',v)} options={CONDICIONES_IVA.map(c=>({value:c,label:c}))}/>
        <Input label="Inicio actividad" value={f.inicio_actividad} onChange={(v:string)=>set('inicio_actividad',v)} type="date"/>
      </div>
      <Input label="Dirección" value={f.direccion} onChange={(v:string)=>set('direccion',v)}/>
      <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr',gap:10}}>
        <Input label="Localidad" value={f.localidad} onChange={(v:string)=>set('localidad',v)}/>
        <Input label="Provincia" value={f.provincia} onChange={(v:string)=>set('provincia',v)}/>
        <Input label="CP" value={f.cp} onChange={(v:string)=>set('cp',v)}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr',gap:10}}>
        <Input label="Teléfono" value={f.telefono} onChange={(v:string)=>set('telefono',v)}/>
        <Input label="Email" value={f.email} onChange={(v:string)=>set('email',v)}/>
        <Input label="Punto venta" value={f.punto_venta} onChange={(v:string)=>set('punto_venta',v)} type="number"/>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        <label style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>LOGO (imagen de la PC)</label>
        <input ref={logoRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&cargarLogo(e.target.files[0])}/>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {f.logo_url
            ? <img src={f.logo_url} alt="logo" style={{width:64,height:64,objectFit:'contain',background:'#fff',borderRadius:8,border:`1px solid ${C.border}`}}/>
            : <div style={{width:64,height:64,borderRadius:8,border:`1px dashed ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:C.textDim}}>🖼️</div>}
          <Btn onClick={()=>logoRef.current?.click()} variant="secondary" size="sm">📁 Elegir imagen</Btn>
          {f.logo_url&&<Btn onClick={()=>set('logo_url','')} variant="danger" size="sm">Quitar</Btn>}
        </div>
        <span style={{color:C.textDim,fontSize:11}}>Se usa en el encabezado de los comprobantes. Se ajusta automáticamente.</span>
      </div>
      <Input label="Pie de comprobante / datos de pago" value={f.pie_comprobante} onChange={(v:string)=>set('pie_comprobante',v)}/>
      {msg&&<div style={{color:msg.startsWith('✅')?C.green:C.red,fontSize:13,fontWeight:600}}>{msg}</div>}
      <Btn onClick={guardar} disabled={saving}>{saving?'Guardando...':'💾 Guardar configuración'}</Btn>
    </div>
  </div>
}

// ─── ACTIVIDAD (registro de quién hizo qué) ───────────────────────────────────
function ActividadView(){
  const [acts,setActs]=useState<Actividad[]>([])
  const [loading,setLoading]=useState(true)
  const [filtro,setFiltro]=useState('')
  const cargar=useCallback(()=>{ setLoading(true); getActividad(400).then(d=>{setActs(d);setLoading(false)}).catch(()=>setLoading(false)) },[])
  useEffect(()=>{ cargar() },[cargar])
  const operadores=Array.from(new Set(acts.map(a=>a.operador).filter(Boolean))) as string[]
  const filt=filtro?acts.filter(a=>a.operador===filtro):acts
  const fmt=(s?:string)=>{ if(!s)return ''; const d=new Date(s); return d.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) }
  const colorAcc=(a?:string)=> a==='Borró'?C.red : a==='Editó'?C.accent : C.green
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Registro de Actividad</h2>
      <Btn onClick={cargar} variant="secondary" size="sm">↻ Actualizar</Btn>
    </div>
    {operadores.length>0&&<div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
      {[['','Todos'],...operadores.map(o=>[o,o])].map(([k,l])=>
        <button key={k} onClick={()=>setFiltro(k)} style={{background:filtro===k?C.accent:C.surfaceAlt,
          color:filtro===k?'#000':C.textMuted,border:`1px solid ${filtro===k?C.accent:C.border}`,
          borderRadius:6,padding:'5px 11px',fontSize:12,cursor:'pointer',fontWeight:filtro===k?700:400}}>{l}</button>)}
    </div>}
    {loading&&<Spinner/>}
    {!loading&&<div style={{display:'flex',flexDirection:'column',gap:6}}>
      {filt.map(a=><div key={a.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 13px',
        display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
        <div style={{minWidth:0}}>
          <div style={{color:C.text,fontSize:13}}>
            <span style={{color:colorAcc(a.accion),fontWeight:700}}>{a.accion}</span> {a.entidad} · {a.detalle}</div>
          <div style={{color:C.textDim,fontSize:11,marginTop:2}}>{fmt(a.created_at)}</div>
        </div>
        <span style={{background:C.blueDim,color:C.blue,border:`1px solid ${C.blue}40`,borderRadius:6,
          padding:'2px 9px',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>{a.operador||'—'}</span>
      </div>)}
      {filt.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>Sin actividad registrada</div>}
    </div>}
  </div>
}

// Dos módulos: Gestión/Administración y Logística. El Panel es común a ambos.
const MODULOS = {
  gestion: {
    label:'Gestión', icon:'🏢',
    nav:[
      {id:'dashboard',icon:'📊',label:'Panel'},
      {id:'comprobantes',icon:'🧾',label:'Comprob.'},
      {id:'clientes',icon:'👥',label:'Clientes'},
      {id:'cuentas',icon:'📒',label:'Ctas Ctes'},
      {id:'productos',icon:'📦',label:'Productos'},
      {id:'actividad',icon:'📜',label:'Actividad'},
      {id:'importar',icon:'📥',label:'Importar'},
      {id:'config',icon:'⚙️',label:'Config'},
    ]
  },
  logistica: {
    label:'Logística', icon:'🚚',
    nav:[
      {id:'dashboard',icon:'📊',label:'Panel'},
      {id:'pedidos',icon:'📦',label:'Pedidos'},
      {id:'rutas',icon:'🗺️',label:'Rutas'},
      {id:'compras',icon:'🛒',label:'Compras'},
      {id:'proveedores',icon:'🏭',label:'Proveed.'},
    ]
  },
  caja: {
    label:'Caja', icon:'💵',
    nav:[
      {id:'dashboard',icon:'📊',label:'Panel'},
      {id:'caja',icon:'💵',label:'Flujo de Caja'},
    ]
  }
} as const
type Modulo = keyof typeof MODULOS

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}:{onLogin:()=>void}) {
  const [email,setEmail]=useState('')
  const [pwd,setPwd]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const handleLogin=async()=>{
    setLoading(true); setError('')
    const {error:e}=await supabase.auth.signInWithPassword({email,password:pwd})
    if(e) setError(e.message)
    else onLogin()
    setLoading(false)
  }

  return <div style={{minHeight:'100vh',background:C.bg,display:'flex',
    alignItems:'center',justifyContent:'center',padding:20}}>
    <div style={{width:'100%',maxWidth:380,background:C.surface,
      border:`1px solid ${C.border}`,borderRadius:16,padding:32}}>
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{fontSize:40,marginBottom:10}}>🏗️</div>
        <div style={{color:C.text,fontSize:22,fontWeight:800}}>LogiObra</div>
        <div style={{color:C.textMuted,fontSize:14}}>Sistema de Logística</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="usuario@empresa.com" />
        <Input label="Contraseña" value={pwd} onChange={setPwd} type="password" placeholder="••••••••" />
        {error&&<div style={{color:C.red,fontSize:13,background:C.redDim,padding:'8px 12px',borderRadius:7}}>{error}</div>}
        <Btn onClick={handleLogin} disabled={loading} style={{width:'100%',justifyContent:'center',marginTop:4}}>
          {loading?'Ingresando...':'Ingresar'}</Btn>
      </div>
    </div>
  </div>
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [session,setSession]=useState<any>(undefined)
  const [vista,setVista]=useState<string>(()=>{
    try{return localStorage.getItem('logiobra_vista')||'dashboard'}catch{return 'dashboard'}
  })
  const [modulo,setModulo]=useState<Modulo>(()=>{
    try{return (localStorage.getItem('logiobra_modulo') as Modulo)||'gestion'}catch{return 'gestion'}
  })
  const [operador,setOperadorState]=useState<string>(()=>getOperador())
  const setOperador=(n:string)=>{ setOperadorState(n); try{localStorage.setItem('logiobra_operador',n)}catch{} }
  const agregarOperador=async()=>{
    const n=prompt('Nombre del operador / vendedor:')?.trim(); if(!n) return
    try{ await crearVendedor(n); await loadData(); setOperador(n) }catch(e){console.error(e)}
  }
  const [pedidos,setPedidos]=useState<Pedido[]>([])
  const [materiales,setMateriales]=useState<any[]>([])
  const [proveedores,setProveedores]=useState<any[]>([])
  const [clientes,setClientes]=useState<Cliente[]>([])
  const [vendedores,setVendedores]=useState<Vendedor[]>([])
  const [empresa,setEmpresa]=useState<EmpresaConfig|null>(null)
  const [loading,setLoading]=useState(false)
  const [toast,setToast]=useState<{msg:string;type:string}|null>(null)

  // Auth
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>setSession(session))
    // Al volver de otra ventana/pestaña Supabase refresca el token y dispara este evento.
    // Si sigue siendo el mismo usuario, mantenemos la MISMA referencia de sesión para no
    // re-ejecutar loadData (que mostraría el spinner y desmontaría la vista/formulario abierto).
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>{
      setSession((prev:any)=> (prev && s && prev.user?.id===s.user?.id) ? prev : s)
    })
    return ()=>subscription.unsubscribe()
  },[])

  // silent=true → refresco en segundo plano sin mostrar el spinner ni desmontar las vistas/modales abiertos
  const loadData=useCallback(async(silent=false)=>{
    if(!session) return
    if(!silent) setLoading(true)
    try {
      await marcarAtrasados()
      const [p,m,pr]=await Promise.all([getPedidos(),getMateriales(),getProveedores()])
      setPedidos(p||[]); setMateriales(m||[]); setProveedores(pr||[])
      // ERP (no rompe si las tablas aún no existen)
      try {
        const [cl,ve,emp]=await Promise.all([getClientes(),getVendedores(),getEmpresa()])
        setClientes(cl||[]); setVendedores(ve||[]); setEmpresa(emp||null)
      } catch {/* migración ERP pendiente */}
    } catch(e:any) {
      if(!silent) setToast({msg:'Error cargando datos',type:'error'})
    } finally { if(!silent) setLoading(false) }
  },[session])

  useEffect(()=>{ loadData() },[loadData])

  // Realtime
  useEffect(()=>{
    if(!session) return
    const ch=subscribeToEstados((updated)=>{
      setPedidos(prev=>prev.map(p=>p.id===updated.id?{...p,...updated}:p))
    })
    return ()=>{ supabase.removeChannel(ch) }
  },[session])

  // Auto-refresh cada 5 min
  useEffect(()=>{
    const t=setInterval(()=>{ if(session) loadData(true) },5*60*1000)
    return ()=>clearInterval(t)
  },[loadData,session])

  if(session===undefined) return <div style={{minHeight:'100vh',background:C.bg,display:'flex',
    alignItems:'center',justifyContent:'center'}}><Spinner/></div>
  if(!session) return <LoginScreen onLogin={loadData}/>

  const urgentCount=pedidos.filter(p=>p.estado==='urgente'||p.atrasado).length

  return <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',
    fontFamily:"'DM Sans',system-ui,sans-serif"}}>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}

    {/* Header */}
    <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,
      padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',
      position:'sticky',top:0,zIndex:100}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:32,height:32,borderRadius:8,background:C.accent,
          display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🏗️</div>
        <div>
          <div style={{fontWeight:800,fontSize:15,color:C.text}}>Hornero</div>
          <div style={{fontSize:10,color:C.textMuted}}>Sistema de Gestión</div>
        </div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {urgentCount>0&&<span style={{background:C.redDim,color:C.red,border:`1px solid ${C.red}40`,
          borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:700}}>
          🚨 {urgentCount}</span>}
        <select value={operador} onChange={e=>{ if(e.target.value==='__add__'){agregarOperador()} else setOperador(e.target.value) }}
          title="Operador activo (quién está usando esta PC)"
          style={{background:operador?C.accentDim:C.redDim,color:operador?C.accent:C.red,
            border:`1px solid ${operador?C.accent:C.red}55`,borderRadius:7,padding:'5px 8px',fontSize:12,fontWeight:700,outline:'none',maxWidth:120}}>
          <option value="">👤 ¿Quién sos?</option>
          {vendedores.map(v=><option key={v.id} value={v.nombre}>👤 {v.nombre}</option>)}
          <option value="__add__">➕ Agregar...</option>
        </select>
        <button onClick={()=>supabase.auth.signOut()} style={{background:C.surfaceAlt,
          border:`1px solid ${C.border}`,color:C.textMuted,borderRadius:7,
          padding:'5px 10px',fontSize:12,cursor:'pointer'}}>Salir</button>
      </div>
    </div>

    {/* Selector de módulo */}
    <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:'flex',gap:0,
      position:'sticky',top:57,zIndex:99}}>
      {(Object.keys(MODULOS) as Modulo[]).map(mk=>{const m=MODULOS[mk];const act=modulo===mk; return <button key={mk}
        onClick={()=>{setModulo(mk);const v=m.nav[0].id;setVista(v);try{localStorage.setItem('logiobra_modulo',mk);localStorage.setItem('logiobra_vista',v)}catch{}}}
        style={{flex:1,padding:'10px',background:act?C.accentDim:'transparent',border:'none',
          borderBottom:`2px solid ${act?C.accent:'transparent'}`,color:act?C.accent:C.textMuted,
          cursor:'pointer',fontWeight:act?800:500,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
        <span>{m.icon}</span> {m.label}</button>})}
    </div>

    {/* Content */}
    <div style={{flex:1,padding:'18px 14px',maxWidth:680,width:'100%',
      margin:'0 auto',boxSizing:'border-box' as any}}>
      {loading&&<Spinner/>}
      {!loading&&vista==='dashboard'&&<Dashboard modulo={modulo} pedidos={pedidos} clientes={clientes} materiales={materiales}/>}
      {!loading&&vista==='pedidos'&&<PedidosView pedidos={pedidos} materiales={materiales} onRefresh={()=>loadData(true)}/>}
      {!loading&&vista==='rutas'&&<RutasView pedidos={pedidos}/>}
      {!loading&&vista==='compras'&&<ComprasView pedidos={pedidos} materiales={materiales} proveedores={proveedores} onRefresh={loadData}/>}
      {!loading&&vista==='proveedores'&&<ProveedoresView proveedores={proveedores} materiales={materiales} onRefresh={loadData}/>}
      {!loading&&vista==='clientes'&&<ClientesView clientes={clientes} empresa={empresa} onRefresh={loadData}/>}
      {!loading&&vista==='cuentas'&&<CuentasView clientes={clientes} empresa={empresa} onRefresh={loadData}/>}
      {!loading&&vista==='comprobantes'&&<ComprobantesView clientes={clientes} vendedores={vendedores} materiales={materiales} empresa={empresa} onRefresh={loadData}/>}
      {!loading&&vista==='caja'&&<CajaView clientes={clientes} onRefresh={loadData}/>}
      {!loading&&vista==='productos'&&<ProductosView materiales={materiales} proveedores={proveedores} onRefresh={loadData}/>}
      {!loading&&vista==='actividad'&&<ActividadView/>}
      {!loading&&vista==='importar'&&<ImportarView onRefresh={loadData}/>}
      {!loading&&vista==='config'&&<ConfigView empresa={empresa} onRefresh={loadData}/>}
    </div>

    {/* Indicador de tareas en segundo plano */}
    <BgTaskIndicator />

    {/* Bottom Nav */}
    <div style={{background:C.surface,borderTop:`1px solid ${C.border}`,
      display:'flex',position:'sticky',bottom:0,zIndex:100,overflowX:'auto'}}>
      {MODULOS[modulo].nav.map(item=><button key={item.id} onClick={()=>{setVista(item.id);try{localStorage.setItem('logiobra_vista',item.id)}catch{}}} style={{
        flex:'1 0 auto',minWidth:64,padding:'8px 6px 10px',background:'none',border:'none',
        color:vista===item.id?C.accent:C.textDim,cursor:'pointer',
        display:'flex',flexDirection:'column',alignItems:'center',gap:2,
        borderTop:`2px solid ${vista===item.id?C.accent:'transparent'}`,
        transition:'all 0.15s'}}>
        <span style={{fontSize:18}}>{item.icon}</span>
        <span style={{fontSize:10,fontWeight:vista===item.id?700:400,whiteSpace:'nowrap'}}>{item.label}</span>
      </button>)}
    </div>
  </div>
}
