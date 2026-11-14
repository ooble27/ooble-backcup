import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronLeft, ChevronRight, Copy, Download, Heart, MessageCircle, Send } from "lucide-react";
import { C, FONT } from "./adminTheme";
import { SOCIAL_BIO, SOCIAL_RULES, SOCIAL_SERIES, type SocialPost } from "@/lib/socialPosts";

/**
 * Studio des réseaux sociaux : la liste des publications d'une série à gauche, l'aperçu tel qu'il
 * apparaîtra sur Instagram au centre, la légende et les téléchargements à droite.
 */

const STUDIO_CSS = `
.so-root { --so-stage: color-mix(in srgb, var(--a-bg) 82%, #000 18%); }
.so-item { transition: background .2s, color .2s }
.so-item:hover { background: var(--a-l1) }
.so-item:hover .so-thumb { transform: scale(1.04) }
.so-thumb { transition: transform .35s cubic-bezier(.22,1,.36,1) }
.so-tab .so-tx, .so-item .so-tx { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 2px; transition: background-size .35s cubic-bezier(.22,1,.36,1) }
.so-tab[aria-current="true"] .so-tx, .so-item[aria-current="true"] .so-tx { background-size: 100% 1.5px }
.so-arrow { transition: opacity .2s, transform .2s }
.so-arrow:hover { transform: scale(1.06) }
.so-btn { transition: transform .15s, opacity .2s, background .2s }
.so-btn:active { transform: scale(.97) }
.so-slide { animation: so-in .35s cubic-bezier(.22,1,.36,1) }
@keyframes so-in { from { opacity: .3; transform: scale(.985) } to { opacity: 1; transform: none } }
@media (max-width: 1180px) { .so-grid { grid-template-columns: 1fr !important } .so-list { flex-direction: row !important; overflow-x: auto; padding-bottom: 6px } .so-item { flex: 0 0 220px } }
@media (prefers-reduced-motion: reduce) { .so-slide, .so-thumb, .so-tx { animation: none; transition: none } }
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

export default function SocialPanel() {
  const { done, copy } = useCopy();
  const [seriesId, setSeriesId] = useState(SOCIAL_SERIES[0].id);
  const series = SOCIAL_SERIES.find((s) => s.id === seriesId) ?? SOCIAL_SERIES[0];
  const [postId, setPostId] = useState(series.posts[0].id);
  useEffect(() => setPostId(series.posts[0].id), [series]);
  const idx = Math.max(0, series.posts.findIndex((p) => p.id === postId));
  const post = series.posts[idx];
  const { text, tags } = useMemo(() => splitCaption(post.caption), [post]);
  const total = SOCIAL_SERIES.reduce((n, s) => n + s.posts.length, 0);

  return (
    <div className="so-root" style={{ fontFamily: FONT, color: C.t1 }}>
      <style>{STUDIO_CSS}</style>

      {/* En-tête du studio */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>Studio · Instagram</p>
          <h1 style={{ margin: "4px 0 0", fontSize: "clamp(30px, 3vw, 40px)", fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05 }}>Réseaux sociaux</h1>
        </div>
        <nav aria-label="Séries" style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          {SOCIAL_SERIES.map((s) => (
            <button key={s.id} type="button" className="so-tab" aria-current={s.id === seriesId} onClick={() => setSeriesId(s.id)}
              style={{ padding: "4px 0", border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 14.5, color: s.id === seriesId ? C.t1 : C.t3, fontWeight: s.id === seriesId ? 500 : 400 }}>
              <span className="so-tx">{s.title}</span>
            </button>
          ))}
          <span style={{ fontSize: 13, color: C.t3, alignSelf: "center" }}>{total} publications</span>
        </nav>
      </header>

      <div className="so-grid" style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr) 360px", gap: 28, alignItems: "start" }}>
        {/* Publications de la série */}
        <aside>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>{series.description}</p>
          <div className="so-list" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {series.posts.map((p, k) => {
              const on = p.id === post.id;
              return (
                <button key={p.id} type="button" className="so-item" aria-current={on} onClick={() => setPostId(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderRadius: 14, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: FONT, color: on ? C.t1 : C.t2 }}>
                  <span style={{ width: 52, height: 65, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.l1 }}>
                    <img className="so-thumb" src={p.images[0]} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{String(k + 1).padStart(2, "0")} · {p.images.length > 1 ? `carrousel de ${p.images.length}` : "image"}</span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: on ? 500 : 400, marginTop: 2, lineHeight: 1.3 }}><span className="so-tx">{p.title}</span></span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Scène : l'aperçu tel qu'il apparaîtra */}
        <section aria-label="Aperçu" style={{ background: "var(--so-stage)", borderRadius: 28, padding: "40px 28px 32px", minHeight: 640, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <Preview post={post} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: C.t3, fontSize: 13 }}>
            <button type="button" className="so-arrow" disabled={idx === 0} onClick={() => setPostId(series.posts[idx - 1].id)} aria-label="Publication précédente"
              style={{ width: 38, height: 38, borderRadius: 99, border: "none", background: C.l1, color: C.t1, cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowLeft size={16} />
            </button>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>Jour {idx + 1} sur {series.posts.length}</span>
            <button type="button" className="so-arrow" disabled={idx === series.posts.length - 1} onClick={() => setPostId(series.posts[idx + 1].id)} aria-label="Publication suivante"
              style={{ width: 38, height: 38, borderRadius: 99, border: "none", background: C.l1, color: C.t1, cursor: idx === series.posts.length - 1 ? "default" : "pointer", opacity: idx === series.posts.length - 1 ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowRight size={16} />
            </button>
          </div>
        </section>

        {/* Légende, hashtags, téléchargements */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Publication {String(idx + 1).padStart(2, "0")}</p>
            <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{post.title}</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: C.t3 }}>{post.images.length > 1 ? `Carrousel · ${post.images.length} images` : "1 image"} · 1080 × 1350 · portrait</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <StudioButton primary icon={done === post.id ? <Check size={16} /> : <Copy size={16} />} onClick={() => copy(post.id, post.caption)}>
              {done === post.id ? "Légende copiée" : "Copier la légende"}
            </StudioButton>
            <StudioButton icon={<Download size={16} />} onClick={() => downloadAll(post.images)}>
              {post.images.length > 1 ? `Télécharger les ${post.images.length} images` : "Télécharger l'image"}
            </StudioButton>
          </div>

          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t3 }}>Légende</p>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: C.t2, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>{text}</p>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Hashtags · {tags.length}</p>
              <button type="button" onClick={() => copy(`${post.id}-tags`, tags.join(" "))}
                style={{ padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>
                {done === `${post.id}-tags` ? "Copiés" : "Copier"}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tags.map((t) => <span key={t} style={{ padding: "5px 11px", borderRadius: 99, background: C.l1, fontSize: 12.5, color: C.t2 }}>{t}</span>)}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Bio du compte</p>
              <button type="button" onClick={() => copy("bio", SOCIAL_BIO)}
                style={{ padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>
                {done === "bio" ? "Copiée" : "Copier"}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: C.t2, whiteSpace: "pre-wrap" }}>{SOCIAL_BIO}</p>
          </div>

          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t3 }}>Avant de publier</p>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, lineHeight: 1.5, color: C.t2 }}>
              {SOCIAL_RULES.map((r) => <li key={r}>{r}</li>)}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
