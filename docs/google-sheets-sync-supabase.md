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
