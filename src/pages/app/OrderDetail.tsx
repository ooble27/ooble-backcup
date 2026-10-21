import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import AppShell from "@/components/app/AppShell";
import { OrderDetailContent } from "@/components/app/ActivityList";
import SellPending from "@/components/app/SellPending";
import { StepHeader } from "@/components/app/Flat";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { peekMyOrders, type OrderRow } from "@/lib/orders";
import { useAuth } from "@/lib/auth";

/**
 * Fiche d'une commande. Ouverte depuis la liste, l'ordre arrive dans l'état
 * de navigation ; ouverte depuis un lien (courriel « Transaction terminée »),
 * il est relu en base — la RLS ne renvoie que les ordres du client connecté.
 */
const OrderDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const t = useT();
  const { user } = useAuth();
  // Affiché tout de suite (ordre passé par la liste, ou activité en cache),
  // puis relu pour avoir le statut à jour.
  const [order, setOrder] = useState<OrderRow | null>(() =>
    (location.state?.order as OrderRow | undefined) ?? peekMyOrders(user?.id, 100)?.find((o) => o.id === id) ?? null,
  );
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let on = true;
    (async () => {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id;
      const { data } = await supabase.from("orders").select("*").eq("id", id).eq("user_id", uid ?? "").eq("hidden", false).maybeSingle();
      if (!on) return;
      if (data) setOrder(data as OrderRow); else setMissing(true);
    })();
    return () => { on = false; };
  }, [id]);

  useEffect(() => {
    if (missing || (!id && !order)) navigate("/app/activite", { replace: true });
  }, [missing, id, order, navigate]);

  if (!order) return <AppShell>{null}</AppShell>;
  const buy = order.side === "buy";

  return (
    <AppShell header={<StepHeader title={buy ? t("act.buyDetail") : t("act.sellDetail")} onBack={() => navigate(-1)} />}>
      <OrderDetailContent o={order} />
      <SellPending order={order} onChange={(patch) => setOrder((o) => (o ? { ...o, ...patch } : o))} />
    </AppShell>
  );
};

export default OrderDetail;
