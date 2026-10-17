import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/app/AppShell";
import { ActivityRow } from "@/components/app/ActivityList";
import { StepHeader } from "@/components/app/Flat";
import { listMyOrders, peekMyOrders, type OrderRow } from "@/lib/orders";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { TKey } from "@/lib/translations";

type TabFilter = "all" | "buy" | "sell";

const Activite = () => {
  const navigate = useNavigate();
  const t = useT();
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(() => peekMyOrders(user?.id, 100));
  const [tab, setTab] = useState<TabFilter>("all");

  useEffect(() => {
    let active = true;
    listMyOrders(100).then((rows) => { if (active) setOrders(rows); });
    return () => { active = false; };
  }, []);

  const filtered = orders?.filter((o) => tab === "all" || o.side === tab) ?? null;

  const handleClick = (o: OrderRow) => {
    navigate(`/app/activite/${o.id}`, { state: { order: o } });
  };

  const tabs: { key: TabFilter; labelKey: TKey }[] = [
    { key: "all", labelKey: "act.all" },
    { key: "buy", labelKey: "act.buys" },
    { key: "sell", labelKey: "act.sells" },
  ];

  return (
    <AppShell wide header={<StepHeader title={t("act.title")} sub={t("act.sub")} onBack={() => navigate("/app")} />}>
      <div className="ac-opts mb-4" role="group" aria-label={t("act.title")}>
        {tabs.map(({ key, labelKey }) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} style={{ fontSize: 15 }}>{t(labelKey)}</button>
        ))}
      </div>

      {filtered && filtered.length === 0 && (
        <div className="mt-8">
          <p className="text-[16px] font-medium text-foreground">{t("act.noTx")}</p>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {tab === "all" ? t("act.noTxAll") : tab === "buy" ? t("act.noTxBuy") : t("act.noTxSell")}
          </p>
        </div>
      )}
      {filtered && filtered.length > 0 && (
        <>
          <div className="ac-lines">
            {filtered.map((o) => (
              <ActivityRow key={o.id} o={o} onClick={() => handleClick(o)} />
            ))}
          </div>
          <p className="mt-6 text-[12.5px] text-muted-foreground">
            {filtered.length} {filtered.length > 1 ? t("act.transactions") : t("act.transaction")}
          </p>
        </>
      )}
    </AppShell>
  );
};

export default Activite;
