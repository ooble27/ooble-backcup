import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import OtcVideo from "@/components/OtcVideo";
import { LEGAL_DAILY_MAX_CAD as TRADE_DAILY_MAX_CAD } from "@/lib/settings";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* Ooble pour les entreprises — page publique à part entière. Le fond et les
   textes suivent le design system (encre neutre, comme l'accueil) ; les
   touches de couleur reprennent celles de la vidéo (menthe, corail,
   tournesol). En-tête avec la vidéo, sélecteur d'usages, étapes racontées au
   défilement, ce qu'il faut préparer, simulateur de montant (app ou desk OTC),
   bandeau des métiers et appel final. Les appels sont de simples liens, pas
   des boutons. Les durées reprennent celles affichées dans l'app
   (vérification en environ 5 minutes, examen généralement sous 1 jour
   ouvrable). */

type Bi = { fr: string; en: string };

const FOREST = "#0f5c45", MINT = "#bfe8d6", CORAL = "#ff7a59", SUN = "#ffc94d", CREAM = "#f6f1e7";

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-[1200px] px-6 sm:px-10 ${className}`}>{children}</div>
);

/* ───────── Illustrations des usages (formes pleines) ───────── */
const ArtPay = () => (
  <svg viewBox="0 0 400 300" className="h-full w-full" aria-hidden>
    <rect x="0" y="230" width="400" height="70" fill={FOREST} opacity=".25" />
    {[0, 1, 2].map((r) => [0, 1, 2, 3].slice(0, 4 - r).map((k) => (
      <rect key={`${r}${k}`} x={95 + k * 52 + r * 26} y={150 - r * 34} width="46" height="30" rx="5" fill={[CORAL, SUN, CREAM, FOREST][(k + r) % 4]} />
    )))}
    <path d="M70 186 H330 L300 236 H100 Z" fill={CREAM} />
    <rect x="270" y="110" width="30" height="76" rx="6" fill={CREAM} />
    <circle cx="340" cy="60" r="26" fill={SUN} />
  </svg>
);
const ArtGetPaid = () => (
  <svg viewBox="0 0 400 300" className="h-full w-full" aria-hidden>
    <rect x="150" y="140" width="190" height="120" rx="22" fill={FOREST} />
    <rect x="290" y="180" width="62" height="44" rx="12" fill={CORAL} />
    <circle cx="315" cy="202" r="8" fill={CREAM} />
    {[[90, 70], [130, 40], [175, 82], [225, 55]].map(([x, y], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <circle r="26" fill="#26a17b" />
        <text y="10" textAnchor="middle" fontSize="28" fontWeight="700" fill="#fff">₮</text>
      </g>
    ))}
  </svg>
);
const ArtManage = () => (
  <svg viewBox="0 0 400 300" className="h-full w-full" aria-hidden>
    <rect x="120" y="60" width="160" height="200" rx="14" fill={CREAM} transform="rotate(-8 200 160)" />
    <rect x="120" y="60" width="160" height="200" rx="14" fill={CREAM} transform="rotate(5 200 160)" />
    <rect x="120" y="60" width="160" height="200" rx="14" fill="#fffaf0" />
    <rect x="120" y="60" width="160" height="40" rx="14" fill={CORAL} />
    {[0, 1, 2, 3].map((k) => <rect key={k} x="145" y={122 + k * 30} width={[110, 80, 96, 60][k]} height="12" rx="6" fill="#e9dfcb" />)}
    <circle cx="282" cy="236" r="34" fill={FOREST} />
    <path d="M265 236 l12 12 l22 -24" fill="none" stroke={CREAM} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const USES: { w: Bi; t: Bi; d: Bi; art: () => JSX.Element; bg: string }[] = [
  {
    w: { fr: "Payer", en: "Pay" }, art: ArtPay, bg: MINT,
    t: { fr: "Réglez vos fournisseurs à l'étranger.", en: "Pay suppliers abroad." },
    d: { fr: "Achetez des USDC en dollars canadiens et envoyez-les sur le réseau de votre fournisseur.", en: "Buy USDC with Canadian dollars and send it on your supplier's network." },
  },
  {
    w: { fr: "Encaisser", en: "Get paid" }, art: ArtGetPaid, bg: SUN,
    t: { fr: "Vos clients vous paient en USDC ?", en: "Clients pay you in USDC?" },
    d: { fr: "Vendez-les et recevez des dollars canadiens par Interac, au nom de la société.", en: "Sell it and receive Canadian dollars by Interac, in the company's name." },
  },
  {
    w: { fr: "Gérer", en: "Manage" }, art: ArtManage, bg: "#ffd2c4",
    t: { fr: "Une trace claire de chaque opération.", en: "A clear record of every trade." },
    d: { fr: "Tout est au nom de l'entreprise, avec l'historique de vos achats et de vos ventes.", en: "Everything is in the company's name, with the history of your purchases and sales." },
  },
];

const STEPS: { t: Bi; d: Bi; c: string }[] = [
  { t: { fr: "Ouvrez le compte", en: "Open the account" }, d: { fr: "Raison sociale, numéro d'entreprise (NEQ ou BN) et personne responsable. Quelques minutes.", en: "Business name, business number (NEQ or BN) and contact person. A few minutes." }, c: CORAL },
  { t: { fr: "Vérifiez l'entreprise", en: "Verify the business" }, d: { fr: "Depuis votre espace, en environ 5 minutes : informations, administrateurs et propriétaires, documents.", en: "From your dashboard, in about 5 minutes: details, directors and owners, documents." }, c: SUN },
  { t: { fr: "On examine le dossier", en: "We review the file" }, d: { fr: "Notre équipe conformité vous répond par courriel, généralement sous 1 jour ouvrable.", en: "Our compliance team replies by email, usually within 1 business day." }, c: MINT },
  { t: { fr: "Achetez et vendez", en: "Buy and sell" }, d: { fr: "Payez par Interac, recevez vos USDC sur l'une des 4 blockchains. Ou l'inverse.", en: "Pay by Interac, receive your USDC on one of 4 blockchains. Or the other way round." }, c: FOREST },
];

const READY: { g: Bi; items: Bi[] }[] = [
  { g: { fr: "L'entreprise", en: "The business" }, items: [
    { fr: "Raison sociale", en: "Legal name" }, { fr: "NEQ ou BN", en: "NEQ or BN" }, { fr: "Adresse du siège", en: "Head office address" }, { fr: "Activité principale", en: "Main activity" },
  ] },
  { g: { fr: "Les personnes", en: "The people" }, items: [
    { fr: "Administrateurs", en: "Directors" }, { fr: "Propriétaires de 25 % ou plus", en: "Owners of 25% or more" },
  ] },
  { g: { fr: "Les documents", en: "The documents" }, items: [
    { fr: "Statuts de constitution", en: "Articles of incorporation" }, { fr: "Registre des administrateurs", en: "Register of directors" }, { fr: "Preuve d'adresse (< 3 mois)", en: "Proof of address (< 3 months)" },
  ] },
];

const TRADES: Bi[] = [
  { fr: "Import-export", en: "Import-export" }, { fr: "Commerce en ligne", en: "E-commerce" }, { fr: "Agences", en: "Agencies" },
  { fr: "Logistique", en: "Logistics" }, { fr: "Studios", en: "Studios" }, { fr: "Grossistes", en: "Wholesalers" },
  { fr: "Consultants", en: "Consultants" }, { fr: "Développeurs", en: "Developers" }, { fr: "Événementiel", en: "Events" },
];

const nf = (n: number, lang: string) => (lang === "en" ? n.toLocaleString("en-CA") : n.toLocaleString("fr-CA").replace(/[\u202f\u00a0]/g, " "));

const Entreprises = () => {
  const [lang] = useLang();
  const L = (b: Bi) => b[lang];

  /* Sélecteur d'usages : tourne seul jusqu'au premier clic. */
  const [use, setUse] = useState(0);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (pinned) return;
    const id = window.setInterval(() => setUse((u) => (u + 1) % USES.length), 5000);
    return () => window.clearInterval(id);
  }, [pinned]);

  /* Étapes : le numéro suit l'étape visible. */
  const [step, setStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.i)); }),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  /* Simulateur : app jusqu'à 9 999 $, desk OTC au-delà. */
  const STOPS = [1000, 2500, 5000, 9999, 15000, 25000, 50000, 100000, 250000, 500000];
  const [stop, setStop] = useState(3);
  const amount = STOPS[stop];
  const inApp = amount <= TRADE_DAILY_MAX_CAD;

  /* Appels : de simples liens texte avec une flèche. */
  const linkCls = "inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-[6px] transition-colors hover:underline";
  const Open = ({ className }: { className?: string }) => (
    <Link to="/inscription/entreprise" className={cn(linkCls, className)}>
      {L({ fr: "Ouvrir un compte entreprise", en: "Open a business account" })} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
    </Link>
  );

  const U = USES[use];

  return (
    <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
      <Header />

      <main>
        {/* ===================== EN-TÊTE ===================== */}
        <section className="relative overflow-hidden">
          {/* formes qui flottent, comme dans la vidéo — ordinateur seulement */}
          <span aria-hidden className="ooble-float absolute hidden sm:block left-[6%] top-[16%] h-10 w-10 rounded-full" style={{ background: CORAL }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block right-[9%] top-[12%] h-0 w-0 border-x-[22px] border-b-[38px] border-x-transparent [animation-delay:-2s]" style={{ borderBottomColor: SUN }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block right-[14%] top-[44%] h-9 w-9 rotate-12 rounded-lg [animation-delay:-4s]" style={{ background: MINT }} />
          <span aria-hidden className="ooble-float absolute hidden sm:block left-[11%] top-[50%] h-6 w-6 rounded-full [animation-delay:-1s]" style={{ background: SUN }} />

          <Wrap className="relative pb-14 pt-20 text-center lg:pb-16 lg:pt-24">
            <p className="animate-up text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
              {L({ fr: "Ooble pour les entreprises", en: "Ooble for business" })}
            </p>
            <h1 className="animate-up mx-auto mt-6 max-w-[1120px] font-display text-[2.6rem] leading-[0.98] tracking-[-0.05em] [animation-delay:80ms] sm:text-[4rem] lg:text-[5.75rem]">
              {L({ fr: "Vos USDC, au nom de votre ", en: "Your USDC, in your " })}
              <span style={{ color: CORAL }}>{L({ fr: "entreprise.", en: "company's name." })}</span>
            </h1>
            <p className="animate-up mx-auto mt-8 max-w-[480px] text-[14px] leading-[1.65] text-muted-foreground [animation-delay:160ms] sm:text-[15px]">
              {L({
                fr: "Achetez et vendez des USDC en dollars canadiens, payez vos fournisseurs et encaissez vos clients. La vérification se fait une seule fois.",
                en: "Buy and sell USDC with Canadian dollars, pay suppliers and get paid by clients. Verification is done once.",
              })}
            </p>
            <div className="animate-up mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 [animation-delay:240ms]">
              <Open />
              <a href="#simulateur" className={cn(linkCls, "text-muted-foreground hover:text-foreground")}>
                {L({ fr: "Quel montant ?", en: "How much?" })}
              </a>
            </div>
          </Wrap>
        </section>

        <Wrap>
          <OtcVideo
            name="biz"
            label={{ fr: "Ooble pour les entreprises en vidéo", en: "Ooble for business, the video" }}
            className="animate-up mx-auto max-w-[980px] [animation-delay:300ms]"
          />
        </Wrap>

        {/* ===================== SÉLECTEUR D'USAGES ===================== */}
        <section>
          <Wrap className="pt-28 lg:pt-36">
            <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: CORAL }}>
                  {L({ fr: "Votre entreprise veut…", en: "Your business wants to…" })}
                </p>
                <div className="mt-6 flex flex-col items-start" role="tablist">
                  {USES.map((u, i) => (
                    <button
                      key={u.w.fr}
                      role="tab"
                      aria-selected={use === i}
                      onClick={() => { setUse(i); setPinned(true); }}
                      className={cn(
                        "font-display text-[3.4rem] font-semibold leading-[1.02] tracking-[-0.055em] transition-colors sm:text-[4.6rem]",
                        use === i ? "text-foreground" : "text-foreground/15 hover:text-foreground/40",
                      )}
                    >
                      {L(u.w)}
                      <span style={{ color: use === i ? CORAL : "transparent" }}>.</span>
                    </button>
                  ))}
                </div>
                <div key={use} className="animate-up mt-8 max-w-[440px]">
                  <p className="font-display text-[1.4rem] tracking-[-0.03em]">{L(U.t)}</p>
                  <p className="mt-2 text-[15px] leading-[1.7] text-muted-foreground">{L(U.d)}</p>
                </div>
              </div>
              <div
                className="relative mx-auto aspect-[4/3] w-full max-w-[560px] transition-colors duration-500"
                style={{ background: U.bg, borderRadius: "46% 54% 42% 58% / 55% 44% 56% 45%" }}
              >
                <div key={use} className="animate-up absolute inset-[12%]">{U.art()}</div>
              </div>
            </div>
          </Wrap>
        </section>

        {/* ===================== ÉTAPES AU DÉFILEMENT ===================== */}
        <section>
          <Wrap className="pt-28 lg:pt-36">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="lg:sticky lg:top-24 lg:h-[70vh] lg:self-start">
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: CORAL }}>
                  {L({ fr: "Ouvrir un compte entreprise", en: "Open a business account" })}
                </p>
                <div className="relative mt-4 hidden h-[320px] lg:block">
                  {STEPS.map((s, i) => (
                    <p
                      key={i}
                      aria-hidden
                      className="absolute left-0 top-0 font-display text-[19rem] font-semibold leading-[0.85] tracking-[-0.08em] transition-all duration-500"
                      style={{ color: s.c, opacity: step === i ? 1 : 0, transform: `translateY(${step === i ? 0 : step > i ? -40 : 40}px)` }}
                    >
                      {i + 1}
                    </p>
                  ))}
                </div>
                <p className="mt-4 font-display text-[2.2rem] leading-[1.05] tracking-[-0.045em] lg:hidden">
                  {L({ fr: "Quatre étapes, une seule fois.", en: "Four steps, done once." })}
                </p>
              </div>
              <div>
                {STEPS.map((s, i) => (
                  <div
                    key={s.t.fr}
                    ref={(el) => (stepRefs.current[i] = el)}
                    data-i={i}
                    className="flex min-h-0 flex-col justify-center py-8 lg:min-h-[44vh] lg:py-0"
                  >
                    <span className="font-display text-[3rem] font-semibold leading-none tracking-[-0.06em] lg:hidden" style={{ color: s.c }}>{i + 1}</span>
                    <h3 className={cn("mt-3 font-display text-[2rem] leading-[1.05] tracking-[-0.045em] transition-opacity duration-500 sm:text-[2.6rem]", step === i ? "lg:opacity-100" : "lg:opacity-25")}>
                      {L(s.t)}
                    </h3>
                    <p className={cn("mt-4 max-w-[440px] text-[16px] leading-[1.7] text-muted-foreground transition-opacity duration-500", step === i ? "lg:opacity-100" : "lg:opacity-25")}>
                      {L(s.d)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Wrap>
        </section>

        {/* ===================== À PRÉPARER ===================== */}
        <section>
          <Wrap className="pt-24 lg:pt-32">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: CORAL }}>
                  {L({ fr: "Avant de commencer", en: "Before you start" })}
                </p>
                <h2 className="mt-4 font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[3.2rem]">
                  {L({ fr: "Ce qu'il vous faut.", en: "What you'll need." })}
                </h2>
                <p className="mt-5 max-w-[380px] text-[15px] leading-[1.7] text-muted-foreground">
                  {L({ fr: "Avec ces éléments sous la main, la vérification prend environ 5 minutes. Vos documents sont chiffrés et seule notre équipe conformité y a accès.", en: "With these at hand, verification takes about 5 minutes. Your documents are encrypted and only our compliance team can access them." })}
                </p>
              </div>
              <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
                {READY.map((g) => (
                  <div key={g.g.fr}>
                    <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{L(g.g)}</p>
                    <ul className="mt-4">
                      {g.items.map((it) => (
                        <li key={it.fr} className="border-t py-3 text-[15px]">{L(it)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Wrap>
        </section>

        {/* ===================== SIMULATEUR DE MONTANT ===================== */}
        <section id="simulateur" className="scroll-mt-20">
          <Wrap className="pt-24 lg:pt-32">
            <div className="text-center">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: CORAL }}>
                {L({ fr: "Quel montant ?", en: "How much?" })}
              </p>
              <h2 className="mx-auto mt-4 max-w-[760px] font-display text-[2.2rem] leading-[1.05] tracking-[-0.045em] sm:text-[3rem]">
                {L({ fr: "Combien votre entreprise veut-elle échanger ?", en: "How much does your business want to trade?" })}
              </h2>
              <p className="mt-10 font-display text-[4rem] font-semibold leading-none tracking-[-0.065em] tabular-nums sm:text-[6.5rem]">
                {lang === "en" ? `$${nf(amount, lang)}` : `${nf(amount, lang)} $`}
              </p>
              <input
                type="range"
                min={0}
                max={STOPS.length - 1}
                step={1}
                value={stop}
                onChange={(e) => setStop(Number(e.target.value))}
                aria-label={L({ fr: "Montant à échanger", en: "Amount to trade" })}
                className="mx-auto mt-8 block w-full max-w-[640px] cursor-pointer accent-[hsl(var(--foreground))]"
              />
              <div key={inApp ? "app" : "otc"} className="animate-up mx-auto mt-10 max-w-[620px]">
                <p className="font-display text-[1.8rem] leading-[1.15] tracking-[-0.035em]">
                  {inApp
                    ? L({ fr: "Directement dans l'app.", en: "Right in the app." })
                    : L({ fr: "Passez par le desk OTC.", en: "Go through the OTC desk." })}
                </p>
                <p className="mt-3 text-[15px] leading-[1.7] text-muted-foreground">
                  {inApp
                    ? L({ fr: `Achats et ventes jusqu'à ${nf(TRADE_DAILY_MAX_CAD, "fr")} $ chacun sur 24 heures, par Interac.`, en: `Purchases and sales up to $${nf(TRADE_DAILY_MAX_CAD, "en")} each over 24 hours, by Interac.` })
                    : L({ fr: "Un prix ferme pour le montant entier, avec un seul interlocuteur.", en: "A firm price for the full amount, with one contact." })}
                </p>
                {inApp ? (
                  <Open className="mt-6" />
                ) : (
                  <Link to="/otc" className={cn(linkCls, "mt-6")}>
                    {L({ fr: "Découvrir le desk OTC", en: "Discover the OTC desk" })} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                  </Link>
                )}
              </div>
            </div>
          </Wrap>
        </section>

        {/* ===================== BANDEAU DES MÉTIERS ===================== */}
        <section className="mt-28 overflow-hidden py-6 lg:mt-36" style={{ background: SUN }}>
          <div className="animate-marquee flex w-max gap-10 whitespace-nowrap">
            {[...TRADES, ...TRADES].map((x, i) => (
              <span key={i} className="flex items-center gap-10 font-display text-[2rem] font-semibold tracking-[-0.04em] text-[#14110f] sm:text-[2.6rem]">
                {L(x)}
                <span className="h-3 w-3 rounded-full" style={{ background: i % 2 ? "#14110f" : CORAL }} />
              </span>
            ))}
          </div>
        </section>

        {/* ===================== APPEL FINAL ===================== */}
        <section>
          <Wrap className="pb-10 pt-24 text-center lg:pt-32">
            <Reveal>
              <h2 className="mx-auto max-w-[900px] font-display text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-[4.2rem] lg:text-[5.2rem]">
                {L({ fr: "Faites entrer votre entreprise ", en: "Bring your business " })}
                <span className="text-foreground/35">{L({ fr: "dans l'USDC.", en: "into USDC." })}</span>
              </h2>
            </Reveal>
            <Reveal delay={140} className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              <Open />
              <Link to="/contact" className={cn(linkCls, "text-muted-foreground hover:text-foreground")}>
                {L({ fr: "Nous écrire", en: "Contact us" })}
              </Link>
            </Reveal>
          </Wrap>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Entreprises;
