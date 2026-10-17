import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Coins, HandCoins } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import RotatingWord from "@/components/RotatingWord";
import AppFlowArt from "@/components/AppFlowArt";
import InteracFlowArt from "@/components/InteracFlowArt";
import { Button } from "@/components/ui/button";
import { InteracLogo } from "@/components/marks";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";
import type { TKey } from "@/lib/translations";

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-[1200px] px-6 sm:px-10 ${className}`}>{children}</div>
);

/** Libellé de section en petites capitales espacées. */
const Kicker = ({ children, inverted }: { children: React.ReactNode; inverted?: boolean }) => (
  <p
    className={cn(
      "text-[12px] uppercase tracking-[0.16em]",
      inverted ? "text-background/55" : "text-muted-foreground",
    )}
  >
    {children}
  </p>
);

/** Titre de section — 56 px sur grand écran, jamais gras. */
const H2 = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h2
    className={cn(
      "font-display text-[2.1rem] leading-[1.04] tracking-[-0.045em] sm:text-[2.9rem] lg:text-[3.5rem]",
      className,
    )}
  >
    {children}
  </h2>
);

/** Second membre d'un titre, en gris clair. */
const Soft = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground/35">{children}</span>
);

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);

  // Les réseaux ouverts dans Back-office › Réglages › Réseaux (Avalanche, Ethereum… s'ajoutent tout seuls).
  const { networks: switches } = useAppSettings();
  const ALL_NETWORKS = [
    { id: "trx", db: "trc20", tick: "TRC20", name: "Tron", note: t("net.trx") },
    { id: "bnb", db: "bep20", tick: "BEP20", name: "BNB Chain", note: t("net.bnb") },
    { id: "matic", db: "polygon", tick: "POL", name: "Polygon", note: t("net.matic") },
    { id: "sol", db: "spl", tick: "SOL", name: "Solana", note: t("net.sol") },
    { id: "avax", db: "avalanche", tick: "C-Chain", name: "Avalanche", note: t("net.avax") },
    { id: "eth", db: "erc20", tick: "ERC20", name: "Ethereum", note: t("net.eth") },
  ] as const;
  const networks = ALL_NETWORKS.filter((n) => switches[n.db]?.buy || switches[n.db]?.sell);

  const essentials: { tKey: TKey; dKey: TKey }[] = [
    { tKey: "ess.1t", dKey: "ess.1d" },
    { tKey: "ess.2t", dKey: "ess.2d" },
    { tKey: "ess.3t", dKey: "ess.3d" },
    { tKey: "ess.4t", dKey: "ess.4d" },
  ];

  const steps: { n: string; tKey: TKey; dKey: TKey }[] = [
    { n: "01", tKey: "how.1t", dKey: "how.1d" },
    { n: "02", tKey: "how.2t", dKey: "how.2d" },
    { n: "03", tKey: "how.3t", dKey: "how.3d" },
  ];

  const specs: { kKey: TKey; vKey: TKey }[] = [
    { kKey: "nc.s1k", vKey: "nc.s1v" },
    { kKey: "nc.s2k", vKey: "nc.s2v" },
    { kKey: "nc.s3k", vKey: "nc.s3v" },
    { kKey: "nc.s4k", vKey: "nc.s4v" },
    { kKey: "nc.s5k", vKey: "nc.s5v" },
  ];

  const faqs: { qKey: TKey; aKey: TKey }[] = [
    { qKey: "faq.1q", aKey: "faq.1a" },
    { qKey: "faq.2q", aKey: "faq.2a" },
    { qKey: "faq.3q", aKey: "faq.3a" },
    { qKey: "faq.4q", aKey: "faq.4a" },
    { qKey: "faq.5q", aKey: "faq.5a" },
    { qKey: "faq.6q", aKey: "faq.6a" },
  ];

  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    const update = () => {
      const darks = Array.from(document.querySelectorAll<HTMLElement>("[data-dark]"));
      const onDark = darks.some((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= 4 && r.bottom > 4;
      });
      meta!.setAttribute("content", onDark ? "#131E21" : "#ffffff");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />

      <main>
        {/* ===================== HÉROS ===================== */}
        <section>
          {/* Le héros occupe une vraie hauteur d'écran, pas un simple bloc. */}
          <Wrap className="flex min-h-[78svh] flex-col justify-center pb-20 pt-24 text-center lg:min-h-[82svh] lg:pb-28 lg:pt-28">
            {/* Pas de `text-balance` ici : il entre en conflit avec les <br>
                explicites et casse le titre en quatre lignes. */}
            {/*
              La boîte du mot défilant prend la largeur de sa variante la plus
              longue : le corps du titre et la largeur maximale sont calibrés
              pour que la deuxième ligne tienne, sinon elle se scinde.
            */}
            <h1 className="animate-up mx-auto max-w-[1120px] font-display text-[2.6rem] leading-[0.98] tracking-[-0.05em] sm:text-[4rem] lg:text-[5.75rem]">
              {t("hero.title1")}
              <br />
              {t("hero.title2")}
              <RotatingWord
                words={t("hero.words").split("|")}
                className="text-foreground/35"
              />
            </h1>

            <p className="animate-up mx-auto mt-8 max-w-[480px] text-[14px] leading-[1.65] text-muted-foreground [animation-delay:140ms] sm:text-[15px]">
              {t("hero.sub")}
            </p>

            <div className="animate-up mt-10 flex flex-wrap justify-center gap-3 [animation-delay:260ms]">
              <Button asChild variant="appSolid" shape="rounded" size="lg" className="px-7">
                <Link to="/inscription">
                  <Coins className="h-4 w-4" strokeWidth={1.8} />
                  {t("hero.buy")}
                </Link>
              </Button>
              <Button asChild variant="secondary" shape="rounded" size="lg" className="px-7">
                <Link to="/inscription">
                  <HandCoins className="h-4 w-4" strokeWidth={1.8} />
                  {t("hero.sell")}
                </Link>
              </Button>
            </div>

            <AppFlowArt className="animate-up mx-auto mt-12 [animation-delay:380ms] sm:mt-14" />
          </Wrap>
        </section>

        {/* ===================== L'ESSENTIEL ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-28">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-20">
              <Reveal>
                <H2>
                  {t("ess.title1")}
                  <br />
                  {t("ess.title2")}
                  <br />
                  <Soft>{t("ess.title3")}</Soft>
                </H2>

                <div className="mt-12 border-t pt-7">
                  <Kicker>{t("ess.margin")}</Kicker>
                  <p className="mt-3 font-display text-[3rem] leading-none tracking-[-0.05em] sm:text-[3.6rem]">
                    + 2 %
                  </p>
                  <p className="mt-4 max-w-[320px] text-[14px] leading-[1.6] text-muted-foreground">
                    {t("ess.marginSub")}
                  </p>
                </div>
              </Reveal>

              <div>
                {essentials.map((e, i) => (
                  <Reveal key={e.tKey} delay={i * 90}>
                    <div className={cn("border-t py-6", i === essentials.length - 1 && "border-b")}>
                      <p className="font-display text-[20px] tracking-[-0.02em]">{t(e.tKey)}</p>
                      <p className="mt-2 text-[15px] leading-[1.6] text-muted-foreground">{t(e.dKey)}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </Wrap>
        </section>

        {/* ===================== COMMENT ÇA MARCHE ===================== */}
        <section id="comment" className="scroll-mt-24">
          <Wrap className="pt-24 lg:pt-28">
            <Reveal>
              <div className="mb-4 flex flex-col justify-between gap-6 sm:flex-row sm:items-end sm:gap-12">
                <div>
                  <Kicker>{t("how.kicker")}</Kicker>
                  <H2 className="mt-4">{t("how.title")}</H2>
                </div>
                <p className="max-w-[300px] text-[15px] leading-[1.6] text-muted-foreground">
                  {t("how.sub")}
                </p>
              </div>
            </Reveal>

            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 110}>
                <div
                  className={cn(
                    "grid items-baseline gap-x-12 gap-y-3 border-t py-8 sm:grid-cols-[96px_1fr] lg:grid-cols-[96px_1fr_1fr]",
                    i === steps.length - 1 && "border-b",
                  )}
                >
                  <p className="font-display text-[2rem] leading-none tracking-[-0.045em] text-foreground/25 lg:text-[2.875rem]">
                    {s.n}
                  </p>
                  <h3 className="font-display text-[1.35rem] tracking-[-0.03em] sm:text-[1.625rem]">
                    {t(s.tKey)}
                  </h3>
                  <p className="text-[15px] leading-[1.7] text-muted-foreground sm:col-start-2 lg:col-start-3 lg:row-start-1">
                    {t(s.dKey)}
                  </p>
                </div>
              </Reveal>
            ))}
          </Wrap>
        </section>

        {/* ===================== RÉSEAUX ===================== */}
        <section id="reseaux" className="scroll-mt-24">
          <Wrap className="pt-24 lg:pt-28">
            <Reveal>
              <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end sm:gap-12">
                <div>
                  <Kicker>{t("net.kicker")}</Kicker>
                  <H2 className="mt-4">{t("net.title")}</H2>
                </div>
                <p className="max-w-[300px] text-[15px] leading-[1.6] text-muted-foreground">
                  {t("net.sub")}
                </p>
              </div>
            </Reveal>

            <div className="grid lg:grid-cols-2 lg:gap-x-16">
              {networks.map((n, i) => (
                <Reveal key={n.id} delay={i * 70} className="flex items-center gap-5 border-t py-5">
                  <img
                    src={`/coins/${n.id}.svg`}
                    alt=""
                    draggable={false}
                    className="h-[34px] w-[34px] shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[20px] tracking-[-0.02em]">
                      {n.name}
                    </span>
                    <span className="block text-[14px] text-muted-foreground">{n.note}</span>
                  </span>
                  <span className="shrink-0 text-[13px] tracking-[0.1em] text-muted-foreground">
                    {n.tick}
                  </span>
                </Reveal>
              ))}
            </div>
          </Wrap>
        </section>

        {/* ===================== NON-CUSTODIAL (panneau inversé) ===================== */}
        <section data-dark className="mt-24 bg-foreground py-20 text-background lg:mt-28 lg:py-24">
          <Wrap className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-20">
            <Reveal>
              <Kicker inverted>{t("nc.kicker")}</Kicker>
              <h2 className="mt-5 font-display text-[2.1rem] leading-[1.04] tracking-[-0.045em] text-background sm:text-[2.9rem] lg:text-[3.5rem]">
                {t("nc.title1")}
                <br />
                <span className="text-background/50">{t("nc.title2")}</span>
              </h2>
              <p className="mt-7 max-w-[400px] text-[16px] leading-[1.7] text-background/65">
                {t("nc.sub")}
              </p>
            </Reveal>

            <dl>
              {specs.map((s, i) => (
                <Reveal
                  key={s.kKey}
                  delay={i * 80}
                  className={cn(
                    "flex justify-between gap-6 border-t border-background/15 py-5 text-[17px]",
                    i === specs.length - 1 && "border-b border-background/15",
                  )}
                >
                  <dt>{t(s.kKey)}</dt>
                  <dd className="shrink-0 text-background/55">{t(s.vKey)}</dd>
                </Reveal>
              ))}
            </dl>
          </Wrap>
        </section>

        {/* ===================== INTERAC ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-28">
            <Reveal className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
              <div>
                <Kicker>{t("int.kicker")}</Kicker>
                <h2 className="mt-4 font-display text-[1.9rem] leading-[1.06] tracking-[-0.04em] sm:text-[2.4rem] lg:text-[2.75rem]">
                  {t("int.title1")}
                  <br />
                  <span className="text-foreground/35">{t("int.title2")}</span>
                </h2>
                <p className="mt-6 max-w-[420px] text-[16px] leading-[1.7] text-muted-foreground">
                  {t("int.sub")}
                </p>
                <div className="mt-7 inline-flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5">
                  <InteracLogo className="h-7" />
                  <span className="text-[13px] text-muted-foreground">{t("int.badge")}</span>
                </div>
                <p className="mt-5 max-w-[420px] text-[12px] leading-[1.7] text-muted-foreground">
                  {t("int.note")}
                </p>
              </div>

              <InteracFlowArt className="mx-auto w-full max-w-[440px]" aria-hidden />
            </Reveal>
          </Wrap>
        </section>

        {/* ===================== DESK OTC ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-28">
            <Reveal className="grid gap-8 border-b pb-8 lg:grid-cols-2 lg:items-end lg:gap-20">
              <div>
                <Kicker>{t("otc.kicker")}</Kicker>
                <h2 className="mt-4 font-display text-[1.9rem] leading-[1.06] tracking-[-0.04em] sm:text-[2.4rem] lg:text-[2.75rem]">
                  {t("otc.title1")}
                  <br />
                  {t("otc.title2")}
                </h2>
              </div>
              <div>
                <p className="text-[16px] leading-[1.7] text-muted-foreground">
                  {t("otc.sub")}
                </p>
                <Button
                  asChild
                  variant="secondary"
                  shape="rounded"
                  size="default"
                  className="mt-6 px-6"
                >
                  <Link to="/otc">{t("otc.cta")}</Link>
                </Button>
              </div>
            </Reveal>
          </Wrap>
        </section>

        {/* ===================== FAQ ===================== */}
        <section id="faq" className="scroll-mt-24">
          <Wrap className="pt-24 lg:pt-28">
            <Reveal>
              <Kicker>{t("faq.kicker")}</Kicker>
              <H2 className="mb-10 mt-4">{t("faq.title")}</H2>
            </Reveal>

            {faqs.map((item, i) => {
              const open = faqOpen === i;
              return (
                <Reveal key={item.qKey} delay={i * 60} className="border-t">
                  <button
                    onClick={() => setFaqOpen(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left"
                  >
                    <span className="font-display text-[17px] tracking-[-0.02em] sm:text-[20px]">
                      {t(item.qKey)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[22px] leading-none text-foreground/35 transition-transform",
                        open && "rotate-45",
                      )}
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                  {open && (
                    <p className="mb-7 max-w-[680px] text-[15px] leading-[1.7] text-muted-foreground">
                      {t(item.aKey)}
                    </p>
                  )}
                </Reveal>
              );
            })}
            <div className="border-t" />
          </Wrap>
        </section>

        {/* ===================== CTA ===================== */}
        <section>
          <Wrap className="pt-28 text-center lg:pt-32">
            <Reveal>
              <h2 className="mx-auto max-w-[760px] text-balance font-display text-[2.6rem] leading-[0.98] tracking-[-0.05em] sm:text-[3.6rem] lg:text-[5rem]">
                {t("cta.title1")}
                <br />
                <Soft>{t("cta.title2")}</Soft>
              </h2>
            </Reveal>
            <Reveal delay={140} className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild variant="appSolid" shape="rounded" size="lg" className="px-7">
                <Link to="/inscription">
                  <Coins className="h-4 w-4" strokeWidth={1.8} />
                  {t("cta.signup")}
                </Link>
              </Button>
              <Button asChild variant="secondary" shape="rounded" size="lg" className="px-7">
                <Link to="/faq">{t("cta.faq")}</Link>
              </Button>
            </Reveal>
          </Wrap>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
