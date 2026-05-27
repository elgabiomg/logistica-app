'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import {
  supabase, getPedidos, createPedido, updateEstadoPedido, deletePedido,
  getMateriales, getProveedores, createProveedor, createMaterial,
  getListaCompras, getHojasRuta, marcarAtrasados, subscribeToEstados,
  type Pedido, type EstadoPedido, type Material, type Proveedor,
  type ItemListaCompras, type ItemHojaRuta
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
}

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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({pedidos}:{pedidos:Pedido[]}) {
  const stats = {
    total: pedidos.length,
    urgentes: pedidos.filter(p=>p.estado==='urgente').length,
    preparacion: pedidos.filter(p=>p.estado==='preparacion').length,
    entregados: pedidos.filter(p=>p.estado==='entregado').length,
    atrasados: pedidos.filter(p=>p.atrasado).length,
  }
  const alertas = pedidos.filter(p=>p.estado==='urgente'||p.atrasado)
  const pct = stats.total > 0 ? Math.round((stats.entregados/stats.total)*100) : 0

  return <div>
    <h2 style={{color:C.text,fontSize:20,fontWeight:800,marginBottom:4}}>Panel General</h2>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:20}}>
      {new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
    </p>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10,marginBottom:24}}>
      {([['📦','Total',stats.total,C.blue],['🚨','Urgentes',stats.urgentes,C.red],
         ['🔧','Preparando',stats.preparacion,C.accent],['✅','Entregados',stats.entregados,C.green],
         ['⚠️','Atrasados',stats.atrasados,C.purple]] as any[]).map(([icon,label,val,color])=>
        <div key={label} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'14px 16px'}}>
          <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
          <div style={{fontSize:26,fontWeight:800,color,fontFamily:"'Space Mono',monospace"}}>{val}</div>
          <div style={{fontSize:11,color:C.textMuted,fontWeight:600}}>{label}</div>
        </div>
      )}
    </div>

    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'16px 18px',marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
        <span style={{color:C.textMuted,fontSize:13}}>Progreso del día</span>
        <span style={{color:C.text,fontSize:13,fontWeight:700,fontFamily:"'Space Mono',monospace"}}>{pct}%</span>
      </div>
      <div style={{background:C.border,borderRadius:99,height:8}}>
        <div style={{background:`linear-gradient(90deg,${C.green},${C.blue})`,width:`${pct}%`,
          height:'100%',borderRadius:99,transition:'width 0.5s'}}/>
      </div>
    </div>

    {alertas.length > 0 && <>
      <h3 style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:1,
        textTransform:'uppercase',marginBottom:12}}>🔔 Requieren atención</h3>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {alertas.map(p=>{const e=ESTADOS[p.estado]; return <div key={p.id} style={{
          background:C.surfaceAlt,border:`1px solid ${e.color}40`,
          borderLeft:`3px solid ${e.color}`,borderRadius:10,padding:'12px 16px',
          display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{color:C.text,fontWeight:700,fontSize:14}}>{p.cliente}</div>
            <div style={{color:C.textMuted,fontSize:12}}>📍 {p.direccion} · 🕐 {p.hora_entrega.slice(0,5)}</div>
          </div>
          <Badge estado={p.estado}/>
        </div>})}
      </div>
    </>}

    {alertas.length === 0 && stats.total > 0 && <div style={{
      background:C.greenDim,border:`1px solid ${C.green}40`,borderRadius:10,
      padding:'16px 18px',color:C.green,fontWeight:700,textAlign:'center'}}>
      ✅ Todo en orden, sin urgencias ni atrasos
    </div>}
  </div>
}

// ─── NUEVO PEDIDO FORM ────────────────────────────────────────────────────────
function NuevoPedidoForm({materiales,onSave,onClose}:{materiales:(Material&{proveedores:Proveedor})[];onSave:()=>void;onClose:()=>void}) {
  const [form,setForm] = useState({cliente:'',direccion:'',zona:'',fecha_entrega:'',hora_entrega:'',observaciones:''})
  const [items,setItems] = useState<{material_id:string;cantidad:string}[]>([{material_id:'',cantidad:''}])
  const [saving,setSaving] = useState(false)
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))

  const addItem=()=>setItems(i=>[...i,{material_id:'',cantidad:''}])
  const removeItem=(idx:number)=>setItems(i=>i.filter((_,j)=>j!==idx))
  const setItem=(idx:number,k:string,v:string)=>setItems(i=>i.map((item,j)=>j===idx?{...item,[k]:v}:item))

  const handleSave=async()=>{
    if(!form.cliente||!form.direccion||!form.zona||!form.fecha_entrega||!form.hora_entrega) return
    const validItems=items.filter(i=>i.material_id&&i.cantidad)
    if(validItems.length===0) return
    setSaving(true)
    try {
      const mat=validItems.map(i=>({material_id:i.material_id,cantidad:parseFloat(i.cantidad)}))
      await createPedido({...form,items:mat})
      onSave()
    } catch(e){console.error(e)} finally {setSaving(false)}
  }

  const zonas=['Norte','Sur','Centro','Este','Oeste']
  const matOptions=materiales.map(m=>({value:m.id,label:`${m.nombre} (${m.unidad})`}))

  return <div style={{display:'flex',flexDirection:'column',gap:14}}>
    <Input label="Cliente / Obra" value={form.cliente} onChange={(v:string)=>set('cliente',v)} required />
    <Input label="Dirección de entrega" value={form.direccion} onChange={(v:string)=>set('direccion',v)} required />
    <Select label="Zona" value={form.zona} onChange={(v:string)=>set('zona',v)}
      options={zonas.map(z=>({value:z,label:`Zona ${z}`}))} />
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Input label="Fecha de entrega" value={form.fecha_entrega} onChange={(v:string)=>set('fecha_entrega',v)} type="date" required />
      <Input label="Hora" value={form.hora_entrega} onChange={(v:string)=>set('hora_entrega',v)} type="time" required />
    </div>
    <Input label="Observaciones" value={form.observaciones} onChange={(v:string)=>set('observaciones',v)} />

    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <span style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5}}>MATERIALES</span>
        <Btn onClick={addItem} variant="secondary" size="sm">+ Agregar</Btn>
      </div>
      {items.map((item,idx)=><div key={idx} style={{display:'flex',gap:8,marginBottom:8,alignItems:'flex-end'}}>
        <div style={{flex:2}}>
          <Select value={item.material_id} onChange={(v:string)=>setItem(idx,'material_id',v)}
            options={matOptions} placeholder="Material..." />
        </div>
        <div style={{flex:1}}>
          <Input value={item.cantidad} onChange={(v:string)=>setItem(idx,'cantidad',v)}
            type="number" placeholder="Cant." />
        </div>
        {items.length>1 && <Btn onClick={()=>removeItem(idx)} variant="danger" size="sm">✕</Btn>}
      </div>)}
    </div>

    <div style={{display:'flex',gap:10,marginTop:6}}>
      <Btn onClick={onClose} variant="secondary" style={{flex:1}}>Cancelar</Btn>
      <Btn onClick={handleSave} disabled={saving} style={{flex:2}}>{saving?'Guardando...':'💾 Guardar Pedido'}</Btn>
    </div>
  </div>
}

// ─── PEDIDOS VIEW ─────────────────────────────────────────────────────────────
function PedidosView({pedidos,materiales,onRefresh}:{pedidos:Pedido[];materiales:(Material&{proveedores:Proveedor})[];onRefresh:()=>void}) {
  const [filtro,setFiltro]=useState<string>('todos')
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState<Pedido|null>(null)
  const [showNuevo,setShowNuevo]=useState(false)
  const [changing,setChanging]=useState<string|null>(null)

  const filtered=pedidos.filter(p=>{
    const mf=filtro==='todos'||p.estado===filtro||(filtro==='atrasado'&&p.atrasado)
    const ms=p.cliente.toLowerCase().includes(search.toLowerCase())||
      p.codigo.toLowerCase().includes(search.toLowerCase())||
      p.zona.toLowerCase().includes(search.toLowerCase())
    return mf&&ms
  })

  const handleEstado=async(id:string,estado:EstadoPedido)=>{
    setChanging(id)
    try { await updateEstadoPedido(id,estado); onRefresh() }
    catch(e){console.error(e)} finally {setChanging(null)}
  }

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Pedidos</h2>
      <Btn onClick={()=>setShowNuevo(true)}>+ Nuevo</Btn>
    </div>

    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Buscar..."
      style={{width:'100%',background:C.surfaceAlt,border:`1px solid ${C.border}`,
        borderRadius:8,padding:'9px 12px',color:C.text,fontSize:14,marginBottom:12,outline:'none'}} />

    <div style={{display:'flex',gap:6,marginBottom:18,flexWrap:'wrap'}}>
      {[['todos','Todos'],['urgente','Urgentes'],['atrasado','Atrasados'],
        ['preparacion','Preparando'],['pendiente','Pendiente'],['entregado','Entregado']].map(([k,l])=>
        <button key={k} onClick={()=>setFiltro(k)} style={{
          background:filtro===k?C.accent:C.surfaceAlt,
          color:filtro===k?'#000':C.textMuted,
          border:`1px solid ${filtro===k?C.accent:C.border}`,
          borderRadius:6,padding:'5px 12px',fontSize:12,cursor:'pointer',fontWeight:filtro===k?700:400}}>
          {l}</button>
      )}
    </div>

    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {filtered.map(p=>{const e=ESTADOS[p.estado]; return <div key={p.id}
        style={{background:C.surface,border:`1px solid ${p.atrasado?C.purple:C.border}`,
          borderLeft:`4px solid ${e.color}`,borderRadius:10,padding:'14px 16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,marginBottom:10}}>
          <div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}>
              <span style={{color:C.textDim,fontSize:11,fontFamily:"'Space Mono',monospace"}}>{p.codigo}</span>
              {p.atrasado&&<span style={{background:C.purpleDim,color:C.purple,fontSize:10,padding:'1px 6px',borderRadius:4,fontWeight:700}}>ATRASADO</span>}
            </div>
            <div style={{color:C.text,fontWeight:700,fontSize:15,cursor:'pointer'}} onClick={()=>setSelected(p)}>{p.cliente}</div>
            <div style={{color:C.textMuted,fontSize:12,marginTop:2}}>📍 {p.direccion}</div>
            <div style={{color:C.textMuted,fontSize:12}}>🕐 {p.hora_entrega.slice(0,5)} · 📅 {p.fecha_entrega} · 🗺️ Zona {p.zona}</div>
          </div>
          <Badge estado={p.estado}/>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {(Object.keys(ESTADOS) as EstadoPedido[]).filter(k=>k!==p.estado).map(k=>{const ec=ESTADOS[k]; return <button key={k}
            onClick={()=>handleEstado(p.id,k)} disabled={changing===p.id}
            style={{background:ec.bg,color:ec.color,border:`1px solid ${ec.color}40`,
              borderRadius:5,padding:'3px 9px',fontSize:11,cursor:'pointer',fontWeight:600,opacity:changing===p.id?0.6:1}}>
            → {ec.label}</button>})}
        </div>
      </div>})}
      {filtered.length===0&&<div style={{color:C.textMuted,textAlign:'center',padding:40}}>Sin pedidos</div>}
    </div>

    {selected&&<Modal onClose={()=>setSelected(null)} title={selected.codigo}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{color:C.text,fontWeight:800,fontSize:18}}>{selected.cliente}</div>
            <div style={{color:C.textMuted,fontSize:13}}>📍 {selected.direccion}</div>
            <div style={{color:C.textMuted,fontSize:13}}>🕐 {selected.hora_entrega.slice(0,5)} · 📅 {selected.fecha_entrega} · 🗺️ Zona {selected.zona}</div>
          </div>
          <Badge estado={selected.estado}/>
        </div>
        {selected.observaciones&&<div style={{background:C.accentDim,borderRadius:8,padding:'10px 12px'}}>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,marginBottom:3}}>OBSERVACIONES</div>
          <div style={{color:C.text,fontSize:13}}>{selected.observaciones}</div>
        </div>}
        <div>
          <div style={{color:C.textMuted,fontSize:12,fontWeight:700,letterSpacing:0.5,marginBottom:8}}>MATERIALES</div>
          {selected.pedido_items?.map((item,i)=><div key={i} style={{
            background:C.surfaceAlt,borderRadius:7,padding:'9px 12px',marginBottom:6,
            display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{color:C.text,fontSize:14,fontWeight:600}}>{item.materiales?.nombre}</div>
              <div style={{color:C.textMuted,fontSize:12}}>{item.materiales?.proveedores?.nombre}</div>
            </div>
            <div style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace"}}>
              {item.cantidad} {item.materiales?.unidad}</div>
          </div>)}
        </div>
      </div>
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
    .filter(p=>p.zona===zona&&p.estado!=='entregado')
    .sort((a,b)=>{
      const p:any={urgente:0,atrasado:1,preparacion:2,pendiente:3,entregado:4}
      return (p[a.estado]??5)-(p[b.estado]??5)||a.hora_entrega.localeCompare(b.hora_entrega)
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
              <div style={{color:C.textMuted,fontSize:12}}>🕐 {p.hora_entrega.slice(0,5)}</div>
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
function ComprasView({pedidos,materiales,proveedores,onRefresh}:
  {pedidos:Pedido[];materiales:(Material&{proveedores:Proveedor})[];proveedores:any[];onRefresh:()=>void}) {

  const [showMat,setShowMat]=useState(false)
  const [matForm,setMatForm]=useState({nombre:'',unidad:'',precio_ref:'',proveedor_id:''})
  const [saving,setSaving]=useState(false)

  // Calcular lista de compras desde pedidos activos
  const listaMap:Record<string,any>={}
  pedidos.filter(p=>p.estado!=='entregado').forEach(p=>{
    p.pedido_items?.forEach(item=>{
      const m=item.materiales
      if(!m) return
      const k=m.id
      if(!listaMap[k]) listaMap[k]={nombre:m.nombre,unidad:m.unidad,
        precio_ref:m.precio_ref||0,proveedor:m.proveedores?.nombre||'Sin asignar',
        proveedor_tel:m.proveedores?.telefono||'',proveedor_dir:m.proveedores?.direccion||'',
        cantidad_total:0,pedidos:[]}
      listaMap[k].cantidad_total+=item.cantidad
      listaMap[k].pedidos.push(p.codigo)
    })
  })
  const lista=Object.values(listaMap)
  const total=lista.reduce((a:number,i:any)=>a+i.cantidad_total*i.precio_ref,0)
  const porProv:Record<string,any[]>={}
  lista.forEach((i:any)=>{if(!porProv[i.proveedor])porProv[i.proveedor]=[];porProv[i.proveedor].push(i)})

  const handleSaveMat=async()=>{
    if(!matForm.nombre||!matForm.unidad) return
    setSaving(true)
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
    <p style={{color:C.textMuted,fontSize:13,marginBottom:20}}>Calculada automáticamente de pedidos activos</p>

    <div style={{background:`linear-gradient(135deg,${C.accentDim},${C.surfaceAlt})`,
      border:`1px solid ${C.accent}40`,borderRadius:12,padding:'18px 20px',marginBottom:22}}>
      <div style={{color:C.textMuted,fontSize:12,fontWeight:700,marginBottom:4}}>COSTO TOTAL ESTIMADO</div>
      <div style={{color:C.accent,fontSize:30,fontWeight:800,fontFamily:"'Space Mono',monospace"}}>
        ${total.toLocaleString('es-AR')}</div>
      <div style={{color:C.textMuted,fontSize:13,marginTop:4}}>
        {lista.length} productos · {Object.keys(porProv).length} proveedores</div>
    </div>

    {Object.entries(porProv).map(([prov,items])=>{
      const subtotal=(items as any[]).reduce((a,i)=>a+i.cantidad_total*i.precio_ref,0)
      const provInfo=proveedores.find((p:any)=>p.nombre===prov)
      return <div key={prov} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:14,overflow:'hidden'}}>
        <div style={{background:C.surfaceAlt,padding:'12px 16px',
          display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{color:C.text,fontWeight:800,fontSize:15}}>🏭 {prov}</div>
            {provInfo?.telefono&&<div style={{color:C.textMuted,fontSize:12}}>📞 {provInfo.telefono} · 📍 {provInfo.direccion}</div>}
          </div>
          <div style={{color:C.accent,fontWeight:700,fontFamily:"'Space Mono',monospace"}}>
            ${subtotal.toLocaleString('es-AR')}</div>
        </div>
        <div style={{padding:'10px 16px',display:'flex',flexDirection:'column',gap:8}}>
          {(items as any[]).map((item,i)=><div key={i} style={{
            display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6}}>
            <div>
              <div style={{color:C.text,fontSize:14,fontWeight:600}}>{item.nombre}</div>
              <div style={{color:C.textDim,fontSize:11}}>{item.pedidos.join(', ')}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{color:C.text,fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13}}>
                {item.cantidad_total} {item.unidad}</div>
              {item.precio_ref>0&&<div style={{color:C.textMuted,fontSize:11}}>
                ${(item.precio_ref*item.cantidad_total).toLocaleString('es-AR')}</div>}
            </div>
          </div>)}
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

// ─── PROVEEDORES VIEW ─────────────────────────────────────────────────────────
function ProveedoresView({proveedores,onRefresh}:{proveedores:any[];onRefresh:()=>void}) {
  const [show,setShow]=useState(false)
  const [form,setForm]=useState({nombre:'',telefono:'',direccion:'',email:'',notas:''})
  const [saving,setSaving]=useState(false)
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))

  const handleSave=async()=>{
    if(!form.nombre) return
    setSaving(true)
    try { await createProveedor(form); onRefresh(); setShow(false); setForm({nombre:'',telefono:'',direccion:'',email:'',notas:''}) }
    catch(e){console.error(e)} finally{setSaving(false)}
  }

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,flexWrap:'wrap',gap:10}}>
      <h2 style={{color:C.text,fontSize:20,fontWeight:800}}>Proveedores</h2>
      <Btn onClick={()=>setShow(true)}>+ Proveedor</Btn>
    </div>
    <p style={{color:C.textMuted,fontSize:13,marginBottom:20}}>Directorio de dónde conseguís cada material</p>

    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {proveedores.map((p:any)=><div key={p.id} style={{background:C.surface,
        border:`1px solid ${C.border}`,borderRadius:10,padding:'14px 16px'}}>
        <div style={{color:C.text,fontWeight:800,fontSize:15,marginBottom:4}}>🏭 {p.nombre}</div>
        {p.telefono&&<div style={{color:C.textMuted,fontSize:13}}>📞 {p.telefono}</div>}
        {p.direccion&&<div style={{color:C.textMuted,fontSize:13}}>📍 {p.direccion}</div>}
        {p.email&&<div style={{color:C.textMuted,fontSize:13}}>✉️ {p.email}</div>}
        {p.materiales?.length>0&&<div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:5}}>
          {p.materiales.map((m:any)=><span key={m.id} style={{background:C.accentDim,color:C.accent,
            borderRadius:4,padding:'2px 9px',fontSize:11,fontWeight:600}}>{m.nombre}</span>)}
        </div>}
      </div>)}
    </div>

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
  </div>
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV=[
  {id:'dashboard',icon:'📊',label:'Panel'},
  {id:'pedidos',icon:'📦',label:'Pedidos'},
  {id:'rutas',icon:'🗺️',label:'Rutas'},
  {id:'compras',icon:'🛒',label:'Compras'},
  {id:'proveedores',icon:'🏭',label:'Proveedores'},
]

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
  const [vista,setVista]=useState('dashboard')
  const [pedidos,setPedidos]=useState<Pedido[]>([])
  const [materiales,setMateriales]=useState<any[]>([])
  const [proveedores,setProveedores]=useState<any[]>([])
  const [loading,setLoading]=useState(false)
  const [toast,setToast]=useState<{msg:string;type:string}|null>(null)

  // Auth
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>setSession(session))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>setSession(s))
    return ()=>subscription.unsubscribe()
  },[])

  const loadData=useCallback(async()=>{
    if(!session) return
    setLoading(true)
    try {
      await marcarAtrasados()
      const [p,m,pr]=await Promise.all([getPedidos(),getMateriales(),getProveedores()])
      setPedidos(p||[]); setMateriales(m||[]); setProveedores(pr||[])
    } catch(e:any) {
      setToast({msg:'Error cargando datos',type:'error'})
    } finally { setLoading(false) }
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
    const t=setInterval(()=>{ if(session) loadData() },5*60*1000)
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
          <div style={{fontWeight:800,fontSize:15,color:C.text}}>LogiObra</div>
          <div style={{fontSize:10,color:C.textMuted}}>Sistema de Logística</div>
        </div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {urgentCount>0&&<span style={{background:C.redDim,color:C.red,border:`1px solid ${C.red}40`,
          borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:700}}>
          🚨 {urgentCount}</span>}
        <button onClick={()=>supabase.auth.signOut()} style={{background:C.surfaceAlt,
          border:`1px solid ${C.border}`,color:C.textMuted,borderRadius:7,
          padding:'5px 10px',fontSize:12,cursor:'pointer'}}>Salir</button>
      </div>
    </div>

    {/* Content */}
    <div style={{flex:1,padding:'18px 14px',maxWidth:680,width:'100%',
      margin:'0 auto',boxSizing:'border-box' as any}}>
      {loading&&<Spinner/>}
      {!loading&&vista==='dashboard'&&<Dashboard pedidos={pedidos}/>}
      {!loading&&vista==='pedidos'&&<PedidosView pedidos={pedidos} materiales={materiales} onRefresh={loadData}/>}
      {!loading&&vista==='rutas'&&<RutasView pedidos={pedidos}/>}
      {!loading&&vista==='compras'&&<ComprasView pedidos={pedidos} materiales={materiales} proveedores={proveedores} onRefresh={loadData}/>}
      {!loading&&vista==='proveedores'&&<ProveedoresView proveedores={proveedores} onRefresh={loadData}/>}
    </div>

    {/* Bottom Nav */}
    <div style={{background:C.surface,borderTop:`1px solid ${C.border}`,
      display:'flex',position:'sticky',bottom:0,zIndex:100}}>
      {NAV.map(item=><button key={item.id} onClick={()=>setVista(item.id)} style={{
        flex:1,padding:'8px 4px 10px',background:'none',border:'none',
        color:vista===item.id?C.accent:C.textDim,cursor:'pointer',
        display:'flex',flexDirection:'column',alignItems:'center',gap:2,
        borderTop:`2px solid ${vista===item.id?C.accent:'transparent'}`,
        transition:'all 0.15s'}}>
        <span style={{fontSize:18}}>{item.icon}</span>
        <span style={{fontSize:10,fontWeight:vista===item.id?700:400}}>{item.label}</span>
      </button>)}
    </div>
  </div>
}
