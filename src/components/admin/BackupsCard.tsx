import { useEffect, useState } from "react";
import { AlertTriangle, Check, DatabaseBackup, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C, FONT, card, cardHeaderRow, cardTitle, cardSubtitle, listRowStyle } from "@/components/admin/adminTheme";

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

      {!runs && (
        <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 8, color: C.t3, fontSize: 13 }}>
          <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Chargement…
        </div>
      )}

      {runs && runs.length > 0 && (
        <div>
          {runs.map((r, i) => (
            <div key={r.id} style={{ ...listRowStyle(i === runs.length - 1), display: "flex", alignItems: "center", gap: 12 }}>
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
              {r.run_url && (
                <a href={r.run_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: C.t3, textDecoration: "underline", flexShrink: 0 }}>
                  Détail
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
