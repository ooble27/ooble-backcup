import Logo from "@/components/Logo";
import ThemeToggle from "@/components/app/ThemeToggle";
import { LangPill } from "@/components/app/LangToggle";
import { HELP_COLORS } from "@/lib/faq";
import { useLang } from "@/lib/i18n";
import AuthArt from "./AuthArt";

/* Cadre des pages de connexion et d'inscription : le formulaire à gauche, un
   panneau de couleur à droite (ordinateur seulement). Le panneau est fixe et
   tient toujours dans la hauteur de l'écran : une illustration propre à la
   page (personnages Humaaans de Pablo Stanley, aux couleurs de la marque), une grande phrase, puis les
   trois étapes qui comptent pour la page, sans animation. */

type Variant = "login" | "signup" | "individual" | "business" | "reset";
type Bi = { fr: string; en: string };

const C = HELP_COLORS;
const INK = "#14110f";

const PANELS: Record<Exclude<Variant, "individual">, { bg: string; ink: string; accent: string; a: Bi; b: Bi; steps: [Bi, Bi][] }> = {
  login: {
    bg: C.forest, ink: C.cream, accent: C.sun,
    a: { fr: "Bon retour.", en: "Welcome back." },
    b: { fr: "Vos USDC vous attendent.", en: "Your USDC are waiting." },
    steps: [
      [{ fr: "Payez par Interac", en: "Pay by Interac" }, { fr: "Montant exact, référence en message", en: "Exact amount, reference in the message" }],
      [{ fr: "Vérification automatique", en: "Automatic check" }, { fr: "Dès que le virement arrive", en: "As soon as the transfer lands" }],
      [{ fr: "USDC dans votre wallet", en: "USDC in your wallet" }, { fr: "En quelques minutes", en: "Within minutes" }],
    ],
  },
  signup: {
    bg: C.sun, ink: INK, accent: C.coral,
    a: { fr: "Vos USDC,", en: "Your USDC," },
    b: { fr: "en dollars canadiens.", en: "in Canadian dollars." },
    steps: [
      [{ fr: "Créez votre compte", en: "Create your account" }, { fr: "Gratuit, en une minute", en: "Free, in a minute" }],
      [{ fr: "Vérifiez votre identité", en: "Verify your identity" }, { fr: "Une seule fois", en: "Just once" }],
      [{ fr: "Achetez ou vendez", en: "Buy or sell" }, { fr: "Réglé par Interac", en: "Settled by Interac" }],
    ],
  },
  business: {
    bg: C.peach, ink: INK, accent: C.coral,
    a: { fr: "Au nom de", en: "In your" },
    b: { fr: "votre entreprise.", en: "company's name." },
    steps: [
      [{ fr: "Compte de l'entreprise", en: "Company account" }, { fr: "Raison sociale et coordonnées", en: "Legal name and details" }],
      [{ fr: "Vérification", en: "Verification" }, { fr: "De la société et de son représentant", en: "Of the company and its representative" }],
      [{ fr: "Virements de l'entreprise", en: "Company transfers" }, { fr: "Depuis son propre compte bancaire", en: "From its own bank account" }],
    ],
  },
  reset: {
    bg: C.mint, ink: INK, accent: C.sage,
    a: { fr: "Un nouveau", en: "A fresh" },
    b: { fr: "mot de passe.", en: "password." },
    steps: [
      [{ fr: "Un lien par courriel", en: "A link by email" }, { fr: "Envoyé à votre adresse", en: "Sent to your address" }],
      [{ fr: "Au moins 8 caractères", en: "At least 8 characters" }, { fr: "Une phrase, c'est encore mieux", en: "A passphrase is even better" }],
      [{ fr: "Jamais partagé", en: "Never shared" }, { fr: "Ooble ne vous le demandera jamais", en: "Ooble will never ask for it" }],
    ],
  },
};

const AuthShell = ({ variant, children }: { variant: Variant; children: React.ReactNode }) => {
  const [lang] = useLang();
  const P = PANELS[variant === "individual" ? "signup" : variant];

  return (
    <div className="ink-neutral app-type grid min-h-screen bg-background tracking-[-0.015em] lg:grid-cols-[1fr_minmax(0,0.9fr)]">
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10">
          <Logo />
          <div className="flex items-center gap-2.5">
            <LangPill />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="animate-up w-full max-w-[440px]">{children}</div>
        </main>
      </div>

      {/* Panneau fixe : hauteur de l'écran, rien ne défile ni ne bouge. */}
      <aside
        className="relative hidden h-[100dvh] overflow-hidden lg:sticky lg:top-0 lg:block lg:self-start"
        style={{ background: P.bg, color: P.ink }}
        aria-hidden
      >
        <div className="relative flex h-full flex-col px-12 py-[5vh] xl:px-16">
          <p className="text-[12px] uppercase tracking-[0.18em] opacity-70">Ooble · USDC ⇄ CAD</p>

          {/* L'illustration prend la place libre entre le haut et le texte :
              elle rétrécit sur un petit écran et ne passe jamais dessus. */}
          <div className="flex min-h-0 flex-1 items-center justify-center py-[3vh]">
            <AuthArt kind={variant} className="h-full max-h-[420px] w-full max-w-[560px] object-contain" />
          </div>

          <div className="shrink-0">
            <h2 className="max-w-[560px] font-display text-[clamp(2.1rem,5.2vh,3.8rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
              {P.a[lang]}
              <br />
              <span style={{ opacity: 0.55 }}>{P.b[lang]}</span>
            </h2>

            <ol className="mt-[3.5vh] max-w-[520px]">
              {P.steps.map(([title, sub], i) => (
                <li
                  key={i}
                  className="grid grid-cols-[2.25rem_1fr] items-baseline gap-x-3 border-t py-[1.3vh] last:border-b"
                  style={{ borderColor: `${P.ink}2e` }}
                >
                  <span className="font-display text-[1.05rem] font-semibold tabular-nums opacity-50">{i + 1}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-display text-[1.15rem] font-semibold tracking-[-0.025em] xl:text-[1.25rem]">{title[lang]}</span>
                    <span className="text-[13.5px] opacity-65">{sub[lang]}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default AuthShell;
