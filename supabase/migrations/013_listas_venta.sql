-- Listas de precio de venta configurables (3 listas con % de recargo sobre costo)
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS lista1_nombre TEXT DEFAULT 'Lista 1',
  ADD COLUMN IF NOT EXISTS lista1_pct    NUMERIC(8,2) DEFAULT 20,
  ADD COLUMN IF NOT EXISTS lista2_nombre TEXT DEFAULT 'Lista 2',
  ADD COLUMN IF NOT EXISTS lista2_pct    NUMERIC(8,2) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS lista3_nombre TEXT DEFAULT 'Lista 3',
  ADD COLUMN IF NOT EXISTS lista3_pct    NUMERIC(8,2) DEFAULT 10;

-- Vincular ítems de lista de precios no enlazados a materiales existentes
-- 1) Coincidencia exacta (sin importar mayúsculas/tildes)
UPDATE lista_precios_items lpi
SET material_id = m.id
FROM materiales m
WHERE lpi.material_id IS NULL
  AND m.activo = true
  AND lower(trim(lpi.descripcion_original)) = lower(trim(m.nombre));

-- 2) Coincidencia sin caracteres especiales (normaliza espacios extra)
UPDATE lista_precios_items lpi
SET material_id = m.id
FROM materiales m
WHERE lpi.material_id IS NULL
  AND m.activo = true
  AND regexp_replace(lower(trim(lpi.descripcion_original)), '\s+', ' ', 'g')
    = regexp_replace(lower(trim(m.nombre)), '\s+', ' ', 'g');

-- 3) Actualizar precio_ref de materiales con el precio del ítem vinculado más reciente
UPDATE materiales m
SET precio_ref = lpi.precio,
    updated_at = NOW()
FROM lista_precios_items lpi
JOIN listas_precios lp ON lpi.lista_id = lp.id
WHERE lpi.material_id = m.id
  AND lp.activa = true
  AND lpi.precio > 0
  AND lp.created_at = (
    SELECT MAX(lp2.created_at)
    FROM listas_precios lp2
    JOIN lista_precios_items lpi2 ON lpi2.lista_id = lp2.id
    WHERE lpi2.material_id = m.id AND lp2.activa = true
  );
