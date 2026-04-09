// Supabase Edge Function: recibe webhook de Jira (issue_created / issue_updated),
// filtra por tipo "materiales" y hace upsert en jira_material_issues.
// Desplegar: supabase functions deploy stock-2 --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ISSUE_TYPE_MATERIALES = "materiales"; // Ajustar si en Jira tiene otro nombre
const CUSTOM_FIELD_MATERIAL_CODE = "customfield_11143";
const CUSTOM_FIELD_QUANTITY = "customfield_11176";
const CUSTOM_FIELD_UNIT = "customfield_11442"; // Unidad

/** Normaliza el nombre de estado de Jira a un valor canónico. */
function normalizeStatus(jiraStatus: string | null): string {
  if (!jiraStatus || typeof jiraStatus !== "string") return "";
  const s = jiraStatus.toLowerCase().trim();
  if (/cacheuta/.test(s)) return "en cacheuta";
  if (/dep[oó]sito|en dep/.test(s)) return "en deposito";
  if (/entregado/.test(s)) return "entregado";
  if (/solicitado/.test(s)) return "solicitado";
  return jiraStatus;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JiraWebhookPayload {
  webhookEvent?: string;
  issue?: {
    key: string;
    fields?: {
      issuetype?: { name?: string };
      status?: { name?: string };
      [key: string]: unknown;
    };
  };
}

async function fetchIssueFromJira(issueKey: string): Promise<{
  material_code: string | null;
  quantity: number | null;
  unit: string | null;
  status: string | null;
  issuetype: string | null;
  created: string | null;
  updated: string | null;
}> {
  const baseUrl = Deno.env.get("JIRA_BASE_URL")?.replace(/\/$/, "") ?? "";
  const email = Deno.env.get("JIRA_EMAIL");
  const token = Deno.env.get("JIRA_API_TOKEN");
  if (!baseUrl || !email || !token) {
    throw new Error("Missing JIRA_BASE_URL, JIRA_EMAIL or JIRA_API_TOKEN");
  }
  const auth = btoa(`${email}:${token}`);
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${issueKey}?fields=issuetype,status,${CUSTOM_FIELD_MATERIAL_CODE},${CUSTOM_FIELD_QUANTITY},${CUSTOM_FIELD_UNIT},created,updated`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    fields?: {
      issuetype?: { name?: string };
      status?: { name?: string };
      [key: string]: unknown;
    };
  };
  const fields = data.fields ?? {};
  const issuetype = fields.issuetype?.name ?? null;
  const status = fields.status?.name ?? null;
  const material_code =
    typeof fields[CUSTOM_FIELD_MATERIAL_CODE] === "string"
      ? (fields[CUSTOM_FIELD_MATERIAL_CODE] as string)
      : null;
  let quantity: number | null = null;
  const qRaw = fields[CUSTOM_FIELD_QUANTITY];
  if (typeof qRaw === "number" && !Number.isNaN(qRaw)) quantity = qRaw;
  else if (typeof qRaw === "string" && qRaw.trim() !== "") {
    const n = Number(qRaw.replace(",", "."));
    if (!Number.isNaN(n)) quantity = n;
  }
  const created =
    typeof (fields as { created?: string }).created === "string"
      ? (fields as { created: string }).created
      : null;
  const updated =
    typeof (fields as { updated?: string }).updated === "string"
      ? (fields as { updated: string }).updated
      : null;
  let unit: string | null = null;
  const u = fields[CUSTOM_FIELD_UNIT];
  if (typeof u === "string" && u.trim() !== "") unit = u.trim();
  else if (u && typeof u === "object" && "value" in u && typeof (u as { value: string }).value === "string")
    unit = (u as { value: string }).value;
  else if (u && typeof u === "object" && "name" in u && typeof (u as { name: string }).name === "string")
    unit = (u as { name: string }).name;
  return { material_code, quantity, unit, status, issuetype, created, updated };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: JiraWebhookPayload;
  try {
    body = (await req.json()) as JiraWebhookPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const event = body.webhookEvent ?? "";
  if (event !== "jira:issue_created" && event !== "jira:issue_updated") {
    return new Response(
      JSON.stringify({ ok: true, skipped: "event_not_relevant" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const issueKey = body.issue?.key;
  if (!issueKey) {
    return new Response(
      JSON.stringify({ error: "Missing issue.key" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let material_code: string | null;
  let quantity: number | null;
  let unit: string | null;
  let status: string | null;
  let jira_created_at: string | null;
  let jira_updated_at: string | null;

  const fields = body.issue?.fields;
  const issuetypeFromPayload = fields?.issuetype?.name;
  if (
    issuetypeFromPayload &&
    issuetypeFromPayload.toLowerCase() !== ISSUE_TYPE_MATERIALES.toLowerCase()
  ) {
    return new Response(
      JSON.stringify({ ok: true, skipped: "issuetype_not_materiales" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const fetched = await fetchIssueFromJira(issueKey);
    if (fetched.issuetype?.toLowerCase() !== ISSUE_TYPE_MATERIALES.toLowerCase()) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "issuetype_not_materiales" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    material_code = fetched.material_code;
    quantity = fetched.quantity;
    unit = fetched.unit;
    status = fetched.status;
    jira_created_at = fetched.created;
    jira_updated_at = fetched.updated;
  } catch (e) {
    console.error("Jira fetch error:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const row = {
    issue_key: issueKey,
    material_code: material_code ?? "",
    quantity: quantity ?? 0,
    status: normalizeStatus(status),
    created_at: jira_created_at ?? new Date().toISOString(),
    jira_updated_at: jira_updated_at ?? null,
    synced_at: new Date().toISOString(),
    unit: unit ?? null,
  };

  const { error } = await supabase.from("jira_material_issues").upsert(row, {
    onConflict: "issue_key",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("Supabase upsert error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, issue_key: issueKey }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
