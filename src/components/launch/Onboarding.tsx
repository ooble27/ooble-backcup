import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { ART, ART_DEFS, WAVE } from "./onboardingArt";

/*
 * Écrans d'accueil de l'app installée, une seule fois par appareil, pour un nouveau visiteur.
 * Trois écrans en couleurs franches, un gros titre avec une pastille noire, un dessin au trait,
 * des points de progression et un gros bouton noir. On glisse au doigt ou on touche le bouton.
 * « Se connecter » (en haut) mène tout de suite à la connexion ; le dernier bouton, à l'inscription.
 */

type Bi = { fr: string; en: string };
const INK = "#111";

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const CSS = `
.ob{position:fixed;inset:0;z-index:60;overflow:hidden;font-family:Poppins,system-ui,sans-serif;color:${INK};-webkit-font-smoothing:antialiased;touch-action:pan-y}
.ob-track{position:absolute;inset:0;display:flex;transition:transform .55s cubic-bezier(.65,0,.35,1)}
.ob-sc{position:relative;flex:0 0 100%;height:100%;padding:calc(env(safe-area-inset-top,0px) + 64px) 26px 0}
.ob-login{position:absolute;right:24px;top:calc(env(safe-area-inset-top,0px) + 18px);z-index:3;border:none;background:none;font:500 15px Poppins,system-ui,sans-serif;color:${INK};text-decoration:underline;text-underline-offset:4px;padding:8px 2px;cursor:pointer}
.ob h1{margin:0;font-weight:500;font-size:clamp(34px,10.6vw,44px);line-height:1.18;letter-spacing:-0.03em}
.ob-pill{display:inline-flex;align-items:center;gap:10px;vertical-align:middle;height:1.2em;padding:0 .14em 0 .38em;border-radius:999px;background:${INK};color:#fff;font-size:.4em;font-weight:500;letter-spacing:0;position:relative;top:-.12em}
.ob-pill .ob-dot{width:2.4em;height:2.4em;margin:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#ff6a3d;font-weight:600;animation:ob-pulse 1.6s ease-in-out infinite}
.ob-pill svg{display:block}
.ob p.ob-sub{margin:16px 0 0;font-size:16px;line-height:1.55;max-width:340px}
.ob-art{position:absolute;left:50%;width:390px;height:400px;margin-left:-195px;transform-origin:50% 0}
.ob-art>.ill{position:absolute;inset:0}
.ob-art svg:has(use[href="#sparkle"]){animation:ob-twinkle 2.6s ease-in-out infinite}
.ob-art svg:has(use[href="#heart"]){animation:ob-beat 1.4s ease-in-out infinite}
.ob-float{animation:ob-float 3.2s ease-in-out infinite}
.ob-foot{position:absolute;left:22px;right:22px;bottom:calc(env(safe-area-inset-bottom,0px) + 22px)}
.ob-dots{display:flex;justify-content:center;gap:5px;margin-bottom:22px}
.ob-dots span{width:6px;height:6px;border-radius:9px;background:${INK};opacity:.22;transition:all .3s}
.ob-dots span.on{width:18px;opacity:1}
.ob-cta{width:100%;height:60px;border:none;border-radius:999px;background:${INK};color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font:500 16px Poppins,system-ui,sans-serif;cursor:pointer;transition:transform .15s}
.ob-cta:active{transform:scale(.97)}
.ob-sc[data-on="1"] .ob-in{animation:ob-up .65s cubic-bezier(.16,1,.3,1) both}
.ob-sc[data-on="1"] .ob-pop{animation:ob-pop .7s cubic-bezier(.34,1.56,.64,1) .2s both}
@keyframes ob-up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes ob-pop{from{opacity:0;scale:.6}to{opacity:1;scale:1}}
@keyframes ob-float{0%,100%{translate:0 0}50%{translate:0 -7px}}
@keyframes ob-twinkle{0%,100%{transform:scale(.85) rotate(0)}50%{transform:scale(1.12) rotate(25deg)}}
@keyframes ob-beat{0%,60%,100%{transform:scale(1)}30%{transform:scale(1.14)}}
@keyframes ob-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@media (prefers-reduced-motion: reduce){.ob *{animation:none!important}.ob-track{transition:none}}
`;

const SCREENS: { bg: string; title: (wave: string) => React.ReactNode; sub: Bi; art: keyof typeof ART; cta: Bi; center?: boolean }[] = [
  {
    bg: "#fdd94e", art: "buy",
    title: (wave) => (<>{T({ fr: "Achetez", en: "Buy" })}<br />{T({ fr: "de l’USDC", en: "USDC" })} <span className="ob-pill"><span dangerouslySetInnerHTML={{ __html: wave }} /><b className="ob-dot">$</b></span><br />{T({ fr: "en confiance", en: "with confidence" })}</>),
    sub: { fr: "Payez par Interac, recevez vos USDC directement dans votre portefeuille.", en: "Pay with Interac, get your USDC straight in your wallet." },
    cta: { fr: "Commencer", en: "Get started" },
  },
  {
    bg: "#dccaff", art: "pay",
    title: () => (<>{T({ fr: "Payez", en: "Pay with" })} <span className="ob-pill">Interac <b className="ob-dot">{ARROW}</b></span><br />{T({ fr: "simplement,", en: "simply," })}<br />{T({ fr: "sans surprise", en: "no surprises" })}</>),
    sub: { fr: "Le prix s’affiche avant de payer. Le montant exact, la référence, c’est tout.", en: "The price shows before you pay. The exact amount, the reference, that’s it." },
    cta: { fr: "Continuer", en: "Continue" },
  },
  {
    bg: "#ff6a3d", art: "wallet", center: true,
    title: () => (<>{T({ fr: "Vos USDC, dans", en: "Your USDC, in" })}<br />{T({ fr: "votre portefeuille", en: "your wallet" })}</>),
    sub: { fr: "Sur BNB Chain, Polygon, Solana ou Avalanche. Ooble ne garde rien.", en: "On BNB Chain, Polygon, Solana or Avalanche. Ooble holds nothing." },
    cta: { fr: "Créer mon compte", en: "Create my account" },
  },
];

// Texte dans la langue courante (fixée au rendu par le composant).
let LANG: "fr" | "en" = "fr";
const T = (b: Bi) => b[LANG];

export default function Onboarding({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [lang] = useLang();
  LANG = lang;
  const [i, setI] = useState(0);
  const [size, setSize] = useState({ w: 390, h: 844 });
  const start = useRef<number | null>(null);

  // Le dessin garde ses proportions : on le réduit sur les petits écrans.
  useEffect(() => {
    const fit = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // Couleur de la barre d'état assortie à l'écran.
  useEffect(() => {
    const m = document.querySelector('meta[name="theme-color"]'); const prev = m?.getAttribute("content");
    m?.setAttribute("content", SCREENS[i].bg);
    return () => { if (m && prev) m.setAttribute("content", prev); };
  }, [i]);

  const next = () => (i < SCREENS.length - 1 ? setI(i + 1) : onSignup());
  return (
    <div className="ob" style={{ background: SCREENS[i].bg, transition: "background .55s" }}
      onPointerDown={(e) => { start.current = e.clientX; }}
      onPointerUp={(e) => {
        if (start.current === null) return; const dx = e.clientX - start.current; start.current = null;
        if (dx < -50 && i < SCREENS.length - 1) setI(i + 1); else if (dx > 50 && i > 0) setI(i - 1);
      }}>
      <style>{CSS}</style>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden><defs dangerouslySetInnerHTML={{ __html: ART_DEFS }} /></svg>
      <button type="button" className="ob-login" onClick={onLogin}>{T({ fr: "Se connecter", en: "Log in" })}</button>
      <div className="ob-track" style={{ transform: `translateX(${-i * 100}%)` }}>
        {SCREENS.map((s, n) => (
          <section key={n} className="ob-sc" data-on={n === i ? "1" : "0"} style={{ background: s.bg, textAlign: s.center ? "center" : "left" }} aria-hidden={n !== i}>
            <h1 className="ob-in">{s.title(WAVE)}</h1>
            <p className="ob-sub ob-in" style={{ animationDelay: ".12s", margin: s.center ? "16px auto 0" : undefined }}>{T(s.sub)}</p>
            {/* Le dessin occupe la place entre le texte et le bouton (environ 360 px de haut à taille réelle). */}
            <div className="ob-art" style={{ top: `calc(env(safe-area-inset-top,0px) + ${s.center ? 300 : 330}px)`, transform: `scale(${Math.max(0.5, Math.min(1, size.w / 400, (size.h - (s.center ? 300 : 330) - 140) / 360))})` }}>
              <div className="ob-pop" style={{ position: "absolute", inset: 0 }}>
                <div className="ob-float" style={{ position: "absolute", inset: 0 }}>
                  <div className="ill" style={{ position: "absolute", inset: 0, transform: ART[s.art].style.match(/scale\([^)]*\)/)?.[0], transformOrigin: "50% 0" }}
                    dangerouslySetInnerHTML={{ __html: ART[s.art].html }} />
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
      <div className="ob-foot">
        <div className="ob-dots" aria-hidden>{SCREENS.map((_, n) => <span key={n} className={n === i ? "on" : ""} />)}</div>
        <button type="button" className="ob-cta" onClick={next}>{T(SCREENS[i].cta)} <span style={{ fontSize: 22 }}>»</span></button>
      </div>
    </div>
  );
}
