import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Ban, Banknote, Check, ChevronRight, Copy, ExternalLink, Hand, RotateCcw, Send, Trash2 } from "lucide-react";
import { CURRENT_OPERATOR, TYPE_META, nfCad, nfUsdt, timeAgo, type AdminOrder } from "@/lib/adminOrders";
import { fetchOrderEvents, type OrderEvent } from "@/lib/adminOrderEvents";
import { sendRefundEmail } from "@/lib/email";
import { useAuth } from "@/lib/auth";
import { NETWORKS } from "@/components/app/networks";
import { fetchDeposits, fetchPayouts, sendPayout, txUrl, type ChainDeposit, type UsdtPayout } from "@/lib/settlement";
import { supabase } from "@/integrations/supabase/client";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { Avatar, KeyValues, Pill } from "./layout";
import { DEPOSIT_PILL, OrderChannel, OrderStatusPill, PAYOUT_PILL } from "./orderBits";

interface Props {
  order: AdminOrder;
  onBack: () => void;
  onPatch: (id: string, changes: Partial<AdminOrder>) => void;
  onDelete: (id: string) => void;
  onShowClient?: (userId: string) => void;
  /** Relit les commandes (après un envoi d'USDT, le statut change côté serveur). */
  onRefresh?: () => void;
}

const dateFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const EVENT_LABEL: Record<string, string> = {
  created: "Commande créée", awaiting_payment: "En attente de paiement", payment_received: "Fonds reçus",
  settling: "Prise en charge", completed: "Terminée", cancelled: "Annulée", expired: "Expirée", refunded: "Remboursée",
};

/** Réseaux où l'envoi des USDT part du portefeuille d'envoi (Solana : à la main). */
const AUTO_NETWORKS = new Set(["trx", "bnb", "matic", "avax", "eth"]);

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (v: string, k: string) => {
    navigator.clipboard?.writeText(v).catch(() => {});
    setCopied(k);
    setTimeout(() => setCopied((c) => (c === k ? null : c)), 1200);
  };
  return { copied, copy };
}

function CopyValue({ value, k, copy, copied, mono }: { value?: string | null; k: string; copy: (v: string, k: string) => void; copied: string | null; mono?: boolean }) {
  if (!value) return <span style={{ color: C.t3 }}>—</span>;
  return (
    <button type="button" onClick={() => copy(value, k)} title="Copier"
      style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "100%", wordBreak: "break-all", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : FONT, fontSize: mono ? 12.5 : 13.5 }}>
      <span>{value}</span>
      {copied === k ? <Check style={{ width: 14, height: 14, color: C.successText, flexShrink: 0 }} /> : <Copy style={{ width: 13, height: 13, color: C.t3, flexShrink: 0 }} />}
    </button>
  );
}

function Block({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 500 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ─── Envoi des USDT (achat) ─── */
function PayoutStep({ order, list, onChanged }: { order: AdminOrder; list: UsdtPayout[] | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const active = (list ?? []).find((p) => p.status !== "failed");
  const last = list?.[0];
  const canSend = order.status === "recu" && !active && list !== null && AUTO_NETWORKS.has(order.network ?? "");
  if (!last && !canSend) return null;

  const go = async () => {
    setBusy(true);
    setMsg(null);
    const r = await sendPayout(order.id);
    setBusy(false);
    setMsg(r.ok
      ? { ok: true, text: r.status === "confirmed" ? "USDT envoyés et confirmés. Le client a reçu son courriel." : "Transaction diffusée, confirmation en cours.", url: r.url }
      : { ok: false, text: r.error ?? "Échec de l'envoi.", url: r.url });
    onChanged();
  };

  return (
    <Block title="Envoi des USDT">
      <div style={{ borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}`, padding: "16px 0", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0, fontSize: 13.5, lineHeight: 1.55, color: C.t2 }}>
          {last ? (
            <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <Pill tone={PAYOUT_PILL[last.status]?.tone}>{PAYOUT_PILL[last.status]?.label ?? last.status}</Pill>
              {last.trigger === "auto" ? "Envoyé automatiquement" : "Lancé par l'équipe"}
              {last.tx_hash && txUrl(last.network, last.tx_hash) && (
                <a href={txUrl(last.network, last.tx_hash)} target="_blank" rel="noreferrer" style={{ color: C.t1, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Voir la transaction <ExternalLink style={{ width: 12, height: 12 }} />
                </a>
              )}
            </span>
          ) : (
            <>{nfUsdt.format(order.usdt)} USDT vers l'adresse du client, depuis le portefeuille d'envoi. Vérifiez d'abord le dépôt Interac dans le compte bancaire.</>
          )}
          {last?.error && <span style={{ display: "block", marginTop: 6, color: C.t3 }}>{last.error}</span>}
        </div>
        {canSend && (
          <Button variant="primary" size="lg" disabled={busy} onClick={go} icon={<Send style={{ width: 16, height: 16 }} />}>
            {busy ? "Envoi en cours…" : `Envoyer ${nfUsdt.format(order.usdt)} USDT`}
          </Button>
        )}
      </div>
      {msg && <div style={{ marginTop: 12 }}><Notice tone={msg.ok ? "ok" : "err"}>{msg.text}{msg.url && <> · <a href={msg.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>transaction</a></>}</Notice></div>}
    </Block>
  );
}

/* ─── Vente : USDT reçus et virement Interac à envoyer ─── */
function SellStep({ order, copy, copied }: { order: AdminOrder; copy: (v: string, k: string) => void; copied: string | null }) {
  const [deps, setDeps] = useState<ChainDeposit[] | null>(null);
  const [qa, setQa] = useState<{ q: string | null; a: string | null } | null>(null);
  useEffect(() => {
    fetchDeposits({ orderId: order.id, limit: 5 }).then(setDeps);
    if (order.userId) {
      supabase.from("profiles").select("interac_question, interac_answer").eq("id", order.userId).maybeSingle()
        .then(({ data }) => setQa({ q: data?.interac_question ?? null, a: data?.interac_answer ?? null }));
    }
  }, [order.id, order.userId, order.status]);
  const dep = (deps ?? []).find((d) => d.status === "matched") ?? deps?.[0];
  const solana = order.network === "sol";

  return (
    <>
      <Block title="USDT du client">
        <p style={{ margin: 0, padding: "14px 0", borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}`, fontSize: 13.5, lineHeight: 1.6, color: C.t2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          {dep ? (
            <>
              <Pill tone={DEPOSIT_PILL[dep.status]?.tone}>{DEPOSIT_PILL[dep.status]?.label ?? dep.status}</Pill>
              {nfUsdt.format(Number(dep.usdt_amount))} USDT reçus
              {txUrl(dep.network, dep.tx_hash) && (
                <a href={txUrl(dep.network, dep.tx_hash)} target="_blank" rel="noreferrer" style={{ color: C.t1, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Voir la transaction <ExternalLink style={{ width: 12, height: 12 }} />
                </a>
              )}
              {dep.status !== "matched" && dep.reason && <span>· {dep.reason}</span>}
            </>
          ) : solana
            ? "Solana n'est pas surveillé : vérifiez l'arrivée des USDT dans le portefeuille de dépôt, puis « Marquer les USDT reçus »."
            : order.status === "attente"
              ? `En attente de ${nfUsdt.format(order.usdt)} USDT sur l'adresse de dépôt. Lecture automatique toutes les 2 minutes : la commande passe seule à « À traiter » dès leur arrivée.`
              : "Aucun dépôt lu automatiquement pour cette vente."}
        </p>
      </Block>
      {order.status === "recu" && (
        <Block title="Virement Interac à envoyer">
          <KeyValues items={[
            ["Destinataire", <CopyValue key="m" value={order.interacEmail} k="mail" copy={copy} copied={copied} />],
            ["Montant", <CopyValue key="a" value={nfCad.format(order.cad)} k="amt" copy={copy} copied={copied} />],
            ["Question de sécurité", <CopyValue key="q" value={qa?.q} k="q" copy={copy} copied={copied} />],
            ["Réponse", <CopyValue key="r" value={qa?.a} k="a" copy={copy} copied={copied} />],
            ["Message", <CopyValue key="g" value={order.ref} k="msg" copy={copy} copied={copied} />],
          ]} />
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.t3, lineHeight: 1.55 }}>
            Envoyez le virement depuis le compte d'Ooble, puis « Virement Interac envoyé » : le client reçoit son courriel de fin.
          </p>
        </Block>
      )}
    </>
  );
}

const OrderDetail = ({ order, onPatch, onDelete, onShowClient, onRefresh }: Props) => {
  const { isAdmin } = useAuth();
  const { copied, copy } = useCopy();
  const [payouts, setPayouts] = useState<UsdtPayout[] | null>(null);
  const loadPayouts = useCallback(() => {
    if (order.type !== "buy") { setPayouts([]); return; }
    fetchPayouts(order.id, 5).then(setPayouts);
  }, [order.id, order.type]);
  useEffect(() => { loadPayouts(); }, [loadPayouts, order.status]);
  const [events, setEvents] = useState<OrderEvent[] | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const lockedByOther = !!order.assignedTo && order.assignedTo !== CURRENT_OPERATOR;

  useEffect(() => {
    let active = true;
    setEvents(null);
    fetchOrderEvents(order.id).then((e) => { if (active) setEvents(e); });
    return () => { active = false; };
  }, [order.id, order.status, order.assignedTo]);

  // De l'argent est parti (ou part) vers le client : la commande est figée.
  const activePayout = (payouts ?? []).find((p) => p.status !== "failed");
  const finished = order.status === "termine" || order.status === "rembourse";
  const locked = !!activePayout || finished;
  // Suppression : seulement une commande sans aucun mouvement d'argent.
  const canDelete = (order.status === "attente" || order.status === "annule") && (payouts ?? []).length === 0;
  const refundAmount = order.type === "buy" ? `${nfCad.format(order.cad)} CAD` : `${nfUsdt.format(order.usdt)} USDT`;

  const handleRefund = async () => {
    setRefunding(true);
    setRefundError(null);
    const { error } = await sendRefundEmail({ to: order.clientEmail, clientName: order.clientName, ref: order.ref, amount: refundAmount });
    if (error) { setRefundError(error); setRefunding(false); return; }
    onPatch(order.id, { status: "rembourse" });
    setConfirmRefund(false);
    setRefunding(false);
  };

  const sends = order.type === "buy" ? `${nfCad.format(order.cad)} $` : `${nfUsdt.format(order.usdt)} USDT`;
  const receives = order.type === "buy" ? `${nfUsdt.format(order.usdt)} USDT` : `${nfCad.format(order.cad)} $`;
  const createdAt = dateFmt.format(new Date(Date.now() - order.createdMinsAgo * 60000));
  const net = NETWORKS.find((x) => x.id === order.network);

  /*
    Règles des actions :
    • des USDT sont partis (ou en cours) ou la commande est terminée / remboursée → aucune action ;
    • en attente → marquer le paiement reçu, ou annuler ;
    • paiement reçu → envoyer (achat, bloc dédié), terminer à la main (vente, ou réseau sans
      envoi automatique), ou rembourser ; plus d'annulation : l'argent est là, on rembourse ;
    • annulée → rouvrir.
  */
  const actions = lockedByOther ? null : (
    <>
      {!finished && !order.assignedTo && (order.status === "recu" || order.status === "attente") && (
        <Button icon={<Hand style={{ width: 15, height: 15 }} />} onClick={() => onPatch(order.id, { assignedTo: CURRENT_OPERATOR })}>Prendre en charge</Button>
      )}
      {!finished && order.assignedTo === CURRENT_OPERATOR && <Button variant="ghost" onClick={() => onPatch(order.id, { assignedTo: null })}>Libérer</Button>}
      {!locked && (order.status === "attente" || order.status === "cours") && (
        <Button variant="ghost" icon={<Ban style={{ width: 15, height: 15 }} />} onClick={() => onPatch(order.id, { status: "annule" })}>Annuler</Button>
      )}
      {!locked && order.status === "annule" && (
        <Button icon={<RotateCcw style={{ width: 15, height: 15 }} />} onClick={() => onPatch(order.id, { status: "attente", assignedTo: null })}>Rouvrir</Button>
      )}
      {!locked && order.status === "recu" && (
        <Button variant="danger" icon={<Banknote style={{ width: 15, height: 15 }} />} onClick={() => setConfirmRefund(true)}>Rembourser</Button>
      )}
      {!locked && (order.status === "attente" || order.status === "cours") && (
        <Button variant="primary" icon={<Check style={{ width: 15, height: 15 }} />} onClick={() => onPatch(order.id, { status: "recu" })}>
          {order.type === "buy" ? "Marquer le paiement reçu" : "Marquer les USDT reçus"}
        </Button>
      )}
      {!locked && order.status === "recu" && (order.type === "sell" || !AUTO_NETWORKS.has(order.network ?? "")) && (
        <Button variant="primary" icon={<Check style={{ width: 15, height: 15 }} />} onClick={() => onPatch(order.id, { status: "termine" })}>
          {order.type === "sell" ? "Virement Interac envoyé" : "Marquer terminé (envoi à la main)"}
        </Button>
      )}
    </>
  );

  const steps = [
    { label: "Commande créée", hint: timeAgo(order.createdMinsAgo), actor: undefined as string | undefined },
    ...(events ?? []).map((e) => ({ label: EVENT_LABEL[e.status] ?? e.status, actor: e.actor, hint: timeFmt.format(new Date(e.createdAt)) })),
  ];

  return (
    <div>
      {/* En-tête */}
      <header style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 28 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>{TYPE_META[order.type].label} de USDT</h1>
            <OrderStatusPill status={order.status} />
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: C.t3, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <CopyValue value={order.ref} k="ref" copy={copy} copied={copied} />
            <span>·</span><span>{createdAt}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{actions}</div>
      </header>

      {lockedByOther && <div style={{ marginBottom: 20 }}><Notice tone="info">Cette commande est traitée par <b>{order.assignedTo}</b>. Elle doit être libérée avant que vous puissiez agir.</Notice></div>}

      {confirmRefund && (
        <div style={{ marginBottom: 20, padding: "16px 0", borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}` }}>
          <p style={{ margin: 0, fontSize: 14 }}>Rembourser <b>{refundAmount}</b> à {order.clientName} ?</p>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.t3 }}>Un courriel sera envoyé à {order.clientEmail}.</p>
          {refundError && <div style={{ marginTop: 10 }}><Notice tone="err">{refundError}</Notice></div>}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Button variant="danger" onClick={handleRefund} disabled={refunding} icon={<Banknote style={{ width: 15, height: 15 }} />}>{refunding ? "Envoi…" : "Confirmer le remboursement"}</Button>
            <Button variant="ghost" onClick={() => { setConfirmRefund(false); setRefundError(null); }} disabled={refunding}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div style={{ minWidth: 0 }}>
          {/* Montants */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "center", gap: 16, padding: "20px 0", borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}` }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Le client envoie</p>
              <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sends}</p>
            </div>
            <ArrowRight style={{ width: 18, height: 18, color: C.t3 }} />
            <div style={{ minWidth: 0, textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Le client reçoit</p>
              <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{receives}</p>
            </div>
          </div>

          {order.type === "buy" && <PayoutStep order={order} list={payouts} onChanged={() => { loadPayouts(); onRefresh?.(); }} />}
          {order.type === "sell" && <SellStep order={order} copy={copy} copied={copied} />}

          <Block title="Détails">
            <KeyValues items={[
              ["Opération", `${TYPE_META[order.type].label} de USDT`],
              ["Taux", `1 USDT = ${nfCad.format(order.rate)} $`],
              ["Montant en dollars", `${nfCad.format(order.cad)} $`],
              ["Montant en USDT", `${nfUsdt.format(order.usdt)} USDT`],
              ["Paiement", order.type === "buy" ? "Interac, du client vers Ooble" : "Interac, d'Ooble vers le client"],
              ...(order.type === "sell" ? [["Courriel Interac", <CopyValue key="i" value={order.interacEmail} k="interac" copy={copy} copied={copied} />] as [string, React.ReactNode]] : []),
              ...(order.type === "buy" ? [
                ["Réseau", net ? <OrderChannel key="n" order={order} /> : "—"] as [string, React.ReactNode],
                ["Adresse de réception", <CopyValue key="ad" value={order.address} k="addr" copy={copy} copied={copied} mono />] as [string, React.ReactNode],
              ] : []),
              ["Créée le", createdAt],
              ["Référence", <CopyValue key="r" value={order.ref} k="ref2" copy={copy} copied={copied} />],
            ]} />
          </Block>

          {activePayout && !finished && (
            <p style={{ margin: "20px 0 0", fontSize: 13, color: C.t3 }}>Les USDT sont partis : la commande se termine seule à la confirmation.</p>
          )}
        </div>

        {/* Colonne de droite */}
        <aside style={{ minWidth: 0 }}>
          <Block title="Client">
            <button type="button" className="ui-row" onClick={() => order.userId && onShowClient?.(order.userId)} disabled={!order.userId}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", border: "none", borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}`, background: "transparent", color: C.t1, fontFamily: FONT, textAlign: "left", cursor: order.userId ? "pointer" : "default" }}>
              <Avatar name={order.clientName} size={38} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14 }}>{order.clientName}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.clientEmail}</span>
              </span>
              {order.userId && <ChevronRight style={{ width: 16, height: 16, color: C.t3 }} />}
            </button>
          </Block>

          <Block title="Historique">
            {events === null ? <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>Chargement…</p> : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {steps.map((st, i) => (
                  <li key={i} style={{ display: "flex", gap: 12 }}>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, marginTop: 5, background: i === steps.length - 1 ? C.t1 : C.t3, flexShrink: 0 }} />
                      {i < steps.length - 1 && <span style={{ width: 1, flex: 1, background: C.bd }} />}
                    </span>
                    <span style={{ paddingBottom: i < steps.length - 1 ? 18 : 0 }}>
                      <span style={{ display: "block", fontSize: 13.5 }}>{st.label}{st.actor && <span style={{ color: C.t3 }}> · {st.actor}</span>}</span>
                      <span style={{ display: "block", fontSize: 12, color: C.t3, marginTop: 1 }}>{st.hint}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Block>

          {isAdmin && canDelete && (
            <Block title="Zone sensible">
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>Possible seulement sans aucun mouvement d'argent : les commandes payées restent dans les registres.</p>
              {confirmDel ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="danger" size="sm" icon={<Trash2 style={{ width: 14, height: 14 }} />} onClick={() => onDelete(order.id)}>Supprimer définitivement</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>Annuler</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" icon={<Trash2 style={{ width: 14, height: 14 }} />} onClick={() => setConfirmDel(true)}>Supprimer la commande</Button>
              )}
            </Block>
          )}
        </aside>
      </div>
    </div>
  );
};

export default OrderDetail;
