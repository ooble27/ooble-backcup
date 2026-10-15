import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import { peek } from "@/lib/adminCache";
import { loadBackupRuns } from "@/lib/adminData";
import { TABLE_LABELS } from "@/lib/backupLabels";
import { C } from "./adminTheme";
import { Notice, SidePanel } from "./ui";
import { EmptyState, KeyValues, Pill, Section } from "./layout";

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

const mb = (b: number | null) => (b == null ? "N/D" : `${(b / 1048576).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} Mo`);
const when = (s: string) => new Date(s).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

function ago(s: string): string {
  const h = (Date.now() - new Date(s).getTime()) / 3600000;
  if (h < 1) return "il y a moins d'une heure";
  if (h < 48) return `il y a ${Math.round(h)} h`;
  return `il y a ${Math.round(h / 24)} jours`;
}

const STATUS = {
  success: { label: "Réussie", tone: "ok" },
  failed: { label: "Échec", tone: "danger" },
  running: { label: "En cours", tone: "info" },
} as const;

/** `bare` : sans titre ni description (la page qui l'accueille les donne). */
export default function BackupsCard({ bare }: { bare?: boolean } = {}) {
  const [runs, setRuns] = useState<Run[] | null>(() => peek<Run[]>("pf.backups")?.value ?? null);
  const [open, setOpen] = useState<Run | null>(null);

  useEffect(() => {
    void loadBackupRuns<Run>().then(setRuns);
  }, []);

  const lastOk = runs?.find((r) => r.status === "success");
  const stale = !lastOk || Date.now() - new Date(lastOk.finished_at ?? lastOk.started_at).getTime() > 36 * 3600000;

  // Une case par nuit sur les 30 derniers jours : la vue reste la même après 30 ou 3 000 nuits.
  const days = Array.from({ length: 30 }, (_, k) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (29 - k));
    const key = d.toDateString();
    const ofDay = (runs ?? []).filter((r) => new Date(r.started_at).toDateString() === key);
    const st = ofDay.some((r) => r.status === "success") ? "success" : ofDay.some((r) => r.status === "running") ? "running" : ofDay.length ? "failed" : "none";
    return { d, st, run: ofDay.find((r) => r.status === "success") ?? ofDay[0] };
  });
  const latest = runs?.[0];
  const okDays = days.filter((x) => x.st === "success").length;
  const failedLatest = latest && latest.status === "failed" ? latest : null;

  const tables = open?.tables ? Object.entries(open.tables).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];

  return (
    <Section
      title={bare ? undefined : "Sauvegardes"}
      description={bare ? undefined : "Chaque nuit à 3 h 17 : base de données et pièces d'identité, chiffrées, restauration testée."}
      style={bare ? { marginTop: 22 } : undefined}
      actions={lastOk && (
        <Link to="/admin/sauvegarde" className="ui-btn ui-btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", borderRadius: 9, border: `1px solid ${C.bds}`, background: C.l1, color: C.t1, fontSize: 12.5, textDecoration: "none" }}>
          <KeyRound style={{ width: 14, height: 14 }} /> Ouvrir une sauvegarde
        </Link>
      )}
    >
      {!runs ? (
        <EmptyState title="Chargement…" />
      ) : !lastOk ? (
        <Notice tone="warn">Aucune sauvegarde réussie pour l'instant. Ajoutez le secret GitHub <b>BACKUP_PASSPHRASE</b> (guide <b>docs/SAUVEGARDES.md</b>), puis lancez la première sauvegarde.</Notice>
      ) : (
        <>
          {/* La dernière sauvegarde suffit : chaque sauvegarde contient tout, y compris l'historique des jours précédents. */}
          <button type="button" onClick={() => lastOk.tables && setOpen(lastOk)}
            style={{ all: "unset", cursor: lastOk.tables ? "pointer" : "default", display: "block", width: "100%", boxSizing: "border-box", padding: "20px 22px", borderRadius: 18, background: C.l1, boxShadow: `0 0 0 1px ${C.bds}` }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.t3, flex: 1 }}>Dernière sauvegarde</span>
              <Pill tone={stale ? "danger" : "ok"} dot>{stale ? "En retard" : "À jour"}</Pill>
            </span>
            <span style={{ display: "block", marginTop: 8, fontSize: 26, fontWeight: 600, letterSpacing: "-0.04em", color: C.t1 }}>{when(lastOk.finished_at ?? lastOk.started_at)}</span>
            <span style={{ display: "block", marginTop: 4, fontSize: 13, color: C.t2 }}>
              {ago(lastOk.finished_at ?? lastOk.started_at)} · {mb(lastOk.archive_bytes)} chiffrés · {lastOk.files_count ?? 0} documents{lastOk.restore_ok ? " · restauration vérifiée" : ""}
            </span>
          </button>

          {failedLatest && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="err">La sauvegarde du {when(failedLatest.started_at)} a échoué : {failedLatest.restore_detail ?? failedLatest.error ?? "voir le détail sur GitHub"}.{" "}
                {failedLatest.run_url && <a href={failedLatest.run_url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>Détail</a>}
              </Notice>
            </div>
          )}

          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <span style={{ flex: 1, fontSize: 12.5, color: C.t3 }}>30 dernières nuits</span>
              <span style={{ fontSize: 12.5, color: C.t2, fontVariantNumeric: "tabular-nums" }}>{okDays} / 30 réussies</span>
            </div>
            <div role="img" aria-label={`${okDays} sauvegardes réussies sur les 30 dernières nuits`} style={{ display: "grid", gridTemplateColumns: "repeat(30, minmax(0, 1fr))", gap: 4 }}>
              {days.map(({ d, st, run }) => (
                <button key={d.toISOString()} type="button" disabled={!run?.tables} onClick={() => run && setOpen(run)}
                  title={`${d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" })} · ${st === "success" ? "réussie" : st === "failed" ? "échec" : st === "running" ? "en cours" : "aucune"}`}
                  style={{ all: "unset", cursor: run?.tables ? "pointer" : "default", height: 22, borderRadius: 6,
                    background: st === "success" ? "var(--a-sage)" : st === "failed" ? "var(--a-coral)" : st === "running" ? "var(--a-sun)" : C.hover3,
                    opacity: st === "none" ? 1 : 0.9 }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, color: C.t3 }}>
              <span>{days[0].d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}</span><span>Aujourd'hui</span>
            </div>
          </div>

          <p style={{ margin: "20px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.t3 }}>
            Conservées : les 30 dernières nuits, le 1er de chaque mois pendant 13 mois et le 1er janvier pendant 6 ans.
            Toutes sont sur <a href="https://github.com/ooble27/Ooble-/releases" target="_blank" rel="noopener noreferrer" style={{ color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>GitHub › Releases</a>.
          </p>
        </>
      )}

      {open && (
        <SidePanel title={`Sauvegarde du ${when(open.started_at)}`} subtitle={open.location ?? undefined} onClose={() => setOpen(null)} width={520}>
          <KeyValues items={[
            ["État", <Pill key="s" tone={STATUS[open.status].tone}>{STATUS[open.status].label}</Pill>],
            ["Archive chiffrée", mb(open.archive_bytes)],
            ["Fichiers", `${open.files_count ?? 0} (${mb(open.files_bytes)}) : pièces d'identité et documents`],
            ["Restauration", open.restore_ok ? (open.restore_detail ?? "Vérifiée") : (open.restore_detail ?? "Non vérifiée")],
          ]} />
          <p style={{ margin: "24px 0 8px", fontSize: 12.5, color: C.t3 }}>
            {tables.length} tables · {tables.reduce((n, [, c]) => n + c, 0).toLocaleString("fr-CA")} lignes
          </p>
          <div>
            {tables.map(([name, n]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", fontSize: 13 }}>
                <span style={{ color: TABLE_LABELS[name] ? C.t1 : C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
                  {TABLE_LABELS[name] ?? name}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: n ? C.t1 : C.t3, flexShrink: 0 }}>{n.toLocaleString("fr-CA")}</span>
              </div>
            ))}
          </div>
          {open.run_url && (
            <a href={open.run_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 14, fontSize: 12.5, color: C.t3, textDecoration: "underline" }}>
              Détail technique sur GitHub
            </a>
          )}
        </SidePanel>
      )}
    </Section>
  );
}
