/**
 * Backfill único: trae de Jira todos los issues tipo "materiales" creados desde el 01/03/2026
 * y los inserta en jira_material_issues (para dejar la tabla poblada después de haberla vaciado).
 *
 * Usa el endpoint /rest/api/3/search/jql con paginación por nextPageToken (startAt está deprecado).
 * La búsqueda incluye Unidad (customfield_11442) y se guarda en la columna unit de jira_material_issues.
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/backfill-jira-material-issues-from-date.js
 *
 * Requiere en .env: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

const FROM_DATE = "2026-03-01";
const CUSTOM_FIELD_MATERIAL = "customfield_11143";
const CUSTOM_FIELD_QUANTITY = "customfield_11176";
const CUSTOM_FIELD_UNIT = "customfield_11442";
const JIRA_PAGE_SIZE = 50;

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
      ...(method === "POST" ? { Prefer: "resolution=merge-duplicates,return=minimal" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function jiraSearchJql(jql, fields, maxResults = JIRA_PAGE_SIZE, nextPageToken = null) {
  const params = new URLSearchParams({
    jql,
    fields,
    maxResults: String(maxResults),
  });
  if (nextPageToken) {
    params.set("nextPageToken", nextPageToken);
  }
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?${params.toString()}`;
  const res = await fetch(url, {
    headers: { ...jiraAuthHeader(), Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jira ${res.status}: ${text}`);
  return JSON.parse(text || "{}");
}

function normalizeStatus(jiraStatus) {
  if (!jiraStatus || typeof jiraStatus !== "string") return "";
  const s = jiraStatus.toLowerCase().trim();
  if (/cacheuta/.test(s)) return "en cacheuta";
  if (/dep[oó]sito|en dep/.test(s)) return "en deposito";
  if (/entregado/.test(s)) return "entregado";
  if (/solicitado/.test(s)) return "solicitado";
  return s || jiraStatus;
}

function extractUnit(fields) {
  const u = fields[CUSTOM_FIELD_UNIT];
  if (typeof u === "string" && u.trim() !== "") return u.trim();
  if (u && typeof u === "object" && "value" in u && typeof u.value === "string") return u.value;
  if (u && typeof u === "object" && "name" in u && typeof u.name === "string") return u.name;
  return null;
}

function issueToRow(issue) {
  const key = issue.key;
  const f = issue.fields || {};
  const materialCode =
    typeof f[CUSTOM_FIELD_MATERIAL] === "string"
      ? f[CUSTOM_FIELD_MATERIAL].trim()
      : "";
  let quantity = null;
  const qRaw = f[CUSTOM_FIELD_QUANTITY];
  if (typeof qRaw === "number" && !Number.isNaN(qRaw)) quantity = qRaw;
  else if (typeof qRaw === "string" && qRaw.trim() !== "") {
    const n = Number(qRaw.replace(",", "."));
    if (!Number.isNaN(n)) quantity = n;
  }
  const statusName = f.status && (f.status.name || f.status.value);
  const status = normalizeStatus(statusName || null);
  const created = typeof f.created === "string" ? f.created : null;
  const updated = typeof f.updated === "string" ? f.updated : null;
  const unit = extractUnit(f);

  return {
    issue_key: key,
    material_code: materialCode || null,
    quantity: quantity ?? 0,
    status: status || null,
    created_at: created,
    jira_updated_at: updated,
    synced_at: new Date().toISOString(),
    unit: unit,
  };
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

  const fields = [
    "issuetype",
    "status",
    CUSTOM_FIELD_MATERIAL,
    CUSTOM_FIELD_QUANTITY,
    CUSTOM_FIELD_UNIT,
    "created",
    "updated",
  ].join(",");

  const jql = `issuetype = "materiales" AND created >= "${FROM_DATE}"`;
  console.log(`Buscando en Jira: ${jql}`);
  console.log("(Incluye Unidad por issue y se guarda en jira_material_issues.unit.)");
  console.log("");

  let nextPageToken = null;
  let totalInserted = 0;
  let totalErrors = 0;
  let pageNum = 0;

  do {
    pageNum++;
    const data = await jiraSearchJql(jql, fields, JIRA_PAGE_SIZE, nextPageToken || undefined);
    const issues = data.issues || [];
    nextPageToken = data.nextPageToken || null;

    if (issues.length === 0) break;

    const rows = issues.map(issueToRow);

    try {
      await supabaseFetch("/rest/v1/jira_material_issues", {
        method: "POST",
        body: rows,
      });
      totalInserted += rows.length;
      console.log(`  Página ${pageNum}: insertados ${rows.length} (total: ${totalInserted})`);
    } catch (e) {
      console.error(`  Error insertando página ${pageNum}:`, e.message);
      totalErrors += rows.length;
    }
  } while (nextPageToken);

  console.log("");
  console.log(`Listo. Insertados: ${totalInserted}, errores: ${totalErrors}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
