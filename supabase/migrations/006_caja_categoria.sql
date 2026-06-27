-- Unificación del software de Flujo de Caja en el módulo Caja
ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Importar historial de flujo de caja (solo si no fue importado antes)
INSERT INTO caja_movimientos (tipo,fecha,monto,categoria,concepto,medio_pago)
SELECT * FROM (VALUES
  ('ingreso','2026-05-26'::date,1250000,'Ventas contado','Venta de Portland y varillas - Cliente García','efectivo'),
  ('egreso','2026-05-24'::date,480000,'Compra de materiales','Compra de cemento Portland CPN50 - Proveedor Central','efectivo'),
  ('ingreso','2026-05-22'::date,630000,'Cobros pendientes','Cobro cuota 2/3 - Obra Sr. Ruiz','transferencia'),
  ('egreso','2026-05-20'::date,320000,'Flete y logística','Flete entrega materiales - Obra Cipolletti Sur','efectivo'),
  ('egreso','2026-05-15'::date,950000,'Sueldos','Sueldos quincena 1 - Mayo','transferencia'),
  ('ingreso','2026-05-12'::date,875000,'Ventas contado','Venta ladrillos y arena - Constructora Norte','efectivo'),
  ('egreso','2026-05-10'::date,145000,'Servicios y alquileres','Alquiler depósito - Mayo','transferencia'),
  ('ingreso','2026-04-28'::date,1100000,'Ventas a crédito','Venta materiales obra privada - 3 cuotas','transferencia'),
  ('egreso','2026-04-25'::date,560000,'Compra de materiales','Hierro y malla sima - Distribuidora Patagonia','efectivo'),
  ('egreso','2026-04-15'::date,950000,'Sueldos','Sueldos quincena 1 - Abril','transferencia'),
  ('ingreso','2026-04-10'::date,780000,'Ventas contado','Venta mosaicos y adhesivos','efectivo'),
  ('egreso','2026-04-08'::date,88000,'Gastos varios','Papelería y materiales de oficina','efectivo'),
  ('ingreso','2026-03-30'::date,920000,'Ventas contado','Venta cerámica y sanitarios','efectivo'),
  ('egreso','2026-03-28'::date,430000,'Compra de materiales','Pintura látex y esmalte - Stock','efectivo'),
  ('egreso','2026-03-15'::date,950000,'Sueldos','Sueldos quincena 1 - Marzo','transferencia')
) AS v(tipo,fecha,monto,categoria,concepto,medio_pago)
WHERE NOT EXISTS (SELECT 1 FROM caja_movimientos WHERE concepto LIKE 'Venta de Portland y varillas%');
