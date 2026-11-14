import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronLeft, ChevronRight, Copy, Download, Heart, MessageCircle, Send, X } from "lucide-react";
import { C, FONT } from "./adminTheme";
import { SOCIAL_BIO, SOCIAL_RULES, SOCIAL_SERIES, type SocialPost } from "@/lib/socialPosts";

/**
 * Studio des réseaux sociaux : une galerie animée de toutes les publications, par série. Un clic ouvre
 * la publication en grand, avec l'aperçu tel qu'il apparaîtra sur Instagram, la légende et les téléchargements.
 */

const STUDIO_CSS = `
.so-root { --so-ease: cubic-bezier(.22,1,.36,1) }
.so-tab .so-tx { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .35s var(--so-ease) }
.so-tab:hover .so-tx, .so-tab[aria-current="true"] .so-tx { background-size: 100% 1.5px }
.so-card { position: relative; display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; text-align: left; font-family: inherit;
  opacity: 0; transform: translateY(18px); animation: so-up .7s var(--so-ease) forwards }
@keyframes so-up { to { opacity: 1; transform: none } }
.so-frame { position: relative; aspect-ratio: 4 / 5; border-radius: 20px; overflow: hidden; background: var(--a-l1); transition: transform .45s var(--so-ease), box-shadow .45s var(--so-ease) }
.so-card:hover .so-frame, .so-card:focus-visible .so-frame { transform: translateY(-6px); box-shadow: 0 28px 60px rgba(0,0,0,.38) }
.so-frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .9s var(--so-ease), opacity .5s }
.so-card:hover .so-frame img { transform: scale(1.06) }
.so-shade { position: absolute; inset: auto 0 0 0; height: 55%; background: linear-gradient(180deg, transparent, rgba(0,0,0,.72)); opacity: 0; transition: opacity .4s }
.so-card:hover .so-shade, .so-card:focus-visible .so-shade { opacity: 1 }
.so-meta { position: absolute; left: 16px; right: 16px; bottom: 14px; color: #fff; transform: translateY(10px); opacity: 0; transition: transform .45s var(--so-ease), opacity .35s }
.so-card:hover .so-meta, .so-card:focus-visible .so-meta { transform: none; opacity: 1 }
.so-quick { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; opacity: 0; transform: translateY(-6px); transition: opacity .3s, transform .4s var(--so-ease) }
.so-card:hover .so-quick, .so-card:focus-within .so-quick { opacity: 1; transform: none }
.so-qbtn { width: 36px; height: 36px; border-radius: 99px; border: none; background: rgba(255,255,255,.94); color: #111; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .2s }
.so-qbtn:hover { transform: scale(1.08) }
.so-stack::before, .so-stack::after { content: ""; position: absolute; left: 8%; right: 8%; border-radius: 20px; background: var(--a-l2); z-index: -1; transition: transform .45s var(--so-ease) }
.so-stack::before { top: -8px; opacity: .55 } .so-stack::after { top: -15px; left: 15%; right: 15%; opacity: .3 }
.so-card:hover .so-stack::before { transform: translateY(-4px) } .so-card:hover .so-stack::after { transform: translateY(-8px) }
.so-badge { position: absolute; top: 12px; left: 12px; padding: 5px 10px; border-radius: 99px; background: rgba(20,20,20,.6); color: #fff; font-size: 12px; font-weight: 500; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px) }
.so-veil { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.66); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); animation: so-fade .3s ease both; display: flex; align-items: center; justify-content: center; padding: 24px }
@keyframes so-fade { from { opacity: 0 } }
.so-sheet { width: min(1120px, 100%); max-height: calc(100vh - 48px); overflow: auto; background: var(--a-bg); border-radius: 28px; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); animation: so-pop .45s var(--so-ease) both }
@keyframes so-pop { from { opacity: 0; transform: translateY(24px) scale(.97) } }
.so-stage { background: radial-gradient(120% 90% at 50% 0%, var(--a-l2), color-mix(in srgb, var(--a-bg) 70%, #000)); padding: 44px 36px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px }
.so-slide { animation: so-in .4s var(--so-ease) }
@keyframes so-in { from { opacity: .2; transform: scale(.98) } }
.so-arrow { transition: transform .2s, opacity .2s } .so-arrow:hover { transform: scale(1.06) }
.so-btn { transition: transform .15s, opacity .2s } .so-btn:active { transform: scale(.97) }
@media (max-width: 900px) { .so-sheet { grid-template-columns: 1fr } }
@media (hover: none) { .so-meta, .so-shade { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .so-card, .so-frame, .so-frame img, .so-sheet, .so-veil, .so-slide { animation: none !important; transition: none !important; opacity: 1; transform: none } }
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

function StudioButton({ primary, icon, children, onClick }: { primary?: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="so-btn" onClick={onClick}
      style={{
        height: 44, padding: "0 18px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 500,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%",
        background: primary ? C.t1 : C.l1, color: primary ? C.bg : C.t1,
      }}>
      {icon}{children}
    </button>
  );
}

/** L'aperçu façon Instagram : en-tête du compte, image (ou carrousel), actions, début de la légende. */
function Preview({ post }: { post: SocialPost }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [post.id]);
  const many = post.images.length > 1;
  const { text } = splitCaption(post.caption);
  const first = text.split("\n")[0];
  return (
    <div style={{ width: "100%", maxWidth: 440, margin: "0 auto", background: "#ffffff", color: "#111111", borderRadius: 22, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,.45)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <span style={{ width: 34, height: 34, borderRadius: 999, background: "#0e3341", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden><circle cx="12.5" cy="16" r="4.6" fill="none" stroke="#3cc2b2" strokeWidth="2.6" /><circle cx="20.5" cy="16" r="4.6" fill="none" stroke="#fff" strokeWidth="2.6" /></svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>ooble</span>
          <span style={{ display: "block", fontSize: 11.5, color: "#737373" }}>Canada</span>
        </span>
        <span style={{ fontSize: 18, color: "#737373", letterSpacing: 1 }}>···</span>
      </div>
      <div style={{ position: "relative", aspectRatio: "4 / 5", background: "#f2f2f2" }}>
        <img key={post.images[i]} className="so-slide" src={post.images[i]} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {many && (
          <>
            <span style={{ position: "absolute", top: 12, right: 12, padding: "4px 10px", borderRadius: 99, background: "rgba(20,20,20,.62)", color: "#fff", fontSize: 12, fontWeight: 500 }}>{i + 1}/{post.images.length}</span>
            {i > 0 && (
              <button type="button" className="so-arrow" aria-label="Image précédente" onClick={() => setI(i - 1)}
                style={{ position: "absolute", left: 10, top: "50%", marginTop: -16, width: 32, height: 32, borderRadius: 99, border: "none", background: "rgba(255,255,255,.92)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#111" }}>
                <ChevronLeft size={18} />
              </button>
            )}
            {i < post.images.length - 1 && (
              <button type="button" className="so-arrow" aria-label="Image suivante" onClick={() => setI(i + 1)}
                style={{ position: "absolute", right: 10, top: "50%", marginTop: -16, width: 32, height: 32, borderRadius: 99, border: "none", background: "rgba(255,255,255,.92)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#111" }}>
                <ChevronRight size={18} />
              </button>
            )}
          </>
        )}
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

/** Une carte de la galerie : l'image, et au survol le titre, le jour et deux actions rapides. Un carrousel défile tout seul. */
function Card({ post, n, delay, onOpen, done, copy }: { post: SocialPost; n: number; delay: number; onOpen: () => void; done: string | null; copy: (k: string, t: string) => void }) {
  const many = post.images.length > 1;
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!many || !hover) { setI(0); return; }
    const t = window.setInterval(() => setI((v) => (v + 1) % post.images.length), 1100);
    return () => window.clearInterval(t);
  }, [many, hover, post.images.length]);
  return (
    <div role="button" tabIndex={0} className="so-card" style={{ animationDelay: `${delay}ms` }} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label={`Ouvrir ${post.title}`}>
      <div className={`so-frame${many ? " so-stack" : ""}`} style={{ overflow: many ? "visible" : "hidden" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden" }}>
          {post.images.map((src, k) => <img key={src} src={src} alt={k === 0 ? post.title : ""} loading="lazy" style={{ opacity: k === i ? 1 : 0 }} />)}
          <div className="so-shade" />
          <span className="so-badge">{String(n).padStart(2, "0")}{many ? ` · ${i + 1}/${post.images.length}` : ""}</span>
          <div className="so-quick" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="so-qbtn" aria-label="Copier la légende" title="Copier la légende" onClick={() => copy(post.id, post.caption)}>
              {done === post.id ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button type="button" className="so-qbtn" aria-label="Télécharger" title="Télécharger" onClick={() => downloadAll(post.images)}><Download size={16} /></button>
          </div>
          <div className="so-meta">
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{post.title}</p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, opacity: 0.8 }}>Jour {n} · {many ? `carrousel de ${post.images.length}` : "image"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** La publication ouverte en grand : l'aperçu Instagram à gauche, tout ce qu'il faut pour publier à droite. */
function Focus({ list, index, onIndex, onClose, done, copy }: { list: { post: SocialPost; n: number; serie: string }[]; index: number; onIndex: (i: number) => void; onClose: () => void; done: string | null; copy: (k: string, t: string) => void }) {
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
      <button type="button" className="so-arrow" disabled={off} onClick={() => onIndex(index + d)} aria-label={label}
        style={{ width: 42, height: 42, borderRadius: 99, border: "none", background: "rgba(255,255,255,.1)", color: "#fff", cursor: off ? "default" : "pointer", opacity: off ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={17} />
      </button>
    );
  };
  return (
    <div className="so-veil" onClick={onClose} role="dialog" aria-modal="true" aria-label={post.title}>
      <div className="so-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="so-stage">
          <Preview post={post} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "rgba(255,255,255,.7)", fontSize: 13 }}>
            {nav(-1, "Publication précédente", ArrowLeft)}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{index + 1} / {list.length}</span>
            {nav(1, "Publication suivante", ArrowRight)}
          </div>
        </div>
        <div style={{ padding: "32px 32px 28px", display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>{serie} · jour {n}</p>
              <h2 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15 }}>{post.title}</h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: C.t3 }}>{post.images.length > 1 ? `Carrousel · ${post.images.length} images` : "1 image"} · 1080 × 1350</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer"
              style={{ width: 38, height: 38, borderRadius: 99, border: "none", background: C.l1, color: C.t1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={17} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <StudioButton primary icon={done === post.id ? <Check size={16} /> : <Copy size={16} />} onClick={() => copy(post.id, post.caption)}>{done === post.id ? "Copiée" : "Copier la légende"}</StudioButton>
            <StudioButton icon={<Download size={16} />} onClick={() => downloadAll(post.images)}>{post.images.length > 1 ? `${post.images.length} images` : "Télécharger"}</StudioButton>
          </div>
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t3 }}>Légende</p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: C.t2, whiteSpace: "pre-wrap" }}>{text}</p>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Hashtags · {tags.length}</p>
              <button type="button" onClick={() => copy(`${post.id}-tags`, tags.join(" "))}
                style={{ padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>{done === `${post.id}-tags` ? "Copiés" : "Copier"}</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tags.map((t) => <span key={t} style={{ padding: "5px 11px", borderRadius: 99, background: C.l1, fontSize: 12.5, color: C.t2 }}>{t}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Filter = "all" | "carousel" | string;

export default function SocialPanel() {
  const { done, copy } = useCopy();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const flat = useMemo(() => SOCIAL_SERIES.flatMap((s) => s.posts.map((post, k) => ({ post, n: k + 1, serie: s.title, serieId: s.id }))), []);
  const visible = flat.filter((x) => filter === "all" || (filter === "carousel" ? x.post.images.length > 1 : x.serieId === filter));
  const groups = SOCIAL_SERIES.map((s) => ({ s, items: visible.filter((x) => x.serieId === s.id) })).filter((g) => g.items.length);
  const carousels = flat.filter((x) => x.post.images.length > 1).length;
  const tabs: { id: Filter; label: string }[] = [{ id: "all", label: "Tout" }, ...SOCIAL_SERIES.map((s) => ({ id: s.id, label: s.title.split(" · ")[0] })), { id: "carousel", label: "Carrousels" }];
  let order = 0;

  return (
    <div className="so-root" style={{ fontFamily: FONT, color: C.t1 }}>
      <style>{STUDIO_CSS}</style>

      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 28, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>Instagram · publications prêtes</p>
          <h1 style={{ margin: "6px 0 0", fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 0.98 }}>Studio</h1>
        </div>
        <div style={{ display: "flex", gap: 36 }}>
          {[[flat.length, "publications"], [SOCIAL_SERIES.length, "séries"], [carousels, "carrousels"]].map(([v, l]) => (
            <div key={String(l)}><p style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{v}</p><p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>{l}</p></div>
          ))}
        </div>
      </header>

      <nav aria-label="Filtrer" style={{ display: "flex", gap: 26, flexWrap: "wrap", margin: "30px 0 8px" }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" className="so-tab" aria-current={filter === t.id} onClick={() => setFilter(t.id)}
            style={{ padding: "4px 0", border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 15, color: filter === t.id ? C.t1 : C.t3, fontWeight: filter === t.id ? 500 : 400 }}>
            <span className="so-tx">{t.label}</span>
          </button>
        ))}
      </nav>

      {groups.map(({ s, items }) => (
        <section key={s.id + filter} style={{ marginTop: 40 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.025em" }}>{s.title.split(" · ")[1] ?? s.title}</h2>
            <span style={{ fontSize: 13, color: C.t3 }}>{s.title.split(" · ")[0]} · {s.description}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "34px 22px" }}>
            {items.map((x) => {
              const at = flat.indexOf(x);
              return <Card key={x.post.id} post={x.post} n={x.n} delay={Math.min(order++, 14) * 45} onOpen={() => setOpen(at)} done={done} copy={copy} />;
            })}
          </div>
        </section>
      ))}

      <section style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Bio du compte</h2>
            <button type="button" onClick={() => copy("bio", SOCIAL_BIO)}
              style={{ padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 13, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>{done === "bio" ? "Copiée" : "Copier"}</button>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: C.t2, whiteSpace: "pre-wrap" }}>{SOCIAL_BIO}</p>
        </div>
        <div>
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600 }}>Avant de publier</h2>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, lineHeight: 1.55, color: C.t2 }}>
            {SOCIAL_RULES.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </div>
      </section>

      {/* Au-dessus de tout (barre latérale comprise) : la fenêtre est posée sur la page entière. */}
      {open !== null && createPortal(
        <div className="admin-scope so-root" style={{ fontFamily: FONT, color: C.t1 }}><style>{STUDIO_CSS}</style>
          <Focus list={flat} index={open} onIndex={setOpen} onClose={() => setOpen(null)} done={done} copy={copy} />
        </div>, document.body)}
    </div>
  );
}
