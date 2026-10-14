import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { claimReview } from "@/lib/adminKyc";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { Building2, Check, X } from "lucide-react";
import { decideKyb, fetchKyb, getKybDocumentUrl, type KybRequest } from "@/lib/adminKyb";
import type { KybDocKey, OwnerRole } from "@/lib/kyb";
import BusinessMark from "@/components/app/BusinessMark";
import { C, FONT } from "./adminTheme";
import { Button, Notice, TextArea, Workspace, WsPane } from "./ui";
import { Avatar, DataTable, EmptyState, Pill, Tabs, TwoLine, type Column, type Tone } from "./layout";
import { KycHero } from "./heroes";
import { DocViewer, Facts, Section } from "./Dossier";

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
  // Décider : Administrateur, Vérification, Conformité.
  const can = useCan();
  const canDecide = can("kyc.decide");
  const { user } = useAuth();
  const me = user ? { id: user.id, name: user.name || user.email || "Équipe" } : null;
  const [rows, setRows] = useState<KybRequest[]>(() => peek<KybRequest[]>("kyb")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("kyb"));
  const [tab, setTab] = useState<Filter>("pending");
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = rows.find((r) => r.id === detailId) ?? null;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback((p: string) => getKybDocumentUrl(p), []);

  useEffect(() => {
    fetchCached("kyb", fetchKyb).then((r) => { setRows(r); setLoading(false); });
    // En direct : nouveau dossier, dossier pris ou décidé par un collègue.
    let timer: number | undefined;
    const ch = supabase.channel("admin-kyb")
      .on("postgres_changes", { event: "*", schema: "public", table: "business_verifications" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { fetchKyb().then(setRows); }, 400);
      })
      .subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(ch); };
  }, []);
  useEffect(() => { if (!loading) put("kyb", rows); }, [rows, loading]);

  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
  const list = rows.filter((r) => r.status === tab);

  const patch = (id: string, changes: Partial<KybRequest>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  const open = (r: KybRequest) => {
    setDetailId(r.id); setNote(""); setError(null);
  };
  // Ouvrir un dossier à examiner, c'est le prendre ; le fermer le libère.
  const claim = async (r: KybRequest, force = false) => {
    if (!me) return false;
    const res = await claimReview("kyb", r.id, me, { force });
    if (res.error || res.taken) { fetchKyb().then(setRows); return false; }
    patch(r.id, { assignedTo: me.id, assignedName: me.name });
    return true;
  };
  useEffect(() => {
    const r = detail;
    if (!r || r.status !== "pending" || !me || !canDecide) return;
    let mine = r.assignedTo === me.id;
    if (!r.assignedTo) void claim(r).then((ok) => { mine = ok; });
    return () => {
      if (!mine) return;
      setRows((rs) => rs.map((x) => (x.id === r.id && x.assignedTo === me.id ? { ...x, assignedTo: null, assignedName: null } : x)));
      void claimReview("kyb", r.id, null, { me: me.id });
    };
  }, [detailId]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (decision: "approved" | "rejected") => {
    if (!detail) return;
    if (decision === "rejected" && !note.trim()) { setError("Expliquez au client ce qu'il doit corriger."); return; }
    setBusy(true); setError(null);
    const res = await decideKyb(detail, decision, note);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    patch(detail.id, { status: decision, reviewNote: note.trim() || null, reviewedAt: new Date().toISOString(), reviewedByName: me?.name ?? null, assignedTo: null, assignedName: null });
  };

  const columns: Column<KybRequest>[] = [
    { key: "co", header: "Entreprise", sort: (r) => r.legalName, render: (r) => <TwoLine lead={<BusinessMark name={r.legalName} size="sm" />} primary={r.legalName} secondary={r.businessNumber ? `NEQ ${r.businessNumber}` : r.jurisdiction ?? ""} /> },
    { key: "contact", header: "Responsable", hideBelow: 800, render: (r) => <TwoLine primary={r.contactName} secondary={r.email} /> },
    { key: "status", header: "Statut", render: (r) => (r.status === "pending" && r.assignedTo
      ? <span style={{ fontSize: 13, color: C.t2 }}>{me && r.assignedTo === me.id ? "Vous l'examinez" : `${(r.assignedName ?? "Un collègue").split(/[\s@]/)[0]} l'examine`}</span>
      : <Pill tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] ?? r.status}</Pill>) },
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
            <Pill tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] ?? r.status}</Pill>
          </div>
        )} />

      {d && (
        <Workspace title={d.legalName} subtitle={`Vérification d'entreprise · soumise le ${fmtDate(d.createdAt)}`} onClose={() => setDetailId(null)} panes>
          <div className="ws-split">
            {/* Les pièces de l'entreprise sur la table lumineuse : zoom, déplacement, rotation. */}
            <WsPane flat className="ws-media" style={{ padding: "4px 12px 16px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <DocViewer docs={docKeys.map((k) => ({ key: k, label: DOC_LABELS[k], path: d.documents[k] }))} load={load} />
            </WsPane>

            <WsPane flat style={{ display: "flex", flexDirection: "column", fontFamily: FONT }}>
              <div style={{ flex: 1, padding: "8px 20px 20px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <BusinessMark name={d.legalName} size="md" />
                  <div style={{ minWidth: 0, flex: 1 }}><TwoLine primary={d.contactName} secondary={d.email} /></div>
                  <Pill tone={STATUS[d.status]?.[1]}>{STATUS[d.status]?.[0] ?? d.status}</Pill>
                </div>
                <p style={{ margin: "26px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05, textWrap: "balance" } as React.CSSProperties}>{d.legalName}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: C.t3 }}>{d.activity || "Activité non précisée"} · soumise le {fmtDate(d.createdAt)}</p>

                <Section title="Entreprise">
                  <Facts items={[
                    ["Immatriculation", d.jurisdiction],
                    ["NEQ / BN", d.businessNumber],
                    ["Téléphone", d.phone],
                    ["Site web", d.website ? <a key="w" href={/^https?:/i.test(d.website) ? d.website : `https://${d.website}`} target="_blank" rel="noopener noreferrer" style={{ color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>{d.website}</a> : null],
                  ]} />
                  <div style={{ marginTop: 18 }}><Facts cols={1} items={[["Siège", d.address]]} /></div>
                </Section>

                <Section title="Responsable" hint={`${d.contactName} · identité`}>
                  <Pill tone={STATUS[d.contactKyc]?.[1]}>{STATUS[d.contactKyc]?.[0] ?? d.contactKyc}</Pill>
                </Section>

                <Section title="Administrateurs et propriétaires" hint={`${d.owners.length} personne${d.owners.length > 1 ? "s" : ""} · parts déclarées : ${owned} %`}>
                  <div style={{ display: "grid", gap: 14 }}>
                    {d.owners.map((o, i) => {
                      const pct = o.role === "director" || o.ownership == null ? null : Number(o.ownership) || 0;
                      return (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <Avatar name={o.name} size={34} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                              <span style={{ fontSize: 13, color: C.t2, fontVariantNumeric: "tabular-nums" }}>{pct == null ? "—" : `${pct} %`}</span>
                            </div>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {[ROLE_LABELS[o.role] ?? o.role, o.birthDate ? `né(e) le ${fmtDate(o.birthDate)}` : null, o.country].filter(Boolean).join(" · ")}
                            </p>
                            {pct != null && (
                              <div aria-hidden style={{ marginTop: 7, height: 4, borderRadius: 99, background: C.hover3, overflow: "hidden" }}>
                                <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 99, background: "var(--a-sage)" }} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                {d.status !== "pending" && (
                  <Section title="Décision">
                    <p style={{ margin: 0, fontSize: 13.5, color: C.t2 }}>
                      {d.status === "approved" ? "Approuvée" : "Refusée"}{d.reviewedByName ? ` par ${d.reviewedByName}` : ""}{d.reviewedAt ? ` · ${fmtDate(d.reviewedAt)}` : ""}
                    </p>
                    {d.reviewNote && <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: C.t1 }}>« {d.reviewNote} »</p>}
                  </Section>
                )}

                {d.status === "pending" && canDecide && (
                  <Section title="Note au client" hint="Obligatoire en cas de refus.">
                    {d.contactKyc !== "approved" && <div style={{ marginBottom: 12 }}><Notice tone="warn">L'identité du responsable n'est pas encore vérifiée ({(STATUS[d.contactKyc]?.[0] ?? d.contactKyc).toLowerCase()}).</Notice></div>}
                    <TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : le registre des administrateurs fourni date de plus d'un an." />
                  </Section>
                )}

              </div>

              {d.status === "pending" && canDecide && (
                <div className="ws-foot">
                  {error && <div style={{ marginBottom: 10 }}><Notice tone="err">{error}</Notice></div>}
                  {d.assignedTo && me && d.assignedTo !== me.id ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <p style={{ margin: 0, fontSize: 13, color: C.t2 }}>{d.assignedName ?? "Un collègue"} examine ce dossier en ce moment.</p>
                      <Button onClick={() => void claim(d, true)}>Reprendre le dossier</Button>
                    </div>
                  ) : <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="danger" disabled={busy} onClick={() => decide("rejected")} icon={<X style={{ width: 15, height: 15 }} />}>Refuser</Button>
                    <Button variant="primary" disabled={busy} onClick={() => decide("approved")} icon={<Check style={{ width: 15, height: 15 }} />} className="flex-1">Approuver</Button>
                  </div>}
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
