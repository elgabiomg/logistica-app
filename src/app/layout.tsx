import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LogiObra - Sistema de Logística',
  description: 'Gestión de pedidos, rutas y compras para tu empresa',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#0F1117" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  )
}
