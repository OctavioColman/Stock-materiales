# Sincronizar Google Sheets → Supabase (provisorio)

La hoja de Google es la fuente de verdad del catálogo de materiales. Este script sincroniza con la tabla `materials_catalog` en Supabase.

- **Archivo:** compras_2.0 (el libro de Google Sheets).
- **Pestaña de donde se extrae:** **listener sr**.

La vista de stock (codigo, nombre, tipo producto, stock, unidad) usa ese catálogo: **nombre** = "PRODUCTO Y MEDIDA" de la hoja, **tipo producto** = "CATEGORIA". **Stock** lo calcula Supabase (vista). **Unidad** por ahora no está en la hoja y se deja vacía.

## 1. Estructura de la pestaña "listener sr"

| A (CODIGO MATERIAL) | B (PRODUCTO Y MEDIDA) | C (CATEGORIA)     | D (opcional: Unidad) | E (opcional: Activo) |
|--------------------|------------------------|-------------------|----------------------|----------------------|
| PG001              | Válvula Acople...      | Plomeria General  | —                    | —                    |
| PP001              | Caño para pegar...     | Plomeria Presion  | —                    | —                    |

- **Fila 1:** encabezados (CODIGO MATERIAL, PRODUCTO Y MEDIDA, CATEGORIA). Las columnas D y E son opcionales.
- **Desde fila 2:** datos en la pestaña **listener sr**.  
  - **A** = código material → `material_code` (codigo en stock).  
  - **B** = producto y medida → `material_name` (nombre en stock).  
  - **C** = categoría → `product_type` (tipo producto en stock).  
  - **D** = unidad (opcional; si no hay datos, en Supabase queda null).  
  - **E** = activo (opcional; Sí/No; si no está, se considera activo).

## 2. Configurar en Google Apps Script

1. En tu Google Sheet (**compras_2.0**): **Extensiones → Apps Script**.
2. Borra el contenido del archivo `Code.gs` y pega el código del archivo `sync-materials-to-supabase.gs` de este proyecto.
3. **Guardar** (Ctrl+S) y **Proyecto sin título → Configuración del proyecto** (engranaje):
   - En **Propiedades del script** agrega (o usa “Servicios” si prefieres):
     - `SUPABASE_URL`: `https://utenkdzfbjksfusdzawt.supabase.co` (sin barra final).
     - `SUPABASE_SERVICE_ROLE_KEY`: la clave “service_role” de Supabase (Dashboard → Settings → API).
4. **Guardar** de nuevo. La primera vez que ejecutes, te pedirá **autorizar** el acceso a la hoja y a “Conectar a un servicio externo”.

## 3. Ejecutar la sincronización

- **Manual:** En el editor de Apps Script, elige la función `syncMaterialsToSupabase` y pulsa **Ejecutar** (▶).
- **Al editar la hoja:** En el editor, **Activadores** (reloj) → **Añadir activador** → función `syncMaterialsToSupabase`, evento “Al editar la hoja” (o “Al cambiar”). Así cada cambio en la hoja dispara la sync (provisorio en tiempo casi real).
- **Cada X minutos:** Mismo menú de activadores, evento “Activado por tiempo”, intervalo (ej. cada 5 minutos).

## 4. Seguridad (provisorio)

- La **service role key** queda en las propiedades del script. Solo quien tenga acceso de edición al script puede verla. Para producción es mejor usar un endpoint tuyo que tenga la key en el servidor.
- No compartas el script ni las propiedades con personas que no deban tener acceso a Supabase.

## 5. Qué hace el script

- Lee todas las filas con datos (desde la fila 2) de la primera hoja.
- Convierte cada fila a un objeto `{ material_code, material_name, product_type, unit, active }`.
- Hace **upsert** en `materials_catalog` por `material_code` (si existe actualiza, si no inserta).
- Envía en lotes de 100 filas para no superar límites de la API.

## 6. Diagnóstico: "el script corre pero no se refleja en la base" / "no veo PP128 en stock"

**Dos cosas distintas:**

1. **Catálogo (`materials_catalog`)**  
   Lo llena el script de Google Sheets. Si PP128 está en la hoja "listener sr" (columna A) y el script corre bien, PP128 debería estar en esta tabla.

2. **Vista de stock**  
   Usa la vista `v_stock_overview_materiales`: une el catálogo con `jira_material_issues`. Solo muestra materiales que están en el catálogo **y** el número "stock" viene de Jira (issues tipo "materiales" con estado "En depósito"). Si PP128 está en el catálogo pero **no** hay ningún issue en Jira para PP128 con estado "En depósito", igual aparece en la vista con **stock = 0**.

**Si el script “corre” pero no se agregan materiales:**

- Revisá el **registro de ejecución** en Apps Script (Ver → Registro de ejecución). Después del cambio en el script verás líneas como "Filas leídas...", "Total material_code en Supabase después de sync" y "PP128 está / NO está en Supabase".
- Comprobá **Propiedades del script**: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` correctos (mismo proyecto que usa la app).
- En Supabase **Table Editor** → `materials_catalog`: después de ejecutar el script, ¿aparecen filas? ¿Aparece PP128?
- **RLS:** Si en Supabase tenés Row Level Security en `materials_catalog`, la policy debe permitir al `service_role` (o anon con la key que usás). Con `service_role` normalmente no aplica RLS.
- El script ahora usa **upsert con `on_conflict=material_code`**; si fallaba antes por eso, con la versión actual debería persistir.

**Si PP128 está en el catálogo pero no en la vista de stock:**  
La vista filtra por `m.active = true`. Revisá en la hoja que la columna E (Activo) para esa fila no sea "No" / "N" / "0".
