import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, DatabaseBackup, KeyRound, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C, FONT, btnGhost, card, cardHeaderRow, cardTitle, cardSubtitle, listRowStyle, numeric } from "@/components/admin/adminTheme";
import { Link } from "react-router-dom";
import { TABLE_LABELS } from "@/lib/backupLabels";

/*
 * Sauvegardes nocturnes (workflow GitHub « Sauvegarde nocturne ») :
 * base de données + fichiers KYC, chiffrés, restauration testée à chaque
 * fois. Le workflow écrit une ligne dans backup_runs ; on l'affiche ici.
 */

interface Run {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  db_bytes: number | null;
  files_count: number | null;
  files_bytes: number | null;
  archive_bytes: number | null;
  tables: Record<string, number> | null;
  restore_ok: boolean | null;
  restore_detail: string | null;
  location: string | null;
  run_url: string | null;
  error: string | null;
}

const mb = (b: number | null) => (b == null ? "—" : `${(b / 1048576).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} Mo`);
const when = (s: string) => new Date(s).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

function ago(s: string): string {
  const h = (Date.now() - new Date(s).getTime()) / 3600000;
  if (h < 1) return "il y a moins d'une heure";
  if (h < 48) return `il y a ${Math.round(h)} h`;
  return `il y a ${Math.round(h / 24)} jours`;
}

export default function BackupsCard() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("backup_runs" as never).select("*").order("started_at", { ascending: false }).limit(10)
      .then(({ data }) => setRuns(((data ?? []) as unknown) as Run[]));
  }, []);

  const lastOk = runs?.find((r) => r.status === "success");
  const stale = !lastOk || Date.now() - new Date(lastOk.finished_at ?? lastOk.started_at).getTime() > 36 * 3600000;
  const tone = !runs ? null : !lastOk ? "warn" : stale ? "danger" : "ok";

  return (
    <div style={{ ...card, fontFamily: FONT }}>
      <div style={cardHeaderRow}>
        <div>
          <p style={cardTitle}>Sauvegardes</p>
          <p style={cardSubtitle}>Chaque nuit à 3 h 17 : base de données et pièces d'identité, chiffrées, restauration testée.</p>
        </div>
        <DatabaseBackup style={{ width: 16, height: 16, color: C.t3 }} strokeWidth={1.8} />
      </div>

      {tone && (
        <div style={{
          margin: 16, padding: "12px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          display: "flex", gap: 10, alignItems: "flex-start",
          background: tone === "ok" ? C.successBg : tone === "warn" ? C.warnBg : C.dangerBg,
          border: `1px solid ${tone === "ok" ? C.successBd : tone === "warn" ? C.warnBd : C.dangerBd}`,
          color: tone === "ok" ? C.successText : tone === "warn" ? C.warnText : C.dangerText,
        }}>
          {tone === "ok"
            ? <Check style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} strokeWidth={2.2} />
            : <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} strokeWidth={2} />}
          <span>
            {tone === "ok" && lastOk && <>Dernière sauvegarde réussie {ago(lastOk.finished_at ?? lastOk.started_at)}, {mb(lastOk.archive_bytes)} chiffrés. {lastOk.restore_detail}</>}
            {tone === "warn" && <>Aucune sauvegarde réussie pour l'instant. Ajoutez le secret GitHub <b>BACKUP_PASSPHRASE</b> (guide <b>docs/SAUVEGARDES.md</b>), puis lancez la première sauvegarde.</>}
            {tone === "danger" && lastOk && <>La dernière sauvegarde réussie date de {when(lastOk.finished_at ?? lastOk.started_at)}. Vérifiez le dernier échec ci-dessous.</>}
          </span>
        </div>
      )}

      {lastOk && (
        <div style={{ margin: "0 16px 16px" }}>
          <Link to="/admin/sauvegarde" style={{ ...btnGhost, width: "100%", justifyContent: "center", height: 40, textDecoration: "none", boxSizing: "border-box" }}>
            <KeyRound style={{ width: 14, height: 14 }} /> Ouvrir une sauvegarde
          </Link>
        </div>
      )}

      {!runs && (
        <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 8, color: C.t3, fontSize: 13 }}>
          <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Chargement…
        </div>
      )}

      {runs && runs.length > 0 && (
        <div>
          {runs.map((r, i) => {
            const tables = r.tables ? Object.entries(r.tables).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
            const isOpen = open === r.id && tables.length > 0;
            return (
              <div key={r.id}>
                <div
                  onClick={() => tables.length && setOpen(isOpen ? null : r.id)}
                  style={{ ...listRowStyle(i === runs.length - 1 && !isOpen), display: "flex", alignItems: "center", gap: 12, cursor: tables.length ? "pointer" : "default" }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: r.status === "success" ? C.successBg : r.status === "failed" ? C.dangerBg : C.l3,
                    color: r.status === "success" ? C.successText : r.status === "failed" ? C.dangerText : C.t3,
                  }}>
                    {r.status === "success" ? <Check style={{ width: 12, height: 12 }} strokeWidth={2.6} />
                      : r.status === "failed" ? <X style={{ width: 12, height: 12 }} strokeWidth={2.6} />
                        : <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, color: C.t1 }}>
                      {when(r.started_at)}
                      <span style={{ color: C.t3 }}> · {r.status === "success" ? "Réussie" : r.status === "failed" ? "Échec" : "En cours"}</span>
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: r.status === "failed" ? C.dangerText : C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.status === "failed" ? (r.restore_detail ?? r.error ?? "Échec") : `${mb(r.archive_bytes)} · ${r.files_count ?? 0} fichiers${r.restore_ok ? " · restauration vérifiée" : ""}`}
                    </p>
                  </div>
                  {tables.length > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.t3, flexShrink: 0 }}>
                      Contenu
                      <ChevronDown style={{ width: 14, height: 14, transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "none" }} />
                    </span>
                  )}
                </div>
                {isOpen && (
                  <div style={{ padding: "4px 18px 14px 54px", borderBottom: i === runs.length - 1 ? "none" : `1px solid ${C.bds}` }}>
                    <p style={{ margin: "0 0 8px", fontSize: 11.5, color: C.t3 }}>
                      {tables.length} tables · {tables.reduce((n, [, c]) => n + c, 0).toLocaleString("fr-CA")} lignes · {r.files_count ?? 0} fichiers ({mb(r.files_bytes)}) : pièces d'identité et documents
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", columnGap: 24 }}>
                      {tables.map(([name, n]) => (
                        <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 12.5 }}>
                          <span style={{ color: TABLE_LABELS[name] ? C.t1 : C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
                            {TABLE_LABELS[name] ?? name}
                          </span>
                          <span style={{ ...numeric, color: n ? C.t1 : C.t3, flexShrink: 0 }}>{n.toLocaleString("fr-CA")}</span>
                        </div>
                      ))}
                    </div>
                    {r.run_url && (
                      <a href={r.run_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 11.5, color: C.t3, textDecoration: "underline" }}>
                        Détail technique sur GitHub
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
