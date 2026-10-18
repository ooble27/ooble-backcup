import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Columns3, List, MessageSquare, Plus, ShoppingCart, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";
import { STATUS_LABEL, isLate, isMine, loadTasks, setTaskStatus, type TaskStatus, type TeamTask } from "@/lib/teamSpace";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { GR_CSS, Opts } from "./GrowthPanel";
import { TaskForm, TaskPanel, TeamAvatar, TeamFaces, TV_CSS, dueLabel, plural, useMembers, useTeamLive, when } from "./TeamViews";

/**
 * Équipe › Tâches : un tableau en trois colonnes (À faire, En cours, Fait), comme les outils des
 * grandes équipes. On glisse une carte d'une colonne à l'autre pour changer son état ; seuls la
 * personne qui reçoit la tâche, celle qui l'a créée et les administrateurs le peuvent (la base
 * refuse le reste). Une vue en liste reste disponible.
 */

const CSS = `
.tb-board { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(260px, 1fr)); overflow-x: auto; padding-bottom: 6px; }
@media (max-width: 860px) { .tb-board { grid-template-columns: repeat(3, minmax(270px, 82vw)); scroll-snap-type: x mandatory; } .tb-col { scroll-snap-align: start; } }
.tb-col { border-radius: 22px; padding: 14px 12px 12px; min-height: 340px; transition: background .2s, box-shadow .2s; }
.tb-col[data-over="true"] { box-shadow: inset 0 0 0 2px var(--tb-hue); }
.tb-card { padding: 14px 14px 12px; cursor: pointer; }
.tb-card[draggable="true"] { cursor: grab; }
.tb-card[data-dragging="true"] { opacity: .35; }
.tb-card .tb-title { font-size: 14.5px; line-height: 1.4; color: var(--a-t1); font-weight: 500; overflow-wrap: anywhere; }
.tb-empty { border-radius: 16px; border: 1.5px dashed color-mix(in srgb, var(--a-t1) 14%, transparent); padding: 22px 12px; text-align: center; font-size: 13px; color: var(--a-t3); }
.tb-seg { display: inline-flex; padding: 3px; border-radius: 99px; background: color-mix(in srgb, var(--a-t1) 6%, transparent); }
.tb-seg button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 99px; font-size: 13px; color: var(--a-t2); transition: background .15s, color .15s; }
.tb-seg button[aria-pressed="true"] { background: var(--a-bg); color: var(--a-t1); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.tb-seg button:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
`;

const COLS: { id: TaskStatus; label: string; hue: string; hint: string }[] = [
  { id: "todo", label: "À faire", hue: "var(--a-vzIndigo)", hint: "Rien à faire ici" },
  { id: "doing", label: "En cours", hue: "var(--a-sun)", hint: "Glissez une tâche ici quand vous la commencez" },
  { id: "done", label: "Fait", hue: "var(--a-sage)", hint: "Les tâches terminées ces 7 derniers jours" },
];

type Scope = "mine" | "all" | "created";

export function TeamTasksView({ onChanged, onOpenOrder, onShowClient }: { onChanged?: () => void; onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const admin = roles.includes("admin");
  const members = useMembers();
  const [scope, setScope] = useState<Scope>("mine");
  const [view, setView] = useState<"board" | "list">(() => { try { return (localStorage.getItem("ooble.tasks.view") as "board" | "list") || "board"; } catch { return "board"; } });
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [archived, setArchived] = useState<TeamTask[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamTask | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [moved, setMoved] = useState<string | null>(null);

  const load = useCallback(() => {
    loadTasks(false).then((t) => { setTasks(t); setErr(null); }).catch((e: Error) => setErr(e.message));
    if (showArchived) loadTasks(true).then(setArchived).catch((e: Error) => setErr(e.message));
  }, [showArchived]);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_task_comments"]);
  const changed = () => { load(); onChanged?.(); };
  const pickView = (v: "board" | "list") => { setView(v); try { localStorage.setItem("ooble.tasks.view", v); } catch { /* préférence facultative */ } };

  const canStatus = (t: TeamTask) => admin || t.createdBy === me || isMine(t, me, roles);
  const inScope = (t: TeamTask) => scope === "all" || (scope === "mine" ? isMine(t, me, roles) : t.createdBy === me);
  const recentDone = (t: TeamTask) => t.status !== "done" || (!!t.doneAt && Date.now() - new Date(t.doneAt).getTime() < 7 * 86_400_000);
  const shown = (tasks ?? []).filter((t) => inScope(t) && recentDone(t));
  const byCol = (s: TaskStatus) => shown.filter((t) => t.status === s)
    .sort((a, b) => s === "done" ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : Number(isLate(b)) - Number(isLate(a)) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));

  const mineOpen = (tasks ?? []).filter((t) => isMine(t, me, roles) && t.status !== "done");
  const mineLate = mineOpen.filter(isLate).length;
  const doneWeek = (tasks ?? []).filter((t) => t.status === "done" && t.doneAt && Date.now() - new Date(t.doneAt).getTime() < 7 * 86_400_000).length;
  const faces = members.map((m) => {
    const n = (tasks ?? []).filter((t) => t.status !== "done" && isMine(t, m.userId, m.roles)).length;
    const late = (tasks ?? []).filter((t) => isLate(t) && isMine(t, m.userId, m.roles)).length;
    return { id: m.userId, name: m.name, you: m.userId === me, text: n ? `${n} ${plural(n, "tâche")}${late ? ` · ${late} en retard` : ""}` : "rien en attente", strong: late > 0, n };
  }).sort((a, b) => b.n - a.n).slice(0, 6);
  const who = (t: TeamTask) => t.assigneeId ? (t.assigneeId === me ? "Vous" : members.find((m) => m.userId === t.assigneeId)?.name ?? "Un membre") : t.assigneeRole ? roleLabel(t.assigneeRole) : "Toute l'équipe";
  const avatarName = (t: TeamTask) => (t.assigneeId ? members.find((m) => m.userId === t.assigneeId)?.name ?? "?" : who(t));

  const move = async (t: TeamTask, s: TaskStatus) => {
    if (t.status === s) return;
    if (!canStatus(t)) { setErr("Seules la personne qui reçoit la tâche et celle qui l'a créée peuvent changer son état."); return; }
    // Affichage immédiat, la base confirme ensuite.
    setTasks((all) => all?.map((x) => (x.id === t.id ? { ...x, status: s, doneAt: s === "done" ? new Date().toISOString() : null } : x)) ?? all);
    setMoved(t.id);
    const r = await setTaskStatus(t.id, s);
    if (r.error) setErr(r.error);
    changed();
  };

  const card = (t: TeamTask, i: number) => {
    const late = isLate(t), done = t.status === "done", draggable = canStatus(t) && !t.archived;
    return (
      <div key={t.id} className={`tv-card tv-lift tb-card ${moved === t.id ? "tv-pop" : "tv-rise"}`} style={{ animationDelay: moved === t.id ? "0ms" : `${Math.min(i, 8) * 45}ms` }}
        draggable={draggable} data-dragging={drag === t.id}
        onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onClick={() => setOpenId(t.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(t.id); }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {draggable && (
            <button type="button" className="tv-check" data-done={done} aria-label={done ? "Remettre à faire" : "Marquer fait"} title={done ? "Remettre à faire" : "Marquer fait"}
              onClick={(e) => { e.stopPropagation(); move(t, done ? "todo" : "done"); }} style={{ marginTop: 1 }}>
              <Check style={{ width: 13, height: 13 }} strokeWidth={3} />
            </button>
          )}
          <span className="tb-title" style={{ flex: 1, minWidth: 0, color: done ? C.t3 : C.t1, textDecoration: done ? "line-through" : undefined }}>{t.title}</span>
        </div>
        {t.details && !done && <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.45, color: C.t3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.details}</p>}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {t.dueOn && !done && (
            <span className="tv-chip" style={late ? { background: "color-mix(in srgb, var(--a-coral) 16%, transparent)", color: C.t1, fontWeight: 600 } : undefined}>
              <CalendarDays style={{ width: 12, height: 12 }} />{late ? `En retard · ${dueLabel(t.dueOn)}` : dueLabel(t.dueOn)}
            </span>
          )}
          {done && t.doneByName && <span className="tv-chip"><Check style={{ width: 12, height: 12 }} />{t.doneByName.split(" ")[0]} · {t.doneAt ? when(t.doneAt) : ""}</span>}
          {t.clientName && <span className="tv-chip"><UserRound style={{ width: 12, height: 12 }} />{t.clientName}</span>}
          {t.orderRef && <span className="tv-chip"><ShoppingCart style={{ width: 12, height: 12 }} />{t.orderRef}</span>}
          {t.comments.length > 0 && <span className="tv-chip"><MessageSquare style={{ width: 12, height: 12 }} />{t.comments.length}</span>}
          <span style={{ flex: 1 }} />
          <span title={who(t)} style={{ display: "inline-flex" }}><TeamAvatar name={avatarName(t)} size={26} /></span>
        </div>
      </div>
    );
  };

  const board = (
    <div className="tb-board">
      {COLS.map((c, ci) => {
        const rows = byCol(c.id);
        return (
          <section key={c.id} className="tb-col tv-rise" data-over={over === c.id}
            style={{ ["--tb-hue" as string]: c.hue, background: `color-mix(in srgb, ${c.hue} ${over === c.id ? 14 : 7}%, transparent)`, animationDelay: `${ci * 70}ms` }}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(c.id); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); const t = tasks?.find((x) => x.id === (drag ?? e.dataTransfer.getData("text/plain"))); setOver(null); setDrag(null); if (t) move(t, c.id); }}>
            <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 6px 12px" }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: c.hue }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{c.label}</span>
              <span style={{ fontSize: 13, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{rows.length}</span>
              <span style={{ flex: 1 }} />
              {c.id === "todo" && <button type="button" className="tv-icon" aria-label="Nouvelle tâche" title="Nouvelle tâche" onClick={() => setEditing("new")}><Plus style={{ width: 16, height: 16 }} /></button>}
            </header>
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map(card)}
              {tasks && rows.length === 0 && <div className="tb-empty">{drag ? "Déposez ici" : c.hint}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );

  const listRows = showArchived ? archived ?? [] : shown;
  const list = (
    <div style={{ maxWidth: 860 }}>
      {listRows.length === 0 && <p style={{ fontSize: 14, color: C.t3 }}>{showArchived ? "Aucune tâche archivée." : "Aucune tâche."}</p>}
      {listRows.map((t, i) => (
        <div key={t.id} className="tv-rise" style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: `1px solid ${C.bds}`, animationDelay: `${Math.min(i, 10) * 30}ms` }}>
          {canStatus(t) && !t.archived ? (
            <button type="button" className="tv-check" data-done={t.status === "done"} onClick={() => move(t, t.status === "done" ? "todo" : "done")} aria-label="Marquer fait"><Check style={{ width: 13, height: 13 }} strokeWidth={3} /></button>
          ) : <span style={{ width: 22 }} />}
          <button type="button" className="tv-row" onClick={() => setOpenId(t.id)} style={{ borderBottom: "none", alignItems: "center" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="tv-title" style={{ display: "block", fontSize: 15, color: t.status === "done" ? C.t3 : C.t1, textDecoration: t.status === "done" ? "line-through" : undefined }}>{t.title}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 3 }}>{who(t)} · {STATUS_LABEL[t.status]}{t.clientName ? ` · ${t.clientName}` : ""}{t.orderRef ? ` · ${t.orderRef}` : ""}</span>
            </span>
            <span style={{ fontSize: 13, color: isLate(t) ? C.t1 : C.t3, fontWeight: isLate(t) ? 600 : 400, whiteSpace: "nowrap" }}>{t.dueOn && t.status !== "done" ? (isLate(t) ? `en retard · ${dueLabel(t.dueOn)}` : dueLabel(t.dueOn)) : ""}</span>
          </button>
          <TeamAvatar name={avatarName(t)} size={26} />
        </div>
      ))}
    </div>
  );

  const open = (showArchived ? archived : tasks)?.find((t) => t.id === openId) ?? tasks?.find((t) => t.id === openId) ?? null;

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + GR_CSS + CSS}</style>
      <section className="hz">
        <div style={{ minWidth: 0 }}>
          <h2 className="hz-title tv-rise">
            {!tasks ? <span className="mute">…</span> : mineOpen.length
              ? <><span style={{ color: C.coral }}>{mineOpen.length}</span> {plural(mineOpen.length, "tâche")} pour vous<span className="mute">{mineLate ? `, dont ${mineLate} en retard.` : "."}</span></>
              : <>Rien à faire <span style={{ color: C.sage }}>pour vous</span><span className="mute">. Beau travail.</span></>}
          </h2>
          <p className="hz-sub tv-rise" style={{ animationDelay: "60ms" }}>{tasks ? `${(tasks ?? []).filter((t) => t.status !== "done").length} ${plural((tasks ?? []).filter((t) => t.status !== "done").length, "tâche ouverte", "tâches ouvertes")} dans l'équipe · ${doneWeek} ${plural(doneWeek, "terminée")} ces 7 derniers jours.` : ""}</p>
          <div className="tv-rise" style={{ marginTop: 18, animationDelay: "120ms" }}><Button variant="primary" onClick={() => setEditing("new")} icon={<Plus style={{ width: 15, height: 15 }} />}>Nouvelle tâche</Button></div>
        </div>
        <div className="tv-rise" style={{ animationDelay: "160ms" }}><TeamFaces title="Qui a quoi" rows={faces} /></div>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 15, lineHeight: 2, color: C.t2, minWidth: 240 }}>
          <Opts value={showArchived ? ("archived" as Scope) : scope} onChange={(v: Scope | "archived") => { if (v === "archived") { setShowArchived(true); pickView("list"); } else { setShowArchived(false); setScope(v); } }}
            options={[{ v: "mine", label: `Pour moi${tasks ? ` (${mineOpen.length})` : ""}` }, { v: "all", label: "Toute l'équipe" }, { v: "created", label: "Créées par moi" }, { v: "archived" as Scope, label: "Archivées" }]} />
        </p>
        {!showArchived && (
          <span className="tb-seg" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={view === "board"} onClick={() => pickView("board")}><Columns3 style={{ width: 14, height: 14 }} />Tableau</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => pickView("list")}><List style={{ width: 14, height: 14 }} />Liste</button>
          </span>
        )}
      </div>
      {err && <div style={{ marginBottom: 14 }}><Notice tone="err">{err}</Notice></div>}
      {!tasks && <p style={{ fontSize: 13, color: C.t3 }}>Chargement des tâches…</p>}
      {tasks && (view === "board" && !showArchived ? board : list)}

      {editing && <TaskForm task={editing === "new" ? null : editing} members={members} me={me} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); changed(); if (id) setOpenId(id); }} />}
      {open && !editing && <TaskPanel task={open} me={me} admin={admin} canStatus={canStatus(open)} who={who(open)} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} onChanged={changed}
        onOpenOrder={onOpenOrder} onShowClient={onShowClient} />}
    </div>
  );
}
