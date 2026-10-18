import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { orderRef } from "@/lib/orders";
import { firstName } from "@/lib/teamSpace";
import { C } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { GR_CSS, Opts } from "./GrowthPanel";
import { TV_CSS, useTeamLive, when } from "./TeamViews";

/**
 * Demandes d'approbation : avant une action sensible (remboursement, gros montant, changement de marge),
 * un membre demande l'accord d'un administrateur. L'admin approuve ou refuse ; la personne est prévenue,
 * et tout est inscrit au journal d'audit. La demande trace l'accord : elle ne bloque pas l'action elle-même.
 */

export type ApprovalKind = "refund" | "amount" | "margin" | "other";
const KINDS: { v: ApprovalKind; label: string }[] = [
  { v: "refund", label: "Remboursement" }, { v: "amount", label: "Gros montant" }, { v: "margin", label: "Marge ou taux" }, { v: "other", label: "Autre" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.v === k)?.label ?? "Autre";

interface Approval {
  id: string; kind: string; title: string; details: string | null; amount: number | null; orderId: string | null;
  requestedBy: string; requestedByName: string; status: "pending" | "approved" | "refused" | "cancelled";
  decidedByName: string | null; decidedAt: string | null; note: string | null; at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;

async function loadApprovals(): Promise<Approval[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from as any)("team_approvals").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), kind: String(r.kind), title: String(r.title), details: (r.details as string) ?? null, amount: r.amount_cad == null ? null : Number(r.amount_cad),
    orderId: (r.order_id as string) ?? null, requestedBy: String(r.requested_by), requestedByName: String(r.requested_by_name), status: r.status as Approval["status"],
    decidedByName: (r.decided_by_name as string) ?? null, decidedAt: (r.decided_at as string) ?? null, note: (r.decision_note as string) ?? null, at: String(r.created_at),
  }));
}

const money = (n: number) => `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

/** Mon espace : les demandes à approuver (administrateurs) et mes demandes. */
export function ApprovalsBlock({ onOpenOrder }: { onOpenOrder?: (orderId: string) => void }) {
  const { user, isAdmin } = useAuth();
  const me = user?.id ?? "";
  const [list, setList] = useState<Approval[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { loadApprovals().then(setList).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_approvals"]);

  const decide = async (a: Approval, status: "approved" | "refused" | "cancelled") => {
    const note = status === "refused" ? window.prompt("Pourquoi ? (facultatif, la personne le verra)") : null;
    if (status === "refused" && note === null) return;
    const { error } = await rpc("team_approval_decide", { _id: a.id, _status: status, _note: note });
    if (error) setErr(error.message); else { setErr(null); load(); }
  };

  const toDecide = (list ?? []).filter((a) => a.status === "pending" && isAdmin && a.requestedBy !== me);
  const mine = (list ?? []).filter((a) => a.requestedBy === me).slice(0, 5);
  const statusText = (a: Approval) => a.status === "pending" ? "en attente d'un administrateur"
    : a.status === "cancelled" ? "retirée"
    : `${a.status === "approved" ? "approuvée" : "refusée"} par ${firstName(a.decidedByName ?? "")}${a.decidedAt ? `, ${when(a.decidedAt)}` : ""}${a.note ? ` · « ${a.note} »` : ""}`;

  const line = (a: Approval, actions: React.ReactNode) => (
    <div key={a.id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.bds}` }}>
      <p style={{ margin: 0, fontSize: 15, color: C.t1, overflowWrap: "anywhere" }}>{a.title}</p>
      <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.t3 }}>
        {kindLabel(a.kind)}{a.amount != null ? ` · ${money(a.amount)}` : ""}
        {a.orderId && <> · {onOpenOrder ? <button type="button" className="tv-link" style={{ fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => onOpenOrder(a.orderId!)}>{orderRef(a.orderId)}</button> : orderRef(a.orderId)}</>}
        {" · "}{a.requestedBy === me ? statusText(a) : `${firstName(a.requestedByName)}, ${when(a.at)}`}
      </p>
      {a.details && <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: C.t2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{a.details}</p>}
      {actions && <p style={{ margin: "8px 0 0", display: "flex", gap: 20, flexWrap: "wrap" }}>{actions}</p>}
    </div>
  );

  return (
    <section className="tv-rise">
      <style>{TV_CSS}</style>
      <div className="ms-head">
        <p className="ms-grp">Demandes d'approbation{toDecide.length ? ` · ${toDecide.length} à décider` : ""}</p>
        <button type="button" className="ms-link" onClick={() => setAsking(true)}><Plus style={{ width: 14, height: 14 }} />Demander</button>
      </div>
      {list && toDecide.length === 0 && mine.length === 0 && <p style={{ margin: 0, padding: "16px 0", fontSize: 14, color: C.t3 }}>Aucune demande en cours.</p>}
      {toDecide.map((a) => line(a, <>
        <button type="button" className="tv-go" onClick={() => decide(a, "approved")}>Approuver <ArrowRight style={{ width: 14, height: 14 }} /></button>
        <button type="button" className="tv-link" style={{ fontSize: 14 }} onClick={() => decide(a, "refused")}>Refuser</button>
      </>))}
      {mine.map((a) => line(a, a.status === "pending" ? <button type="button" className="tv-link" style={{ fontSize: 13.5 }} onClick={() => decide(a, "cancelled")}>Retirer ma demande</button> : null))}
      {err && <div style={{ marginTop: 12 }}><Notice tone="err">{err}</Notice></div>}
      {asking && <ApprovalForm onClose={() => setAsking(false)} onSent={() => { setAsking(false); load(); }} />}
    </section>
  );
}

/** Nouvelle demande (depuis Mon espace, ou depuis une commande). */
export function ApprovalForm({ order, onClose, onSent }: { order?: { id: string; ref: string; cad?: number }; onClose: () => void; onSent: () => void }) {
  const [kind, setKind] = useState<ApprovalKind>(order ? "refund" : "other");
  const [title, setTitle] = useState(order ? `Rembourser ${order.ref}` : "");
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState(order?.cad ? String(order.cad) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setErr(null);
    const n = Number(amount.replace(/\s/g, "").replace(",", "."));
    const { error } = await rpc("team_approval_request", { _kind: kind, _title: title, _details: details, _amount: amount.trim() && Number.isFinite(n) ? n : null, _order: order?.id ?? null, _client: null });
    setBusy(false);
    if (error) setErr(error.message); else onSent();
  };
  return (
    <SidePanel title="Demander une approbation" subtitle="Un administrateur approuve ou refuse ; vous êtes prévenu" onClose={onClose} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><button type="button" className="tv-go" disabled={busy || !title.trim()} onClick={send}>{busy ? "Envoi…" : "Envoyer la demande"} <ArrowRight style={{ width: 15, height: 15 }} /></button></>}>
      <style>{TV_CSS + GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}><Opts value={kind} onChange={setKind} options={KINDS} /></p>
      <label style={{ display: "block", marginTop: 16 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Ce que vous voulez faire</span>
        <input className="gr-in" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Rembourser le client, ou baisser la marge d'achat à 1,5 %" autoFocus /></label>
      <label style={{ display: "block", marginTop: 18 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Montant en dollars (facultatif)</span>
        <input className="gr-in" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
      <label style={{ display: "block", marginTop: 18 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Pourquoi (facultatif)</span>
        <textarea className="tv-ta" rows={3} value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} /></label>
      {order && <p style={{ margin: "14px 0 0", fontSize: 12.5, color: C.t3 }}>Rattachée à la commande {order.ref}.</p>}
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}
