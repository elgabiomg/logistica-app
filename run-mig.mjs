import pg from 'pg'
import { readFileSync } from 'fs'

const { Client } = pg
const sql = readFileSync('./supabase/migrations/002_price_lists.sql', 'utf8')

// Intentar con IP directa del pooler + SNI manual
const configs = [
  // Session mode port 5432 con IP
  { host: '44.216.29.125',  port: 5432, user: 'postgres.jjqqnbwmaxsybhpcvdfm', ssl: { rejectUnauthorized: false, servername: 'aws-0-us-east-1.pooler.supabase.com' } },
  { host: '44.208.221.186', port: 5432, user: 'postgres.jjqqnbwmaxsybhpcvdfm', ssl: { rejectUnauthorized: false, servername: 'aws-0-us-east-1.pooler.supabase.com' } },
  // Transaction mode port 6543
  { host: '44.216.29.125',  port: 6543, user: 'postgres.jjqqnbwmaxsybhpcvdfm', ssl: { rejectUnauthorized: false, servername: 'aws-0-us-east-1.pooler.supabase.com' } },
  // REST API host directo en puerto 5432 (a veces funciona)
  { host: '104.18.38.10',   port: 5432, user: 'postgres', ssl: { rejectUnauthorized: false } },
].map(c => ({ ...c, database: 'postgres', password: 'EmiGreenPark2001' }))

for (const cfg of configs) {
  process.stdout.write(`\nIntentando ${cfg.host}:${cfg.port} (user=${cfg.user})... `)
  const client = new Client(cfg)
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
    ])
    console.log('CONECTADO')
    console.log('Ejecutando migración...')
    await client.query(sql)
    console.log('✅ ¡Migración aplicada correctamente!')
    await client.end()
    import('fs').then(({unlinkSync}) => { try { unlinkSync('./run-mig.mjs') } catch{} })
    process.exit(0)
  } catch(e) {
    console.log(`FAIL: ${e.message.split('\n')[0]}`)
    try { await client.end() } catch{}
  }
}

console.log('\n❌ No se pudo conectar.')
process.exit(1)
