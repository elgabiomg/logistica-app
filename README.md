# 🏗️ LogiObra — Sistema de Logística

App web progresiva (PWA) para gestión de pedidos, rutas y compras.
Funciona en cualquier dispositivo con navegador. No requiere instalación.

---

## 🚀 PASO 1: Crear tu base de datos en Supabase (GRATIS)

### 1.1 Crear cuenta
1. Ir a **https://supabase.com**
2. Clic en **"Start your project"**
3. Registrarse con Google o email
4. Crear una nueva organización

### 1.2 Crear proyecto
1. Clic en **"New project"**
2. Nombre: `logistica-app` (o el que quieras)
3. Región: **South America (São Paulo)** — la más cercana a Argentina
4. Crear una contraseña para la base de datos (guardala)
5. Esperar 2 minutos mientras se configura

### 1.3 Ejecutar el esquema SQL
1. En el menú lateral: **SQL Editor**
2. Clic en **"New query"**
3. Abrir el archivo `supabase/migrations/001_initial_schema.sql` de este proyecto
4. Copiar TODO el contenido y pegarlo en el editor
5. Clic en **"Run"** (botón verde)
6. Verificar que dice "Success. No rows returned"

### 1.4 Obtener las credenciales
1. En el menú lateral: **Settings → API**
2. Copiar:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (bajo "Project API keys") → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 1.5 Crear tu usuario
1. En el menú lateral: **Authentication → Users**
2. Clic en **"Add user"** → "Create new user"
3. Ingresar email y contraseña para tu cuenta
4. Repetir para cada persona del equipo que necesite acceso

---

## 🖥️ PASO 2: Configurar el proyecto en tu computadora

### Requisitos
- **Node.js 18+** → descargar en https://nodejs.org (LTS)
- **Git** → https://git-scm.com

### 2.1 Abrir terminal y entrar al proyecto
```bash
cd ruta/a/logistica-app
```

### 2.2 Instalar dependencias
```bash
npm install
```

### 2.3 Configurar variables de entorno
1. Copiar el archivo de ejemplo:
```bash
cp .env.local.example .env.local
```
2. Abrir `.env.local` con cualquier editor de texto
3. Reemplazar los valores con tus credenciales de Supabase del Paso 1.4

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.4 Probar localmente
```bash
npm run dev
```
Abrir el navegador en: **http://localhost:3000**

Deberías ver la pantalla de login. Ingresar con el usuario creado en el Paso 1.5.

---

## ☁️ PASO 3: Publicar en internet (GRATIS con Vercel)

### 3.1 Subir el código a GitHub
1. Crear cuenta en **https://github.com**
2. Crear un nuevo repositorio (privado recomendado)
3. Seguir las instrucciones para subir el código:
```bash
git init
git add .
git commit -m "LogiObra inicial"
git remote add origin https://github.com/TU_USUARIO/logistica-app.git
git push -u origin main
```

### 3.2 Desplegar en Vercel
1. Ir a **https://vercel.com**
2. Registrarse con tu cuenta de GitHub
3. Clic en **"New Project"**
4. Importar tu repositorio `logistica-app`
5. En **"Environment Variables"**, agregar:
   - `NEXT_PUBLIC_SUPABASE_URL` → tu URL de Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → tu anon key
6. Clic en **"Deploy"**
7. En ~2 minutos tenés tu URL pública: `https://logistica-app-xxx.vercel.app`

### 3.3 Instalar como app en el celular (opcional)
- **Android (Chrome)**: Abrir la URL → menú (3 puntitos) → "Agregar a pantalla de inicio"
- **iPhone (Safari)**: Abrir la URL → botón compartir → "Agregar a pantalla de inicio"

---

## 🔒 Seguridad y acceso

- Cada integrante del equipo necesita su propio usuario en Supabase Auth
- Ir a Supabase → Authentication → Users → Add user
- Solo usuarios autenticados pueden ver y modificar datos (Row Level Security habilitado)

---

## 📱 Funcionalidades actuales

| Feature | Estado |
|---------|--------|
| Login con email/contraseña | ✅ |
| Dashboard con alertas | ✅ |
| Crear/ver/cambiar estado de pedidos | ✅ |
| Hojas de ruta por zona | ✅ |
| Lista de compras automática | ✅ |
| ABM de proveedores | ✅ |
| ABM de materiales con precio | ✅ |
| Marcado automático de atrasados | ✅ |
| Historial de cambios de estado | ✅ |
| Actualización en tiempo real | ✅ |
| Instalable como PWA | ✅ |

## 🗺️ Próximas funcionalidades (Fase 2)

- [ ] Mapa interactivo con Google Maps
- [ ] Notificaciones push para urgentes
- [ ] Envío de hoja de ruta por WhatsApp
- [ ] Firma digital de entrega
- [ ] Reportes en PDF
- [ ] Roles (admin / repartidor / solo lectura)
- [ ] Fotos de entrega

---

## 🆘 Problemas comunes

**"Invalid API key"** → Verificar que el .env.local tiene las credenciales correctas (sin espacios extra)

**"Row violates RLS policy"** → El usuario no está autenticado. Verificar que el email/contraseña son correctos

**Página en blanco** → Abrir la consola del navegador (F12) y ver el error

**Datos no se actualizan** → Clic en el botón de refrescar o esperar el auto-refresh de 5 minutos

---

Desarrollado con Next.js 14 + Supabase · Funciona en cualquier dispositivo · Plan gratuito para empezar
