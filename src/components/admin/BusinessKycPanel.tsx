import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/lib/roles";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { Building2, Check, X } from "lucide-react";
import { decideKyb, fetchKyb, getKybDocumentUrl, resetKyb, type KybRequest } from "@/lib/adminKyb";
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
  // Décider : Administrateur, Vérification, Conformité. Réinitialiser un dossier : Administrateur.
  const can = useCan();
  const canDecide = can("kyc.decide");
  const isAdmin = can("clients.manage");
  const [rows, setRows] = useState<KybRequest[]>(() => peek<KybRequest[]>("kyb")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("kyb"));
  const [tab, setTab] = useState<Filter>("pending");
  const [detail, setDetail] = useState<KybRequest | null>(null);
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
          <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-2 lg:overflow-hidden" style={{ minHeight: 0 }}>
            {/* Les pièces de l'entreprise en grand, les autres en vignettes dessous. */}
            <WsPane flat className="h-[64vh] lg:h-auto" style={{ padding: "4px 8px 12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <DocViewer docs={docKeys.map((k) => ({ key: k, label: DOC_LABELS[k], path: d.documents[k] }))} load={load} />
            </WsPane>

            <WsPane style={{ display: "flex", flexDirection: "column", fontFamily: FONT }}>
              <div style={{ flex: 1, padding: "26px 26px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <BusinessMark name={d.legalName} size="md" />
                  <div style={{ minWidth: 0, flex: 1 }}><TwoLine primary={d.contactName} secondary={d.email} /></div>
                  <Pill tone={STATUS[d.status]?.[1]} dot>{STATUS[d.status]?.[0] ?? d.status}</Pill>
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
                  <Pill tone={STATUS[d.contactKyc]?.[1]} dot>{STATUS[d.contactKyc]?.[0] ?? d.contactKyc}</Pill>
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

                {d.status !== "pending" && d.reviewNote && (
                  <Section title="Note envoyée au client">
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: C.t2 }}>{d.reviewNote}</p>
                  </Section>
                )}

                {d.status === "pending" && canDecide && (
                  <Section title="Note au client" hint="Obligatoire en cas de refus.">
                    {d.contactKyc !== "approved" && <div style={{ marginBottom: 12 }}><Notice tone="warn">L'identité du responsable n'est pas encore vérifiée ({(STATUS[d.contactKyc]?.[0] ?? d.contactKyc).toLowerCase()}).</Notice></div>}
                    <TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : le registre des administrateurs fourni date de plus d'un an." />
                  </Section>
                )}

                {isAdmin && (
                  <div style={{ marginTop: 30 }}>
                    {d.status !== "pending" && error && <div style={{ marginBottom: 10 }}><Notice tone="err">{error}</Notice></div>}
                    {resetStep === "confirm" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ flex: "1 1 180px", fontSize: 13, color: C.t2 }}>Supprimer ce dossier ? Le client repartira d'un dossier vide.</span>
                        <Button size="sm" variant="ghost" onClick={() => setResetStep("idle")}>Annuler</Button>
                        <Button size="sm" variant="danger" onClick={reset}>Réinitialiser</Button>
                      </div>
                    ) : (
                      <button type="button" disabled={resetStep === "busy"} onClick={() => { setError(null); setResetStep("confirm"); }}
                        style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: C.t3, textDecoration: "underline", textUnderlineOffset: 3 }}>
                        {resetStep === "busy" ? "Réinitialisation…" : "Réinitialiser la vérification"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {d.status === "pending" && canDecide && (
                <div style={{ position: "sticky", bottom: 0, padding: "14px 26px calc(18px + env(safe-area-inset-bottom, 0px))", background: C.bg }}>
                  {error && <div style={{ marginBottom: 10 }}><Notice tone="err">{error}</Notice></div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="danger" disabled={busy} onClick={() => decide("rejected")} icon={<X style={{ width: 15, height: 15 }} />}>Refuser</Button>
                    <Button variant="primary" disabled={busy} onClick={() => decide("approved")} icon={<Check style={{ width: 15, height: 15 }} />} className="flex-1">Approuver</Button>
                  </div>
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
