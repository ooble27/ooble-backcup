import { useCallback, useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";
import { STATUS_LABEL, isLate, isMine, loadTasks, setTaskStatus, tidyDoneTasks, type TaskStatus, type TeamTask } from "@/lib/teamSpace";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { GR_CSS, Opts } from "./GrowthPanel";
import { TaskForm, TaskPanel, TeamAvatar, TeamFaces, TV_CSS, dueLabel, memberLabel, plural, presenceText, useMembers, useTeamLive, when } from "./TeamViews";

/**
 * Équipe › Tâches : trois colonnes (À faire, En cours, Fait), à plat comme le reste du back-office.
 * On glisse une tâche d'une colonne à l'autre pour changer son état ; seuls la personne qui la
 * reçoit, celle qui l'a créée et les administrateurs le peuvent (la base refuse le reste).
 */

const CSS = `
.tb-board { display: grid; gap: 0 36px; grid-template-columns: repeat(3, minmax(250px, 1fr)); overflow-x: auto; }
@media (max-width: 860px) { .tb-board { grid-template-columns: repeat(3, minmax(270px, 84vw)); scroll-snap-type: x mandatory; gap: 0 24px; } .tb-col { scroll-snap-align: start; } }
.tb-col { min-height: 300px; border-radius: 12px; transition: background .15s, box-shadow .15s; }
.tb-col[data-over="true"] { background: var(--a-hover2); box-shadow: 0 0 0 1px var(--a-bd); }
.tb-head { display: flex; align-items: center; gap: 10px; height: 40px; border-bottom: 1px solid var(--a-bd); }
.tb-item { display: flex; gap: 12px; align-items: flex-start; padding: 14px 6px; margin: 0 -6px; border-bottom: 1px solid var(--a-bds); border-radius: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tb-item[draggable="true"] { cursor: grab; }
.tb-item[data-dragging="true"] { opacity: .3; }
.tb-item:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px; }
@media (hover: hover) { .tb-item:hover .tb-title { text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; } }
`;

const COLS: { id: TaskStatus; label: string; empty: string }[] = [
  { id: "todo", label: "À faire", empty: "Rien à faire." },
  { id: "doing", label: "En cours", empty: "Glissez ici une tâche commencée." },
  { id: "done", label: "Fait", empty: "Les tâches terminées ces 7 derniers jours." },
];

type Scope = "mine" | "all" | "created" | "archived";

export function TeamTasksView({ onChanged, onOpenOrder, onShowClient }: { onChanged?: () => void; onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const admin = roles.includes("admin");
  const members = useMembers();
  const [scope, setScope] = useState<Scope>("mine");
  const [view, setView] = useState<"board" | "list">(() => { try { return localStorage.getItem("ooble.tasks.view") === "list" ? "list" : "board"; } catch { return "board"; } });
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [archived, setArchived] = useState<TeamTask[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamTask | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [limit, setLimit] = useState<Record<TaskStatus, number>>({ todo: 20, doing: 20, done: 20 });
  const [note, setNote] = useState<string | null>(null);

  const showArchived = scope === "archived";
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
  const recent = (t: TeamTask) => t.status !== "done" || (!!t.doneAt && Date.now() - new Date(t.doneAt).getTime() < 7 * 86_400_000);
  const shown = (tasks ?? []).filter((t) => inScope(t) && recent(t));
  const byCol = (s: TaskStatus) => shown.filter((t) => t.status === s)
    .sort((a, b) => s === "done" ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : Number(isLate(b)) - Number(isLate(a)) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));

  const mineOpen = (tasks ?? []).filter((t) => isMine(t, me, roles) && t.status !== "done");
  const mineLate = mineOpen.filter(isLate).length;
  const openAll = (tasks ?? []).filter((t) => t.status !== "done").length;
  const doneWeek = (tasks ?? []).filter((t) => t.status === "done" && t.doneAt && Date.now() - new Date(t.doneAt).getTime() < 7 * 86_400_000).length;
  const faces = members.map((m) => {
    const n = (tasks ?? []).filter((t) => t.status !== "done" && isMine(t, m.userId, m.roles)).length;
    const late = (tasks ?? []).filter((t) => isLate(t) && isMine(t, m.userId, m.roles)).length;
    return { id: m.userId, name: m.name, you: m.userId === me, text: presenceText(m, n ? `${n} ${plural(n, "tâche")}${late ? ` · ${late} en retard` : ""}` : "rien en attente"), strong: late > 0, n };
  }).sort((a, b) => b.n - a.n).slice(0, 6);
  const who = (t: TeamTask) => t.assigneeId ? memberLabel(members, t.assigneeId, me) : t.assigneeRole ? roleLabel(t.assigneeRole) : "Toute l'équipe";
  const avatar = (t: TeamTask, size: number) => t.assigneeId
    ? <TeamAvatar id={t.assigneeId} name={members.find((m) => m.userId === t.assigneeId)?.name ?? who(t)} size={size} presence />
    : <TeamAvatar group name={who(t)} size={size} />;

  const move = async (t: TeamTask, s: TaskStatus) => {
    if (t.status === s) return;
    if (!canStatus(t)) { setErr("Seules la personne qui reçoit la tâche et celle qui l'a créée peuvent changer son état."); return; }
    setTasks((all) => all?.map((x) => (x.id === t.id ? { ...x, status: s, doneAt: s === "done" ? new Date().toISOString() : null } : x)) ?? all);
    const r = await setTaskStatus(t.id, s);
    if (r.error) setErr(r.error);
    changed();
  };

  const tidy = async () => {
    if (!window.confirm("Ranger les tâches faites dans les archives ? Elles restent consultables dans « Archivées ».")) return;
    const r = await tidyDoneTasks();
    if (r.error) setErr(r.error); else { setNote(`${r.count ?? 0} ${plural(r.count ?? 0, "tâche rangée", "tâches rangées")} dans les archives.`); changed(); }
  };

  const meta = (t: TeamTask) => [
    t.status === "done" ? (t.doneByName ? `fait par ${t.doneByName.split(" ")[0]}${t.doneAt ? `, ${when(t.doneAt)}` : ""}` : "fait") : null,
    t.clientName, t.orderRef, t.comments.length ? `${t.comments.length} ${plural(t.comments.length, "commentaire")}` : null,
  ].filter(Boolean).join(" · ");

  const item = (t: TeamTask, i: number) => {
    const late = isLate(t), done = t.status === "done", movable = canStatus(t) && !t.archived;
    return (
      <div key={t.id} className="tb-item tv-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} draggable={movable} data-dragging={drag === t.id}
        onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onClick={() => setOpenId(t.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(t.id); }}>
        {movable ? (
          <button type="button" className="tv-check" data-done={done} aria-label={done ? "Remettre à faire" : "Marquer fait"} title={done ? "Remettre à faire" : "Marquer fait"}
            onClick={(e) => { e.stopPropagation(); move(t, done ? "todo" : "done"); }} style={{ marginTop: 1 }}>
            <Check style={{ width: 13, height: 13 }} strokeWidth={3} />
          </button>
        ) : <span style={{ width: 22, flexShrink: 0 }} />}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="tb-title" style={{ display: "block", fontSize: 15, lineHeight: 1.4, color: done ? C.t3 : C.t1, textDecoration: done ? "line-through" : undefined, overflowWrap: "anywhere" }}>{t.title}</span>
          {t.dueOn && !done && (
            <span style={{ display: "block", marginTop: 4, fontSize: 12.5, color: late ? C.t1 : C.t2, fontWeight: late ? 600 : 400 }}>{late ? `En retard · ${dueLabel(t.dueOn)}` : `Pour ${dueLabel(t.dueOn)}`}</span>
          )}
          {meta(t) && <span style={{ display: "block", marginTop: 3, fontSize: 12.5, color: C.t3 }}>{meta(t)}</span>}
        </span>
        <span title={who(t)} style={{ flexShrink: 0 }}>{avatar(t, 28)}</span>
      </div>
    );
  };

  const board = (
    <div className="tb-board">
      {COLS.map((c) => {
        const rows = byCol(c.id);
        return (
          <section key={c.id} className="tb-col" data-over={over === c.id}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(c.id); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); const t = tasks?.find((x) => x.id === (drag ?? e.dataTransfer.getData("text/plain"))); setOver(null); setDrag(null); if (t) move(t, c.id); }}>
            <header className="tb-head">
              <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", color: C.t2 }}>{c.label}</span>
              <span style={{ fontSize: 13, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{rows.length}</span>
              <span style={{ flex: 1 }} />
              {c.id === "todo" && <button type="button" className="tv-icon" aria-label="Nouvelle tâche" title="Nouvelle tâche" onClick={() => setEditing("new")}><Plus style={{ width: 16, height: 16 }} /></button>}
              {c.id === "done" && rows.length > 0 && <button type="button" className="tv-link" onClick={tidy}>Ranger</button>}
            </header>
            {rows.slice(0, limit[c.id]).map(item)}
            {rows.length > limit[c.id] && (
              <button type="button" className="tv-link" style={{ display: "block", margin: "12px 0 0", fontSize: 13 }} onClick={() => setLimit((l) => ({ ...l, [c.id]: l[c.id] + 20 }))}>
                Voir plus ({rows.length - limit[c.id]})
              </button>
            )}
            {tasks && rows.length === 0 && <p style={{ margin: 0, padding: "18px 0", fontSize: 13, color: C.t3 }}>{drag ? "Déposez ici." : c.empty}</p>}
          </section>
        );
      })}
    </div>
  );

  const listRows = showArchived ? archived ?? [] : shown.slice().sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || Number(isLate(b)) - Number(isLate(a)));
  const list = (
    <div style={{ maxWidth: 860 }}>
      {listRows.length === 0 && <p style={{ fontSize: 14, color: C.t3 }}>{showArchived ? "Aucune tâche archivée." : "Aucune tâche."}</p>}
      {listRows.slice(0, limit.todo + limit.doing).map((t, i) => (
        <div key={t.id} className="tb-item tv-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms`, alignItems: "center" }} onClick={() => setOpenId(t.id)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") setOpenId(t.id); }}>
          {canStatus(t) && !t.archived ? (
            <button type="button" className="tv-check" data-done={t.status === "done"} onClick={(e) => { e.stopPropagation(); move(t, t.status === "done" ? "todo" : "done"); }} aria-label="Marquer fait"><Check style={{ width: 13, height: 13 }} strokeWidth={3} /></button>
          ) : <span style={{ width: 22, flexShrink: 0 }} />}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="tb-title" style={{ display: "block", fontSize: 15, color: t.status === "done" ? C.t3 : C.t1, textDecoration: t.status === "done" ? "line-through" : undefined }}>{t.title}</span>
            <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 3 }}>{who(t)} · {STATUS_LABEL[t.status]}{t.clientName ? ` · ${t.clientName}` : ""}{t.orderRef ? ` · ${t.orderRef}` : ""}</span>
          </span>
          <span style={{ fontSize: 13, color: isLate(t) ? C.t1 : C.t3, fontWeight: isLate(t) ? 600 : 400, whiteSpace: "nowrap" }}>{t.dueOn && t.status !== "done" ? (isLate(t) ? `En retard · ${dueLabel(t.dueOn)}` : dueLabel(t.dueOn)) : ""}</span>
          {avatar(t, 28)}
        </div>
      ))}
      {listRows.length > limit.todo + limit.doing && (
        <button type="button" className="tv-link" style={{ display: "block", margin: "14px 0 0", fontSize: 13 }} onClick={() => setLimit((l) => ({ ...l, todo: l.todo + 20, doing: l.doing + 20 }))}>
          Voir plus ({listRows.length - limit.todo - limit.doing})
        </button>
      )}
    </div>
  );

  const open = (showArchived ? archived : tasks)?.find((t) => t.id === openId) ?? tasks?.find((t) => t.id === openId) ?? null;

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + GR_CSS + CSS}</style>
      <section className="hz">
        <div style={{ minWidth: 0 }}>
          <h2 className="hz-title">
            {!tasks ? <span className="mute">…</span> : mineOpen.length
              ? <><span style={{ color: C.coral }}>{mineOpen.length}</span> {plural(mineOpen.length, "tâche")} pour vous<span className="mute">{mineLate ? `, dont ${mineLate} en retard.` : "."}</span></>
              : <>Rien à faire <span style={{ color: C.sage }}>pour vous</span><span className="mute">. Beau travail.</span></>}
          </h2>
          <p className="hz-sub">{tasks ? `${openAll} ${plural(openAll, "tâche ouverte", "tâches ouvertes")} dans l'équipe · ${doneWeek} ${plural(doneWeek, "terminée")} ces 7 derniers jours.` : ""}</p>
          <div style={{ marginTop: 18 }}><Button variant="primary" onClick={() => setEditing("new")} icon={<Plus style={{ width: 15, height: 15 }} />}>Nouvelle tâche</Button></div>
        </div>
        <TeamFaces title="Qui a quoi" rows={faces} />
      </section>

      <div style={{ display: "flex", alignItems: "baseline", gap: 24, flexWrap: "wrap", marginBottom: 22 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 15, lineHeight: 2, color: C.t2, minWidth: 240 }}>
          <Opts value={scope} onChange={(v: Scope) => { setScope(v); if (v === "archived") pickView("list"); }}
            options={[{ v: "mine", label: `Pour moi${tasks ? ` (${mineOpen.length})` : ""}` }, { v: "all", label: "Toute l'équipe" }, { v: "created", label: "Créées par moi" }, { v: "archived", label: "Archivées" }]} />
        </p>
        {!showArchived && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: C.t2 }}>
            <Opts value={view} onChange={pickView} options={[{ v: "board", label: "Colonnes" }, { v: "list", label: "Liste" }]} />
          </p>
        )}
      </div>
      {err && <div style={{ marginBottom: 14 }}><Notice tone="err">{err}</Notice></div>}
      {note && <p style={{ margin: "0 0 14px", fontSize: 13.5, color: C.t2 }}>{note}</p>}
      {!tasks && <p style={{ fontSize: 13, color: C.t3 }}>Chargement des tâches…</p>}
      {tasks && (view === "board" && !showArchived ? board : list)}

      {editing && <TaskForm task={editing === "new" ? null : editing} members={members} me={me} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); changed(); if (id) setOpenId(id); }} />}
      {open && !editing && <TaskPanel task={open} me={me} admin={admin} canStatus={canStatus(open)} who={who(open)} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} onChanged={changed}
        onOpenOrder={onOpenOrder} onShowClient={onShowClient} />}
    </div>
  );
}
