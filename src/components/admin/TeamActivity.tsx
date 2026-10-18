import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "./adminTheme";
import { Opts } from "./GrowthPanel";
import { TeamAvatar, TeamName, TV_CSS, useMembers } from "./TeamViews";

/**
 * Équipe › Activité par personne (administrateurs) : commandes terminées, délai moyen entre la prise en
 * charge et la fin, tâches faites, ouvertes et en retard. Pour répartir le travail, pas pour surveiller.
 */

interface Row { userId: string; ordersDone: number; avgMinutes: number | null; tasksDone: number; tasksOpen: number; tasksLate: number }

const duration = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 6) / 10} h`.replace(".", ",") : `${Math.round(m / 144) / 10} j`.replace(".", ","));

export function TeamActivity() {
  const members = useMembers();
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("team_activity", { _days: Number(days) }).then(({ data, error }: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => {
      if (error) { setErr(error.message); setRows([]); return; }
      setErr(null);
      setRows((data ?? []).map((r) => ({
        userId: String(r.user_id), ordersDone: Number(r.orders_done ?? 0), avgMinutes: r.avg_minutes == null ? null : Number(r.avg_minutes),
        tasksDone: Number(r.tasks_done ?? 0), tasksOpen: Number(r.tasks_open ?? 0), tasksLate: Number(r.tasks_late ?? 0),
      })));
    });
  }, [days]);

  const list = (rows ?? []).map((r) => ({ ...r, m: members.find((x) => x.userId === r.userId) }))
    .filter((r) => r.m).sort((a, b) => b.ordersDone - a.ordersDone || b.tasksDone - a.tasksDone);
  const num: React.CSSProperties = { fontSize: 15, color: C.t1, fontVariantNumeric: "tabular-nums", textAlign: "right" };
  const head: React.CSSProperties = { fontSize: 12, color: C.t3, textAlign: "right" };

  return (
    <section style={{ marginTop: 48 }}>
      <style>{TV_CSS + `
.ta-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) repeat(4, minmax(0, 1fr)); gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--a-bds); }
@media (max-width: 640px) { .ta-grid { grid-template-columns: minmax(0, 1fr) repeat(2, auto); } .ta-hide { display: none; } }
`}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Activité par personne</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: C.t2 }}>
          <Opts value={days} onChange={setDays} options={[{ v: "7", label: "7 jours" }, { v: "30", label: "30 jours" }, { v: "90", label: "90 jours" }]} />
        </p>
      </div>
      <p style={{ margin: "2px 0 8px", fontSize: 12.5, color: C.t3 }}>Pour répartir le travail. Le délai va de la prise en charge d'une commande à sa fin.</p>
      <div className="ta-grid" style={{ paddingTop: 4 }}>
        <span style={{ fontSize: 12, color: C.t3 }}>Membre</span>
        <span style={head}>Commandes</span>
        <span style={head} className="ta-hide">Délai moyen</span>
        <span style={head}>Tâches faites</span>
        <span style={head} className="ta-hide">Ouvertes</span>
      </div>
      {rows === null && <p style={{ margin: 0, padding: "14px 0", fontSize: 13, color: C.t3 }}>Chargement…</p>}
      {err && <p style={{ margin: 0, padding: "14px 0", fontSize: 13, color: C.t3 }}>{err}</p>}
      {list.map((r) => (
        <div key={r.userId} className="ta-grid">
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <TeamAvatar id={r.userId} name={r.m!.name} size={30} presence />
            <TeamName id={r.userId} name={r.m!.name} style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
          </span>
          <span style={num}>{r.ordersDone}</span>
          <span style={num} className="ta-hide">{duration(r.avgMinutes)}</span>
          <span style={num}>{r.tasksDone}</span>
          <span style={{ ...num, color: r.tasksOpen ? C.t1 : C.t3 }} className="ta-hide">{r.tasksOpen}{r.tasksLate ? <span style={{ fontSize: 12.5, color: C.t3 }}> · {r.tasksLate} en retard</span> : null}</span>
        </div>
      ))}
    </section>
  );
}
