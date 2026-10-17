import { useNavigate } from "react-router-dom";
import AppShell from "@/components/app/AppShell";
import LimitsCard from "@/components/app/LimitsCard";
import { StepHeader } from "@/components/app/Flat";
import { useT } from "@/lib/i18n";

/** Limites d'achat et de vente sur 24 heures, ouvertes depuis Mon compte. */
const Limites = () => {
  const t = useT();
  const navigate = useNavigate();
  return (
    <AppShell header={<StepHeader title={t("acct.limits")} sub={t("acct.limitsPage")} onBack={() => navigate("/app/compte")} />}>
      <LimitsCard />
    </AppShell>
  );
};

export default Limites;
