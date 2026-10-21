/**
 * Mon espace › « À traiter maintenant » : les ventes à verser, les achats payés qui n'ont pas
 * été envoyés et les virements Interac sans commande. Visible par toute l'équipe, en tête de page,
 * pour que rien n'attende sans qu'on le voie. Rien ne s'affiche quand tout est traité.
 */
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Landmark } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { orderRef } from "@/lib/orders";
import { fetchAttention, markReceiptHandled, type Attention } from "@/lib/teamTools";
import { supabase } from "@/integrations/supabase/client";
import { C } from "./adminTheme";

const cad = (n: number) => `${Number(n).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const since = (iso: string) => {
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  return m < 60 ? `depuis ${Math.max(1, Math.round(m))} min` : m < 1440 ? `depuis ${Math.round(m / 60)} h` : `depuis ${Math.round(m / 1440)} j`;
};

const CSS = `
.at { margin: 34px 0 6px; }
.at-h { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0 0 6px; }
.at-h h3 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.02em; color: var(--a-t1); }
.at-h span { font-size: 13px; color: var(--a-t3); }
.at-grp { margin: 18px 0 4px; font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-t3); }
.at-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--a-bds); min-width: 0; }
.at-row > svg { width: 18px; height: 18px; color: var(--a-t1); flex-shrink: 0; }
.at-main { flex: 1; min-width: 0; }
.at-main b { display: block; font-size: 15px; font-weight: 600; color: var(--a-t1); font-variant-numeric: tabular-nums; }
.at-main small { display: block; margin-top: 2px; font-size: 13px; color: var(--a-t2); line-height: 1.45; overflow-wrap: anywhere; }
.at-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--a-t1); white-space: nowrap; padding: 4px 0; }
.at-btn:hover { text-decoration: underline; text-underline-offset: 4px; }
.at-btn svg { width: 14px; height: 14px; }
.at-acts { display: flex; gap: 16px; flex-wrap: wrap; justify-content: flex-end; }
@media (max-width: 640px) { .at-row { flex-wrap: wrap; } .at-acts { width: 100%; justify-content: flex-start; padding-left: 32px; } }
`;

export function AttentionBlock({ openOrder }: { openOrder: (id: string) => void }) {
  const { roles } = useAuth();
  const [a, setA] = useState<Attention | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canHandle = roles.some((r) => ["admin", "operator", "accounting"].includes(r));
  const load = () => { fetchAttention().then(setA).catch(() => {}); };
  useEffect(() => {
    load();
    const t = window.setInterval(load, 20_000);
    // Rafraîchi aussi dès qu'une commande ou un avis Interac change.
    const ch = supabase.channel("attention")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "interac_receipts" }, load)
      .subscribe();
    return () => { window.clearInterval(t); void supabase.removeChannel(ch); };
  }, []);
  if (!a) return null;
  const total = a.sells.length + a.buys.length + a.receipts.length;
  if (!total) return null;
  const sellSum = a.sells.reduce((s, o) => s + Number(o.cad), 0);

  const handle = async (id: string) => {
    const note = window.prompt("Comment ce virement a-t-il été traité ? (commande confirmée à la main, remboursé, sans rapport avec Ooble…)", "");
    if (note === null) return;
    setBusy(id);
    const r = await markReceiptHandled(id, note);
    setBusy(null);
    if (r.error) window.alert(r.error); else load();
  };

  return (
    <section className="at tv-rise" aria-live="polite">
      <style>{CSS}</style>
      <div className="at-h">
        <h3>À traiter maintenant</h3>
        <span>{total} élément{total > 1 ? "s" : ""} en attente</span>
      </div>

      {a.receipts.length > 0 && <p className="at-grp">Virements Interac sans commande · {a.receipts.length}</p>}
      {a.receipts.map((r) => (
        <div key={r.id} className="at-row">
          <Landmark aria-hidden />
          <span className="at-main">
            <b>{r.amount != null ? cad(r.amount) : "Montant inconnu"}{r.sender ? ` · ${r.sender}` : ""}</b>
            <small>{r.reason ?? "Virement à vérifier."} Reçu {since(r.at)}.</small>
            {r.suggest && <small>Commande probable : {orderRef(r.suggest.id)} · {r.suggest.name || "Client"} · {cad(r.suggest.cad)}. Vérifiez le nom avant de confirmer.</small>}
          </span>
          <span className="at-acts">
            {(r.order_id || r.suggest) && <button type="button" className="at-btn" onClick={() => openOrder((r.order_id ?? r.suggest!.id))}>Ouvrir {orderRef(r.order_id ?? r.suggest!.id)} <ArrowRight /></button>}
            {canHandle && <button type="button" className="at-btn" disabled={busy === r.id} onClick={() => void handle(r.id)}><Check />{busy === r.id ? "…" : "Marquer traité"}</button>}
          </span>
        </div>
      ))}

      {a.sells.length > 0 && <p className="at-grp">Ventes à verser · {a.sells.length} · {cad(sellSum)}</p>}
      {a.sells.map((o) => (
        <div key={o.id} className="at-row">
          <ArrowUpRight aria-hidden />
          <span className="at-main">
            <b>{cad(o.cad)} · {o.name || "Client"}</b>
            <small>{orderRef(o.id)} · {o.status === "settling" ? "virement en cours" : "dépôt reçu, virement Interac à envoyer"} {since(o.at)}{o.assigned ? " · prise en charge" : ""}</small>
          </span>
          <span className="at-acts"><button type="button" className="at-btn" onClick={() => openOrder(o.id)}>Verser <ArrowRight /></button></span>
        </div>
      ))}

      {a.buys.length > 0 && <p className="at-grp">Achats payés, cryptomonnaie pas encore envoyée · {a.buys.length}</p>}
      {a.buys.map((o) => (
        <div key={o.id} className="at-row">
          <ArrowDownLeft aria-hidden />
          <span className="at-main">
            <b>{cad(o.cad)} · {o.name || "Client"}</b>
            <small>{orderRef(o.id)} · paiement reçu {since(o.at)}</small>
          </span>
          <span className="at-acts"><button type="button" className="at-btn" onClick={() => openOrder(o.id)}>Ouvrir <ArrowRight /></button></span>
        </div>
      ))}
    </section>
  );
}
