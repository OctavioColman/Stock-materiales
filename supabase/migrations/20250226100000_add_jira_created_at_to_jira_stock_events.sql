-- Añadir fecha de creación de Jira en la tabla de movimientos para filtrar/ordenar por "creado".
ALTER TABLE jira_stock_events
  ADD COLUMN IF NOT EXISTS jira_created_at timestamptz;

-- Rellenar desde jira_updated_at si existe esa columna, para datos ya existentes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jira_stock_events' AND column_name = 'jira_updated_at'
  ) THEN
    UPDATE jira_stock_events
    SET jira_created_at = COALESCE(jira_created_at, jira_updated_at)
    WHERE jira_created_at IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jira_stock_events_jira_created
  ON jira_stock_events (jira_created_at);
