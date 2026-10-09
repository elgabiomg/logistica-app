'use client'
import { useState, useEffect, useRef } from 'react'
import { getEmpresa, updateEmpresa, supabase, type EmpresaConfig } from '@/lib/supabase'

const C = {
  bg: '#0F1117', surface: '#1A1D2E', surfaceAlt: '#232640',
  border: '#2A2D45', text: '#E8EAF6', textMuted: '#6B7280',
  accent: '#F5A623', accentDim: '#F5A62320',
  green: '#22C55E', greenDim: '#22C55E20', red: '#EF4444',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 5, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: C.surfaceAlt, border: `1px solid ${C.border}`,
  borderRadius: 7, color: C.text, padding: '9px 12px', fontSize: 14,
  boxSizing: 'border-box',
}

export default function ConfigPage() {
  const [cfg, setCfg] = useState<Partial<EmpresaConfig>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getEmpresa().then(e => { setCfg(e); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const set = (k: keyof EmpresaConfig, v: any) => setCfg(prev => ({ ...prev, [k]: v }))

  const guardar = async () => {
    setGuardando(true); setMsg(null)
    try {
      await updateEmpresa(cfg)
      setMsg({ tipo: 'ok', texto: '¡Guardado!' })
      setTimeout(() => setMsg(null), 3000)
    } catch (e: any) {
      setMsg({ tipo: 'err', texto: e.message || 'Error al guardar' })
    } finally { setGuardando(false) }
  }

  const subirLogo = async (file: File) => {
    setSubiendoLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `logos/empresa.${ext}`
      const { error } = await supabase.storage.from('empresa').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('empresa').getPublicUrl(path)
      set('logo_url', data.publicUrl + '?t=' + Date.now())
      setMsg({ tipo: 'ok', texto: 'Logo subido. Guardá para confirmar.' })
    } catch (e: any) {
      setMsg({ tipo: 'err', texto: 'Error subiendo logo: ' + e.message })
    } finally { setSubiendoLogo(false) }
  }

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
        <span style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>⚙️ Configuración del negocio</span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>

        {msg && (
          <div style={{ background: msg.tipo === 'ok' ? C.greenDim : '#EF444420', border: `1px solid ${msg.tipo === 'ok' ? C.green : C.red}40`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: msg.tipo === 'ok' ? C.green : C.red, fontSize: 13 }}>
            {msg.texto}
          </div>
        )}

        {/* ── IDENTIDAD ── */}
        <Section title="Identidad de marca">
          {/* Logo */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 8, fontWeight: 600 }}>Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {cfg.logo_url ? (
                <img src={cfg.logo_url} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain', background: '#fff', borderRadius: 8, border: `1px solid ${C.border}` }} />
              ) : (
                <div style={{ width: 80, height: 80, background: C.surfaceAlt, borderRadius: 8, border: `2px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 11 }}>
                  Sin logo
                </div>
              )}
              <div>
                <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && subirLogo(e.target.files[0])} />
                <button onClick={() => fileRef.current?.click()} disabled={subiendoLogo}
                  style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
                  {subiendoLogo ? 'Subiendo...' : cfg.logo_url ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {cfg.logo_url && (
                  <button onClick={() => set('logo_url', null)}
                    style={{ marginLeft: 8, background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 12 }}>
                    Quitar
                  </button>
                )}
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>PNG o SVG recomendado</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre comercial">
              <input style={inputStyle} value={cfg.nombre || ''} onChange={e => set('nombre', e.target.value)} placeholder="El Obralista" />
            </Field>
            <Field label="Eslogan">
              <input style={inputStyle} value={cfg.eslogan || ''} onChange={e => set('eslogan', e.target.value)} placeholder="Toda obra necesita su Obralista" />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Color primario">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={cfg.color_primario || '#F5A623'} onChange={e => set('color_primario', e.target.value)}
                  style={{ width: 40, height: 36, padding: 2, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }} />
                <input style={{ ...inputStyle, flex: 1 }} value={cfg.color_primario || ''} onChange={e => set('color_primario', e.target.value)} placeholder="#F5A623" />
              </div>
            </Field>
            <Field label="Color secundario">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={cfg.color_secundario || '#1a1a1a'} onChange={e => set('color_secundario', e.target.value)}
                  style={{ width: 40, height: 36, padding: 2, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }} />
                <input style={{ ...inputStyle, flex: 1 }} value={cfg.color_secundario || ''} onChange={e => set('color_secundario', e.target.value)} placeholder="#1a1a1a" />
              </div>
            </Field>
          </div>
        </Section>

        {/* ── CONTACTO ── */}
        <Section title="Contacto y ubicación">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="WhatsApp (sin espacios, con código país)">
              <input style={inputStyle} value={cfg.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="5492995857943" />
            </Field>
            <Field label="Teléfono">
              <input style={inputStyle} value={cfg.telefono || ''} onChange={e => set('telefono', e.target.value)} placeholder="299 585-7943" />
            </Field>
            <Field label="Email">
              <input style={inputStyle} value={cfg.email || ''} onChange={e => set('email', e.target.value)} placeholder="info@elobralista.com" />
            </Field>
            <Field label="Dirección">
              <input style={inputStyle} value={cfg.direccion || ''} onChange={e => set('direccion', e.target.value)} placeholder="Parque Industrial..." />
            </Field>
            <Field label="Localidad">
              <input style={inputStyle} value={cfg.localidad || ''} onChange={e => set('localidad', e.target.value)} placeholder="Cipolletti" />
            </Field>
            <Field label="Provincia">
              <input style={inputStyle} value={cfg.provincia || ''} onChange={e => set('provincia', e.target.value)} placeholder="Río Negro" />
            </Field>
          </div>
        </Section>

        {/* ── FISCAL ── */}
        <Section title="Datos fiscales">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="CUIT">
              <input style={inputStyle} value={cfg.cuit || ''} onChange={e => set('cuit', e.target.value)} placeholder="20-12345678-9" />
            </Field>
            <Field label="IIBB">
              <input style={inputStyle} value={cfg.iibb || ''} onChange={e => set('iibb', e.target.value)} />
            </Field>
            <Field label="Condición IVA">
              <select style={{ ...inputStyle }} value={cfg.condicion_iva || 'Responsable Inscripto'} onChange={e => set('condicion_iva', e.target.value)}>
                <option>Responsable Inscripto</option>
                <option>Monotributista</option>
                <option>Exento</option>
                <option>Consumidor Final</option>
              </select>
            </Field>
            <Field label="Inicio de actividad">
              <input type="date" style={inputStyle} value={cfg.inicio_actividad || ''} onChange={e => set('inicio_actividad', e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* ── COMPROBANTES ── */}
        <Section title="Comprobantes">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Punto de venta">
              <input type="number" style={inputStyle} value={cfg.punto_venta || 1} onChange={e => set('punto_venta', Number(e.target.value))} />
            </Field>
            <Field label="Prefijo de remitos">
              <input style={inputStyle} value={cfg.prefijo_remito || '0001'} onChange={e => set('prefijo_remito', e.target.value)} placeholder="0001" />
            </Field>
          </div>
          <Field label="Texto de pie de comprobante">
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' } as any}
              value={cfg.pie_comprobante || ''} onChange={e => set('pie_comprobante', e.target.value)}
              placeholder="Datos para transferencia: escribinos por WhatsApp al 299 585-7943" />
          </Field>
        </Section>

        {/* ── BOTÓN GUARDAR ── */}
        <button onClick={guardar} disabled={guardando}
          style={{ background: C.accent, color: '#000', fontWeight: 800, border: 'none', borderRadius: 10, padding: '13px 32px', cursor: 'pointer', fontSize: 15, width: '100%', marginTop: 8 }}>
          {guardando ? 'Guardando...' : '💾 Guardar configuración'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: C.accent, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}
