/**
 * Backfill: trae de Jira created, updated y status para todos los issue_key
 * de jira_material_issues y actualiza Supabase.
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/sync-jira-dates-and-unit.js
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const envPath = join(rootDir, ".env");

if (!existsSync(envPath)) {
  console.error("No se encontró .env en la raíz del proyecto.");
  process.exit(1);
}

const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
for (const line of lines) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) {
    const value = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BATCH_SIZE = 50;

function jiraAuthHeader() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function supabaseFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(method === "PATCH" ? { Prefer: "return=minimal" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function jiraSearch(jql, fields, maxResults = BATCH_SIZE) {
  const params = new URLSearchParams({ jql, fields, maxResults: String(maxResults) });
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql?${params}`, {
    headers: { ...jiraAuthHeader(), Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jira ${res.status}: ${text}`);
  return JSON.parse(text || "{}");
}

/** Misma normalización que la edge function. */
function normalizeStatus(jiraStatus) {
  if (!jiraStatus || typeof jiraStatus !== "string") return "";
  const s = jiraStatus.toLowerCase().trim();
  if (/cacheuta/.test(s)) return "en cacheuta";
  if (/dep[oó]sito|en dep/.test(s)) return "en deposito";
  if (/entregado/.test(s)) return "entregado";
  if (/solicitado/.test(s)) return "solicitado";
  return s || jiraStatus;
}

async function main() {
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    console.error("Faltan variables JIRA en .env");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Faltan variables SUPABASE en .env");
    process.exit(1);
  }

  console.log("Leyendo issue_key desde jira_material_issues...");
  const rows = await supabaseFetch(
    "/rest/v1/jira_material_issues?select=issue_key&order=issue_key.asc"
  );
  const keys = Array.isArray(rows) ? rows.map((r) => r.issue_key).filter(Boolean) : [];
  if (keys.length === 0) {
    console.log("No hay filas en jira_material_issues.");
    return;
  }
  console.log(`Encontradas ${keys.length} issue_key. Lotes de ${BATCH_SIZE}...`);

  const fields = "created,updated,status";
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const jql = `key in (${batch.map((k) => `"${k}"`).join(",")})`;
    try {
      const data = await jiraSearch(jql, fields, BATCH_SIZE);
      const issues = data.issues || [];
      for (const issue of issues) {
        const key = issue.key;
        const f = issue.fields || {};
        const created = typeof f.created === "string" ? f.created : null;
        const updatedAt = typeof f.updated === "string" ? f.updated : null;
        const statusName = f.status && (f.status.name || f.status.value);
        const jira_status = normalizeStatus(statusName || null);
        try {
          await supabaseFetch(
            `/rest/v1/jira_material_issues?issue_key=eq.${encodeURIComponent(key)}`,
            {
              method: "PATCH",
              body: {
                created_at: created,
                jira_updated_at: updatedAt,
                status: jira_status || null,
              },
            }
          );
          updated++;
          if (updated % 20 === 0) console.log(`  Actualizadas ${updated}...`);
        } catch (e) {
          console.error(`  Error ${key}:`, e.message);
          errors++;
        }
      }
    } catch (e) {
      console.error(`Error lote:`, e.message);
      errors += batch.length;
    }
  }

  console.log(`\nListo. Actualizadas: ${updated}, errores: ${errors}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
