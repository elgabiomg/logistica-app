-- Coeficientes de financiación configurables por empresa
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS fin_debito_recargo_pct  NUMERIC(8,2) DEFAULT 5,
  ADD COLUMN IF NOT EXISTS fin_visa_3csi_desc_pct  NUMERIC(8,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS fin_visa_9_coef         NUMERIC(8,2) DEFAULT 149,
  ADD COLUMN IF NOT EXISTS fin_visa_12_coef        NUMERIC(8,2) DEFAULT 165,
  ADD COLUMN IF NOT EXISTS fin_nx_8_coef           NUMERIC(8,2) DEFAULT 149,
  ADD COLUMN IF NOT EXISTS fin_nx_10_coef          NUMERIC(8,2) DEFAULT 152,
  ADD COLUMN IF NOT EXISTS fin_nx_12_coef          NUMERIC(8,2) DEFAULT 165;
