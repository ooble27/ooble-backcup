import { useEffect, useState } from "react";
import { isInstalledApp } from "@/lib/installed";

/*
 * Lancement de l'app installée : à chaque ouverture, la mascotte 2D (la même que sur l'accueil et la
 * connexion) tombe, s'écrase un peu en touchant le sol, rebondit, sourit et fait un clin d'œil, puis
 * « Ooble » apparaît (environ 2,7 s). Un toucher passe l'animation. Dessin et animation en code : rien à télécharger.
 * Une fois par ouverture : un rechargement dans la même session (mise à jour, changement de page) ne la rejoue pas.
 * Pas dans un onglet du navigateur : le site public reste instantané.
 */

const SEEN = "ooble.launch.seen";
const LENGTH = 2700;

/*
 * Sur iPhone, la barre d'état garde la couleur du tout premier affichage. Le lancement prend donc la couleur
 * de l'écran qui suit (voir le script de index.html) : jaune pour l'accueil et la connexion, la couleur de l'app sinon.
 */
type Look = { bg: string; ink: string; soft: string };
function look(): Look {
  let authed = true;
  try { authed = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)); } catch { /* stockage indisponible */ }
  if (!authed) return { bg: "#fdd94e", ink: "#111", soft: "rgba(17,17,17,.65)" };
  return document.documentElement.classList.contains("dark")
    ? { bg: "#171717", ink: "#fff", soft: "rgba(255,255,255,.6)" }
    : { bg: "#f5f5f3", ink: "#111", soft: "rgba(17,17,17,.6)" };
}

function shouldShow() {
  if (!isInstalledApp()) return false;
  try {
    if (sessionStorage.getItem(SEEN)) return false;
    sessionStorage.setItem(SEEN, "1");
  } catch { /* stockage indisponible : on l'affiche quand même */ }
  return true;
}

const EASE = "cubic-bezier(.16,1,.3,1)";
const CSS = `
.ls{position:fixed;inset:0;z-index:2147483000;background:var(--ls-bg);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .35s ease,transform .35s ease;-webkit-user-select:none;user-select:none}
.ls.out{opacity:0;transform:scale(1.04);pointer-events:none}
.ls-stage{position:relative;width:200px;height:210px}
.ls-body{position:absolute;left:0;top:0;width:200px;height:200px;transform-origin:50% 88%;animation:ls-drop 1.15s linear both}
.ls-shadow{position:absolute;left:50%;bottom:0;width:120px;height:14px;margin-left:-60px;border-radius:50%;background:var(--ls-ink);opacity:.14;transform-origin:50% 50%;animation:ls-shadow 1.15s linear both}
.ls-wink{transform-box:fill-box;transform-origin:50% 50%;animation:ls-wink .32s ease-in-out 1.55s both}
.ls-smile{opacity:0;animation:ls-in .2s ease 1.1s forwards}
.ls-o{opacity:1;animation:ls-out .2s ease 1.1s forwards}
.ls-spark{position:absolute;opacity:0;animation:ls-spark .7s ${EASE} forwards}
.ls h1{margin:14px 0 0;color:var(--ls-ink);font-family:Poppins,system-ui,sans-serif;font-size:46px;font-weight:600;letter-spacing:-0.04em;opacity:0;animation:ls-up .6s ${EASE} 1.25s forwards}
.ls p{margin:4px 0 0;color:var(--ls-soft);font-family:Poppins,system-ui,sans-serif;font-size:15px;opacity:0;animation:ls-up .6s ${EASE} 1.45s forwards}
@keyframes ls-drop{
  0%{transform:translateY(-70vh) scale(.94,1.08);animation-timing-function:cubic-bezier(.55,0,1,.45)}
  40%{transform:translateY(0) scale(1.18,.8);animation-timing-function:cubic-bezier(.2,.7,.3,1)}
  58%{transform:translateY(-34px) scale(.94,1.08);animation-timing-function:cubic-bezier(.6,0,.9,.5)}
  74%{transform:translateY(0) scale(1.07,.93);animation-timing-function:ease-out}
  86%{transform:translateY(-6px) scale(.99,1.01)}
  100%{transform:none}}
@keyframes ls-shadow{0%{transform:scale(.2);opacity:0}40%{transform:scale(1.15);opacity:.18}58%{transform:scale(.8);opacity:.1}74%{transform:scale(1.05);opacity:.16}100%{transform:scale(1);opacity:.14}}
@keyframes ls-wink{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.08)}}
@keyframes ls-in{to{opacity:1}}
@keyframes ls-out{to{opacity:0}}
@keyframes ls-spark{0%{opacity:0;transform:scale(.2) rotate(-40deg)}60%{opacity:1;transform:scale(1.15) rotate(10deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
@keyframes ls-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ls *{animation:none!important}.ls h1,.ls p,.ls-spark,.ls-smile{opacity:1}.ls-o{opacity:0}}
`;

const BODY = "M64 26C104 4 160 22 172 74C184 126 152 176 98 176C44 176 14 142 20 94C24 60 38 40 64 26Z";
const SPARK = "M20 3C21.5 14 26 18.5 37 20C26 21.5 21.5 26 20 37C18.5 26 14 21.5 3 20C14 18.5 18.5 14 20 3Z";

function Mascot() {
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden>
      <defs>
        <pattern id="ls-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.15" fill="#111" /></pattern>
        <clipPath id="ls-clip"><path d={BODY} /></clipPath>
      </defs>
      <path d={BODY} fill="#fff" />
      <g clipPath="url(#ls-clip)"><path d="M150 40C190 90 170 170 90 185L190 200 200 40Z" fill="url(#ls-dots)" /></g>
      <path d={BODY} fill="none" stroke="#111" strokeWidth="4" strokeLinejoin="round" />
      <path d="M44 52c4-8 10-14 18-18" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      {/* Yeux : le droit fait un clin d'œil */}
      <g>
        <ellipse cx="76" cy="92" rx="10" ry="12" fill="#fff" stroke="#111" strokeWidth="3" />
        <circle cx="77" cy="94" r="5.5" fill="#111" /><circle cx="79" cy="91.5" r="1.7" fill="#fff" />
      </g>
      <g className="ls-wink">
        <ellipse cx="120" cy="92" rx="10" ry="12" fill="#fff" stroke="#111" strokeWidth="3" />
        <circle cx="121" cy="94" r="5.5" fill="#111" /><circle cx="123" cy="91.5" r="1.7" fill="#fff" />
      </g>
      <circle cx="60" cy="116" r="5" fill="#ff6a3d" opacity=".55" /><circle cx="138" cy="116" r="5" fill="#ff6a3d" opacity=".55" />
      {/* Bouche : un petit « o » pendant la chute, un sourire à l'arrivée */}
      <ellipse className="ls-o" cx="98" cy="122" rx="5" ry="6" fill="none" stroke="#111" strokeWidth="3" />
      <path className="ls-smile" d="M84 118q14 13 28 0" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export default function LaunchSplash() {
  const [show] = useState(shouldShow);
  const [lk] = useState(look);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setLeaving(true), reduced ? 1200 : LENGTH);
    return () => { window.clearTimeout(t); document.body.style.overflow = prev; };
  }, [show]);

  useEffect(() => {
    if (!leaving) return;
    document.body.style.overflow = "";
    const t = window.setTimeout(() => setGone(true), 380);
    return () => window.clearTimeout(t);
  }, [leaving]);

  if (!show || gone) return null;
  const spark = (x: number, y: number, s: number, delay: number) => (
    <svg className="ls-spark" width={s} height={s} viewBox="0 0 40 40" style={{ left: x, top: y, animationDelay: `${delay}s` }} aria-hidden>
      <path d={SPARK} fill="none" stroke={lk.ink} strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
  return (
    <div className={`ls${leaving ? " out" : ""}`} onClick={() => setLeaving(true)} role="presentation" aria-hidden
      style={{ ["--ls-bg" as string]: lk.bg, ["--ls-ink" as string]: lk.ink, ["--ls-soft" as string]: lk.soft }}>
      <style>{CSS}</style>
      <div className="ls-stage">
        <div className="ls-shadow" />
        <div className="ls-body"><Mascot /></div>
        {spark(-30, 30, 30, 1.2)}
        {spark(196, 8, 24, 1.32)}
        {spark(204, 120, 20, 1.44)}
      </div>
      <h1>Ooble</h1>
      <p>L’USDC en dollars canadiens</p>
    </div>
  );
}
