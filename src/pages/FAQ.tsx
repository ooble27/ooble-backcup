import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import HelpShape from "@/components/help/HelpShape";
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GUIDES, guideKey, guideMedia } from "@/lib/guides";
import { FAQ_CATEGORIES, HELP_COLORS, PAY_RULES, POPULAR, categoryVideos, fold } from "@/lib/faq";
import type { TKey } from "@/lib/translations";
import { supportEmail } from "@/lib/config";

/* Centre d'aide — même langage que la page Entreprises : grands titres, touches
   corail / tournesol / menthe, formes pleines, liens texte plutôt que boutons.
   Chaque thème a sa couleur et sa forme, reprises sur sa page. */

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-[1200px] px-6 sm:px-10 ${className}`}>{children}</div>
);

const linkCls = "inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-[6px] transition-colors hover:underline";
const INK = "#14110f";

const FAQ = () => {
  const t = useT();
  const [lang] = useLang();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState(0);

  // Recherche dans toutes les questions et réponses (accents et casse ignorés).
  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return null;
    return FAQ_CATEGORIES.flatMap((c) =>
      c.items
        .filter((it) => words.every((w) => fold(`${t(it.q)} ${t(it.a)}`).includes(w)))
        .map((it) => ({ cat: c, it })),
    );
  }, [query, t]);

  const active = FAQ_CATEGORIES[topic];
  const activeVid = categoryVideos(active)[0];
  const popular = POPULAR.map(([c, id]) => {
    const cat = FAQ_CATEGORIES.find((x) => x.slug === c)!;
    return { cat, it: cat.items.find((x) => x.id === id)! };
  });

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />

      <main>
        {/* ===================== EN-TÊTE + RECHERCHE ===================== */}
        <section className="relative overflow-hidden">
          <span aria-hidden className="ooble-float absolute hidden sm:block left-[7%] top-[18%] h-10 w-10 rounded-full" style={{ background: HELP_COLORS.coral }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block right-[10%] top-[14%] h-0 w-0 border-x-[22px] border-b-[38px] border-x-transparent [animation-delay:-2s]" style={{ borderBottomColor: HELP_COLORS.sun }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block right-[15%] top-[52%] h-9 w-9 rotate-12 rounded-md [animation-delay:-4s]" style={{ background: HELP_COLORS.mint }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block left-[12%] top-[58%] h-6 w-6 rounded-full [animation-delay:-1s]" style={{ background: HELP_COLORS.sun }} />

          <Wrap className="relative pb-6 pt-20 text-center lg:pt-24">
            <p className="animate-up text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{t("faqp.kicker")}</p>
            <h1 className="animate-up mx-auto mt-6 max-w-[980px] font-display text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.055em] [animation-delay:80ms] sm:text-[4rem] lg:text-[5.4rem]">
              {t("faqp.heroA")} <span style={{ color: HELP_COLORS.coral }}>{t("faqp.heroB")}</span>
            </h1>

            <div className="animate-up mx-auto mt-12 max-w-[760px] text-left [animation-delay:160ms]">
              <label className="relative block">
                <span className="sr-only">{t("faqp.searchPh")}</span>
                <Search className="pointer-events-none absolute left-0 top-1/2 h-6 w-6 -translate-y-1/2 text-foreground/40 sm:h-7 sm:w-7" strokeWidth={1.8} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("faqp.searchPh")}
                  className="w-full border-b-2 border-foreground/15 bg-transparent py-4 pl-10 pr-10 font-display text-[1.35rem] tracking-[-0.03em] outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground sm:pl-12 sm:text-[1.9rem] [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("faqp.clear")}
                    className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </label>
              {!results && (
                <p className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[14px] text-muted-foreground">
                  <span>{t("faqp.popular")}</span>
                  {popular.map(({ cat, it }) => (
                    <Link key={it.id} to={`/faq/${cat.slug}#${it.id}`} className="text-foreground underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-foreground">
                      {t(`faqp.pop.${it.id}` as TKey)}
                    </Link>
                  ))}
                </p>
              )}
            </div>
          </Wrap>
        </section>

        {results ? (
          /* ===================== RÉSULTATS ===================== */
          <Wrap className="pb-8 pt-10">
            <div className="mx-auto max-w-[760px]" aria-live="polite">
              <p className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
                {results.length === 0 ? t("faqp.searchNoneShort") : t("faqp.searchCount").replace("{n}", String(results.length))}
              </p>
              {results.length > 0 ? (
                <ul className="mt-5">
                  {results.map(({ cat, it }) => (
                    <li key={`${cat.slug}-${it.id}`} className="border-t last:border-b">
                      <Link to={`/faq/${cat.slug}#${it.id}`} className="group flex items-start gap-4 py-6">
                        <HelpShape shape={cat.shape} color={cat.color} className="mt-2 h-4 w-4 shrink-0" />
                        <span className="flex-1">
                          <span className="block font-display text-[1.3rem] leading-[1.25] tracking-[-0.03em] sm:text-[1.5rem]">{t(it.q)}</span>
                          <span className="mt-1.5 block text-[13px] text-muted-foreground">{t(cat.title)}</span>
                        </span>
                        <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-foreground/30 transition-all group-hover:translate-x-1 group-hover:text-foreground" strokeWidth={1.8} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-6">
                  <p className="font-display text-[1.6rem] leading-[1.2] tracking-[-0.035em]">{t("faqp.searchNoneTitle")}</p>
                  <Link to="/contact" className={cn(linkCls, "mt-4")}>
                    {t("faqp.writeUs")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                  </Link>
                </div>
              )}
            </div>
          </Wrap>
        ) : (
          <>
            {/* ===================== THÈMES ===================== */}
            <section>
              <Wrap className="pt-24 lg:pt-32">
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: HELP_COLORS.coral }}>
                  {t("faqp.topicsKicker")}
                </p>

                {/* Ordinateur : grands titres à gauche, aperçu du thème survolé à droite */}
                <div className="mt-6 hidden items-start gap-16 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
                  <nav className="flex flex-col items-start" aria-label={t("faqp.topics")}>
                    {FAQ_CATEGORIES.map((c, i) => (
                      <Link
                        key={c.slug}
                        to={`/faq/${c.slug}`}
                        onMouseEnter={() => setTopic(i)}
                        onFocus={() => setTopic(i)}
                        className={cn(
                          "group flex items-center gap-5 whitespace-nowrap py-1.5 font-display text-[2.7rem] font-semibold leading-[1.08] tracking-[-0.05em] transition-colors xl:text-[3.1rem]",
                          topic === i ? "text-foreground" : "text-foreground/15 hover:text-foreground/40",
                        )}
                      >
                        <HelpShape shape={c.shape} color={c.color} className={cn("h-7 w-7 shrink-0 transition-transform duration-300", topic === i ? "scale-100" : "scale-75 opacity-40")} />
                        {t(c.title)}
                      </Link>
                    ))}
                  </nav>

                  <div className="sticky top-24">
                    <Link to={`/faq/${active.slug}`} className="group block">
                      <div
                        className="relative aspect-[4/3] w-full transition-colors duration-500"
                        style={{ background: active.color, borderRadius: "46% 54% 42% 58% / 55% 44% 56% 45%" }}
                      >
                        {activeVid && (
                          <img
                            key={active.slug}
                            src={guideMedia(activeVid, lang).thumb}
                            alt=""
                            className="animate-up absolute inset-x-[9%] top-[18%] w-[82%] rounded-lg shadow-[0_30px_60px_-25px_rgba(0,0,0,0.45)] transition-transform duration-500 group-hover:-translate-y-1"
                          />
                        )}
                      </div>
                    </Link>
                    <div key={active.slug} className="animate-up mt-8 max-w-[460px]">
                      <p className="text-[15px] leading-[1.7] text-muted-foreground">{t(active.desc)}</p>
                      <p className="mt-3 text-[13px] text-muted-foreground">
                        {t("faqp.nQuestions").replace("{n}", String(active.items.length))}
                        {activeVid && <> · {t("faqp.videoS").replace("{n}", String(activeVid.duration[lang]))}</>}
                      </p>
                      <Link to={`/faq/${active.slug}`} className={cn(linkCls, "mt-5")}>
                        {t("faqp.openTopic")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Mobile et tablette : liste */}
                <ul className="mt-8 lg:hidden">
                  {FAQ_CATEGORIES.map((c) => {
                    const v = categoryVideos(c)[0];
                    return (
                      <li key={c.slug} className="border-t last:border-b">
                        <Link to={`/faq/${c.slug}`} className="flex items-center gap-5 py-6">
                          <span className="relative h-[72px] w-[96px] shrink-0 overflow-hidden rounded-md" style={{ background: c.color }}>
                            {v && <img src={guideMedia(v, lang).thumb} alt="" loading="lazy" className="absolute left-[10%] top-[16%] w-[80%] rounded-[3px]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2.5 font-display text-[1.45rem] font-semibold leading-[1.1] tracking-[-0.04em]">
                              {t(c.title)}
                            </span>
                            <span className="mt-1 block text-[13px] text-muted-foreground">
                              {t("faqp.nQuestions").replace("{n}", String(c.items.length))}
                              {v && <> · {t("faqp.videoS").replace("{n}", String(v.duration[lang]))}</>}
                            </span>
                          </span>
                          <ArrowRight className="h-5 w-5 shrink-0 text-foreground/40" strokeWidth={1.8} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Wrap>
            </section>

            {/* ===================== LES QUATRE RÈGLES ===================== */}
            <section className="mt-28 lg:mt-36" style={{ background: HELP_COLORS.sun, color: INK }}>
              <Wrap className="py-20 lg:py-28">
                <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: INK }}>
                      {t("faqp.rules.kicker")}
                    </p>
                    <h2 className="mt-4 font-display text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-[3.6rem]">
                      {t("faqp.rules.punch")}
                    </h2>
                    <p className="mt-5 max-w-[400px] text-[15px] leading-[1.7]" style={{ color: "rgba(20,17,15,0.7)" }}>
                      {t("faqp.rules.sub")}
                    </p>
                    <Link to="/faq/payer-par-interac#regles-interac" className={cn(linkCls, "mt-7")} style={{ color: INK }}>
                      {t("faqp.rules.more")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                    </Link>
                  </div>
                  <ol className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
                    {PAY_RULES.map((r, i) => (
                      <li key={r.title} className="border-t pt-5" style={{ borderColor: "rgba(20,17,15,0.25)" }}>
                        <span className="font-display text-[3.4rem] font-semibold leading-none tracking-[-0.06em]">{i + 1}</span>
                        <p className="mt-4 font-display text-[1.3rem] leading-[1.2] tracking-[-0.03em]">{t(r.title)}</p>
                        <p className="mt-2 text-[14.5px] leading-[1.65]" style={{ color: "rgba(20,17,15,0.7)" }}>{t(r.body)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </Wrap>
            </section>

            {/* ===================== GUIDES VIDÉO ===================== */}
            <section>
              <Wrap className="pt-24 lg:pt-32">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: HELP_COLORS.coral }}>
                      {t("faqp.videosKicker")}
                    </p>
                    <h2 className="mt-4 font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[3.2rem]">
                      {t("faqp.videosTitle")}
                    </h2>
                  </div>
                  <Link to="/guide" className={linkCls}>
                    {t("faqp.allGuides")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                  </Link>
                </div>
              </Wrap>
              <div className="mx-auto mt-10 max-w-[1200px]">
                <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-4 sm:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {GUIDES.map((g) => (
                    <Link key={g.slug} to={`/guide/${g.slug}`} className="group w-[280px] shrink-0 snap-start sm:w-[320px]">
                      <div className="overflow-hidden rounded-lg border bg-secondary">
                        <img src={guideMedia(g, lang).thumb} alt="" loading="lazy" className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      </div>
                      <p className="mt-4 font-display text-[1.15rem] tracking-[-0.03em]">{t(guideKey(g, "title"))}</p>
                      <p className="mt-1 text-[13px] text-muted-foreground">{t("faqp.videoS").replace("{n}", String(g.duration[lang]))}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {/* ===================== APPEL FINAL ===================== */}
        <section>
          <Wrap className="pb-10 pt-24 text-center lg:pt-32">
            <Reveal>
              <h2 className="mx-auto max-w-[900px] font-display text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-[4.2rem] lg:text-[5.2rem]">
                {t("faqp.endA")} <span className="text-foreground/35">{t("faqp.endB")}</span>
              </h2>
            </Reveal>
            <Reveal delay={140} className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              <Link to="/contact" className={linkCls}>
                {t("faqp.writeUs")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
              </Link>
              <a href={`mailto:${supportEmail()}`} className={cn(linkCls, "text-muted-foreground hover:text-foreground")}>
                {supportEmail()}
              </a>
            </Reveal>
          </Wrap>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;
