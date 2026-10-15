/**
 * Vente en cours, rouverte depuis Activité : l'adresse de dépôt et le montant exact, l'identifiant de
 * transaction à ajouter, « J'ai envoyé mes USDT » si ce n'est pas encore fait, ou l'annulation tant
 * que rien n'est envoyé. Le client peut ainsi fermer l'app au milieu d'une vente et la reprendre.
 */
import { useState } from "react";
import { Check } from "lucide-react";
import CopyRow from "@/components/app/CopyRow";
import TxField from "@/components/app/TxField";
import { NETWORKS } from "@/components/app/networks";
import { Button } from "@/components/ui/button";
import { familyOf } from "@/lib/depositAddresses";
import { useT } from "@/lib/i18n";
import { DB_TO_NET, type OrderRow } from "@/lib/orders";
import { cancelUnsentSell, declareSellSent, extractTxHash } from "@/lib/sellProof";

const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

export default function SellPending({ order, onChange }: { order: OrderRow; onChange: (patch: Partial<OrderRow>) => void }) {
  const t = useT();
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const net = order.network ? DB_TO_NET[order.network] : null;
  const network = NETWORKS.find((n) => n.id === net) ?? null;
  const hash = net ? extractTxHash(familyOf(net), tx) : null;
  const sent = !!order.client_sent_at;
  const open = order.side === "sell" && (order.status === "created" || order.status === "awaiting_payment");
  if (!open || (sent && order.client_tx_hash)) return null;

  const declare = async () => {
    if (tx.trim() && !hash) { setErr(t("sell.txBad")); return; }
    setBusy(true); setErr(null);
    const r = await declareSellSent(order.id, hash);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onChange({ client_sent_at: order.client_sent_at ?? new Date().toISOString(), client_tx_hash: hash ?? order.client_tx_hash, status: "awaiting_payment" });
    setTx("");
  };
  const cancel = async () => {
    if (!confirm(t("sell.cancelConfirm"))) return;
    setBusy(true); setErr(null);
    const r = await cancelUnsentSell(order.id);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onChange({ status: "cancelled" });
  };

  return (
    <div className="mt-5">
      {!sent && order.wallet_address && (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
            {network && <img src={`/coins/${network.id}.svg`} alt="" className="h-[22px] w-[22px] rounded-full" draggable={false} />}
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{network?.name}</span>
            <span className="ml-auto text-[11px] font-medium text-muted-foreground">{network?.tag}</span>
          </div>
          <CopyRow label={t("sell.depositAddr")} value={order.wallet_address} mono />
          <CopyRow label={t("sell.exactToSend")} value={`${nfUsdt.format(Number(order.usdt_amount))} USDT`} />
        </div>
      )}

      {!order.client_tx_hash && (
        <>
          <TxField label={sent ? t("sell.addTx") : t("sell.txTitle")} value={tx} onChange={setTx} valid={!!hash} />
          <p className="mt-2 px-1 text-[12px] leading-snug text-muted-foreground">{t("sell.txHelp")}</p>
        </>
      )}

      {err && <p className="mt-3 px-1 text-[13px] text-destructive">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {(!sent || hash) && (
          <Button variant="appPrimary" shape="soft" className="h-auto gap-2 px-[20px] py-[12px] text-sm" disabled={busy || (sent && !hash)} onClick={declare}>
            <Check className="h-[16px] w-[16px]" strokeWidth={2} /> {sent ? t("sell.addTxSend") : t("sell.iSent")}
          </Button>
        )}
        {!sent && order.status === "created" && (
          <Button variant="ghost" shape="soft" className="h-auto px-[18px] py-[12px] text-sm text-muted-foreground" disabled={busy} onClick={cancel}>
            {t("sell.cancelSell")}
          </Button>
        )}
      </div>
    </div>
  );
}
