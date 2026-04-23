import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Cargar .env desde la carpeta del proyecto (Node no lo hace por defecto)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const value = m[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Jira helpers ----------
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

// Solo mostrar/contar eventos de materiales desde esta fecha (eventos anteriores tenían códigos incorrectos)
const MATERIAL_ISSUES_MIN_DATE = "2026-03-01";

// Modal Entregar: materiales "extra" con esta opción en lista seleccionable (customfield_10483). El filtro se aplica leyendo el valor en la API (JQL con cf[] suele fallar en campos select).
const JIRA_STOCK_LABEL_FIELD_ID = process.env.JIRA_STOCK_LABEL_FIELD_ID || "10483";
const JIRA_PANOL_STOCK_LABEL = process.env.JIRA_PANOL_STOCK_LABEL || "pañol stock";
/** Opcional: id de opción en Jira (Settings → custom field → opciones) si el texto no coincide exactamente */
const JIRA_PANOL_STOCK_OPTION_ID = (process.env.JIRA_PANOL_STOCK_OPTION_ID || "").trim();

function jiraAuthHeader() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function jiraFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${JIRA_BASE_URL}${path}`, {
    method,
    headers: {
      ...jiraAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    throw new Error(`Jira ${res.status}: ${text}`);
  }
  return json;
}

async function jiraGetTransitions(issueKey) {
  const data = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
  return data.transitions || [];
}

async function jiraTransitionToEntregado(issueKey, transitionFields = null) {
  const transitions = await jiraGetTransitions(issueKey);
  const entregado = transitions.find((t) => t.to && /entregado/i.test(t.to.name || ""));
  if (!entregado) return { done: false, reason: "No hay transición a Entregado" };
  const body = { transition: { id: entregado.id } };
  if (transitionFields && typeof transitionFields === "object" && Object.keys(transitionFields).length > 0) {
    body.fields = transitionFields;
  }
  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: "POST",
    body,
  });
  return { done: true };
}

async function jiraTransitionToEnDeposito(issueKey) {
  const transitions = await jiraGetTransitions(issueKey);
  const enDeposito = transitions.find((t) => t.to && /deposito|depósito/i.test((t.to && t.to.name) || ""));
  if (!enDeposito) return { done: false, reason: "No hay transición a En deposito" };
  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: "POST",
    body: { transition: { id: enDeposito.id } },
  });
  return { done: true };
}

// ---------- Supabase (optional) materials autocomplete ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path, opts = {}) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...opts.headers,
  };
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return json;
}

/** Trae todas las filas de una vista/tabla paginando con Range (PostgREST limita 1000 por request). */
async function supabaseFetchAll(path, pageSize = 1000, maxRows = 20000) {
  const all = [];
  let start = 0;
  while (start < maxRows) {
    const raw = await supabaseFetch(path, {
      headers: { Range: `${start}-${start + pageSize - 1}` },
    });
    const rows = Array.isArray(raw) ? raw : [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    start += pageSize;
  }
  return all;
}

// ---------- Proyectos permitidos (mismo listado en issues y create) ----------
const ALLOWED_PROJECT_KEYS = ["GD", "PROB", "DET", "GM", "GJ", "GEL", "GIIG"];

// ---------- 0) Listar proyectos (para el selector del front) ----------
app.get("/api/projects", (_req, res) => {
  res.json({ projects: ALLOWED_PROJECT_KEYS });
});

// ---------- 1) Buscar actividades para vincular (Issue Picker + JQL search con nextPageToken) ----------
const BASE_JQL = `project in (${ALLOWED_PROJECT_KEYS.join(",")})`;
// Solo estos tipos para el selector de actividad en consumo
const ACTIVITY_ISSUE_TYPES_JQL = `project in (${ALLOWED_PROJECT_KEYS.join(",")}) AND issuetype in ("Problema Mantenimiento", "Problema Electricidad", "Problema Jardinería", "Problema Infraestructura", "Detalle Mantenimiento", "Detalle Infraestructura", "Detalle Jardinería", "Detalle Electricidad", "Epic")`;
// Orden de compra para el modal Recibir (selector de actividad)
const ORDEN_COMPRA_ISSUE_TYPES_JQL = `issuetype = "Orden de Compra"`;
// Campo Sprint en Jira (suele ser customfield_10020; si no coincide, definir JIRA_SPRINT_FIELD en .env)
const JIRA_SPRINT_FIELD = process.env.JIRA_SPRINT_FIELD || "customfield_10020";

/** Extrae IDs numéricos de sprint desde el valor del campo Sprint de Jira (array de objetos o strings legacy). */
function parseSprintIdsFromJiraField(raw) {
  if (raw == null) return [];
  const ids = new Set();
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const item of arr) {
    if (item == null) continue;
    if (typeof item === "number" && Number.isFinite(item)) {
      ids.add(item);
      continue;
    }
    if (typeof item === "object" && item.id != null) {
      const n = Number(item.id);
      if (!Number.isNaN(n)) ids.add(n);
      continue;
    }
    if (typeof item === "string") {
      const m = item.match(/id=(\d+)/);
      if (m) {
        ids.add(Number(m[1]));
        continue;
      }
      const n = Number(String(item).trim());
      if (!Number.isNaN(n) && String(item).trim() !== "") ids.add(n);
    }
  }
  return [...ids];
}

// Tipos de actividad que indican que un epic "tiene" problema o detalle (para filtrar "Añadir más material")
const PROBLEMA_DETALLE_ISSUE_TYPES = [
  "Problema Mantenimiento", "Problema Electricidad", "Problema Jardinería", "Problema Infraestructura",
  "Detalle Mantenimiento", "Detalle Electricidad", "Detalle Jardinería", "Detalle Infraestructura",
];

// Quitar etiquetas HTML que devuelve el Issue Picker (ej. <b>texto</b>) para mostrar solo texto
function plainText(s) {
  if (typeof s !== "string") return "";
  return s.replace(/<[^>]+>/g, "").trim();
}

function mapIssue(i) {
  const rawSummary = i.fields?.summary ?? i.summary ?? i.summaryText ?? "";
  return {
    key: i.key,
    summary: plainText(rawSummary),
    project: i.fields?.project?.key ?? (i.key ? i.key.split("-")[0] : ""),
    status: i.fields?.status?.name ?? "",
    issuetype: i.fields?.issuetype?.name ?? ""
  };
}

app.get("/api/issues", async (req, res) => {
  try {
    const q = (req.query.query || "").trim();
    const nextPageToken = (req.query.nextPageToken || "").trim() || null;

    // Cuando el usuario escribe: Issue Picker (búsqueda por texto, sin JQL deprecated)
    if (q) {
      const params = new URLSearchParams({
        query: q,
        currentJQL: `${ACTIVITY_ISSUE_TYPES_JQL} ORDER BY updated DESC`
      });
      const picker = await jiraFetch(`/rest/api/3/issue/picker?${params.toString()}`);
      const issues = (picker.sections || [])
        .flatMap((s) => s.issues || [])
        .map((i) => ({
          key: i.key,
          summary: plainText(i.summary ?? i.summaryText ?? ""),
          project: i.key ? i.key.split("-")[0] : "",
          status: "",
          issuetype: ""
        }));
      return res.json({ issues, nextPageToken: null });
    }

    // Lista inicial (sin texto): GET /rest/api/3/search/jql para obtener issues con estructura completa
    const startAt = nextPageToken ? Number(nextPageToken) : 0;
    const jql = `${ACTIVITY_ISSUE_TYPES_JQL} ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=50&startAt=${startAt}&fields=summary,issuetype,project,status&jql=${encodeURIComponent(jql)}`
    );
    const issues = (data.issues || []).map(mapIssue);
    const total = data.total ?? 0;
    const nextStart = (data.startAt ?? 0) + issues.length;
    let next = nextStart < total ? String(nextStart) : null;
    if (data.nextPageToken != null) next = data.nextPageToken;
    res.json({ issues, nextPageToken: next });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Debug: búsqueda de actividades para modal Entregar (ver qué devuelve Jira) ----------
app.get("/api/debug/issues", async (req, res) => {
  const result = {
    jql_used: ACTIVITY_ISSUE_TYPES_JQL,
    jql_full: `${ACTIVITY_ISSUE_TYPES_JQL} ORDER BY updated DESC`,
    projects: ALLOWED_PROJECT_KEYS,
    picker_sample: null,
    search_jql: null,
    error: null,
    issuetypes_in_projects: null,
  };
  try {
    const query = (req.query.query || "").trim();
    if (query) {
      const params = new URLSearchParams({
        query,
        currentJQL: `${ACTIVITY_ISSUE_TYPES_JQL} ORDER BY updated DESC`,
      });
      const picker = await jiraFetch(`/rest/api/3/issue/picker?${params.toString()}`);
      result.picker_sample = {
        sections_count: (picker.sections || []).length,
        sections: (picker.sections || []).map((s) => ({
          label: s.label,
          issues_count: (s.issues || []).length,
          issues_sample: (s.issues || []).slice(0, 3).map((i) => ({ key: i.key, summary: i.summary || i.summaryText })),
        })),
      };
    }
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=20&startAt=0&fields=summary,issuetype,project,status&jql=${encodeURIComponent(result.jql_full)}`
    );
    result.search_jql = {
      total: data.total,
      startAt: data.startAt,
      maxResults: data.maxResults,
      issues_count: (data.issues || []).length,
      issues_sample: (data.issues || []).slice(0, 10).map((i) => ({
        key: i.key,
        summary: i.fields?.summary,
        issuetype: i.fields?.issuetype?.name,
        project: i.fields?.project?.key,
        status: i.fields?.status?.name,
      })),
    };
    const meta = await jiraFetch(`/rest/api/3/issue/createmeta?projectKeys=${ALLOWED_PROJECT_KEYS.join(",")}&expand=projects.issuetypes`);
    result.issuetypes_in_projects = (meta.projects || []).map((p) => ({
      key: p.key,
      name: p.name,
      issuetypes: (p.issuetypes || []).map((t) => ({ id: t.id, name: t.name })),
    }));
  } catch (e) {
    result.error = e.message;
    result.stack = process.env.NODE_ENV === "development" ? e.stack : undefined;
  }
  res.json(result);
});

// ---------- Listar actividades tipo Orden de Compra (para modal Recibir) ----------
app.get("/api/issues-orden-compra", async (req, res) => {
  try {
    const q = (req.query.query || "").trim();
    const nextPageToken = (req.query.nextPageToken || "").trim() || null;
    if (q) {
      const params = new URLSearchParams({
        query: q,
        currentJQL: `${ORDEN_COMPRA_ISSUE_TYPES_JQL} ORDER BY updated DESC`
      });
      const picker = await jiraFetch(`/rest/api/3/issue/picker?${params.toString()}`);
      const issues = (picker.sections || [])
        .flatMap((s) => s.issues || [])
        .map((i) => ({
          key: i.key,
          summary: plainText(i.summary ?? i.summaryText ?? ""),
          project: i.key ? i.key.split("-")[0] : "",
          status: "",
          issuetype: ""
        }));
      return res.json({ issues, nextPageToken: null });
    }
    const startAt = nextPageToken ? Number(nextPageToken) : 0;
    const jql = `${ORDEN_COMPRA_ISSUE_TYPES_JQL} ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=50&startAt=${startAt}&fields=summary,issuetype,project,status&jql=${encodeURIComponent(jql)}`
    );
    const issues = (data.issues || []).map(mapIssue);
    const total = data.total ?? 0;
    const nextStart = (data.startAt ?? 0) + issues.length;
    let next = nextStart < total ? String(nextStart) : null;
    if (data.nextPageToken != null) next = data.nextPageToken;
    res.json({ issues, nextPageToken: next });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Debug: búsqueda de Órdenes de compra (ver qué devuelve Jira y dónde falla) ----------
app.get("/api/debug/issues-orden-compra", async (req, res) => {
  const result = {
    jql_used: ORDEN_COMPRA_ISSUE_TYPES_JQL,
    jql_full: `${ORDEN_COMPRA_ISSUE_TYPES_JQL} ORDER BY updated DESC`,
    picker: null,
    search_jql: null,
    search_raw: null,
    issues_parsed: null,
    error: null,
    issuetypes_in_projects: null,
  };
  try {
    const query = (req.query.query || "").trim();
    if (query) {
      const params = new URLSearchParams({
        query,
        currentJQL: `${ORDEN_COMPRA_ISSUE_TYPES_JQL} ORDER BY updated DESC`,
      });
      const picker = await jiraFetch(`/rest/api/3/issue/picker?${params.toString()}`);
      result.picker = {
        sections_count: (picker.sections || []).length,
        sections: (picker.sections || []).map((s) => ({
          label: s.label,
          issues_count: (s.issues || []).length,
          issues_sample: (s.issues || []).slice(0, 3).map((i) => ({ key: i.key, summary: i.summary || i.summaryText })),
        })),
        raw_keys: (picker.sections || []).flatMap((s) => (s.issues || []).map((i) => i.key)),
      };
    }
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=10&startAt=0&fields=summary,issuetype,project,status&jql=${encodeURIComponent(result.jql_full)}`
    );
    result.search_raw = {
      total: data.total,
      startAt: data.startAt,
      maxResults: data.maxResults,
      issues_count: (data.issues || []).length,
      issues_sample: (data.issues || []).slice(0, 5).map((i) => ({
        key: i.key,
        summary: i.fields?.summary,
        issuetype: i.fields?.issuetype?.name,
        project: i.fields?.project?.key,
        status: i.fields?.status?.name,
      })),
    };
    result.issues_parsed = (data.issues || []).map(mapIssue);
    const projKey = ALLOWED_PROJECT_KEYS[0];
    const meta = await jiraFetch(`/rest/api/3/issue/createmeta?projectKeys=${ALLOWED_PROJECT_KEYS.join(",")}&expand=projects.issuetypes`);
    const typesByProject = (meta.projects || []).map((p) => ({
      key: p.key,
      name: p.name,
      issuetypes: (p.issuetypes || []).map((t) => ({ id: t.id, name: t.name })),
    }));
    result.issuetypes_in_projects = typesByProject;
  } catch (e) {
    result.error = e.message;
    result.stack = process.env.NODE_ENV === "development" ? e.stack : undefined;
  }
  res.json(result);
});

// ---------- Diagnóstico Supabase (abrí en el navegador: http://localhost:3001/api/debug/supabase) ----------
app.get("/api/debug/supabase", async (_req, res) => {
  const hasUrl = Boolean(SUPABASE_URL?.trim());
  const hasKey = Boolean(SUPABASE_SERVICE_ROLE_KEY?.trim());
  let test = null;
  if (hasUrl && hasKey) {
    try {
      // Prueba simple: traer una fila sin filtro
      const raw = await supabaseFetch(
        "/rest/v1/materials_catalog?select=material_code,material_name&limit=3"
      );
      test = { ok: true, count: Array.isArray(raw) ? raw.length : 0, sample: Array.isArray(raw) ? raw : raw };
    } catch (e) {
      test = { ok: false, error: e.message };
    }
  }
  res.json({
    env: { hasUrl, hasKey },
    test,
    hint: !hasUrl || !hasKey
      ? "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Revisá que el .env esté en la misma carpeta que server.js y reiniciá el servidor."
      : null,
  });
});

// ---------- Diagnóstico vista stock modelo B (v_stock_overview_materiales) ----------
app.get("/api/debug/stock", async (_req, res) => {
  const hasUrl = Boolean(SUPABASE_URL?.trim());
  const hasKey = Boolean(SUPABASE_SERVICE_ROLE_KEY?.trim());
  const result = { env: { hasUrl, hasKey }, view: "v_stock_overview_materiales", columns: "material_code,material_name,product_type,unit,on_hand" };

  if (!hasUrl || !hasKey) {
    result.ok = false;
    result.error = "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env";
    return res.json(result);
  }

  try {
    const raw = await supabaseFetch(
      "/rest/v1/v_stock_overview_materiales?select=material_code,material_name,product_type,unit,on_hand&order=material_code.asc&limit=5"
    );
    const rows = Array.isArray(raw) ? raw : [];
    result.ok = true;
    result.count = rows.length;
    result.sample = rows[0] ?? null;
    result.firstFive = rows;
    if (rows.length === 0) {
      result.hint = "La vista v_stock_overview_materiales devolvió 0 filas. Revisá que exista en Supabase y que jira_material_issues tenga datos con status 'en deposito'.";
    }
  } catch (e) {
    result.ok = false;
    result.error = e.message;
    result.hint = "Error al conectar con Supabase. Revisá que v_stock_overview_materiales exista y que las columnas material_code, material_name, product_type, unit, on_hand existan.";
  }

  res.json(result);
});

// ---------- Diagnóstico actividades materiales (jira_material_issues) ----------
app.get("/api/debug/material-issues", async (_req, res) => {
  const hasUrl = Boolean(SUPABASE_URL?.trim());
  const hasKey = Boolean(SUPABASE_SERVICE_ROLE_KEY?.trim());
  const result = { env: { hasUrl, hasKey }, table: "jira_material_issues", ok: false, error: null, count: 0, sample: null, firstTwenty: [] };

  if (!hasUrl || !hasKey) {
    result.error = "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY";
    return res.json(result);
  }

  try {
    const raw = await supabaseFetch(
      "/rest/v1/jira_material_issues?select=issue_key,material_code,quantity,status,jira_updated_at,created_at,unit&order=jira_updated_at.desc.nullslast&limit=20&created_at=gte." + encodeURIComponent(MATERIAL_ISSUES_MIN_DATE)
    );
    const rows = Array.isArray(raw) ? raw : [];
    result.ok = true;
    result.count = rows.length;
    result.sample = rows[0] ?? null;
    result.firstTwenty = rows;
  } catch (e) {
    result.error = e.message || String(e);
  }

  res.json(result);
});

// ---------- Actividades materiales (jira_material_issues: create/update desde Jira) ----------
app.get("/api/material-issues", async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.json({ events: [], _debug: "env_missing" });
    }
    const materialCode = (req.query.material_code || "").trim();
    const statusFilter = (req.query.status || "").trim();
    let fromDate = (req.query.from_date || "").trim();
    const toDate = (req.query.to_date || "").trim();

    // Solo traer eventos desde MATERIAL_ISSUES_MIN_DATE para no mostrar datos con códigos incorrectos
    if (!fromDate || fromDate < MATERIAL_ISSUES_MIN_DATE) {
      fromDate = MATERIAL_ISSUES_MIN_DATE;
    }

    const filters = [];
    if (materialCode) filters.push(`material_code=eq.${encodeURIComponent(materialCode)}`);
    if (statusFilter) filters.push(`status=eq.${encodeURIComponent(statusFilter)}`);
    filters.push(`created_at=gte.${encodeURIComponent(fromDate)}`);
    if (toDate) filters.push(`created_at=lte.${encodeURIComponent(toDate)}`);
    const filterStr = filters.length ? "&" + filters.join("&") : "";

    const path = `/rest/v1/jira_material_issues?select=issue_key,material_code,quantity,status,jira_updated_at,created_at,unit&order=jira_updated_at.desc.nullslast&limit=5000${filterStr}`;
    const raw = await supabaseFetch(path);
    const events = Array.isArray(raw) ? raw : [];
    events.forEach((e) => {
      e.jira_created_at = e.jira_created_at ?? e.created_at;
    });

    const codes = [...new Set(events.map((e) => e.material_code).filter(Boolean))];
    let nameByCode = {};
    let unitByCode = {};
    if (codes.length > 0) {
      try {
        const inFilter = codes.slice(0, 300).map((c) => encodeURIComponent(c)).join(",");
        const catalog = await supabaseFetch(
          `/rest/v1/materials_catalog?select=material_code,material_name,unit&material_code=in.(${inFilter})`
        );
        const rows = Array.isArray(catalog) ? catalog : [];
        rows.forEach((r) => {
          nameByCode[r.material_code] = r.material_name ?? "";
          unitByCode[r.material_code] = r.unit ?? "";
        });
      } catch (_) { /* ignore */ }
    }
    events.forEach((e) => {
      e.material_name = nameByCode[e.material_code] ?? null;
      e.unit = e.unit ?? unitByCode[e.material_code] ?? null;
    });

    res.json({ events });
  } catch (e) {
    res.status(500).json({ events: [], error: e.message });
  }
});

// ---------- 2) Autocompletar materiales desde Supabase (recomendado) ----------
app.get("/api/materials", async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.json({ materials: [], _debug: "env_missing" });
    }
    const q = (req.query.query || "").trim();

    // Busca por código o nombre (ilike; en PostgreSQL el comodín es %)
    const pattern = q ? `%${q.replace(/%/g, "\\%")}%` : "";
    const filter = pattern
      ? `or=(material_code.ilike.${encodeURIComponent(pattern)},material_name.ilike.${encodeURIComponent(pattern)})`
      : "";

    const materials = await supabaseFetch(
      `/rest/v1/materials_catalog?select=material_code,material_name,product_type,unit&active=eq.true&${filter}&limit=20`
    );

    res.json({ materials: Array.isArray(materials) ? materials : [] });
  } catch (e) {
    res.status(500).json({ materials: [], error: e.message });
  }
});

// ---------- 2b) Listar materiales con stock actual (v_stock_overview_materiales) ----------
app.get("/api/stock", async (_req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.json({ items: [], _debug: "env_missing" });
    }
    // PostgREST devuelve máx 1000 filas; paginamos para traer todos los materiales del catálogo
    const path = "/rest/v1/v_stock_overview_materiales?select=material_code,material_name,product_type,unit,on_hand&order=material_code.asc";
    const rows = await supabaseFetchAll(path);
    const items = rows.map((r) => ({
      material_code: r.material_code ?? "",
      material_name: r.material_name ?? "",
      product_type: r.product_type ?? "",
      unit: r.unit ?? "",
      stock: r.on_hand != null ? Number(r.on_hand) : 0,
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ items: [], error: e.message });
  }
});

// ---------- 3a) Actividades tipo "materiales" en estado "en deposito" para un código dado (consulta live a Jira) ----------
app.get("/api/jira-material-en-deposito", async (req, res) => {
  try {
    const materialCode = (req.query.material_code || "").trim();
    if (!materialCode) {
      return res.json({ issues: [], detail_count: 0, detail_total_qty: 0 });
    }

    const statusNorm = (s) => (s && typeof s === "string" ? s.toLowerCase().replace(/ó/g, "o").trim() : "");
    const isDepositoStatus = (name) => /deposito|depósito|en dep/.test(statusNorm(name));
    const targetCode = materialCode.toUpperCase();

    // Buscar siempre por código (sin estado estricto) y paginar para no perder filas.
    const jql = `issuetype = "materiales" AND cf[11143] ~ "${materialCode}" ORDER BY updated DESC`;
    const fieldsParam = "summary,status,customfield_11143,customfield_11176,customfield_11442,updated,parent";
    const pageSize = 100;
    const maxRows = 1000;
    let startAt = 0;
    let rawIssues = [];
    while (rawIssues.length < maxRows) {
      const data = await jiraFetch(
        `/rest/api/3/search/jql?maxResults=${pageSize}&startAt=${startAt}&fields=${fieldsParam}&jql=${encodeURIComponent(jql)}`
      );
      const pageIssues = data.issues || [];
      if (pageIssues.length === 0) break;
      rawIssues.push(...pageIssues);
      const total = data.total ?? 0;
      startAt += pageIssues.length;
      if (startAt >= total) break;
    }

    rawIssues = rawIssues.filter((i) => {
      const cf = (i.fields?.customfield_11143 ?? "").toString().trim().toUpperCase();
      const codeMatch = cf === targetCode || cf.includes(targetCode);
      if (!codeMatch) return false;
      return isDepositoStatus(i.fields?.status?.name ?? "");
    });

    const parentKeys = [...new Set(rawIssues.map((i) => i.fields?.parent?.key).filter(Boolean))];
    const epicSummaryByKey = {};
    if (parentKeys.length > 0) {
      const chunkSize = 50;
      for (let start = 0; start < parentKeys.length; start += chunkSize) {
        const chunk = parentKeys.slice(start, start + chunkSize);
        const parentJql = `key in (${chunk.map((k) => `"${k}"`).join(", ")})`;
        const parentData = await jiraFetch(
          `/rest/api/3/search/jql?maxResults=${chunk.length}&fields=summary&jql=${encodeURIComponent(parentJql)}`
        );
        for (const p of parentData.issues || []) {
          epicSummaryByKey[p.key] = p.fields?.summary ?? "-";
        }
      }
    }

    const issues = rawIssues.map((i) => {
      let qty = null;
      const qRaw = i.fields?.customfield_11176;
      if (typeof qRaw === "number") qty = qRaw;
      else if (typeof qRaw === "string" && qRaw.trim()) {
        const n = Number(qRaw.replace(",", "."));
        if (!Number.isNaN(n)) qty = n;
      }
      const parentKey = i.fields?.parent?.key || null;
      const unitRaw = i.fields?.customfield_11442;
      const unitText =
        typeof unitRaw === "string" ? unitRaw
        : unitRaw && typeof unitRaw === "object" ? (unitRaw.value || unitRaw.name || unitRaw.id || "")
        : "";
      return {
        key: i.key,
        summary: i.fields?.summary ?? "",
        status: i.fields?.status?.name ?? "",
        material_code: i.fields?.customfield_11143 ?? "",
        quantity: qty,
        unit: unitText || "-",
        updated: i.fields?.updated ?? null,
        epic_key: parentKey,
        epic_summary: parentKey ? (epicSummaryByKey[parentKey] || "-") : "-",
      };
    });

    const detailTotalQty = issues.reduce((acc, it) => {
      const n = Number(it.quantity);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
    res.json({ issues, detail_count: issues.length, detail_total_qty: detailTotalQty });
  } catch (e) {
    res.status(500).json({ issues: [], detail_count: 0, detail_total_qty: 0, error: e.message });
  }
});

function mapJiraMaterialToIssue(i) {
  let qty = null;
  const qRaw = i.fields?.customfield_11176;
  if (typeof qRaw === "number") qty = qRaw;
  else if (typeof qRaw === "string" && qRaw.trim()) {
    const n = Number(qRaw.replace(",", "."));
    if (!Number.isNaN(n)) qty = n;
  }
  return {
    key: i.key,
    summary: i.fields?.summary ?? "",
    status: i.fields?.status?.name ?? "",
    material_code: (i.fields?.customfield_11143 ?? "").toString().trim(),
    quantity: qty,
    updated: i.fields?.updated ?? null,
  };
}

function parseQuantityFromIssue(fields) {
  const qRaw = fields?.customfield_11176;
  if (typeof qRaw === "number") return qRaw;
  if (typeof qRaw === "string" && qRaw.trim()) {
    const n = Number(qRaw.replace(",", "."));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/** Campos a copiar al clonar un material (extra) hacia el proyecto de la actividad */
function pickMaterialIssueFieldsForClone(fields) {
  const cfStock = `customfield_${JIRA_STOCK_LABEL_FIELD_ID}`;
  return {
    summary: fields?.summary ?? "",
    customfield_11143: (fields?.customfield_11143 ?? "").toString().trim(),
    customfield_10483: fields?.[cfStock],
    description: fields?.description,
  };
}

/** Crea el body para POST issue tipo materiales en un proyecto con cantidad dada */
function buildCreateMaterialPayload(projectKey, cloneFields, quantity) {
  const cfStock = `customfield_${JIRA_STOCK_LABEL_FIELD_ID}`;
  const payload = {
    project: { key: projectKey },
    summary: cloneFields.summary || `Material ${cloneFields.customfield_11143 || ""} - ${quantity}`,
    issuetype: { name: "materiales" },
    customfield_11143: cloneFields.customfield_11143 || "",
    customfield_11176: String(quantity),
  };
  if (cloneFields.customfield_10483 !== undefined && cloneFields.customfield_10483 !== null) {
    payload[cfStock] = cloneFields.customfield_10483;
  }
  if (cloneFields.description && typeof cloneFields.description === "object") {
    payload.description = cloneFields.description;
  }
  return { fields: payload };
}

/**
 * Garantiza que la actividad tenga epic.
 * - Si la actividad ya tiene parent, devuelve ese epic.
 * - Si la actividad es Epic, devuelve su key.
 * - Si no tiene epic y no es Epic, crea un Epic en el mismo proyecto con el mismo summary
 *   y asigna la actividad a ese parent.
 */
async function ensureEpicForActivity(activityKey) {
  const activityData = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(activityKey)}?fields=parent,summary,project,issuetype`
  );
  const fields = activityData?.fields || {};
  const projectKey = fields?.project?.key || (activityKey ? activityKey.split("-")[0] : "STOCK");
  const issueTypeName = (fields?.issuetype?.name || "").toString();
  const summary = (fields?.summary || "").toString().trim() || activityKey;

  if (fields?.parent?.key) {
    return { epicKey: fields.parent.key, projectKey, epicCreated: false, activityIssueType: issueTypeName };
  }

  if (/^epic$/i.test(issueTypeName)) {
    return { epicKey: activityKey, projectKey, epicCreated: false, activityIssueType: issueTypeName };
  }

  const createdEpic = await jiraFetch(`/rest/api/3/issue`, {
    method: "POST",
    body: {
      fields: {
        project: { key: projectKey },
        summary,
        issuetype: { name: "Epic" },
      },
    },
  });
  const epicKey = createdEpic?.key;
  if (!epicKey) {
    throw new Error("No se pudo crear Epic para la actividad destino.");
  }

  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(activityKey)}`, {
    method: "PUT",
    body: { fields: { parent: { key: epicKey } } },
  });

  return { epicKey, projectKey, epicCreated: true, activityIssueType: issueTypeName };
}

/** Valor legible de un campo select / lista en Jira REST (objeto { id, value }, string o array multi-select) */
function normalizeJiraSelectValue(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") {
    if (raw.value != null && typeof raw.value !== "object") return String(raw.value).trim();
    if (raw.name != null) return String(raw.name).trim();
  }
  return "";
}

function jiraSelectFieldValues(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(normalizeJiraSelectValue).filter(Boolean);
  const one = normalizeJiraSelectValue(raw);
  return one ? [one] : [];
}

function issueMatchesPanolStockField(fields) {
  const key = `customfield_${JIRA_STOCK_LABEL_FIELD_ID}`;
  const raw = fields?.[key];
  if (JIRA_PANOL_STOCK_OPTION_ID && raw != null && typeof raw === "object" && !Array.isArray(raw) && raw.id != null) {
    if (String(raw.id) === JIRA_PANOL_STOCK_OPTION_ID) return true;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (JIRA_PANOL_STOCK_OPTION_ID && item && typeof item === "object" && item.id != null && String(item.id) === JIRA_PANOL_STOCK_OPTION_ID) {
        return true;
      }
    }
  }
  const values = jiraSelectFieldValues(raw);
  const want = JIRA_PANOL_STOCK_LABEL.trim().toLowerCase();
  return values.some((v) => v.toLowerCase() === want);
}

async function resolveEpicKeyFromIssue(issueKey) {
  const issueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=parent`);
  const parent = issueData?.fields?.parent;
  return parent?.key || issueKey;
}

async function fetchEpicDepositoMaterials(epicKey) {
  const jql = `issuetype = "materiales" AND status = "En deposito" AND parent = "${epicKey}" ORDER BY updated DESC`;
  const data = await jiraFetch(
    `/rest/api/3/search/jql?maxResults=100&fields=summary,status,customfield_11143,customfield_11176,updated&jql=${encodeURIComponent(jql)}`
  );
  return (data.issues || []).map(mapJiraMaterialToIssue);
}

async function fetchExtraPanolStockMaterials(epicKey) {
  const cfKey = `customfield_${JIRA_STOCK_LABEL_FIELD_ID}`;
  const fieldsParam = `summary,status,customfield_11143,customfield_11176,updated,parent,${cfKey}`;
  const jql = `issuetype = "materiales" AND status = "En deposito" ORDER BY updated DESC`;
  const collected = [];
  const pageSize = 50;
  const maxExtra = 100;
  let startAt = 0;
  let cursor = null;
  const maxIterations = 30;

  for (let iter = 0; iter < maxIterations && collected.length < maxExtra; iter++) {
    const path = cursor
      ? `/rest/api/3/search/jql?maxResults=${pageSize}&nextPageToken=${encodeURIComponent(cursor)}&fields=${fieldsParam}&jql=${encodeURIComponent(jql)}`
      : `/rest/api/3/search/jql?maxResults=${pageSize}&startAt=${startAt}&fields=${fieldsParam}&jql=${encodeURIComponent(jql)}`;
    const data = await jiraFetch(path);
    const rawIssues = data.issues || [];
    const total = data.total ?? 0;
    for (const i of rawIssues) {
      if (collected.length >= maxExtra) break;
      const parentKey = i.fields?.parent?.key;
      if (parentKey === epicKey) continue;
      if (!issueMatchesPanolStockField(i.fields)) continue;
      collected.push(i);
    }
    if (rawIssues.length === 0) break;
    if (data.nextPageToken != null && data.nextPageToken !== "") {
      cursor = data.nextPageToken;
      continue;
    }
    cursor = null;
    if (startAt + rawIssues.length >= total) break;
    startAt += rawIssues.length;
  }

  return collected.map(mapJiraMaterialToIssue);
}

// ---------- Materiales en depósito en el mismo epic que la actividad (para flujo Consumir) ----------
app.get("/api/jira-material-linked-to", async (req, res) => {
  try {
    const issueKey = (req.query.issue_key || "").trim();
    if (!issueKey) return res.json({ issues: [] });
    const epicKey = await resolveEpicKeyFromIssue(issueKey);
    const issues = await fetchEpicDepositoMaterials(epicKey);
    res.json({ issues });
  } catch (e) {
    res.status(500).json({ issues: [], error: e.message });
  }
});

// ---------- Materiales en depósito con etiqueta "pañol stock" (customfield_10483), fuera del epic de la actividad (modal Entregar) ----------
app.get("/api/jira-material-panol-stock", async (req, res) => {
  try {
    const issueKey = (req.query.issue_key || "").trim();
    if (!issueKey) return res.json({ issues: [] });
    const epicKey = await resolveEpicKeyFromIssue(issueKey);
    const issues = await fetchExtraPanolStockMaterials(epicKey);
    res.json({ issues });
  } catch (e) {
    res.status(500).json({ issues: [], error: e.message });
  }
});

// ---------- Modal Entregar: epic + extra en una sola respuesta JSON (evita doble request / HTML del proxy) ----------
app.get("/api/jira-materials-entregar", async (req, res) => {
  try {
    const issueKey = (req.query.issue_key || "").trim();
    if (!issueKey) {
      return res.json({ issues: [], extra_issues: [], epic_error: null, extra_error: null });
    }

    let epicKey;
    try {
      epicKey = await resolveEpicKeyFromIssue(issueKey);
    } catch (e) {
      return res.json({
        issues: [],
        extra_issues: [],
        epic_error: e.message,
        extra_error: e.message,
      });
    }

    let issues = [];
    let extra_issues = [];
    let epic_error = null;
    let extra_error = null;

    try {
      issues = await fetchEpicDepositoMaterials(epicKey);
    } catch (e) {
      epic_error = e.message;
    }

    try {
      extra_issues = await fetchExtraPanolStockMaterials(epicKey);
    } catch (e) {
      extra_error = e.message;
    }

    res.json({ issues, extra_issues, epic_error, extra_error });
  } catch (e) {
    res.status(500).json({ issues: [], extra_issues: [], epic_error: e.message, extra_error: e.message });
  }
});

// ---------- Materiales (cualquier estado) en el mismo epic que una issue (para modal Recibir) ----------
app.get("/api/jira-material-in-epic", async (req, res) => {
  try {
    const issueKey = (req.query.issue_key || "").trim();
    if (!issueKey) return res.json({ issues: [] });
    const issueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=parent`);
    const parent = issueData?.fields?.parent;
    const epicKey = parent?.key || issueKey;
    const jql = `issuetype = "materiales" AND parent = "${epicKey}" ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=100&fields=summary,status,customfield_11143,customfield_11176,updated&jql=${encodeURIComponent(jql)}`
    );
    const rawIssues = data.issues || [];
    const issues = rawIssues.map(mapJiraMaterialToIssue);
    res.json({ issues });
  } catch (e) {
    res.status(500).json({ issues: [], error: e.message });
  }
});

// ---------- Materiales vinculados por issue link a una issue (ej. Factura); para modal Recibir ----------
app.get("/api/jira-material-linked-to-issue", async (req, res) => {
  try {
    const issueKey = (req.query.issue_key || "").trim();
    if (!issueKey) return res.json({ issues: [] });
    const issueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=issuelinks`);
    const links = issueData?.fields?.issuelinks || [];
    const linkedKeys = [];
    for (const link of links) {
      const inKey = link.inwardIssue?.key ?? (typeof link.inwardIssue === "string" ? link.inwardIssue : null);
      const outKey = link.outwardIssue?.key ?? (typeof link.outwardIssue === "string" ? link.outwardIssue : null);
      if (inKey === issueKey && outKey) linkedKeys.push(outKey);
      else if (outKey === issueKey && inKey) linkedKeys.push(inKey);
      else if (inKey && inKey !== issueKey) linkedKeys.push(inKey);
      else if (outKey && outKey !== issueKey) linkedKeys.push(outKey);
    }
    const uniqueKeys = [...new Set(linkedKeys)];
    if (uniqueKeys.length === 0) return res.json({ issues: [] });
    const jql = `issuetype = "materiales" AND key in (${uniqueKeys.map((k) => `"${k}"`).join(", ")}) ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=100&fields=summary,status,customfield_11143,customfield_11176,updated&jql=${encodeURIComponent(jql)}`
    );
    const rawIssues = data.issues || [];
    const issues = rawIssues.map(mapJiraMaterialToIssue);
    res.json({ issues });
  } catch (e) {
    res.status(500).json({ issues: [], error: e.message });
  }
});

// ---------- Materiales tipo "materiales" en el mismo sprint que la issue (ej. Orden de Compra; modal Recibir) ----------
app.get("/api/jira-materials-same-sprint-as", async (req, res) => {
  try {
    const issueKey = (req.query.issue_key || "").trim();
    if (!issueKey) return res.json({ issues: [], sprint_ids: [], jql_used: null, error: null });

    const fieldsParam = encodeURIComponent(JIRA_SPRINT_FIELD);
    const issueData = await jiraFetch(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fieldsParam}`
    );
    const rawSprint = issueData?.fields?.[JIRA_SPRINT_FIELD];
    const sprintIds = parseSprintIdsFromJiraField(rawSprint);
    if (sprintIds.length === 0) {
      return res.json({
        issues: [],
        sprint_ids: [],
        jql_used: null,
        error:
          "La actividad no tiene sprint asignado o no se pudo leer el campo Sprint. " +
          "Comprobá que la Orden de Compra esté en un sprint y, si hace falta, definí JIRA_SPRINT_FIELD en .env con el id del campo Sprint de tu Jira.",
      });
    }
    const jql = `issuetype = "materiales" AND sprint in (${sprintIds.join(", ")}) ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=100&fields=summary,status,customfield_11143,customfield_11176,updated&jql=${encodeURIComponent(jql)}`
    );
    const rawIssues = data.issues || [];
    const issues = rawIssues.map(mapJiraMaterialToIssue);
    res.json({ issues, sprint_ids: sprintIds, jql_used: jql, error: null });
  } catch (e) {
    res.status(500).json({ issues: [], sprint_ids: [], jql_used: null, error: e.message });
  }
});

// ---------- Debug: materiales vinculados a una issue (ver issuelinks que devuelve Jira) ----------
app.get("/api/debug/jira-material-linked-to-issue", async (req, res) => {
  const issueKey = (req.query.issue_key || "").trim();
  if (!issueKey) return res.status(400).json({ error: "Falta issue_key" });
  try {
    const issueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=issuelinks`);
    const links = issueData?.fields?.issuelinks || [];
    const linkedKeys = [];
    for (const link of links) {
      const inKey = link.inwardIssue?.key ?? (typeof link.inwardIssue === "string" ? link.inwardIssue : null);
      const outKey = link.outwardIssue?.key ?? (typeof link.outwardIssue === "string" ? link.outwardIssue : null);
      if (inKey === issueKey && outKey) linkedKeys.push(outKey);
      else if (outKey === issueKey && inKey) linkedKeys.push(inKey);
      else if (inKey && inKey !== issueKey) linkedKeys.push(inKey);
      else if (outKey && outKey !== issueKey) linkedKeys.push(outKey);
    }
    res.json({
      issue_key: issueKey,
      issuelinks_raw: links,
      linked_keys: [...new Set(linkedKeys)],
      error: null,
    });
  } catch (e) {
    res.json({ issue_key: issueKey, issuelinks_raw: null, linked_keys: [], error: e.message });
  }
});

// ---------- Materiales en depósito sin vincular a ninguna issue (para “añadir más” en Consumir) ----------
app.get("/api/jira-material-en-deposito-unlinked", async (req, res) => {
  try {
    const jql = `issuetype = "materiales" AND status = "En deposito" ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=100&fields=summary,status,customfield_11143,customfield_11176,updated,issuelinks&jql=${encodeURIComponent(jql)}`
    );
    const rawIssues = (data.issues || []).filter((i) => {
      const links = i.fields?.issuelinks;
      return !links || links.length === 0;
    });
    const issues = rawIssues.map(mapJiraMaterialToIssue);
    res.json({ issues });
  } catch (e) {
    res.status(500).json({ issues: [], error: e.message });
  }
});

// ---------- Todas las actividades tipo materiales en depósito (con o sin parent/epic; para “añadir más” en Consumir) ----------
app.get("/api/jira-material-en-deposito-all", async (req, res) => {
  try {
    const jqlMaterials = `issuetype = "materiales" AND status = "En deposito" ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=100&fields=summary,status,customfield_11143,customfield_11176,updated,parent&jql=${encodeURIComponent(jqlMaterials)}`
    );
    const rawIssues = data.issues || [];
    const epicKeys = [...new Set(rawIssues.map((i) => i.fields?.parent?.key).filter(Boolean))];
    let epicsWithProblemaDetalle = new Set();
    if (epicKeys.length > 0) {
      const typesJQL = PROBLEMA_DETALLE_ISSUE_TYPES.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(", ");
      const jqlProblemaDetalle = `parent in (${epicKeys.join(", ")}) AND issuetype in (${typesJQL})`;
      const resProblema = await jiraFetch(
        `/rest/api/3/search/jql?maxResults=500&fields=parent&jql=${encodeURIComponent(jqlProblemaDetalle)}`
      );
      const issuesProblema = resProblema?.issues || [];
      for (const i of issuesProblema) {
        const pk = i.fields?.parent?.key;
        if (pk) epicsWithProblemaDetalle.add(pk);
      }
    }
    const filtered = rawIssues.filter((i) => {
      const parentKey = i.fields?.parent?.key;
      if (!parentKey) return true;
      return !epicsWithProblemaDetalle.has(parentKey);
    });
    const issues = filtered.map(mapJiraMaterialToIssue);
    res.json({ issues });
  } catch (e) {
    res.status(500).json({ issues: [], error: e.message });
  }
});

// ---------- Opciones del campo customfield_10813 (select list) para la transición a Entregado ----------
app.get("/api/jira-field-10813-options", async (_req, res) => {
  const fieldId = "customfield_10813";
  try {
    const envOpts = process.env.JIRA_FIELD_10813_OPTIONS;
    if (envOpts && typeof envOpts === "string" && envOpts.trim()) {
      try {
        const parsed = JSON.parse(envOpts);
        const arr = Array.isArray(parsed) ? parsed : (parsed.options || parsed.values || []);
        const options = arr.map((o) => ({
          id: String(o.id ?? o.value ?? ""),
          value: String(o.value ?? o.name ?? o.id ?? ""),
          name: String(o.name ?? o.value ?? o.id ?? ""),
        })).filter((o) => o.id || o.value || o.name);
        if (options.length > 0) return res.json({ options });
      } catch { /* ignore invalid JSON */ }
    }

    const options = [];

    const contextsRes = await jiraFetch(`/rest/api/3/field/${fieldId}/context`).catch(() => ({}));
    const contexts = Array.isArray(contextsRes) ? contextsRes : (contextsRes?.values ?? contextsRes?.results ?? []);
    for (const ctx of contexts) {
      const ctxId = ctx.id;
      if (!ctxId) continue;
      try {
        const optsRes = await jiraFetch(`/rest/api/3/field/${fieldId}/context/${ctxId}/option?maxResults=100`);
        const opts = optsRes?.values ?? optsRes?.results ?? optsRes?.options ?? (Array.isArray(optsRes) ? optsRes : []);
        for (const o of opts) {
          const id = o.id ?? o.optionId;
          const value = o.value ?? o.name;
          const name = o.value ?? o.name ?? o.id;
          if (id != null || value != null || name != null) {
            options.push({ id: String(id ?? value ?? name ?? ""), value: String(value ?? name ?? id ?? ""), name: String(name ?? value ?? id ?? "") });
          }
        }
      } catch {
        // ignore context without options
      }
    }

    if (options.length > 0) {
      const seen = new Set();
      const unique = options.filter((o) => { const k = o.id || o.value; if (seen.has(k)) return false; seen.add(k); return true; });
      return res.json({ options: unique });
    }

    const jql = `issuetype = "materiales" AND status = "En deposito" ORDER BY updated DESC`;
    const searchRes = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=1&fields=summary&jql=${encodeURIComponent(jql)}`
    );
    const issues = searchRes.issues || [];
    if (issues.length === 0) {
      return res.json({ options: [], hint: "No hay issues tipo materiales en depósito. No se pudieron cargar opciones por contexto." });
    }
    const sampleKey = issues[0].key;
    const transData = await jiraFetch(
      `/rest/api/3/issue/${encodeURIComponent(sampleKey)}/transitions?expand=transitions.fields`
    );
    const transitions = transData.transitions || [];
    const entregado = transitions.find((t) => t.to && /entregado/i.test(t.to.name || ""));
    if (!entregado || !entregado.fields) {
      return res.json({ options: [], hint: "No se encontró transición a Entregado o no tiene campos." });
    }
    const field = entregado.fields[fieldId];
    if (!field) {
      return res.json({ options: [], hint: "El campo customfield_10813 no está en la pantalla de transición a Entregado." });
    }
    const allowedValues = field.allowedValues || field.schema?.allowedValues || [];
    const fromTransition = allowedValues.map((v) => ({
      id: String(v.id ?? v.value ?? ""),
      value: String(v.value ?? v.name ?? v.id ?? ""),
      name: String(v.name ?? v.value ?? v.id ?? ""),
    })).filter((o) => o.id || o.value || o.name);
    if (fromTransition.length > 0) {
      return res.json({ options: fromTransition });
    }

    const createMetaRes = await jiraFetch(
      `/rest/api/3/issue/createmeta?projectKeys=STOCK&issuetypeNames=materiales&expand=projects.issuetypes.fields`
    ).catch(() => null);
    if (createMetaRes?.projects?.length > 0) {
      const fields = createMetaRes.projects[0].issuetypes?.[0]?.fields || {};
      const metaField = fields[fieldId];
      const metaAllowed = metaField?.allowedValues || metaField?.autoCompleteUrl ? [] : [];
      const fromMeta = metaAllowed.map((v) => ({
        id: String(v.id ?? v.value ?? ""),
        value: String(v.value ?? v.name ?? v.id ?? ""),
        name: String(v.name ?? v.value ?? v.id ?? ""),
      })).filter((o) => o.id || o.value || o.name);
      if (fromMeta.length > 0) return res.json({ options: fromMeta });
    }

    res.json({ options: [], hint: "No se pudieron cargar opciones. Abrí /api/debug/jira-field-10813 en el navegador para ver la respuesta de Jira." });
  } catch (e) {
    res.status(500).json({ options: [], error: e.message });
  }
});

// ---------- Opciones del campo customfield_11442 (unidad; select list) ----------
app.get("/api/jira-field-11442-options", async (_req, res) => {
  const fieldId = "customfield_11442";
  try {
    const options = [];
    const contextsRes = await jiraFetch(`/rest/api/3/field/${fieldId}/context`).catch(() => ({}));
    const contexts = Array.isArray(contextsRes) ? contextsRes : (contextsRes?.values ?? contextsRes?.results ?? []);
    for (const ctx of contexts) {
      const ctxId = ctx.id;
      if (!ctxId) continue;
      try {
        const optsRes = await jiraFetch(`/rest/api/3/field/${fieldId}/context/${ctxId}/option?maxResults=200`);
        const opts = optsRes?.values ?? optsRes?.results ?? optsRes?.options ?? (Array.isArray(optsRes) ? optsRes : []);
        for (const o of opts) {
          const id = o.id ?? o.optionId;
          const value = o.value ?? o.name;
          const name = o.value ?? o.name ?? o.id;
          if (id != null || value != null || name != null) {
            options.push({
              id: String(id ?? value ?? name ?? ""),
              value: String(value ?? name ?? id ?? ""),
              name: String(name ?? value ?? id ?? ""),
            });
          }
        }
      } catch {
        // ignore context errors
      }
    }
    const seen = new Set();
    const unique = options.filter((o) => {
      const k = o.id || o.value;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (unique.length > 0) return res.json({ options: unique });
    return res.json({ options: [], hint: "No se pudieron obtener opciones para customfield_11442." });
  } catch (e) {
    res.status(500).json({ options: [], error: e.message });
  }
});

// ---------- Diagnóstico: estructura del campo 10813 y transición Entregado ----------
app.get("/api/debug/jira-field-10813", async (_req, res) => {
  const fieldId = "customfield_10813";
  const result = { contexts: null, transition_field: null, sample_issue: null, error: null };
  try {
    const contextsRes = await jiraFetch(`/rest/api/3/field/${fieldId}/context`).catch(() => null);
    result.contexts = contextsRes;

    const jql = `issuetype = "materiales" AND status = "En deposito" ORDER BY updated DESC`;
    const searchRes = await jiraFetch(`/rest/api/3/search/jql?maxResults=1&fields=summary&jql=${encodeURIComponent(jql)}`);
    const issues = searchRes.issues || [];
    if (issues.length > 0) {
      result.sample_issue = issues[0].key;
      const transData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issues[0].key)}/transitions?expand=transitions.fields`);
      const entregado = (transData.transitions || []).find((t) => t.to && /entregado/i.test(t.to.name || ""));
      if (entregado && entregado.fields) {
        result.transition_field = entregado.fields[fieldId] || null;
        result.transition_field_keys = Object.keys(entregado.fields || {});
      }
    }
  } catch (e) {
    result.error = e.message;
  }
  res.json(result);
});

// ---------- Diagnóstico: listar nombres exactos de estados en Jira (issues tipo "materiales") ----------
app.get("/api/debug/jira-statuses", async (_req, res) => {
  try {
    const jql = `issuetype = "materiales" ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=100&fields=status&jql=${encodeURIComponent(jql)}`
    );
    const issues = data.issues || [];
    const statusNames = [...new Set(issues.map((i) => i.fields?.status?.name).filter(Boolean))].sort();
    res.json({
      ok: true,
      total_issues: issues.length,
      statuses_in_jira: statusNames,
      hint: "Usá estos nombres exactos en la Edge Function (normalizeStatus) y en las JQL si hace falta.",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Diagnóstico: probar JQL de materiales en depósito ----------
app.get("/api/debug/jira-material-en-deposito", async (req, res) => {
  const materialCode = (req.query.material_code || "").trim();
  const result = { material_code: materialCode, steps: [] };

  try {
    const jql1 = `issuetype = "materiales" ORDER BY updated DESC`;
    result.steps.push({ step: "1_buscar_tipo_materiales", jql: jql1 });
    const data1 = await jiraFetch(
      `/rest/api/3/search/jql?maxResults=3&fields=summary,status,issuetype,customfield_11143,customfield_11176&jql=${encodeURIComponent(jql1)}`
    );
    const issues1 = (data1.issues || []).map((i) => ({
      key: i.key,
      summary: i.fields?.summary,
      status: i.fields?.status?.name,
      issuetype: i.fields?.issuetype?.name,
      customfield_11143: i.fields?.customfield_11143,
      customfield_11176: i.fields?.customfield_11176,
    }));
    result.steps[0].total = data1.total ?? 0;
    result.steps[0].sample = issues1;

    if (issues1.length > 0) {
      const sampleStatus = issues1[0].status;
      const sampleCf = issues1[0].customfield_11143;
      result.steps[0].hint = `Estado encontrado: "${sampleStatus}", campo 11143: "${sampleCf}". Usá estos valores exactos para ajustar la JQL si difieren.`;
    }
  } catch (e) {
    result.steps.push({ step: "1_buscar_tipo_materiales", error: e.message });
  }

  if (materialCode) {
    try {
      const jql2 = `issuetype = "materiales" AND cf[11143] ~ "${materialCode}" ORDER BY updated DESC`;
      result.steps.push({ step: "2_filtrar_por_codigo", jql: jql2 });
      const data2 = await jiraFetch(
        `/rest/api/3/search/jql?maxResults=5&fields=summary,status,customfield_11143,customfield_11176&jql=${encodeURIComponent(jql2)}`
      );
      const issues2 = (data2.issues || []).map((i) => ({
        key: i.key,
        summary: i.fields?.summary,
        status: i.fields?.status?.name,
        customfield_11143: i.fields?.customfield_11143,
        customfield_11176: i.fields?.customfield_11176,
      }));
      result.steps[result.steps.length - 1].total = data2.total ?? 0;
      result.steps[result.steps.length - 1].sample = issues2;
    } catch (e) {
      result.steps.push({ step: "2_filtrar_por_codigo", error: e.message, hint: "Si falla con cf[11143], probá con el nombre del campo entre comillas en JQL." });
    }

    try {
      const jql3 = `issuetype = "materiales" AND cf[11143] ~ "${materialCode}" AND status = "En deposito" ORDER BY updated DESC`;
      result.steps.push({ step: "3_filtrar_codigo_y_estado", jql: jql3 });
      const data3 = await jiraFetch(
        `/rest/api/3/search/jql?maxResults=5&fields=summary,status,customfield_11143,customfield_11176&jql=${encodeURIComponent(jql3)}`
      );
      const issues3 = (data3.issues || []).map((i) => ({
        key: i.key,
        summary: i.fields?.summary,
        status: i.fields?.status?.name,
        customfield_11143: i.fields?.customfield_11143,
        customfield_11176: i.fields?.customfield_11176,
      }));
      result.steps[result.steps.length - 1].total = data3.total ?? 0;
      result.steps[result.steps.length - 1].sample = issues3;
    } catch (e) {
      result.steps.push({ step: "3_filtrar_codigo_y_estado", error: e.message });
    }
  }

  res.json(result);
});

// ---------- Consumir: meter materiales en el epic (parent), vincular solo con la tarea, y transición a Entregado ----------
// same_epic_consumptions y material_consumptions: opcional { [issueKey]: number }. Splits parciales: proyecto del epic (parent); material extra en otro proyecto: clon en proyecto de la actividad y descuento en el original.
app.post("/api/link-material-to-activity", async (req, res) => {
  try {
    const { link_to_issue_key, material_issue_keys, same_epic_keys, customfield_10813, same_epic_consumptions, material_consumptions } = req.body || {};
    if (!link_to_issue_key || !Array.isArray(material_issue_keys) || material_issue_keys.length === 0) {
      return res.status(400).json({ error: "Faltan link_to_issue_key o material_issue_keys (array no vacío)" });
    }
    const keys = material_issue_keys.filter((k) => k && typeof k === "string");
    if (keys.length === 0) return res.status(400).json({ error: "material_issue_keys debe tener al menos una key válida" });

    const ensuredActivity = await ensureEpicForActivity(link_to_issue_key);
    const epicKey = ensuredActivity.epicKey;
    const isTask = link_to_issue_key !== epicKey;
    const activityProjectKey = ensuredActivity.projectKey || ((link_to_issue_key && link_to_issue_key.split("-")[0]) || "STOCK");

    const epicIssueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(epicKey)}?fields=project`);
    const epicProjectKey = epicIssueData?.fields?.project?.key || activityProjectKey;

    const sameSet = new Set(Array.isArray(same_epic_keys) ? same_epic_keys.filter((k) => k && typeof k === "string") : []);
    const consumptions = { ...(same_epic_consumptions && typeof same_epic_consumptions === "object" ? same_epic_consumptions : {}), ...(material_consumptions && typeof material_consumptions === "object" ? material_consumptions : {}) };

    const cfStockField = `customfield_${JIRA_STOCK_LABEL_FIELD_ID}`;

    // Validar consumos parciales para todos los keys con cantidad indicada (mismo epic y "añadir más")
    const infoByKey = {};
    for (const key of keys) {
      const raw = consumptions[key];
      const toConsume = raw != null && raw !== "" ? Number(raw) : null;
      if (toConsume === null || toConsume === undefined) continue;
      const issueRes = await jiraFetch(
        `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,customfield_11143,customfield_11176,project`
      );
      const fields = issueRes?.fields || {};
      const currentQty = parseQuantityFromIssue(fields);
      const materialProjectKey = fields?.project?.key || key.split("-")[0];
      infoByKey[key] = {
        currentQty,
        summary: fields.summary ?? "",
        materialCode: (fields.customfield_11143 ?? "").toString().trim(),
        materialProjectKey,
      };
      if (toConsume <= 0) {
        return res.status(400).json({
          error: `La cantidad a consumir debe ser mayor a 0. En ${key} indicaste ${toConsume}.`,
          validation_key: key,
        });
      }
      if (toConsume > currentQty) {
        return res.status(400).json({
          error: `No se puede consumir más de lo disponible. En ${key} la cantidad disponible es ${currentQty} y querés consumir ${toConsume}. La cantidad del material nunca puede quedar menor a cero.`,
          validation_key: key,
          available: currentQty,
          requested: toConsume,
        });
      }
    }

    // Construir lista de keys a vincular y transicionar: splits parciales, clon cross-project para material extra, etc.
    let keysToLinkAndTransition = [...keys];
    const createdPartialKeys = [];
    const crossProjectHandled = new Set();
    const skipParentToEpic = new Set();

    // Material extra (no está en el epic de la actividad) y en otro proyecto que la actividad: clonar en proyecto de la actividad con la cantidad entregada y descontar el original (0 si se entrega todo).
    for (const materialKey of keys) {
      if (sameSet.has(materialKey)) continue;
      const info = infoByKey[materialKey];
      if (!info || info.materialProjectKey === activityProjectKey) continue;

      const toConsume = consumptions[materialKey] != null && consumptions[materialKey] !== "" ? Number(consumptions[materialKey]) : null;
      if (toConsume == null || toConsume <= 0) continue;

      const currentQty = info.currentQty;
      if (toConsume > currentQty) continue;

      const fullIssue = await jiraFetch(
        `/rest/api/3/issue/${encodeURIComponent(materialKey)}?fields=summary,customfield_11143,customfield_11176,project,description,${cfStockField}`
      );
      const originalFields = fullIssue.fields || {};
      const cloneFields = pickMaterialIssueFieldsForClone(originalFields);
      const createBody = buildCreateMaterialPayload(activityProjectKey, cloneFields, toConsume);
      const created = await jiraFetch(`/rest/api/3/issue`, { method: "POST", body: createBody });
      const newKey = created.key;
      await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(newKey)}`, {
        method: "PUT",
        body: { fields: { parent: { key: epicKey } } },
      });

      const remaining = currentQty - toConsume;
      await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(materialKey)}`, {
        method: "PUT",
        body: { fields: { customfield_11176: String(remaining) } },
      });

      keysToLinkAndTransition = keysToLinkAndTransition.map((k) => (k === materialKey ? newKey : k));
      crossProjectHandled.add(materialKey);
      skipParentToEpic.add(newKey);
      createdPartialKeys.push({
        original: materialKey,
        new: newKey,
        consumed: toConsume,
        remaining,
        cross_project_extra_clone: true,
        activity_project: activityProjectKey,
        original_project: info.materialProjectKey,
      });
    }

    // Consumo parcial (mismo epic o extra en el mismo proyecto que la actividad): nueva issue en el proyecto del epic y parent = epic
    for (const materialKey of keys) {
      if (crossProjectHandled.has(materialKey)) continue;
      const toConsume = consumptions[materialKey] != null && consumptions[materialKey] !== "" ? Number(consumptions[materialKey]) : null;
      const info = infoByKey[materialKey];
      if (info == null || toConsume == null || toConsume <= 0) continue;
      const currentQty = info.currentQty;
      const isPartial = toConsume < currentQty;
      if (!isPartial) continue;
      const { summary, materialCode } = info;
      const payload = {
        fields: {
          project: { key: epicProjectKey },
          summary: summary || `Material ${materialCode || ""} - ${toConsume}`,
          issuetype: { name: "materiales" },
          customfield_11143: materialCode || "",
          customfield_11176: String(toConsume),
        },
      };
      const created = await jiraFetch(`/rest/api/3/issue`, { method: "POST", body: payload });
      const newKey = created.key;
      await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(newKey)}`, {
        method: "PUT",
        body: { fields: { parent: { key: epicKey } } },
      });
      const remaining = currentQty - toConsume;
      await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(materialKey)}`, {
        method: "PUT",
        body: { fields: { customfield_11176: String(remaining) } },
      });
      keysToLinkAndTransition = keysToLinkAndTransition.map((k) => (k === materialKey ? newKey : k));
      createdPartialKeys.push({ original: materialKey, new: newKey, consumed: toConsume, remaining });
    }

    const keysToMoveToEpic = keysToLinkAndTransition.filter((k) => !sameSet.has(k) && !skipParentToEpic.has(k));

    let movedToEpic = 0;
    const moveErrors = [];
    let linked = 0;
    if (isTask) {
      const linkTypes = await jiraFetch("/rest/api/3/issueLinkType");
      const types = linkTypes?.issueLinkTypes || [];
      const linkName =
        types.find((t) => /relat/i.test(t.name))?.name ||
        types[0]?.name ||
        "Relates";
      for (const materialKey of keysToLinkAndTransition) {
        await jiraFetch(`/rest/api/3/issueLink`, {
          method: "POST",
          body: {
            type: { name: linkName },
            inwardIssue: { key: materialKey },
            outwardIssue: { key: link_to_issue_key }
          }
        });
        linked++;
      }
    }

    let transitioned = 0;
    const transitionErrors = [];
    const personalFieldErrors = [];
    const personalFieldValue = (customfield_10813 !== undefined && customfield_10813 !== null && customfield_10813 !== "")
      ? (typeof customfield_10813 === "object" && customfield_10813 !== null && (customfield_10813.id != null)
          ? [{ id: String(customfield_10813.id) }]
          : [{ id: String(customfield_10813) }])
      : null;
    const transitionFields = personalFieldValue ? { customfield_10813: personalFieldValue } : null;
    const debugLog = {
      timestamp: new Date().toISOString(),
      request: {
        link_to_issue_key,
        material_issue_keys: keys,
        same_epic_keys: same_epic_keys || [],
        same_epic_consumptions: consumptions,
        customfield_10813_sent: customfield_10813 != null ? String(customfield_10813) : null,
        transition_fields_sent: transitionFields,
      },
      epic_key: epicKey,
      epic_project_key: epicProjectKey,
      ensured_epic_created_for_activity: ensuredActivity.epicCreated,
      is_task: isTask,
      activity_project_for_new_issues: activityProjectKey,
      skip_parent_to_epic_keys: [...skipParentToEpic],
      partial_creates: createdPartialKeys,
      move_results: [],
      transition_results: [],
      personal_field_results: [],
    };
    for (const materialKey of keysToMoveToEpic) {
      try {
        await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(materialKey)}`, {
          method: "PUT",
          body: { fields: { parent: { key: epicKey } } },
        });
        movedToEpic++;
        debugLog.move_results.push({ key: materialKey, success: true });
      } catch (e) {
        moveErrors.push({ key: materialKey, reason: e.message });
        debugLog.move_results.push({ key: materialKey, success: false, error: e.message });
      }
    }
    for (const materialKey of keysToLinkAndTransition) {
      try {
        if (transitionFields && transitionFields.customfield_10813) {
          try {
            await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(materialKey)}`, {
              method: "PUT",
              body: { fields: { customfield_10813: transitionFields.customfield_10813 } },
            });
            debugLog.personal_field_results.push({ key: materialKey, success: true });
          } catch (e) {
            personalFieldErrors.push({ key: materialKey, reason: e.message });
            debugLog.personal_field_results.push({ key: materialKey, success: false, error: e.message });
            debugLog.transition_results.push({ key: materialKey, success: false, skipped: true, reason: "No se transiciona: falló asignar personal" });
            continue;
          }
        }
        const result = await jiraTransitionToEntregado(materialKey, null);
        if (result.done) {
          transitioned++;
          debugLog.transition_results.push({ key: materialKey, success: true });
        } else {
          transitionErrors.push({ key: materialKey, reason: result.reason });
          debugLog.transition_results.push({ key: materialKey, success: false, reason: result.reason });
        }
      } catch (e) {
        transitionErrors.push({ key: materialKey, reason: e.message });
        debugLog.transition_results.push({ key: materialKey, success: false, error: e.message });
      }
    }

    const hasErrors = moveErrors.length > 0 || transitionErrors.length > 0 || personalFieldErrors.length > 0;
    res.json({
      ok: true,
      linked,
      moved_to_epic: movedToEpic,
      transitioned,
      link_to_issue_key,
      epic_key: epicKey,
      epic_project_key: epicProjectKey,
      ensured_epic_created_for_activity: ensuredActivity.epicCreated,
      linked_to_task_only: isTask,
      activity_project_for_new_issues: activityProjectKey,
      partial_creates: createdPartialKeys,
      move_errors: moveErrors,
      transition_errors: transitionErrors,
      personal_field_errors: personalFieldErrors,
      has_partial_errors: hasErrors,
      debug: debugLog,
    });
  } catch (e) {
    res.status(500).json({
      error: e.message,
      debug: { error: e.message, stack: process.env.NODE_ENV === "development" ? e.stack : undefined },
    });
  }
});

// ---------- Recibir: pasar materiales seleccionados a estado "En deposito" (modal Recibir) ----------
app.post("/api/receive-materials", async (req, res) => {
  try {
    const { compra_issue_key, material_issue_keys } = req.body || {};
    if (!compra_issue_key || !Array.isArray(material_issue_keys) || material_issue_keys.length === 0) {
      return res.status(400).json({ error: "Faltan compra_issue_key o material_issue_keys (array no vacío)" });
    }
    const keys = material_issue_keys.filter((k) => k && typeof k === "string");
    if (keys.length === 0) return res.status(400).json({ error: "material_issue_keys debe tener al menos una key válida" });

    let transitioned = 0;
    const errors = [];
    for (const materialKey of keys) {
      try {
        const result = await jiraTransitionToEnDeposito(materialKey);
        if (result.done) transitioned++;
        else errors.push({ key: materialKey, reason: result.reason });
      } catch (e) {
        errors.push({ key: materialKey, reason: e.message });
      }
    }
    const hasErrors = errors.length > 0;
    res.json({
      ok: true,
      compra_issue_key,
      transitioned,
      transition_errors: errors,
      has_partial_errors: hasErrors,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Corregir stock: actualizar cantidades de issues existentes por key ----------
app.post("/api/jira-material-quantities", async (req, res) => {
  try {
    const { updates, material_code } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "Falta updates (array no vacío)" });
    }

    const normalizedCode = (material_code || "").toString().trim().toUpperCase();
    let updated = 0;
    const errors = [];

    for (const row of updates) {
      const key = (row?.key || "").toString().trim();
      const n = Number(row?.quantity);
      if (!key) {
        errors.push({ key: null, reason: "Key inválida" });
        continue;
      }
      if (Number.isNaN(n)) {
        errors.push({ key, reason: "Cantidad inválida" });
        continue;
      }
      if (n < 0) {
        errors.push({ key, reason: "La nueva cantidad no puede ser menor a cero" });
        continue;
      }
      try {
        // Verificación simple de código para evitar editar una issue de otro material por error.
        const issueData = await jiraFetch(
          `/rest/api/3/issue/${encodeURIComponent(key)}?fields=customfield_11143,issuetype`
        );
        const issueType = (issueData?.fields?.issuetype?.name || "").toString().trim().toLowerCase();
        const issueCode = (issueData?.fields?.customfield_11143 || "").toString().trim().toUpperCase();
        if (issueType !== "materiales") {
          errors.push({ key, reason: "La issue no es de tipo materiales" });
          continue;
        }
        if (normalizedCode && issueCode && issueCode !== normalizedCode) {
          errors.push({ key, reason: `Código distinto al material seleccionado (${issueCode})` });
          continue;
        }

        await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}`, {
          method: "PUT",
          body: { fields: { customfield_11176: String(n) } },
        });
        updated++;
      } catch (e) {
        errors.push({ key, reason: e.message });
      }
    }

    res.json({
      ok: true,
      updated,
      errors,
      has_partial_errors: errors.length > 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Corregir stock: crear material en STOCK cuando no hay issues del código ----------
app.post("/api/jira-material-create", async (req, res) => {
  try {
    const { material_code, summary, quantity, unit_option_id, customfield_11145, customfield_11144 } = req.body || {};
    const code = (material_code || "").toString().trim();
    const name = (summary || "").toString().trim();
    const qty = Number(quantity);
    const unitId = (unit_option_id || "").toString().trim();
    const cf11145 = (customfield_11145 || "").toString().trim();
    const cf11144 = (customfield_11144 || "").toString().trim();

    if (!code || !name || Number.isNaN(qty) || !unitId) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: material_code, summary, quantity y unit_option_id.",
      });
    }
    if (qty < 0) {
      return res.status(400).json({
        error: "La cantidad no puede ser menor a cero.",
      });
    }

    const payload = {
      fields: {
        project: { key: "STOCK" },
        summary: name,
        issuetype: { name: "materiales" },
        customfield_11143: code,
        customfield_11176: String(qty),
        customfield_11442: { id: unitId },
      },
    };
    const cfStockField = `customfield_${JIRA_STOCK_LABEL_FIELD_ID}`;
    // Campo select list: preferir id de opción si está configurado; fallback por value.
    payload.fields[cfStockField] = JIRA_PANOL_STOCK_OPTION_ID
      ? { id: String(JIRA_PANOL_STOCK_OPTION_ID) }
      : { value: JIRA_PANOL_STOCK_LABEL };
    if (cf11145) {
      // Jira espera Atlassian Document Format (ADF) para este campo.
      payload.fields.customfield_11145 = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: cf11145 }],
          },
        ],
      };
    }
    if (cf11144) {
      // Este campo es select list: debe enviarse como objeto { id } o { name }.
      let selectValue = null;
      try {
        const parsed = JSON.parse(cf11144);
        if (parsed && typeof parsed === "object") {
          if (parsed.id != null && String(parsed.id).trim() !== "") {
            selectValue = { id: String(parsed.id).trim() };
          } else if (parsed.name != null && String(parsed.name).trim() !== "") {
            selectValue = { name: String(parsed.name).trim() };
          } else if (parsed.value != null && String(parsed.value).trim() !== "") {
            selectValue = { name: String(parsed.value).trim() };
          }
        }
      } catch {
        // si no es JSON válido, seguir con fallback por texto
      }
      if (!selectValue) {
        const raw = String(cf11144).trim();
        selectValue = /^\d+$/.test(raw) ? { id: raw } : { name: raw };
      }
      payload.fields.customfield_11144 = selectValue;
    }

    const created = await jiraFetch(`/rest/api/3/issue`, { method: "POST", body: payload });
    const newKey = created?.key;
    if (!newKey) throw new Error("Jira no devolvió la key de la issue creada.");

    const transition = await jiraTransitionToEnDeposito(newKey);
    if (!transition.done) {
      return res.status(500).json({
        error: `Se creó la issue ${newKey}, pero no se pudo pasar a En deposito.`,
        debug: {
          created_issue_key: newKey,
          transition_reason: transition.reason || "No hay transición disponible",
        },
      });
    }

    res.json({
      ok: true,
      key: newKey,
      transitioned_to_en_deposito: true,
      browse_url: JIRA_BASE_URL ? `${JIRA_BASE_URL.replace(/\/$/, "")}/browse/${newKey}` : null,
    });
  } catch (e) {
    res.status(500).json({
      error: e.message,
      debug: { error: e.message, stack: process.env.NODE_ENV === "development" ? e.stack : undefined },
    });
  }
});

// Rutas API inexistentes: siempre JSON (evita HTML en 404 y mensajes confusos en el front)
app.use((req, res) => {
  if (req.originalUrl.startsWith("/api")) {
    return res.status(404).json({ error: "Ruta API no encontrada", path: req.originalUrl });
  }
  res.status(404).type("text").send("Not found");
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  const host = process.env.RENDER_EXTERNAL_URL ? new URL(process.env.RENDER_EXTERNAL_URL).origin : `http://localhost:${PORT}`;
  console.log("API running on", host);
});
