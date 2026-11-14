import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronLeft, ChevronRight, Copy, Download, Heart, MessageCircle, Search, Send, X } from "lucide-react";
import { FONT } from "./adminTheme";
import { SOCIAL_BIO, SOCIAL_RULES, SOCIAL_SERIES, type SocialPost } from "@/lib/socialPosts";

/**
 * Studio des réseaux sociaux, aux couleurs du thème (clair ou sombre) :
 *  - une vitrine animée (la publication du moment, en grand, sur son propre flou) ;
 *  - une rangée qui défile par série, avec des cartes qui s'animent au survol ;
 *  - une barre flottante pour chercher et filtrer ;
 *  - un clic ouvre la publication en grand : aperçu Instagram, légende, hashtags, téléchargement.
 */

// Couleurs du thème du back-office : clair en mode clair, gris doux (pas noir) en mode sombre.
const K = { bg: "var(--a-l1)", s1: "var(--a-l2)", s2: "var(--a-l2)", t1: "var(--a-t1)", t2: "var(--a-t2)", t3: "var(--a-t3)", acc: "var(--a-accent)" };
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

const CSS = `
.st { --e: cubic-bezier(.22,1,.36,1); position: relative; background: ${K.bg}; color: ${K.t1}; border-radius: 28px; overflow: hidden; font-family: ${FONT}; isolation: isolate }
.st * { box-sizing: border-box }
.st-glow { position: absolute; inset: -20% -10% auto -10%; height: 760px; z-index: -1; pointer-events: none; animation: st-drift 18s ease-in-out infinite alternate;
  background: radial-gradient(60% 50% at 20% 10%, rgba(60,194,178,.14), transparent 70%), radial-gradient(40% 40% at 90% 0%, rgba(120,110,255,.10), transparent 70%) }
@keyframes st-drift { from { transform: translateX(-4%) } to { transform: translateX(6%) } }
.st-top { display: flex; align-items: center; gap: 28px; padding: 22px 32px; flex-wrap: wrap }
.st-hero { position: relative; margin: 0 20px; height: 470px; border-radius: 24px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center }
.st-back { position: absolute; inset: -60px; background-size: cover; background-position: center; filter: blur(60px) saturate(1.3); opacity: .6; transform: scale(1.1); transition: background-image .8s }
.st-fade { position: absolute; inset: 0; background: linear-gradient(90deg, var(--a-l1) 0%, ${mix("var(--a-l1)", 78)} 42%, ${mix("var(--a-l1)", 10)} 100%) }
.st-copy { position: relative; padding: 0 48px; display: flex; flex-direction: column; gap: 18px; animation: st-rise .8s var(--e) both }
@keyframes st-rise { from { opacity: 0; transform: translateY(16px) } }
.st-stack { position: relative; height: 420px; display: flex; align-items: center; justify-content: center; animation: st-float 7s ease-in-out infinite }
@keyframes st-float { 0%, 100% { transform: translateY(-6px) } 50% { transform: translateY(8px) } }
.st-sheet { position: absolute; width: 270px; aspect-ratio: 4 / 5; border-radius: 22px; overflow: hidden; box-shadow: 0 40px 80px rgba(0,0,0,.55); transition: transform .9s var(--e), opacity .9s var(--e), filter .9s }
.st-sheet img { width: 100%; height: 100%; object-fit: cover; display: block }
.st-sheet[data-pos="0"] { z-index: 3; transform: translateX(0) rotate(0) }
.st-sheet[data-pos="0"] img { animation: st-ken 7s ease-out both }
@keyframes st-ken { from { transform: scale(1.12) } to { transform: scale(1) } }
.st-sheet[data-pos="1"] { z-index: 2; transform: translateX(150px) rotate(8deg) scale(.88); opacity: .75; filter: brightness(.7) }
.st-sheet[data-pos="2"] { z-index: 1; transform: translateX(-150px) rotate(-8deg) scale(.88); opacity: .75; filter: brightness(.7) }
.st-sheet[data-pos="3"] { z-index: 0; transform: translateY(20px) scale(.75); opacity: 0 }
.st-bar { height: 3px; border-radius: 9px; background: ${mix("var(--a-t1)", 16)}; overflow: hidden; flex: 1 }
.st-bar > i { display: block; height: 100%; background: ${K.t1}; transform-origin: left; animation: st-fill 7s linear both }
@keyframes st-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.st-pill { height: 46px; padding: 0 20px; border-radius: 999px; border: none; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 9px; transition: transform .2s var(--e), background .2s, opacity .2s }
.st-pill:hover { transform: translateY(-2px) } .st-pill:active { transform: scale(.97) }
.st-rail-h { display: flex; align-items: flex-end; gap: 16px; padding: 0 32px; margin: 44px 0 16px }
.st-rail { overflow: hidden; padding: 10px 0 30px; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent) }
.st-track { display: flex; gap: 18px; width: max-content; padding-left: 18px; animation: st-marq var(--d) linear infinite; animation-direction: var(--dir) }
.st-rail:hover .st-track, .st-track:focus-within { animation-play-state: paused }
@keyframes st-marq { from { transform: translateX(0) } to { transform: translateX(calc(-100% / var(--c))) } }
.st-card { flex: 0 0 clamp(200px, 17vw, 240px); position: relative; border: none; padding: 0; background: none; cursor: pointer; text-align: left; font-family: inherit; color: inherit;
  opacity: 0; transform: translateY(24px); animation: st-up .8s var(--e) forwards }
@keyframes st-up { to { opacity: 1; transform: none } }
.st-frame { position: relative; aspect-ratio: 4 / 5; border-radius: 20px; overflow: hidden; background: ${K.s1}; transition: transform .5s var(--e), box-shadow .5s var(--e) }
.st-card:hover .st-frame, .st-card:focus-visible .st-frame { transform: translateY(-8px) scale(1.02); box-shadow: 0 30px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08) }
.st-frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 1s var(--e), opacity .6s }
.st-card:hover .st-frame img { transform: scale(1.08) }
.st-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 30%, transparent 50%, rgba(0,0,0,.82) 100%); opacity: .0; transition: opacity .4s }
.st-card:hover .st-shade, .st-card:focus-visible .st-shade { opacity: 1 }
.st-meta { position: absolute; left: 16px; right: 16px; bottom: 14px; transform: translateY(12px); opacity: 0; transition: transform .5s var(--e), opacity .35s }
.st-card:hover .st-meta, .st-card:focus-visible .st-meta { transform: none; opacity: 1 }
.st-num { position: absolute; top: 12px; left: 12px; padding: 5px 10px; border-radius: 99px; background: rgba(10,10,10,.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); font-size: 12px; font-weight: 500 }
.st-quick { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; opacity: 0; transform: translateY(-8px); transition: opacity .3s, transform .45s var(--e) }
.st-card:hover .st-quick, .st-card:focus-within .st-quick { opacity: 1; transform: none }
.st-q { width: 36px; height: 36px; border-radius: 99px; border: none; background: rgba(255,255,255,.95); color: #111; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .2s }
.st-q:hover { transform: scale(1.1) }
.st-dots { position: absolute; bottom: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: 4px; transition: opacity .3s }
.st-card:hover .st-dots { opacity: 0 }
.st-arrow { width: 38px; height: 38px; border-radius: 99px; border: none; background: var(--a-l2); color: var(--a-t1); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .2s, background .2s }
.st-arrow:hover { transform: scale(1.06); background: var(--a-l3) }
.st-dock { position: sticky; bottom: 18px; z-index: 5; display: flex; justify-content: center; padding: 0 16px; margin-top: 30px; pointer-events: none }
.st-dock > div { pointer-events: auto; display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 999px; background: ${mix("var(--a-l2)", 82)}; backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  box-shadow: 0 20px 50px rgba(0,0,0,.28), inset 0 0 0 1px ${mix("var(--a-t1)", 9)}; max-width: 100% ; overflow-x: auto; scrollbar-width: none }
.st-chip { height: 38px; padding: 0 16px; border-radius: 999px; border: none; background: transparent; color: ${K.t2}; font-family: inherit; font-size: 13.5px; cursor: pointer; white-space: nowrap; transition: background .2s, color .2s }
.st-chip:hover { color: ${K.t1} } .st-chip[aria-pressed="true"] { background: ${K.t1}; color: ${K.bg}; font-weight: 500 }
.st-veil { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,.72); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; padding: 24px; animation: st-fade .3s ease both; font-family: ${FONT} }
@keyframes st-fade { from { opacity: 0 } }
.st-modal { width: min(1140px, 100%); max-height: calc(100vh - 48px); overflow: auto; background: var(--a-l1); color: var(--a-t1); border-radius: 30px; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  box-shadow: 0 50px 120px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.06); animation: st-pop .5s var(--e) both }
@keyframes st-pop { from { opacity: 0; transform: translateY(26px) scale(.96) } }
.st-stage { position: relative; overflow: hidden; padding: 44px 36px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px }
.st-slide { animation: st-in .45s var(--e) }
@keyframes st-in { from { opacity: .2; transform: scale(.97) } }
@media (max-width: 980px) { .st-hero { grid-template-columns: 1fr; height: auto; padding: 36px 0 } .st-stack { height: 360px } .st-modal { grid-template-columns: 1fr } }
@media (hover: none) { .st-meta, .st-shade, .st-quick { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .st *, .st-veil, .st-modal { animation: none !important; transition: none !important } .st-card { opacity: 1; transform: none } .st-rail { overflow-x: auto } }
`;

function useCopy() {
  const [done, setDone] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setDone(key);
      window.setTimeout(() => setDone((d) => (d === key ? null : d)), 1800);
    });
  };
  return { done, copy };
}

function downloadAll(images: string[]) {
  images.forEach((src, i) => {
    window.setTimeout(() => {
      const a = document.createElement("a");
      a.href = src;
      a.download = `ooble-${src.split("/").pop()}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 350);
  });
}

const splitCaption = (c: string) => {
  const tags = c.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const text = c.replace(/(\n*#[\p{L}\p{N}_]+\s*)+$/u, "").trimEnd();
  return { text, tags };
};

interface Entry { post: SocialPost; n: number; serie: string; serieId: string }

const Mark = ({ size = 30 }: { size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: size * 0.3, background: "#0e3341", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden><circle cx="12.5" cy="16" r="4.6" fill="none" stroke="#3cc2b2" strokeWidth="2.6" /><circle cx="20.5" cy="16" r="4.6" fill="none" stroke="#fff" strokeWidth="2.6" /></svg>
  </span>
);

/** L'aperçu façon Instagram. */
function Preview({ post }: { post: SocialPost }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [post.id]);
  const many = post.images.length > 1;
  const first = splitCaption(post.caption).text.split("\n")[0];
  const arrow = (side: "l" | "r") => (
    <button type="button" aria-label={side === "l" ? "Image précédente" : "Image suivante"} onClick={() => setI(i + (side === "l" ? -1 : 1))}
      style={{ position: "absolute", [side === "l" ? "left" : "right"]: 10, top: "50%", marginTop: -16, width: 32, height: 32, borderRadius: 99, border: "none", background: "rgba(255,255,255,.92)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#111" }}>
      {side === "l" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 420, background: "#fff", color: "#111", borderRadius: 22, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,.55)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <Mark size={34} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>ooble</span>
          <span style={{ display: "block", fontSize: 11.5, color: "#737373" }}>Canada</span>
        </span>
        <span style={{ fontSize: 18, color: "#737373", letterSpacing: 1 }}>···</span>
      </div>
      <div style={{ position: "relative", aspectRatio: "4 / 5", background: "#f2f2f2" }}>
        <img key={post.images[i]} className="st-slide" src={post.images[i]} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {many && <span style={{ position: "absolute", top: 12, right: 12, padding: "4px 10px", borderRadius: 99, background: "rgba(20,20,20,.62)", color: "#fff", fontSize: 12, fontWeight: 500 }}>{i + 1}/{post.images.length}</span>}
        {many && i > 0 && arrow("l")}
        {many && i < post.images.length - 1 && arrow("r")}
      </div>
      <div style={{ padding: "10px 14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Heart size={23} strokeWidth={1.8} /><MessageCircle size={22} strokeWidth={1.8} /><Send size={21} strokeWidth={1.8} />
          <span style={{ flex: 1, display: "flex", justifyContent: "center", gap: 4 }}>
            {many && post.images.map((_, k) => <span key={k} style={{ width: 6, height: 6, borderRadius: 99, background: k === i ? "#0095f6" : "#c7c7c7" }} />)}
          </span>
          <Bookmark size={22} strokeWidth={1.8} />
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.45 }}><b>ooble</b> {first}</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#737373" }}>… plus</p>
      </div>
    </div>
  );
}

/** La vitrine : une publication en grand sur son propre flou, qui tourne toute seule. */
function Hero({ items, onOpen, done, copy }: { items: Entry[]; onOpen: (e: Entry) => void; done: string | null; copy: (k: string, t: string) => void }) {
  const [at, setAt] = useState(0);
  const [pause, setPause] = useState(false);
  useEffect(() => {
    if (pause || items.length < 2) return;
    const t = window.setTimeout(() => setAt((v) => (v + 1) % items.length), 7000);
    return () => window.clearTimeout(t);
  }, [at, pause, items.length]);
  if (!items.length) return null;
  const cur = items[at];
  const pos = (k: number) => {
    const d = (k - at + items.length) % items.length;
    return d === 0 ? 0 : d === 1 ? 1 : d === items.length - 1 ? 2 : 3;
  };
  return (
    <section className="st-hero" onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)} aria-label="À la une">
      <div className="st-back" style={{ backgroundImage: `url(${cur.post.images[0]})` }} />
      <div className="st-fade" />
      <div key={cur.post.id} className="st-copy">
        <span style={{ fontSize: 13, color: K.acc, fontWeight: 500, letterSpacing: ".04em" }}>À la une · {cur.serie.split(" · ")[1] ?? cur.serie}</span>
        <h2 style={{ margin: 0, fontSize: "clamp(34px, 4.2vw, 58px)", fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1 }}>{cur.post.title}</h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: K.t2, maxWidth: 440 }}>{splitCaption(cur.post.caption).text.split("\n").filter(Boolean).slice(1, 3).join(" ")}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <button type="button" className="st-pill" style={{ background: K.t1, color: K.bg }} onClick={() => onOpen(cur)}>Ouvrir la publication <ArrowRight size={16} /></button>
          <button type="button" className="st-pill" style={{ background: mix("var(--a-t1)", 10), color: K.t1 }} onClick={() => copy(cur.post.id, cur.post.caption)}>
            {done === cur.post.id ? <Check size={16} /> : <Copy size={16} />}{done === cur.post.id ? "Copiée" : "Copier la légende"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, maxWidth: 360 }}>
          {items.map((e, k) => (
            <button key={e.post.id} type="button" onClick={() => setAt(k)} aria-label={e.post.title} style={{ flex: 1, padding: "8px 0", border: "none", background: "none", cursor: "pointer" }}>
              <span className="st-bar" style={{ display: "block" }}>{k === at ? <i key={`${at}-${pause}`} style={pause ? { animationPlayState: "paused" } : undefined} /> : k < at ? <i style={{ animation: "none" }} /> : null}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="st-stack">
        {items.map((e, k) => (
          <div key={e.post.id} className="st-sheet" data-pos={pos(k)} onClick={() => (pos(k) === 0 ? onOpen(e) : setAt(k))} style={{ cursor: "pointer" }}>
            <img key={pos(k) === 0 ? `${e.post.id}-on` : e.post.id} src={e.post.images[0]} alt="" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Une carte d'une rangée : l'image, et au survol le titre, le jour et deux actions. Un carrousel défile tout seul. */
function Card({ e, delay, onOpen, done, copy }: { e: Entry; delay: number; onOpen: () => void; done: string | null; copy: (k: string, t: string) => void }) {
  const { post, n } = e;
  const many = post.images.length > 1;
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!many || !hover) { setI(0); return; }
    const t = window.setInterval(() => setI((v) => (v + 1) % post.images.length), 1000);
    return () => window.clearInterval(t);
  }, [many, hover, post.images.length]);
  return (
    <div role="button" tabIndex={0} className="st-card" style={{ animationDelay: `${delay}ms` }} onClick={onOpen} aria-label={`Ouvrir ${post.title}`}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(); } }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="st-frame">
        {post.images.map((src, k) => <img key={src} src={src} alt={k === 0 ? post.title : ""} loading="lazy" style={{ opacity: k === i ? 1 : 0 }} />)}
        <div className="st-shade" />
        <span className="st-num">{String(n).padStart(2, "0")}{many ? ` · ${post.images.length} images` : ""}</span>
        <div className="st-quick" onClick={(ev) => ev.stopPropagation()}>
          <button type="button" className="st-q" aria-label="Copier la légende" title="Copier la légende" onClick={() => copy(post.id, post.caption)}>{done === post.id ? <Check size={16} /> : <Copy size={16} />}</button>
          <button type="button" className="st-q" aria-label="Télécharger" title="Télécharger" onClick={() => downloadAll(post.images)}><Download size={16} /></button>
        </div>
        {many && <div className="st-dots">{post.images.map((_, k) => <span key={k} style={{ width: 5, height: 5, borderRadius: 9, background: k === i ? "#fff" : "rgba(255,255,255,.45)" }} />)}</div>}
        <div className="st-meta">
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.25, color: "#fff" }}>{post.title}</p>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "rgba(255,255,255,.75)" }}>Jour {n} · {many ? "carrousel" : "image"}</p>
        </div>
      </div>
    </div>
  );
}

/** Une rangée qui défile toute seule, lentement, dans un sens ou dans l'autre ; elle s'arrête au survol. */
function Rail({ title, sub, items, reverse, onOpen, done, copy }: { title: string; sub: string; items: Entry[]; reverse: boolean; onOpen: (e: Entry) => void; done: string | null; copy: (k: string, t: string) => void }) {
  // Assez de copies pour que la rangée boucle sans trou, même avec peu de publications.
  const copies = Math.max(2, Math.ceil(1800 / (items.length * 258)) + 1);
  const loop = Array.from({ length: copies }, (_, c) => items.map((e) => ({ e, c }))).flat();
  return (
    <section>
      <div className="st-rail-h">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>{title}</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: K.t3 }}>{sub}</p>
        </div>
        <span style={{ fontSize: 13, color: K.t3 }}>{items.length} publication{items.length > 1 ? "s" : ""}</span>
      </div>
      <div className="st-rail">
        <div className="st-track" style={{ ["--c" as string]: copies, ["--d" as string]: `${items.length * copies * 7}s`, ["--dir" as string]: reverse ? "reverse" : "normal" }}>
          {loop.map(({ e, c }, k) => (
            <div key={`${e.post.id}-${c}`} aria-hidden={c > 0 || undefined} style={{ display: "contents" }}>
              <Card e={e} delay={c === 0 ? k * 60 : 0} onOpen={() => onOpen(e)} done={done} copy={copy} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** La publication ouverte en grand. */
function Focus({ list, index, onIndex, onClose, done, copy }: { list: Entry[]; index: number; onIndex: (i: number) => void; onClose: () => void; done: string | null; copy: (k: string, t: string) => void }) {
  const { post, n, serie } = list[index];
  const { text, tags } = splitCaption(post.caption);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", on);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", on); document.body.style.overflow = prev; };
  }, [index, list.length, onClose, onIndex]);
  const nav = (d: number, label: string, Icon: typeof ArrowLeft) => {
    const off = index + d < 0 || index + d >= list.length;
    return (
      <button type="button" className="st-arrow" disabled={off} onClick={() => onIndex(index + d)} aria-label={label} style={{ opacity: off ? 0.3 : 1, cursor: off ? "default" : "pointer", background: mix("var(--a-t1)", 10) }}>
        <Icon size={17} />
      </button>
    );
  };
  const link = { padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: K.t1, textDecoration: "underline", textUnderlineOffset: 3 } as const;
  return (
    <div className="st-veil" onClick={onClose} role="dialog" aria-modal="true" aria-label={post.title}>
      <style>{CSS}</style>
      <div className="st-modal" onClick={(e) => e.stopPropagation()}>
        <div className="st-stage">
          <div style={{ position: "absolute", inset: -80, backgroundImage: `url(${post.images[0]})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(70px) saturate(1.3)", opacity: 0.45 }} />
          <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}><Preview post={post} /></div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, color: K.t2, fontSize: 13 }}>
            {nav(-1, "Publication précédente", ArrowLeft)}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{index + 1} / {list.length}</span>
            {nav(1, "Publication suivante", ArrowRight)}
          </div>
        </div>
        <div style={{ padding: "34px 34px 30px", display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: K.acc, fontWeight: 500 }}>{serie} · jour {n}</p>
              <h2 style={{ margin: "8px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.1 }}>{post.title}</h2>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: K.t3 }}>{post.images.length > 1 ? `Carrousel · ${post.images.length} images` : "1 image"} · 1080 × 1350 · portrait</p>
            </div>
            <button type="button" className="st-arrow" onClick={onClose} aria-label="Fermer"><X size={17} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" className="st-pill" style={{ background: K.t1, color: K.bg, justifyContent: "center" }} onClick={() => copy(post.id, post.caption)}>
              {done === post.id ? <Check size={16} /> : <Copy size={16} />}{done === post.id ? "Copiée" : "Copier la légende"}
            </button>
            <button type="button" className="st-pill" style={{ background: K.s2, color: K.t1, justifyContent: "center" }} onClick={() => downloadAll(post.images)}>
              <Download size={16} />{post.images.length > 1 ? `${post.images.length} images` : "Télécharger"}
            </button>
          </div>
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: K.t3 }}>Légende</p>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: K.t2, whiteSpace: "pre-wrap" }}>{text}</p>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: K.t3 }}>Hashtags · {tags.length}</p>
              <button type="button" style={link} onClick={() => copy(`${post.id}-tags`, tags.join(" "))}>{done === `${post.id}-tags` ? "Copiés" : "Copier"}</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tags.map((t) => <span key={t} style={{ padding: "6px 12px", borderRadius: 99, background: K.s2, fontSize: 12.5, color: K.t2 }}>{t}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Kind = "all" | "carousel" | "single";

export default function SocialPanel() {
  const { done, copy } = useCopy();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [open, setOpen] = useState<number | null>(null);
  const flat = useMemo<Entry[]>(() => SOCIAL_SERIES.flatMap((s) => s.posts.map((post, k) => ({ post, n: k + 1, serie: s.title, serieId: s.id }))), []);
  const featured = useMemo(() => SOCIAL_SERIES.map((s) => flat.find((e) => e.serieId === s.id)!).filter(Boolean), [flat]);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const match = (e: Entry) =>
    (kind === "all" || (kind === "carousel" ? e.post.images.length > 1 : e.post.images.length === 1))
    && (!q.trim() || norm(`${e.post.title} ${e.post.caption}`).includes(norm(q.trim())));
  const rails = SOCIAL_SERIES.map((s) => ({ s, items: flat.filter((e) => e.serieId === s.id && match(e)) })).filter((r) => r.items.length);
  const openEntry = (e: Entry) => setOpen(flat.indexOf(e));
  const carousels = flat.filter((e) => e.post.images.length > 1).length;

  return (
    <div className="st">
      <style>{CSS}</style>
      <div className="st-glow" />

      <header className="st-top">
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark size={34} />
          <span>
            <span style={{ display: "block", fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Ooble Studio</span>
            <span style={{ display: "block", fontSize: 12.5, color: K.t3 }}>Réseaux sociaux · Instagram</span>
          </span>
        </span>
        <span style={{ flex: 1 }} />
        {[[flat.length, "publications"], [SOCIAL_SERIES.length, "séries"], [carousels, "carrousels"]].map(([v, l]) => (
          <span key={String(l)} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v}</span>
            <span style={{ fontSize: 12.5, color: K.t3 }}>{l}</span>
          </span>
        ))}
      </header>

      <Hero items={featured} onOpen={openEntry} done={done} copy={copy} />

      {rails.map(({ s, items }, r) => (
        <Rail key={s.id + kind + q} title={s.title.split(" · ")[1] ?? s.title} sub={`${s.title.split(" · ")[0]} · ${s.description}`} items={items} reverse={r % 2 === 1} onOpen={openEntry} done={done} copy={copy} />
      ))}
      {!rails.length && <p style={{ textAlign: "center", color: K.t3, fontSize: 14, margin: "60px 0" }}>Aucune publication ne correspond à « {q} ».</p>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 48, padding: "30px 32px 10px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Bio du compte</h3>
            <button type="button" onClick={() => copy("bio", SOCIAL_BIO)} style={{ padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 13, color: K.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>{done === "bio" ? "Copiée" : "Copier"}</button>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: K.t2, whiteSpace: "pre-wrap" }}>{SOCIAL_BIO}</p>
        </div>
        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Avant de publier</h3>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7, fontSize: 13.5, lineHeight: 1.55, color: K.t2 }}>
            {SOCIAL_RULES.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </div>
      </section>

      {/* Barre flottante : chercher et filtrer, toujours à portée de main. */}
      <div className="st-dock">
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", height: 38, borderRadius: 999, background: mix("var(--a-t1)", 6), minWidth: 220 }}>
            <Search size={16} color={K.t3} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une publication" aria-label="Rechercher une publication"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: K.t1, fontFamily: FONT, fontSize: 13.5 }} />
          </label>
          {([["all", "Toutes"], ["carousel", "Carrousels"], ["single", "Images"]] as [Kind, string][]).map(([id, l]) => (
            <button key={id} type="button" className="st-chip" aria-pressed={kind === id} onClick={() => setKind(id)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ height: 24 }} />

      {open !== null && createPortal(
        <div className="admin-scope"><Focus list={flat} index={open} onIndex={setOpen} onClose={() => setOpen(null)} done={done} copy={copy} /></div>, document.body)}
    </div>
  );
}
