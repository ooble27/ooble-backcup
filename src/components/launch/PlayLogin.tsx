import { useEffect, useState, type ReactNode } from "react";
import { paintPage, useLightTheme } from "@/lib/installed";

/*
 * Connexion de l'app installée : fond jaune, gros titre, carte blanche au trait noir.
 * La mascotte (à plat, comme sur les écrans d'accueil) dépasse de la carte : ses yeux suivent
 * le courriel qu'on tape, et elle se cache les yeux avec les pattes pendant le mot de passe.
 */

export const PLAY_CSS = `
.pl{min-height:100dvh;background:#fdd94e;color:#111;font-family:Poppins,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:calc(env(safe-area-inset-top,0px) + 34px) 22px calc(env(safe-area-inset-bottom,0px) + 28px);color-scheme:light}
.pl-in{max-width:420px;margin:0 auto}
.pl h1.pl-t{margin:0;font-weight:500;font-size:clamp(34px,10vw,42px);line-height:1.15;letter-spacing:-0.03em;animation:pl-up .6s cubic-bezier(.16,1,.3,1) both}
.pl-pill{display:inline-flex;align-items:center;vertical-align:middle;height:1.12em;padding:0 .12em;border-radius:999px;background:#111;position:relative;top:-.08em}
.pl-pill b{width:.92em;height:.92em;border-radius:50%;background:#ff6a3d;display:flex;align-items:center;justify-content:center}
.pl-mascot{position:relative;height:96px;margin:22px auto 0;width:170px;z-index:3;animation:pl-peek .8s cubic-bezier(.34,1.56,.64,1) .15s both}
.pl-mascot svg{display:block;overflow:visible}
.pl-pupil{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.pl-paw{transition:transform .38s cubic-bezier(.34,1.4,.64,1)}
.pl-card{position:relative;z-index:2;background:#fff;border:3px solid #111;border-radius:28px;padding:22px 18px 20px;animation:pl-up .6s cubic-bezier(.16,1,.3,1) .08s both}
.pl-auth{padding:24px 20px 22px}
.pl-auth .animate-up{animation:none}
.pl-sub{margin:10px 0 0;font-size:15px;line-height:1.5}
.pl-fld{display:block;border:2px solid #111;border-radius:16px;padding:9px 14px 8px;background:#fff;transition:background .2s}
.pl-fld+.pl-fld{margin-top:10px}
.pl-fld:focus-within{background:#fff6c9}
.pl-fld span{display:block;font-size:12px;font-weight:500;letter-spacing:.02em}
.pl-fld input{width:100%;border:none;outline:none;background:transparent;font:400 16px Poppins,system-ui,sans-serif;color:#111;padding:2px 0 0}
.pl-fld button{color:#111}
.pl-go{margin-top:16px;width:100%;height:58px;border:none;border-radius:999px;background:#111;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 24px;font:500 16px Poppins,system-ui,sans-serif;cursor:pointer;transition:transform .15s,opacity .2s}
.pl-go:active{transform:scale(.97)}
.pl-go:disabled{opacity:.45}
.pl-link{border:none;background:none;padding:4px 0;font:500 14px Poppins,system-ui,sans-serif;color:#111;text-decoration:underline;text-underline-offset:4px;cursor:pointer}
.pl-g{margin-top:12px;width:100%;height:54px;border:2px solid #111;border-radius:999px;background:#fff;display:flex;align-items:center;justify-content:center;gap:10px;font:500 15px Poppins,system-ui,sans-serif;color:#111;cursor:pointer}
.pl-or{display:flex;align-items:center;gap:10px;margin-top:18px;font-size:12px}
.pl-or i{flex:1;height:2px;background:#111;opacity:.15}
.pl-err{margin:12px 0 0;font-size:14px;line-height:1.45}
.pl-foot{margin-top:22px;text-align:center;font-size:14.5px}
@keyframes pl-up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes pl-peek{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.pl *{animation:none!important;transition:none!important}}
`;


export function PlayShell({ title, children }: { title: ReactNode; children: ReactNode }) {
  useEffect(() => paintPage("#fdd94e"), []);
  useLightTheme();
  return (
    <div className="pl">
      <style>{PLAY_CSS}</style>
      <div className="pl-in">
        <h1 className="pl-t">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * Cadre des pages d'inscription dans l'app installée : la page entière de couleur, la mascotte qui dépasse
 * de la carte blanche. Elle suit des yeux ce qu'on tape et se cache les yeux pendant un mot de passe.
 */
export function PlayAuthFrame({ bg, children }: { bg: string; children: ReactNode }) {
  useEffect(() => paintPage(bg), [bg]);
  useLightTheme();
  const [field, setField] = useState<{ type: "text" | "password"; len: number } | null>(null);
  const [peek, setPeek] = useState(false);
  const track = (t: EventTarget) => {
    if (!(t instanceof HTMLInputElement) || ["checkbox", "radio", "file", "hidden"].includes(t.type)) return;
    const pw = t.type === "password" || t.autocomplete === "new-password" || t.autocomplete === "current-password";
    setField({ type: pw ? "password" : "text", len: t.value.length });
    setPeek(pw && t.type === "text");
  };
  return (
    <div className="pl" style={{ background: bg }}>
      <style>{PLAY_CSS}</style>
      <div className="pl-in">
        <PeekMascot look={field?.len ?? 0} typing={field?.type === "text"} hide={field?.type === "password"} peek={peek} />
        <div className="pl-card pl-auth"
          onFocusCapture={(e) => track(e.target)} onInputCapture={(e) => track(e.target)}
          onBlurCapture={() => setField(null)}>
          {children}
        </div>
      </div>
    </div>
  );
}

export const PlayArrow = () => (
  <span className="pl-pill" aria-hidden>
    <b><svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></b>
  </span>
);

/** La mascotte qui dépasse de la carte. `look` : longueur du courriel tapé ; `hide` : se cache les yeux ; `peek` : jette un œil (mot de passe affiché). */
export function PeekMascot({ look, hide, peek, typing }: { look: number; hide: boolean; peek: boolean; typing: boolean }) {
  const dx = typing ? Math.max(-5, Math.min(5, -5 + look * 0.4)) : 0;
  const dy = typing ? 3 : 0;
  const pupil = { transform: `translate(${dx}px, ${dy}px)` };
  // Pattes au repos sur le bord de la carte ; levées sur les yeux pendant le mot de passe.
  const left = hide ? `translate(20px, ${peek ? -30 : -42}px) rotate(-8deg)` : "none";
  const right = hide ? "translate(-20px, -42px) rotate(8deg)" : "none";
  return (
    <div className="pl-mascot" aria-hidden>
      <svg width="170" height="110" viewBox="0 0 170 110">
        <defs>
          <pattern id="pl-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.15" fill="#111" /></pattern>
          <clipPath id="pl-body"><path d="M14 98C14 50 42 10 86 10C130 10 158 50 156 98Z" /></clipPath>
        </defs>
        <path d="M14 98C14 50 42 10 86 10C130 10 158 50 156 98Z" fill="#fff" />
        <g clipPath="url(#pl-body)"><path d="M128 22C168 60 160 110 120 130L180 130 180 0Z" fill="url(#pl-dots)" /></g>
        <path d="M14 98C14 50 42 10 86 10C130 10 158 50 156 98" fill="none" stroke="#111" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M40 40c4-9 11-15 20-19" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        {/* Yeux */}
        <g>
          <ellipse cx="64" cy="58" rx="10" ry="12" fill="#fff" stroke="#111" strokeWidth="3" />
          <ellipse cx="108" cy="58" rx="10" ry="12" fill="#fff" stroke="#111" strokeWidth="3" />
          <g className="pl-pupil" style={pupil}>
            <circle cx="64" cy="60" r="5.5" fill="#111" /><circle cx="66" cy="57.5" r="1.7" fill="#fff" />
            <circle cx="108" cy="60" r="5.5" fill="#111" /><circle cx="110" cy="57.5" r="1.7" fill="#fff" />
          </g>
        </g>
        <path d={hide ? "M78 84q8 -4 16 0" : "M76 80q10 9 20 0"} fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" style={{ transition: "d .3s" }} />
        <circle cx="48" cy="76" r="4" fill="#ff6a3d" opacity=".55" /><circle cx="124" cy="76" r="4" fill="#ff6a3d" opacity=".55" />
        {/* Pattes */}
        <g className="pl-paw" style={{ transform: left, transformOrigin: "44px 99px" }}>
          <ellipse cx="44" cy="99" rx="19" ry="13" fill="#fff" stroke="#111" strokeWidth="3" />
          <path d="M36 92v6M44 90v7M52 92v6" stroke="#111" strokeWidth="2.2" strokeLinecap="round" />
        </g>
        <g className="pl-paw" style={{ transform: right, transformOrigin: "128px 99px" }}>
          <ellipse cx="128" cy="99" rx="19" ry="13" fill="#fff" stroke="#111" strokeWidth="3" />
          <path d="M120 92v6M128 90v7M136 92v6" stroke="#111" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

/** La mascotte entière qui sourit (accueil de l'app). */
export function WholeMascot({ size = 96, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  const BODY = "M64 26C104 4 160 22 172 74C184 126 152 176 98 176C44 176 14 142 20 94C24 60 38 40 64 26Z";
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" className={className} style={style} aria-hidden>
      <defs>
        <pattern id="wm-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.15" fill="#111" /></pattern>
        <clipPath id="wm-clip"><path d={BODY} /></clipPath>
      </defs>
      <path d={BODY} fill="#fff" />
      <g clipPath="url(#wm-clip)"><path d="M150 40C190 90 170 170 90 185L190 200 200 40Z" fill="url(#wm-dots)" /></g>
      <path d={BODY} fill="none" stroke="#111" strokeWidth="4" strokeLinejoin="round" />
      <path d="M44 52c4-8 10-14 18-18" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="76" cy="92" rx="10" ry="12" fill="#fff" stroke="#111" strokeWidth="3" /><circle cx="77" cy="94" r="5.5" fill="#111" /><circle cx="79" cy="91.5" r="1.7" fill="#fff" />
      <ellipse cx="120" cy="92" rx="10" ry="12" fill="#fff" stroke="#111" strokeWidth="3" /><circle cx="121" cy="94" r="5.5" fill="#111" /><circle cx="123" cy="91.5" r="1.7" fill="#fff" />
      <circle cx="60" cy="116" r="5" fill="#ff6a3d" opacity=".55" /><circle cx="138" cy="116" r="5" fill="#ff6a3d" opacity=".55" />
      <path d="M84 118q14 13 28 0" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export const Sparkle = ({ size = 18, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" className={className} style={style} aria-hidden>
    <path d="M20 3C21.5 14 26 18.5 37 20C26 21.5 21.5 26 20 37C18.5 26 14 21.5 3 20C14 18.5 18.5 14 20 3Z" fill="none" stroke="#111" strokeWidth="2.6" strokeLinejoin="round" />
  </svg>
);
