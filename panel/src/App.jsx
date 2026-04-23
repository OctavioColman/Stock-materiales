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
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const looksHtml = text.trimStart().startsWith("<") || ct.includes("text/html");
  if (looksHtml) {
    throw new Error(
      "El servidor respondió HTML en lugar de JSON (suele ser error del proxy de Vite o el backend no está en el puerto 3001). " +
        "Reiniciá el API en la carpeta del proyecto: node server.js. Si usás VITE_API_URL, revisá que apunte a ese mismo servidor."
    );
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

// Modal genérico (contentClassName: ej. "modal-content--wide"; bodyClassName: ej. "modal-body--compact")
function Modal({ open, onClose, title, children, contentClassName, bodyClassName }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal-content${contentClassName ? ` ${contentClassName}` : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className={`modal-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
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

// Formulario de corrección: edita cantidades de issues existentes para un mismo código.
function FormularioCorreccion({ onClose, onSuccess, onResult, initialMaterial }) {
  const [materialCode, setMaterialCode] = useState("");
  const [summary, setSummary] = useState("");
  const [productoYMedida, setProductoYMedida] = useState("");
  const [cf11144Value, setCf11144Value] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [issues, setIssues] = useState([]);
  const [editedByKey, setEditedByKey] = useState({});
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [createQuantity, setCreateQuantity] = useState("");
  const [unitOptions, setUnitOptions] = useState([]);
  const [unitLoading, setUnitLoading] = useState(false);
  const [unitHint, setUnitHint] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const code = initialMaterial?.material_code || "";
    const name = initialMaterial?.material_name || "";
    const pym = initialMaterial?.customfield_11145 || "";
    const cf11144 = initialMaterial?.customfield_11144 || "";
    setMaterialCode(code);
    setSummary(name);
    setProductoYMedida(pym);
    setCf11144Value(cf11144);
    setIssues([]);
    setEditedByKey({});
    setStatus("");
    setDetailError("");
    setCreateMode(false);
    setCreateQuantity("");
    setSelectedUnitId("");
    setUnitOptions([]);
    setUnitHint("");
    if (!code) return;

    let alive = true;
    setDetailLoading(true);
    apiFetch(`/api/jira-material-en-deposito?material_code=${encodeURIComponent(code)}`)
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok) throw new Error(data?.error || "Error al buscar materiales");
        const rows = data?.issues || [];
        setIssues(rows);
        setEditedByKey(Object.fromEntries(rows.map((r) => [r.key, r.quantity != null ? String(r.quantity) : ""])));
      })
      .catch((e) => {
        if (!alive) return;
        setDetailError(e.message || "Error de conexión");
        setIssues([]);
        setEditedByKey({});
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => { alive = false; };
  }, [
    initialMaterial?.material_code,
    initialMaterial?.material_name,
    initialMaterial?.customfield_11145,
    initialMaterial?.customfield_11144,
  ]);

  useEffect(() => {
    if (!createMode) return;
    let alive = true;
    setUnitLoading(true);
    setUnitHint("");
    apiFetch("/api/jira-field-11442-options")
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok) throw new Error(data?.error || "Error al cargar unidades");
        setUnitOptions(data?.options || []);
        if (!(data?.options?.length)) setUnitHint(data?.hint || "No se encontraron unidades.");
      })
      .catch((e) => {
        if (!alive) return;
        setUnitOptions([]);
        setUnitHint(e.message || "Error al cargar unidades");
      })
      .finally(() => {
        if (alive) setUnitLoading(false);
      });
    return () => { alive = false; };
  }, [createMode]);

  const validationError = useMemo(() => {
    for (const i of issues) {
      const raw = editedByKey[i.key];
      if (raw == null || String(raw).trim() === "") return `Completá la cantidad de ${i.key}.`;
      const n = Number(raw);
      if (Number.isNaN(n)) return `La cantidad de ${i.key} no es válida.`;
      if (n < 0) return `La nueva cantidad de ${i.key} no puede ser menor a cero.`;
    }
    return "";
  }, [issues, editedByKey]);

  const hasChanges = useMemo(
    () => issues.some((i) => String(editedByKey[i.key] ?? "") !== String(i.quantity ?? "")),
    [issues, editedByKey]
  );
  const canSave = issues.length > 0 && hasChanges && !validationError && !saving;
  const canCreate = createMode && createQuantity !== "" && !Number.isNaN(Number(createQuantity)) && Number(createQuantity) >= 0 && selectedUnitId && !creating;

  function setEditedQuantity(key, value) {
    setEditedByKey((prev) => ({ ...prev, [key]: value }));
  }

  async function onSaveChanges() {
    if (!canSave) return;
    setStatus("");
    const updates = issues
      .filter((i) => String(editedByKey[i.key] ?? "") !== String(i.quantity ?? ""))
      .map((i) => ({ key: i.key, quantity: Number(editedByKey[i.key]) }));
    setSaving(true);
    try {
      const { ok, data } = await apiFetch("/api/jira-material-quantities", {
        method: "POST",
        body: { updates, material_code: materialCode },
      });
      if (!ok) {
        const msg = `❌ ${data?.error || "No se pudieron guardar cambios"}`;
        setStatus(msg);
        onResult?.({
          title: "Resultado de Corregir stock",
          message: msg,
          isError: true,
          debug: data?.debug || data || null,
        });
        onClose?.();
        return;
      }
      const updatedCount = data?.updated ?? 0;
      const errCount = data?.errors?.length || 0;
      const msg = errCount > 0
        ? `⚠️ Se actualizaron ${updatedCount} fila(s), con ${errCount} error(es).`
        : `✅ Cantidades actualizadas (${updatedCount} fila(s)).`;
      setStatus(msg);
      onResult?.({
        title: "Resultado de Corregir stock",
        message: msg,
        isError: errCount > 0,
        debug: errCount > 0 ? { errors: data?.errors || [] } : null,
      });
      onSuccess?.();
      onClose?.();
    } catch (e) {
      const msg = `❌ ${e.message}`;
      setStatus(msg);
      onResult?.({
        title: "Resultado de Corregir stock",
        message: msg,
        isError: true,
        debug: { error: e.message },
      });
      onClose?.();
    } finally {
      setSaving(false);
    }
  }

  async function onCreateMaterial() {
    if (!canCreate) return;
    setStatus("");
    setCreating(true);
    try {
      const { ok, data } = await apiFetch("/api/jira-material-create", {
        method: "POST",
        body: {
          material_code: materialCode,
          summary,
          quantity: Number(createQuantity),
          unit_option_id: selectedUnitId,
          customfield_11145: productoYMedida || undefined,
          customfield_11144: cf11144Value || undefined,
        },
      });
      if (!ok) {
        const msg = `❌ ${data?.error || "No se pudo crear material"}`;
        setStatus(msg);
        onResult?.({
          title: "Resultado de Corregir stock",
          message: msg,
          isError: true,
          debug: data?.debug || data || null,
        });
        onClose?.();
        return;
      }
      const msg = `✅ Material creado con éxito. Issue: ${data?.key || "-"}.`;
      setStatus(msg);
      onResult?.({
        title: "Resultado de Corregir stock",
        message: msg,
        isError: false,
        debug: { created_issue_key: data?.key || null, browse_url: data?.browse_url || null },
      });
      onSuccess?.();
      onClose?.();
    } catch (e) {
      const msg = `❌ ${e.message}`;
      setStatus(msg);
      onResult?.({
        title: "Resultado de Corregir stock",
        message: msg,
        isError: true,
        debug: { error: e.message },
      });
      onClose?.();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-sheet">
      <section className="modal-sheet-section">
        <p className="modal-sheet-section-hint" style={{ marginTop: 0 }}>
          Editá cantidades existentes de actividades de materiales para este código. No se crea una actividad nueva.
        </p>
      </section>

      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Código material</h3>
        <input className="modal-sheet-control" value={materialCode} readOnly />
      </section>

      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Nombre</h3>
        <input className="modal-sheet-control" value={summary} readOnly />
      </section>

      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Producto y Medida (customfield_11145)</h3>
        <input className="modal-sheet-control" value={productoYMedida || ""} readOnly />
      </section>

      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Campo 11144 (customfield_11144)</h3>
        <input className="modal-sheet-control" value={cf11144Value || ""} readOnly />
      </section>

      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Materiales del código</h3>
        {detailLoading ? (
          <div className="modal-sheet-placeholder">Cargando…</div>
        ) : detailError ? (
          <div className="modal-sheet-placeholder modal-sheet-placeholder--error">{detailError}</div>
        ) : issues.length === 0 ? (
          <div className="modal-sheet-placeholder">
            No hay actividades para este código en estado En depósito.
          </div>
        ) : (
          <div className="modal-sheet-table-wrap">
            <table className="modal-sheet-table">
              <thead>
                <tr>
                  <th>Clave</th>
                  <th>Descripción</th>
                  <th>Epic</th>
                  <th className="modal-sheet-cell-num">Cantidad actual</th>
                  <th>Nueva cantidad</th>
                  <th>Unidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i) => (
                  <tr key={i.key}>
                    <td className="modal-sheet-cell-key">{i.key}</td>
                    <td>{i.summary || "—"}</td>
                    <td>{i.epic_summary || "-"}</td>
                    <td className="modal-sheet-cell-num">{i.quantity ?? "—"}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="modal-sheet-qty-input"
                        value={editedByKey[i.key] ?? ""}
                        onChange={(e) => setEditedQuantity(i.key, e.target.value)}
                      />
                    </td>
                    <td>{i.unit || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{i.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!detailLoading && !detailError && issues.length === 0 && (
        <section className="modal-sheet-section">
          <h3 className="modal-sheet-section-title">Crear material</h3>
          {!createMode ? (
            <button type="button" className="modal-sheet-btn-primary" onClick={() => setCreateMode(true)}>
              Crear material
            </button>
          ) : (
            <>
              <p className="modal-sheet-section-hint" style={{ marginTop: 0 }}>
                Se creará una issue tipo materiales en el proyecto STOCK con código y nombre preestablecidos.
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ color: "var(--text-primary)" }}>
                  Cantidad (customfield_11176)
                  <input
                    className="modal-sheet-control"
                    type="number"
                    min={0}
                    step="any"
                    value={createQuantity}
                    onChange={(e) => setCreateQuantity(e.target.value)}
                    placeholder="Ej. 10"
                  />
                </label>
                <label style={{ color: "var(--text-primary)" }}>
                  Unidad (customfield_11442)
                  <select
                    className="modal-sheet-control"
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    disabled={unitLoading}
                  >
                    <option value="">{unitLoading ? "Cargando..." : "Seleccionar unidad"}</option>
                    {unitOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name || opt.value || opt.id}</option>
                    ))}
                  </select>
                </label>
                {unitHint && <p className="modal-sheet-section-hint" style={{ marginTop: 0 }}>{unitHint}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="modal-sheet-btn-primary" disabled={!canCreate} onClick={onCreateMaterial}>
                    {creating ? "Creando..." : "Crear material"}
                  </button>
                  <button type="button" className="modal-sheet-btn-secondary" onClick={() => setCreateMode(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <footer className="modal-sheet-footer">
        <button type="button" className="modal-sheet-btn-primary" disabled={!canSave} onClick={onSaveChanges}>
          {saving ? "Guardando..." : "Guardar corrección"}
        </button>
        {onClose && <button type="button" className="modal-sheet-btn-secondary" onClick={onClose}>Cerrar</button>}
        {validationError && <span className="modal-sheet-footer-status modal-sheet-footer-status--error">{validationError}</span>}
        {status && <span className="modal-sheet-footer-status">{status}</span>}
      </footer>
    </div>
  );
}

// Formulario Entregar: actividad (Problemas, Detalles o Epic), materiales en depósito del mismo epic, y extras con etiqueta pañol stock (cf. 10483).
function FormularioConsumo({ onClose, onSuccess, onResult }) {
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
  const [selectedLinkedKeys, setSelectedLinkedKeys] = useState([]);
  const [extraMaterials, setExtraMaterials] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraError, setExtraError] = useState("");
  const [selectedExtraKeys, setSelectedExtraKeys] = useState([]);
  const [extraFilterKey, setExtraFilterKey] = useState("");
  const [extraFilterDescription, setExtraFilterDescription] = useState("");
  const [extraFiltersOpen, setExtraFiltersOpen] = useState(false);
  const [field10813Options, setField10813Options] = useState([]);
  const [field10813Loading, setField10813Loading] = useState(false);
  const [selectedField10813, setSelectedField10813] = useState("");
  const [field10813Hint, setField10813Hint] = useState("");
  const [consumoDebug, setConsumoDebug] = useState(null);
  const [linkedConsumptionByKey, setLinkedConsumptionByKey] = useState({});

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
      setExtraMaterials([]);
      setExtraError("");
      setSelectedLinkedKeys([]);
      setSelectedExtraKeys([]);
      return;
    }
    setSelectedLinkedKeys([]);
    setSelectedExtraKeys([]);
    setLinkedConsumptionByKey({});
    let alive = true;
    setLinkedLoading(true);
    setExtraLoading(true);
    setLinkedError("");
    setExtraError("");
    apiFetch(`/api/jira-materials-entregar?issue_key=${encodeURIComponent(linkKey)}`)
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok) {
          const msg = data?.error || "Error al cargar materiales";
          setLinkedError(msg);
          setExtraError(msg);
          setLinkedActivities([]);
          setExtraMaterials([]);
          return;
        }
        setLinkedActivities(data?.issues || []);
        setExtraMaterials(data?.extra_issues || []);
        setLinkedError(data?.epic_error || "");
        setExtraError(data?.extra_error || "");
      })
      .catch((e) => {
        if (!alive) return;
        const msg = e.message || "Error de conexión";
        setLinkedError(msg);
        setExtraError(msg);
        setLinkedActivities([]);
        setExtraMaterials([]);
      })
      .finally(() => {
        if (!alive) return;
        setLinkedLoading(false);
        setExtraLoading(false);
      });
    return () => { alive = false; };
  }, [linkKey]);

  function toggleLinkedKey(key) {
    setSelectedLinkedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }
  function toggleExtraKey(key) {
    setSelectedExtraKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }
  function setLinkedConsumption(key, value) {
    const n = value === "" ? "" : Number(value);
    setLinkedConsumptionByKey((prev) => (Number.isNaN(n) || n === "" ? { ...prev, [key]: value } : { ...prev, [key]: n }));
  }
  const mergedActivitiesByKey = useMemo(() => ({
    ...Object.fromEntries((linkedActivities || []).map((a) => [a.key, a])),
    ...Object.fromEntries((extraMaterials || []).map((a) => [a.key, a])),
  }), [linkedActivities, extraMaterials]);
  useEffect(() => {
    const activitiesByKey = mergedActivitiesByKey;
    setLinkedConsumptionByKey((prev) => {
      let next = { ...prev };
      for (const key of [...selectedLinkedKeys, ...selectedExtraKeys]) {
        const act = activitiesByKey[key];
        const maxQty = act?.quantity != null ? act.quantity : 0;
        if (maxQty > 0 && (prev[key] == null || prev[key] === "")) next[key] = maxQty;
      }
      return next;
    });
  }, [selectedLinkedKeys, selectedExtraKeys, mergedActivitiesByKey]);

  function toggleAllLinked() {
    if (selectedLinkedKeys.length === linkedActivities.length) setSelectedLinkedKeys([]);
    else setSelectedLinkedKeys(linkedActivities.map((a) => a.key));
  }
  function toggleAllExtra() {
    const visibleKeys = filteredExtraMaterials.map((a) => a.key);
    const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedExtraKeys.includes(k));
    if (allVisibleSelected) {
      setSelectedExtraKeys((prev) => prev.filter((k) => !visibleKeys.includes(k)));
    } else {
      setSelectedExtraKeys((prev) => [...new Set([...prev, ...visibleKeys])]);
    }
  }

  const selectedIssue = selectedIssueDisplay || issueOptions.find((i) => i.key === linkKey);
  const filteredExtraMaterials = useMemo(() => {
    const keyQ = extraFilterKey.trim().toLowerCase();
    const descQ = extraFilterDescription.trim().toLowerCase();
    return extraMaterials.filter((a) => {
      const byKey = keyQ ? (a.key || "").toLowerCase().includes(keyQ) : true;
      const byDesc = descQ ? (a.summary || "").toLowerCase().includes(descQ) : true;
      return byKey && byDesc;
    });
  }, [extraMaterials, extraFilterKey, extraFilterDescription]);
  const allSelectedKeys = useMemo(() => [...selectedLinkedKeys, ...selectedExtraKeys], [selectedLinkedKeys, selectedExtraKeys]);
  const totalSelected = allSelectedKeys.length;
  const consumptionValid = useMemo(() => {
    for (const key of allSelectedKeys) {
      const act = mergedActivitiesByKey[key];
      const maxQty = act?.quantity != null ? act.quantity : 0;
      const val = linkedConsumptionByKey[key];
      const n = val === "" || val == null ? null : Number(val);
      if (maxQty <= 0) return { ok: false, key, msg: `Cantidad disponible en ${key} no es válida.` };
      if (n == null || n === "") return { ok: false, key, msg: `Indicá la cantidad a entregar para ${key}.` };
      if (Number.isNaN(n) || n <= 0) return { ok: false, key, msg: `La cantidad a entregar debe ser mayor a 0. En ${key} indicaste ${val}.` };
      if (n > maxQty) return { ok: false, key, msg: `No se puede entregar más de lo disponible. En ${key} la cantidad disponible es ${maxQty}. La cantidad del material nunca puede quedar menor a cero.` };
    }
    return { ok: true };
  }, [allSelectedKeys, mergedActivitiesByKey, linkedConsumptionByKey]);
  const canCreate = useMemo(() => {
    if (!linkKey) return false;
    if (totalSelected === 0) return false;
    if (!selectedField10813 || selectedField10813.trim() === "") return false;
    if (!consumptionValid.ok) return false;
    return true;
  }, [linkKey, totalSelected, selectedField10813, consumptionValid.ok]);

  async function onVincular() {
    const allKeys = [...selectedLinkedKeys, ...selectedExtraKeys];
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
                  const act = mergedActivitiesByKey[k];
                  const maxQty = act?.quantity != null ? act.quantity : 0;
                  const val = linkedConsumptionByKey[k];
                  const n = val != null && val !== "" ? Number(val) : maxQty;
                  const clamped = Number.isNaN(n) ? maxQty : Math.min(maxQty, Math.max(0.001, n));
                  return [k, clamped];
                })
              )
            : undefined,
          material_consumptions: allKeys.length > 0
            ? Object.fromEntries(
                allKeys.map((k) => {
                  const act = mergedActivitiesByKey[k];
                  const maxQty = act?.quantity != null ? act.quantity : 0;
                  const val = linkedConsumptionByKey[k];
                  const n = val != null && val !== "" ? Number(val) : maxQty;
                  const clamped = Number.isNaN(n) ? maxQty : Math.min(maxQty, Math.max(0.001, n));
                  return [k, clamped];
                })
              )
            : {},
        },
      });
      if (!ok) {
        const msg = `❌ ${data?.error || "Error"}`;
        setConsumoDebug(data?.debug || { error: data?.error || "Error" });
        setStatus(msg);
        onResult?.({ title: "Resultado de Entregar", message: msg, isError: true, debug: data?.debug || { error: data?.error || "Error" } });
        onClose?.();
        return;
      }
      const hasErrors = data.has_partial_errors || (data.move_errors?.length > 0) || (data.transition_errors?.length > 0) || (data.personal_field_errors?.length > 0);
      if (hasErrors) {
        setConsumoDebug(data.debug || data);
        const errParts = [];
        if (data.move_errors?.length) errParts.push(`${data.move_errors.length} error(es) al mover al epic`);
        if (data.transition_errors?.length) errParts.push(`${data.transition_errors.length} error(es) al pasar a Entregado`);
        if (data.personal_field_errors?.length) errParts.push(`${data.personal_field_errors.length} error(es) al asignar personal`);
        const msg = `⚠️ Completado con errores: ${errParts.join("; ")}.`;
        setStatus(msg);
        onResult?.({ title: "Resultado de Entregar", message: msg, isError: true, debug: data.debug || data });
        onClose?.();
        return;
      }
      const parts = [];
      if (data.linked != null && data.linked > 0) parts.push(`${data.linked} vinculadas a la tarea`);
      if (data.linked === 0 && data.linked_to_task_only === false) parts.push("materiales en el epic (sin vínculo; la actividad seleccionada es el epic)");
      if (data.moved_to_epic != null && data.moved_to_epic > 0) parts.push(`${data.moved_to_epic} movidas al epic de la actividad`);
      if (data.transitioned != null) parts.push(`${data.transitioned} pasadas a Entregado (se descontarán del stock)`);
      const okMsg = parts.length ? `✅ ${parts.join("; ")}.` : "✅ Listo.";
      setStatus(okMsg);
      setLinkKey("");
      setSelectedIssueDisplay(null);
      setSelectedLinkedKeys([]);
      setSelectedExtraKeys([]);
      setConsumoDebug(null);
      setLinkedConsumptionByKey({});
      onResult?.({ title: "Resultado de Entregar", message: okMsg, isError: false, debug: data?.debug || null });
      onSuccess?.();
    } catch (e) {
      const msg = `❌ ${e.message}`;
      setStatus(msg);
      setConsumoDebug({ error: e.message });
      onResult?.({ title: "Resultado de Entregar", message: msg, isError: true, debug: { error: e.message } });
      onClose?.();
    }
  }

  const dropdownZ = { zIndex: 1050 };

  return (
    <div className="modal-sheet">
      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Actividad</h3>
        <div ref={issueDropdownRef} style={{ position: "relative", ...dropdownZ }}>
          <button
            type="button"
            className="modal-sheet-control modal-sheet-control--trigger"
            onClick={() => setIssueDropdownOpen((o) => !o)}
          >
            {linkKey && selectedIssue ? `${selectedIssue.key} — ${selectedIssue.summary}` : "Buscar y seleccionar"}
          </button>
          {issueDropdownOpen && (
            <div className="modal-sheet-dropdown">
              <input
                ref={issueSearchInputRef}
                className="modal-sheet-control"
                style={{ borderRadius: 0, borderWidth: "0 0 1px 0" }}
                type="text"
                value={issueQuery}
                onChange={(e) => setIssueQuery(e.target.value)}
                placeholder="Buscar…"
                onKeyDown={(e) => e.stopPropagation()}
              />
              <ul className="modal-sheet-dropdown-list">
                {issueOptions.length === 0 ? (
                  <li className="modal-sheet-dropdown-empty">{issueQuery.trim() ? "Sin coincidencias" : "Escribí para buscar"}</li>
                ) : (
                  <>
                    {issueOptions.map((i) => (
                      <li
                        key={i.key}
                        className="modal-sheet-dropdown-item"
                        onClick={() => { setLinkKey(i.key); setSelectedIssueDisplay(i); setIssueDropdownOpen(false); }}
                      >
                        <span className="modal-sheet-dropdown-key">{i.key}</span>
                        <span className="modal-sheet-dropdown-summary">{i.summary}</span>
                        <span className="modal-sheet-dropdown-proj">{i.project}</span>
                      </li>
                    ))}
                    {issueNextPageToken && !issueQuery.trim() && (
                      <li className="modal-sheet-dropdown-more">
                        <button type="button" className="modal-sheet-btn-ghost" style={{ width: "100%" }} onClick={(e) => { e.stopPropagation(); loadMoreIssues(); }} disabled={issueLoadingMore}>
                          {issueLoadingMore ? "Cargando…" : "Cargar más"}
                        </button>
                      </li>
                    )}
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Personal</h3>
        {field10813Loading ? (
          <p className="modal-sheet-section-hint" style={{ marginBottom: 0 }}>Cargando…</p>
        ) : (
          <>
            <select className="modal-sheet-control" value={selectedField10813} onChange={(e) => setSelectedField10813(e.target.value)}>
              <option value="">Quién entrega</option>
              {field10813Options.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name || opt.value || opt.id}</option>
              ))}
            </select>
            {field10813Hint && (
              <p className="modal-sheet-section-hint modal-sheet-hint-link">
                {field10813Hint}{" "}
                <a href={`${API_BASE || (typeof window !== "undefined" ? window.location.origin : "")}/api/debug/jira-field-10813`} target="_blank" rel="noopener noreferrer">Diagnóstico</a>
              </p>
            )}
          </>
        )}
      </section>

      {linkKey && (
        <>
          <section className="modal-sheet-section">
            <h3 className="modal-sheet-section-title">Materiales en depósito</h3>
            <p className="modal-sheet-section-hint">Mismo epic que la actividad. Si entregás menos que el total, el resto queda en una issue nueva.</p>
            {linkedLoading ? (
              <div className="modal-sheet-placeholder">Cargando…</div>
            ) : linkedError ? (
              <div className="modal-sheet-placeholder modal-sheet-placeholder--error">{linkedError}</div>
            ) : linkedActivities.length === 0 ? (
              <div className="modal-sheet-placeholder">No hay materiales en depósito en este epic.</div>
            ) : (
              <>
                <div className="modal-sheet-toolbar">
                  <button type="button" className="modal-sheet-btn-ghost" onClick={toggleAllLinked}>
                    {selectedLinkedKeys.length === linkedActivities.length ? "Deseleccionar todo" : "Seleccionar todo"}
                  </button>
                  <span className="modal-sheet-toolbar-meta">{selectedLinkedKeys.length} / {linkedActivities.length}</span>
                </div>
                <div className="modal-sheet-table-wrap">
                  <table className="modal-sheet-table">
                    <thead>
                      <tr>
                        <th className="modal-sheet-cell-check" title="Seleccionar filas"><span className="modal-sheet-th-dim">Sel.</span></th>
                        <th>Clave</th>
                        <th>Descripción</th>
                        <th>Código</th>
                        <th className="modal-sheet-cell-num">Depósito</th>
                        <th>Estado</th>
                        <th>A entregar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedActivities.map((a) => {
                        const sel = selectedLinkedKeys.includes(a.key);
                        return (
                          <tr key={a.key} className={sel ? "modal-sheet-row--selected" : undefined}>
                            <td className="modal-sheet-cell-check">
                              <input type="checkbox" checked={sel} onChange={() => toggleLinkedKey(a.key)} aria-label={`Seleccionar ${a.key}`} />
                            </td>
                            <td className="modal-sheet-cell-key">{a.key}</td>
                            <td>{a.summary || "—"}</td>
                            <td className="modal-sheet-cell-mono">{a.material_code || "—"}</td>
                            <td className="modal-sheet-cell-num">{a.quantity ?? "—"}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{a.status || "—"}</td>
                            <td>
                              {sel ? (
                                <input
                                  type="number"
                                  className="modal-sheet-qty-input"
                                  min={0}
                                  step="any"
                                  max={a.quantity != null ? a.quantity : undefined}
                                  value={linkedConsumptionByKey[a.key] ?? a.quantity ?? ""}
                                  onChange={(e) => setLinkedConsumption(a.key, e.target.value)}
                                />
                              ) : (
                                <span style={{ color: "var(--text-secondary)" }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="modal-sheet-section">
            <h3 className="modal-sheet-section-title">Materiales extra (pañol stock)</h3>
            <p className="modal-sheet-section-hint">Lista seleccionable (campo 10483): opción «pañol stock». En depósito y fuera del epic de esta actividad; al entregar se mueven al epic de la actividad.</p>
            {extraLoading ? (
              <div className="modal-sheet-placeholder">Cargando…</div>
            ) : extraError ? (
              <div className="modal-sheet-placeholder modal-sheet-placeholder--error">{extraError}</div>
            ) : extraMaterials.length === 0 ? (
              <div className="modal-sheet-placeholder">No hay materiales extra con etiqueta pañol stock disponibles.</div>
            ) : (
              <>
                <div className="modal-sheet-toolbar">
                  <button type="button" className="modal-sheet-btn-ghost" onClick={toggleAllExtra}>
                    {filteredExtraMaterials.length > 0 && filteredExtraMaterials.every((a) => selectedExtraKeys.includes(a.key)) ? "Deseleccionar visibles" : "Seleccionar visibles"}
                  </button>
                  <button
                    type="button"
                    className="modal-sheet-btn-ghost"
                    onClick={() => {
                      setExtraFiltersOpen((open) => {
                        const next = !open;
                        if (!next) {
                          setExtraFilterKey("");
                          setExtraFilterDescription("");
                        }
                        return next;
                      });
                    }}
                  >
                    {extraFiltersOpen ? "Ocultar buscadores" : "Buscar en tabla"}
                  </button>
                  <span className="modal-sheet-toolbar-meta">{selectedExtraKeys.length} / {extraMaterials.length}</span>
                </div>
                <div className="modal-sheet-table-wrap">
                  <table className="modal-sheet-table">
                    <thead>
                      <tr>
                        <th className="modal-sheet-cell-check" title="Seleccionar filas"><span className="modal-sheet-th-dim">Sel.</span></th>
                        <th style={{ minWidth: extraFiltersOpen ? 220 : undefined }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span>Clave</span>
                            {extraFiltersOpen && (
                              <input
                                type="text"
                                className="modal-sheet-control"
                                style={{ padding: "6px 8px" }}
                                placeholder="Filtrar clave"
                                value={extraFilterKey}
                                onChange={(e) => setExtraFilterKey(e.target.value)}
                              />
                            )}
                          </div>
                        </th>
                        <th style={{ minWidth: extraFiltersOpen ? 280 : undefined }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span>Descripción</span>
                            {extraFiltersOpen && (
                              <input
                                type="text"
                                className="modal-sheet-control"
                                style={{ padding: "6px 8px" }}
                                placeholder="Filtrar descripción"
                                value={extraFilterDescription}
                                onChange={(e) => setExtraFilterDescription(e.target.value)}
                              />
                            )}
                          </div>
                        </th>
                        <th>Código</th>
                        <th className="modal-sheet-cell-num">Depósito</th>
                        <th>Estado</th>
                        <th>A entregar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExtraMaterials.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 14, textAlign: "center", color: "var(--text-secondary)" }}>
                            No hay filas que coincidan con los filtros.
                          </td>
                        </tr>
                      ) : filteredExtraMaterials.map((a) => {
                        const sel = selectedExtraKeys.includes(a.key);
                        return (
                          <tr key={a.key} className={sel ? "modal-sheet-row--selected" : undefined}>
                            <td className="modal-sheet-cell-check">
                              <input type="checkbox" checked={sel} onChange={() => toggleExtraKey(a.key)} aria-label={`Seleccionar extra ${a.key}`} />
                            </td>
                            <td className="modal-sheet-cell-key">{a.key}</td>
                            <td>{a.summary || "—"}</td>
                            <td className="modal-sheet-cell-mono">{a.material_code || "—"}</td>
                            <td className="modal-sheet-cell-num">{a.quantity ?? "—"}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{a.status || "—"}</td>
                            <td>
                              {sel ? (
                                <input
                                  type="number"
                                  className="modal-sheet-qty-input"
                                  min={0}
                                  step="any"
                                  max={a.quantity != null ? a.quantity : undefined}
                                  value={linkedConsumptionByKey[a.key] ?? a.quantity ?? ""}
                                  onChange={(e) => setLinkedConsumption(a.key, e.target.value)}
                                />
                              ) : (
                                <span style={{ color: "var(--text-secondary)" }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}

      <footer className="modal-sheet-footer">
        <button type="button" className="modal-sheet-btn-primary" disabled={!canCreate} onClick={onVincular}>Entregar</button>
        {onClose && (
          <button type="button" className="modal-sheet-btn-secondary" onClick={onClose}>Cancelar</button>
        )}
        {!consumptionValid.ok && consumptionValid.msg && (
          <span className="modal-sheet-footer-status modal-sheet-footer-status--error">{consumptionValid.msg}</span>
        )}
      </footer>
    </div>
  );
}

// Formulario Recibir: seleccionar Orden de Compra, listar materiales (tipo materiales) en el mismo sprint, pasar seleccionados a "En deposito"
function FormularioRecibir({ onClose, onSuccess, onResult }) {
  const [issueQuery, setIssueQuery] = useState("");
  const [issueOptions, setIssueOptions] = useState([]);
  const [issueNextPageToken, setIssueNextPageToken] = useState(null);
  const [issueLoadingMore, setIssueLoadingMore] = useState(false);
  const [ordenCompraKey, setOrdenCompraKey] = useState("");
  const [selectedOrdenCompraDisplay, setSelectedOrdenCompraDisplay] = useState(null);
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
      const res = await fetch(`${API_BASE}/api/issues-orden-compra?${params.toString()}`);
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
        `${API_BASE}/api/issues-orden-compra?query=&nextPageToken=${encodeURIComponent(issueNextPageToken)}`
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
    if (!ordenCompraKey) {
      setMaterials([]);
      setMaterialsError("");
      setSelectedKeys([]);
      return;
    }
    let alive = true;
    setMaterialsLoading(true);
    setMaterialsError("");
    setSelectedKeys([]);
    apiFetch(`/api/jira-materials-same-sprint-as?issue_key=${encodeURIComponent(ordenCompraKey)}`)
      .then(({ ok, data }) => {
        if (!alive) return;
        setMaterialsError(
          !ok ? (data?.error || "Error de red o servidor") : (data?.error || "")
        );
        setMaterials(data?.issues || []);
      })
      .catch((e) => {
        if (!alive) return;
        setMaterialsError(e.message || "Error de conexión");
        setMaterials([]);
      })
      .finally(() => { if (alive) setMaterialsLoading(false); });
    return () => { alive = false; };
  }, [ordenCompraKey]);

  function toggleKey(key) {
    setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }
  function toggleAll() {
    if (selectedKeys.length === materials.length) setSelectedKeys([]);
    else setSelectedKeys(materials.map((a) => a.key));
  }

  const selectedOrdenCompra = selectedOrdenCompraDisplay || issueOptions.find((i) => i.key === ordenCompraKey);
  const canRecibir = ordenCompraKey && selectedKeys.length > 0;

  async function onRecibir() {
    setStatus("Pasando a En depósito...");
    try {
      const { ok, data } = await apiFetch("/api/receive-materials", {
        method: "POST",
        body: { compra_issue_key: ordenCompraKey, material_issue_keys: selectedKeys },
      });
      if (!ok) throw new Error(data?.error || "Error");
      const errCount = data.transition_errors?.length || 0;
      const done = data.transitioned || 0;
      if (errCount > 0) {
        const msg = `⚠️ ${done} pasadas a En depósito; ${errCount} con error.`;
        setStatus(msg);
        onResult?.({ title: "Resultado de Recibir", message: msg, isError: true, debug: data });
        onClose?.();
      } else {
        const msg = `✅ ${done} material(es) pasados a En depósito.`;
        setStatus(msg);
        setOrdenCompraKey("");
        setSelectedOrdenCompraDisplay(null);
        setSelectedKeys([]);
        onResult?.({ title: "Resultado de Recibir", message: msg, isError: false, debug: data });
        onSuccess?.();
      }
    } catch (e) {
      const msg = `❌ ${e.message}`;
      setStatus(msg);
      onResult?.({ title: "Resultado de Recibir", message: msg, isError: true, debug: { error: e.message } });
      onClose?.();
    }
  }

  const dropdownZ = { zIndex: 1050 };
  return (
    <div className="modal-sheet">
      <section className="modal-sheet-section">
        <h3 className="modal-sheet-section-title">Orden de compra</h3>
        <div ref={issueDropdownRef} style={{ position: "relative", ...dropdownZ }}>
          <button type="button" className="modal-sheet-control modal-sheet-control--trigger" onClick={() => setIssueDropdownOpen((o) => !o)}>
            {ordenCompraKey && selectedOrdenCompra ? `${selectedOrdenCompra.key} — ${selectedOrdenCompra.summary}` : "Buscar y seleccionar"}
          </button>
          {issueDropdownOpen && (
            <div className="modal-sheet-dropdown">
              <input
                ref={issueSearchInputRef}
                className="modal-sheet-control"
                style={{ borderRadius: 0, borderWidth: "0 0 1px 0" }}
                type="text"
                value={issueQuery}
                onChange={(e) => setIssueQuery(e.target.value)}
                placeholder="Buscar…"
                onKeyDown={(e) => e.stopPropagation()}
              />
              <ul className="modal-sheet-dropdown-list">
                {issueOptions.length === 0 ? (
                  <li className="modal-sheet-dropdown-empty">{issueQuery.trim() ? "Sin coincidencias" : "Escribí para buscar"}</li>
                ) : (
                  <>
                    {issueOptions.map((i) => (
                      <li
                        key={i.key}
                        className="modal-sheet-dropdown-item"
                        onClick={() => { setOrdenCompraKey(i.key); setSelectedOrdenCompraDisplay(i); setIssueDropdownOpen(false); }}
                      >
                        <span className="modal-sheet-dropdown-key">{i.key}</span>
                        <span className="modal-sheet-dropdown-summary">{i.summary}</span>
                        <span className="modal-sheet-dropdown-proj">{i.project}</span>
                      </li>
                    ))}
                    {issueNextPageToken && !issueQuery.trim() && (
                      <li className="modal-sheet-dropdown-more">
                        <button type="button" className="modal-sheet-btn-ghost" style={{ width: "100%" }} onClick={(e) => { e.stopPropagation(); loadMoreIssues(); }} disabled={issueLoadingMore}>
                          {issueLoadingMore ? "Cargando…" : "Cargar más"}
                        </button>
                      </li>
                    )}
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
        <p className="modal-sheet-section-hint modal-sheet-hint-link" style={{ marginBottom: 0 }}>
          <a href={`${API_BASE || (typeof window !== "undefined" ? window.location.origin : "")}/api/debug/issues-orden-compra`} target="_blank" rel="noopener noreferrer">Diagnóstico Jira</a>
        </p>
      </section>

      {ordenCompraKey && (
        <section className="modal-sheet-section">
          <h3 className="modal-sheet-section-title">Materiales (mismo sprint)</h3>
          <p className="modal-sheet-section-hint">Tipo materiales vinculados al sprint de la orden.</p>
          {materialsLoading ? (
            <div className="modal-sheet-placeholder">Cargando…</div>
          ) : materialsError ? (
            <div className="modal-sheet-placeholder modal-sheet-placeholder--error">{materialsError}</div>
          ) : materials.length === 0 ? (
            <div className="modal-sheet-placeholder">No hay materiales en el sprint o la orden sin sprint.</div>
          ) : (
            <>
              <div className="modal-sheet-toolbar">
                <button type="button" className="modal-sheet-btn-ghost" onClick={toggleAll}>
                  {selectedKeys.length === materials.length ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
                <span className="modal-sheet-toolbar-meta">{selectedKeys.length} / {materials.length}</span>
              </div>
              <div className="modal-sheet-table-wrap">
                <table className="modal-sheet-table">
                  <thead>
                    <tr>
                      <th className="modal-sheet-cell-check" title="Seleccionar"><span className="modal-sheet-th-dim">Sel.</span></th>
                      <th>Clave</th>
                      <th>Descripción</th>
                      <th>Código</th>
                      <th className="modal-sheet-cell-num">Cantidad</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((a) => {
                      const sel = selectedKeys.includes(a.key);
                      return (
                        <tr key={a.key} className={sel ? "modal-sheet-row--selected" : undefined}>
                          <td className="modal-sheet-cell-check">
                            <input type="checkbox" checked={sel} onChange={() => toggleKey(a.key)} aria-label={`Seleccionar ${a.key}`} />
                          </td>
                          <td className="modal-sheet-cell-key">{a.key}</td>
                          <td>{a.summary || "—"}</td>
                          <td className="modal-sheet-cell-mono">{a.material_code || "—"}</td>
                          <td className="modal-sheet-cell-num">{a.quantity ?? "—"}</td>
                          <td style={{ color: "var(--text-secondary)" }}>{a.status || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      <footer className="modal-sheet-footer">
        <button type="button" className="modal-sheet-btn-primary" disabled={!canRecibir} onClick={onRecibir}>Recibir</button>
        {onClose && <button type="button" className="modal-sheet-btn-secondary" onClick={onClose}>Cancelar</button>}
      </footer>
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
  const [operationResult, setOperationResult] = useState(null); // { title, message, isError, debug }
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailMaterial, setDetailMaterial] = useState(null); // { code, name }
  const [detailIssues, setDetailIssues] = useState([]);
  const [detailMeta, setDetailMeta] = useState({ count: 0, totalQty: 0 });
  const [correctionMaterial, setCorrectionMaterial] = useState(null); // { material_code, material_name, customfield_11145, customfield_11144 }
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

  function handleOperationResult(result) {
    setOpenModal(null);
    setOperationResult(result || null);
  }

  async function openStockDetail(row) {
    const code = row?.material_code || "";
    const name = row?.material_name || "";
    setDetailMaterial({ code, name });
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailIssues([]);
    setDetailMeta({ count: 0, totalQty: 0 });
    try {
      const { ok, data } = await apiFetch(`/api/jira-material-en-deposito?material_code=${encodeURIComponent(code)}`);
      if (!ok) throw new Error(data?.error || "Error al buscar detalle");
      setDetailIssues(data?.issues || []);
      setDetailMeta({ count: data?.detail_count || 0, totalQty: data?.detail_total_qty || 0 });
    } catch (e) {
      setDetailError(e.message || "Error de conexión");
    } finally {
      setDetailLoading(false);
    }
  }

  function openStockCorrection(row) {
    setCorrectionMaterial({
      material_code: row?.material_code || "",
      material_name: row?.material_name || "",
      customfield_11145: row?.material_name || "",
      customfield_11144: row?.product_type || "",
    });
    setOpenModal("correccion");
  }

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
                <th style={{ textAlign: "left", padding: "12px 14px" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
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
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="modal-sheet-btn-ghost"
                          onClick={() => openStockDetail(row)}
                        >
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          className="modal-sheet-btn-ghost"
                          onClick={() => openStockCorrection(row)}
                        >
                          Corregir stock
                        </button>
                      </div>
                    </td>
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
        <button type="button" onClick={() => setOpenModal("consumo")} style={btnStyle}>
          ➕ Entregar
        </button>
        <button type="button" onClick={() => setOpenModal("recibir")} style={btnStyle}>
          📥 Recibir
        </button>
      </div>

      <Modal open={openModal === "correccion"} onClose={() => setOpenModal(null)} title="Corregir stock" contentClassName="modal-content--wide modal-content--sheet" bodyClassName="modal-body--compact">
        <FormularioCorreccion
          onClose={() => setOpenModal(null)}
          onSuccess={() => {
            setRefreshKey((k) => k + 1);
            setOpenModal(null);
          }}
          onResult={handleOperationResult}
          initialMaterial={correctionMaterial}
        />
      </Modal>
      <Modal open={openModal === "consumo"} onClose={() => setOpenModal(null)} title="Entregar material" contentClassName="modal-content--wide modal-content--sheet" bodyClassName="modal-body--compact">
        <FormularioConsumo onClose={() => setOpenModal(null)} onSuccess={() => setOpenModal(null)} onResult={handleOperationResult} />
      </Modal>
      <Modal open={openModal === "recibir"} onClose={() => setOpenModal(null)} title="Recibir material" contentClassName="modal-content--wide modal-content--sheet" bodyClassName="modal-body--compact">
        <FormularioRecibir onClose={() => setOpenModal(null)} onSuccess={() => setOpenModal(null)} onResult={handleOperationResult} />
      </Modal>
      <Modal
        open={Boolean(operationResult)}
        onClose={() => setOperationResult(null)}
        title={operationResult?.title || "Resultado"}
        contentClassName="modal-content--wide modal-content--sheet"
        bodyClassName="modal-body--compact"
      >
        <div className="modal-sheet">
          <section className="modal-sheet-section">
            <p style={{ margin: 0, color: operationResult?.isError ? "var(--error)" : "var(--text-primary)", fontWeight: 600 }}>
              {operationResult?.message || ""}
            </p>
          </section>
          {operationResult?.debug != null && (
            <section className="modal-sheet-section">
              <h3 className="modal-sheet-section-title">Log de debug</h3>
              <div className="modal-sheet-debug" style={{ marginTop: 0 }}>
                <pre>{JSON.stringify(operationResult.debug, null, 2)}</pre>
              </div>
            </section>
          )}
        </div>
      </Modal>
      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Detalle de stock${detailMaterial?.code ? `: ${detailMaterial.code}` : ""}`}
        contentClassName="modal-content--wide modal-content--sheet"
        bodyClassName="modal-body--compact"
      >
        <div className="modal-sheet">
          <section className="modal-sheet-section">
            {detailMaterial?.name && (
              <p className="modal-sheet-section-hint" style={{ marginTop: 0 }}>
                {detailMaterial.name}
              </p>
            )}
            {!detailLoading && !detailError && (
              <p className="modal-sheet-section-hint" style={{ marginTop: 0 }}>
                {detailMeta.count} fila(s) en depósito; total cantidad: {detailMeta.totalQty}
              </p>
            )}
            {detailLoading ? (
              <div className="modal-sheet-placeholder">Cargando detalle…</div>
            ) : detailError ? (
              <div className="modal-sheet-placeholder modal-sheet-placeholder--error">{detailError}</div>
            ) : detailIssues.length === 0 ? (
              <div className="modal-sheet-placeholder">No hay actividades en estado En depósito para este código.</div>
            ) : (
              <div className="modal-sheet-table-wrap">
                <table className="modal-sheet-table">
                  <thead>
                    <tr>
                      <th>Clave</th>
                      <th>Descripción</th>
                      <th>Epic</th>
                      <th className="modal-sheet-cell-num">Cantidad</th>
                      <th>Unidad</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailIssues.map((i) => (
                      <tr key={i.key}>
                        <td className="modal-sheet-cell-key">{i.key}</td>
                        <td>{i.summary || "—"}</td>
                        <td>{i.epic_summary || "-"}</td>
                        <td className="modal-sheet-cell-num">{i.quantity ?? "—"}</td>
                        <td>{i.unit || "-"}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{i.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
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
