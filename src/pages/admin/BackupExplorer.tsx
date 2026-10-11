import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Database, Download, FileArchive,
  FileText, FolderOpen, Image as ImageIcon, LayoutGrid, Loader2, Lock, Search, ShieldCheck, Users, X,
} from "lucide-react";
import { C, FONT, ADMIN_THEME_CSS, ADMIN_BG, numeric } from "@/components/admin/adminTheme";
import ThemeToggle from "@/components/app/ThemeToggle";
import { BackupOpenError, openBackup, type BackupEntry, type OpenStep, type OpenedBackup } from "@/lib/backupOpen";
import { MAIN_TABLES, columnLabel, docInfo, formatValue, parseCsv, tableLabel } from "@/lib/backupLabels";

/*
 * Explorateur de sauvegarde (/admin/sauvegarde) : on choisit le fichier .gpg
 * téléchargé depuis GitHub, on tape la phrase secrète, et toute la sauvegarde
 * s'ouvre dans cette page : données en tableaux, pièces d'identité et
 * documents d'entreprise avec visionneuse. Rien n'est envoyé ; tout disparaît
 * en fermant la page.
 */

type View = { kind: "overview" } | { kind: "table"; name: string } | { kind: "docs"; owner: string | null };

interface Doc { entry: BackupEntry; url: string; kind: string; date: Date | null; owner: string | null; isImage: boolean; isPdf: boolean; name: string }
interface Table { name: string; columns: string[]; rows: string[][] }

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", pdf: "application/pdf" };
const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
const fmtSize = (b: number) =>
  b < 1024 ? `${b} o` : b < 1048576 ? `${Math.round(b / 1024)} Ko` : `${(b / 1048576).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} Mo`;
const fmtNum = (n: number) => n.toLocaleString("fr-CA");

function backupDate(stamp?: string): string | null {
  const m = stamp?.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" });
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}

// Thème du back-office (mêmes couleurs que /admin).
function useAdminTheme() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const style = document.createElement("style");
    style.textContent = ADMIN_THEME_CSS + EXPLORER_CSS;
    document.head.appendChild(style);
    const prev = [html.style.backgroundColor, document.body.style.backgroundColor];
    const sync = () => {
      const bg = html.classList.contains("dark") ? ADMIN_BG.dark : ADMIN_BG.light;
      html.style.backgroundColor = bg;
      document.body.style.backgroundColor = bg;
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => {
      obs.disconnect();
      style.remove();
      [html.style.backgroundColor, document.body.style.backgroundColor] = prev;
    };
  }, []);
}

const EXPLORER_CSS = `
@keyframes bx-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes bx-sheet { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes bx-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes spin { to { transform: rotate(360deg) } }
.bx-row:hover { background: var(--a-hover1) }
.bx-nav:hover { background: var(--a-hover1); color: var(--a-t1) }
.bx-tile:hover .bx-thumb { transform: scale(1.03) }
.bx-tile:focus-visible, .bx-nav:focus-visible, .bx-row:focus-visible, .bx-btn:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px }
@media (prefers-reduced-motion: reduce) { .bx-anim { animation: none !important } .bx-thumb { transition: none !important } }
`;

export default function BackupExplorer() {
  useAdminTheme();
  const [opened, setOpened] = useState<OpenedBackup | null>(null);

  return (
    <div className="admin-scope" style={{ background: C.bg, color: C.t1, minHeight: "100vh", fontFamily: FONT }}>
      {opened ? <Explorer backup={opened} onClose={() => setOpened(null)} /> : <Unlock onOpened={setOpened} />}
    </div>
  );
}

/* ───────────────────────────── Déverrouillage ───────────────────────────── */

const STEPS: { id: OpenStep; label: string }[] = [
  { id: "decrypt", label: "Déchiffrement avec votre phrase" },
  { id: "unzip", label: "Décompression" },
  { id: "verify", label: "Vérification de chaque fichier" },
];

function Unlock({ onOpened }: { onOpened: (b: OpenedBackup) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [phrase, setPhrase] = useState("");
  const [step, setStep] = useState<OpenStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = step !== null;

  const run = async () => {
    if (!file || !phrase || busy) return;
    setError(null);
    try {
      const r = await openBackup(file, phrase, setStep);
      setPhrase("");
      onOpened(r);
    } catch (e) {
      setError(e instanceof BackupOpenError ? e.message : "Ouverture impossible. Vérifiez que le fichier est complet, puis réessayez.");
      setStep(null);
    }
  };

  return (
    <>
      <TopBar title="Ouvrir une sauvegarde" />
      <main style={{ maxWidth: 440, margin: "0 auto", padding: "48px 20px 80px" }} className="bx-anim">
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.l2, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2 }}>
          <Lock style={{ width: 20, height: 20 }} strokeWidth={1.8} />
        </div>
        <h1 style={{ margin: "20px 0 8px", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", textWrap: "balance" }}>
          Ouvrir une sauvegarde
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: C.t2 }}>
          Choisissez un fichier <span style={{ color: C.t1 }}>ooble-backup-….gpg</span> téléchargé depuis GitHub, puis tapez votre phrase secrète.
          Tout s'ouvre dans cette page : rien n'est envoyé, et tout disparaît quand vous la fermez.
        </p>

        <input ref={input} type="file" style={{ display: "none" }} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
        <button type="button" className="bx-btn" onClick={() => input.current?.click()} disabled={busy}
          style={{
            marginTop: 28, width: "100%", display: "flex", alignItems: "center", gap: 14, textAlign: "left",
            padding: "16px 16px", borderRadius: 12, cursor: busy ? "default" : "pointer", fontFamily: FONT,
            background: file ? C.l1 : "transparent", border: `1px ${file ? "solid" : "dashed"} ${file ? C.bds : C.bd}`, color: C.t1,
          }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: C.l2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.t2 }}>
            <FileArchive style={{ width: 17, height: 17 }} strokeWidth={1.8} />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file ? file.name : "Choisir le fichier de sauvegarde"}
            </span>
            <span style={{ display: "block", fontSize: 12, color: C.t3, marginTop: 2 }}>
              {file ? fmtSize(file.size) : "Dans Fichiers, là où vous l'avez téléchargé"}
            </span>
          </span>
          {file && <span style={{ fontSize: 12, color: C.t3 }}>Changer</span>}
        </button>

        <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: C.t3 }}>Phrase secrète</span>
            <input type="password" value={phrase} onChange={(e) => setPhrase(e.target.value)} disabled={busy}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              style={{
                height: 48, padding: "0 14px", borderRadius: 12, fontSize: 16, fontFamily: FONT, outline: "none",
                background: "var(--a-inputBg)", border: `1px solid ${C.bd}`, color: C.t1,
              }} />
          </label>
          <button type="submit" className="bx-btn" disabled={!file || !phrase || busy}
            style={{
              height: 48, borderRadius: 12, border: "none", fontFamily: FONT, fontSize: 14, fontWeight: 500,
              background: C.accent, color: C.btnText, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: !file || !phrase ? 0.45 : 1, cursor: !file || !phrase || busy ? "default" : "pointer",
            }}>
            {busy ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Lock style={{ width: 15, height: 15 }} />}
            {busy ? "Ouverture…" : "Ouvrir"}
          </button>
        </form>

        {busy && (
          <ol style={{ listStyle: "none", margin: "24px 0 0", padding: 0, display: "grid", gap: 10 }}>
            {STEPS.map((s, i) => {
              const cur = STEPS.findIndex((x) => x.id === step);
              const done = i < cur;
              const now = i === cur;
              return (
                <li key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: done || now ? C.t1 : C.t3 }}>
                  <span style={{ width: 18, display: "flex", justifyContent: "center" }}>
                    {done ? <Check style={{ width: 15, height: 15, color: C.successText }} strokeWidth={2.4} />
                      : now ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                        : <span style={{ width: 6, height: 6, borderRadius: 9, background: C.bd }} />}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>
        )}

        {error && (
          <p role="alert" style={{ margin: "20px 0 0", fontSize: 13, lineHeight: 1.55, color: C.dangerText, display: "flex", gap: 8 }}>
            <X style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} /> {error}
          </p>
        )}
      </main>
    </>
  );
}

function TopBar({ title, children, onBack }: { title: string; children?: React.ReactNode; onBack?: () => void }) {
  const back = { width: 36, height: 36, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, flexShrink: 0 } as const;
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 20, height: 56, boxSizing: "content-box",
      display: "flex", alignItems: "center", gap: 10, padding: "0 12px", paddingTop: "env(safe-area-inset-top, 0px)",
      background: C.bg, borderBottom: `1px solid ${C.bds}`,
    }}>
      {onBack
        ? <button type="button" className="bx-nav" onClick={onBack} aria-label="Retour" style={{ ...back, background: "none", border: "none", cursor: "pointer" }}><ChevronLeft style={{ width: 20, height: 20 }} /></button>
        : <Link to="/admin?tab=platform" className="bx-nav" aria-label="Retour au back-office" style={back}><ArrowLeft style={{ width: 18, height: 18 }} /></Link>}
      <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
      {children}
      <ThemeToggle />
    </header>
  );
}

/* ───────────────────────────── Explorateur ───────────────────────────── */

function Explorer({ backup, onClose }: { backup: OpenedBackup; onClose: () => void }) {
  const narrow = useNarrow();
  const [view, setView] = useState<View | null>(narrow ? null : { kind: "overview" });
  const [viewer, setViewer] = useState<{ list: Doc[]; index: number } | null>(null);

  // Fichiers en liens locaux (blob:), libérés à la fermeture.
  const docs = useMemo<Doc[]>(() => backup.entries
    .filter((e) => e.path.startsWith("storage/"))
    .map((entry) => {
      const x = ext(entry.path);
      const info = docInfo(entry.path);
      return {
        entry, ...info, name: entry.path.split("/").pop() ?? entry.path,
        url: URL.createObjectURL(new Blob([entry.data as Uint8Array<ArrayBuffer>], { type: MIME[x] ?? "application/octet-stream" })),
        isImage: /^(jpe?g|png|webp|gif|heic)$/.test(x), isPdf: x === "pdf",
      };
    })
    .sort((a, b) => (a.owner ?? "").localeCompare(b.owner ?? "") || a.kind.localeCompare(b.kind)), [backup]);
  useEffect(() => () => docs.forEach((d) => URL.revokeObjectURL(d.url)), [docs]);

  const csvs = useMemo(() => new Map(backup.entries.filter((e) => /^lisible\/[^/]+\.csv$/.test(e.path))
    .map((e) => [e.path.slice(8, -4), e])), [backup]);
  const cache = useRef(new Map<string, Table>());
  const table = (name: string): Table | null => {
    if (cache.current.has(name)) return cache.current.get(name)!;
    const e = csvs.get(name);
    if (!e) return null;
    const [columns = [], ...rows] = parseCsv(new TextDecoder().decode(e.data));
    const t = { name, columns, rows };
    cache.current.set(name, t);
    return t;
  };

  // Nom des clients (pour les documents rangés par identifiant).
  const people = useMemo(() => {
    const map = new Map<string, { name: string; sub: string }>();
    const p = table("profiles");
    if (p) {
      const col = (c: string) => p.columns.indexOf(c);
      const [id, fn, em, bn] = [col("id"), col("full_name"), col("email"), col("business_name")];
      for (const r of p.rows) map.set(r[id], { name: r[bn] || r[fn] || r[em] || "Client", sub: r[em] || "" });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvs]);

  const counts: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = { ...(backup.manifest?.tables_after ?? {}) };
    for (const name of csvs.keys()) if (!(name in out)) out[name] = Math.max(0, (table(name)?.rows.length ?? 0));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backup, csvs]);

  const tableNames = useMemo(() => {
    const all = new Set([...Object.keys(counts), ...csvs.keys()]);
    const main = MAIN_TABLES.filter((t) => all.has(t));
    const rest = [...all].filter((t) => !(MAIN_TABLES as readonly string[]).includes(t)).sort((a, b) => tableLabel(a).localeCompare(tableLabel(b)));
    return { main, rest };
  }, [counts, csvs]);

  const owners = useMemo(() => {
    const m = new Map<string, number>();
    docs.forEach((d) => m.set(d.owner ?? "", (m.get(d.owner ?? "") ?? 0) + 1));
    return [...m.entries()].sort((a, b) => (people.get(a[0])?.name ?? a[0]).localeCompare(people.get(b[0])?.name ?? b[0]));
  }, [docs, people]);

  const intact = backup.mismatched.length === 0 && backup.missing.length === 0 && backup.checked > 0;
  const when = backupDate(backup.manifest?.created_utc);
  const go = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };

  const sidebar = (
    <nav aria-label="Contenu de la sauvegarde" style={{ padding: "12px 10px 40px", display: "grid", gap: 2 }}>
      <NavItem icon={LayoutGrid} label="Vue d'ensemble" on={view?.kind === "overview"} onClick={() => go({ kind: "overview" })} />
      <NavGroup label="Documents" />
      <NavItem icon={FolderOpen} label="Tous les documents" count={docs.length} on={view?.kind === "docs" && view.owner === null} onClick={() => go({ kind: "docs", owner: null })} />
      <NavGroup label="Données" />
      {csvs.size === 0 && <p style={{ margin: "4px 10px 8px", fontSize: 12, lineHeight: 1.5, color: C.t3 }}>Pas de tableaux lisibles dans cette sauvegarde (voir Vue d'ensemble).</p>}
      {tableNames.main.map((t) => (
        <NavItem key={t} icon={t === "auth_users" || t === "profiles" ? Users : Database} label={tableLabel(t)} count={counts[t]}
          disabled={!csvs.has(t)} on={view?.kind === "table" && view.name === t} onClick={() => go({ kind: "table", name: t })} />
      ))}
      {tableNames.rest.length > 0 && <NavGroup label="Autres tables" />}
      {tableNames.rest.map((t) => (
        <NavItem key={t} label={tableLabel(t)} count={counts[t]} disabled={!csvs.has(t)}
          on={view?.kind === "table" && view.name === t} onClick={() => go({ kind: "table", name: t })} />
      ))}
    </nav>
  );

  const title = !view ? "Sauvegarde" : view.kind === "overview" ? "Vue d'ensemble" : view.kind === "table" ? tableLabel(view.name)
    : view.owner ? people.get(view.owner)?.name ?? "Documents" : "Documents";

  const content = view && (
    <div key={JSON.stringify(view)} className="bx-anim" style={{ animation: "bx-in .22s ease" }}>
      {view.kind === "overview" && (
        <Overview when={when} intact={intact} backup={backup} counts={counts} docs={docs} owners={owners} people={people}
          hasCsv={csvs.size > 0} go={go} />
      )}
      {view.kind === "table" && <TableView key={view.name} table={table(view.name)} label={tableLabel(view.name)} people={people} />}
      {view.kind === "docs" && (
        <DocsView docs={view.owner === null ? docs : docs.filter((d) => (d.owner ?? "") === view.owner)} people={people}
          onOpen={(list, index) => setViewer({ list, index })} />
      )}
    </div>
  );

  return (
    <>
      <TopBar title={narrow && view ? title : when ? `Sauvegarde du ${when}` : "Sauvegarde"} onBack={narrow && view ? () => setView(null) : undefined}>
        <span title={intact ? "Empreintes vérifiées" : "Fichiers abîmés"} style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: narrow ? "7px" : "5px 10px", borderRadius: 99,
          background: intact ? C.successBg : C.dangerBg, color: intact ? C.successText : C.dangerText, flexShrink: 0,
        }}>
          <ShieldCheck style={{ width: 13, height: 13 }} /> {!narrow && (intact ? "Intacte" : "Fichiers abîmés")}
        </span>
        <button type="button" className="bx-btn" onClick={onClose}
          style={{ height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "none", color: C.t2, fontFamily: FONT, fontSize: 12.5, cursor: "pointer", flexShrink: 0 }}>
          Fermer
        </button>
      </TopBar>

      {narrow ? (
        <div>{view ? <div style={{ padding: "20px 16px 60px" }}>{content}</div> : sidebar}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "264px minmax(0, 1fr)", minHeight: "calc(100vh - 57px)" }}>
          <aside style={{ borderRight: `1px solid ${C.bds}`, position: "sticky", top: 57, alignSelf: "start", maxHeight: "calc(100vh - 57px)", overflowY: "auto" }}>
            {sidebar}
          </aside>
          <main style={{ padding: "28px 32px 80px", minWidth: 0 }}>{content}</main>
        </div>
      )}

      {viewer && <Viewer {...viewer} people={people} onIndex={(index) => setViewer({ ...viewer, index })} onClose={() => setViewer(null)} />}
    </>
  );
}

function NavGroup({ label }: { label: string }) {
  return <p style={{ margin: "18px 10px 6px", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.t3 }}>{label}</p>;
}

function NavItem({ icon: Icon, label, count, on, disabled, onClick }: {
  icon?: typeof Database; label: string; count?: number; on?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className="bx-nav" onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 36, padding: "7px 10px", borderRadius: 8,
        border: "none", textAlign: "left", fontFamily: FONT, fontSize: 13, cursor: disabled ? "default" : "pointer",
        background: on ? C.l2 : "transparent", color: disabled ? C.t3 : on ? C.t1 : C.t2, opacity: disabled ? 0.55 : 1,
      }}>
      {Icon ? <Icon style={{ width: 15, height: 15, flexShrink: 0, color: on ? C.t1 : C.t3 }} strokeWidth={1.8} /> : <span style={{ width: 15, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {count !== undefined && <span style={{ ...numeric, fontSize: 12, color: C.t3 }}>{fmtNum(count)}</span>}
    </button>
  );
}

/* ───────────────────────────── Vue d'ensemble ───────────────────────────── */

function Overview({ when, intact, backup, counts, docs, owners, people, hasCsv, go }: {
  when: string | null; intact: boolean; backup: OpenedBackup; counts: Record<string, number>; docs: Doc[];
  owners: [string, number][]; people: Map<string, { name: string; sub: string }>; hasCsv: boolean; go: (v: View) => void;
}) {
  const totalRows = Object.values(backup.manifest?.tables_after ?? counts).reduce((a, b) => a + b, 0);
  const stats: [string, number | string][] = [
    ["Clients", counts.profiles ?? 0],
    ["Commandes", counts.orders ?? 0],
    ["Documents", docs.length],
    ["Lignes au total", totalRows],
  ];
  const key = ["profiles", "orders", "kyc_verifications", "business_verifications", "compliance_alerts", "admin_audit_log"].filter((t) => t in counts);

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", textWrap: "balance" }}>
        {when ? `Sauvegarde du ${when}` : "Sauvegarde"}
      </h1>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: intact ? C.t2 : C.dangerText, display: "flex", gap: 8, alignItems: "flex-start" }}>
        {intact
          ? <><Check style={{ width: 16, height: 16, color: C.successText, flexShrink: 0, marginTop: 2 }} strokeWidth={2.4} />Phrase acceptée. Les {fmtNum(backup.checked)} fichiers sont intacts : leur empreinte correspond à celle prise au moment de la sauvegarde.</>
          : <><X style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />{backup.mismatched.length + backup.missing.length} fichier(s) ne correspondent pas : {[...backup.mismatched, ...backup.missing].slice(0, 3).join(", ")}.</>}
      </p>

      <dl style={{ margin: "28px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}` }}>
        {stats.map(([label, value], i) => (
          <div key={label} style={{ padding: "18px 0 18px", paddingLeft: i ? 20 : 0, borderLeft: i ? `1px solid ${C.bds}` : "none" }}>
            <dt style={{ fontSize: 12, color: C.t3 }}>{label}</dt>
            <dd style={{ ...numeric, margin: "6px 0 0", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>{typeof value === "number" ? fmtNum(value) : value}</dd>
          </div>
        ))}
      </dl>

      {!hasCsv && (
        <p style={{ margin: "24px 0 0", padding: "12px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.6, background: C.warnBg, color: C.warnText }}>
          Cette sauvegarde a été faite avant l'ajout des tableaux lisibles : les documents s'affichent, mais pas les données.
          Les sauvegardes suivantes (dès cette nuit) contiennent tout.
        </p>
      )}

      <section style={{ marginTop: 36 }}>
        <SectionTitle>Documents par client</SectionTitle>
        <List>
          {owners.map(([owner, n]) => {
            const p = people.get(owner);
            return (
              <ListRow key={owner || "autre"} onClick={() => go({ kind: "docs", owner })}
                title={p?.name ?? (owner ? `Client ${owner.slice(0, 8)}` : "Autres fichiers")} sub={p?.sub}
                right={`${n} document${n > 1 ? "s" : ""}`} />
            );
          })}
          {owners.length === 0 && <p style={{ margin: 0, padding: "14px 0", fontSize: 13, color: C.t3 }}>Aucun document.</p>}
        </List>
      </section>

      {hasCsv && (
        <section style={{ marginTop: 36 }}>
          <SectionTitle>Données principales</SectionTitle>
          <List>
            {key.map((t) => <ListRow key={t} onClick={() => go({ kind: "table", name: t })} title={tableLabel(t)} right={`${fmtNum(counts[t])} ligne${counts[t] > 1 ? "s" : ""}`} />)}
          </List>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500, color: C.t1 }}>{children}</h2>;
}
function List({ children }: { children: React.ReactNode }) {
  return <div style={{ borderTop: `1px solid ${C.bds}` }}>{children}</div>;
}
function ListRow({ title, sub, right, onClick }: { title: string; sub?: string; right?: string; onClick: () => void }) {
  return (
    <button type="button" className="bx-row" onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 6px", border: "none",
        borderBottom: `1px solid ${C.bds}`, background: "transparent", color: C.t1, fontFamily: FONT, textAlign: "left", cursor: "pointer",
      }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: C.t3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </span>
      {right && <span style={{ ...numeric, fontSize: 12.5, color: C.t3, flexShrink: 0 }}>{right}</span>}
      <ChevronRight style={{ width: 16, height: 16, color: C.t3, flexShrink: 0 }} />
    </button>
  );
}

/* ───────────────────────────── Tableaux ───────────────────────────── */

const PAGE = 100;

function TableView({ table, label, people }: { table: Table | null; label: string; people: Map<string, { name: string; sub: string }> }) {
  // Identifiant d'un client → son nom (la valeur exacte reste dans le détail).
  const cell = (col: string, raw: string) => (col === "user_id" && people.get(raw)?.name) || formatValue(raw);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [row, setRow] = useState<string[] | null>(null);

  const rows = useMemo(() => {
    if (!table) return [];
    const s = q.trim().toLowerCase();
    return s ? table.rows.filter((r) => r.some((c) => c.toLowerCase().includes(s))) : table.rows;
  }, [table, q]);

  if (!table) {
    return <p style={{ fontSize: 13.5, color: C.t3 }}>Cette table n'est pas lisible dans cette sauvegarde.</p>;
  }
  const cols = table.columns;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 16, justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>{label}</h1>
          <p style={{ ...numeric, margin: "4px 0 0", fontSize: 12.5, color: C.t3 }}>
            {q ? `${fmtNum(rows.length)} sur ${fmtNum(table.rows.length)} lignes` : `${fmtNum(table.rows.length)} ligne${table.rows.length > 1 ? "s" : ""}`} · {cols.length} colonnes
          </p>
        </div>
        <label style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search style={{ position: "absolute", left: 11, top: 11, width: 15, height: 15, color: C.t3 }} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Rechercher"
            style={{ width: "100%", height: 38, padding: "0 12px 0 34px", borderRadius: 9, border: `1px solid ${C.bd}`, background: "var(--a-inputBg)", color: C.t1, fontFamily: FONT, fontSize: 16, outline: "none", boxSizing: "border-box" }} />
        </label>
      </div>

      <div style={{ marginTop: 18, border: `1px solid ${C.bds}`, borderRadius: 10, overflow: "auto", maxHeight: "calc(100vh - 220px)" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} scope="col" style={{
                  position: "sticky", top: 0, zIndex: 1, background: C.l1, textAlign: "left", fontWeight: 400, color: C.t3,
                  padding: "10px 14px", borderBottom: `1px solid ${C.bds}`, whiteSpace: "nowrap",
                }}>{columnLabel(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r, i) => (
              <tr key={i} className="bx-row" onClick={() => setRow(r)} style={{ cursor: "pointer" }}>
                {cols.map((c, j) => (
                  <td key={c} style={{
                    ...numeric, padding: "9px 14px", borderBottom: `1px solid ${C.bds}`, whiteSpace: "nowrap",
                    maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", color: r[j] ? C.t1 : C.t3,
                  }}>{cell(c, r[j] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ margin: 0, padding: 24, textAlign: "center", fontSize: 13, color: C.t3 }}>{q ? "Aucun résultat." : "Table vide."}</p>}
      </div>
      {rows.length > shown && (
        <button type="button" className="bx-btn" onClick={() => setShown((n) => n + PAGE)}
          style={{ marginTop: 12, height: 36, padding: "0 14px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "none", color: C.t2, fontFamily: FONT, fontSize: 12.5, cursor: "pointer" }}>
          Afficher {Math.min(PAGE, rows.length - shown)} lignes de plus · {fmtNum(rows.length - shown)} restantes
        </button>
      )}

      {row && <RowSheet cols={cols} row={row} title={label} people={people} onClose={() => setRow(null)} />}
    </div>
  );
}

function RowSheet({ cols, row, title, people, onClose }: {
  cols: string[]; row: string[]; title: string; people: Map<string, { name: string; sub: string }>; onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="admin-scope" style={{ position: "fixed", inset: 0, zIndex: 60, fontFamily: FONT, color: C.t1 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: C.overlay, animation: "bx-fade .18s ease both" }} className="bx-anim" />
      <aside role="dialog" aria-label={title} className="bx-anim" style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: "min(460px, 100vw)", background: C.l1, boxShadow: C.panelShadow,
        display: "flex", flexDirection: "column", animation: "bx-sheet .22s cubic-bezier(.2,.8,.2,1) both",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 14px", borderBottom: `1px solid ${C.bds}` }}>
          <p style={{ margin: 0, flex: 1, fontSize: 14 }}>{title}</p>
          <button type="button" className="bx-btn" onClick={onClose} aria-label="Fermer" style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: C.l2, color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <dl style={{ margin: 0, padding: "4px 16px 32px", overflowY: "auto" }}>
          {cols.map((c, i) => {
            let v = formatValue(row[i] ?? "");
            if (/^[[{]/.test(row[i] ?? "")) { try { v = JSON.stringify(JSON.parse(row[i]), null, 2); } catch { /* texte brut */ } }
            if (c === "user_id" && people.has(row[i])) v = `${people.get(row[i])!.name}\n${row[i]}`;
            return (
              <div key={c} style={{ padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
                <dt style={{ fontSize: 11.5, color: C.t3 }}>{columnLabel(c)}</dt>
                <dd style={{ ...numeric, margin: "3px 0 0", fontSize: 13.5, color: row[i] ? C.t1 : C.t3, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{v}</dd>
              </div>
            );
          })}
        </dl>
      </aside>
    </div>,
    document.body,
  );
}

/* ───────────────────────────── Documents ───────────────────────────── */

function DocsView({ docs, people, onOpen }: { docs: Doc[]; people: Map<string, { name: string; sub: string }>; onOpen: (list: Doc[], index: number) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Doc[]>();
    docs.forEach((d) => m.set(d.owner ?? "", [...(m.get(d.owner ?? "") ?? []), d]));
    return [...m.entries()];
  }, [docs]);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>
        {groups.length === 1 && groups[0][0] ? people.get(groups[0][0])?.name ?? "Documents" : "Documents"}
      </h1>
      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.t3 }}>
        {docs.length} document{docs.length > 1 ? "s" : ""} · touchez pour l'ouvrir en grand
      </p>
      {groups.map(([owner, list]) => {
        const p = people.get(owner);
        return (
          <section key={owner || "autre"} style={{ marginTop: 28 }}>
            {groups.length > 1 && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12, minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p?.name ?? (owner ? `Client ${owner.slice(0, 8)}` : "Autres fichiers")}</h2>
                {p?.sub && <span style={{ fontSize: 12, color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.sub}</span>}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 168px), 1fr))", gap: 14 }}>
              {list.map((d) => (
                <button key={d.entry.path} type="button" className="bx-tile" onClick={() => onOpen(docs, docs.indexOf(d))}
                  style={{ padding: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer", fontFamily: FONT, color: C.t1, borderRadius: 10 }}>
                  <span style={{ display: "block", aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden", background: C.l2, border: `1px solid ${C.bds}` }}>
                    {d.isImage
                      ? <img className="bx-thumb" src={d.url} alt={d.kind} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .3s ease" }} />
                      : (
                        <span style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: C.t3 }}>
                          <FileText style={{ width: 28, height: 28 }} strokeWidth={1.5} />
                          <span style={{ fontSize: 11, letterSpacing: "0.08em" }}>{ext(d.name).toUpperCase()}</span>
                        </span>
                      )}
                  </span>
                  <span style={{ display: "block", marginTop: 8, fontSize: 12.5, lineHeight: 1.35 }}>{d.kind}</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 11.5, color: C.t3 }}>
                    {d.date ? d.date.toLocaleDateString("fr-CA", { dateStyle: "medium" }) : d.name} · {fmtSize(d.entry.size)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Viewer({ list, index, people, onIndex, onClose }: {
  list: Doc[]; index: number; people: Map<string, { name: string; sub: string }>; onIndex: (i: number) => void; onClose: () => void;
}) {
  const d = list[index];
  const prev = index > 0 ? () => onIndex(index - 1) : undefined;
  const next = index < list.length - 1 ? () => onIndex(index + 1) : undefined;
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev?.();
      if (e.key === "ArrowRight") next?.();
    };
    window.addEventListener("keydown", k);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = overflow; };
  });

  const owner = d.owner ? people.get(d.owner)?.name : null;
  const btn = { height: 36, padding: "0 12px", borderRadius: 9, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: FONT, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" } as const;
  const arrow = (side: "left" | "right") => ({ position: "absolute", top: "50%", [side]: 12, transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 99, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }) as React.CSSProperties;

  return createPortal(
    <div role="dialog" aria-label={d.kind} className="bx-anim admin-scope" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(8,8,10,0.96)", color: "#fff", display: "flex", flexDirection: "column", fontFamily: FONT, animation: "bx-fade .18s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(10px + env(safe-area-inset-top, 0px)) 12px 10px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.kind}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[owner, d.date?.toLocaleDateString("fr-CA", { dateStyle: "medium" }), `${index + 1} / ${list.length}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <a href={d.url} download={d.name} style={btn} className="bx-btn"><Download style={{ width: 14, height: 14 }} /><span className="hidden sm:inline">Télécharger</span></a>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{ ...btn, width: 36, padding: 0, justifyContent: "center" }} className="bx-btn"><X style={{ width: 17, height: 17 }} /></button>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px 16px" }}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (dx > 60) prev?.();
          if (dx < -60) next?.();
        }}>
        {d.isImage && <img key={d.url} src={d.url} alt={d.kind} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6, animation: "bx-fade .2s ease both" }} />}
        {d.isPdf && <PdfPages key={d.url} data={d.entry.data} />}
        {!d.isImage && !d.isPdf && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13.5 }}>
            <ImageIcon style={{ width: 32, height: 32, marginBottom: 10 }} strokeWidth={1.4} />
            <p style={{ margin: 0 }}>Aperçu impossible pour ce type de fichier : utilisez « Télécharger ».</p>
          </div>
        )}
        {prev && <button type="button" aria-label="Précédent" onClick={prev} style={arrow("left")} className="bx-btn"><ChevronLeft style={{ width: 22, height: 22 }} /></button>}
        {next && <button type="button" aria-label="Suivant" onClick={next} style={arrow("right")} className="bx-btn"><ChevronRight style={{ width: 22, height: 22 }} /></button>}
      </div>
    </div>,
    document.body,
  );
}

// PDF affiché page par page dans la visionneuse (fiable sur iPad, contrairement à un cadre).
// Version « legacy » de pdf.js : elle inclut les compléments JavaScript qui manquent à Safari.
function PdfPages({ data }: { data: Uint8Array }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ data: data.slice() });
        destroy = () => { task.destroy(); };
        const doc = await task.promise;
        const el = box.current;
        if (!el || cancelled) return;
        el.replaceChildren();
        const width = Math.min(el.clientWidth - 8, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          Object.assign(canvas.style, { width: `${width}px`, height: `${viewport.height / dpr}px`, background: "#fff", borderRadius: "4px", display: "block" });
          el.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (i === 1) setState("ok");
        }
      } catch (e) {
        console.warn("Aperçu PDF impossible", e);
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; destroy?.(); };
  }, [data]);

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      {state === "loading" && <p style={{ textAlign: "center", marginTop: 40, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Ouverture du PDF…</p>}
      {state === "error" && <p style={{ textAlign: "center", marginTop: 40, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Aperçu impossible : utilisez « Télécharger ».</p>}
      <div ref={box} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 24 }} />
    </div>
  );
}
