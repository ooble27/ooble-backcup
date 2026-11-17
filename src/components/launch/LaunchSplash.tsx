import { useEffect, useRef, useState } from "react";
import { isInstalledApp } from "@/lib/installed";

/*
 * Lancement de l'app installée : à chaque ouverture, la peluche tombe sur fond noir, rebondit, sourit
 * et fait un clin d'œil, puis « Ooble » apparaît (environ 2,7 s). Un toucher passe l'animation.
 * Une fois par ouverture : un rechargement dans la même session (mise à jour, changement de page) ne la rejoue pas.
 * Pas dans un onglet du navigateur : le site public reste instantané.
 */

const SEEN = "ooble.launch.seen";
const LENGTH = 2700;

function shouldShow() {
  if (!isInstalledApp()) return false;
  try {
    if (sessionStorage.getItem(SEEN)) return false;
    sessionStorage.setItem(SEEN, "1");
  } catch { /* stockage indisponible : on l'affiche quand même */ }
  return true;
}

const CSS = `
.ls{position:fixed;inset:0;z-index:2147483000;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .35s ease,transform .35s ease;-webkit-user-select:none;user-select:none}
.ls.out{opacity:0;transform:scale(1.04);pointer-events:none}
.ls video,.ls img{width:min(64vw,280px);height:min(64vw,280px);object-fit:contain;background:#111}
.ls h1{margin:6px 0 0;color:#fff;font-family:Poppins,system-ui,sans-serif;font-size:46px;font-weight:600;letter-spacing:-0.04em;opacity:0;animation:ls-up .6s cubic-bezier(.16,1,.3,1) .9s forwards}
.ls p{margin:6px 0 0;color:rgba(255,255,255,.6);font-family:Poppins,system-ui,sans-serif;font-size:15px;opacity:0;animation:ls-up .6s cubic-bezier(.16,1,.3,1) 1.1s forwards}
@keyframes ls-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ls h1,.ls p{animation:none;opacity:1}}
`;

export default function LaunchSplash() {
  const [show] = useState(shouldShow);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [still, setStill] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const vid = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const v = vid.current;
    if (v) v.play().catch(() => setStill(true)); // lecture refusée (mode économie d'énergie) : image fixe
    const t = window.setTimeout(() => setLeaving(true), still ? 1200 : LENGTH);
    return () => { window.clearTimeout(t); document.body.style.overflow = prev; };
  }, [show, still]);

  useEffect(() => {
    if (!leaving) return;
    document.body.style.overflow = "";
    const t = window.setTimeout(() => setGone(true), 380);
    return () => window.clearTimeout(t);
  }, [leaving]);

  if (!show || gone) return null;
  return (
    <div className={`ls${leaving ? " out" : ""}`} onClick={() => setLeaving(true)} role="presentation" aria-hidden>
      <style>{CSS}</style>
      {still
        ? <img src="/launch/peluche-fin.png" alt="" />
        : <video ref={vid} src="/launch/peluche.mp4" muted playsInline autoPlay preload="auto" />}
      <h1>Ooble</h1>
      <p>L’USDC en dollars canadiens</p>
    </div>
  );
}
