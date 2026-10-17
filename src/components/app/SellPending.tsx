/**
 * Vente en cours, rouverte depuis Activité : l'adresse de dépôt et le montant exact, « J'ai envoyé mes
 * USDT » si ce n'est pas encore fait, ou l'annulation tant que rien n'est envoyé. Le client peut ainsi
 * fermer l'app au milieu d'une vente et la reprendre.
 */
import { useState } from "react";
import CopyRow from "@/components/app/CopyRow";
import { NETWORKS } from "@/components/app/networks";
import { Action, Actions } from "@/components/app/Flat";
import { useT } from "@/lib/i18n";
import { DB_TO_NET, type OrderRow } from "@/lib/orders";
import { cancelUnsentSell, declareSellSent } from "@/lib/sellProof";

const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

export default function SellPending({ order, onChange }: { order: OrderRow; onChange: (patch: Partial<OrderRow>) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const net = order.network ? DB_TO_NET[order.network] : null;
  const network = NETWORKS.find((n) => n.id === net) ?? null;
  // Seulement une vente pas encore confirmée par le client.
  if (order.side !== "sell" || order.status !== "created" || order.client_sent_at) return null;

  const declare = async () => {
    setBusy(true); setErr(null);
    const r = await declareSellSent(order.id);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onChange({ client_sent_at: new Date().toISOString(), status: "awaiting_payment" });
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
      {order.wallet_address && (
        <div>
          <div className="flex items-center gap-2.5">
            {network && <img src={`/coins/${network.id}.svg`} alt="" className="h-[22px] w-[22px] shrink-0 rounded-full" draggable={false} />}
            <span className="ac-k min-w-0 flex-1 truncate">{network?.name}</span>
            <span className="shrink-0 text-[12px] text-muted-foreground">{network?.tag}</span>
          </div>
          <div className="ac-lines mt-1">
            <CopyRow label={t("sell.depositAddr")} value={order.wallet_address} mono />
            <CopyRow label={t("sell.exactToSend")} value={`${nfUsdt.format(Number(order.usdt_amount))} USDT`} />
          </div>
        </div>
      )}

      {err && <p className="ac-note">{err}</p>}

      <Actions>
        <Action disabled={busy} onClick={declare}>{t("sell.iSent")}</Action>
        <Action quiet disabled={busy} onClick={cancel}>{t("sell.cancelSell")}</Action>
      </Actions>
    </div>
  );
}
