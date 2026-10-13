import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Download, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { logAdminAction } from "@/lib/audit";
import { archiveDoc, createDoc, fetchDocs, readingMinutes, updateDoc, type DocArticle, type DocDraft, type DocSection } from "@/lib/kb";
import { C, FONT } from "./adminTheme";
import { Button, Field, Notice, TextArea, TextInput, Workspace, WsPane } from "./ui";
import { EmptyState, FilterChips, SearchField } from "./layout";
import Markdown, { MARKDOWN_CSS } from "./Markdown";

/**
 * Ressources : trois pages construites sur le même modèle.
 * - Base de connaissances : des fiches courtes, une par geste du quotidien, rangées par thème ;
 * - Manuel : la référence de fonctionnement d'Ooble, chapitre par chapitre ;
 * - Documentation technique (administrateurs) : l'informatique, les secrets (noms seulement), la reprise.
 * Liste posée sur le fond, lecture dans un volet arrondi. Les administrateurs modifient sur place.
 */

const DOCS_CSS = `
.dk-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
.dk-split { display: grid; gap: 16px; }
/* Ordinateur et tablette : la liste et la fiche défilent chacune de leur côté, la page ne bouge pas. */
@media (min-width: 1000px) {
  .dk-split { grid-template-columns: 300px minmax(0, 1fr); height: calc(100dvh - 112px); min-height: 460px; margin-bottom: -72px; }
  .dk-list, .dk-split > .dk-read { height: 100%; overflow-y: auto; overscroll-behavior: contain; }
}
.dk-item { all: unset; box-sizing: border-box; width: 100%; display: flex; gap: 12px; padding: 9px 12px; cursor: pointer; font-family: inherit; transition: transform .18s cubic-bezier(.22,1,.36,1); }
.dk-item .dk-t { color: var(--a-t2); text-decoration-line: underline; text-decoration-color: transparent; text-underline-offset: 3px; text-decoration-thickness: 1px; transition: text-decoration-color .15s, color .15s; }
.dk-item:hover { transform: translateX(3px); }
.dk-item:hover .dk-t { color: var(--a-t1); text-decoration-color: currentColor; }
.dk-item[aria-current="true"] .dk-t { color: var(--a-t1); font-weight: 600; }
.dk-item[aria-current="true"] .dk-n { color: var(--a-coral); }
.dk-item:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px; border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { .dk-item { transition: none; } .dk-item:hover { transform: none; } }
.dk-seg { all: unset; cursor: pointer; height: 100%; border-radius: 3px; transition: opacity .15s, transform .15s; }
.dk-seg:hover, .dk-seg:focus-visible { transform: scaleY(1.18); }
.dk-read { border-radius: 16px; background: var(--a-bg); box-shadow: 0 0 0 1px var(--a-bds), 0 1px 3px rgba(0,0,0,.05); padding: 28px 32px 32px; min-width: 0; }
@media (max-width: 640px) { .dk-read { padding: 6px 0 26px; border-radius: 0; box-shadow: none; background: transparent; } }
.dk-spine { all: unset; cursor: pointer; display: flex; align-items: flex-end; justify-content: center; border-radius: 6px 6px 3px 3px; transition: transform .18s, opacity .18s; }
.dk-spine:hover { transform: translateY(-4px); }
.dk-spine:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.dk-spine span { display: block; max-height: calc(100% - 4px); box-sizing: border-box; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11.5px; font-weight: 600; color: #fff; padding: 10px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dk-edit { display: grid; gap: 8px; flex: 1; min-height: 0; grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
@media (min-width: 1100px) { .dk-edit { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); overflow: hidden; } }
${MARKDOWN_CSS}
`;

const META: Record<DocSection, { noun: string; nounPlural: string; newLabel: string; numbered: boolean }> = {
  kb: { noun: "fiche", nounPlural: "fiches", newLabel: "Nouvelle fiche", numbered: false },
  manual: { noun: "chapitre", nounPlural: "chapitres", newLabel: "Nouveau chapitre", numbered: true },
  tech: { noun: "page", nounPlural: "pages", newLabel: "Nouvelle page", numbered: true },
};

const dayFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" });
const SPINE_COLORS = [C.vzGreen, C.vzCoral, C.vzIndigo, C.sun, C.sage, C.vzGray];
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const readDoc = () => new URLSearchParams(window.location.search).get("doc");
const writeDoc = (slug: string | null) => {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set("doc", slug); else url.searchParams.delete("doc");
  window.history.replaceState(window.history.state, "", url);
};

/* ─── En-têtes ─── */

function Shelf({ groups, active, onPick }: { groups: [string, number][]; active: string; onPick: (c: string) => void }) {
  const max = Math.max(1, ...groups.map(([, n]) => n));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: C.t3 }}>Les thèmes, une tranche par thème</span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 168, paddingBottom: 6, borderBottom: `2px solid ${C.bd}` }}>
        {groups.map(([cat, n], i) => (
          <button key={cat} type="button" className="dk-spine" onClick={() => onPick(active === cat ? "all" : cat)} aria-pressed={active === cat}
            title={`${cat} : ${n} ${n > 1 ? "fiches" : "fiche"}`}
            style={{ flex: "1 1 0", minWidth: 0, maxWidth: 46, height: `${48 + (n / max) * 52}%`, background: SPINE_COLORS[i % SPINE_COLORS.length], opacity: active === "all" || active === cat ? 1 : 0.35 }}>
            <span>{cat}</span>
          </button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: C.t3 }}>Touchez une tranche pour ne voir que ce thème.</span>
    </div>
  );
}

/** Le manuel d'un coup d'œil : un ruban, un segment par chapitre, large comme sa longueur. */
function ReadingRibbon({ docs, onOpen }: { docs: DocArticle[]; onOpen: (d: DocArticle) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const words = docs.map((d) => d.body.split(/\s+/).filter(Boolean).length);
  const total = Math.max(1, Math.round(words.reduce((s, n) => s + n, 0) / 200));
  const mins = (w: number) => `${String(Math.max(0.5, Math.round((w / 200) * 2) / 2)).replace(".", ",")} min`;
  const h = hover ?? 0;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: C.t3 }}>{docs.length} chapitres · {total} min de lecture, un segment par chapitre</span>
      <div style={{ display: "flex", gap: 3, height: 34, alignItems: "stretch" }} onMouseLeave={() => setHover(null)}>
        {docs.map((d, i) => (
          <button key={d.id} type="button" className="dk-seg" onClick={() => onOpen(d)} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}
            aria-label={`${i + 1}. ${d.title}, ${mins(words[i])}`}
            style={{ flex: `${Math.max(words[i], 60)} 1 0`, minWidth: 4, background: i === h ? C.sun : i % 2 ? C.vzGreen : C.sage, opacity: hover === null || i === hover ? 1 : 0.55 }} />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: C.t2, minHeight: 20, display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ color: C.coral, fontVariantNumeric: "tabular-nums" }}>{String(h + 1).padStart(2, "0")}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.t1 }}>{docs[h]?.title}</span>
        <span style={{ color: C.t3, fontVariantNumeric: "tabular-nums" }}>{mins(words[h] ?? 0)}</span>
      </p>
    </div>
  );
}

function Layers() {
  const rows: [string, string, string][] = [
    ["Clients et équipe", "site, app, back-office", C.vzGray],
    ["Vercel", "hébergement, mise en ligne", C.vzIndigo],
    ["Supabase", "base, comptes, fichiers, 13 fonctions", C.vzGreen],
    ["Fournisseurs", "Interac, blockchains, Resend, Sumsub", C.vzCoral],
  ];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: C.t3 }}>Ooble en quatre couches, de l'écran aux fournisseurs</span>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map(([name, line, color], i) => (
          <div key={name} style={{ marginLeft: i * 14, marginRight: (3 - i) * 14, display: "flex", alignItems: "baseline", gap: 10, padding: "11px 14px", borderRadius: 10, background: color, color: "#fff" }}>
            <b style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</b>
            <span style={{ fontSize: 12, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Édition (administrateurs) ─── */

function Editor({ section, doc, position, onClose, onSaved, onArchived }: {
  section: DocSection; doc: DocArticle | null; position: number;
  onClose: () => void; onSaved: (d: DocArticle) => void; onArchived: (id: string) => void;
}) {
  const { user } = useAuth();
  const meta = META[section];
  const [draft, setDraft] = useState<DocDraft>(() => ({
    title: doc?.title ?? "", summary: doc?.summary ?? "", body: doc?.body ?? "",
    category: doc?.category ?? (section === "kb" ? "" : section === "manual" ? "Manuel" : "Documentation technique"),
    audience: doc?.audience ?? (section === "tech" ? "admin" : "staff"),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const set = <K extends keyof DocDraft>(k: K, v: DocDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const valid = draft.title.trim().length > 2 && draft.body.trim().length > 0 && (section !== "kb" || draft.category.trim());

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      const clean = { ...draft, title: draft.title.trim(), summary: draft.summary.trim(), category: draft.category.trim() };
      const saved = doc ? await updateDoc(doc.id, clean, user?.id) : await createDoc(section, clean, position, user?.id);
      void logAdminAction({ action: doc ? "docs.update" : "docs.create", entityKind: "kb_article", entityId: saved.id, metadata: { section, title: saved.title } });
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Enregistrement impossible.");
      setBusy(false);
    }
  };
  const archive = async () => {
    if (!doc) return;
    setBusy(true); setErr(null);
    try {
      await archiveDoc(doc.id, user?.id);
      void logAdminAction({ action: "docs.archive", entityKind: "kb_article", entityId: doc.id, metadata: { section, title: doc.title } });
      onArchived(doc.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Archivage impossible.");
      setBusy(false);
    }
  };

  return (
    <Workspace title={doc ? `Modifier « ${doc.title} »` : meta.newLabel} subtitle="Visible par l'équipe dès l'enregistrement" onClose={onClose} panes
      actions={<>
        {doc && !confirmArchive && <Button variant="ghost" onClick={() => setConfirmArchive(true)} disabled={busy}>Archiver</Button>}
        {doc && confirmArchive && <Button variant="danger" onClick={archive} disabled={busy}>Confirmer l'archivage</Button>}
        <Button variant="primary" onClick={save} disabled={!valid || busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
      </>}>
      <div className="dk-edit">
        <WsPane flat style={{ padding: "8px 8px 24px" }}>
          <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
            {err && <Notice tone="err">{err}</Notice>}
            {confirmArchive && <Notice tone="warn">Archiver retire {meta.noun === "fiche" ? "la fiche" : "le chapitre"} des Ressources. Il reste en base et peut être restauré par un administrateur.</Notice>}
            <Field label="Titre"><TextInput value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Verser une vente" /></Field>
            <Field label="Résumé" hint="Une phrase, affichée sous le titre et dans la liste.">
              <TextInput value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
            </Field>
            {section === "kb" && (
              <Field label="Thème" hint="Les fiches d'un même thème sont regroupées.">
                <TextInput value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="Commandes" />
              </Field>
            )}
            <Field label="Visible par">
              <FilterChips value={draft.audience} onChange={(v) => set("audience", v)} options={[{ id: "staff", label: "Toute l'équipe" }, { id: "admin", label: "Administrateurs" }]} />
            </Field>
            <Field label="Texte" hint="## pour un titre, - pour une liste, 1. pour des étapes, **gras**, | pour un tableau, > pour un encadré.">
              <TextArea value={draft.body} onChange={(e) => set("body", e.target.value)} rows={22} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.6 }} />
            </Field>
          </div>
        </WsPane>
        <WsPane style={{ padding: "26px 28px" }}>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: C.t3 }}>Aperçu</p>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.15 }}>{draft.title || "Sans titre"}</h2>
          {draft.summary && <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t2 }}>{draft.summary}</p>}
          <div style={{ marginTop: 22 }}><Markdown source={draft.body} /></div>
        </WsPane>
      </div>
    </Workspace>
  );
}

/* ─── Page ─── */

export default function DocsPanel({ section }: { section: DocSection }) {
  const { isAdmin } = useAuth();
  const meta = META[section];
  const key = `docs.${section}`;
  const [docs, setDocs] = useState<DocArticle[] | null>(() => peek<DocArticle[]>(key)?.value ?? null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [openSlug, setOpenSlug] = useState<string | null>(() => readDoc());
  const [editing, setEditing] = useState<{ doc: DocArticle | null } | null>(null);
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.innerWidth >= 1000);
  const [pdf, setPdf] = useState<"idle" | "busy" | "error">("idle");
  const readRef = useRef<HTMLElement | null>(null);
  // PDF construit dans le navigateur à partir des chapitres en base : toujours la dernière version.
  const downloadPdf = async () => {
    if (section === "kb" || !docs?.length || pdf === "busy") return;
    setPdf("busy");
    try {
      const { downloadDocsPdf } = await import("@/lib/docsPdf");
      await downloadDocsPdf(section, docs);
      void logAdminAction({ action: "docs.pdf", entityKind: "kb_article", metadata: { section } });
      setPdf("idle");
    } catch (e) {
      console.error("PDF des ressources", e);
      setPdf("error");
    }
  };

  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1000);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    fetchCached(key, () => fetchDocs(section)).then(setDocs).catch((e) => { setError(e instanceof Error ? e.message : "Chargement impossible."); setDocs((d) => d ?? []); });
  }, [key, section]);

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs ?? []) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return [...m.entries()];
  }, [docs]);

  const needle = norm(q.trim());
  const list = useMemo(() => (docs ?? [])
    .filter((d) => cat === "all" || d.category === cat)
    .filter((d) => !needle || norm(`${d.title} ${d.summary} ${d.category} ${d.body}`).includes(needle)), [docs, cat, needle]);

  const all = docs ?? [];
  const current = all.find((d) => d.slug === openSlug) ?? (wide && !needle && cat === "all" ? all[0] : wide ? list[0] : undefined) ?? null;
  const idx = current ? all.findIndex((d) => d.id === current.id) : -1;
  // Nouvelle fiche : la lecture reprend en haut du volet.
  useEffect(() => { readRef.current?.scrollTo({ top: 0 }); }, [current?.id]);

  const open = (d: DocArticle | null) => {
    setOpenSlug(d?.slug ?? null);
    writeDoc(d?.slug ?? null);
    if (!wide) window.scrollTo({ top: 0 });
  };
  const replace = (next: DocArticle[]) => { setDocs(next); put(key, next); };

  const total = all.length;
  const minutes = Math.max(1, Math.round(all.reduce((s, d) => s + d.body.split(/\s+/).filter(Boolean).length, 0) / 200));
  const lastUpdate = all.reduce<string | null>((m, d) => (!m || d.updatedAt > m ? d.updatedAt : m), null);

  const hero = (
    <section className="hz" style={{ fontFamily: FONT }}>
      <div style={{ minWidth: 0 }}>
        <h2 className="hz-title">
          {docs === null ? <span className="mute">…</span> : section === "kb" ? (
            <><span style={{ color: C.coral }}>{total} fiches</span> <span className="mute">pour chaque geste</span> du quotidien.</>
          ) : section === "manual" ? (
            <>Le manuel d'Ooble, <span style={{ color: C.sun }}>{total} chapitres</span><span className="mute">.</span></>
          ) : (
            <>Comment Ooble est <span style={{ color: C.vzIndigo }}>construit</span><span className="mute">, et comment le reprendre.</span></>
          )}
        </h2>
        <p className="hz-sub">
          {section === "kb" && "Des fiches courtes, une par tâche : traiter un achat, verser une vente, examiner une vérification, traiter une alerte. Cherchez un mot, ou touchez un thème."}
          {section === "manual" && <>La référence de fonctionnement pour la direction et l'équipe : produits, règles, parcours, conformité, incidents. {minutes} minutes de lecture.</>}
          {section === "tech" && "Architecture, base de données, fonctions serveur, secrets (noms et emplacements, jamais les valeurs), sauvegardes et publication. Réservé aux administrateurs."}
          {lastUpdate && <> Dernière mise à jour le {dayFmt.format(new Date(lastUpdate))}.</>}
        </p>
        {section !== "kb" && docs !== null && total > 0 && (
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={downloadPdf} disabled={pdf === "busy"} icon={<Download style={{ width: 15, height: 15 }} />}>
              {pdf === "busy" ? "Préparation du PDF…" : "Télécharger le PDF"}
            </Button>
            <span style={{ fontSize: 12.5, color: pdf === "error" ? C.coral : C.t3 }}>
              {pdf === "error" ? "Le PDF n'a pas pu être créé. Réessayez." : `Couverture, sommaire et ${total} ${meta.nounPlural}, prêt à imprimer.`}
            </span>
          </div>
        )}
      </div>
      {docs !== null && total > 0 && (
        <div style={{ minWidth: 0 }}>
          {section === "kb" && <Shelf groups={groups} active={cat} onPick={setCat} />}
          {section === "manual" && <ReadingRibbon docs={all} onOpen={open} />}
          {section === "tech" && <Layers />}
        </div>
      )}
    </section>
  );

  const listPane = (
    <nav className="dk-list" aria-label={`Liste des ${meta.nounPlural}`} style={{ minWidth: 0 }}>
      {list.length === 0 && docs !== null && (
        <p style={{ margin: 0, padding: "20px 12px", fontSize: 13.5, color: C.t3 }}>{needle ? `Aucun résultat pour « ${q} ».` : `Aucune ${meta.noun} pour l'instant.`}</p>
      )}
      {(section === "kb" ? groups.filter(([g]) => list.some((d) => d.category === g)).map(([g]) => g) : [null]).map((g) => (
        <div key={g ?? "all"} style={{ marginBottom: 14 }}>
          {g && <p style={{ margin: "0 12px 4px", fontSize: 12, color: C.t3 }}>{g}</p>}
          {list.filter((d) => !g || d.category === g).map((d) => {
            const n = all.indexOf(d) + 1;
            return (
              <button key={d.id} type="button" className="dk-item" aria-current={current?.id === d.id} onClick={() => open(d)}>
                {meta.numbered
                  ? <span className="dk-n" style={{ width: 20, fontSize: 12.5, color: C.t3, fontVariantNumeric: "tabular-nums", paddingTop: 1 }}>{String(n).padStart(2, "0")}</span>
                  : null}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="dk-t" style={{ display: "block", fontSize: 13.5, lineHeight: 1.4 }}>{d.title}</span>
                  {d.summary && <span style={{ marginTop: 2, fontSize: 12.5, color: C.t3, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{d.summary}</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const reader = current && (
    <article className="dk-read" ref={readRef}>
      {!wide && (
        <button type="button" onClick={() => open(null)} style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.t3, marginBottom: 16 }}>
          <ArrowLeft style={{ width: 15, height: 15 }} /> Toutes les {meta.nounPlural}
        </button>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>
            {meta.numbered ? `${meta.noun[0].toUpperCase()}${meta.noun.slice(1)} ${idx + 1}` : current.category} · {readingMinutes(current.body)} min de lecture
            {current.audience === "admin" && " · administrateurs"}
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: "clamp(26px, 2.6vw, 34px)", fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.12, textWrap: "balance" }}>{current.title}</h1>
          {current.summary && <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: C.t2, maxWidth: 640 }}>{current.summary}</p>}
        </div>
        {isAdmin && <Button size="sm" variant="ghost" icon={<Pencil style={{ width: 14, height: 14 }} />} onClick={() => setEditing({ doc: current })}>Modifier</Button>}
      </div>
      <div style={{ marginTop: 26 }}><Markdown source={current.body} /></div>
      <footer style={{ marginTop: 34, display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap", fontSize: 13 }}>
        {idx > 0 ? (
          <button type="button" onClick={() => open(all[idx - 1])} style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, color: C.t2, maxWidth: "48%" }}>
            <ArrowLeft style={{ width: 15, height: 15, flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{all[idx - 1].title}</span>
          </button>
        ) : <span />}
        {idx >= 0 && idx < all.length - 1 && (
          <button type="button" onClick={() => open(all[idx + 1])} style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, color: C.t1, maxWidth: "48%", marginLeft: "auto" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{all[idx + 1].title}</span><ArrowRight style={{ width: 15, height: 15, flexShrink: 0 }} />
          </button>
        )}
      </footer>
      <p style={{ margin: "18px 0 0", fontSize: 12, color: C.t3 }}>Mis à jour le {dayFmt.format(new Date(current.updatedAt))}.</p>
    </article>
  );

  return (
    <div>
      <style>{DOCS_CSS}</style>
      {/* Téléphone, une fiche ouverte : la lecture commence tout de suite, sans l'en-tête. */}
      {!(current && !wide) && hero}
      {error && <div style={{ marginBottom: 16 }}><Notice tone="err">Chargement impossible : {error}</Notice></div>}

      {!(current && !wide) && (
        <div className="dk-tools">
          <SearchField value={q} onChange={setQ} placeholder={`Chercher dans les ${meta.nounPlural}`} width={420} />
          {section === "kb" && cat !== "all" && (
            <button type="button" className="ui-btn" onClick={() => setCat("all")} aria-label={`Retirer le filtre ${cat}`}
              style={{ height: 34, padding: "0 10px 0 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: C.l2, color: C.t1, fontFamily: FONT, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              {cat} <X style={{ width: 14, height: 14, color: C.t3 }} />
            </button>
          )}
          {isAdmin && (
            <div style={{ marginLeft: "auto" }}>
              <Button icon={<Plus style={{ width: 15, height: 15 }} />} onClick={() => setEditing({ doc: null })}>{meta.newLabel}</Button>
            </div>
          )}
        </div>
      )}

      {docs === null ? (
        <p style={{ padding: "48px 0", textAlign: "center", fontSize: 13.5, color: C.t3 }}>Chargement…</p>
      ) : !wide ? (
        current ? reader : listPane
      ) : (
        <div className="dk-split">
          {listPane}
          {reader ?? (
            <div className="dk-read"><EmptyState icon={BookOpen} title={`Choisissez une ${meta.noun}`} text="Elle s'affiche ici." /></div>
          )}
        </div>
      )}

      {editing && (
        <Editor section={section} doc={editing.doc} position={(all.at(-1)?.position ?? 0) + 10}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            const next = editing.doc ? all.map((x) => (x.id === d.id ? d : x)) : [...all, d];
            replace(next.sort((a, b) => a.position - b.position));
            setEditing(null);
            open(d);
          }}
          onArchived={(id) => { replace(all.filter((x) => x.id !== id)); setEditing(null); open(null); }}
        />
      )}
    </div>
  );
}
