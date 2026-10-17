import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Action, Actions, StepHeader } from "@/components/app/Flat";
import { useAuth } from "@/lib/auth";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { useT } from "@/lib/i18n";

/** Vrai si le compte est une entreprise dont la vérification n'est pas validée. */
export const businessBlocked = (p: MyProfile | null) => p?.accountType === "business" && p.businessStatus !== "approved";

/**
 * Bloque l'achat et la vente pour un compte entreprise non vérifié (Conditions,
 * partie 5). La base refuse aussi l'ordre : cet écran évite seulement de
 * remplir un formulaire pour rien. La page s'affiche tout de suite (profil en
 * cache, ou page normale le temps de la lecture) : jamais d'écran vide.
 */
const BusinessGate = ({ children }: { children: React.ReactNode }) => {
  const t = useT();
  const { user, isStaff } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null | undefined>(() => peekMyProfile(user?.id));

  useEffect(() => {
    getMyProfile().then(setProfile);
  }, []);

  if (profile === undefined || isStaff || !businessBlocked(profile)) return <>{children}</>;

  const pending = profile!.businessStatus === "pending";
  return (
    <AppShell header={<GateHeader title={t("kyb.gateTitle")} />}>
      <p className="ac-name">{profile!.businessName}</p>
      {pending && (
        <p className="ac-meta flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {t("kyb.pillPending")}</p>
      )}
      <p className="ac-sub mt-4">{pending ? t("kyb.gatePending") : t("kyb.gateSub")}</p>
      <Actions><Action to="/app/entreprise">{pending ? t("kyb.gateView") : t("kyb.gateCta")}</Action></Actions>
    </AppShell>
  );
};

/** Titre avec retour vers l'accueil. */
const GateHeader = ({ title }: { title: string }) => {
  const navigate = useNavigate();
  return <StepHeader title={title} onBack={() => navigate("/app")} />;
};

export default BusinessGate;
