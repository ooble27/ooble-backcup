import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PdfPages from "@/components/admin/PdfPages";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Database, Download, FileArchive,
  FileText, FolderOpen, Image as ImageIcon, LayoutGrid, Loader2, Lock, Search, ShieldCheck, Users, X,
} from "lucide-react";
import { C, FONT, ADMIN_THEME_CSS, ADMIN_BG, numeric } from "@/components/admin/adminTheme";
import ThemeToggle from "@/components/app/ThemeToggle";
import { BackupOpenError, openBackup, type BackupEntry, type OpenStep, type OpenedBackup } from "@/lib/backupOpen";
import { MAIN_TABLES, columnLabel, docInfo, formatValue, parseCsv, tableLabel } from "@/lib/backupLabels";
import { useNoZoom } from "@/lib/noZoom";
import { readCopySql, readPgDump, type DumpTable } from "@/lib/pgDump";
import { exportBackup, type ExportTable } from "@/lib/backupExport";

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
.bx-side { transition: color .2s }
.bx-side:hover:not(:disabled) { color: var(--a-t1) !important; background: transparent !important }
.bx-tx { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .4s cubic-bezier(.22,1,.36,1) }
.bx-side:hover:not(:disabled) .bx-tx, .bx-side[aria-current="page"] .bx-tx { background-size: 100% 1.5px }
.bx-ic { transition: background .25s, color .2s, transform .3s cubic-bezier(.22,1,.36,1) }
.bx-side:hover:not(:disabled) .bx-ic { transform: scale(1.1) }
@media (max-width: 767px) { .a-veil { background: transparent !important; } }
@keyframes spin { to { transform: rotate(360deg) } }

.bx-nav:hover { color: var(--a-t1) }
.bx-tile:hover .bx-thumb { transform: scale(1.03) }
.bx-tile:focus-visible, .bx-nav:focus-visible, .bx-row:focus-visible, .bx-btn:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px }
@media (prefers-reduced-motion: reduce) { .bx-anim { animation: none !important } .bx-thumb { transition: none !important } }
`;

export default function BackupExplorer() {
  useAdminTheme();
  useNoZoom();
  const [opened, setOpened] = useState<OpenedBackup | null>(null);

  return (
    <div className="admin-scope" style={{ background: C.bg, color: C.t1, minHeight: "100vh", fontFamily: FONT, overflowX: "clip" }}>
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
        <a href="https://github.com/ooble27/Ooble-/releases" target="_blank" rel="noopener noreferrer" className="bx-btn"
          style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>
          Où trouver les sauvegardes : GitHub › Ooble- › Releases (connecté à votre compte)
        </a>

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
                        : null}
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

function TopBar({ title, children, onBack, bg }: { title: string; children?: React.ReactNode; onBack?: () => void; bg?: string }) {
  const back = { width: 36, height: 36, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, flexShrink: 0 } as const;
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 20, height: 56, boxSizing: "content-box",
      display: "flex", alignItems: "center", gap: 10, padding: "0 12px", paddingTop: "var(--a-top, env(safe-area-inset-top, 0px))",
      background: bg ?? C.bg,
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
  // Sauvegarde sans export lisible (ou table absente de l'export) : les tables sont relues dans la base
  // sauvegardée elle-même (db/public.dump), et les comptes dans db/auth-data.sql (sans mots de passe).
  const [dump, setDump] = useState<Map<string, DumpTable> | null>(null);
  const [dumpState, setDumpState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    const names = Object.keys(backup.manifest?.tables_after ?? {});
    const missing = names.some((n) => !csvs.has(n)) || !csvs.has("auth_users") || names.length === 0;
    const pub = backup.entries.find((e) => e.path === "db/public.dump");
    if (!missing || !pub) return;
    let alive = true;
    setDumpState("loading");
    (async () => {
      try {
        const m = await readPgDump(pub.data);
        const auth = backup.entries.find((e) => e.path === "db/auth-data.sql");
        if (auth && !csvs.has("auth_users")) {
          const u = readCopySql(new TextDecoder().decode(auth.data), "auth.users");
          if (u) m.set("auth_users", { ...u, name: "auth_users" });
        }
        if (alive) { setDump(m); setDumpState("ready"); }
      } catch {
        if (alive) setDumpState("error");
      }
    })();
    return () => { alive = false; };
  }, [backup, csvs]);

  const cache = useRef(new Map<string, Table>());
  const table = (name: string): Table | null => {
    if (cache.current.has(name)) return cache.current.get(name)!;
    const e = csvs.get(name);
    if (!e) {
      const d = dump?.get(name);
      if (!d) return null;
      const t = { name, columns: d.columns, rows: d.rows };
      cache.current.set(name, t);
      return t;
    }
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
  }, [csvs, dump]);

  const counts: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = { ...(backup.manifest?.tables_after ?? {}) };
    for (const name of csvs.keys()) if (!(name in out)) out[name] = Math.max(0, (table(name)?.rows.length ?? 0));
    if (dump) for (const [name, d] of dump) if (!(name in out)) out[name] = d.rows.length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backup, csvs, dump]);

  const tableNames = useMemo(() => {
    const all = new Set([...Object.keys(counts), ...csvs.keys(), ...(dump?.keys() ?? [])]);
    const main = MAIN_TABLES.filter((t) => all.has(t));
    const rest = [...all].filter((t) => !(MAIN_TABLES as readonly string[]).includes(t)).sort((a, b) => tableLabel(a).localeCompare(tableLabel(b)));
    return { main, rest };
  }, [counts, csvs, dump]);

  const owners = useMemo(() => {
    const m = new Map<string, number>();
    docs.forEach((d) => m.set(d.owner ?? "", (m.get(d.owner ?? "") ?? 0) + 1));
    return [...m.entries()].sort((a, b) => (people.get(a[0])?.name ?? a[0]).localeCompare(people.get(b[0])?.name ?? b[0]));
  }, [docs, people]);

  const intact = backup.mismatched.length === 0 && backup.missing.length === 0 && backup.checked > 0;
  const when = backupDate(backup.manifest?.created_utc);
  const mainRef = useRef<HTMLElement | null>(null);
  const go = (v: View) => { setView(v); window.scrollTo({ top: 0 }); mainRef.current?.scrollTo({ top: 0 }); };

  const doExport = async () => {
    const tables = [...tableNames.main, ...tableNames.rest]
      .map((n) => { const t = table(n); return t ? { name: n, label: tableLabel(n), columns: t.columns, rows: t.rows } : null; })
      .filter((t): t is ExportTable => !!t);
    const files = docs.map((d) => ({
      path: d.entry.path, data: d.entry.data, owner: d.owner, kind: d.kind, date: d.date,
      ownerName: d.owner ? people.get(d.owner)?.name ?? `Client ${d.owner.slice(0, 8)}` : "Autres fichiers",
    }));
    // Registres de conformité tels qu'au jour de la sauvegarde : le registre et, à part, le détail des entrées.
    const [{ registersFromBackup }, { buildRegisterPdf, REGISTER_TITLES }, { RECORD_RETENTION_YEARS }] = await Promise.all([
      import("@/lib/backupRegisters"), import("@/lib/registerPdf"), import("@/lib/compliance"),
    ]);
    const registers: { name: string; data: Uint8Array }[] = [];
    for (const { kind, rows } of registersFromBackup(table)) {
      const title = REGISTER_TITLES[kind];
      registers.push({ name: title, data: await buildRegisterPdf({ kind, rows, retentionYears: RECORD_RETENTION_YEARS, part: "index" }) });
      if (rows.length) registers.push({ name: `${title} - détail des entrées`, data: await buildRegisterPdf({ kind, rows, retentionYears: RECORD_RETENTION_YEARS, part: "detail" }) });
    }
    const blob = await exportBackup(when ?? "", backup.manifest?.created_utc ?? new Date().toISOString().slice(0, 10), tables, files, registers);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ooble-sauvegarde-${backup.manifest?.created_utc ?? "export"}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  };

  const sidebar = (
    <nav aria-label="Contenu de la sauvegarde" style={{ padding: "12px 10px 40px", display: "grid", gap: 2 }}>
      <NavItem icon={LayoutGrid} label="Vue d'ensemble" on={view?.kind === "overview"} onClick={() => go({ kind: "overview" })} />
      <NavGroup label="Documents" />
      <NavItem icon={FolderOpen} label="Tous les documents" count={docs.length} on={view?.kind === "docs" && view.owner === null} onClick={() => go({ kind: "docs", owner: null })} />
      <NavGroup label="Données" />
      {dumpState === "loading" && <p style={{ margin: "4px 10px 8px", fontSize: 12, lineHeight: 1.5, color: C.t3, display: "flex", gap: 6, alignItems: "center" }}><Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />Lecture de la base sauvegardée…</p>}
      {dumpState === "error" && csvs.size === 0 && <p style={{ margin: "4px 10px 8px", fontSize: 12, lineHeight: 1.5, color: C.t3 }}>Base illisible dans le navigateur : restauration nécessaire (voir Vue d'ensemble).</p>}
      {tableNames.main.map((t) => (
        <NavItem key={t} icon={t === "auth_users" || t === "profiles" ? Users : Database} label={tableLabel(t)} count={counts[t]}
          disabled={!csvs.has(t) && !dump?.has(t)} on={view?.kind === "table" && view.name === t} onClick={() => go({ kind: "table", name: t })} />
      ))}
      {tableNames.rest.length > 0 && <NavGroup label="Autres tables" />}
      {tableNames.rest.map((t) => (
        <NavItem key={t} label={tableLabel(t)} count={counts[t]} disabled={!csvs.has(t) && !dump?.has(t)}
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
          hasCsv={csvs.size > 0 || !!dump?.size} go={go} onExport={doExport} />
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
      {narrow ? (
        <>
        <TopBar bg={narrow ? C.bg : C.ground} title={narrow && view ? title : when ? `Sauvegarde du ${when}` : "Sauvegarde"} onBack={narrow && view ? () => setView(null) : undefined}>
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
        <div>{view ? <div style={{ padding: "20px 16px 60px" }}>{content}</div> : sidebar}</div>
        </>
      ) : (
        // Comme le back-office : l'écran est fixe (il ne défile pas, ne rebondit pas) ; la colonne
        // défile sur le fond, le contenu défile dans son écrin arrondi, bordé tout autour.
        // Aucune bande en travers : le nom de la sauvegarde est en tête de la colonne, et l'écrin
        // commence en haut de l'écran avec la même marge et la même bordure que celui du back-office.
        <div style={{ position: "fixed", inset: 0, display: "grid", gridTemplateColumns: "264px minmax(0, 1fr)", background: C.ground, overflow: "hidden", overscrollBehavior: "none" }}>
          <aside style={{ overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", minWidth: 0, minHeight: 0, paddingTop: "var(--a-top, env(safe-area-inset-top, 0px))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 12px 4px" }}>
              <Link to="/admin?tab=platform" className="bx-nav" aria-label="Retour au back-office" title="Retour au back-office"
                style={{ width: 34, height: 34, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, flexShrink: 0 }}>
                <ArrowLeft style={{ width: 17, height: 17 }} />
              </Link>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>Sauvegarde</p>
                {when && <p style={{ margin: "1px 0 0", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{when}</p>}
              </div>
            </div>
            <span title={intact ? "Empreintes vérifiées" : "Fichiers abîmés"} style={{
              display: "inline-flex", alignItems: "center", gap: 6, margin: "8px 0 0 20px", fontSize: 12, padding: "4px 10px", borderRadius: 99,
              background: intact ? C.successBg : C.dangerBg, color: intact ? C.successText : C.dangerText,
            }}>
              <ShieldCheck style={{ width: 13, height: 13 }} /> {intact ? "Intacte" : "Fichiers abîmés"}
            </span>
            {sidebar}
          </aside>
          <div style={{ minWidth: 0, minHeight: 0, padding: "calc(8px + var(--a-top, env(safe-area-inset-top, 0px))) 8px calc(8px + env(safe-area-inset-bottom, 0px)) 1px" }}>
            <main ref={mainRef} style={{ height: "100%", boxSizing: "border-box", overflowY: "auto", overscrollBehavior: "contain", minWidth: 0, borderRadius: 16, background: C.bg, boxShadow: `0 0 0 1px ${C.bds}, 0 1px 3px rgba(0,0,0,.06)` }}>
              {/* L'en-tête défile avec le contenu : rien ne passe au-dessus de l'écrin. */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 0 32px" }}>
                <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 13, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                <button type="button" className="bx-btn" onClick={onClose}
                  style={{ height: 34, padding: "0 14px", borderRadius: 99, border: "none", background: C.hover2, color: C.t1, fontFamily: FONT, fontSize: 12.5, cursor: "pointer", flexShrink: 0 }}>
                  Fermer
                </button>
              </div>
              <div style={{ padding: "12px 32px 80px" }}>{content}</div>
            </main>
          </div>
        </div>
      )}

      {viewer && <Viewer {...viewer} people={people} onIndex={(index) => setViewer({ ...viewer, index })} onClose={() => setViewer(null)} />}
    </>
  );
}

function NavGroup({ label }: { label: string }) {
  return <p style={{ margin: "20px 10px 6px", fontSize: 10.5, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.t3 }}>{label}</p>;
}

function NavItem({ icon: Icon, label, count, on, disabled, onClick }: {
  icon?: typeof Database; label: string; count?: number; on?: boolean; disabled?: boolean; onClick: () => void;
}) {
  // Même langage que la barre latérale du back-office : rond plein pour la page ouverte, nom souligné.
  return (
    <button type="button" className="bx-nav bx-side" onClick={onClick} disabled={disabled} aria-current={on ? "page" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0, minHeight: 38, padding: "3px 10px 3px 6px", borderRadius: 10,
        border: "none", textAlign: "left", fontFamily: FONT, fontSize: 13.5, letterSpacing: "-0.01em", cursor: disabled ? "default" : "pointer",
        background: "transparent", color: disabled ? C.t3 : on ? C.t1 : C.t2, fontWeight: on ? 500 : 400, opacity: disabled ? 0.55 : 1,
      }}>
      <span className="bx-ic" style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? C.t1 : "transparent", color: on ? C.bg : C.t3 }}>
        {Icon ? <Icon style={{ width: 15, height: 15 }} strokeWidth={on ? 1.9 : 1.6} /> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "4px 0" }}><span className="bx-tx">{label}</span></span>
      {count !== undefined && <span style={{ ...numeric, fontSize: 12, color: C.t3, flexShrink: 0 }}>{fmtNum(count)}</span>}
    </button>
  );
}

/* ───────────────────────────── Vue d'ensemble ───────────────────────────── */

function Overview({ when, intact, backup, counts, docs, owners, people, hasCsv, go, onExport }: {
  when: string | null; intact: boolean; backup: OpenedBackup; counts: Record<string, number>; docs: Doc[];
  owners: [string, number][]; people: Map<string, { name: string; sub: string }>; hasCsv: boolean; go: (v: View) => void;
  onExport: () => Promise<void>;
}) {
  const [exporting, setExporting] = useState<"idle" | "busy" | "done" | "error">("idle");
  const runExport = async () => {
    setExporting("busy");
    try { await onExport(); setExporting("done"); } catch { setExporting("error"); }
  };
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

      <dl style={{ margin: "28px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {stats.map(([label, value]) => (
          <div key={label} style={{ padding: "16px 18px", borderRadius: 16, background: C.l1, boxShadow: `0 0 0 1px ${C.bds}` }}>
            <dt style={{ fontSize: 12, color: C.t3 }}>{label}</dt>
            <dd style={{ ...numeric, margin: "6px 0 0", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>{typeof value === "number" ? fmtNum(value) : value}</dd>
          </div>
        ))}
      </dl>

      {!hasCsv && (
        <p style={{ margin: "24px 0 0", padding: "12px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.6, background: C.warnBg, color: C.warnText }}>
          Lecture de la base sauvegardée… Si les tableaux restent grisés, cette sauvegarde doit être restaurée pour lire ses données
          (les documents, eux, s'affichent). Les sauvegardes récentes contiennent aussi des tableaux lisibles directement.
        </p>
      )}

      <section style={{ marginTop: 36 }}>
        {/* Pour un organisme (CANAFE, auditeur) : un dossier lisible partout, sans la plateforme. */}
        <div style={{ margin: "0 0 32px", padding: "18px 20px", borderRadius: 16, background: C.l1, boxShadow: `0 0 0 1px ${C.bds}`, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 500 }}>Exporter pour un organisme</p>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>
              Un dossier ZIP qui s'ouvre partout : sommaire PDF, registres de conformité en PDF (registre et détail des entrées), chaque table en CSV (Excel) et les documents rangés par client.
              Il n'est pas chiffré : transmettez-le uniquement par un canal sûr.
            </p>
            {exporting === "error" && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.dangerText }}>L'export n'a pas abouti. Réessayez.</p>}
          </div>
          <button type="button" className="bx-btn" onClick={runExport} disabled={exporting === "busy"}
            style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: C.t1, color: C.bg, fontFamily: FONT, fontSize: 13.5, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {exporting === "busy" ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : exporting === "done" ? <Check style={{ width: 15, height: 15 }} /> : <FileArchive style={{ width: 15, height: 15 }} />}
            {exporting === "busy" ? "Préparation…" : exporting === "done" ? "Téléchargé" : "Exporter (ZIP)"}
          </button>
        </div>

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
  return <div>{children}</div>;
}
function ListRow({ title, sub, right, onClick }: { title: string; sub?: string; right?: string; onClick: () => void }) {
  return (
    <button type="button" className="bx-row ui-lift" onClick={onClick}
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
  // Toutes les lignes, au fil du défilement : la suite se charge seule quand on arrive en bas.
  const box = useRef<HTMLDivElement | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setShown((n) => n + PAGE * 2); }, { root: box.current, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [table]);
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

      <div ref={box} style={{ marginTop: 18, borderRadius: 14, background: C.l1, boxShadow: `0 0 0 1px ${C.bds}`, overflow: "auto", maxHeight: "calc(100vh - 220px)" }}>
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
              <tr key={i} className="bx-row ui-row" tabIndex={0} onClick={() => setRow(r)} style={{ cursor: "pointer" }}>
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
        <div ref={end} aria-hidden style={{ height: 1 }} />
      </div>
      {rows.length > shown && (
        <button type="button" className="bx-btn" onClick={() => setShown(rows.length)}
          style={{ marginTop: 12, height: 36, padding: "0 14px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "none", color: C.t2, fontFamily: FONT, fontSize: 12.5, cursor: "pointer" }}>
          Tout afficher · {fmtNum(rows.length - shown)} lignes restantes
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
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: C.overlay, animation: "bx-fade .18s ease both" }} className="bx-anim a-veil" />
      <aside role="dialog" aria-label={title} className="bx-anim" style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: "min(460px, 100vw)", background: C.l1, boxShadow: C.panelShadow,
        display: "flex", flexDirection: "column", animation: "bx-sheet .22s cubic-bezier(.2,.8,.2,1) both",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + var(--a-top, env(safe-area-inset-top, 0px))) 16px 14px", borderBottom: `1px solid ${C.bds}` }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(10px + var(--a-top, env(safe-area-inset-top, 0px))) 12px 10px" }}>
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
