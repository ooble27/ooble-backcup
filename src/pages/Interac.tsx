import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import { FAQ_CATEGORIES, PAY_RULES } from "@/lib/faq";
import { t, type TKey } from "@/lib/translations";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* Payer par Interac : la page publique qui explique le paiement d'un achat (trois gestes, quatre
   règles) et la réception d'une vente. Même écriture que la page OTC : pas de cartes, de la
   typographie, une bande grise pour les étapes et une bande finale pleine largeur.
   Les règles et les questions viennent du centre d'aide (une seule source de vérité). */

type Bi = { fr: string; en: string };

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-[1200px] px-6 sm:px-10 ${className}`}>{children}</div>
);

const Kicker = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("text-[12px] uppercase tracking-[0.16em] text-muted-foreground", className)}>{children}</p>
);

const H2 = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h2 className={cn("font-display text-[2rem] leading-[1.05] tracking-[-0.045em] sm:text-[2.6rem] lg:text-[3rem]", className)}>{children}</h2>
);

const STEPS: { t: Bi; d: Bi; tag?: string }[] = [
  {
    t: { fr: "Ouvrez l'app de votre banque", en: "Open your bank's app" },
    d: { fr: "Choisissez « Virement Interac », depuis un compte à votre nom.", en: "Choose “Interac e-Transfer”, from an account in your name." },
  },
  {
    t: { fr: "Envoyez le montant exact", en: "Send the exact amount" },
    d: { fr: "À interac@ooble.ca, au cent près, en un seul virement.", en: "To interac@ooble.ca, to the cent, in a single transfer." },
    tag: "interac@ooble.ca",
  },
  {
    t: { fr: "Ajoutez la référence", en: "Add the reference" },
    d: { fr: "Dans le champ « Message » du virement, et rien d'autre.", en: "In the transfer's “Message” field, and nothing else." },
    tag: "OOB-7C3E91A2",
  },
  {
    t: { fr: "Vos USDC partent", en: "Your USDC go out" },
    d: { fr: "Le virement est reconnu automatiquement, et vos USDC sont envoyés à votre portefeuille.", en: "The transfer is matched automatically, and your USDC are sent to your wallet." },
  },
];

const SELL: Bi[] = [
  { fr: "Le virement part vers le courriel de votre compte Ooble, et seulement vers lui.", en: "The transfer goes to your Ooble account email, and only there." },
  { fr: "Si votre banque demande une réponse de sécurité, elle s'affiche dans le détail de votre vente.", en: "If your bank asks for a security answer, it's shown in your sale's details." },
  { fr: "Vous voyez le montant en dollars avant d'envoyer vos USDC.", en: "You see the dollar amount before you send your USDC." },
];

const Interac = () => {
  const [lang] = useLang();
  const L = (b: Bi) => b[lang];
  const T = (k: TKey) => t(k, lang);
  const fr = lang === "fr";
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const questions = FAQ_CATEGORIES.find((c) => c.slug === "payer-par-interac")?.items ?? [];

  const linkCls = "inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-[6px] transition-colors hover:underline";
  /** Mot-clé en noir dans une phrase en gris. */
  const B = ({ children }: { children: React.ReactNode }) => <span className="text-foreground">{children}</span>;

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />

      <main>
        {/* ===================== EN-TÊTE : texte + visuel ===================== */}
        <section>
          <Wrap className="grid items-center gap-12 pb-8 pt-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:pt-20">
            <div>
              <p className="animate-up text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
                {L({ fr: "Payer par Interac", en: "Paying with Interac" })}
              </p>
              <h1 className="animate-up mt-6 font-display text-[2.7rem] leading-[0.98] tracking-[-0.05em] [animation-delay:80ms] sm:text-[3.6rem] lg:text-[4.1rem]">
                {L({ fr: "Vos USDC, payés", en: "Your USDC, paid" })}
                <br />
                <span className="text-foreground/35">{L({ fr: "en trois gestes.", en: "in three steps." })}</span>
              </h1>
              <p className="animate-up mt-6 max-w-[460px] text-[15px] leading-[1.7] text-muted-foreground [animation-delay:160ms] sm:text-[16px]">
                {L({
                  fr: "Vous payez vos achats en dollars canadiens par virement Interac, depuis l'app de votre banque. Le prix est affiché avant de payer.",
                  en: "You pay for your purchases in Canadian dollars by Interac e-Transfer, from your bank's app. The price is shown before you pay.",
                })}
              </p>
              <div className="animate-up mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 [animation-delay:240ms]">
                <Link to="/inscription" className={linkCls}>{L({ fr: "Créer un compte", en: "Create an account" })} <ArrowRight className="h-4 w-4" strokeWidth={1.8} /></Link>
                <a href="#etapes" className={cn(linkCls, "text-muted-foreground hover:text-foreground")}>{L({ fr: "Les étapes", en: "The steps" })}</a>
              </div>
              <ul className="animate-up mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-muted-foreground [animation-delay:320ms]">
                {[
                  { fr: "Dépôt automatique", en: "Autodeposit" },
                  { fr: "Sans question de sécurité", en: "No security question" },
                  { fr: "Jour et nuit", en: "Day and night" },
                ].map((x) => (
                  <li key={x.fr} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-foreground/70" strokeWidth={2.4} />
                    {L(x)}
                  </li>
                ))}
              </ul>
            </div>

            <img
              src={`/email-assets/v-interac-${lang}.png`}
              alt={L({ fr: "Téléphone : virement Interac envoyé, 250,00 $", en: "Phone: Interac transfer sent, $250.00" })}
              width={840}
              height={702}
              className="animate-up w-full rounded-[28px] [animation-delay:200ms]"
            />
          </Wrap>
        </section>

        {/* ===================== LA PHRASE ===================== */}
        <section>
          <Wrap className="pt-28 lg:pt-36">
            <Reveal>
              <Kicker>{L({ fr: "Pourquoi c'est simple", en: "Why it's simple" })}</Kicker>
              <p className="mt-8 max-w-[1080px] text-balance font-display text-[1.85rem] leading-[1.18] tracking-[-0.04em] text-foreground/35 sm:text-[2.5rem] lg:text-[3.15rem]">
                {fr ? (
                  <>
                    Votre virement est <B>lu et vérifié automatiquement</B>. S'il suit les règles, <B>vos USDC partent seuls</B>, de jour comme de nuit.
                    Sinon, <B>votre argent n'est pas perdu</B> : notre équipe le traite à la main.
                  </>
                ) : (
                  <>
                    Your transfer is <B>read and checked automatically</B>. If it follows the rules, <B>your USDC go out on their own</B>, day or night.
                    If not, <B>your money isn't lost</B>: our team handles it by hand.
                  </>
                )}
              </p>
            </Reveal>
          </Wrap>
        </section>

        {/* ===================== ÉTAPES (bande grise pleine largeur) ===================== */}
        <section id="etapes" className="mt-28 scroll-mt-24 bg-secondary lg:mt-36">
          <Wrap className="py-20 lg:py-24">
            <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <Kicker>{L({ fr: "Les étapes", en: "The steps" })}</Kicker>
                <H2 className="mt-4">
                  {L({ fr: "De votre banque", en: "From your bank" })} <span className="text-foreground/35">{L({ fr: "à votre portefeuille.", en: "to your wallet." })}</span>
                </H2>
              </div>
              <p className="max-w-[300px] text-[15px] leading-[1.6] text-muted-foreground">
                {L({ fr: "Le montant et la référence se copient d'un geste depuis votre ordre.", en: "The amount and the reference copy in one tap from your order." })}
              </p>
            </Reveal>

            <ol className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal
                  key={s.t.fr}
                  delay={i * 90}
                  className="border-t border-foreground/10 py-7 sm:pr-8 lg:border-l lg:border-t-0 lg:px-6 lg:py-2 lg:first:border-l-0 lg:first:pl-0"
                >
                  <p className="font-display text-[3.4rem] leading-none tracking-[-0.06em] text-foreground/15">{i + 1}</p>
                  <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.015em]">{L(s.t)}</h3>
                  <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground">{L(s.d)}</p>
                  {s.tag && <p className="mt-4 font-mono text-[13px] tracking-normal text-foreground">{s.tag}</p>}
                </Reveal>
              ))}
            </ol>
          </Wrap>
        </section>

        {/* ===================== LES QUATRE RÈGLES ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-28">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <Reveal>
                <Kicker>{T("faqp.rules.kicker")}</Kicker>
                <p className="mt-4 font-display text-[5.5rem] leading-[0.9] tracking-[-0.06em] sm:text-[7rem]">4</p>
                <H2 className="mt-2">{L({ fr: "règles à suivre.", en: "rules to follow." })}</H2>
                <p className="mt-6 max-w-[360px] text-[14px] leading-[1.7] text-muted-foreground">{T("faqp.rules.sub")}</p>
              </Reveal>
              <ul>
                {PAY_RULES.map((r, i) => (
                  <Reveal key={r.title} delay={i * 70} className="border-b py-6 first:border-t">
                    <p className="text-[16px] font-semibold tracking-[-0.015em]">{T(r.title)}</p>
                    <p className="mt-2 max-w-[600px] text-[14.5px] leading-[1.65] text-muted-foreground">{T(r.body)}</p>
                  </Reveal>
                ))}
              </ul>
            </div>
          </Wrap>
        </section>

        {/* ===================== VENDRE : RECEVOIR PAR INTERAC ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-32">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16">
              <Reveal>
                <Kicker>{L({ fr: "Et pour vendre", en: "And to sell" })}</Kicker>
                <p className="mt-6 font-display text-[2.6rem] leading-[0.98] tracking-[-0.05em] sm:text-[3.6rem] lg:text-[4.4rem]">
                  {L({ fr: "Vous recevez", en: "You get paid" })}
                  <br />
                  <span className="text-foreground/35">{L({ fr: "par Interac aussi.", en: "by Interac too." })}</span>
                </p>
              </Reveal>
              <Reveal delay={120} className="lg:pb-3">
                <ul>
                  {SELL.map((x) => (
                    <li key={x.fr} className="flex gap-3 border-b py-4 text-[15px] leading-[1.6] text-muted-foreground first:border-t">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-foreground/70" strokeWidth={2.2} />
                      {L(x)}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </Wrap>
        </section>

        {/* ===================== QUESTIONS ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-28">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <Reveal>
                <Kicker>{L({ fr: "Questions", en: "Questions" })}</Kicker>
                <H2 className="mt-4">{T("faqp.qTitle")}</H2>
                <Link to="/guide/payer-par-interac" className={cn(linkCls, "mt-6")}>
                  {L({ fr: "Voir le guide vidéo", en: "Watch the video guide" })} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                </Link>
              </Reveal>
              <div>
                {questions.map((item, i) => {
                  const open = faqOpen === i;
                  return (
                    <Reveal key={item.id} delay={i * 60} className="border-b first:border-t">
                      <button
                        onClick={() => setFaqOpen(open ? null : i)}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-6 py-6 text-left"
                      >
                        <span className="font-display text-[17px] tracking-[-0.02em] sm:text-[19px]">{T(item.q)}</span>
                        <span className={cn("shrink-0 text-[22px] leading-none text-foreground/35 transition-transform", open && "rotate-45")} aria-hidden>
                          +
                        </span>
                      </button>
                      {open && <p className="mb-7 max-w-[600px] text-[15px] leading-[1.7] text-muted-foreground">{T(item.a)}</p>}
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </Wrap>
        </section>

        {/* ===================== BANDE FINALE ===================== */}
        <section data-dark className="mt-28 bg-foreground text-background lg:mt-36">
          <Wrap className="py-24 text-center lg:py-32">
            <Reveal>
              <p className="text-[12px] uppercase tracking-[0.16em] text-background/55">{L({ fr: "Commencer", en: "Get started" })}</p>
              <h2 className="mx-auto mt-6 max-w-[820px] font-display text-[2.6rem] leading-[0.98] tracking-[-0.05em] sm:text-[3.8rem] lg:text-[4.8rem]">
                {L({ fr: "Votre banque,", en: "Your bank," })}
                <br />
                <span className="text-background/45">{L({ fr: "vos USDC.", en: "your USDC." })}</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <Link to="/inscription" className="mt-10 inline-flex items-center gap-2 font-display text-[1.4rem] tracking-[-0.03em] underline-offset-[6px] hover:underline sm:text-[1.8rem]">
                {L({ fr: "Créer un compte", en: "Create an account" })} <ArrowRight className="h-5 w-5" strokeWidth={1.8} />
              </Link>
            </Reveal>
          </Wrap>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Interac;
