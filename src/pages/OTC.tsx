import { useState } from "react";
import { FINTRAC_MSB_NUMBER } from "@/lib/legal";
import { Link } from "react-router-dom";
import { ArrowRight, Check, FileText, Landmark, ShieldCheck, Wallet } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import OtcVideo from "@/components/OtcVideo";
import { ORDER_NETWORKS } from "@/components/app/networks";
import { OOBLE_OTC_EMAIL, TRADE_DAILY_MAX_CAD } from "@/lib/config";
import { useOtcVisible } from "@/lib/otc";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* Desk OTC : achats et ventes de USDT au-delà de la limite de l'application
   (9 999 $ sur 24 heures). Page ouverte, sans cartes : en-tête en deux
   colonnes avec la vidéo de présentation, puis de la typographie — une
   grande phrase, le chiffre clé, la frise verticale des étapes, la liste à
   préparer, les questions, et une bande finale pleine largeur.
   Les demandes arrivent dans la boîte otc@ooble.ca (Admin → Messagerie,
   pastille « OTC »). Le bouton « Demander un prix » (formulaire /app/otc)
   n'apparaît que pour l'équipe Ooble tant que OTC_ENABLED vaut false ; les
   autres écrivent à otc@ooble.ca. */

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

const STEPS: { t: Bi; d: Bi }[] = [
  { t: { fr: "Vous écrivez au desk", en: "You write to the desk" }, d: { fr: "Achat ou vente, montant, réseau. Un membre de l'équipe vous répond personnellement.", en: "Buy or sell, amount, network. A team member replies to you personally." } },
  { t: { fr: "Nous vérifions le dossier", en: "We review your file" }, d: { fr: "Identité ou entreprise, et origine des fonds. Compte déjà vérifié : il ne reste en général qu'un justificatif.", en: "Identity or business, and source of funds. Already verified: usually only one document is left." } },
  { t: { fr: "Vous recevez un prix ferme", en: "You get a firm price" }, d: { fr: "Garanti pendant la durée indiquée dans la cotation. Vous l'acceptez, ou non.", en: "Guaranteed for the time stated in the quote. Accept it, or not." } },
  { t: { fr: "Règlement", en: "Settlement" }, d: { fr: "Par virement bancaire, puis envoi des USDT à votre adresse, ou des dollars sur votre compte.", en: "By bank transfer, then the USDT go to your address, or the dollars to your account." } },
  { t: { fr: "Reçu", en: "Receipt" }, d: { fr: "Montants, taux et transaction sur la blockchain, par courriel.", en: "Amounts, rate and blockchain transaction, by email." } },
];

const NEEDS: { icon: React.ElementType; t: Bi; d: Bi }[] = [
  { icon: ShieldCheck, t: { fr: "Un compte vérifié", en: "A verified account" }, d: { fr: "Identité, ou entreprise pour un compte entreprise.", en: "Identity, or business for a business account." } },
  { icon: FileText, t: { fr: "L'origine des fonds", en: "Source of funds" }, d: { fr: "Relevé bancaire, contrat, facture…", en: "Bank statement, contract, invoice…" } },
  { icon: Wallet, t: { fr: "Pour un achat", en: "To buy" }, d: { fr: "Votre adresse USDT et le réseau.", en: "Your USDT address and network." } },
  { icon: Landmark, t: { fr: "Pour une vente", en: "To sell" }, d: { fr: "Un compte bancaire canadien à votre nom.", en: "A Canadian bank account in your name." } },
];

const FAQ: { q: Bi; a: Bi }[] = [
  {
    q: { fr: "Pourquoi passer par le desk plutôt que par l'app ?", en: "Why use the desk instead of the app?" },
    a: {
      fr: `Dans l'application, achats et ventes sont limités à ${TRADE_DAILY_MAX_CAD.toLocaleString("fr-CA")} $ sur 24 heures. Au-delà, le desk traite votre opération en une fois, avec un prix ferme.`,
      en: `In the app, purchases and sales are limited to $${TRADE_DAILY_MAX_CAD.toLocaleString("en-CA")} over 24 hours. Above that, the desk handles your trade in one go, at a firm price.`,
    },
  },
  {
    q: { fr: "Le prix peut-il changer ?", en: "Can the price change?" },
    a: {
      fr: "Non, pas pendant la durée de validité indiquée dans la cotation. Passé ce délai, nous vous proposons un nouveau prix.",
      en: "No, not during the validity period stated in the quote. After that, we send you a new price.",
    },
  },
  {
    q: { fr: "Comment se fait le paiement ?", en: "How is payment made?" },
    a: {
      fr: "Par virement bancaire, depuis ou vers un compte canadien à votre nom. Interac n'est pas utilisé à ces montants.",
      en: "By bank transfer, from or to a Canadian account in your name. Interac isn't used at these amounts.",
    },
  },
  {
    q: { fr: "Pourquoi demander l'origine des fonds ?", en: "Why ask for the source of funds?" },
    a: {
      fr: `Entreprise de services monétaires inscrite auprès de CANAFE (n° ${FINTRAC_MSB_NUMBER}), nous vérifions l'identité de nos clients et l'origine des fonds, et déclarons à CANAFE les opérations prévues par la loi.`,
      en: `As a money services business registered with FINTRAC (no. ${FINTRAC_MSB_NUMBER}), we verify our clients' identity and the source of funds, and report to FINTRAC the transactions required by law.`,
    },
  },
];

const OTC = () => {
  const [lang] = useLang();
  const L = (b: Bi) => b[lang];
  const canRequest = useOtcVisible();
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const mailto = `mailto:${OOBLE_OTC_EMAIL}`;
  const fr = lang === "fr";

  /** Appel principal, en simple lien : formulaire pour l'équipe, courriel pour les autres. */
  const linkCls = "inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-[6px] transition-colors hover:underline";
  const Primary = () =>
    canRequest ? (
      <Link to="/app/otc" className={linkCls}>{L({ fr: "Demander un prix", en: "Request a quote" })} <ArrowRight className="h-4 w-4" strokeWidth={1.8} /></Link>
    ) : (
      <a href={mailto} className={linkCls}>{L({ fr: "Écrire au desk", en: "Write to the desk" })} <ArrowRight className="h-4 w-4" strokeWidth={1.8} /></a>
    );

  /** Mot-clé en noir dans une phrase en gris. */
  const B = ({ children }: { children: React.ReactNode }) => <span className="text-foreground">{children}</span>;

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />

      <main>
        {/* ===================== EN-TÊTE : texte + vidéo ===================== */}
        <section>
          <Wrap className="grid items-center gap-12 pb-8 pt-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:pt-20">
            <div>
              <p className="animate-up text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
                {L({ fr: "Desk OTC · Gros volumes de USDT", en: "OTC desk · Large USDT volumes" })}
              </p>
              <h1 className="animate-up mt-6 font-display text-[2.7rem] leading-[0.98] tracking-[-0.05em] [animation-delay:80ms] sm:text-[3.6rem] lg:text-[4.1rem]">
                {L({ fr: "Le desk OTC,", en: "The OTC desk," })}
                <br />
                <span className="text-foreground/35">{L({ fr: "pour vos gros montants.", en: "for your large amounts." })}</span>
              </h1>
              <p className="animate-up mt-6 max-w-[460px] text-[15px] leading-[1.7] text-muted-foreground [animation-delay:160ms] sm:text-[16px]">
                {L({
                  fr: "Achetez ou vendez des USDT à partir de 10 000 $, à un prix ferme, avec un seul interlocuteur de l'équipe Ooble.",
                  en: "Buy or sell USDT from $10,000, at a firm price, with one contact from the Ooble team.",
                })}
              </p>
              <div className="animate-up mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 [animation-delay:240ms]">
                <Primary />
                <a href="#etapes" className={cn(linkCls, "text-muted-foreground hover:text-foreground")}>{L({ fr: "Les étapes", en: "The steps" })}</a>
              </div>
              <ul className="animate-up mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-muted-foreground [animation-delay:320ms]">
                {[
                  { fr: "Achat et vente", en: "Buy and sell" },
                  { fr: "Particuliers et entreprises", en: "Individuals and businesses" },
                  { fr: "Français et anglais", en: "French and English" },
                ].map((x) => (
                  <li key={x.fr} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-foreground/70" strokeWidth={2.4} />
                    {L(x)}
                  </li>
                ))}
              </ul>
            </div>

            <OtcVideo className="animate-up [animation-delay:200ms]" />
          </Wrap>
        </section>

        {/* ===================== LA PHRASE ===================== */}
        <section>
          <Wrap className="pt-28 lg:pt-36">
            <Reveal>
              <Kicker>{L({ fr: "Pourquoi le desk", en: "Why the desk" })}</Kicker>
              <p className="mt-8 max-w-[1080px] text-balance font-display text-[1.85rem] leading-[1.18] tracking-[-0.04em] text-foreground/35 sm:text-[2.5rem] lg:text-[3.15rem]">
                {fr ? (
                  <>
                    Un <B>prix ferme</B>, garanti pendant la durée indiquée. <B>Un seul interlocuteur</B>, de la demande jusqu'au reçu.
                    Et <B>le montant entier</B>, en une seule fois, sans avoir à le découper sur plusieurs jours.
                  </>
                ) : (
                  <>
                    A <B>firm price</B>, guaranteed for the time stated. <B>One contact</B>, from request to receipt.
                    And <B>the full amount</B>, in one go, no need to split it over several days.
                  </>
                )}
              </p>
            </Reveal>
          </Wrap>
        </section>

        {/* ===================== LE CHIFFRE ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-32">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16">
              <Reveal>
                <p className="text-[15px] text-muted-foreground">{L({ fr: "À partir de", en: "From" })}</p>
                <p className="mt-2 font-display text-[4.6rem] leading-[0.9] tracking-[-0.06em] sm:text-[7rem] lg:text-[9rem]">
                  {L({ fr: "10 000 $", en: "$10,000" })}
                </p>
              </Reveal>
              <Reveal delay={120} className="lg:pb-4">
                <p className="max-w-[420px] text-[16px] leading-[1.7] text-muted-foreground">
                  {L({
                    fr: `Sous ce montant, l'application suffit : achats et ventes jusqu'à ${TRADE_DAILY_MAX_CAD.toLocaleString("fr-CA")} $ sur 24 heures. Au-delà, c'est le desk.`,
                    en: `Below that, the app is enough: purchases and sales up to $${TRADE_DAILY_MAX_CAD.toLocaleString("en-CA")} over 24 hours. Above that, it's the desk.`,
                  })}
                </p>
                <p className="mt-8 text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{L({ fr: "Sur les mêmes réseaux que l'app", en: "On the same networks as the app" })}</p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
                  {ORDER_NETWORKS.map((n) => (
                    <span key={n.id} className="flex items-center gap-2 text-[14px]">
                      <img src={`/coins/${n.id}.svg`} alt="" className="h-6 w-6 rounded-full" />
                      {n.name}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>
          </Wrap>
        </section>

        {/* ===================== ÉTAPES (bande grise pleine largeur) ===================== */}
        <section id="etapes" className="mt-28 scroll-mt-24 bg-secondary lg:mt-36">
          <Wrap className="py-20 lg:py-24">
            <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <Kicker>{L({ fr: "Les étapes", en: "The steps" })}</Kicker>
                <H2 className="mt-4">
                  {L({ fr: "De la demande", en: "From request" })} <span className="text-foreground/35">{L({ fr: "au reçu.", en: "to receipt." })}</span>
                </H2>
              </div>
              <p className="max-w-[300px] text-[15px] leading-[1.6] text-muted-foreground">
                {L({ fr: "Vous voyez le prix avant de vous engager. Rien ne bouge sans votre accord.", en: "You see the price before you commit. Nothing moves without your approval." })}
              </p>
            </Reveal>

            <ol className="mt-14 grid sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s, i) => (
                <Reveal
                  key={s.t.fr}
                  delay={i * 90}
                  className="border-t border-foreground/10 py-7 sm:pr-8 lg:border-l lg:border-t-0 lg:px-6 lg:py-2 lg:first:border-l-0 lg:first:pl-0"
                >
                  <p className="font-display text-[3.4rem] leading-none tracking-[-0.06em] text-foreground/15">{i + 1}</p>
                  <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.015em]">{L(s.t)}</h3>
                  <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground">{L(s.d)}</p>
                </Reveal>
              ))}
            </ol>
          </Wrap>
        </section>

        {/* ===================== À PRÉPARER ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-28">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <Reveal>
                <Kicker>{L({ fr: "Avant de commencer", en: "Before you start" })}</Kicker>
                <H2 className="mt-4">{L({ fr: "Ce qu'il faut préparer.", en: "What to prepare." })}</H2>
                <p className="mt-6 max-w-[360px] text-[13.5px] leading-[1.7] text-muted-foreground">
                  {L({
                    fr: `Entreprise de services monétaires inscrite auprès de CANAFE (n° ${FINTRAC_MSB_NUMBER}), nous vérifions l'identité et l'origine des fonds, et déclarons à CANAFE les opérations prévues par la loi.`,
                    en: `As a money services business registered with FINTRAC (no. ${FINTRAC_MSB_NUMBER}), we verify identity and the source of funds, and report to FINTRAC the transactions required by law.`,
                  })}
                </p>
              </Reveal>
              <ul>
                {NEEDS.map(({ icon: Icon, t, d }, i) => (
                  <Reveal key={t.fr} delay={i * 70} className="flex items-center gap-5 border-b py-5 first:border-t">
                    <Icon className="h-6 w-6 shrink-0 text-foreground/70" strokeWidth={1.5} />
                    <p className="min-w-0 text-[15px] leading-[1.5]">
                      <span className="font-medium">{L(t)}</span>
                      <span className="text-muted-foreground"> · {L(d)}</span>
                    </p>
                  </Reveal>
                ))}
              </ul>
            </div>
          </Wrap>
        </section>

        {/* ===================== QUESTIONS ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-28">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <Reveal>
                <Kicker>{L({ fr: "Questions", en: "Questions" })}</Kicker>
                <H2 className="mt-4">{L({ fr: "Ce qu'on nous demande.", en: "What people ask us." })}</H2>
              </Reveal>
              <div>
                {FAQ.map((item, i) => {
                  const open = faqOpen === i;
                  return (
                    <Reveal key={item.q.fr} delay={i * 60} className="border-b first:border-t">
                      <button
                        onClick={() => setFaqOpen(open ? null : i)}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-6 py-6 text-left"
                      >
                        <span className="font-display text-[17px] tracking-[-0.02em] sm:text-[19px]">{L(item.q)}</span>
                        <span className={cn("shrink-0 text-[22px] leading-none text-foreground/35 transition-transform", open && "rotate-45")} aria-hidden>
                          +
                        </span>
                      </button>
                      {open && <p className="mb-7 max-w-[600px] text-[15px] leading-[1.7] text-muted-foreground">{L(item.a)}</p>}
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
              <p className="text-[12px] uppercase tracking-[0.16em] text-background/55">{L({ fr: "Joindre le desk", en: "Contact the desk" })}</p>
              <h2 className="mx-auto mt-6 max-w-[820px] font-display text-[2.6rem] leading-[0.98] tracking-[-0.05em] sm:text-[3.8rem] lg:text-[4.8rem]">
                {L({ fr: "Parlons de", en: "Let's talk about" })}
                <br />
                <span className="text-background/45">{L({ fr: "votre opération.", en: "your trade." })}</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <a href={mailto} className="mt-10 inline-flex items-center gap-2 font-display text-[1.4rem] tracking-[-0.03em] underline-offset-[6px] hover:underline sm:text-[1.8rem]">
                {OOBLE_OTC_EMAIL} <ArrowRight className="h-5 w-5" strokeWidth={1.8} />
              </a>
            </Reveal>
            {canRequest && (
              <Reveal delay={200} className="mt-8 flex justify-center">
                <Primary />
              </Reveal>
            )}
          </Wrap>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default OTC;
