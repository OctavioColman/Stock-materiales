# Webhook Jira → stock materiales (modelo B)

Esta Edge Function recibe webhooks de Jira (issue created/updated) y actualiza la tabla `jira_material_issues` en Supabase para issues de tipo **materiales**.

## Despliegue

1. En Supabase Dashboard → Project Settings → Edge Functions, configurar los secrets:
   - `JIRA_BASE_URL` (ej. https://tu-dominio.atlassian.net)
   - `JIRA_EMAIL`
   - `JIRA_API_TOKEN`
   - `SUPABASE_URL` (ya disponible por defecto)
   - `SUPABASE_SERVICE_ROLE_KEY` (ya disponible por defecto)

2. Desplegar la función (desde la carpeta del proyecto):
   ```bash
   supabase functions deploy jira-materiales-webhook --no-verify-jwt
   ```
   `--no-verify-jwt` es necesario porque Jira no envía un JWT de Supabase.

3. Copiar la URL que devuelve el deploy (ej. `https://<project-ref>.supabase.co/functions/v1/jira-materiales-webhook`).

## Configuración en Jira

1. Ir a **Jira Administration** (o Settings) → **System** → **Webhooks** (o **Apps** → **Webhooks** según tu instancia).
2. Crear un webhook:
   - **URL**: la URL de la Edge Function (paso 3 anterior).
   - **Eventos**: marcar **Issue created** e **Issue updated**.
   - Opcional: si tu Jira permite filtrar por JQL, podés usar algo como `issuetype = "materiales"` para reducir el tráfico.

Tras guardar, cada creación o actualización de un issue tipo "materiales" hará que Jira envíe un POST a la función y se actualice la tabla `jira_material_issues`.
