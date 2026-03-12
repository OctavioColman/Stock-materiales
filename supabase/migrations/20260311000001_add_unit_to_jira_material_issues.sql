-- Añadir columna unit (Unidad) a jira_material_issues para guardar el valor de Jira (customfield_11442).
ALTER TABLE jira_material_issues
  ADD COLUMN IF NOT EXISTS unit text;
