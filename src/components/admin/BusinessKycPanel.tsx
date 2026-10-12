import { useCallback, useEffect, useState } from "react";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { Building2, Check, X } from "lucide-react";
import { decideKyb, fetchKyb, getKybDocumentUrl, resetKyb, type KybRequest } from "@/lib/adminKyb";
import type { KybDocKey, OwnerRole } from "@/lib/kyb";
import { useAuth } from "@/lib/auth";
import BusinessMark from "@/components/app/BusinessMark";
import { C, FONT } from "./adminTheme";
import { Button, Field, Notice, TextArea, Workspace, WsPane } from "./ui";
import { DataTable, EmptyState, KeyValues, Pill, Tabs, TwoLine, type Column, type Tone } from "./layout";
import { KycHero } from "./heroes";
import DocFrame from "./DocFrame";

type Filter = "pending" | "approved" | "rejected";

const DOC_LABELS: Record<KybDocKey, string> = {
  incorporation: "Acte constitutif",
  registry: "Registre des administrateurs",
  address_proof: "Preuve d'adresse",
};
const ROLE_LABELS: Record<OwnerRole, string> = { director: "Administrateur", owner: "Propriétaire", both: "Administrateur et propriétaire" };
const STATUS: Record<string, [string, Tone]> = {
  not_started: ["Non commencée", "neutral"], pending: ["À examiner", "warn"], approved: ["Vérifiée", "ok"], rejected: ["Refusée", "danger"],
};

/** Une date seule (« 1990-04-12 ») est lue en heure locale, pas en UTC (sinon la veille s'affiche). */
const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
};

const BusinessKycPanel = () => {
  const { roles } = useAuth();
  const canDecide = roles.includes("admin") || roles.includes("kyc_reviewer");
  const isAdmin = roles.includes("admin");
  const [rows, setRows] = useState<KybRequest[]>(() => peek<KybRequest[]>("kyb")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("kyb"));
  const [tab, setTab] = useState<Filter>("pending");
  const [detail, setDetail] = useState<KybRequest | null>(null);
  const [doc, setDoc] = useState<KybDocKey>("incorporation");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<"idle" | "confirm" | "busy">("idle");
  const load = useCallback((p: string) => getKybDocumentUrl(p), []);

  useEffect(() => { fetchCached("kyb", fetchKyb).then((r) => { setRows(r); setLoading(false); }); }, []);
  useEffect(() => { if (!loading) put("kyb", rows); }, [rows, loading]);

  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
  const list = rows.filter((r) => r.status === tab);

  const open = (r: KybRequest) => {
    setDetail(r); setNote(""); setError(null); setResetStep("idle");
    setDoc((Object.keys(DOC_LABELS) as KybDocKey[]).find((k) => r.documents[k]) ?? "incorporation");
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (!detail) return;
    if (decision === "rejected" && !note.trim()) { setError("Expliquez au client ce qu'il doit corriger."); return; }
    setBusy(true); setError(null);
    const res = await decideKyb(detail, decision, note);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    const updated = { ...detail, status: decision, reviewNote: note.trim() || null, reviewedAt: new Date().toISOString() };
    setRows((rs) => rs.map((r) => (r.id === detail.id ? updated : r)));
    setDetail(updated);
  };

  const reset = async () => {
    if (!detail) return;
    setResetStep("busy"); setError(null);
    const res = await resetKyb(detail.userId, { businessStatus: detail.status, businessName: detail.legalName });
    setResetStep("idle");
    if (res.error) { setError(res.error); return; }
    setRows((rs) => rs.filter((r) => r.userId !== detail.userId));
    setDetail(null);
  };

  const columns: Column<KybRequest>[] = [
    { key: "co", header: "Entreprise", sort: (r) => r.legalName, render: (r) => <TwoLine lead={<BusinessMark name={r.legalName} size="sm" />} primary={r.legalName} secondary={r.businessNumber ? `NEQ ${r.businessNumber}` : r.jurisdiction ?? ""} /> },
    { key: "contact", header: "Responsable", hideBelow: 800, render: (r) => <TwoLine primary={r.contactName} secondary={r.email} /> },
    { key: "status", header: "Statut", render: (r) => <Pill tone={STATUS[r.status]?.[1]} dot>{STATUS[r.status]?.[0] ?? r.status}</Pill> },
    { key: "date", header: "Soumis", align: "right", sort: (r) => r.createdAt, hideBelow: 700, render: (r) => <span style={{ color: C.t2 }}>{fmtDate(r.createdAt)}</span> },
  ];

  const d = detail;
  const owned = d ? d.owners.reduce((s, o) => s + (o.role === "director" ? 0 : Number(o.ownership) || 0), 0) : 0;
  const docKeys = Object.keys(DOC_LABELS) as KybDocKey[];

  return (
    <div>
      <KycHero noun="entreprise" loading={loading} waiting={counts.pending} approved={counts.approved} rejected={counts.rejected}
        oldestMins={counts.pending ? Math.max(...rows.filter((r) => r.status === "pending").map((r) => (Date.now() - new Date(r.createdAt).getTime()) / 60000)) : null} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: "pending", label: "À examiner", count: counts.pending, tone: "warn" },
        { id: "approved", label: "Vérifiées", count: counts.approved },
        { id: "rejected", label: "Refusées", count: counts.rejected },
      ]} />
      <DataTable rows={list} columns={columns} rowKey={(r) => r.id} onRowClick={open} initialSort={{ key: "date", dir: "desc" }}
        empty={<EmptyState icon={Building2} title={loading ? "Chargement…" : "Aucun dossier ici"} />}
        mobile={(r) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BusinessMark name={r.legalName} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={r.legalName} secondary={`${r.contactName} · ${fmtDate(r.createdAt)}`} /></div>
            <Pill tone={STATUS[r.status]?.[1]} dot>{STATUS[r.status]?.[0] ?? r.status}</Pill>
          </div>
        )} />

      {d && (
        <Workspace title={d.legalName} subtitle={`Vérification d'entreprise · soumise le ${fmtDate(d.createdAt)}`} onClose={() => setDetail(null)} panes>
          <div className="grid flex-1 grid-cols-1 gap-2 lg:gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden" style={{ minHeight: 0 }}>
            <WsPane style={{ padding: "20px 24px 60px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
                {docKeys.map((k) => (
                  <button key={k} type="button" onClick={() => setDoc(k)} className="ui-btn"
                    style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${doc === k ? C.bd : "transparent"}`, background: doc === k ? C.l2 : "transparent", color: doc === k ? C.t1 : d.documents[k] ? C.t2 : C.t3, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>
                    {DOC_LABELS[k]}{!d.documents[k] && " · non fourni"}
                  </button>
                ))}
              </div>
              <DocFrame key={`${d.id}:${doc}`} label={DOC_LABELS[doc]} path={d.documents[doc]} load={load} height={620} />
            </WsPane>

            <WsPane flat style={{ padding: "24px 24px 40px", fontFamily: FONT }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <BusinessMark name={d.legalName} size="md" />
                <div style={{ minWidth: 0, flex: 1 }}><TwoLine primary={d.legalName} secondary={`${d.contactName} · ${d.email}`} /></div>
                <Pill tone={STATUS[d.status]?.[1]} dot>{STATUS[d.status]?.[0] ?? d.status}</Pill>
              </div>
              <KeyValues items={[
                ["Immatriculation", d.jurisdiction ?? "—"],
                ["NEQ / BN", d.businessNumber ?? "—"],
                ["Siège", d.address],
                ["Téléphone", d.phone ?? "—"],
                ["Site web", d.website ?? "—"],
                ["Activité", d.activity],
                ["Identité du responsable", <Pill key="k" tone={STATUS[d.contactKyc]?.[1]} dot>{STATUS[d.contactKyc]?.[0] ?? d.contactKyc}</Pill>],
              ]} />

              <h3 style={{ margin: "26px 0 4px", fontSize: 14, fontWeight: 500 }}>Administrateurs et propriétaires</h3>
              <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t3 }}>{d.owners.length} personne{d.owners.length > 1 ? "s" : ""} · parts déclarées : {owned} %</p>
              <div style={{ borderTop: `1px solid ${C.bds}` }}>
                {d.owners.map((o, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${C.bds}`, display: "flex", gap: 12, alignItems: "baseline" }}>
                    <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={o.name} secondary={[ROLE_LABELS[o.role] ?? o.role, o.birthDate ? `né(e) le ${fmtDate(o.birthDate)}` : null, o.country].filter(Boolean).join(" · ")} /></div>
                    <span style={{ fontSize: 13, color: C.t2, fontVariantNumeric: "tabular-nums" }}>{o.role === "director" || o.ownership == null ? "—" : `${o.ownership} %`}</span>
                  </div>
                ))}
              </div>

              {d.status !== "pending" && d.reviewNote && (
                <>
                  <h3 style={{ margin: "26px 0 8px", fontSize: 14, fontWeight: 500 }}>Note envoyée au client</h3>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: C.t2 }}>{d.reviewNote}</p>
                </>
              )}

              {d.status === "pending" && canDecide && (
                <>
                  <h3 style={{ margin: "26px 0 10px", fontSize: 14, fontWeight: 500 }}>Décision</h3>
                  {d.contactKyc !== "approved" && <div style={{ marginBottom: 12 }}><Notice tone="warn">L'identité du responsable n'est pas encore vérifiée ({(STATUS[d.contactKyc]?.[0] ?? d.contactKyc).toLowerCase()}).</Notice></div>}
                  <Field label="Note au client" hint="Obligatoire en cas de refus.">
                    <TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : le registre des administrateurs fourni date de plus d'un an." />
                  </Field>
                  {error && <div style={{ marginTop: 12 }}><Notice tone="err">{error}</Notice></div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <Button variant="danger" disabled={busy} onClick={() => decide("rejected")} icon={<X style={{ width: 15, height: 15 }} />}>Refuser</Button>
                    <Button variant="primary" disabled={busy} onClick={() => decide("approved")} icon={<Check style={{ width: 15, height: 15 }} />} className="flex-1">Approuver</Button>
                  </div>
                </>
              )}

              {isAdmin && (
                <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.bds}` }}>
                  {d.status !== "pending" && error && <div style={{ marginBottom: 10 }}><Notice tone="err">{error}</Notice></div>}
                  {resetStep === "confirm" ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ flex: "1 1 180px", fontSize: 13, color: C.t2 }}>Supprimer ce dossier ? Le client repartira d'un dossier vide.</span>
                      <Button size="sm" variant="ghost" onClick={() => setResetStep("idle")}>Annuler</Button>
                      <Button size="sm" variant="danger" onClick={reset}>Réinitialiser</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={resetStep === "busy"} onClick={() => { setError(null); setResetStep("confirm"); }}>
                      {resetStep === "busy" ? "Réinitialisation…" : "Réinitialiser la vérification"}
                    </Button>
                  )}
                </div>
              )}
            </WsPane>
          </div>
        </Workspace>
      )}
    </div>
  );
};

export default BusinessKycPanel;
