import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowUp, Hash, MessageSquare, Pin, PinOff, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import { audienceLabel, audienceMembers, loadNotes, markNotesRead, postNote, replyNote, setNote, type Audience, type TeamNote } from "@/lib/teamSpace";
import type { LiveTeamMember } from "@/lib/adminTeam";
import { C, FONT } from "./adminTheme";
import { Notice } from "./ui";
import { TeamAvatar, TV_CSS, hueOf, plural, useMembers, useTeamLive, when } from "./TeamViews";

/**
 * Équipe › Notes : une messagerie d'équipe. À gauche les canaux (toute l'équipe, puis un par poste)
 * avec leurs messages non lus ; au centre le fil en bulles, jour par jour, les notes épinglées en
 * haut ; en bas, la zone d'écriture (Entrée pour envoyer). On voit qui a lu chaque note.
 */

const CSS = `
.tn-wrap { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 18px; height: max(560px, calc(100dvh - 250px)); }
@media (max-width: 860px) { .tn-wrap { grid-template-columns: minmax(0, 1fr); height: auto; } .tn-side { display: none; } .tn-chips { display: flex !important; } .tn-feed { max-height: 64vh; } }
.tn-side { border-radius: 22px; padding: 14px 10px; background: color-mix(in srgb, var(--a-t1) 3.5%, var(--a-bg)); overflow-y: auto; }
.tn-ch { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 9px; height: 38px; padding: 0 10px; border-radius: 12px; font-size: 14px; color: var(--a-t2); transition: background .15s, color .15s; }
.tn-ch:hover { background: color-mix(in srgb, var(--a-t1) 6%, transparent); color: var(--a-t1); }
.tn-ch[aria-current="true"] { background: var(--a-bg); color: var(--a-t1); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.10), 0 0 0 1px var(--a-bds); }
.tn-ch:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 1px; }
.tn-count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; background: var(--a-coral); color: #fff; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.tn-main { display: flex; flex-direction: column; min-width: 0; border-radius: 22px; box-shadow: 0 0 0 1px var(--a-bds); background: var(--a-bg); overflow: hidden; }
.tn-feed { flex: 1; overflow-y: auto; padding: 8px 22px 18px; scroll-behavior: smooth; }
.tn-day { display: flex; align-items: center; gap: 12px; margin: 18px 0 6px; font-size: 12px; font-weight: 600; color: var(--a-t3); text-transform: capitalize; }
.tn-day::before, .tn-day::after { content: ""; flex: 1; height: 1px; background: var(--a-bds); }
.tn-msg { position: relative; display: flex; gap: 12px; padding: 8px 8px 8px 6px; margin: 0 -8px 0 -6px; border-radius: 14px; transition: background .15s; }
.tn-msg:hover { background: color-mix(in srgb, var(--a-t1) 3%, transparent); }
.tn-bubble { display: inline-block; max-width: 100%; padding: 10px 14px; border-radius: 4px 18px 18px 18px; font-size: 15px; line-height: 1.55; color: var(--a-t1); white-space: pre-line; overflow-wrap: anywhere; }
.tn-actions { position: absolute; top: 4px; right: 6px; display: flex; gap: 2px; padding: 3px; border-radius: 99px; background: var(--a-bg); box-shadow: 0 2px 10px rgba(0,0,0,.14), 0 0 0 1px var(--a-bds); opacity: 0; transform: translateY(4px); transition: opacity .15s, transform .15s; pointer-events: none; }
.tn-msg:hover .tn-actions, .tn-msg:focus-within .tn-actions { opacity: 1; transform: none; pointer-events: auto; }
@media (hover: none) { .tn-actions { position: static; opacity: 1; transform: none; pointer-events: auto; box-shadow: none; background: transparent; padding: 0; margin-top: 4px; } }
.tn-pinbar { display: flex; align-items: center; gap: 10px; padding: 10px 22px; background: color-mix(in srgb, var(--a-sun) 14%, transparent); font-size: 13.5px; color: var(--a-t1); border-bottom: 1px solid var(--a-bds); }
.tn-compose { padding: 12px 16px 16px; border-top: 1px solid var(--a-bds); }
.tn-box { display: flex; align-items: flex-end; gap: 8px; padding: 8px 8px 8px 16px; border-radius: 20px; background: color-mix(in srgb, var(--a-t1) 4.5%, var(--a-bg)); box-shadow: 0 0 0 1px var(--a-bds); transition: box-shadow .15s; }
.tn-box:focus-within { box-shadow: 0 0 0 1.5px var(--a-t2); }
.tn-box textarea { flex: 1; border: none; background: transparent; resize: none; outline: none; font: inherit; font-size: 15px; line-height: 1.5; color: var(--a-t1); padding: 6px 0; max-height: 160px; }
.tn-box textarea::placeholder { color: var(--a-t3); }
.tn-send { all: unset; cursor: pointer; width: 36px; height: 36px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center; background: var(--a-t1); color: var(--a-bg); transition: transform .15s, opacity .15s; flex-shrink: 0; }
.tn-send:disabled { opacity: .25; cursor: default; }
@media (hover: hover) { .tn-send:not(:disabled):hover { transform: scale(1.07); } }
.tn-stack { display: inline-flex; }
.tn-stack > span { margin-left: -6px; box-shadow: 0 0 0 2px var(--a-bg); border-radius: 99px; }
.tn-stack > span:first-child { margin-left: 0; }
.tn-chips { display: none; gap: 8px; overflow-x: auto; padding-bottom: 6px; }
.tn-chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 99px; font-size: 13.5px; white-space: nowrap; background: color-mix(in srgb, var(--a-t1) 6%, transparent); color: var(--a-t2); }
.tn-chip[aria-current="true"] { background: var(--a-t1); color: var(--a-bg); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .tn-feed { scroll-behavior: auto; } .tn-actions { transition: none; } }
`;

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const dayTitle = (key: string) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
  if (key === today) return "aujourd'hui";
  if (key === y.toLocaleDateString("en-CA")) return "hier";
  return new Date(`${key}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });

export function TeamNotesView({ onChanged }: { onChanged?: () => void }) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const admin = roles.includes("admin");
  const members = useMembers();
  const [channel, setChannel] = useState<Audience>("all");
  const [archivedView, setArchivedView] = useState(false);
  const [notes, setNotes] = useState<TeamNote[] | null>(null);
  const [archived, setArchived] = useState<TeamNote[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const feed = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    loadNotes(false).then((n) => { setNotes(n); setErr(null); }).catch((e: Error) => setErr(e.message));
    if (archivedView) loadNotes(true).then(setArchived).catch((e: Error) => setErr(e.message));
  }, [archivedView]);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_notes", "team_note_replies"]);

  // Canaux : toute l'équipe, puis un par poste (tous pour un administrateur, ses postes sinon).
  const channels = useMemo(() => [
    { id: "all" as Audience, label: "Toute l'équipe" },
    ...ROLES.filter((r) => r.id !== "admin" && (admin || roles.includes(r.id)) && (admin ? members.some((m) => m.roles.includes(r.id)) || roles.includes(r.id) : true))
      .map((r) => ({ id: r.id as Audience, label: r.label })),
  ], [admin, roles, members]);
  const isUnread = useCallback((n: TeamNote) => n.authorId !== me && !n.readBy.some((r) => r.userId === me), [me]);
  const unreadIn = (c: Audience) => (notes ?? []).filter((n) => n.audience === c && isUnread(n)).length;

  const list = archivedView ? archived : notes;
  const inChannel = useMemo(() => (list ?? []).filter((n) => archivedView || n.audience === channel).slice().reverse(), [list, channel, archivedView]);
  const pinned = archivedView ? [] : inChannel.filter((n) => n.pinned);

  // Le canal ouvert est lu : les nouvelles restent marquées « nouvelle » le temps de la visite.
  const unreadHere = useMemo(() => inChannel.filter(isUnread).map((n) => n.id), [inChannel, isUnread]);
  useEffect(() => {
    if (!unreadHere.length || archivedView) return;
    setFresh((s) => new Set([...s, ...unreadHere]));
    const t = window.setTimeout(() => { markNotesRead(unreadHere).then(() => onChanged?.()); }, 1200);
    return () => window.clearTimeout(t);
  }, [unreadHere, archivedView, onChanged]);

  // Toujours le dernier message en vue : à l'ouverture d'un canal et à chaque nouveau message.
  const lastId = inChannel[inChannel.length - 1]?.id;
  const loaded = notes !== null;
  useEffect(() => { const el = feed.current; if (el) el.scrollTop = el.scrollHeight; }, [channel, archivedView, lastId, loaded]);

  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true); setErr(null);
    const r = await postNote(body, channel, admin && pin);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setBody(""); setPin(false); load(); onChanged?.();
  };

  const audience = audienceMembers(members, channel);
  const chLabel = archivedView ? "Notes archivées" : audienceLabel(channel);
  let lastDay = "";

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + CSS}</style>
      {err && <div style={{ marginBottom: 14 }}><Notice tone="err">{err}</Notice></div>}

      <div className="tn-chips">
        {channels.map((c) => (
          <button key={c.id} type="button" className="tn-chip" aria-current={!archivedView && channel === c.id} onClick={() => { setArchivedView(false); setChannel(c.id); }}>
            <Hash style={{ width: 13, height: 13 }} />{c.label}{unreadIn(c.id) > 0 && <span className="tn-count">{unreadIn(c.id)}</span>}
          </button>
        ))}
      </div>

      <div className="tn-wrap">
        <aside className="tn-side tv-rise">
          <p style={{ margin: "4px 10px 8px", fontSize: 11.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.t3 }}>Canaux</p>
          {channels.map((c) => {
            const n = unreadIn(c.id);
            return (
              <button key={c.id} type="button" className="tn-ch" aria-current={!archivedView && channel === c.id} onClick={() => { setArchivedView(false); setChannel(c.id); }}>
                <Hash style={{ width: 15, height: 15, color: hueOf(c.label) }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: n ? 600 : undefined, color: n ? C.t1 : undefined }}>{c.label}</span>
                {n > 0 && <span className="tn-count">{n}</span>}
              </button>
            );
          })}
          <button type="button" className="tn-ch" aria-current={archivedView} onClick={() => setArchivedView(true)} style={{ marginTop: 6 }}>
            <Archive style={{ width: 15, height: 15 }} /><span style={{ flex: 1 }}>Archivées</span>
          </button>

          {!archivedView && audience.length > 0 && (
            <>
              <p style={{ margin: "22px 10px 6px", fontSize: 11.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.t3 }}>Dans ce canal</p>
              {audience.map((m) => {
                const pending = inChannel.filter((n) => n.authorId !== m.userId && !n.readBy.some((r) => r.userId === m.userId)).length;
                return (
                  <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", fontSize: 13.5 }}>
                    <TeamAvatar name={m.name} size={24} />
                    <span style={{ flex: 1, minWidth: 0, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.userId === me ? "Vous" : m.name.split(" ")[0]}</span>
                    <span style={{ fontSize: 12, color: pending ? C.t1 : C.t3, fontWeight: pending ? 600 : 400 }}>{pending ? `${pending} à lire` : "à jour"}</span>
                  </div>
                );
              })}
            </>
          )}
        </aside>

        <section className="tn-main tv-rise" style={{ animationDelay: "70ms" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderBottom: `1px solid ${C.bds}` }}>
            <span style={{ width: 38, height: 38, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${hueOf(chLabel)} 18%, transparent)`, color: hueOf(chLabel) }}>
              {archivedView ? <Archive style={{ width: 18, height: 18 }} /> : <Hash style={{ width: 18, height: 18 }} />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 17, fontWeight: 600, color: C.t1, letterSpacing: "-0.02em" }}>{chLabel}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>
                {archivedView ? "Les notes retirées du fil, gardées pour mémoire." : `${audience.length} ${plural(audience.length, "personne")} · ${inChannel.length} ${plural(inChannel.length, "note")}`}
              </span>
            </span>
            {!archivedView && audience.length > 0 && <span className="tn-stack">{audience.slice(0, 5).map((m) => <span key={m.userId}><TeamAvatar name={m.name} size={28} /></span>)}</span>}
          </header>

          {pinned.length > 0 && (
            <div className="tn-pinbar">
              <Pin style={{ width: 15, height: 15, color: C.sun, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b style={{ fontWeight: 600 }}>{pinned[pinned.length - 1].authorName.split(" ")[0]} :</b> {pinned[pinned.length - 1].body}
              </span>
              {pinned.length > 1 && <span style={{ fontSize: 12.5, color: C.t3 }}>+{pinned.length - 1}</span>}
            </div>
          )}

          <div className="tn-feed" ref={feed}>
            {!list && <p style={{ fontSize: 13, color: C.t3, marginTop: 20 }}>Chargement…</p>}
            {list && inChannel.length === 0 && (
              <div className="tv-rise" style={{ textAlign: "center", padding: "70px 20px" }}>
                <span style={{ width: 64, height: 64, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${hueOf(chLabel)} 16%, transparent)`, color: hueOf(chLabel) }}>
                  <MessageSquare style={{ width: 28, height: 28 }} />
                </span>
                <p style={{ margin: "16px 0 0", fontSize: 17, fontWeight: 600, color: C.t1 }}>{archivedView ? "Aucune note archivée" : `Le canal ${chLabel} est calme`}</p>
                <p style={{ margin: "6px 0 0", fontSize: 14, color: C.t3 }}>{archivedView ? "" : "Écrivez le premier message : tout le canal le verra en ouvrant le back-office."}</p>
              </div>
            )}
            {inChannel.map((n) => {
              const k = dayKey(n.at);
              const sep = k !== lastDay ? <div className="tn-day">{dayTitle(k)}</div> : null;
              lastDay = k;
              return (
                <div key={n.id}>
                  {sep}
                  <Message note={n} me={me} admin={admin} members={members} fresh={fresh.has(n.id)} archivedView={archivedView}
                    onChanged={() => { load(); onChanged?.(); }} onError={setErr} />
                </div>
              );
            })}
          </div>

          {!archivedView && (
            <div className="tn-compose">
              <div className="tn-box">
                <textarea rows={1} value={body} maxLength={4000} placeholder={`Écrire à ${chLabel}…`}
                  onChange={(e) => { setBody(e.target.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
                {admin && (
                  <button type="button" className="tv-icon" aria-pressed={pin} onClick={() => setPin((v) => !v)} title={pin ? "Sera épinglée en haut" : "Épingler en haut du canal"}
                    style={pin ? { color: C.sun, background: "color-mix(in srgb, var(--a-sun) 18%, transparent)" } : undefined}>
                    <Pin style={{ width: 16, height: 16 }} />
                  </button>
                )}
                <button type="button" className="tn-send" disabled={!body.trim() || busy} onClick={send} aria-label="Envoyer"><ArrowUp style={{ width: 18, height: 18 }} strokeWidth={2.2} /></button>
              </div>
              <p style={{ margin: "6px 4px 0", fontSize: 11.5, color: C.t3 }}>Entrée pour envoyer · Maj + Entrée pour aller à la ligne</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Message({ note: n, me, admin, members, fresh, archivedView, onChanged, onError }: {
  note: TeamNote; me: string; admin: boolean; members: LiveTeamMember[]; fresh: boolean; archivedView: boolean; onChanged: () => void; onError: (e: string) => void;
}) {
  const [thread, setThread] = useState(false);
  const [readers, setReaders] = useState(false);
  const [reply, setReply] = useState("");
  const mine = n.authorId === me;
  const audience = audienceMembers(members, n.audience).filter((m) => m.userId !== n.authorId);
  const readIds = new Set(n.readBy.map((r) => r.userId));
  const read = audience.filter((m) => readIds.has(m.userId));
  const act = async (p: Promise<{ error?: string }>) => { const r = await p; if (r.error) onError(r.error); else onChanged(); };
  const hue = hueOf(n.authorName);
  return (
    <div className={`tn-msg ${fresh ? "tv-in" : ""}`}>
      <TeamAvatar name={n.authorName} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{mine ? "Vous" : n.authorName}</span>
          <span style={{ fontSize: 12, color: C.t3 }}>{hhmm(n.at)}</span>
          {n.pinned && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: C.sun }}><Pin style={{ width: 12, height: 12 }} />épinglée</span>}
          {fresh && <span style={{ fontSize: 12, fontWeight: 600, color: C.coral }}>nouvelle</span>}
        </div>
        <div style={{ marginTop: 4 }}>
          <span className="tn-bubble" style={{ background: mine ? "color-mix(in srgb, var(--a-sage) 16%, transparent)" : `color-mix(in srgb, ${hue} 9%, color-mix(in srgb, var(--a-t1) 4%, transparent))` }}>{n.body}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
          {audience.length > 0 && (
            <button type="button" className="tv-link" onClick={() => setReaders((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              {read.length > 0 && <span className="tn-stack">{read.slice(0, 4).map((m) => <span key={m.userId}><TeamAvatar name={m.name} size={18} /></span>)}</span>}
              {read.length === audience.length ? "Lu par tous" : `Lu par ${read.length} sur ${audience.length}`}
            </button>
          )}
          {(n.replies.length > 0 || !archivedView) && (
            <button type="button" className="tv-link" onClick={() => setThread((v) => !v)}>
              {n.replies.length ? `${n.replies.length} ${plural(n.replies.length, "réponse")}` : "Répondre"}
            </button>
          )}
        </div>
        {readers && (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.7, color: C.t3 }}>
            {audience.map((m, i) => <span key={m.userId}>{i ? " · " : ""}<span style={{ color: readIds.has(m.userId) ? C.t1 : C.t3 }}>{m.name}{readIds.has(m.userId) ? " ✓" : ""}</span></span>)}
          </p>
        )}
        {thread && (
          <div style={{ marginTop: 10, paddingLeft: 14, borderLeft: `2px solid color-mix(in srgb, ${hue} 40%, transparent)` }}>
            {n.replies.map((r) => (
              <div key={r.id} className="tv-in" style={{ display: "flex", gap: 9, padding: "6px 0" }}>
                <TeamAvatar name={r.authorName} size={26} />
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{r.authorId === me ? "Vous" : r.authorName}</span>
                  <span style={{ fontSize: 11.5, color: C.t3 }}> · {when(r.at)}</span>
                  <div style={{ marginTop: 3 }}><span className="tn-bubble" style={{ fontSize: 14, padding: "7px 12px", background: "color-mix(in srgb, var(--a-t1) 5%, transparent)" }}>{r.body}</span></div>
                </div>
              </div>
            ))}
            {!archivedView && (
              <div className="tn-box" style={{ marginTop: 6, borderRadius: 16, padding: "4px 4px 4px 12px" }}>
                <textarea rows={1} value={reply} maxLength={2000} placeholder="Répondre…" onChange={(e) => setReply(e.target.value)} style={{ fontSize: 14 }}
                  onKeyDown={async (e) => { if (e.key === "Enter" && !e.shiftKey && reply.trim()) { e.preventDefault(); const r = await replyNote(n.id, reply); if (r.error) onError(r.error); else { setReply(""); onChanged(); } } }} />
                <button type="button" className="tn-send" style={{ width: 30, height: 30 }} disabled={!reply.trim()} aria-label="Envoyer la réponse"
                  onClick={async () => { const r = await replyNote(n.id, reply); if (r.error) onError(r.error); else { setReply(""); onChanged(); } }}>
                  <ArrowUp style={{ width: 15, height: 15 }} strokeWidth={2.2} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {(admin || mine) && (
        <div className="tn-actions">
          {!archivedView && <button type="button" className="tv-icon" title="Répondre" aria-label="Répondre" onClick={() => setThread(true)}><MessageSquare style={{ width: 15, height: 15 }} /></button>}
          {admin && !archivedView && (
            <button type="button" className="tv-icon" title={n.pinned ? "Désépingler" : "Épingler"} aria-label={n.pinned ? "Désépingler" : "Épingler"} onClick={() => act(setNote(n.id, { pinned: !n.pinned }))}>
              {n.pinned ? <PinOff style={{ width: 15, height: 15 }} /> : <Pin style={{ width: 15, height: 15 }} />}
            </button>
          )}
          <button type="button" className="tv-icon" title={n.archived ? "Remettre dans le fil" : "Archiver"} aria-label={n.archived ? "Remettre dans le fil" : "Archiver"} onClick={() => act(setNote(n.id, { archived: !n.archived }))}>
            {n.archived ? <RotateCcw style={{ width: 15, height: 15 }} /> : <Archive style={{ width: 15, height: 15 }} />}
          </button>
        </div>
      )}
    </div>
  );
}

