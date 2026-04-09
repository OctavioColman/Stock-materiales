# Relación jira_stock_events → stock_ledger → v_stock_overview / stock_current

## Flujo esperado

1. **jira_stock_events**  
   Origen: cuando en Jira se crea un consumo o corrección de stock, algo (webhook, ScriptRunner, integración) debe insertar una fila aquí (por ejemplo: `material_code`, cantidad, tipo de evento, clave del issue).

2. **stock_ledger**  
   Libro mayor: cada movimiento de stock debería quedar registrado aquí (entrada/salida por material, cantidad, saldo acumulado, etc.).  
   Normalmente se alimenta desde `jira_stock_events` mediante:
   - un **trigger** en la base (INSERT/UPDATE en `jira_stock_events` que escribe en `stock_ledger`), o
   - un **job/cron** que lee eventos no procesados y escribe en `stock_ledger`.

3. **stock_current** (tabla) o **v_stock_overview** (vista)  
   Saldo actual por material. Suele derivar de `stock_ledger` (por ejemplo: suma de movimientos por `material_code`, o una vista que lee de una tabla de saldos que se actualiza desde el ledger).

## Por qué no se actualiza v_stock_overview / stock_current

- Si **jira_stock_events** tiene filas nuevas pero **stock_ledger** no: falta el paso que lleva eventos → ledger (trigger o job).
- Si **stock_ledger** se actualiza pero **stock_current** / **v_stock_overview** no: la vista o la tabla de saldos no están definidas sobre el ledger, o falta un trigger/job que actualice la tabla de saldos / que la vista consulte las tablas correctas.

## Cómo revisar en este proyecto

1. **Diagnóstico desde la API** (con el servidor corriendo):
   ```
   http://localhost:3001/api/debug/stock-flow
   ```
   Devuelve una muestra de `jira_stock_events` y de `stock_ledger`. Compará:
   - Si en `jira_stock_events` hay filas recientes y en `stock_ledger` no, el problema está entre evento y ledger.
   - Si en `stock_ledger` hay datos pero la vista sigue vacía o desactualizada, el problema está entre ledger y `v_stock_overview` / `stock_current`.

2. **En Supabase (SQL)**  
   Revisá la definición de:
   - `v_stock_overview` (y si usa `stock_current` o `stock_ledger`).
   - Triggers sobre `jira_stock_events` que inserten en `stock_ledger`.
   - Si existe una tabla `stock_current`, si se rellena con un trigger desde `stock_ledger` o con un job.

## Próximos pasos típicos

- Definir (o corregir) el **trigger** que, al insertar en `jira_stock_events`, inserta el movimiento correspondiente en `stock_ledger`.
- Asegurar que **v_stock_overview** (o la tabla que use) lea de `stock_ledger` o de una tabla de saldos que se actualice desde el ledger. Si usás una tabla `stock_current`, definir el trigger o job que la actualice a partir de `stock_ledger`.
