import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TABLE_LABELS } from "@/lib/backupLabels";
import { C } from "./adminTheme";
import { Notice, SidePanel } from "./ui";
import { DataTable, EmptyState, KeyValues, Pill, Section, TwoLine, type Column } from "./layout";

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

export default function BackupsCard() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState<Run | null>(null);

  useEffect(() => {
    supabase.from("backup_runs" as never).select("*").order("started_at", { ascending: false }).limit(10)
      .then(({ data }) => setRuns(((data ?? []) as unknown) as Run[]));
  }, []);

  const lastOk = runs?.find((r) => r.status === "success");
  const stale = !lastOk || Date.now() - new Date(lastOk.finished_at ?? lastOk.started_at).getTime() > 36 * 3600000;
  const tone = !runs ? null : !lastOk ? "warn" : stale ? "err" : "ok";

  const columns: Column<Run>[] = [
    { key: "date", header: "Date", render: (r) => <TwoLine primary={when(r.started_at)} secondary={r.location ?? undefined} /> },
    { key: "status", header: "État", render: (r) => <Pill tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Pill> },
    { key: "detail", header: "Contenu", hideBelow: 900, render: (r) => r.status === "failed"
      ? <span style={{ color: C.dangerText }}>{r.restore_detail ?? r.error ?? "Échec"}</span>
      : <span style={{ color: C.t2 }}>{r.files_count ?? 0} fichiers{r.restore_ok ? " · restauration vérifiée" : ""}</span> },
    { key: "size", header: "Taille", align: "right", render: (r) => <span style={{ color: C.t2 }}>{mb(r.archive_bytes)}</span> },
  ];

  const tables = open?.tables ? Object.entries(open.tables).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];

  return (
    <Section
      title="Sauvegardes"
      description="Chaque nuit à 3 h 17 : base de données et pièces d'identité, chiffrées, restauration testée."
      actions={lastOk && (
        <Link to="/admin/sauvegarde" className="ui-btn ui-btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", borderRadius: 9, border: `1px solid ${C.bds}`, background: C.l1, color: C.t1, fontSize: 12.5, textDecoration: "none" }}>
          <KeyRound style={{ width: 14, height: 14 }} /> Ouvrir une sauvegarde
        </Link>
      )}
    >
      {tone && (
        <div style={{ marginBottom: 14 }}>
          <Notice tone={tone}>
            {tone === "ok" && lastOk && <>Dernière sauvegarde réussie {ago(lastOk.finished_at ?? lastOk.started_at)}, {mb(lastOk.archive_bytes)} chiffrés. {lastOk.restore_detail}</>}
            {tone === "warn" && <>Aucune sauvegarde réussie pour l'instant. Ajoutez le secret GitHub <b>BACKUP_PASSPHRASE</b> (guide <b>docs/SAUVEGARDES.md</b>), puis lancez la première sauvegarde.</>}
            {tone === "err" && lastOk && <>La dernière sauvegarde réussie date de {when(lastOk.finished_at ?? lastOk.started_at)}. Vérifiez le dernier échec ci-dessous.</>}
          </Notice>
        </div>
      )}

      <DataTable
        rows={runs ?? []}
        columns={columns}
        rowKey={(r) => String(r.id)}
        onRowClick={(r) => r.tables && setOpen(r)}
        selectedKey={open ? String(open.id) : null}
        empty={<EmptyState title={runs ? "Aucune sauvegarde" : "Chargement…"} />}
        mobile={(r) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={when(r.started_at)} secondary={r.status === "failed" ? (r.error ?? "Échec") : `${mb(r.archive_bytes)} · ${r.files_count ?? 0} fichiers`} /></div>
            <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
          </div>
        )}
      />

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
          <div style={{ borderTop: `1px solid ${C.bds}` }}>
            {tables.map(([name, n]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 13 }}>
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
