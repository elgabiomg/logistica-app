-- Porcentajes de ganancia por material (override del global de empresa_config)
ALTER TABLE materiales
  ADD COLUMN IF NOT EXISTS lista1_pct NUMERIC(8,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lista2_pct NUMERIC(8,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lista3_pct NUMERIC(8,2) DEFAULT NULL;

-- ── Grupo 1: L1 30%, L2 25%, L3 20% ─────────────────────────────────────────
UPDATE materiales SET lista1_pct = 30, lista2_pct = 25, lista3_pct = 20
WHERE activo = true AND (
    nombre ILIKE '%plasticor%'
 OR nombre ILIKE '%cal%santa%b_rbara%'
 OR nombre ILIKE '%yeso%corral%'
 OR nombre ILIKE '%base coat%'
 OR nombre ILIKE '%porcellanato fluido%'
 OR nombre ILIKE '%rapibrick%'
 OR nombre ILIKE '%aislante%'
 OR nombre ILIKE '%lana%vidrio%'
 OR nombre ILIKE '%membrana%asfalt%'
 OR nombre ILIKE '%planchuela%'
 OR nombre ILIKE '%chapa%lisa%galv%'
 OR nombre ILIKE '%chapa%lisa%negra%'
 OR nombre ILIKE '%chapa lisa%'
);

-- ── Grupo 2: L1 50%, L2 40%, L3 30% ─────────────────────────────────────────
-- (aplica después del grupo 1 para que rapibrick 25kg y construkor 25kg sobreescriban)
UPDATE materiales SET lista1_pct = 50, lista2_pct = 40, lista3_pct = 30
WHERE activo = true AND (
    (nombre ILIKE '%construkor%' AND nombre ILIKE '%25%')
 OR (nombre ILIKE '%rapibrick%'  AND nombre ILIKE '%25%')
 OR nombre ILIKE '%chapa%cart%'
 OR nombre ILIKE '%cart%n%'
 OR nombre ILIKE '%pintura%asfalt%'
 OR (nombre ILIKE '%hidr%fugo%' AND (nombre ILIKE '%10%' OR nombre ILIKE '%20%'))
 OR nombre ILIKE '%acelerant%'
 OR nombre ILIKE '%sika%latex%'
 OR nombre ILIKE '%sikalatex%'
 OR nombre ILIKE '%ligante%'
 OR (nombre ILIKE '%malla%sima%' AND nombre ILIKE '%4%')
 OR nombre ILIKE '%clavo%esp%'
);

-- ── Grupo 3: L1 300%, L2 250%, L3 200% ───────────────────────────────────────
UPDATE materiales SET lista1_pct = 300, lista2_pct = 250, lista3_pct = 200
WHERE activo = true AND (
    nombre ILIKE '%pastin%'
 OR nombre ILIKE '%malla%sost%'
);

-- ── Grupo 4: L1 100%, L2 75%, L3 50% ─────────────────────────────────────────
UPDATE materiales SET lista1_pct = 100, lista2_pct = 75, lista3_pct = 50
WHERE activo = true AND (
    nombre ILIKE '%capa%aislad%'
 OR (nombre ILIKE '%hidr%fugo%' AND (nombre ILIKE '%1 lt%' OR nombre ILIKE '%4 lt%' OR nombre ILIKE '%1lt%' OR nombre ILIKE '%4lt%'))
 OR nombre ILIKE '%alambre%'
 OR nombre ILIKE '%clavo%plomo%'
 OR nombre ILIKE '%autoperfor%'
);
