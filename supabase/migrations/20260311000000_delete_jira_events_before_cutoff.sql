-- Borrar eventos de Jira (jira_material_issues) anteriores al 11/03/2026.
-- Esos eventos tenían códigos de material incorrectos y corrompían el stock.
-- Ejecutar una sola vez en Supabase SQL Editor.

DELETE FROM jira_material_issues
WHERE created_at < '2026-03-11';

-- Opcional: ver cuántas filas quedan después
-- SELECT COUNT(*) FROM jira_material_issues;
