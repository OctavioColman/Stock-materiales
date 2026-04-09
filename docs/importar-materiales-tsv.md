# Importar materiales desde Google Sheets (TSV)

Después de ejecutar la migración que crea `materials_catalog`, podés cargar los materiales desde un archivo TSV exportado de Google Sheets.

## Columnas esperadas en el TSV

La tabla `materials_catalog` tiene estas columnas (el TSV puede tener la primera fila como encabezado):

| Columna        | Tipo     | Obligatorio | Descripción                    |
|----------------|----------|-------------|--------------------------------|
| material_code  | text     | Sí          | Código único del material      |
| material_name  | text     | No          | Nombre/descripción             |
| product_type   | text     | No          | Tipo de producto               |
| unit           | text     | No          | Unidad (ej. UN, KG, M)         |
| active         | boolean  | No          | true/false (por defecto true)  |

Si tu planilla tiene otros nombres de columna, podés renombrarlos en la primera fila del TSV para que coincidan con la tabla, o mapearlos al importar.

## Pasos para exportar desde Google Sheets

1. Abrí la hoja con los materiales.
2. **Archivo → Descargar → Valores separados por tabulaciones (.tsv)**. Se descarga un archivo `.tsv`.

## Pasos para importar en Supabase

1. Entrá al **Dashboard de Supabase** → tu proyecto.
2. **Table Editor** → seleccioná la tabla **materials_catalog**.
3. Clic en **Import data from CSV** (o **Insert** → **Import from CSV**, según la versión).
4. Subí el archivo `.tsv` que descargaste.
5. En las opciones de importación:
   - **Delimitador**: elegí **Tab** (el TSV usa tabulaciones).
   - Marcá **First row is header** si la primera fila tiene los nombres de columnas.
   - Asigná cada columna del archivo a la columna de la tabla que corresponda (material_code, material_name, etc.).
6. Confirmá la importación.

Si Supabase no ofrece “Tab” como delimitador, podés abrir el `.tsv` en Excel o Google Sheets y guardarlo como **CSV (separado por comas)**. Luego importás ese CSV en Supabase con delimitador coma; asegurate de que los nombres de columnas coincidan con los de la tabla.

## Alternativa: insertar por SQL

Si preferís, podés pegar filas en un INSERT desde el SQL Editor. Por ejemplo:

```sql
INSERT INTO materials_catalog (material_code, material_name, product_type, unit, active)
VALUES
  ('E084', 'Descripción del material', 'Tipo A', 'UN', true),
  ('E085', 'Otro material', 'Tipo B', 'KG', true)
ON CONFLICT (material_code) DO UPDATE SET
  material_name = EXCLUDED.material_name,
  product_type = EXCLUDED.product_type,
  unit = EXCLUDED.unit,
  active = EXCLUDED.active,
  updated_at = now();
```

Para muchos registros, suele ser más práctico usar la importación desde archivo (TSV/CSV) desde el Table Editor.
