import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Pin, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ROLES, roleLabel, type Role } from "@/lib/roles";
import {
  STATUS_LABEL, archiveTask, audienceLabel, audienceMembers, commentTask, findOrder, isLate, isMine, loadMembers, loadNotes, loadTasks,
  markNotesRead, notifyAssignees, peekMembers, postNote, replyNote, saveTask, searchClients, setNote, setTaskStatus, todayToronto,
  type Audience, type TaskInput, type TaskStatus, type TeamNote, type TeamTask,
} from "@/lib/teamSpace";
import type { LiveTeamMember } from "@/lib/adminTeam";
import { C, FONT } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { Section } from "./layout";
import { GR_CSS, Opts } from "./GrowthPanel";

/**
 * Équipe › Notes et Tâches : la communication interne. Une note va à toute l'équipe ou à un poste ;
 * on voit qui l'a lue et on y répond. Une tâche est confiée à une personne, à un poste, ou à toute
 * l'équipe, avec une échéance et un lien vers un client ou une commande.
 */

export const TV_CSS = `
.tv-go { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; }
.tv-go:disabled { cursor: default; opacity: .45; }
.tv-go:focus-visible, .tv-link:focus-visible, .tv-row:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.tv-go svg { transition: transform .15s; }
@media (hover: hover) { .tv-go:not(:disabled):hover svg { transform: translateX(3px); } }
.tv-link { all: unset; cursor: pointer; color: var(--a-t3); font-size: 12.5px; }
.tv-link:hover { color: var(--a-t1); text-decoration: underline; text-underline-offset: 3px; }
.tv-ta { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--a-bd); background: transparent; padding: 8px 0 9px; font: inherit; font-size: 15px; line-height: 1.55; color: var(--a-t1); outline: none; resize: vertical; min-height: 44px; }
.tv-ta:focus { border-bottom-color: var(--a-t1); }
.tv-ta::placeholder { color: var(--a-t3); }
.tv-sel { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--a-bd); background: transparent; padding: 8px 0 9px; font: inherit; font-size: 15px; color: var(--a-t1); outline: none; color-scheme: light dark; }
.tv-row { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: baseline; gap: 14px; width: 100%; padding: 13px 0; border-bottom: 1px solid var(--a-bds); }
@media (hover: hover) { .tv-row:hover .tv-title { text-decoration: underline; text-underline-offset: 3px; } }
.tv-check { all: unset; cursor: pointer; box-sizing: border-box; width: 22px; height: 22px; border-radius: 99px; flex-shrink: 0; box-shadow: inset 0 0 0 1.5px var(--a-bd);
  display: inline-flex; align-items: center; justify-content: center; color: transparent; transition: box-shadow .15s, color .15s, background .15s; }
@media (hover: hover) { .tv-check:hover { box-shadow: inset 0 0 0 1.5px var(--a-sage); color: var(--a-sage); } }
.tv-check[data-done="true"] { background: var(--a-sage); box-shadow: none; color: var(--a-bg); }
.tv-check:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.tv-face { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--a-bds); font-size: 14px; }
.tv-face:last-child { border-bottom: none; }
`;

/** Couleur stable par personne : la même partout (notes, tâches, Mon espace). */
const HUES = ["var(--a-vzGreen)", "var(--a-vzIndigo)", "var(--a-vzCoral)", "var(--a-sun)", "var(--a-sage)"];
const hueOf = (name: string) => HUES[[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

export function TeamAvatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const hue = hueOf(name);
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: 99, flexShrink: 0, background: `color-mix(in srgb, ${hue} 22%, transparent)`, color: hue,
      fontSize: size * 0.38, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, letterSpacing: "-0.02em",
    }}>{initials}</span>
  );
}

/** L'équipe, une personne par ligne, avec ce qui la concerne (à droite des en-têtes). */
export function TeamFaces({ title, rows }: { title: string; rows: { id: string; name: string; you?: boolean; text: string; strong?: boolean }[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p style={{ margin: "0 0 4px", fontSize: 12.5, color: C.t3 }}>{title}</p>
      {rows.map((r) => (
        <div key={r.id} className="tv-face">
          <TeamAvatar name={r.name} size={28} />
          <span style={{ flex: 1, minWidth: 0, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}{r.you && <span style={{ color: C.t3 }}> (vous)</span>}</span>
          <span style={{ fontSize: 13, color: r.strong ? C.t1 : C.t3, fontWeight: r.strong ? 600 : 400, whiteSpace: "nowrap" }}>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  if (mins < 60 * 20 && d.getDate() === now.getDate()) return `aujourd'hui à ${d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) + ` à ${d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`;
};
const dueLabel = (d: string) => {
  const t = todayToronto();
  if (d === t) return "aujourd'hui";
  const tomorrow = new Date(`${t}T12:00:00`); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d === tomorrow.toLocaleDateString("en-CA")) return "demain";
  return new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" });
};
const AUDIENCES: { v: Audience; label: string }[] = [{ v: "all", label: "Toute l'équipe" }, ...ROLES.map((r) => ({ v: r.id as Audience, label: r.label }))];

/** Rafraîchit quand l'équipe écrit (temps réel), avec un filet de sécurité toutes les 30 s. */
export function useTeamLive(onChange: () => void, tables: string[]) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(",");
  useEffect(() => {
    let timer: number | undefined;
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => cb.current(), 300); };
    let ch = supabase.channel(`team-${key}-${Math.random().toString(36).slice(2, 8)}`);
    for (const t of key.split(",")) ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, soon);
    ch.subscribe();
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") cb.current(); }, 30_000);
    return () => { supabase.removeChannel(ch); window.clearInterval(poll); window.clearTimeout(timer); };
  }, [key]);
}

function useMembers() {
  const [m, setM] = useState<LiveTeamMember[]>(peekMembers);
  useEffect(() => { loadMembers().then((l) => { if (l.length) setM(l); }).catch(() => undefined); }, []);
  return m;
}

/* ═══════════════ Notes ═══════════════ */

export function TeamNotesView({ onChanged }: { onChanged?: () => void }) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const admin = roles.includes("admin");
  const members = useMembers();
  const [view, setView] = useState<"recent" | "archived">("recent");
  const [notes, setNotes] = useState<TeamNote[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [aud, setAud] = useState<Audience>("all");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { loadNotes(view === "archived").then((n) => { setNotes(n); setErr(null); }).catch((e: Error) => setErr(e.message)); }, [view]);
  useEffect(() => { setNotes(null); load(); }, [load]);
  useTeamLive(load, ["team_notes", "team_note_replies"]);

  // Ce qui s'affiche est lu : on le marque après un court instant.
  const unread = useMemo(() => (notes ?? []).filter((n) => n.authorId !== me && !n.readBy.some((r) => r.userId === me)).map((n) => n.id), [notes, me]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!unread.length) return;
    setFresh((s) => new Set([...s, ...unread]));
    const t = window.setTimeout(() => { markNotesRead(unread).then(() => onChanged?.()); }, 1500);
    return () => window.clearTimeout(t);
  }, [unread, onChanged]);

  // Pour chaque membre : les notes qui lui sont destinées et qu'il n'a pas encore lues.
  const faces = members.map((m) => {
    const pending = (notes ?? []).filter((n) => n.authorId !== m.userId && audienceMembers([m], n.audience).length > 0 && !n.readBy.some((r) => r.userId === m.userId)).length;
    return { id: m.userId, name: m.name, you: m.userId === me, text: pending ? `${pending} à lire` : "à jour ✓", strong: pending > 0 };
  });
  const pinnedNotes = (notes ?? []).filter((n) => n.pinned);
  const otherNotes = (notes ?? []).filter((n) => !n.pinned);
  const myName = members.find((m) => m.userId === me)?.name ?? user?.name ?? "Vous";

  const publish = async () => {
    setBusy(true); setErr(null);
    const r = await postNote(body, aud, admin && pin);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setBody(""); setPin(false); load(); onChanged?.();
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + GR_CSS}</style>
      <section className="hz">
        <div style={{ minWidth: 0 }}>
          <h2 className="hz-title">
            {!notes ? <span className="mute">…</span> : view === "archived" ? <>Les notes <span className="mute">archivées.</span></>
              : fresh.size ? <><span style={{ color: C.coral }}>{fresh.size}</span> {plural(fresh.size, "nouvelle note")} <span className="mute">depuis votre dernière visite.</span></>
                : <>Vous êtes <span style={{ color: C.sage }}>à jour</span> <span className="mute">avec l'équipe.</span></>}
          </h2>
          <p className="hz-sub">
            {notes ? `${notes.length} ${plural(notes.length, "note")}${pinnedNotes.length ? `, dont ${pinnedNotes.length} ${plural(pinnedNotes.length, "épinglée")}` : ""}. ` : ""}
            Un mot à toute l'équipe ou à un poste : chacun le voit en ouvrant le back-office, et vous savez qui l'a lu.
          </p>
        </div>
        {view === "recent" && <TeamFaces title="Qui est à jour" rows={faces} />}
      </section>
      <div style={{ maxWidth: 720, display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ paddingTop: 6 }}><TeamAvatar name={myName} size={34} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
        <textarea className="tv-ta" rows={2} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Écrire une note à l'équipe…" style={{ fontSize: 16 }} />
        <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 2, color: C.t2 }}>
          Pour <Opts value={aud} onChange={setAud} options={AUDIENCES} />
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 10, flexWrap: "wrap" }}>
          {admin && (
            <span className="gr-opts" style={{ fontSize: 14.5 }}>
              <button type="button" aria-pressed={pin} onClick={() => setPin((v) => !v)}>{pin ? "Épinglée en haut" : "Épingler en haut"}</button>
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="tv-go" disabled={busy || !body.trim()} onClick={publish}>{busy ? "Publication…" : "Publier"} <ArrowRight style={{ width: 15, height: 15 }} /></button>
        </div>
        </div>
      </div>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}

      <Section title={view === "recent" ? "Notes de l'équipe" : "Notes archivées"}
        actions={<span style={{ fontSize: 14 }}><Opts value={view} onChange={setView} options={[{ v: "recent", label: "Récentes" }, { v: "archived", label: "Archivées" }]} /></span>}>
        <div style={{ maxWidth: 720 }}>
          {!notes && <p style={{ fontSize: 13, color: C.t3 }}>Chargement des notes…</p>}
          {notes?.length === 0 && <p style={{ margin: 0, padding: "18px 0", fontSize: 13.5, color: C.t3 }}>{view === "recent" ? "Aucune note pour l'instant. La première sera la vôtre." : "Aucune note archivée."}</p>}
          {pinnedNotes.length > 0 && <p style={{ margin: "8px 0 0", display: "flex", alignItems: "center", gap: 6, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.sun, fontWeight: 600 }}><Pin style={{ width: 13, height: 13 }} />Épinglé</p>}
          {pinnedNotes.map((n) => <NoteItem key={n.id} note={n} me={me} admin={admin} members={members} fresh={fresh.has(n.id)} onChanged={() => { load(); onChanged?.(); }} />)}
          {pinnedNotes.length > 0 && otherNotes.length > 0 && <p style={{ margin: "26px 0 0", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>Fil de l'équipe</p>}
          {otherNotes.map((n) => <NoteItem key={n.id} note={n} me={me} admin={admin} members={members} fresh={fresh.has(n.id)} onChanged={() => { load(); onChanged?.(); }} />)}
        </div>
      </Section>
    </div>
  );
}

function NoteItem({ note: n, me, admin, members, fresh, onChanged }: { note: TeamNote; me: string; admin: boolean; members: LiveTeamMember[]; fresh: boolean; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  const [readers, setReaders] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const audience = audienceMembers(members, n.audience).filter((m) => m.userId !== n.authorId);
  const readIds = new Set(n.readBy.map((r) => r.userId));
  const read = audience.filter((m) => readIds.has(m.userId));
  const act = async (p: Promise<{ error?: string }>) => { const r = await p; if (r.error) setErr(r.error); else { setErr(null); onChanged(); } };
  return (
    <article style={{ padding: "22px 0", borderBottom: `1px solid ${C.bds}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <TeamAvatar name={n.authorName} size={36} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 14.5, color: C.t1, fontWeight: 600 }}>{n.authorId === me ? "Vous" : n.authorName}
            {fresh && <span style={{ fontSize: 12.5, color: C.coral, fontWeight: 600 }}> · nouvelle</span>}</span>
          <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 1 }}>à {n.audience === "all" ? "toute l'équipe" : `l'équipe ${audienceLabel(n.audience)}`} · {when(n.at)}</span>
        </span>
      </div>
      <p style={{ margin: "12px 0 0 48px", fontSize: 16, lineHeight: 1.6, color: C.t1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{n.body}</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "12px 0 0 48px", alignItems: "baseline" }}>
        {audience.length > 0 && (
          <button type="button" className="tv-link" onClick={() => setReaders((v) => !v)}>Lu par {read.length} sur {audience.length}</button>
        )}
        {!n.archived && <button type="button" className="tv-link" onClick={() => setOpen((v) => !v)}>{n.replies.length ? `${n.replies.length} réponse${n.replies.length > 1 ? "s" : ""}` : "Répondre"}</button>}
        {admin && !n.archived && <button type="button" className="tv-link" onClick={() => act(setNote(n.id, { pinned: !n.pinned }))}>{n.pinned ? "Désépingler" : "Épingler"}</button>}
        {(admin || n.authorId === me) && <button type="button" className="tv-link" onClick={() => act(setNote(n.id, { archived: !n.archived }))}>{n.archived ? "Remettre" : "Archiver"}</button>}
      </div>
      {readers && audience.length > 0 && (
        <p style={{ margin: "8px 0 0 48px", fontSize: 13, lineHeight: 1.7, color: C.t3 }}>
          {audience.map((m, i) => <span key={m.userId}>{i ? " · " : ""}<span style={{ color: readIds.has(m.userId) ? C.t1 : C.t3 }}>{m.name}{readIds.has(m.userId) ? " ✓" : ""}</span></span>)}
        </p>
      )}
      {(open || n.replies.length > 0) && (
        <div style={{ margin: "14px 0 0 48px" }}>
          {n.replies.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, padding: "8px 0" }}>
              <TeamAvatar name={r.authorName} size={24} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>{r.authorId === me ? "Vous" : r.authorName}</span>
                <span style={{ fontSize: 12, color: C.t3 }}> · {when(r.at)}</span>
                <span style={{ display: "block", margin: "2px 0 0", fontSize: 14, lineHeight: 1.55, color: C.t2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{r.body}</span>
              </span>
            </div>
          ))}
          {open && !n.archived && (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginTop: 6 }}>
              <textarea className="tv-ta" rows={1} value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} placeholder="Votre réponse…" style={{ fontSize: 14 }} />
              <button type="button" className="tv-go" disabled={!reply.trim()} onClick={async () => { const r = await replyNote(n.id, reply); if (r.error) setErr(r.error); else { setReply(""); onChanged(); } }}>
                Répondre <ArrowRight style={{ width: 15, height: 15 }} />
              </button>
            </div>
          )}
        </div>
      )}
      {err && <div style={{ margin: "10px 0 0 48px" }}><Notice tone="err">{err}</Notice></div>}
    </article>
  );
}

/* ═══════════════ Tâches ═══════════════ */

type TaskFilter = "mine" | "all" | "created" | "done" | "archived";

export function TeamTasksView({ onChanged, onOpenOrder, onShowClient }: { onChanged?: () => void; onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const members = useMembers();
  const [filter, setFilter] = useState<TaskFilter>("mine");
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamTask | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const archived = filter === "archived";
  const [archivedTasks, setArchivedTasks] = useState<TeamTask[] | null>(null);
  const load = useCallback(() => {
    loadTasks(false).then((t) => { setTasks(t); setErr(null); }).catch((e: Error) => setErr(e.message));
    if (archived) loadTasks(true).then(setArchivedTasks).catch((e: Error) => setErr(e.message));
  }, [archived]);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_task_comments"]);
  const changed = () => { load(); onChanged?.(); };

  const list = archived ? archivedTasks : tasks;
  const shown = (list ?? []).filter((t) => {
    if (filter === "mine") return isMine(t, me, roles) && t.status !== "done";
    if (filter === "created") return t.createdBy === me && t.status !== "done";
    if (filter === "done") return t.status === "done";
    if (filter === "all") return t.status !== "done";
    return true;
  });
  const groups: { label: string; rows: TeamTask[] }[] = filter === "done" || filter === "archived"
    ? [{ label: "", rows: shown }]
    : [
      { label: "En retard", rows: shown.filter(isLate) },
      { label: "En cours", rows: shown.filter((t) => !isLate(t) && t.status === "doing") },
      { label: "À faire", rows: shown.filter((t) => !isLate(t) && t.status === "todo") },
    ].filter((g) => g.rows.length);
  const count = (f: TaskFilter) => (tasks ?? []).filter((t) => f === "mine" ? isMine(t, me, roles) && t.status !== "done" : f === "created" ? t.createdBy === me && t.status !== "done" : f === "all" ? t.status !== "done" : f === "done" ? t.status === "done" : true).length;
  const open = list?.find((t) => t.id === openId) ?? null;
  const mineOpen = (tasks ?? []).filter((t) => isMine(t, me, roles) && t.status !== "done");
  const mineLate = mineOpen.filter(isLate).length;
  const openAll = (tasks ?? []).filter((t) => t.status !== "done").length;
  const doneWeek = (tasks ?? []).filter((t) => t.status === "done" && t.doneAt && Date.now() - new Date(t.doneAt).getTime() < 7 * 86_400_000).length;
  const faces = members.map((m) => {
    const n = (tasks ?? []).filter((t) => t.status !== "done" && isMine(t, m.userId, m.roles)).length;
    const late = (tasks ?? []).filter((t) => isLate(t) && isMine(t, m.userId, m.roles)).length;
    return { id: m.userId, name: m.name, you: m.userId === me, text: n ? `${n} ${plural(n, "tâche")}${late ? ` · ${late} en retard` : ""}` : "rien en attente", strong: late > 0, n };
  }).sort((a, b) => b.n - a.n);
  const admin = roles.includes("admin");
  const toggleDone = async (t: TeamTask) => { const r = await setTaskStatus(t.id, t.status === "done" ? "todo" : "done"); if (r.error) setErr(r.error); else changed(); };
  const who = (t: TeamTask) => t.assigneeId ? (t.assigneeId === me ? "Vous" : members.find((m) => m.userId === t.assigneeId)?.name ?? "Un membre") : t.assigneeRole ? roleLabel(t.assigneeRole) : "Toute l'équipe";

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + GR_CSS}</style>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, flex: 1, fontSize: 15, lineHeight: 2, color: C.t2, minWidth: 260 }}>
          <Opts value={filter} onChange={setFilter} options={[
            { v: "mine", label: `Pour moi${tasks && !archived ? ` (${count("mine")})` : ""}` }, { v: "all", label: "Toutes" },
            { v: "created", label: "Créées par moi" }, { v: "done", label: "Faites" }, { v: "archived", label: "Archivées" },
          ]} />
        </p>
      </div>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
      <div style={{ maxWidth: 820 }}>
        {!list && <p style={{ marginTop: 24, fontSize: 13, color: C.t3 }}>Chargement des tâches…</p>}
        {list && shown.length === 0 && (
          <p style={{ margin: "26px 0 0", fontSize: 14, color: C.t3 }}>
            {filter === "mine" ? "Rien à faire pour vous. ✓" : filter === "done" ? "Aucune tâche terminée." : filter === "archived" ? "Aucune tâche archivée." : "Aucune tâche en cours."}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label || "all"} style={{ marginTop: 22 }}>
            {g.label && <p style={{ margin: "0 0 2px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: g.label === "En retard" ? C.t1 : C.t3, fontWeight: g.label === "En retard" ? 600 : 400 }}>{g.label} · {g.rows.length}</p>}
            {g.rows.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: `1px solid ${C.bds}` }}>
                {!t.archived && (admin || t.createdBy === me || isMine(t, me, roles)) && (
                  <button type="button" className="tv-check" data-done={t.status === "done"} onClick={() => toggleDone(t)}
                    aria-label={t.status === "done" ? "Remettre à faire" : "Marquer fait"} title={t.status === "done" ? "Remettre à faire" : "Marquer fait"}>
                    <Check style={{ width: 13, height: 13 }} strokeWidth={3} />
                  </button>
                )}
              <button type="button" className="tv-row" onClick={() => setOpenId(t.id)} style={{ borderBottom: "none", alignItems: "center" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="tv-title" style={{ display: "block", fontSize: 15, color: t.status === "done" ? C.t3 : C.t1, textDecoration: t.status === "done" ? "line-through" : undefined }}>{t.title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 3 }}>
                    {who(t)}{t.clientName ? ` · ${t.clientName}` : ""}{t.orderRef ? ` · ${t.orderRef}` : ""}{t.comments.length ? ` · ${t.comments.length} commentaire${t.comments.length > 1 ? "s" : ""}` : ""}
                    {t.status === "done" && t.doneByName ? ` · fait par ${t.doneByName}` : ""}
                  </span>
                </span>
                <span style={{ fontSize: 13, color: isLate(t) ? C.t1 : C.t3, fontWeight: isLate(t) ? 600 : 400, whiteSpace: "nowrap" }}>
                  {t.status === "done" ? (t.doneAt ? when(t.doneAt) : "") : t.dueOn ? (isLate(t) ? `en retard · ${dueLabel(t.dueOn)}` : dueLabel(t.dueOn)) : STATUS_LABEL[t.status]}
                </span>
              </button>
                <span title={who(t)} style={{ display: "inline-flex" }}><TeamAvatar name={t.assigneeId ? (members.find((m) => m.userId === t.assigneeId)?.name ?? "?") : who(t)} size={26} /></span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {editing && <TaskForm task={editing === "new" ? null : editing} members={members} me={me} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); changed(); if (id) setOpenId(id); }} />}
      {open && !editing && <TaskPanel task={open} me={me} admin={admin} canStatus={admin || open.createdBy === me || isMine(open, me, roles)} who={who(open)} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} onChanged={changed}
        onOpenOrder={onOpenOrder} onShowClient={onShowClient} />}
    </div>
  );
}

function TaskPanel({ task: t, me, admin, canStatus, who, onClose, onEdit, onChanged, onOpenOrder, onShowClient }: {
  task: TeamTask; me: string; admin: boolean; canStatus: boolean; who: string; onClose: () => void; onEdit: () => void; onChanged: () => void;
  onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const act = async (p: Promise<{ error?: string }>, after?: () => void) => { const r = await p; if (r.error) setErr(r.error); else { setErr(null); onChanged(); after?.(); } };
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", gap: 16, padding: "8px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 14 }}>
      <span style={{ width: 110, color: C.t3, flexShrink: 0 }}>{k}</span><span style={{ color: C.t1, minWidth: 0 }}>{v}</span>
    </div>
  );
  return (
    <SidePanel title={t.title} subtitle={`Créée par ${t.createdBy === me ? "vous" : t.createdByName} · ${when(t.at)}`} onClose={onClose} width={560}>
      <style>{TV_CSS + GR_CSS}</style>
      {!t.archived && canStatus && (
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 2, color: C.t2 }}>
          <Opts value={t.status} onChange={(s: TaskStatus) => act(setTaskStatus(t.id, s))} options={(["todo", "doing", "done"] as TaskStatus[]).map((s) => ({ v: s, label: STATUS_LABEL[s] }))} />
        </p>
      )}
      {t.details && <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, color: C.t1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{t.details}</p>}
      <div style={{ marginTop: 16 }}>
        {row("Pour", who)}
        {row("Échéance", t.dueOn ? `${dueLabel(t.dueOn)}${isLate(t) ? " · en retard" : ""}` : "Aucune")}
        {t.clientId && row("Client", onShowClient ? <button type="button" className="tv-link" style={{ fontSize: 14, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => onShowClient(t.clientId!)}>{t.clientName}</button> : t.clientName)}
        {t.orderId && row("Commande", onOpenOrder ? <button type="button" className="tv-link" style={{ fontSize: 14, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => onOpenOrder(t.orderId!)}>{t.orderRef}</button> : t.orderRef)}
        {t.status === "done" && t.doneByName && row("Fait par", `${t.doneByName}${t.doneAt ? ` · ${when(t.doneAt)}` : ""}`)}
      </div>

      <p style={{ margin: "24px 0 4px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>Commentaires</p>
      {t.comments.length === 0 && <p style={{ margin: "4px 0 0", fontSize: 13, color: C.t3 }}>Aucun commentaire.</p>}
      {t.comments.map((c) => (
        <div key={c.id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.bds}` }}>
          <span style={{ fontSize: 13, color: C.t1, fontWeight: 500 }}>{c.authorName}</span><span style={{ fontSize: 12, color: C.t3 }}> · {when(c.at)}</span>
          <p style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.55, color: C.t2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{c.body}</p>
        </div>
      ))}
      {!t.archived && (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginTop: 8 }}>
          <textarea className="tv-ta" rows={1} value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder="Ajouter un commentaire…" style={{ fontSize: 14 }} />
          <button type="button" className="tv-go" disabled={!comment.trim()} onClick={() => act(commentTask(t.id, comment), () => setComment(""))}>Envoyer <ArrowRight style={{ width: 15, height: 15 }} /></button>
        </div>
      )}

      {!t.archived && (
        <div style={{ display: "flex", gap: 22, marginTop: 28, flexWrap: "wrap" }}>
          {(admin || t.createdBy === me) && <button type="button" className="tv-go" onClick={onEdit}>Modifier <ArrowRight style={{ width: 15, height: 15 }} /></button>}
          {(admin || t.createdBy === me) && <button type="button" className="tv-link" style={{ fontSize: 14 }} onClick={() => act(archiveTask(t.id), onClose)}>Archiver la tâche</button>}
        </div>
      )}
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}

type Who = "me" | "person" | "role" | "all";

function TaskForm({ task, members, me, onClose, onSaved }: { task: TeamTask | null; members: LiveTeamMember[]; me: string; onClose: () => void; onSaved: (id?: string) => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task?.title ?? "");
  const [details, setDetails] = useState(task?.details ?? "");
  const [whoKind, setWhoKind] = useState<Who>(task ? (task.assigneeId === me ? "me" : task.assigneeId ? "person" : task.assigneeRole ? "role" : "all") : "me");
  const others = members.filter((m) => m.userId !== me);
  const [person, setPerson] = useState(task?.assigneeId && task.assigneeId !== me ? task.assigneeId : others[0]?.userId ?? "");
  const [role, setRole] = useState<Role>(task?.assigneeRole ?? "operator");
  const [due, setDue] = useState(task?.dueOn ?? "");
  const [client, setClient] = useState<{ id: string; name: string } | null>(task?.clientId ? { id: task.clientId, name: task.clientName ?? "Client" } : null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; email: string }[]>([]);
  const [orderText, setOrderText] = useState(task?.orderRef ?? "");
  const [order, setOrder] = useState<{ id: string; ref: string } | null>(task?.orderId ? { id: task.orderId, ref: task.orderRef ?? "" } : null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!person && others[0]) setPerson(others[0].userId); }, [others, person]);
  useEffect(() => {
    if (client || q.trim().length < 2) { setFound([]); return; }
    const t = window.setTimeout(() => { searchClients(q).then(setFound).catch(() => setFound([])); }, 250);
    return () => window.clearTimeout(t);
  }, [q, client]);
  useEffect(() => {
    if (!orderText.trim() || order?.ref === orderText.trim().toUpperCase()) return;
    setOrder(null); setLooking(true);
    const t = window.setTimeout(() => { findOrder(orderText).then(setOrder).catch(() => setOrder(null)).finally(() => setLooking(false)); }, 300);
    return () => window.clearTimeout(t);
  }, [orderText, order?.ref]);

  const input: TaskInput = {
    title: title.trim(), details,
    assigneeId: whoKind === "me" ? me : whoKind === "person" ? person || null : null,
    assigneeRole: whoKind === "role" ? role : null,
    dueOn: due || null, clientId: client?.id ?? null, orderId: order?.id ?? null,
  };
  const orderBad = !!orderText.trim() && !order;
  const ok = !!input.title && !(whoKind === "person" && !person) && !orderBad;
  const assigneeChanged = !task || task.assigneeId !== input.assigneeId || task.assigneeRole !== input.assigneeRole;

  const save = async () => {
    setBusy(true); setErr(null);
    const r = await saveTask(task?.id ?? null, input);
    if (r.error) { setBusy(false); setErr(r.error); return; }
    const by = members.find((m) => m.userId === me)?.name || user?.email || "Un membre";
    if (assigneeChanged) await notifyAssignees(input, by, me).catch(() => undefined);
    setBusy(false);
    onSaved(r.id);
  };

  return (
    <SidePanel title={task ? "Modifier la tâche" : "Nouvelle tâche"} subtitle="Qui la fait, pour quand, et à quoi elle se rapporte" onClose={onClose} width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><button type="button" className="tv-go" disabled={busy || !ok} onClick={save}>{busy ? "Enregistrement…" : task ? "Enregistrer" : "Créer la tâche"} <ArrowRight style={{ width: 15, height: 15 }} /></button></>}>
      <style>{TV_CSS + GR_CSS}</style>
      <label style={{ display: "block" }}><span style={{ fontSize: 12.5, color: C.t3 }}>Tâche</span>
        <input className="gr-in" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Rappeler le client au sujet de son virement" autoFocus /></label>
      <label style={{ display: "block", marginTop: 18 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Détails (facultatif)</span>
        <textarea className="tv-ta" rows={3} value={details} maxLength={4000} onChange={(e) => setDetails(e.target.value)} /></label>

      <p style={{ margin: "20px 0 0", fontSize: 12.5, color: C.t3 }}>Pour qui</p>
      <p style={{ margin: "2px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={whoKind} onChange={setWhoKind} options={[{ v: "me", label: "Moi" }, ...(others.length ? [{ v: "person" as Who, label: "Une personne" }] : []), { v: "role", label: "Un poste" }, { v: "all", label: "Toute l'équipe" }]} />
      </p>
      {whoKind === "person" && (
        <select className="tv-sel" value={person} onChange={(e) => setPerson(e.target.value)}>
          {others.map((m) => <option key={m.userId} value={m.userId}>{m.name} · {m.roles.map(roleLabel).join(", ")}</option>)}
        </select>
      )}
      {whoKind === "role" && (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}><Opts value={role} onChange={setRole} options={ROLES.map((r) => ({ v: r.id, label: r.label }))} /></p>
      )}
      {whoKind !== "me" && whoKind !== "all" && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.t3 }}>{whoKind === "person" ? "La personne reçoit un courriel." : "Chaque membre de ce poste reçoit un courriel."}</p>}

      <label style={{ display: "block", marginTop: 20 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Échéance (facultatif)</span>
        <input className="gr-in" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>

      <div style={{ marginTop: 20 }}>
        <span style={{ fontSize: 12.5, color: C.t3 }}>Client concerné (facultatif)</span>
        {client ? (
          <p style={{ margin: "8px 0 0", fontSize: 15, color: C.t1 }}>{client.name} <button type="button" className="tv-link" onClick={() => { setClient(null); setQ(""); }}>· retirer</button></p>
        ) : (
          <>
            <input className="gr-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou courriel" />
            {found.map((c) => (
              <button key={c.id} type="button" className="tv-row" style={{ padding: "9px 0" }} onClick={() => { setClient({ id: c.id, name: c.name }); setFound([]); }}>
                <span style={{ fontSize: 14, color: C.t1 }}>{c.name}</span><span style={{ fontSize: 12.5, color: C.t3 }}>{c.email}</span>
              </button>
            ))}
          </>
        )}
      </div>
      <label style={{ display: "block", marginTop: 20 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Commande concernée (facultatif)</span>
        <input className="gr-in" value={orderText} onChange={(e) => setOrderText(e.target.value)} placeholder="OOB-…" /></label>
      {orderBad && !looking && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.t3 }}>Aucune commande avec cette référence.</p>}
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}
