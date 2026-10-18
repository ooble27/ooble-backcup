import { useEffect, useRef, useState } from "react";
import { ArrowRight, Users } from "lucide-react";
import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ROLES, roleLabel, type Role } from "@/lib/roles";
import {
  STATUS_LABEL, archiveTask, commentTask, findOrder, isLate, loadMembers, notifyAssignees, peekMembers, saveTask, searchClients, setTaskStatus, todayToronto,
  type Audience, type TaskInput, type TaskStatus, type TeamTask,
} from "@/lib/teamSpace";
import type { LiveTeamMember } from "@/lib/adminTeam";
import { C } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
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
/* Pages de l'équipe : apparition en cascade à l'ouverture, coche qui rebondit ; le reste à plat. */
@keyframes tv-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes tv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes tv-tick { 0% { transform: scale(.4); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
.tv-rise { animation: tv-rise .5s cubic-bezier(.22,1,.36,1) both; }
.tv-in { animation: tv-in .4s cubic-bezier(.22,1,.36,1) both; }
.tv-check[data-done="true"] svg { animation: tv-tick .35s cubic-bezier(.34,1.56,.64,1); }
.tv-icon { all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center; color: var(--a-t3); transition: color .15s, background .15s; }
.tv-icon:hover { color: var(--a-t1); background: var(--a-hover3); }
.tv-icon:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.tv-badge { min-width: 20px; height: 20px; padding: 0 7px; border-radius: 99px; background: rgba(242,97,61,.12); color: var(--a-coral); font-size: 11.5px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
.tv-stack { display: inline-flex; }
.tv-stack > * { margin-left: -7px; box-shadow: 0 0 0 2px var(--a-bg); border-radius: 99px; }
.tv-stack > *:first-child { margin-left: 0; }
@media (prefers-reduced-motion: reduce) { .tv-rise, .tv-in, .tv-check[data-done="true"] svg { animation: none; } }
`;

/** Avatar illustré de chaque membre (style « Notionists », licence CC0), le même partout, tiré de son identifiant. */
const AVATARS = new Map<string, string>();
const avatarUri = (seed: string) => {
  let uri = AVATARS.get(seed);
  if (!uri) { uri = createAvatar(notionists, { seed, size: 96 }).toDataUri(); AVATARS.set(seed, uri); }
  return uri;
};

/** `id` : l'identifiant du membre (même dessin partout). `group` : un poste ou toute l'équipe. */
export function TeamAvatar({ name, id, size = 30, group }: { name: string; id?: string | null; size?: number; group?: boolean }) {
  if (group) {
    return (
      <span title={name} aria-hidden style={{ width: size, height: size, borderRadius: 99, flexShrink: 0, background: C.l3, color: C.t2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Users style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
      </span>
    );
  }
  return <img src={avatarUri(id || name)} alt="" title={name} width={size} height={size} style={{ width: size, height: size, borderRadius: 99, flexShrink: 0, background: "#ecebe7", boxShadow: "0 0 0 1px var(--a-bds)", display: "block" }} />;
}

/** L'équipe, une personne par ligne, avec ce qui la concerne (à droite des en-têtes). */
export function TeamFaces({ title, rows }: { title: string; rows: { id: string; name: string; you?: boolean; text: string; strong?: boolean }[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p style={{ margin: "0 0 4px", fontSize: 12.5, color: C.t3 }}>{title}</p>
      {rows.map((r) => (
        <div key={r.id} className="tv-face">
          <TeamAvatar name={r.name} id={r.id} size={30} />
          <span style={{ flex: 1, minWidth: 0, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}{r.you && <span style={{ color: C.t3 }}> (vous)</span>}</span>
          <span style={{ fontSize: 13, color: r.strong ? C.t1 : C.t3, fontWeight: r.strong ? 600 : 400, whiteSpace: "nowrap" }}>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

export const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  if (mins < 60 * 20 && d.getDate() === now.getDate()) return `aujourd'hui à ${d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) + ` à ${d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`;
};
export const dueLabel = (d: string) => {
  const t = todayToronto();
  if (d === t) return "aujourd'hui";
  const tomorrow = new Date(`${t}T12:00:00`); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d === tomorrow.toLocaleDateString("en-CA")) return "demain";
  return new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" });
};
export const AUDIENCES: { v: Audience; label: string }[] = [{ v: "all", label: "Toute l'équipe" }, ...ROLES.map((r) => ({ v: r.id as Audience, label: r.label }))];

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

export function useMembers() {
  const [m, setM] = useState<LiveTeamMember[]>(peekMembers);
  useEffect(() => { loadMembers().then((l) => { if (l.length) setM(l); }).catch(() => undefined); }, []);
  return m;
}

export function TaskPanel({ task: t, me, admin, canStatus, who, onClose, onEdit, onChanged, onOpenOrder, onShowClient }: {
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

export function TaskForm({ task, members, me, onClose, onSaved }: { task: TeamTask | null; members: LiveTeamMember[]; me: string; onClose: () => void; onSaved: (id?: string) => void }) {
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
