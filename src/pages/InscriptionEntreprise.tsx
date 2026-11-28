import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import AuthShell from "@/components/auth/AuthShell";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { TKey } from "@/lib/translations";

/**
 * Ouverture d'un compte entreprise : elle ne se fait plus ici. Une personne ouvre d'abord son compte individuel,
 * fait vérifier son identité, puis crée le compte entreprise depuis Mon compte › Mes entreprises (fonction serveur
 * business-account). Cette page explique le parcours et envoie au bon endroit.
 */
const STEPS: [TKey, TKey][] = [
  ["biz.signupS1", "biz.signupS1d"],
  ["biz.signupS2", "biz.signupS2d"],
  ["biz.signupS3", "biz.signupS3d"],
  ["biz.signupS4", "biz.signupS4d"],
];

const InscriptionEntreprise = () => {
  const t = useT();
  const { user } = useAuth();

  return (
    <AuthShell variant="business">
      <Link
        to="/inscription"
        className="mb-6 inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("regi.back")}
      </Link>

      <h1 className="font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.03em]">{t("biz.signupTitle")}</h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">{t("biz.signupLead")}</p>

      <ol className="mt-8 flex flex-col gap-5">
        {STEPS.map(([title, sub], i) => (
          <li key={title} className="flex items-start gap-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] text-background">{i + 1}</span>
            <span className="flex flex-col gap-0.5 pt-0.5">
              <span className="text-[15px] font-medium">{t(title)}</span>
              <span className="text-[13.5px] leading-relaxed text-muted-foreground">{t(sub)}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col gap-3">
        {user ? (
          <Button asChild size="lg" className="h-12 w-full rounded-full text-[14px] font-medium">
            <Link to="/app/entreprises">{t("biz.title")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg" className="h-12 w-full rounded-full text-[14px] font-medium">
              <Link to="/inscription/individuel">{t("biz.signupOpen")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Link to="/connexion" className="text-center text-[13.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {t("biz.signupHave")}
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
};

export default InscriptionEntreprise;
