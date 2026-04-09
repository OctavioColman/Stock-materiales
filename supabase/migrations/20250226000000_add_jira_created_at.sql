-- Añadir fecha de creación de Jira para filtrar/ordenar por "creado" en lugar de "actualizado".
ALTER TABLE jira_material_issues
  ADD COLUMN IF NOT EXISTS jira_created_at timestamptz;

-- Rellenar con jira_updated_at donde falte para que los datos existentes sigan apareciendo al filtrar por fecha.
UPDATE jira_material_issues
SET jira_created_at = COALESCE(jira_created_at, jira_updated_at)
WHERE jira_created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jira_material_issues_jira_created
  ON jira_material_issues (jira_created_at);
