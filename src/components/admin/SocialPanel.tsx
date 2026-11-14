import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { C, FONT } from "./adminTheme";
import { Section } from "./layout";
import { Button } from "./ui";
import { SOCIAL_BIO, SOCIAL_RULES, SOCIAL_SERIES, type SocialPost } from "@/lib/socialPosts";

/** Copie un texte et montre « Copié » un instant. */
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

/** Télécharge les images dans l'ordre (un carrousel arrive en plusieurs fichiers numérotés). */
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

function Post({ post, done, copy }: { post: SocialPost; done: string | null; copy: (k: string, t: string) => void }) {
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(false);
  const many = post.images.length > 1;
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <img src={post.images[shown]} alt={post.title} loading="lazy"
        style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 6, display: "block", background: C.l1 }} />
      {many && (
        <div style={{ display: "flex", gap: 6 }} aria-label="Images du carrousel">
          {post.images.map((src, i) => (
            <button key={src} type="button" onClick={() => setShown(i)} aria-label={`Image ${i + 1}`} aria-current={i === shown}
              style={{ padding: 0, border: "none", background: "none", cursor: "pointer", flex: 1, minWidth: 0 }}>
              <img src={src} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 3, display: "block", opacity: i === shown ? 1 : 0.45 }} />
            </button>
          ))}
        </div>
      )}
      <div>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 500, color: C.t1 }}>{post.title}</h3>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: C.t3 }}>{many ? `Carrousel · ${post.images.length} images` : "1 image"} · 1080 × 1350</p>
      </div>
      <p style={{
        margin: 0, fontSize: 13, lineHeight: 1.55, color: C.t2, whiteSpace: "pre-wrap",
        ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }),
      }}>{post.caption}</p>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ alignSelf: "flex-start", padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {open ? "Réduire la légende" : "Lire toute la légende"}
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" icon={done === post.id ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy(post.id, post.caption)}>
          {done === post.id ? "Copiée" : "Copier la légende"}
        </Button>
        <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => downloadAll(post.images)}>
          {many ? `Télécharger les ${post.images.length} images` : "Télécharger l'image"}
        </Button>
      </div>
    </article>
  );
}

export default function SocialPanel() {
  const { done, copy } = useCopy();
  return (
    <div style={{ fontFamily: FONT }}>
      <Section title="Avant de publier" description="Les règles pour toutes les publications, sur tous les réseaux." style={{ marginTop: 8 }}>
        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, lineHeight: 1.55, color: C.t2, maxWidth: 760 }}>
          {SOCIAL_RULES.map((r) => <li key={r}>{r}</li>)}
        </ol>
      </Section>

      <Section title="Bio du compte" actions={
        <Button size="sm" icon={done === "bio" ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy("bio", SOCIAL_BIO)}>{done === "bio" ? "Copiée" : "Copier la bio"}</Button>
      }>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: C.t2, whiteSpace: "pre-wrap" }}>{SOCIAL_BIO}</p>
      </Section>

      {SOCIAL_SERIES.map((s) => (
        <Section key={s.id} title={s.title} description={`${s.description} ${s.posts.length} publications, à publier dans l'ordre.`} style={{ marginTop: 48 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "40px 28px", marginTop: 8 }}>
            {s.posts.map((p) => <Post key={p.id} post={p} done={done} copy={copy} />)}
          </div>
        </Section>
      ))}
    </div>
  );
}
