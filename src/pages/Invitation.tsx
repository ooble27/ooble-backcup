import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { HELP_COLORS } from "@/lib/faq";
import { supabase } from "@/integrations/supabase/client";
import { bpsText, rememberReferral } from "@/lib/growth";
import { useLang, useT } from "@/lib/i18n";

interface Info { valid: boolean; enabled: boolean; firstName: string | null; bonusBps: number }

/**
 * Page d'arrivée d'un lien de parrainage (ooble.ca/i/CODE, partagé sur WhatsApp, Instagram…) :
 * qui invite, ce que l'invitation apporte, et l'inscription. Le code est retenu sur l'appareil ;
 * le compte est rattaché au parrain à sa première ouverture de l'app.
 */
const Invitation = () => {
  const t = useT();
  const [lang] = useLang();
  const { code = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    if (!code) { setInfo({ valid: false, enabled: false, firstName: null, bonusBps: 0 }); return; }
    rememberReferral(code);
    supabase.rpc("referral_info", { _code: code }).then(({ data }) => {
      const d = (data ?? {}) as Record<string, unknown>;
      setInfo({ valid: !!d.valid, enabled: !!d.enabled, firstName: (d.first_name as string) ?? null, bonusBps: Number(d.bonus_bps ?? 0) });
    });
  }, [code]);

  const active = !!info?.valid && info.enabled;
  const pct = info ? bpsText(info.bonusBps, lang) : "";
  const steps = [
    { n: "1", title: t("inv.s1"), sub: t("inv.s1Sub") },
    { n: "2", title: t("inv.s2"), sub: t("inv.s2Sub") },
    { n: "3", title: t("inv.s3"), sub: active ? t("inv.s3Sub").replace("{pct}", pct) : t("inv.s3SubPlain") },
  ];

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />
      <main>
        <section className="mx-auto max-w-[1200px] px-6 pb-10 pt-20 sm:px-10 lg:pt-28">
          <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{t("inv.kicker")}</p>
          <h1 className="mt-6 max-w-[920px] font-display text-[2.6rem] font-semibold leading-[1] tracking-[-0.055em] sm:text-[4rem] lg:text-[5.2rem]" style={{ textWrap: "balance" }}>
            {!info ? <span className="text-muted-foreground">Ooble</span>
              : !active ? <>{t("inv.inactive")}</>
                : info.firstName ? <>{info.firstName} {t("inv.invites")} <span style={{ color: HELP_COLORS.coral }}>Ooble.</span></>
                  : <>{t("inv.invited")} <span style={{ color: HELP_COLORS.coral }}>Ooble.</span></>}
          </h1>
          <p className="mt-6 max-w-[620px] text-[17px] leading-[1.65] text-muted-foreground">
            {t("inv.lead")}{" "}
            {active && <span className="text-foreground">{t("inv.bonus").replace("{pct}", pct)}</span>}
            {info && !active && t("inv.stillOpen")}
          </p>
          {/* Le parrainage ne vaut qu'à la création d'un compte : pas de lien « J'ai déjà un compte ». */}
          <div className="mt-10">
            <Button asChild variant="appSolid" shape="rounded" size="lg" className="px-7">
              <Link to="/inscription">{t("inv.cta")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} /></Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 pb-24 pt-10 sm:px-10">
          <ol className="grid border-t sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.n} className={`py-8 sm:px-6 ${i > 0 ? "border-t sm:border-l sm:border-t-0" : "sm:pl-0"}`}>
                <span className="font-display text-[2.2rem] font-semibold leading-none tracking-[-0.05em]" style={{ color: [HELP_COLORS.mint, HELP_COLORS.sun, HELP_COLORS.coral][i] }}>{s.n}</span>
                <p className="mt-4 font-display text-[1.2rem] font-semibold tracking-[-0.03em]">{s.title}</p>
                <p className="mt-2 text-[14.5px] leading-[1.6] text-muted-foreground">{s.sub}</p>
              </li>
            ))}
          </ol>
          {active && <p className="mt-8 max-w-[620px] text-[13.5px] leading-[1.6] text-muted-foreground">{t("inv.fine")}</p>}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Invitation;
