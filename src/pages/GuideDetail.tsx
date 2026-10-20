import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HelpShape from "@/components/help/HelpShape";
import HelpVideo from "@/components/help/HelpVideo";
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GUIDES, GUIDE_GROUPS, STEP_COUNT, TIP_COUNT, guideKey, GUIDE_ALIAS } from "@/lib/guides";
import { HELP_COLORS, guideTheme, inkOn } from "@/lib/faq";

/* Un guide vidéo — même langage que les thèmes du centre d'aide : barre des
   guides, en-tête avec la vidéo sur la forme de son thème, étapes en grands
   chiffres, bandeau « Bon à savoir » à la couleur du thème, guide suivant en
   grand. */

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-[1200px] px-6 sm:px-10 ${className}`}>{children}</div>
);

const linkCls = "inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-[6px] transition-colors hover:underline";

const GuideDetail = () => {
  const t = useT();
  const [lang] = useLang();
  const { slug } = useParams();
  const index = GUIDES.findIndex((g) => g.slug === slug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (index < 0) return <Navigate to={slug && GUIDE_ALIAS[slug] ? `/guide/${GUIDE_ALIAS[slug]}` : "/guide"} replace />;

  const guide = GUIDES[index];
  const group = GUIDE_GROUPS.find((gr) => gr.id === guide.group)!;
  const th = guideTheme(guide.slug);
  const ink = inkOn(th.color);
  const next = GUIDES[(index + 1) % GUIDES.length];
  const nt = guideTheme(next.slug);
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => i + 1);
  const tips = Array.from({ length: TIP_COUNT }, (_, i) => i + 1);

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />

      <main>
        {/* ===================== GUIDES (barre) ===================== */}
        <Wrap className="pt-8 lg:pt-10">
          <div className="flex items-center gap-6 border-b">
            <Link to="/guide" className="flex shrink-0 items-center gap-2 py-4 text-[14px] text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">{t("guide.all")}</span>
            </Link>
            <nav className="-mb-px flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t("guide.all")}>
              {GUIDES.map((g) => {
                const on = g.slug === guide.slug;
                const gt = guideTheme(g.slug);
                return (
                  <Link
                    key={g.slug}
                    to={`/guide/${g.slug}`}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2 border-b-2 py-4 text-[14px] transition-colors",
                      on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <HelpShape shape={gt.shape} color={gt.color} className="h-3 w-3" />
                    {t(guideKey(g, "title"))}
                  </Link>
                );
              })}
            </nav>
          </div>
        </Wrap>

        {/* ===================== EN-TÊTE ===================== */}
        <section className="relative overflow-hidden">
          <Wrap className="relative grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:pt-20">
            <div>
              <p className="animate-up text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("guide.label")} {index + 1} / {GUIDES.length} · {t(group.titleKey)}
              </p>
              <h1 className="animate-up mt-6 font-display text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.055em] [animation-delay:80ms] sm:text-[3.6rem] lg:text-[4.2rem]">
                {t(guideKey(guide, "title"))}
                <span style={{ color: HELP_COLORS.coral }}>.</span>
              </h1>
              <p className="animate-up mt-6 max-w-[440px] text-[15px] leading-[1.7] text-muted-foreground [animation-delay:160ms]">
                {t(guideKey(guide, "desc"))}
              </p>
              <p className="animate-up mt-5 text-[13px] uppercase tracking-[0.16em] text-muted-foreground [animation-delay:200ms]">
                {guide.duration[lang]} {t("guide.seconds")} · {t("guide.steps6")}
              </p>
              <Link to={guide.to} className={cn(linkCls, "animate-up mt-7 [animation-delay:240ms]")}>
                {t(guideKey(guide, "cta"))} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
              </Link>
            </div>

            <div className="animate-up relative [animation-delay:240ms]">
              <span
                aria-hidden
                className="absolute -inset-x-[6%] -bottom-[9%] top-[14%]"
                style={{ background: th.color, borderRadius: "46% 54% 42% 58% / 55% 44% 56% 45%" }}
              />
              <HelpVideo guide={guide} className="relative" />
            </div>
          </Wrap>
        </section>

        {/* ===================== ÉTAPES ===================== */}
        <section>
          <Wrap className="pt-12 lg:pt-20">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: HELP_COLORS.coral }}>
                  {t("guide.steps6")}
                </p>
                <h2 className="mt-4 font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[3.2rem]">
                  {t("guide.stepByStep")}
                </h2>
                <HelpShape shape={th.shape} color={th.color} className="mt-8 hidden h-14 w-14 lg:block" />
              </div>
              <ol>
                {steps.map((n) => (
                  <li key={n} className="grid grid-cols-[64px_1fr] gap-4 border-t py-7 last:border-b sm:grid-cols-[96px_1fr]">
                    <span className="font-display text-[3rem] font-semibold leading-[0.9] tracking-[-0.06em] sm:text-[4rem]" style={{ color: HELP_COLORS.coral }}>
                      {n}
                    </span>
                    <div>
                      <h3 className="font-display text-[1.4rem] leading-[1.2] tracking-[-0.03em] sm:text-[1.6rem]">{t(guideKey(guide, `s${n}`))}</h3>
                      <p className="mt-2 max-w-[520px] text-[15px] leading-[1.7] text-muted-foreground">{t(guideKey(guide, `s${n}d`))}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {/* ===================== BON À SAVOIR ===================== */}
        <section className="pt-24 lg:pt-32">
          <div className="relative overflow-hidden" style={{ background: th.color, color: ink }}>
            <span aria-hidden className="ooble-float absolute -right-10 -top-10 hidden h-44 w-44 rounded-full opacity-20 sm:block" style={{ background: ink }} />
            <Wrap className="relative grid gap-10 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-24">
              <div>
                <h2 className="font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[3.2rem]">{t("guide.tips")}</h2>
                <Link
                  to={guide.to}
                  className="mt-8 inline-flex items-center gap-2 rounded-md px-6 py-3.5 text-[15px] font-medium transition-opacity hover:opacity-90"
                  style={{ background: ink, color: th.color }}
                >
                  {t(guideKey(guide, "cta"))} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                </Link>
              </div>
              <ul>
                {tips.map((n) => (
                  <li key={n} className="flex gap-5 border-t py-6 last:border-b" style={{ borderColor: `${ink}26` }}>
                    <HelpShape shape={th.shape} color={ink} className="mt-1.5 h-4 w-4 shrink-0 opacity-70" />
                    <span className="font-display text-[1.25rem] leading-[1.35] tracking-[-0.025em] sm:text-[1.4rem]">{t(guideKey(guide, `tip${n}`))}</span>
                  </li>
                ))}
              </ul>
            </Wrap>
          </div>
        </section>

        {/* ===================== GUIDE SUIVANT ===================== */}
        <section>
          <Wrap className="pb-10 pt-24 lg:pt-32">
            <Link to={`/guide/${next.slug}`} className="group block border-t pt-10">
              <span className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">{t("guide.next")}</span>
              <span className="mt-4 flex items-center gap-5 font-display text-[2.6rem] font-semibold leading-[1] tracking-[-0.055em] sm:text-[4rem] lg:text-[5rem]">
                <HelpShape shape={nt.shape} color={nt.color} className="h-9 w-9 shrink-0 sm:h-12 sm:w-12" />
                <span className="transition-colors group-hover:text-foreground/60">{t(guideKey(next, "title"))}</span>
                <ArrowRight className="ml-auto h-8 w-8 shrink-0 transition-transform duration-300 group-hover:translate-x-2 sm:h-12 sm:w-12" strokeWidth={1.4} />
              </span>
            </Link>
            <p className="mt-10 text-[15px] text-muted-foreground">
              {t("guide.help")}{" "}
              <Link to="/faq" className="font-medium text-foreground underline underline-offset-4">{t("guide.toFaq")}</Link>
            </p>
          </Wrap>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default GuideDetail;
