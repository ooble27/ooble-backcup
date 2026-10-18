import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Plus, Users, X } from "lucide-react";
import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ROLES, roleLabel, type Role } from "@/lib/roles";
import {
  PRESENCE_LABEL, STATUS_LABEL, archiveTask, checkTaskStep, firstName, commentTask, findOrder, hideChecklistTemplate, loadChecklistTemplates, saveChecklistTemplate, setTaskSteps, isLate, isMine, loadMembers, loadTasks, memberById, notifyAssignees, onMembersChange, peekMembers, removeTask, saveTask,
  searchClients, setTaskStatus, todayToronto,
  type AvatarBg, type Audience, type ChecklistTemplate, type NameColor, type TaskInput, type TaskStatus, type TeamMember, type TeamTask,
} from "@/lib/teamSpace";
import { C } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { GR_CSS, Opts } from "./GrowthPanel";

/**
 * Équipe › Notes et Tâches : la communication interne. Une note va à toute l'équipe ou à un poste ;
 * on voit qui l'a lue et on y répond. Une tâche est confiée à une personne, à un poste, ou à toute
 * l'équipe, avec une échéance et un lien vers un client ou une commande.
 */

export const TV_CSS = `
.tv-step { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--a-bds); -webkit-tap-highlight-color: transparent; }
.tv-step:disabled { cursor: default; }
.tv-step:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.tv-box { flex-shrink: 0; width: 18px; height: 18px; margin-top: 1px; border-radius: 6px; box-shadow: inset 0 0 0 1.5px var(--a-t3); display: inline-flex; align-items: center; justify-content: center; transition: background .15s, box-shadow .15s; }
.tv-step[aria-checked="true"] .tv-box { background: var(--a-t1); box-shadow: none; color: var(--a-bg); }
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
/* Menu déroulant d'un membre : champ souligné comme les autres, liste qui flotte par-dessus la page. */
.tv-dd { position: relative; margin-top: 4px; }
.tv-dd-btn { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px 0 9px; border-bottom: 1px solid var(--a-bd); -webkit-tap-highlight-color: transparent; }
.tv-dd-btn[aria-expanded="true"] { border-bottom-color: var(--a-t1); }
.tv-dd-btn:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.tv-dd-menu { position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 6px); max-height: 300px; overflow-y: auto; padding: 6px; border-radius: 14px; background: var(--a-l1); box-shadow: 0 0 0 1px var(--a-bd), 0 18px 40px -16px rgba(0,0,0,.45); }
.tv-dd-opt { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; -webkit-tap-highlight-color: transparent; }
.tv-dd-opt:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px; }
.tv-ms { position: relative; display: inline-block; }
.tv-ms-btn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 4px 0 5px; font-size: 15px; font-weight: 500; color: var(--a-t1); white-space: nowrap; border-bottom: 1px solid var(--a-bd); -webkit-tap-highlight-color: transparent; }
.tv-ms-btn[aria-expanded="true"] { border-bottom-color: var(--a-t1); }
.tv-ms-btn:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
/* Date : sur iPhone et iPad, le champ natif peut ignorer sa largeur et dépasser du panneau. */
.gr-in[type="date"] { min-width: 0; max-width: 100%; box-sizing: border-box; }
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
.tv-face-b { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 2px 12px; }
.tv-face-n, .tv-face-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-face-n { flex: 1; }
.tv-face-t { max-width: 55%; font-size: 13px; }
@media (max-width: 600px) { .tv-face-b { flex-direction: column; align-items: stretch; } .tv-face-t { max-width: none; } }
/* Pages de l'équipe : apparition en cascade à l'ouverture, coche qui rebondit ; le reste à plat. */
@keyframes tv-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes tv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes tv-tick { 0% { transform: scale(.4); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
.tv-rise { animation: tv-rise .5s cubic-bezier(.22,1,.36,1) both; }
.tv-in { animation: tv-in .4s cubic-bezier(.22,1,.36,1) both; }
.tv-check[data-done="true"] svg { animation: tv-tick .35s cubic-bezier(.34,1.56,.64,1); }
.tv-icon { all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center; color: var(--a-t3); transition: color .15s; -webkit-tap-highlight-color: transparent; }
.tv-icon:hover { color: var(--a-t1); }
.tv-icon:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.tv-badge { min-width: 20px; height: 20px; padding: 0 7px; border-radius: 99px; background: rgba(242,97,61,.12); color: var(--a-coral); font-size: 11.5px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
.tv-stack { display: inline-flex; }
.tv-stack > * { margin-left: -7px; box-shadow: 0 0 0 2px var(--a-bg); border-radius: 99px; }
.tv-stack > *:first-child { margin-left: 0; }
@media (prefers-reduced-motion: reduce) { .tv-rise, .tv-in, .tv-check[data-done="true"] svg { animation: none; } }
/* Couleur du nom de chaque membre : une teinte lisible sur fond sombre, une autre sur fond clair. */
.admin-scope { --tm-coral: #ff8a6b; --tm-orange: #ffa552; --tm-sun: #ffcf5c; --tm-sage: #7cc4a6; --tm-teal: #4fc8c0; --tm-indigo: #a3a9f5; --tm-blue: #6fb4ff; --tm-pink: #f48bbb; }
:root:not(.dark) .admin-scope { --tm-coral: #c8401d; --tm-orange: #ad5600; --tm-sun: #8a6200; --tm-sage: #1b7350; --tm-teal: #0a7069; --tm-indigo: #4a52c0; --tm-blue: #1b66b8; --tm-pink: #ad2d67; }
.tv-name { font-weight: 600; }
.tv-mention { font-weight: 600; border-radius: 4px; padding: 0 2px; }
`;

/** Fonds d'avatar : le clair d'origine, puis des tons pastel (le dessin reste lisible sur chacun). */
export const AVATAR_BG: Record<AvatarBg, string> = {
  light: "#ecebe7", coral: "#ffd2c4", orange: "#ffdcb5", sun: "#fff0bd", sage: "#c9ecdc", teal: "#c4ece9", indigo: "#dadcf7", blue: "#d0e5fb", pink: "#f9d3e4",
};
export const nameColor = (c: NameColor | undefined) => (c && c !== "white" ? `var(--tm-${c})` : C.t1);
const PRESENCE_DOT: Record<string, string> = { available: "var(--a-sage)", busy: "var(--a-sun)", away: "var(--a-t3)" };

/** Avatar illustré (style « Notionists », licence CC0) : dessin choisi par le membre, ou sa photo. */
const AVATARS = new Map<string, string>();
export const avatarUri = (seed: string) => {
  let uri = AVATARS.get(seed);
  if (!uri) { uri = createAvatar(notionists, { seed, size: 96 }).toDataUri(); AVATARS.set(seed, uri); }
  return uri;
};

/**
 * `id` : le membre (son dessin, sa photo, son fond). `group` : un poste ou toute l'équipe.
 * `presence` : petit point de statut (disponible, occupé, absent). `preview` : réglages en cours d'édition.
 */
export function TeamAvatar({ name, id, size = 30, group, presence, preview }: {
  name: string; id?: string | null; size?: number; group?: boolean; presence?: boolean;
  preview?: { seed: string | null; photo: string | null; bg: AvatarBg };
}) {
  if (group) {
    return (
      <span title={name} aria-hidden style={{ width: size, height: size, borderRadius: 99, flexShrink: 0, background: C.l3, color: C.t2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Users style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
      </span>
    );
  }
  const m = memberById(id);
  const look = preview ?? { seed: m?.seed ?? null, photo: m?.photo ?? null, bg: m?.bg ?? "light" };
  const src = look.photo || avatarUri(look.seed || id || name);
  const dot = presence && m ? PRESENCE_DOT[m.status] : null;
  return (
    <span title={m && m.status !== "available" ? `${name} · ${PRESENCE_LABEL[m.status]}` : name} style={{ position: "relative", display: "inline-flex", flexShrink: 0, width: size, height: size }}>
      <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: 99, objectFit: "cover", background: AVATAR_BG[look.bg] ?? AVATAR_BG.light, boxShadow: "0 0 0 1px var(--a-bds)", display: "block" }} />
      {dot && <span aria-hidden style={{ position: "absolute", right: -1, bottom: -1, width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28), borderRadius: 99, background: dot, boxShadow: "0 0 0 2px var(--a-bg)" }} />}
    </span>
  );
}

/** Nom d'un membre, dans sa couleur (comme dans les groupes de messagerie). */
export function TeamName({ id, name, you, full, style }: { id?: string | null; name: string; you?: boolean; full?: boolean; style?: React.CSSProperties }) {
  const m = memberById(id);
  // Le prénom seulement (le nom complet au survol) ; `full` pour choisir quelqu'un dans une liste.
  return <span className="tv-name" title={full ? undefined : name} style={{ color: nameColor(m?.color), ...style }}>{you ? "Vous" : full ? name : firstName(name)}</span>;
}

/** L'équipe, une personne par ligne, avec ce qui la concerne (à droite des en-têtes). */
export function TeamFaces({ title, rows, onPick }: { title: string; rows: { id: string; name: string; you?: boolean; text: string; strong?: boolean }[]; onPick?: (id: string) => void }) {
  if (!rows.length) return null;
  return (
    <div>
      <p style={{ margin: "0 0 4px", fontSize: 12.5, color: C.t3 }}>{title}</p>
      {rows.map((r) => (
        <div key={r.id} className="tv-face" onClick={onPick ? () => onPick(r.id) : undefined} style={onPick ? { cursor: "pointer" } : undefined}>
          <TeamAvatar name={r.name} id={r.id} size={32} presence />
          <span className="tv-face-b">
            <span className="tv-face-n" title={r.name}><TeamName id={r.id} name={r.name} />{r.you && <span style={{ color: C.t3 }}> (vous)</span>}</span>
            <span className="tv-face-t" title={r.text} style={{ color: r.strong ? C.t1 : C.t3, fontWeight: r.strong ? 600 : 400 }}>{r.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Nom d'un membre pour les textes (« Vous » pour soi). */
export const memberLabel = (members: TeamMember[], id: string, me: string) => {
  const name = members.find((m) => m.userId === id)?.name;
  return id === me ? "Vous" : name ? firstName(name) : "Un membre";
};

/** Ce qu'on dit d'un membre absent ou occupé, sinon `fallback`. */
export function presenceText(m: TeamMember | undefined, fallback: string) {
  if (!m || m.status === "available") return fallback;
  const until = m.status === "away" && m.statusUntil ? ` jusqu'au ${new Date(`${m.statusUntil}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}` : "";
  return `${PRESENCE_LABEL[m.status]}${until}${m.statusNote ? ` · ${m.statusNote}` : ""}`;
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

/** L'annuaire de l'équipe, tenu à jour quand un profil change (le sien ou celui d'un autre). */
export function useMembers() {
  const [m, setM] = useState<TeamMember[]>(peekMembers);
  useEffect(() => {
    const off = onMembersChange(() => { const l = peekMembers(); if (l.length) setM(l); });
    loadMembers().then((l) => { if (l.length) setM(l); }).catch(() => undefined);
    return off;
  }, []);
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
    <SidePanel title={t.title} subtitle={<>Créée par <TeamName id={t.createdBy} name={t.createdByName} you={t.createdBy === me} style={{ fontWeight: 500 }} /> · {when(t.at)}</>} onClose={onClose} width={560}>
      <style>{TV_CSS + GR_CSS}</style>
      {!t.archived && canStatus && (
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 2, color: C.t2 }}>
          <Opts value={t.status} onChange={(s: TaskStatus) => act(setTaskStatus(t.id, s))} options={(["todo", "doing", "done"] as TaskStatus[]).map((s) => ({ v: s, label: STATUS_LABEL[s] }))} />
        </p>
      )}
      {t.details && <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, color: C.t1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{t.details}</p>}
      {t.steps.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p style={{ margin: "0 0 2px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>
            Étapes · {t.steps.filter((x) => x.done).length} sur {t.steps.length}
          </p>
          {t.steps.map((st, i) => (
            <button key={i} type="button" className="tv-step" role="checkbox" aria-checked={st.done} disabled={t.archived || !canStatus}
              onClick={() => act(checkTaskStep(t.id, i, !st.done))}>
              <span className="tv-box">{st.done && <Check style={{ width: 13, height: 13 }} strokeWidth={3} />}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5, lineHeight: 1.4, color: st.done ? C.t3 : C.t1, textDecoration: st.done ? "line-through" : "none", overflowWrap: "anywhere" }}>{st.text}</span>
                {st.done && st.by && <span style={{ display: "block", marginTop: 1, fontSize: 12, color: C.t3 }}>{firstName(st.by)}{st.at ? ` · ${when(st.at)}` : ""}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        {row("Pour", who)}
        {row("Échéance", t.dueOn ? `${dueLabel(t.dueOn)}${isLate(t) ? " · en retard" : ""}` : "Aucune")}
        {t.clientId && row("Client", onShowClient ? <button type="button" className="tv-link" style={{ fontSize: 14, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => onShowClient(t.clientId!)}>{t.clientName}</button> : t.clientName)}
        {t.orderId && row("Commande", onOpenOrder ? <button type="button" className="tv-link" style={{ fontSize: 14, color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => onOpenOrder(t.orderId!)}>{t.orderRef}</button> : t.orderRef)}
        {t.status === "done" && t.doneByName && row("Fait par", `${firstName(t.doneByName)}${t.doneAt ? ` · ${when(t.doneAt)}` : ""}`)}
      </div>

      <p style={{ margin: "24px 0 4px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>Commentaires</p>
      {t.comments.length === 0 && <p style={{ margin: "4px 0 0", fontSize: 13, color: C.t3 }}>Aucun commentaire.</p>}
      {t.comments.map((c) => (
        <div key={c.id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.bds}` }}>
          <TeamName id={c.authorId} name={c.authorName} you={c.authorId === me} style={{ fontSize: 13 }} /><span style={{ fontSize: 12, color: C.t3 }}> · {when(c.at)}</span>
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
          {(admin || t.createdBy === me) && <button type="button" className="tv-link" style={{ fontSize: 14 }} onClick={() => act(archiveTask(t.id), onClose)}>Archiver</button>}
        </div>
      )}
      {(admin || t.createdBy === me) && (
        <p style={{ margin: "18px 0 0" }}>
          <button type="button" className="tv-link" style={{ fontSize: 13.5 }}
            onClick={() => { if (window.confirm("Retirer cette tâche ? Elle disparaîtra pour toute l'équipe.")) act(removeTask(t.id), onClose); }}>Retirer la tâche</button>
        </p>
      )}
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}

type Who = "me" | "person" | "role" | "all";

/**
 * Choix d'un membre : fermé, seule la personne choisie (avatar, nom, poste) ; ouvert, la liste de
 * l'équipe flotte par-dessus la page. Rien ne dépasse de la case, sur ordinateur comme sur téléphone.
 */
/** Un menu ouvert se referme en touchant ailleurs ou avec Échap. */
function useDismiss(open: boolean, close: () => void, box: React.RefObject<HTMLElement>) {
  const cb = useRef(close);
  cb.current = close;
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) cb.current(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") cb.current(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open, box]);
}

/** Menu déroulant compact : fermé, seul le choix en cours ; ouvert, les choix flottent par-dessus la page. */
export function MenuSelect<V extends string>({ value, options, onChange, label, align = "left" }: {
  value: V; options: { v: V; label: string }[]; onChange: (v: V) => void; label: string; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), box);
  const cur = options.find((o) => o.v === value);
  return (
    <div ref={box} className="tv-ms">
      <button type="button" className="tv-ms-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label} : ${cur?.label ?? ""}`} onClick={() => setOpen((v) => !v)}>
        {cur?.label}
        <ChevronDown style={{ width: 15, height: 15, color: C.t3, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <div className="tv-dd-menu tv-in" role="listbox" aria-label={label} style={{ right: align === "right" ? 0 : "auto", left: align === "left" ? 0 : "auto", minWidth: 210 }}>
          {options.map((o) => (
            <button key={o.v} type="button" role="option" aria-selected={o.v === value} className="tv-dd-opt" style={{ fontSize: 14.5, color: o.v === value ? C.t1 : C.t2 }} onClick={() => { onChange(o.v); setOpen(false); }}>
              <span style={{ flex: 1, whiteSpace: "nowrap" }}>{o.label}</span>
              {o.v === value && <Check style={{ width: 16, height: 16, color: C.t1, flexShrink: 0 }} strokeWidth={2.4} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonPicker({ members, value, onChange }: { members: TeamMember[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), box);
  const line = (m: TeamMember) => (
    <>
      <TeamAvatar id={m.userId} name={m.name} size={30} presence />
      <span style={{ flex: 1, minWidth: 0 }}>
        <TeamName id={m.userId} name={m.name} full style={{ display: "block", fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
        <span style={{ display: "block", marginTop: 1, fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.roles.map(roleLabel).join(", ")}</span>
      </span>
    </>
  );
  const sel = members.find((m) => m.userId === value);
  return (
    <div ref={box} className="tv-dd">
      <button type="button" className="tv-dd-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {sel ? line(sel) : <span style={{ flex: 1, fontSize: 14.5, color: C.t3 }}>Choisir une personne</span>}
        <ChevronDown style={{ width: 16, height: 16, color: C.t3, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <div className="tv-dd-menu tv-in" role="listbox" aria-label="Personne">
          {members.map((m) => (
            <button key={m.userId} type="button" role="option" aria-selected={m.userId === value} className="tv-dd-opt" onClick={() => { onChange(m.userId); setOpen(false); }}>
              {line(m)}
              {m.userId === value && <Check style={{ width: 16, height: 16, color: C.t1, flexShrink: 0 }} strokeWidth={2.4} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskForm({ task, members, me, onClose, onSaved, preset }: {
  task: TeamTask | null; members: TeamMember[]; me: string; onClose: () => void; onSaved: (id?: string) => void;
  /** Nouvelle tâche déjà rattachée (depuis la fiche d'un client ou une commande). */
  preset?: { client?: { id: string; name: string }; order?: { id: string; ref: string } };
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task?.title ?? "");
  const [details, setDetails] = useState(task?.details ?? "");
  const [whoKind, setWhoKind] = useState<Who>(task ? (task.assigneeId === me ? "me" : task.assigneeId ? "person" : task.assigneeRole ? "role" : "all") : "me");
  const others = members.filter((m) => m.userId !== me);
  const [person, setPerson] = useState(task?.assigneeId && task.assigneeId !== me ? task.assigneeId : others[0]?.userId ?? "");
  const [role, setRole] = useState<Role>(task?.assigneeRole ?? "operator");
  const [due, setDue] = useState(task?.dueOn ?? "");
  const [client, setClient] = useState<{ id: string; name: string } | null>(task?.clientId ? { id: task.clientId, name: task.clientName ?? "Client" } : preset?.client ?? null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; email: string }[]>([]);
  const [orderText, setOrderText] = useState(task?.orderRef ?? preset?.order?.ref ?? "");
  const [order, setOrder] = useState<{ id: string; ref: string } | null>(task?.orderId ? { id: task.orderId, ref: task.orderRef ?? "" } : preset?.order ?? null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstSteps = useRef((task?.steps ?? []).map((x) => x.text));
  const [steps, setSteps] = useState<string[]>(firstSteps.current);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [tplNote, setTplNote] = useState<string | null>(null);
  const stepBox = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadChecklistTemplates(me).then(setTemplates); }, [me]);
  useEffect(() => { if (!person && others[0]) setPerson(others[0].userId); }, [others, person]);
  const addStep = (after?: number) => {
    setSteps((l) => { const n = [...l]; n.splice(after === undefined ? n.length : after + 1, 0, ""); return n; });
    window.setTimeout(() => {
      const inputs = stepBox.current?.querySelectorAll("input");
      const el = inputs?.[after === undefined ? inputs.length - 1 : after + 1] as HTMLInputElement | undefined;
      el?.focus();
    }, 0);
  };
  const pickTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setSteps(tpl.steps);
    if (!title.trim()) setTitle(tpl.name);
  };
  const keepAsTemplate = async () => {
    const clean = steps.map((x) => x.trim()).filter(Boolean);
    const name = window.prompt("Nom du modèle", title.trim() || "Ma liste");
    if (!name?.trim()) return;
    const r = await saveChecklistTemplate(name, clean);
    if (r.error) { setTplNote(r.error); return; }
    setTplNote(`Modèle « ${name.trim()} » enregistré : il sera proposé à toute l'équipe.`);
    void loadChecklistTemplates(me).then(setTemplates);
  };
  const dropTemplate = async (tpl: ChecklistTemplate) => {
    if (!window.confirm(`Ne plus proposer le modèle « ${tpl.name} » ?`)) return;
    const r = await hideChecklistTemplate(tpl.id);
    if (r.error) setTplNote(r.error); else { setTplNote(null); void loadChecklistTemplates(me).then(setTemplates); }
  };
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
    const clean = steps.map((x) => x.trim()).filter(Boolean);
    if (r.id && JSON.stringify(clean) !== JSON.stringify(firstSteps.current)) {
      const st = await setTaskSteps(r.id, clean);
      if (st.error) { setBusy(false); setErr(st.error); return; }
    }
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

      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: C.t3 }}>Étapes à cocher (facultatif)</span>
          {templates.length > 0 && (
            <MenuSelect label="Partir d'un modèle" align="right" value={"" as string} onChange={pickTemplate}
              options={[{ v: "", label: "Partir d'un modèle" }, ...templates.map((x) => ({ v: x.id, label: x.name }))]} />
          )}
        </div>
        <div ref={stepBox}>
          {steps.map((st, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 18, fontSize: 12.5, color: C.t3, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
              <input className="gr-in" value={st} maxLength={200} placeholder="Ex. Vérifier la pièce d'identité" style={{ flex: 1, minWidth: 0 }}
                onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep(i); } }} />
              <button type="button" className="tv-icon" title="Retirer l'étape" aria-label="Retirer l'étape" onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}
                style={{ all: "unset", cursor: "pointer", color: C.t3, display: "inline-flex", padding: 4 }}><X style={{ width: 15, height: 15 }} /></button>
            </div>
          ))}
        </div>
        <p style={{ margin: "10px 0 0", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <button type="button" className="tv-link" style={{ fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => addStep()}>
            <Plus style={{ width: 14, height: 14 }} />Ajouter une étape
          </button>
          {steps.some((x) => x.trim()) && <button type="button" className="tv-link" style={{ fontSize: 13.5 }} onClick={keepAsTemplate}>Enregistrer comme modèle</button>}
        </p>
        {templates.some((x) => x.mine) && (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>
            Mes modèles : {templates.filter((x) => x.mine).map((x, i) => (
              <span key={x.id}>{i > 0 && ", "}{x.name} <button type="button" className="tv-link" style={{ fontSize: 12.5 }} onClick={() => dropTemplate(x)}>(ne plus proposer)</button></span>
            ))}
          </p>
        )}
        {tplNote && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.t3 }}>{tplNote}</p>}
      </div>

      <p style={{ margin: "20px 0 0", fontSize: 12.5, color: C.t3 }}>Pour qui</p>
      <p style={{ margin: "2px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={whoKind} onChange={setWhoKind} options={[{ v: "me", label: "Moi" }, ...(others.length ? [{ v: "person" as Who, label: "Une personne" }] : []), { v: "role", label: "Un poste" }, { v: "all", label: "Toute l'équipe" }]} />
      </p>
      {whoKind === "person" && <PersonPicker members={others} value={person} onChange={setPerson} />}
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

/**
 * Les tâches d'un client ou d'une commande (fiche client, détail de commande) : ouvertes d'abord,
 * puis les faites. Un clic ouvre la tâche ; « Nouvelle tâche » la crée déjà rattachée.
 */
export function LinkedTasks({ clientId, clientName, orderId, orderRef: ref, onOpenOrder, onShowClient }: {
  clientId?: string; clientName?: string; orderId?: string; orderRef?: string;
  onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void;
}) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const admin = roles.includes("admin");
  const members = useMembers();
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamTask | "new" | null>(null);
  const load = useCallback(() => {
    loadTasks(false, { clientId, orderId }).then(setTasks).catch(() => setTasks([]));
  }, [clientId, orderId]);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_task_comments"]);

  const who = (t: TeamTask) => t.assigneeId ? memberLabel(members, t.assigneeId, me) : t.assigneeRole ? roleLabel(t.assigneeRole) : "Toute l'équipe";
  const list = [...(tasks ?? [])].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || b.at.localeCompare(a.at));
  const open = list.find((t) => t.id === openId) ?? null;
  return (
    <div>
      <style>{TV_CSS}</style>
      {tasks === null && <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>Chargement…</p>}
      {tasks && list.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: C.t3 }}>Aucune tâche pour {orderId ? "cette commande" : "ce client"}.</p>}
      {list.slice(0, 8).map((t) => (
        <button key={t.id} type="button" className="tv-row" style={{ padding: "10px 0", borderBottom: `1px solid ${C.bds}` }} onClick={() => setOpenId(t.id)}>
          <span style={{ display: "block", fontSize: 14, color: t.status === "done" ? C.t3 : C.t1, textDecoration: t.status === "done" ? "line-through" : "none", overflowWrap: "anywhere" }}>{t.title}</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3 }}>
            {STATUS_LABEL[t.status]} · {who(t)}{t.dueOn && t.status !== "done" ? ` · ${dueLabel(t.dueOn)}${isLate(t) ? " · en retard" : ""}` : ""}
          </span>
        </button>
      ))}
      {list.length > 8 && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>Et {list.length - 8} autres dans Tâches.</p>}
      <p style={{ margin: "12px 0 0" }}>
        <button type="button" className="tv-link" style={{ fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setEditing("new")}>
          <Plus style={{ width: 14, height: 14 }} />Nouvelle tâche
        </button>
      </p>
      {editing && (
        <TaskForm task={editing === "new" ? null : editing} members={members} me={me} onClose={() => setEditing(null)}
          preset={{ client: clientId ? { id: clientId, name: clientName ?? "Client" } : undefined, order: orderId ? { id: orderId, ref: ref ?? "" } : undefined }}
          onSaved={(id) => { setEditing(null); load(); if (id) setOpenId(id); }} />
      )}
      {open && !editing && (
        <TaskPanel task={open} me={me} admin={admin} canStatus={admin || open.createdBy === me || isMine(open, me, roles)} who={who(open)}
          onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} onChanged={load}
          onOpenOrder={onOpenOrder && ((id) => { setOpenId(null); onOpenOrder(id); })}
          onShowClient={onShowClient && ((id) => { setOpenId(null); onShowClient(id); })} />
      )}
    </div>
  );
}
