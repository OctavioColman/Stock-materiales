-- Normalizar estados existentes en jira_material_issues para que coincidan con la vista de stock.
-- Ejecutar una vez si ya tenés filas con estados como "En depósito" en lugar de "en deposito".

UPDATE jira_material_issues
SET status = 'en deposito'
WHERE LOWER(TRIM(status)) IN ('en deposito', 'en depósito')
   OR LOWER(TRIM(status)) LIKE '%depósito%'
   OR LOWER(TRIM(status)) LIKE '%deposito%';

UPDATE jira_material_issues
SET status = 'entregado'
WHERE LOWER(TRIM(status)) LIKE '%entregado%';
