import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCached, peek } from "@/lib/adminCache";
import { Download, RefreshCw, ShieldCheck, X } from "lucide-react";
import {
  fetchAuditLog, fetchAuditFacets,
  ACTION_LABELS, ENTITY_LABELS,
  type AuditLogEntry,
} from "@/lib/audit";
import { C } from "./adminTheme";
import { Button, SidePanel } from "./ui";
import { Avatar, DataTable, EmptyState, KeyValues, Pill, SearchField, Toolbar, TwoLine, type Column } from "./layout";

const PAGE_SIZE = 50;

const dateTimeFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Extrait « YYYY-MM-DDTHH:mm » (input datetime-local) → ISO. */
function localToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

const shortenId = (id: string | null) => (id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "");
const actionLabel = (a: string) => ACTION_LABELS[a]?.fr ?? a;
const entityLabel = (k: string | null) => (k ? ENTITY_LABELS[k]?.fr ?? k : "N/D");
const isCritical = (a: string) => a.startsWith("compliance.declaration") || a === "order.delete";
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };

const selectStyle: React.CSSProperties = {
  height: 36, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "var(--a-inputBg)", color: C.t1, fontSize: 13.5, maxWidth: 220,
};

function JsonBlock({ value }: { value: unknown }) {
  const empty = value === null || value === undefined ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);
  return (
    <pre style={{
      margin: 0, padding: "10px 12px", borderRadius: 8, background: C.hover2, color: empty ? C.t3 : C.t2,
      whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.55, minWidth: 0, ...mono,
    }}>
      {empty ? "Aucune donnée" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ────────────────────────────────────────────────────────────
// Export CSV
// ────────────────────────────────────────────────────────────

function toCsv(rows: AuditLogEntry[]): string {
  const headers = ["created_at", "actor_email", "actor_role", "action", "entity_kind", "entity_id", "before", "after", "metadata"];
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.createdAt, r.actorEmail ?? "", r.actorRole ?? "",
      r.action, r.entityKind ?? "", r.entityId ?? "",
      r.before, r.after, r.metadata,
    ].map(escape).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// Panneau principal
// ────────────────────────────────────────────────────────────

const AuditLogPanel = () => {
  // Première page sans filtre : gardée pour la session, affichée tout de suite au retour.
  const first = peek<{ rows: AuditLogEntry[]; total: number }>("audit.p0")?.value;
  const [rows, setRows] = useState<AuditLogEntry[]>(first?.rows ?? []);
  const [total, setTotal] = useState(first?.total ?? 0);
  const [loading, setLoading] = useState(!first);
  const [open, setOpen] = useState<AuditLogEntry | null>(null);
  const [page, setPage] = useState(0);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [action, setAction] = useState<string>("");
  const [entityKind, setEntityKind] = useState<string>("");
  const [showDates, setShowDates] = useState(false);

  const [facets, setFacets] = useState<{ actions: string[]; entityKinds: string[] }>({ actions: [], entityKinds: [] });

  const load = useCallback(async () => {
    const plain = !from && !to && !actorEmail.trim() && !action && !entityKind && page === 0;
    if (!plain) setLoading(true);
    const query = () => fetchAuditLog({
      from: localToIso(from), to: localToIso(to),
      actorEmail: actorEmail.trim() || undefined,
      action: action || undefined,
      entityKind: entityKind || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    const { rows: data, total: t } = plain ? await fetchCached("audit.p0", query) : await query();
    setRows(data);
    setTotal(t);
    setLoading(false);
  }, [from, to, actorEmail, action, entityKind, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { fetchCached("audit.facets", fetchAuditFacets).then(setFacets); }, []);

  // Revient à la première page quand un filtre change.
  useEffect(() => { setPage(0); }, [from, to, actorEmail, action, entityKind]);

  const resetFilters = () => {
    setFrom(""); setTo(""); setActorEmail(""); setAction(""); setEntityKind("");
  };
  const hasFilters = !!(from || to || actorEmail || action || entityKind);

  const exportCsv = async () => {
    // Jusqu'à 5000 lignes correspondant aux filtres.
    const { rows: allRows } = await fetchAuditLog({
      from: localToIso(from), to: localToIso(to),
      actorEmail: actorEmail.trim() || undefined,
      action: action || undefined,
      entityKind: entityKind || undefined,
      limit: 5000, offset: 0,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(toCsv(allRows), `ooble-audit-${stamp}.csv`);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Options : libellés connus + valeurs vues en base.
  const actionOptions = useMemo(() => [...new Set([...Object.keys(ACTION_LABELS), ...facets.actions])].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), "fr")), [facets.actions]);
  const entityOptions = useMemo(() => [...new Set([...Object.keys(ENTITY_LABELS), ...facets.entityKinds])].sort(), [facets.entityKinds]);

  const columns: Column<AuditLogEntry>[] = [
    { key: "date", header: "Date", width: 150, render: (e) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{dayFmt.format(new Date(e.createdAt))}</span> },
    { key: "who", header: "Auteur", render: (e) => <TwoLine lead={<Avatar name={e.actorEmail?.split("@")[0].replace(/[._-]+/g, " ") ?? "?"} size={26} />} primary={e.actorEmail ?? "N/D"} secondary={e.actorRole ?? undefined} /> },
    { key: "action", header: "Action", render: (e) => <Pill tone={isCritical(e.action) ? "danger" : "neutral"}>{actionLabel(e.action)}</Pill> },
    { key: "entity", header: "Objet", hideBelow: 900, render: (e) => <span style={{ color: C.t2 }}>{entityLabel(e.entityKind)} {e.entityId && <span style={{ color: C.t3, ...mono }}>{shortenId(e.entityId)}</span>}</span> },
  ];

  return (
    <div>
      <Toolbar style={{ marginTop: 0 }} right={<>
        <Button size="sm" variant="ghost" icon={<RefreshCw style={{ width: 14, height: 14 }} />} onClick={() => void load()}>Actualiser</Button>
        <Button size="sm" variant="ghost" icon={<Download style={{ width: 14, height: 14 }} />} onClick={() => void exportCsv()}>Exporter</Button>
      </>}>
        <SearchField value={actorEmail} onChange={setActorEmail} placeholder="Auteur (courriel)" width={240} />
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" className="ui-input" style={selectStyle}>
          <option value="">Toutes les actions</option>
          {actionOptions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>
        <select value={entityKind} onChange={(e) => setEntityKind(e.target.value)} aria-label="Objet" className="ui-input" style={selectStyle}>
          <option value="">Tous les objets</option>
          {entityOptions.map((k) => <option key={k} value={k}>{entityLabel(k)}</option>)}
        </select>
        <Button size="sm" variant={showDates || from || to ? "secondary" : "ghost"} onClick={() => setShowDates((v) => !v)}>Période</Button>
        {hasFilters && <Button size="sm" variant="ghost" icon={<X style={{ width: 14, height: 14 }} />} onClick={resetFilters}>Effacer</Button>}
      </Toolbar>

      {(showDates || from || to) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "-4px 0 12px", fontSize: 12.5, color: C.t3 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>Du
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="ui-input" style={{ ...selectStyle, maxWidth: "none" }} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>au
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="ui-input" style={{ ...selectStyle, maxWidth: "none" }} />
          </label>
        </div>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        onRowClick={setOpen}
        selectedKey={open?.id}
        pageSize={PAGE_SIZE}
        empty={<EmptyState icon={ShieldCheck} title={loading ? "Chargement…" : "Aucune entrée"}
          text={loading ? undefined : hasFilters ? "Aucune entrée ne correspond à ces filtres." : "Aucune action administrative journalisée pour l'instant."} />}
        mobile={(e) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={actionLabel(e.action)} secondary={`${e.actorEmail ?? "N/D"} · ${dayFmt.format(new Date(e.createdAt))}`} /></div>
            {isCritical(e.action) && <Pill tone="danger">Sensible</Pill>}
          </div>
        )}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 12.5, color: C.t3 }}>
        <span style={{ flex: 1 }}>{loading ? "Chargement…" : `${total} entrée${total > 1 ? "s" : ""} · page ${page + 1} sur ${totalPages}`}</span>
        {totalPages > 1 && <>
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Précédente</Button>
          <Button size="sm" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Suivante</Button>
        </>}
      </div>

      {open && (
        <SidePanel title={actionLabel(open.action)} subtitle={dateTimeFmt.format(new Date(open.createdAt))} onClose={() => setOpen(null)} width={560}>
          <KeyValues items={[
            ["Auteur", open.actorEmail ?? "N/D"],
            ["Rôle", open.actorRole ?? "N/D"],
            ["Objet", entityLabel(open.entityKind)],
            ["Identifiant", open.entityId ? <span style={mono}>{open.entityId}</span> : "N/D"],
            ["Code de l'action", <span key="a" style={mono}>{open.action}</span>],
          ]} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18, marginTop: 24 }}>
            <div><p style={{ margin: "0 0 6px", fontSize: 12.5, color: C.t3 }}>Avant</p><JsonBlock value={open.before} /></div>
            <div><p style={{ margin: "0 0 6px", fontSize: 12.5, color: C.t3 }}>Après</p><JsonBlock value={open.after} /></div>
            <div><p style={{ margin: "0 0 6px", fontSize: 12.5, color: C.t3 }}>Métadonnées</p><JsonBlock value={open.metadata} /></div>
          </div>
          <p style={{ margin: "18px 0 0", color: C.t3, ...mono, fontSize: 11 }}>id : {open.id}</p>
        </SidePanel>
      )}
    </div>
  );
};

export default AuditLogPanel;
