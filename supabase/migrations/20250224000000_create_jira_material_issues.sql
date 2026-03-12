-- Modelo B: catálogo de materiales, tabla espejo de issues Jira tipo "materiales" y vista de stock
-- Ejecutar en Supabase SQL Editor (o como migración).
-- Después de crear las tablas, importá el TSV de materiales (ver docs/importar-materiales-tsv.md).

-- 1) Catálogo de materiales (crear primero; luego importar TSV desde Google Sheets)
CREATE TABLE IF NOT EXISTS materials_catalog (
  material_code text PRIMARY KEY,
  material_name text,
  product_type text,
  unit text,
  active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- 2) Tabla: espejo de issues tipo "materiales"
CREATE TABLE IF NOT EXISTS jira_material_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key text NOT NULL UNIQUE,
  material_code text,
  quantity numeric,
  status text,
  jira_updated_at timestamptz,
  synced_at timestamptz DEFAULT now(),
  source text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jira_material_issues_material_status
  ON jira_material_issues (material_code, status);
CREATE INDEX IF NOT EXISTS idx_jira_material_issues_issue_key
  ON jira_material_issues (issue_key);
CREATE INDEX IF NOT EXISTS idx_jira_material_issues_jira_updated
  ON jira_material_issues (jira_updated_at);

-- Vista: stock actual = suma de quantity por material donde status = 'en deposito'
-- Requiere que materials_catalog exista. Solo materiales en el catálogo aparecen; el material_code del issue debe existir en materials_catalog.
-- La Edge Function normaliza el estado de Jira a 'en deposito' o 'entregado' al guardar.
CREATE OR REPLACE VIEW v_stock_overview_materiales AS
SELECT
  m.material_code,
  m.material_name,
  m.product_type,
  m.unit,
  COALESCE(SUM(i.quantity), 0)::numeric AS on_hand
FROM materials_catalog m
LEFT JOIN jira_material_issues i
  ON i.material_code = m.material_code
  AND i.status = 'en deposito'
WHERE m.active = true
GROUP BY m.material_code, m.material_name, m.product_type, m.unit;

-- RLS opcional: si usás RLS en el proyecto, descomentá y ajustá
-- ALTER TABLE jira_material_issues ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Service role full access" ON jira_material_issues
--   FOR ALL USING (true) WITH CHECK (true);
