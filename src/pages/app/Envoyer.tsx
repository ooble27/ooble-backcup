import { Send, Handshake } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Action, Actions, StepHeader } from "@/components/app/Flat";
import { useNavigate } from "react-router-dom";
import { useT } from "@/lib/i18n";

const Envoyer = () => {
  const t = useT();
  const navigate = useNavigate();
  return (
    <AppShell
      header={<StepHeader title={t("send.title")} sub={t("send.sub")} onBack={() => navigate("/app")} />}
    >
      <Send className="h-8 w-8 text-muted-foreground" strokeWidth={1.6} />
      <p className="ac-title mt-4">{t("send.comingSoon")}</p>
      <p className="ac-sub">{t("send.comingSoonSub")}</p>

      <p className="ac-help mt-8 flex items-center gap-2.5">
        <Handshake className="h-5 w-5 shrink-0" strokeWidth={1.8} />
        <span>{t("send.largeVolume")}</span>
      </p>

      <Actions><Action to="/app/acheter">{t("send.buyUsdt")}</Action></Actions>
    </AppShell>
  );
};

export default Envoyer;
