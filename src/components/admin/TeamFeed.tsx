import { useCallback, useEffect, useState } from "react";
import { firstName, loadActivity, openMember, peekTeam, type ActivityItem } from "@/lib/teamSpace";
import { C } from "./adminTheme";
import { Notice, SidePanel } from "./ui";
import { GR_CSS, Opts } from "./GrowthPanel";
import { TeamAvatar, TeamName, TV_CSS, useMembers, useTeamLive } from "./TeamViews";

/**
 * Activité de l'équipe : ce que fait chacun (commandes prises et terminées, tâches créées et faites, passations,
 * approbations), regroupé par jour, filtrable par type et par personne. Un élément s'ouvre d'un toucher.
 */

type Filter = "all" | "order" | "task" | "handoff" | "approval";
const FILTERS: { v: Filter; label: string }[] = [
  { v: "all", label: "Tout" }, { v: "order", label: "Commandes" }, { v: "task", label: "Tâches" }, { v: "handoff", label: "Passations" }, { v: "approval", label: "Approbations" },
];

const dayLabel = (iso: string) => {
  const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Aujourd'hui";
  if (same(d, y)) return "Hier";
  return d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase());
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });

export function ActivityPanel({ onClose, onOpenOrder, onGoTasks, onGoMe }: { onClose: () => void; onOpenOrder?: (id: string) => void; onGoTasks?: () => void; onGoMe?: () => void }) {
  const members = useMembers();
  const [items, setItems] = useState<ActivityItem[] | null>(() => peekTeam<ActivityItem[]>("activity") ?? null);
  const [more, setMore] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [who, setWho] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    loadActivity().then((l) => { setItems(l); setMore(l.length >= 60); setErr(null); }).catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_handoffs", "team_approvals"]);
  const loadMore = async () => {
    const last = items?.[items.length - 1];
    if (!last) return;
    const next = await loadActivity(last.at).catch(() => []);
    setItems((l) => [...(l ?? []), ...next]);
    setMore(next.length >= 60);
  };

  const shown = (items ?? []).filter((i) => (filter === "all" || i.refKind === filter) && (!who || i.actorId === who));
  const groups: { day: string; list: ActivityItem[] }[] = [];
  for (const i of shown) {
    const day = dayLabel(i.at);
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, list: [] });
    groups[groups.length - 1].list.push(i);
  }
  const open = (i: ActivityItem) => {
    if (i.refKind === "order") onOpenOrder?.(i.refId);
    else if (i.refKind === "task") onGoTasks?.();
    else onGoMe?.();
  };
  const actors = members.filter((m) => (items ?? []).some((i) => i.actorId === m.userId));

  return (
    <SidePanel title="Activité de l'équipe" subtitle="Ce que fait chacun, les 30 derniers jours" onClose={onClose} width={620}>
      <style>{TV_CSS + GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}><Opts value={filter} onChange={setFilter} options={FILTERS} /></p>
      {actors.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0 4px" }}>
          {actors.map((m) => (
            <button key={m.userId} type="button" onClick={() => setWho((w) => (w === m.userId ? null : m.userId))} title={who === m.userId ? "Voir tout le monde" : `Seulement ${firstName(m.name)}`}
              style={{ all: "unset", cursor: "pointer", borderRadius: 99, opacity: who && who !== m.userId ? 0.35 : 1, boxShadow: who === m.userId ? "0 0 0 2px var(--a-bg), 0 0 0 4px var(--a-t1)" : "none", transition: "opacity .15s" }}>
              <TeamAvatar id={m.userId} name={m.name} size={32} />
            </button>
          ))}
          {who && <button type="button" className="tv-link" style={{ fontSize: 13 }} onClick={() => setWho(null)}>Tout le monde</button>}
        </div>
      )}
      {err && <div style={{ marginTop: 12 }}><Notice tone="err">{err}</Notice></div>}
      {items === null && !err && <p style={{ margin: "16px 0 0", fontSize: 13.5, color: C.t3 }}>Chargement…</p>}
      {items && shown.length === 0 && <p style={{ margin: "16px 0 0", fontSize: 14, color: C.t3 }}>Rien pour ce filtre.</p>}
      {groups.map((g) => (
        <section key={g.day}>
          <p style={{ margin: "22px 0 2px", fontSize: 10.5, fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", color: C.t3 }}>{g.day}</p>
          {g.list.map((i, k) => {
            const m = i.actorId ? members.find((x) => x.userId === i.actorId) : undefined;
            const name = m?.name ?? i.actorName;
            const clickable = (i.refKind === "order" && !!onOpenOrder) || (i.refKind === "task" && !!onGoTasks) || ((i.refKind === "handoff" || i.refKind === "approval") && !!onGoMe);
            return (
              <div key={`${i.kind}:${i.refId}:${k}`} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
                {i.actorId
                  ? <button type="button" onClick={() => openMember(i.actorId!)} title="Voir sa fiche" style={{ all: "unset", cursor: "pointer", borderRadius: 99, display: "inline-flex" }}><TeamAvatar id={i.actorId} name={name} size={32} /></button>
                  : <span style={{ width: 32, height: 32, borderRadius: 99, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.t3, boxShadow: "inset 0 0 0 1px var(--a-bd)" }}>S</span>}
                <button type="button" disabled={!clickable} onClick={() => open(i)} style={{ all: "unset", cursor: clickable ? "pointer" : "default", flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14.5, lineHeight: 1.5, color: C.t2, overflowWrap: "anywhere" }}>
                    {i.actorId ? <TeamName id={i.actorId} name={firstName(name)} style={{ fontWeight: 500 }} /> : <span style={{ color: C.t1, fontWeight: 500 }}>Système</span>} {i.text}
                  </span>
                  <span style={{ display: "block", marginTop: 1, fontSize: 12, color: C.t3 }}>{time(i.at)}</span>
                </button>
              </div>
            );
          })}
        </section>
      ))}
      {items && more && filter === "all" && !who && (
        <p style={{ margin: "16px 0 0" }}><button type="button" className="tv-link" style={{ fontSize: 13.5 }} onClick={loadMore}>Voir plus ancien</button></p>
      )}
    </SidePanel>
  );
}
