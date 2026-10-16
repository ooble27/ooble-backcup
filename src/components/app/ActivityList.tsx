import { useEffect, useState } from "react";
import { Coins, HandCoins, ChevronRight, ExternalLink } from "lucide-react";
import { orderRef, DB_TO_NET, type OrderRow } from "@/lib/orders";
import { NETWORKS } from "@/components/app/networks";
import BottomSheet from "@/components/app/BottomSheet";
import CopyRow from "@/components/app/CopyRow";
import { useT } from "@/lib/i18n";
import { getLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/translations";
import type { Database } from "@/integrations/supabase/types";
import { EXPLORER_NAME, fetchOutboundTx, txUrl } from "@/lib/settlement";

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
        "flex w-full items-center gap-3 py-3.5 text-left transition-colors",
        onClick && "transition-opacity hover:opacity-80 active:opacity-60",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground/70">
        {buy ? <Coins className="h-[18px] w-[18px]" strokeWidth={1.7} /> : <HandCoins className="h-[18px] w-[18px]" strokeWidth={1.7} />}
      </span>
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
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
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
  return (
    <>
      <div className="mb-5 flex flex-col items-center text-center">
        <p className="font-display text-[28px] font-light tracking-tight">
          {nfUsdt.format(Number(o.usdt_amount))} <span className="text-[18px] text-muted-foreground">USDT</span>
        </p>
        <p className="mt-1 text-[14px] text-muted-foreground">{nf.format(Number(o.cad_amount))} CAD</p>
        <span className="mt-3 inline-flex rounded-full bg-secondary px-3 py-1 text-[12px] font-semibold text-muted-foreground">
          {t(statusKey(o))}
        </span>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        {[
          { label: t("act.ref"), value: orderRef(o.id), copy: true },
          { label: t("act.rate"), value: `1 USDT = ${nf.format(Number(o.locked_rate))} CAD` },
          { label: t("act.network"), value: network ? `${network.name} · ${network.tag}` : "N/D" },
          ...(buy && o.wallet_address && o.wallet_address !== "à générer"
            ? [{ label: t("act.recvAddr"), value: o.wallet_address, mono: true, copy: true }]
            : []),
          ...(!buy && o.interac_email
            ? [{ label: t("act.interacEmail"), value: o.interac_email, mono: true }]
            : []),
          { label: t("act.date"), value: dateLong(new Date(o.created_at)) },
        ].map((r, i, arr) => (
          "copy" in r && r.copy ? (
            <div key={r.label} className={cn(i < arr.length - 1 && "border-b border-border")}>
              <CopyRow label={r.label} value={r.value} mono={"mono" in r && !!r.mono} />
            </div>
          ) : (
            <div key={r.label} className={cn("flex items-start justify-between px-4 py-3", i < arr.length - 1 && "border-b border-border")}>
              <span className="text-[12.5px] text-muted-foreground">{r.label}</span>
              <span className={cn(
                "max-w-[60%] break-all text-right text-[12.5px] font-medium",
                "mono" in r && r.mono && "font-mono text-[11px]",
              )}>
                {r.value}
              </span>
            </div>
          )
        ))}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between border-t border-border px-4 py-3 transition-colors hover:bg-secondary/50"
          >
            <span className="text-[12.5px] text-muted-foreground">{t("act.tx")}</span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium underline-offset-4 hover:underline">
              {t("act.viewOn").replace("{x}", EXPLORER_NAME[tx!.network] ?? "explorer")}
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </a>
        )}
      </div>
    </>
  );
};

export const OrderDetailSheet = ({ o, open, onClose }: { o: OrderRow | null; open: boolean; onClose: () => void }) => {
  const t = useT();
  if (!o) return null;
  const buy = o.side === "buy";
  return (
    <BottomSheet open={open} onClose={onClose} title={buy ? t("act.buyDetail") : t("act.sellDetail")}>
      <OrderDetailContent o={o} />
    </BottomSheet>
  );
};
