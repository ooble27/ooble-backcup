import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { StepHeader } from "@/components/app/Flat";
import { Composer, SUPPORT_CSS, supportWhen } from "@/components/app/SupportUI";
import { fetchSupportThreads, sendSupportMessage, type SupportTopic } from "@/lib/support";
import { listMyOrders, orderRef, type OrderRow } from "@/lib/orders";
import { useLang, useT } from "@/lib/i18n";
import type { TKey } from "@/lib/translations";

/**
 * Nouvelle discussion : le sujet, la commande concernée s'il s'agit d'une commande, puis le message.
 * L'équipe reçoit tout ça d'un coup et peut répondre sans poser de question en plus.
 * S'il y a déjà une discussion ouverte, on y renvoie (une seule à la fois).
 */
const TOPICS: { id: SupportTopic; key: TKey }[] = [
  { id: "order", key: "support.tOrder" },
  { id: "interac", key: "support.tPay" },
  { id: "identity", key: "support.tId" },
  { id: "account", key: "support.tAccount" },
  { id: "other", key: "support.tOther" },
];

const nf = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SupportNew = () => {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  // La commande choisie : son identifiant, ou "other" pour une commande qui n'est pas dans la liste.
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Une discussion est déjà ouverte : on la reprend au lieu d'en créer une deuxième.
  useEffect(() => {
    fetchSupportThreads().then((r) => {
      const open = r.data?.threads.find((x) => x.open);
      if (open) navigate(`/app/support/${open.id}`, { replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  useEffect(() => {
    if (topic === "order" && orders === null) listMyOrders(8).then(setOrders);
  }, [topic, orders]);

  const picked = orders?.find((o) => o.id === pick) ?? null;
  const ready = !!topic && (topic !== "order" || pick !== null) && !!text.trim();

  const send = async () => {
    if (!ready || sending) return;
    setSending(true); setError(null);
    const r = await sendSupportMessage({ text: text.trim(), topic: topic!, orderRef: topic === "order" && picked ? orderRef(picked.id) : undefined });
    setSending(false);
    if (r.data?.threadId) { navigate(`/app/support/${r.data.threadId}`, { replace: true }); return; }
    setError(r.error && r.error !== "network" ? r.error : t("support.error"));
  };

  return (
    <AppShell header={<StepHeader title={t("support.new")} sub={t("support.newSub")} onBack={() => navigate("/app/support")} />}>
      <style>{SUPPORT_CSS}</style>
      {checking ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#111]" aria-label={t("support.loading")} /></div>
      ) : (
        <>
          <p className="sp-k">{t("support.qTopic")}</p>
          <div role="radiogroup" aria-label={t("support.qTopic")}>
            {TOPICS.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={topic === x.id}
                className={topic === x.id ? "sp-opt on" : "sp-opt"}
                onClick={() => { setTopic(x.id); if (x.id !== "order") setPick(null); }}>
                {t(x.key)}{topic === x.id && <Check className="h-5 w-5" strokeWidth={2.6} />}
              </button>
            ))}
          </div>

          {topic === "order" && (
            <section className="mt-7">
              <p className="sp-k">{t("support.qOrder")}</p>
              {orders === null && <Loader2 className="h-5 w-5 animate-spin text-[#111]" aria-label={t("support.loading")} />}
              {orders && (
                <div role="radiogroup" aria-label={t("support.qOrder")}>
                  {orders.map((o) => {
                    const r = orderRef(o.id);
                    return (
                      <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} className={pick === o.id ? "sp-opt on" : "sp-opt"} onClick={() => setPick(o.id)}>
                        <span>{o.side === "buy" ? t("act.buyShort") : t("act.sellShort")} · {nf.format(Number(o.cad_amount))} $<br /><small>{r} · {supportWhen(o.created_at, lang, t("support.today"))}</small></span>
                        {pick === o.id && <Check className="h-5 w-5" strokeWidth={2.6} />}
                      </button>
                    );
                  })}
                  <button type="button" role="radio" aria-checked={pick === "other"} className={pick === "other" ? "sp-opt on" : "sp-opt"} onClick={() => setPick("other")}>
                    {t("support.otherOrder")}{pick === "other" && <Check className="h-5 w-5" strokeWidth={2.6} />}
                  </button>
                </div>
              )}
            </section>
          )}

          {topic && (topic !== "order" || pick !== null) && (
            <section className="mt-7">
              <p className="sp-k">{t("support.qMessage")}</p>
              <Composer value={text} onChange={setText} onSend={send} disabled={sending} autoFocus
                placeholder={t("support.placeholder")} sendLabel={t("support.send")} />
              {error ? <p className="sp-err" role="alert">{error}</p> : <p className="sp-note">{t("support.note")}</p>}
            </section>
          )}
        </>
      )}
    </AppShell>
  );
};

export default SupportNew;
