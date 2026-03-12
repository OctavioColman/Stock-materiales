import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_URL != null
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, "")
  : ""; // En desarrollo Vite hace proxy de /api a localhost:3001

async function apiFetch(url, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("El backend no respondió con JSON. ¿Está corriendo? Ejecutá en la carpeta del proyecto: node server.js");
  }
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Respuesta inválida del servidor.");
  }
  return { ok: res.ok, status: res.status, data };
}
function IconTable({ className }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="22" fill="#2563eb" />
      <rect x="12" y="14" width="24" height="20" rx="1" stroke="white" strokeWidth="2" fill="none" />
      <line x1="12" y1="20" x2="36" y2="20" stroke="white" strokeWidth="2" />
      <line x1="20" y1="14" x2="20" y2="34" stroke="white" strokeWidth="2" />
      <line x1="28" y1="14" x2="28" y2="34" stroke="white" strokeWidth="2" />
      <line x1="12" y1="26" x2="36" y2="26" stroke="white" strokeWidth="2" />
      <line x1="12" y1="32" x2="36" y2="32" stroke="white" strokeWidth="2" />
    </svg>
  );
}

// Icono circular: gráfico de línea (eventos)
function IconChart({ className }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="22" fill="#2563eb" />
      <path d="M14 30 L20 22 L26 26 L34 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="14" cy="30" r="2" fill="white" />
      <circle cx="20" cy="22" r="2" fill="white" />
      <circle cx="26" cy="26" r="2" fill="white" />
      <circle cx="34" cy="18" r="2" fill="white" />
    </svg>
  );
}

// Selector de tema (derecha superior)
function ThemeToggle({ theme, onToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: "0.9rem", opacity: 0.9 }}>Tema</span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: "var(--header-bg)",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: "0.9rem",
        }}
      >
        {theme === "dark" ? "☀️ Claro" : "🌙 Oscuro"}
      </button>
    </div>
  );
}

// Modal genérico
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// Encabezado de tabla con ordenación: label + botón chevron que abre menú Ascendente/Descendente
function SortableTh({ columnKey, label, align, menuOpen, onToggleMenu, onSelectAsc, onSelectDesc, onCloseMenu, thStyle }) {
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onCloseMenu?.();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen, onCloseMenu]);
  return (
    <th ref={wrapRef} style={{ position: "relative", ...thStyle }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: align === "right" ? "flex-end" : "space-between", gap: 6 }}>
        <span>{label}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          style={{ padding: "2px 4px", border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", fontSize: "0.85rem" }}
          title="Ordenar"
          aria-label={`Ordenar por ${label}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ display: "block" }}><path d="M7 10l5 5 5-5z"/></svg>
        </button>
      </div>
      {menuOpen && (
        <div style={{ position: "absolute", top: "100%", right: align === "right" ? 0 : undefined, left: align === "left" ? 0 : undefined, marginTop: 2, padding: "4px 0", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", zIndex: 10, minWidth: 120 }}>
          <button type="button" onClick={() => { onSelectAsc(); onCloseMenu?.(); }} style={{ display: "block", width: "100%", padding: "6px 12px", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.9rem" }}>Ascendente</button>
          <button type="button" onClick={() => { onSelectDesc(); onCloseMenu?.(); }} style={{ display: "block", width: "100%", padding: "6px 12px", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.9rem" }}>Descendente</button>
        </div>
      )}
    </th>
  );
}

// Formulario de corrección (modelo B: crea actividad tipo "materiales" en Jira)
function FormularioCorreccion({ onClose, onSuccess }) {
  const [summary, setSummary] = useState("");
  const [materialQuery, setMaterialQuery] = useState("");
  const [materialOptions, setMaterialOptions] = useState([]);
  const [materialCode, setMaterialCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [issueQuery, setIssueQuery] = useState("");
  const [issueOptions, setIssueOptions] = useState([]);
  const [issueNextPageToken, setIssueNextPageToken] = useState(null);
  const [issueLoadingMore, setIssueLoadingMore] = useState(false);
  const [linkKey, setLinkKey] = useState("");
  const [selectedIssueDisplay, setSelectedIssueDisplay] = useState(null);
  const [issueDropdownOpen, setIssueDropdownOpen] = useState(false);
  const issueDropdownRef = useRef(null);
  const issueSearchInputRef = useRef(null);
  const [status, setStatus] = useState("");
  const [successResult, setSuccessResult] = useState(null); // { key, browse_url } después de crear

  const showMaterialSuggestions = materialQuery.trim() !== "" && materialOptions.length > 0 &&
    (materialCode === "" || materialQuery.trim().toUpperCase() !== materialCode.toUpperCase());

  useEffect(() => {
    const q = materialQuery.trim();
    if (!q) { setMaterialOptions([]); return; }
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/materials?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!alive) return;
        setMaterialOptions(data.materials || []);
      } catch { if (!alive) return; setMaterialOptions([]); }
    };
    run();
    return () => { alive = false; };
  }, [materialQuery]);

  useEffect(() => {
    if (materialOptions.length !== 1 || materialCode) return;
    const q = materialQuery.trim().toUpperCase();
    const one = materialOptions[0];
    if (one.material_code.toUpperCase() === q || one.material_code.toUpperCase().startsWith(q)) {
      setMaterialCode(one.material_code);
      setMaterialQuery(one.material_code);
      setSummary(one.material_name || "");
    }
  }, [materialOptions, materialQuery, materialCode]);

  useEffect(() => {
    if (!issueDropdownOpen) return;
    let alive = true;
    setIssueNextPageToken(null);
    const run = async () => {
      const params = new URLSearchParams({ query: issueQuery });
      const res = await fetch(`${API_BASE}/api/issues?${params.toString()}`);
      const data = await res.json();
      if (!alive) return;
      setIssueOptions(data.issues || []);
      setIssueNextPageToken(data.nextPageToken ?? null);
    };
    run();
    return () => { alive = false; };
  }, [issueDropdownOpen, issueQuery]);

  async function loadMoreIssues() {
    if (!issueNextPageToken || issueQuery.trim() !== "") return;
    setIssueLoadingMore(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/issues?query=&nextPageToken=${encodeURIComponent(issueNextPageToken)}`
      );
      const data = await res.json();
      setIssueOptions((prev) => [...prev, ...(data.issues || [])]);
      setIssueNextPageToken(data.nextPageToken ?? null);
    } finally { setIssueLoadingMore(false); }
  }

  useEffect(() => {
    if (issueDropdownOpen) {
      setIssueQuery("");
      setTimeout(() => issueSearchInputRef.current?.focus(), 50);
    }
  }, [issueDropdownOpen]);

  useEffect(() => {
    if (!issueDropdownOpen) return;
    function handleClick(e) {
      if (issueDropdownRef.current && !issueDropdownRef.current.contains(e.target)) setIssueDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [issueDropdownOpen]);

  const selectedIssue = selectedIssueDisplay || issueOptions.find((i) => i.key === linkKey);
  const canCreate = useMemo(() => {
    if (!summary.trim() || !materialCode.trim()) return false;
    if (quantity === "" || Number.isNaN(Number(quantity))) return false;
    return true;
  }, [summary, materialCode, quantity]);

  async function onCreate() {
    setStatus("Creando...");
    try {
      const res = await fetch(`${API_BASE}/api/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "correccion", summary, material_code: materialCode, quantity, link_to_issue_key: linkKey || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setStatus("");
      setSummary("");
      setQuantity("");
      setLinkKey("");
      setSelectedIssueDisplay(null);
      setSuccessResult({ key: data.key, browse_url: data.browse_url || null });
      setStatus(`✅ Actividad creada con éxito. Issue: ${data.key}. Podés rastrearla en Jira.`);
    } catch (e) {
      setStatus(`❌ ${e.message}`);
    }
  }

  const inputStyle = { width: "100%", background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "8px 10px" };
  const dropdownZ = { zIndex: 1050 };

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ opacity: 0.85, color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: 16 }}>
        La corrección crea una actividad de tipo &quot;materiales&quot; en Jira. Cantidad puede ser positiva o negativa. Vínculo con actividad opcional.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>Resumen *</label>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>Cantidad material *</label>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="ej: -3 o 5" style={inputStyle} />
        </div>
        <div style={{ position: "relative", ...dropdownZ }}>
          <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>Código material *</label>
          <input value={materialQuery} onChange={(e) => { setMaterialQuery(e.target.value); if (materialCode) setMaterialCode(""); }} placeholder="Escribí el código (ej: E084)" style={{ ...inputStyle, marginBottom: 0 }} autoComplete="off" />
          {showMaterialSuggestions && (
            <ul style={{ listStyle: "none", margin: 0, padding: "4px 0", border: "1px solid var(--border-color)", borderRadius: 4, background: "var(--input-bg)", maxHeight: 200, overflowY: "auto", position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
              {materialOptions.map((m) => (
                <li key={m.material_code} onClick={() => { setMaterialCode(m.material_code); setMaterialQuery(m.material_code); setSummary(m.material_name || ""); }} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--border-color)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                  <strong>{m.material_code}</strong> — {m.material_name} {m.product_type ? ` · ${m.product_type}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div ref={issueDropdownRef} style={{ position: "relative", ...dropdownZ }}>
          <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>Vincular con actividad (opcional)</label>
          <button type="button" onClick={() => setIssueDropdownOpen((o) => !o)} style={{ width: "100%", padding: "8px 12px", textAlign: "left", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: "pointer", fontSize: "1em" }}>
            {linkKey && selectedIssue ? `${selectedIssue.key} — ${selectedIssue.summary}` : "Seleccionar actividad"}
          </button>
          {issueDropdownOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", overflow: "hidden" }}>
              <input ref={issueSearchInputRef} type="text" value={issueQuery} onChange={(e) => setIssueQuery(e.target.value)} placeholder="Buscar..." style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "none", borderBottom: "1px solid var(--border-color)", outline: "none", background: "var(--input-bg)", color: "var(--text-primary)" }} onKeyDown={(e) => e.stopPropagation()} />
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 220, overflowY: "auto" }}>
                {issueOptions.length === 0 ? <li style={{ padding: "12px 10px", color: "var(--text-secondary)" }}>{issueQuery.trim() ? "No hay coincidencias" : "Escribí para buscar"}</li> : (
                  <>
                    {issueOptions.map((i) => (
                      <li key={i.key} onClick={() => { setLinkKey(i.key); setSelectedIssueDisplay(i); setIssueDropdownOpen(false); }} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--border-color)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                        {i.key} — {i.summary} [{i.project}]
                      </li>
                    ))}
                    {issueNextPageToken && !issueQuery.trim() && (
                      <li style={{ padding: 8, borderTop: "1px solid var(--border-color)" }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); loadMoreIssues(); }} disabled={issueLoadingMore} style={{ width: "100%", padding: "6px", background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}>{issueLoadingMore ? "Cargando…" : "Cargar más"}</button>
                      </li>
                    )}
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {successResult ? (
          <>
            <button type="button" onClick={() => { setSuccessResult(null); setStatus(""); onSuccess?.(); }} style={{ background: "var(--btn-bg)", color: "var(--btn-text)", border: "1px solid var(--border-color)", padding: "8px 16px", borderRadius: 8 }}>Cerrar</button>
            <span style={{ color: "var(--text-primary)" }}>{status}</span>
            {successResult.browse_url && (
              <a href={successResult.browse_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--btn-bg)", textDecoration: "underline" }}>Abrir en Jira</a>
            )}
          </>
        ) : (
          <>
            <button disabled={!canCreate} onClick={onCreate} style={{ background: "var(--btn-bg)", color: "var(--btn-text)", border: "1px solid var(--border-color)", padding: "8px 16px", borderRadius: 8 }}>Crear</button>
            {onClose && <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)" }}>Cancelar</button>}
            <span style={{ color: "var(--text-secondary)" }}>{status}</span>
          </>
        )}
      </div>
    </div>
  );
}

// Formulario Consumir: primero se elige la actividad; luego se listan materiales vinculados a ella y opcionalmente se añaden más (sin vincular a ningún epic).
function FormularioConsumo({ onClose, onSuccess }) {
  const [issueQuery, setIssueQuery] = useState("");
  const [issueOptions, setIssueOptions] = useState([]);
  const [issueNextPageToken, setIssueNextPageToken] = useState(null);
  const [issueLoadingMore, setIssueLoadingMore] = useState(false);
  const [linkKey, setLinkKey] = useState("");
  const [selectedIssueDisplay, setSelectedIssueDisplay] = useState(null);
  const [issueDropdownOpen, setIssueDropdownOpen] = useState(false);
  const issueDropdownRef = useRef(null);
  const issueSearchInputRef = useRef(null);
  const [status, setStatus] = useState("");
  const [linkedActivities, setLinkedActivities] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedError, setLinkedError] = useState("");
  const [unlinkedActivities, setUnlinkedActivities] = useState([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [unlinkedError, setUnlinkedError] = useState("");
  const [selectedUnlinkedKeys, setSelectedUnlinkedKeys] = useState([]);
  const [selectedLinkedKeys, setSelectedLinkedKeys] = useState([]);
  const [unlinkedSearchQuery, setUnlinkedSearchQuery] = useState("");
  const [field10813Options, setField10813Options] = useState([]);
  const [field10813Loading, setField10813Loading] = useState(false);
  const [selectedField10813, setSelectedField10813] = useState("");
  const [field10813Hint, setField10813Hint] = useState("");
  const [consumoDebug, setConsumoDebug] = useState(null);
  const [linkedConsumptionByKey, setLinkedConsumptionByKey] = useState({});
  const [unlinkedConsumptionByKey, setUnlinkedConsumptionByKey] = useState({});
  const [consumptionValidationError, setConsumptionValidationError] = useState("");

  useEffect(() => {
    let alive = true;
    setField10813Loading(true);
    setField10813Hint("");
    apiFetch("/api/jira-field-10813-options")
      .then(({ data }) => {
        if (!alive) return;
        setField10813Options(data?.options || []);
        if (!(data?.options?.length)) setField10813Hint(data?.hint || "No se pudieron cargar opciones.");
      })
      .catch(() => {
        if (!alive) return;
        setField10813Options([]);
        setField10813Hint("Error al cargar opciones.");
      })
      .finally(() => { if (alive) setField10813Loading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!issueDropdownOpen) return;
    let alive = true;
    setIssueNextPageToken(null);
    const run = async () => {
      const params = new URLSearchParams({ query: issueQuery });
      const res = await fetch(`${API_BASE}/api/issues?${params.toString()}`);
      const data = await res.json();
      if (!alive) return;
      setIssueOptions(data.issues || []);
      setIssueNextPageToken(data.nextPageToken ?? null);
    };
    run();
    return () => { alive = false; };
  }, [issueDropdownOpen, issueQuery]);

  async function loadMoreIssues() {
    if (!issueNextPageToken || issueQuery.trim() !== "") return;
    setIssueLoadingMore(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/issues?query=&nextPageToken=${encodeURIComponent(issueNextPageToken)}`
      );
      const data = await res.json();
      setIssueOptions((prev) => [...prev, ...(data.issues || [])]);
      setIssueNextPageToken(data.nextPageToken ?? null);
    } finally { setIssueLoadingMore(false); }
  }

  useEffect(() => {
    if (issueDropdownOpen) {
      setIssueQuery("");
      setTimeout(() => issueSearchInputRef.current?.focus(), 50);
    }
  }, [issueDropdownOpen]);

  useEffect(() => {
    if (!issueDropdownOpen) return;
    function handleClick(e) {
      if (issueDropdownRef.current && !issueDropdownRef.current.contains(e.target)) setIssueDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [issueDropdownOpen]);

  useEffect(() => {
    if (!linkKey) {
      setLinkedActivities([]);
      setLinkedError("");
      setLinkedConsumptionByKey({});
      return;
    }
    let alive = true;
    setLinkedLoading(true);
    setLinkedError("");
    apiFetch(`/api/jira-material-linked-to?issue_key=${encodeURIComponent(linkKey)}`)
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok && data?.error) setLinkedError(data.error);
        else setLinkedError("");
        setLinkedActivities(data?.issues || []);
        setSelectedLinkedKeys([]);
        setLinkedConsumptionByKey({});
      })
      .catch((e) => {
        if (!alive) return;
        setLinkedError(e.message || "Error de conexión");
        setLinkedActivities([]);
      })
      .finally(() => { if (alive) setLinkedLoading(false); });
    return () => { alive = false; };
  }, [linkKey]);

  useEffect(() => {
    if (!linkKey) {
      setUnlinkedActivities([]);
      setSelectedUnlinkedKeys([]);
      setUnlinkedError("");
      return;
    }
    let alive2 = true;
    setUnlinkedLoading(true);
    setUnlinkedError("");
    setSelectedUnlinkedKeys([]);
    setUnlinkedConsumptionByKey({});
    apiFetch("/api/jira-material-en-deposito-all")
      .then(({ ok, data }) => {
        if (!alive2) return;
        if (!ok && data?.error) setUnlinkedError(data.error);
        else setUnlinkedError("");
        setUnlinkedActivities(data?.issues || []);
      })
      .catch((e) => {
        if (!alive2) return;
        setUnlinkedError(e.message || "Error de conexión");
        setUnlinkedActivities([]);
      })
      .finally(() => { if (alive2) setUnlinkedLoading(false); });
    return () => { alive2 = false; };
  }, [linkKey]);

  function toggleUnlinkedKey(key) {
    setSelectedUnlinkedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  function toggleAllUnlinked() {
    const keys = filteredUnlinked.map((a) => a.key);
    const allSelected = keys.length > 0 && keys.every((k) => selectedUnlinkedKeys.includes(k));
    if (allSelected) setSelectedUnlinkedKeys((prev) => prev.filter((k) => !keys.includes(k)));
    else setSelectedUnlinkedKeys((prev) => [...new Set([...prev, ...keys])]);
  }

  function toggleLinkedKey(key) {
    setSelectedLinkedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }
  function setLinkedConsumption(key, value) {
    const n = value === "" ? "" : Number(value);
    setLinkedConsumptionByKey((prev) => (Number.isNaN(n) || n === "" ? { ...prev, [key]: value } : { ...prev, [key]: n }));
    setConsumptionValidationError("");
  }
  function setUnlinkedConsumption(key, value) {
    const n = value === "" ? "" : Number(value);
    setUnlinkedConsumptionByKey((prev) => (Number.isNaN(n) || n === "" ? { ...prev, [key]: value } : { ...prev, [key]: n }));
    setConsumptionValidationError("");
  }
  const unlinkedExcludingSameEpic = useMemo(() => {
    const linkedKeys = new Set((linkedActivities || []).map((a) => a.key));
    return (unlinkedActivities || []).filter((a) => !linkedKeys.has(a.key));
  }, [unlinkedActivities, linkedActivities]);
  const filteredUnlinked = useMemo(() => {
    const q = (unlinkedSearchQuery || "").trim().toLowerCase();
    if (!q) return unlinkedExcludingSameEpic;
    return unlinkedExcludingSameEpic.filter((a) => {
      const code = (a.material_code || "").toLowerCase();
      const name = (a.summary || "").toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [unlinkedExcludingSameEpic, unlinkedSearchQuery]);
  const linkedActivitiesByKey = useMemo(() => Object.fromEntries((linkedActivities || []).map((a) => [a.key, a])), [linkedActivities]);
  const unlinkedActivitiesByKey = useMemo(() => Object.fromEntries((unlinkedExcludingSameEpic || []).map((a) => [a.key, a])), [unlinkedExcludingSameEpic]);
  useEffect(() => {
    const activitiesByKey = Object.fromEntries((linkedActivities || []).map((a) => [a.key, a]));
    setLinkedConsumptionByKey((prev) => {
      let next = { ...prev };
      for (const key of selectedLinkedKeys) {
        const act = activitiesByKey[key];
        const maxQty = act?.quantity != null ? act.quantity : 0;
        if (maxQty > 0 && (prev[key] == null || prev[key] === "")) next[key] = maxQty;
      }
      return next;
    });
  }, [selectedLinkedKeys, linkedActivities]);
  useEffect(() => {
    const activitiesByKey = Object.fromEntries((unlinkedExcludingSameEpic || []).map((a) => [a.key, a]));
    setUnlinkedConsumptionByKey((prev) => {
      let next = { ...prev };
      for (const key of selectedUnlinkedKeys) {
        const act = activitiesByKey[key];
        const maxQty = act?.quantity != null ? act.quantity : 0;
        if (maxQty > 0 && (prev[key] == null || prev[key] === "")) next[key] = maxQty;
      }
      return next;
    });
  }, [selectedUnlinkedKeys, unlinkedExcludingSameEpic]);

  function toggleAllLinked() {
    if (selectedLinkedKeys.length === linkedActivities.length) setSelectedLinkedKeys([]);
    else setSelectedLinkedKeys(linkedActivities.map((a) => a.key));
  }

  const selectedIssue = selectedIssueDisplay || issueOptions.find((i) => i.key === linkKey);
  const totalSelected = selectedLinkedKeys.length + selectedUnlinkedKeys.length;
  const consumptionValid = useMemo(() => {
    for (const key of selectedLinkedKeys) {
      const act = linkedActivitiesByKey[key];
      const maxQty = act?.quantity != null ? act.quantity : 0;
      const val = linkedConsumptionByKey[key];
      const n = val === "" || val == null ? null : Number(val);
      if (maxQty <= 0) return { ok: false, key, msg: `Cantidad disponible en ${key} no es válida.` };
      if (n == null || n === "") return { ok: false, key, msg: `Indicá la cantidad a consumir para ${key}.` };
      if (Number.isNaN(n) || n <= 0) return { ok: false, key, msg: `La cantidad a consumir debe ser mayor a 0. En ${key} indicaste ${val}.` };
      if (n > maxQty) return { ok: false, key, msg: `No se puede consumir más de lo disponible. En ${key} la cantidad disponible es ${maxQty}. La cantidad del material nunca puede quedar menor a cero.` };
    }
    for (const key of selectedUnlinkedKeys) {
      const act = unlinkedActivitiesByKey[key];
      const maxQty = act?.quantity != null ? act.quantity : 0;
      const val = unlinkedConsumptionByKey[key];
      const n = val === "" || val == null ? null : Number(val);
      if (maxQty <= 0) return { ok: false, key, msg: `Cantidad disponible en ${key} no es válida.` };
      if (n == null || n === "") return { ok: false, key, msg: `Indicá la cantidad a consumir para ${key}.` };
      if (Number.isNaN(n) || n <= 0) return { ok: false, key, msg: `La cantidad a consumir debe ser mayor a 0. En ${key} indicaste ${val}.` };
      if (n > maxQty) return { ok: false, key, msg: `No se puede consumir más de lo disponible. En ${key} la cantidad disponible es ${maxQty}. La cantidad del material nunca puede quedar menor a cero.` };
    }
    return { ok: true };
  }, [selectedLinkedKeys, selectedUnlinkedKeys, linkedActivitiesByKey, unlinkedActivitiesByKey, linkedConsumptionByKey, unlinkedConsumptionByKey]);
  const canCreate = useMemo(() => {
    if (!linkKey) return false;
    if (totalSelected === 0) return false;
    if (!selectedField10813 || selectedField10813.trim() === "") return false;
    if (!consumptionValid.ok) return false;
    return true;
  }, [linkKey, totalSelected, selectedField10813, consumptionValid.ok]);

  async function onVincular() {
    const allKeys = [...selectedLinkedKeys, ...selectedUnlinkedKeys];
    setStatus("Vinculando y pasando a Entregado...");
    setConsumoDebug(null);
    try {
      const { ok, data } = await apiFetch("/api/link-material-to-activity", {
        method: "POST",
        body: {
          link_to_issue_key: linkKey,
          material_issue_keys: allKeys,
          same_epic_keys: selectedLinkedKeys,
          customfield_10813: selectedField10813.trim() || undefined,
          same_epic_consumptions: selectedLinkedKeys.length > 0
            ? Object.fromEntries(
                selectedLinkedKeys.map((k) => {
                  const act = linkedActivitiesByKey[k];
                  const maxQty = act?.quantity != null ? act.quantity : 0;
                  const val = linkedConsumptionByKey[k];
                  const n = val != null && val !== "" ? Number(val) : maxQty;
                  const clamped = Number.isNaN(n) ? maxQty : Math.min(maxQty, Math.max(0.001, n));
                  return [k, clamped];
                })
              )
            : undefined,
          material_consumptions: (() => {
            const linked = selectedLinkedKeys.length > 0 ? Object.fromEntries(
              selectedLinkedKeys.map((k) => {
                const act = linkedActivitiesByKey[k];
                const maxQty = act?.quantity != null ? act.quantity : 0;
                const val = linkedConsumptionByKey[k];
                const n = val != null && val !== "" ? Number(val) : maxQty;
                const clamped = Number.isNaN(n) ? maxQty : Math.min(maxQty, Math.max(0.001, n));
                return [k, clamped];
              })
            ) : {};
            const unlinked = selectedUnlinkedKeys.length > 0 ? Object.fromEntries(
              selectedUnlinkedKeys.map((k) => {
                const act = unlinkedActivitiesByKey[k];
                const maxQty = act?.quantity != null ? act.quantity : 0;
                const val = unlinkedConsumptionByKey[k];
                const n = val != null && val !== "" ? Number(val) : maxQty;
                const clamped = Number.isNaN(n) ? maxQty : Math.min(maxQty, Math.max(0.001, n));
                return [k, clamped];
              })
            ) : {};
            return { ...linked, ...unlinked };
          })(),
        },
      });
      if (!ok) {
        setConsumoDebug(data?.debug || { error: data?.error || "Error" });
        setStatus(`❌ ${data?.error || "Error"}`);
        return;
      }
      const hasErrors = data.has_partial_errors || (data.move_errors?.length > 0) || (data.transition_errors?.length > 0) || (data.personal_field_errors?.length > 0);
      if (hasErrors) {
        setConsumoDebug(data.debug || data);
        const errParts = [];
        if (data.move_errors?.length) errParts.push(`${data.move_errors.length} error(es) al mover al epic`);
        if (data.transition_errors?.length) errParts.push(`${data.transition_errors.length} error(es) al pasar a Entregado`);
        if (data.personal_field_errors?.length) errParts.push(`${data.personal_field_errors.length} error(es) al asignar personal`);
        setStatus(`⚠️ Completado con errores: ${errParts.join("; ")}. Revisá el log de debug abajo. El modal se mantiene abierto.`);
        return;
      }
      const parts = [];
      if (data.linked != null && data.linked > 0) parts.push(`${data.linked} vinculadas a la tarea`);
      if (data.linked === 0 && data.linked_to_task_only === false) parts.push("materiales en el epic (sin vínculo; la actividad seleccionada es el epic)");
      if (data.moved_to_epic != null && data.moved_to_epic > 0) parts.push(`${data.moved_to_epic} movidas al epic de la actividad`);
      if (data.transitioned != null) parts.push(`${data.transitioned} pasadas a Entregado (se descontarán del stock)`);
      setStatus(parts.length ? `✅ ${parts.join("; ")}.` : `✅ Listo.`);
      setLinkKey("");
      setSelectedIssueDisplay(null);
      setSelectedUnlinkedKeys([]);
      setSelectedLinkedKeys([]);
      setConsumoDebug(null);
      setLinkedConsumptionByKey({});
      setUnlinkedConsumptionByKey({});
      onSuccess?.();
    } catch (e) {
      setStatus(`❌ ${e.message}`);
      setConsumoDebug({ error: e.message });
    }
  }

  const inputStyle = { width: "100%", background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "8px 10px" };
  const dropdownZ = { zIndex: 1050 };

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div ref={issueDropdownRef} style={{ position: "relative", ...dropdownZ }}>
          <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>Actividad *</label>
          <button type="button" onClick={() => setIssueDropdownOpen((o) => !o)} style={{ width: "100%", padding: "8px 12px", textAlign: "left", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: "pointer", fontSize: "1em" }}>
            {linkKey && selectedIssue ? `${selectedIssue.key} — ${selectedIssue.summary}` : "Buscar y seleccionar actividad"}
          </button>
          {issueDropdownOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", overflow: "hidden" }}>
              <input ref={issueSearchInputRef} type="text" value={issueQuery} onChange={(e) => setIssueQuery(e.target.value)} placeholder="Buscar..." style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "none", borderBottom: "1px solid var(--border-color)", outline: "none", background: "var(--input-bg)", color: "var(--text-primary)" }} onKeyDown={(e) => e.stopPropagation()} />
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 220, overflowY: "auto" }}>
                {issueOptions.length === 0 ? <li style={{ padding: "12px 10px", color: "var(--text-secondary)" }}>{issueQuery.trim() ? "No hay coincidencias" : "Escribí para buscar"}</li> : (
                  <>
                    {issueOptions.map((i) => (
                      <li key={i.key} onClick={() => { setLinkKey(i.key); setSelectedIssueDisplay(i); setIssueDropdownOpen(false); }} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--border-color)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                        {i.key} — {i.summary} [{i.project}]
                      </li>
                    ))}
                    {issueNextPageToken && !issueQuery.trim() && (
                      <li style={{ padding: 8, borderTop: "1px solid var(--border-color)" }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); loadMoreIssues(); }} disabled={issueLoadingMore} style={{ width: "100%", padding: "6px", background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}>{issueLoadingMore ? "Cargando…" : "Cargar más"}</button>
                      </li>
                    )}
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>
            Personal *
          </label>
          {field10813Loading ? (
            <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Cargando opciones...</span>
          ) : (
            <>
              <select value={selectedField10813} onChange={(e) => setSelectedField10813(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: "1rem" }}>
                <option value="">Seleccionar personal</option>
                {field10813Options.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name || opt.value || opt.id}</option>
                ))}
              </select>
              {field10813Hint && (
                <div style={{ marginTop: 6, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {field10813Hint}
                  {" "}
                  <a href={`${API_BASE || (typeof window !== "undefined" ? window.location.origin : "")}/api/debug/jira-field-10813`} target="_blank" rel="noopener noreferrer">Diagnóstico (abrir en nueva pestaña)</a>
                </div>
              )}
            </>
          )}
        </div>
        {linkKey && (
          <>
            <div style={{ marginTop: 4 }}>
              <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 8, fontWeight: 600 }}>
                materiales del Epic
              </label>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>Si consumís menos que la cantidad total, se crea una actividad nueva (en el proyecto de la actividad seleccionada) y a la original se le resta lo consumido.</div>
              {linkedLoading ? (
                <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: "0.9rem" }}>Cargando...</div>
              ) : linkedError ? (
                <div style={{ padding: 12, color: "var(--error)", fontSize: "0.9rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>{linkedError}</div>
              ) : linkedActivities.length === 0 ? (
                <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: "0.9rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>No hay materiales en depósito en el mismo epic que esta actividad.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <button type="button" onClick={toggleAllLinked} style={{ padding: "4px 10px", fontSize: "0.85rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: "pointer" }}>
                      {selectedLinkedKeys.length === linkedActivities.length ? "Deseleccionar todo" : "Seleccionar todo"}
                    </button>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{selectedLinkedKeys.length} de {linkedActivities.length} seleccionadas</span>
                  </div>
                  <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>
                    {linkedActivities.map((a) => (
                      <div key={a.key} style={{ borderBottom: "1px solid var(--border-color)", padding: "8px 10px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                          <input type="checkbox" checked={selectedLinkedKeys.includes(a.key)} onChange={() => toggleLinkedKey(a.key)} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div><strong>{a.key}</strong> — {a.summary}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Código: {a.material_code || "—"} · Cantidad: {a.quantity ?? "—"} · Estado: {a.status}</div>
                          </div>
                        </label>
                        {selectedLinkedKeys.includes(a.key) && (
                          <div style={{ marginTop: 8, marginLeft: 26, display: "flex", alignItems: "center", gap: 8 }}>
                            <label style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                              Cantidad a consumir:
                              <input
                                type="number"
                                min={0}
                                step="any"
                                max={a.quantity != null ? a.quantity : undefined}
                                value={linkedConsumptionByKey[a.key] ?? a.quantity ?? ""}
                                onChange={(e) => setLinkedConsumption(a.key, e.target.value)}
                                style={{ width: 72, marginLeft: 6, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)" }}
                              />
                            </label>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>máx. {a.quantity ?? "—"}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 8, fontWeight: 600 }}>
                Añadir más material
              </label>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>Si consumís menos que la cantidad total, se crea una actividad nueva con esa cantidad (en el proyecto de la actividad seleccionada) y a la original se le resta lo consumido.</div>
              {unlinkedLoading ? (
                <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: "0.9rem" }}>Cargando...</div>
              ) : unlinkedError ? (
                <div style={{ padding: 12, color: "var(--error)", fontSize: "0.9rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>{unlinkedError}</div>
              ) : unlinkedExcludingSameEpic.length === 0 ? (
                <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: "0.9rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>{unlinkedActivities.length === 0 ? "No hay materiales en depósito." : "Todos los materiales en depósito ya figuran en el mismo epic arriba."}</div>
              ) : (
                <>
                  <input type="text" value={unlinkedSearchQuery} onChange={(e) => setUnlinkedSearchQuery(e.target.value)} placeholder="Buscar por código o nombre..." style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "8px 10px", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: "1rem" }} />
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <button type="button" onClick={toggleAllUnlinked} style={{ padding: "4px 10px", fontSize: "0.85rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: "pointer" }}>
                      {filteredUnlinked.length > 0 && selectedUnlinkedKeys.filter((k) => filteredUnlinked.some((a) => a.key === k)).length === filteredUnlinked.length ? "Deseleccionar todo" : "Seleccionar todo"}
                    </button>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{selectedUnlinkedKeys.filter((k) => filteredUnlinked.some((a) => a.key === k)).length} de {filteredUnlinked.length} seleccionadas{filteredUnlinked.length !== unlinkedExcludingSameEpic.length ? ` (${unlinkedExcludingSameEpic.length} en total)` : ""}</span>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>
                    {filteredUnlinked.length === 0 ? (
                      <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: "0.9rem" }}>Ningún material coincide con la búsqueda.</div>
                    ) : (
                      filteredUnlinked.map((a) => (
                        <div key={a.key} style={{ borderBottom: "1px solid var(--border-color)", padding: "8px 10px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                            <input type="checkbox" checked={selectedUnlinkedKeys.includes(a.key)} onChange={() => toggleUnlinkedKey(a.key)} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div><strong>{a.key}</strong> — {a.summary}</div>
                              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Código: {a.material_code || "—"} · Cantidad: {a.quantity ?? "—"}</div>
                            </div>
                          </label>
                          {selectedUnlinkedKeys.includes(a.key) && (
                            <div style={{ marginTop: 8, marginLeft: 26, display: "flex", alignItems: "center", gap: 8 }}>
                              <label style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                Cantidad a consumir:
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  max={a.quantity != null ? a.quantity : undefined}
                                  value={unlinkedConsumptionByKey[a.key] ?? a.quantity ?? ""}
                                  onChange={(e) => setUnlinkedConsumption(a.key, e.target.value)}
                                  style={{ width: 72, marginLeft: 6, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)" }}
                                />
                              </label>
                              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>máx. {a.quantity ?? "—"}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button disabled={!canCreate} onClick={onVincular} style={{ background: "var(--btn-bg)", color: "var(--btn-text)", border: "1px solid var(--border-color)", padding: "8px 16px", borderRadius: 8 }}>Consumir seleccionados</button>
        {onClose && <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)" }}>Cancelar</button>}
        {!consumptionValid.ok && consumptionValid.msg && (
          <span style={{ color: "var(--error)", fontSize: "0.9rem" }}>{consumptionValid.msg}</span>
        )}
        <span style={{ color: "var(--text-secondary)" }}>{status}</span>
      </div>
      {consumoDebug != null && (
        <div style={{ marginTop: 16, border: "1px solid var(--border-color)", borderRadius: 8, overflow: "hidden", background: "var(--input-bg)" }}>
          <div style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)" }}>Log de debug</div>
          <pre style={{ margin: 0, padding: 12, fontSize: "0.8rem", overflow: "auto", maxHeight: 320, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {JSON.stringify(consumoDebug, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Formulario Recibir: seleccionar Factura, listar materiales vinculados por issue link, pasar seleccionados a "En deposito"
function FormularioRecibir({ onClose, onSuccess }) {
  const [issueQuery, setIssueQuery] = useState("");
  const [issueOptions, setIssueOptions] = useState([]);
  const [issueNextPageToken, setIssueNextPageToken] = useState(null);
  const [issueLoadingMore, setIssueLoadingMore] = useState(false);
  const [facturaKey, setFacturaKey] = useState("");
  const [selectedFacturaDisplay, setSelectedFacturaDisplay] = useState(null);
  const [issueDropdownOpen, setIssueDropdownOpen] = useState(false);
  const issueDropdownRef = useRef(null);
  const issueSearchInputRef = useRef(null);
  const [status, setStatus] = useState("");
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [selectedKeys, setSelectedKeys] = useState([]);

  useEffect(() => {
    if (!issueDropdownOpen) return;
    let alive = true;
    setIssueNextPageToken(null);
    const run = async () => {
      const params = new URLSearchParams({ query: issueQuery });
      const res = await fetch(`${API_BASE}/api/issues-facturas?${params.toString()}`);
      const data = await res.json();
      if (!alive) return;
      setIssueOptions(data.issues || []);
      setIssueNextPageToken(data.nextPageToken ?? null);
    };
    run();
    return () => { alive = false; };
  }, [issueDropdownOpen, issueQuery]);

  async function loadMoreIssues() {
    if (!issueNextPageToken || issueQuery.trim() !== "") return;
    setIssueLoadingMore(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/issues-facturas?query=&nextPageToken=${encodeURIComponent(issueNextPageToken)}`
      );
      const data = await res.json();
      setIssueOptions((prev) => [...prev, ...(data.issues || [])]);
      setIssueNextPageToken(data.nextPageToken ?? null);
    } finally { setIssueLoadingMore(false); }
  }

  useEffect(() => {
    if (issueDropdownOpen) {
      setIssueQuery("");
      setTimeout(() => issueSearchInputRef.current?.focus(), 50);
    }
  }, [issueDropdownOpen]);

  useEffect(() => {
    if (!issueDropdownOpen) return;
    function handleClick(e) {
      if (issueDropdownRef.current && !issueDropdownRef.current.contains(e.target)) setIssueDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [issueDropdownOpen]);

  useEffect(() => {
    if (!facturaKey) {
      setMaterials([]);
      setMaterialsError("");
      setSelectedKeys([]);
      return;
    }
    let alive = true;
    setMaterialsLoading(true);
    setMaterialsError("");
    setSelectedKeys([]);
    apiFetch(`/api/jira-material-linked-to-issue?issue_key=${encodeURIComponent(facturaKey)}`)
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok && data?.error) setMaterialsError(data.error);
        else setMaterialsError("");
        setMaterials(data?.issues || []);
      })
      .catch((e) => {
        if (!alive) return;
        setMaterialsError(e.message || "Error de conexión");
        setMaterials([]);
      })
      .finally(() => { if (alive) setMaterialsLoading(false); });
    return () => { alive = false; };
  }, [facturaKey]);

  function toggleKey(key) {
    setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }
  function toggleAll() {
    if (selectedKeys.length === materials.length) setSelectedKeys([]);
    else setSelectedKeys(materials.map((a) => a.key));
  }

  const selectedFactura = selectedFacturaDisplay || issueOptions.find((i) => i.key === facturaKey);
  const canRecibir = facturaKey && selectedKeys.length > 0;

  async function onRecibir() {
    setStatus("Pasando a En depósito...");
    try {
      const { ok, data } = await apiFetch("/api/receive-materials", {
        method: "POST",
        body: { compra_issue_key: facturaKey, material_issue_keys: selectedKeys },
      });
      if (!ok) throw new Error(data?.error || "Error");
      const errCount = data.transition_errors?.length || 0;
      const done = data.transitioned || 0;
      if (errCount > 0) {
        setStatus(`⚠️ ${done} pasadas a En depósito; ${errCount} con error.`);
      } else {
        setStatus(`✅ ${done} material(es) pasados a En depósito.`);
        setFacturaKey("");
        setSelectedFacturaDisplay(null);
        setSelectedKeys([]);
        onSuccess?.();
      }
    } catch (e) {
      setStatus(`❌ ${e.message}`);
    }
  }

  const dropdownZ = { zIndex: 1050 };
  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div ref={issueDropdownRef} style={{ position: "relative", ...dropdownZ }}>
          <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>Factura *</label>
          <button type="button" onClick={() => setIssueDropdownOpen((o) => !o)} style={{ width: "100%", padding: "8px 12px", textAlign: "left", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: "pointer", fontSize: "1em" }}>
            {facturaKey && selectedFactura ? `${selectedFactura.key} — ${selectedFactura.summary}` : "Buscar y seleccionar factura"}
          </button>
          {issueDropdownOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", overflow: "hidden" }}>
              <input ref={issueSearchInputRef} type="text" value={issueQuery} onChange={(e) => setIssueQuery(e.target.value)} placeholder="Buscar..." style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "none", borderBottom: "1px solid var(--border-color)", outline: "none", background: "var(--input-bg)", color: "var(--text-primary)" }} onKeyDown={(e) => e.stopPropagation()} />
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 220, overflowY: "auto" }}>
                {issueOptions.length === 0 ? <li style={{ padding: "12px 10px", color: "var(--text-secondary)" }}>{issueQuery.trim() ? "No hay coincidencias" : "Escribí para buscar"}</li> : (
                  <>
                    {issueOptions.map((i) => (
                      <li key={i.key} onClick={() => { setFacturaKey(i.key); setSelectedFacturaDisplay(i); setIssueDropdownOpen(false); }} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--border-color)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                        {i.key} — {i.summary} [{i.project}]
                      </li>
                    ))}
                    {issueNextPageToken && !issueQuery.trim() && (
                      <li style={{ padding: 8, borderTop: "1px solid var(--border-color)" }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); loadMoreIssues(); }} disabled={issueLoadingMore} style={{ width: "100%", padding: "6px", background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}>{issueLoadingMore ? "Cargando…" : "Cargar más"}</button>
                      </li>
                    )}
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
        <div style={{ fontSize: "0.85rem", marginTop: -4 }}>
          <a href={`${API_BASE || (typeof window !== "undefined" ? window.location.origin : "")}/api/debug/issues-facturas`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-secondary)" }}>Diagnóstico Facturas (ver qué devuelve Jira)</a>
        </div>
        {facturaKey && (
          <div style={{ marginTop: 4 }}>
            <label style={{ color: "var(--text-primary)", display: "block", marginBottom: 8, fontWeight: 600 }}>
              Materiales vinculados a la factura
            </label>
            {materialsLoading ? (
              <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: "0.9rem" }}>Cargando...</div>
            ) : materialsError ? (
              <div style={{ padding: 12, color: "var(--error)", fontSize: "0.9rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>{materialsError}</div>
            ) : materials.length === 0 ? (
              <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: "0.9rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>No hay materiales vinculados a esta factura.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <button type="button" onClick={toggleAll} style={{ padding: "4px 10px", fontSize: "0.85rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: "pointer" }}>
                    {selectedKeys.length === materials.length ? "Deseleccionar todo" : "Seleccionar todo"}
                  </button>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{selectedKeys.length} de {materials.length} seleccionados</span>
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)" }}>
                  {materials.map((a) => (
                    <label key={a.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid var(--border-color)", cursor: "pointer" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                      <input type="checkbox" checked={selectedKeys.includes(a.key)} onChange={() => toggleKey(a.key)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div><strong>{a.key}</strong> — {a.summary}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Código: {a.material_code || "—"} · Cantidad: {a.quantity ?? "—"} · Estado: {a.status}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button disabled={!canRecibir} onClick={onRecibir} style={{ background: "var(--btn-bg)", color: "var(--btn-text)", border: "1px solid var(--border-color)", padding: "8px 16px", borderRadius: 8 }}>Recibir</button>
        {onClose && <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)" }}>Cancelar</button>}
        <span style={{ color: "var(--text-secondary)" }}>{status}</span>
      </div>
    </div>
  );
}

// Vista: Stock actual (tabla a la izquierda, acciones a la derecha)
function VistaStock() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [filterName, setFilterName] = useState("");
  const [openModal, setOpenModal] = useState(null); // null | "correccion" | "consumo" | "recibir"
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortColumn, setSortColumn] = useState(null); // "codigo" | "nombre" | "tipo_producto" | "unidad" | "stock"
  const [sortDirection, setSortDirection] = useState("asc"); // "asc" | "desc"
  const [openSortColumn, setOpenSortColumn] = useState(null); // qué columna tiene el menú abierto

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/api/stock`)
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return;
        setItems(data.items || []);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
        setItems([]);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    let list = items;
    const code = filterCode.trim().toLowerCase();
    const name = filterName.trim().toLowerCase();
    if (code) list = list.filter((r) => (r.material_code || "").toLowerCase().includes(code));
    if (name) list = list.filter((r) => (r.material_name || "").toLowerCase().includes(name));
    return list;
  }, [items, filterCode, filterName]);

  const sortedData = useMemo(() => {
    if (!sortColumn) return filtered;
    const key = sortColumn;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let va = a[key === "codigo" ? "material_code" : key === "nombre" ? "material_name" : key === "tipo_producto" ? "product_type" : key === "unidad" ? "unit" : "stock"];
      let vb = b[key === "codigo" ? "material_code" : key === "nombre" ? "material_name" : key === "tipo_producto" ? "product_type" : key === "unidad" ? "unit" : "stock"];
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (key === "stock") {
        va = Number(va);
        vb = Number(vb);
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb), undefined, { sensitivity: "base" }) * dir;
    });
  }, [filtered, sortColumn, sortDirection]);

  if (loading) return <div style={{ padding: 24, color: "var(--text-secondary)" }}>Cargando materiales...</div>;
  if (error) {
    const isFailedFetch = error === "Failed to fetch" || error.includes("fetch");
    return (
      <div style={{ padding: 24, maxWidth: 420 }}>
        <div style={{ color: "var(--error)", fontWeight: 600, marginBottom: 8 }}>Error: {error}</div>
        {isFailedFetch && (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", margin: 0 }}>
            No se pudo conectar con el servidor. Asegurate de tener el backend corriendo en el puerto 3001.
            <br />
            <span style={{ opacity: 0.9 }}>En la carpeta del proyecto ejecutá: <code style={{ background: "var(--hover-bg)", padding: "2px 6px", borderRadius: 4 }}>node server.js</code></span>
          </p>
        )}
      </div>
    );
  }

  const btnStyle = {
    padding: "14px 20px",
    fontSize: "1rem",
    borderRadius: 10,
    border: "1px solid var(--border-color)",
    background: "var(--card-bg)",
    color: "var(--text-primary)",
    cursor: "pointer",
    textAlign: "left",
    fontWeight: 500,
    width: "100%",
  };

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, display: "flex", gap: 24, minHeight: 0, flex: 1 }}>
      {/* Columna izquierda: tabla */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
            Código:
            <input value={filterCode} onChange={(e) => setFilterCode(e.target.value)} placeholder="Filtrar por código" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)", minWidth: 140 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
            Nombre:
            <input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Filtrar por nombre" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)", minWidth: 180 }} />
          </label>
          <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--btn-bg)", color: "var(--btn-text)", cursor: loading ? "not-allowed" : "pointer", fontWeight: 500 }}>
            Actualizar stock
          </button>
        </div>
        <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--card-bg)", flex: 1, minHeight: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text-primary)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-color)", background: "var(--table-header-bg)" }}>
                <SortableTh columnKey="codigo" label="Código" align="left" menuOpen={openSortColumn === "codigo"} onToggleMenu={() => setOpenSortColumn((c) => c === "codigo" ? null : "codigo")} onSelectAsc={() => { setSortColumn("codigo"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("codigo"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "12px 14px" }} />
                <SortableTh columnKey="nombre" label="Nombre" align="left" menuOpen={openSortColumn === "nombre"} onToggleMenu={() => setOpenSortColumn((c) => c === "nombre" ? null : "nombre")} onSelectAsc={() => { setSortColumn("nombre"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("nombre"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "12px 14px" }} />
                <SortableTh columnKey="tipo_producto" label="Tipo producto" align="left" menuOpen={openSortColumn === "tipo_producto"} onToggleMenu={() => setOpenSortColumn((c) => c === "tipo_producto" ? null : "tipo_producto")} onSelectAsc={() => { setSortColumn("tipo_producto"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("tipo_producto"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "12px 14px" }} />
                <SortableTh columnKey="stock" label="Stock" align="right" menuOpen={openSortColumn === "stock"} onToggleMenu={() => setOpenSortColumn((c) => c === "stock" ? null : "stock")} onSelectAsc={() => { setSortColumn("stock"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("stock"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "right", padding: "12px 14px" }} />
                <SortableTh columnKey="unidad" label="Unidad" align="left" menuOpen={openSortColumn === "unidad"} onToggleMenu={() => setOpenSortColumn((c) => c === "unidad" ? null : "unidad")} onSelectAsc={() => { setSortColumn("unidad"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("unidad"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "12px 14px" }} />
              </tr>
            </thead>
            <tbody>
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                    {items.length === 0 ? (
                      <>
                        No se recibieron materiales desde la base de datos.
                        <br />
                        <a href={`${API_BASE || (typeof window !== "undefined" ? window.location.origin : "")}/api/debug/stock`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.9rem", marginTop: 8, display: "inline-block" }}>Abrir diagnóstico de conexión (api/debug/stock)</a>
                      </>
                    ) : (
                      "No hay materiales que coincidan con los filtros."
                    )}
                  </td>
                </tr>
              ) : (
                sortedData.map((row) => (
                  <tr key={row.material_code} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{row.material_code}</td>
                    <td style={{ padding: "10px 14px" }}>{row.material_name}</td>
                    <td style={{ padding: "10px 14px" }}>{row.product_type || "—"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 500 }}>{row.stock}</td>
                    <td style={{ padding: "10px 14px" }}>{row.unit || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Columna derecha: acciones */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)", fontWeight: 600 }}>Crear movimiento</h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>Elegí el tipo de movimiento.</p>
        <button type="button" onClick={() => setOpenModal("correccion")} style={btnStyle}>
          📋 Corregir stock
        </button>
        <button type="button" onClick={() => setOpenModal("consumo")} style={btnStyle}>
          ➕ Consumir
        </button>
        <button type="button" onClick={() => setOpenModal("recibir")} style={btnStyle}>
          📥 Recibir
        </button>
      </div>

      <Modal open={openModal === "correccion"} onClose={() => setOpenModal(null)} title="Corregir stock">
        <FormularioCorreccion onClose={() => setOpenModal(null)} onSuccess={() => setOpenModal(null)} />
      </Modal>
      <Modal open={openModal === "consumo"} onClose={() => setOpenModal(null)} title="Consumir material">
        <FormularioConsumo onClose={() => setOpenModal(null)} onSuccess={() => setOpenModal(null)} />
      </Modal>
      <Modal open={openModal === "recibir"} onClose={() => setOpenModal(null)} title="Recibir material">
        <FormularioRecibir onClose={() => setOpenModal(null)} onSuccess={() => setOpenModal(null)} />
      </Modal>
    </div>
  );
}

// Calendario mensual (desde 2025) con eventos por día (jira_created_at)
function CalendarioEventos({ events, selectedDate, onSelectDate, monthYear, onMonthChange }) {
  const year = monthYear.year;
  const month = monthYear.month;
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const eventCountByDay = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      const d = e.jira_created_at ? e.jira_created_at.slice(0, 10) : "";
      if (d) map[d] = (map[d] || 0) + 1;
    });
    return map;
  }, [events]);

  const canPrev = year > 2025 || month > 1;
  const canNext = year < 2030 || month < 12;
  const prevMonth = () => {
    if (month === 1) onMonthChange({ year: year - 1, month: 12 });
    else onMonthChange({ year, month: month - 1 });
  };
  const nextMonth = () => {
    if (month === 12) onMonthChange({ year: year + 1, month: 1 });
    else onMonthChange({ year, month: month + 1 });
  };

  const weekDays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(<td key={`e-${i}`} style={{ padding: 4, border: "1px solid var(--border-color)", background: "var(--hover-bg)" }} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const count = eventCountByDay[dateStr] || 0;
    const isSelected = selectedDate === dateStr;
    cells.push(
      <td key={d} style={{ padding: 4, border: "1px solid var(--border-color)", verticalAlign: "top" }}>
        <button
          type="button"
          onClick={() => onSelectDate(dateStr)}
          style={{
            width: "100%",
            minHeight: 36,
            padding: 4,
            border: "none",
            borderRadius: 6,
            background: isSelected ? "rgba(37, 99, 235, 0.3)" : count ? "var(--hover-bg)" : "transparent",
            color: "var(--text-primary)",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          {d}
          {count > 0 && <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-secondary)" }}>{count}</span>}
        </button>
      </td>
    );
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    const rowCells = cells.slice(i, i + 7);
    while (rowCells.length < 7) rowCells.push(<td key={`pad-${i}-${rowCells.length}`} style={{ padding: 4, border: "1px solid var(--border-color)" }} />);
    rows.push(<tr key={i}>{rowCells}</tr>);
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" onClick={prevMonth} disabled={!canPrev} style={{ padding: "4px 10px", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: canPrev ? "pointer" : "not-allowed" }}>‹</button>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{new Date(year, month - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</span>
        <button type="button" onClick={nextMonth} disabled={!canNext} style={{ padding: "4px 10px", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", cursor: canNext ? "pointer" : "not-allowed" }}>›</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr>{weekDays.map((w) => <th key={w} style={{ padding: 4, textAlign: "center", color: "var(--text-secondary)", fontWeight: 600 }}>{w}</th>)}</tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

// Vista: Actividades materiales (modelo B: jira_material_issues)
function VistaEventos() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [materialCodeFilter, setMaterialCodeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [sortColumn, setSortColumn] = useState(null); // "issue_key" | "material_code" | "material_name" | "quantity" | "unit" | "status" | "jira_created_at" | "jira_updated_at"
  const [sortDirection, setSortDirection] = useState("asc");
  const [openSortColumn, setOpenSortColumn] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (materialCodeFilter.trim()) params.set("material_code", materialCodeFilter.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (dateFromFilter) params.set("from_date", dateFromFilter);
    if (dateToFilter) params.set("to_date", dateToFilter);
    fetch(`${API_BASE}/api/material-issues?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return;
        setEvents(data.events || []);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
        setEvents([]);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [materialCodeFilter, statusFilter, dateFromFilter, dateToFilter]);

  const filtered = useMemo(() => events, [events]);

  const sortedFiltered = useMemo(() => {
    if (!sortColumn) return filtered;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let va = a[sortColumn];
      let vb = b[sortColumn];
      if (sortColumn === "quantity") {
        va = Number(va);
        vb = Number(vb);
        return (va - vb) * dir;
      }
      if (sortColumn === "jira_created_at") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
        return (va - vb) * dir;
      }
      if (sortColumn === "jira_updated_at") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
        return (va - vb) * dir;
      }
      if (va == null) va = "";
      if (vb == null) vb = "";
      return String(va).localeCompare(String(vb), undefined, { sensitivity: "base" }) * dir;
    });
  }, [filtered, sortColumn, sortDirection]);

  const byDate = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const d = e.jira_created_at ? e.jira_created_at.slice(0, 10) : "";
      if (!d) return;
      map[d] = (map[d] || 0) + Number(e.quantity) || 0;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Rango continuo de fechas: desde/hasta filtro o min/max de los datos; días sin eventos = 0
  const chartDates = useMemo(() => {
    let start = dateFromFilter;
    let end = dateToFilter;
    if (!start || !end) {
      const dates = byDate.map(([d]) => d);
      if (dates.length === 0) return [];
      if (!start) start = dates[0];
      if (!end) end = dates[dates.length - 1];
    }
    if (start > end) return [];
    const out = [];
    const d = new Date(start + "T12:00:00");
    const endD = new Date(end + "T12:00:00");
    while (d <= endD) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [byDate, dateFromFilter, dateToFilter]);

  const byDateMap = useMemo(() => {
    const m = {};
    byDate.forEach(([d, q]) => { m[d] = Number(q) || 0; });
    return m;
  }, [byDate]);

  const chartData = useMemo(() => chartDates.map((d) => ({ date: d, q: byDateMap[d] ?? 0 })), [chartDates, byDateMap]);

  const minQ = chartData.length ? Math.min(...chartData.map((d) => d.q)) : 0;
  const maxQ = chartData.length ? Math.max(...chartData.map((d) => d.q)) : 1;
  const range = maxQ - minQ || 1;
  const yPadding = range * 0.1;
  const yMin = minQ - yPadding;
  const yMax = maxQ + yPadding;
  const yRange = yMax - yMin;

  const inputStyle = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)" };

  if (loading) return <div style={{ padding: 24, color: "var(--text-secondary)" }}>Cargando eventos...</div>;
  if (error) return <div style={{ padding: 24, color: "var(--error)" }}>Error: {error}</div>;

  const chartW = 600;
  const chartH = 220;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 36;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const toX = (i) => (chartData.length <= 1 ? padLeft + plotW / 2 : padLeft + (i / (chartData.length - 1)) * plotW);
  const toY = (q) => padTop + plotH - ((q - yMin) / yRange) * plotH;

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, display: "flex", flexDirection: "column", gap: 20, minHeight: 0, flex: 1 }}>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          Código material:
          <input value={materialCodeFilter} onChange={(e) => setMaterialCodeFilter(e.target.value)} placeholder="Ej: E084" style={{ ...inputStyle, minWidth: 100 }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          Estado:
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="en deposito">En depósito</option>
            <option value="solicitado">Solicitado</option>
            <option value="entregado">Entregado</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          Desde:
          <input type="date" value={dateFromFilter} onChange={(e) => setDateFromFilter(e.target.value)} style={inputStyle} min="2025-01-01" />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          Hasta:
          <input type="date" value={dateToFilter} onChange={(e) => setDateToFilter(e.target.value)} style={inputStyle} min="2025-01-01" />
        </label>
      </div>

      {/* Tabla actividades materiales */}
      <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--card-bg)", minHeight: 200 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text-primary)" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border-color)", background: "var(--table-header-bg)" }}>
              <SortableTh columnKey="issue_key" label="Issue" align="left" menuOpen={openSortColumn === "issue_key"} onToggleMenu={() => setOpenSortColumn((c) => c === "issue_key" ? null : "issue_key")} onSelectAsc={() => { setSortColumn("issue_key"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("issue_key"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "10px 12px" }} />
              <SortableTh columnKey="material_code" label="Código material" align="left" menuOpen={openSortColumn === "material_code"} onToggleMenu={() => setOpenSortColumn((c) => c === "material_code" ? null : "material_code")} onSelectAsc={() => { setSortColumn("material_code"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("material_code"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "10px 12px" }} />
              <SortableTh columnKey="material_name" label="Nombre material" align="left" menuOpen={openSortColumn === "material_name"} onToggleMenu={() => setOpenSortColumn((c) => c === "material_name" ? null : "material_name")} onSelectAsc={() => { setSortColumn("material_name"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("material_name"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "10px 12px" }} />
              <SortableTh columnKey="quantity" label="Cantidad" align="right" menuOpen={openSortColumn === "quantity"} onToggleMenu={() => setOpenSortColumn((c) => c === "quantity" ? null : "quantity")} onSelectAsc={() => { setSortColumn("quantity"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("quantity"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "right", padding: "10px 12px" }} />
              <SortableTh columnKey="unit" label="Unidad" align="left" menuOpen={openSortColumn === "unit"} onToggleMenu={() => setOpenSortColumn((c) => c === "unit" ? null : "unit")} onSelectAsc={() => { setSortColumn("unit"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("unit"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "10px 12px" }} />
              <SortableTh columnKey="status" label="Estado" align="left" menuOpen={openSortColumn === "status"} onToggleMenu={() => setOpenSortColumn((c) => c === "status" ? null : "status")} onSelectAsc={() => { setSortColumn("status"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("status"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "10px 12px" }} />
              <SortableTh columnKey="jira_created_at" label="Creado" align="left" menuOpen={openSortColumn === "jira_created_at"} onToggleMenu={() => setOpenSortColumn((c) => c === "jira_created_at" ? null : "jira_created_at")} onSelectAsc={() => { setSortColumn("jira_created_at"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("jira_created_at"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "10px 12px" }} />
              <SortableTh columnKey="jira_updated_at" label="Actualizado" align="left" menuOpen={openSortColumn === "jira_updated_at"} onToggleMenu={() => setOpenSortColumn((c) => c === "jira_updated_at" ? null : "jira_updated_at")} onSelectAsc={() => { setSortColumn("jira_updated_at"); setSortDirection("asc"); }} onSelectDesc={() => { setSortColumn("jira_updated_at"); setSortDirection("desc"); }} onCloseMenu={() => setOpenSortColumn(null)} thStyle={{ textAlign: "left", padding: "10px 12px" }} />
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                  No hay actividades materiales con los filtros aplicados.
                  <br />
                  <a href={`${API_BASE || (typeof window !== "undefined" ? window.location.origin : "")}/api/debug/material-issues`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.9rem", marginTop: 8, display: "inline-block" }}>Diagnóstico (api/debug/material-issues)</a>
                </td>
              </tr>
            ) : (
              sortedFiltered.map((e) => (
                <tr key={e.id ?? e.issue_key} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{e.issue_key}</td>
                  <td style={{ padding: "8px 12px" }}>{e.material_code}</td>
                  <td style={{ padding: "8px 12px" }}>{e.material_name || "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{e.quantity}</td>
                  <td style={{ padding: "8px 12px" }}>{e.unit ?? "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{e.status || "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: "0.9rem" }}>{e.jira_created_at ? new Date(e.jira_created_at).toLocaleString("es-AR") : "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: "0.9rem" }}>{e.jira_updated_at ? new Date(e.jira_updated_at).toLocaleString("es-AR") : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Filtro de fecha duplicado (linkeado): mismo estado que el de arriba, encima de gráfica y calendario */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          Estado:
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="en deposito">En depósito</option>
            <option value="solicitado">Solicitado</option>
            <option value="entregado">Entregado</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          Desde:
          <input type="date" value={dateFromFilter} onChange={(e) => setDateFromFilter(e.target.value)} style={inputStyle} min="2025-01-01" />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          Hasta:
          <input type="date" value={dateToFilter} onChange={(e) => setDateToFilter(e.target.value)} style={inputStyle} min="2025-01-01" />
        </label>
      </div>

      {/* Gráfica de líneas (izq) + Calendario (der) */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {chartData.length > 0 ? (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 16, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "var(--text-primary)" }}>Cantidad por fecha</h3>
            <div style={{ width: "100%", minHeight: 220, flex: 1 }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ display: "block" }}>
              {/* Eje Y: cantidad */}
              <line x1={padLeft} y1={padTop} x2={padLeft} y2={chartH - padBottom} stroke="var(--border-color)" strokeWidth="1" />
              <line x1={padLeft} y1={chartH - padBottom} x2={chartW - padRight} y2={chartH - padBottom} stroke="var(--border-color)" strokeWidth="1" />
              {[yMin, yMin + yRange * 0.25, yMin + yRange * 0.5, yMin + yRange * 0.75, yMax].map((v, i) => {
                const y = toY(v);
                return (
                  <g key={i}>
                    <line x1={padLeft} y1={y} x2={chartW - padRight} y2={y} stroke="var(--border-color)" strokeDasharray="2,2" opacity={0.6} />
                    <text x={padLeft - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{Number(v).toFixed(v % 1 ? 1 : 0)}</text>
                  </g>
                );
              })}
              {/* Eje X: fechas */}
              {chartData.map((d, i) => (
                <text key={d.date} x={toX(i)} y={chartH - 8} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">{d.date.slice(5)}</text>
              ))}
              {/* Línea */}
              {chartData.length > 0 && (
                <path
                  d={chartData.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p.q)}`).join(" ")}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {/* Puntos y etiquetas de cantidad */}
              {chartData.map((p, i) => (
                <g key={p.date}>
                  <circle cx={toX(i)} cy={toY(p.q)} r="4" fill="#2563eb" />
                  <text x={toX(i)} y={toY(p.q) - 10} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-primary)">{p.q}</text>
                </g>
              ))}
            </svg>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0, background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 24, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            No hay datos para mostrar la gráfica. Ajustá los filtros.
          </div>
        )}
        <div style={{ width: 320, flexShrink: 0 }}>
          <CalendarioEventos
            events={events}
            selectedDate={dateFromFilter && dateFromFilter === dateToFilter ? dateFromFilter : null}
            onSelectDate={(d) => { setDateFromFilter(d); setDateToFilter(d); }}
            monthYear={calendarMonth}
            onMonthChange={setCalendarMonth}
          />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("stock"); // "stock" | "eventos"
  const [theme, setThemeState] = useState(() => {
    try {
      const t = localStorage.getItem("panel-theme");
      if (t === "light" || t === "dark") return t;
    } catch {}
    return "light";
  });

  function setTheme(next) {
    setThemeState(next);
    try { localStorage.setItem("panel-theme", next); } catch {}
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-nav">
          <button type="button" className="sidebar-btn" onClick={() => setView("stock")} title="Stock" aria-pressed={view === "stock"}>
            <IconTable />
          </button>
          <button type="button" className="sidebar-btn" onClick={() => setView("eventos")} title="Eventos de stock" aria-pressed={view === "eventos"}>
            <IconChart />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="header">
          <span className="header-title">{view === "stock" ? "Stock" : "Eventos de stock"}</span>
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
        </header>
        <main className="main">
          {view === "stock" && <VistaStock />}
          {view === "eventos" && <VistaEventos />}
        </main>
      </div>
    </div>
  );
}
