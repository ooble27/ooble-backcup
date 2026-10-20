import { useEffect, useState } from "react";
import { Coins, HandCoins, ChevronRight, ExternalLink } from "lucide-react";
import { orderRef, DB_TO_NET, type OrderRow } from "@/lib/orders";
import { NETWORKS } from "@/components/app/networks";
import CopyRow from "@/components/app/CopyRow";
import { useT } from "@/lib/i18n";
import { getLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/translations";
import type { Database } from "@/integrations/supabase/types";
import { EXPLORER_NAME, fetchOutboundTx, txUrl } from "@/lib/settlement";
import { assetSymbol } from "@/lib/assets";

type DbStatus = Database["public"]["Enums"]["order_status"];

const STATUS_KEY: Record<DbStatus, TKey> = {
  created: "st.created",
  awaiting_payment: "st.awaitingPayment",
  payment_received: "st.paymentReceived",
  settling: "st.settling",
  completed: "st.completed",
  cancelled: "st.cancelled",
  expired: "st.expired",
  refunded: "st.refunded",
};

/** Libellé du statut ; une vente a ses propres étapes (USDT attendus, puis reçus). */
const statusKey = (o: { side: string; status: DbStatus }): TKey => {
  if (o.side === "sell" && (o.status === "created" || o.status === "awaiting_payment")) return "st.sellAwaiting";
  if (o.side === "sell" && o.status === "payment_received") return "st.sellReceived";
  return STATUS_KEY[o.status];
};

const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

const dateShort = (d: Date) => {
  const lang = getLang();
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : "fr-CA", { day: "numeric", month: "short" }).format(d);
};

const dateLong = (d: Date) => {
  const lang = getLang();
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : "fr-CA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
};

export { nf, nfUsdt, dateLong };

export const ActivityRow = ({ o, onClick }: { o: OrderRow; onClick?: () => void }) => {
  const t = useT();
  const buy = o.side === "buy";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 py-3.5 text-left",
        onClick && "ac-row",
      )}
    >
      {buy ? <Coins className="ac-ico h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} /> : <HandCoins className="ac-ico h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">
          {buy ? t("act.buyLabel") : t("act.sellLabel")}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {t(statusKey(o))}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-semibold">{nf.format(Number(o.cad_amount))} <span className="text-[12px] font-medium">CAD</span></p>
        <p className="text-[11.5px] text-muted-foreground">
          {dateShort(new Date(o.created_at))}
        </p>
      </div>
      {onClick && <ChevronRight className="ac-go h-4 w-4 shrink-0 text-muted-foreground/50" />}
    </button>
  );
};

export const OrderDetailContent = ({ o }: { o: OrderRow }) => {
  const t = useT();
  const buy = o.side === "buy";
  const netId = DB_TO_NET[o.network];
  const network = NETWORKS.find((n) => n.id === netId);
  // Achat terminé : lien vers la transaction d'envoi sur l'explorateur du réseau.
  const [tx, setTx] = useState<{ network: string; tx_hash: string } | null>(null);
  useEffect(() => {
    let on = true;
    if (buy && (o.status === "completed" || o.status === "settling")) fetchOutboundTx(o.id).then((r) => { if (on) setTx(r); });
    return () => { on = false; };
  }, [o.id, o.status, buy]);
  const link = tx ? txUrl(tx.network, tx.tx_hash) : "";
  const rows: { label: string; value: string; mono?: boolean; copy?: boolean }[] = [
    { label: t("act.ref"), value: orderRef(o.id), copy: true },
    { label: t("act.rate"), value: `1 ${assetSymbol(o.asset)} = ${nf.format(Number(o.locked_rate))} CAD` },
    { label: t("act.network"), value: network ? `${network.name} · ${network.tag}` : "N/D" },
    ...(buy && o.wallet_address && o.wallet_address !== "à générer"
      ? [{ label: t("act.recvAddr"), value: o.wallet_address, mono: true, copy: true }]
      : []),
    ...(!buy && o.interac_email
      ? [{ label: t("act.interacEmail"), value: o.interac_email, mono: true }]
      : []),
    { label: t("act.date"), value: dateLong(new Date(o.created_at)) },
  ];
  return (
    <>
      <div className="mb-8">
        <p className="flex items-center gap-2.5 font-display text-[40px] font-semibold leading-none tracking-tight tabular-nums">
          <img src="/coins/usdt.svg" alt="" className="h-8 w-8 shrink-0" />
          {nfUsdt.format(Number(o.usdt_amount))} <span className="text-[20px] font-medium text-muted-foreground">{assetSymbol(o.asset)}</span>
        </p>
        <p className="mt-2 text-[15px] text-muted-foreground">{nf.format(Number(o.cad_amount))} CAD · <span className="text-foreground">{t(statusKey(o))}</span></p>
      </div>
      <div className="ac-lines">
        {rows.map((r) => (
          r.copy
            ? <CopyRow key={r.label} label={r.label} value={r.value} mono={!!r.mono} />
            : <div key={r.label} className={cn("ac-kv", r.mono && "mono")}><span>{r.label}</span><span>{r.value}</span></div>
        ))}
        {link && (
          <div className="ac-kv">
            <span>{t("act.tx")}</span>
            <a href={link} target="_blank" rel="noreferrer" className="ac-link justify-end">
              {t("act.viewOn").replace("{x}", EXPLORER_NAME[tx!.network] ?? "explorer")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </>
  );
};
