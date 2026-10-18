import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowRight, Hash, MessageSquare, Pin, PinOff, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import { audienceLabel, audienceMembers, loadNotes, markNotesRead, postNote, replyNote, setNote, type Audience, type TeamNote } from "@/lib/teamSpace";
import type { LiveTeamMember } from "@/lib/adminTeam";
import { C, FONT } from "./adminTheme";
import { Notice } from "./ui";
import { GR_CSS } from "./GrowthPanel";
import { TeamAvatar, TV_CSS, plural, useMembers, useTeamLive, when } from "./TeamViews";

/**
 * Équipe › Notes : la messagerie de l'équipe, à plat comme le reste du back-office. À gauche les
 * canaux (toute l'équipe, puis un par poste) et leurs messages non lus ; à droite le fil, jour par
 * jour, la note épinglée en haut, et la zone d'écriture en bas (Entrée pour envoyer).
 */

const CSS = `
.tn-wrap { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px; }
@media (max-width: 860px) { .tn-wrap { grid-template-columns: minmax(0, 1fr); gap: 16px; } .tn-side { display: none; } .tn-tabs { display: block !important; } }
.tn-ch { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 10px; height: 36px; font-size: 14.5px; color: var(--a-t2); transition: color .15s; }
.tn-ch:hover { color: var(--a-t1); }
.tn-ch .tn-name { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.tn-ch:hover .tn-name, .tn-ch[aria-current="true"] .tn-name { background-size: 100% 1.5px; }
.tn-ch[aria-current="true"] { color: var(--a-t1); font-weight: 500; }
.tn-ch:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 6px; }
.tn-main { display: flex; flex-direction: column; min-width: 0; height: max(540px, calc(100dvh - 260px)); }
@media (max-width: 860px) { .tn-main { height: auto; } .tn-feed { max-height: 62vh; } }
.tn-feed { flex: 1; overflow-y: auto; padding: 4px 4px 16px 0; }
.tn-day { display: flex; align-items: center; gap: 14px; margin: 22px 0 6px; font-size: 11.5px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3); }
.tn-day::after { content: ""; flex: 1; height: 1px; background: var(--a-bds); }
.tn-msg { position: relative; display: flex; gap: 14px; padding: 10px 8px; margin: 0 -8px; border-radius: 10px; transition: background .15s; }
.tn-msg:hover { background: var(--a-hover2); }
.tn-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.tn-msg:hover .tn-actions, .tn-msg:focus-within .tn-actions { opacity: 1; }
@media (hover: none) { .tn-actions { position: static; opacity: 1; margin-top: 4px; } }
.tn-text { margin: 3px 0 0; font-size: 15px; line-height: 1.6; color: var(--a-t1); white-space: pre-line; overflow-wrap: anywhere; }
.tn-grp { font-size: 10.5px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3); }
.tn-compose { padding-top: 14px; border-top: 1px solid var(--a-bd); }
.tn-compose textarea { width: 100%; box-sizing: border-box; border: none; background: transparent; resize: none; outline: none; font: inherit; font-size: 15.5px; line-height: 1.55; color: var(--a-t1); padding: 4px 0 10px; max-height: 180px; }
.tn-compose textarea::placeholder { color: var(--a-t3); }
`;

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const dayTitle = (key: string) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
  if (key === today) return "Aujourd'hui";
  if (key === y.toLocaleDateString("en-CA")) return "Hier";
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
    ...ROLES.filter((r) => r.id !== "admin" && (roles.includes(r.id) || (admin && members.some((m) => m.roles.includes(r.id)))))
      .map((r) => ({ id: r.id as Audience, label: r.label })),
  ], [admin, roles, members]);
  const isUnread = useCallback((n: TeamNote) => n.authorId !== me && !n.readBy.some((r) => r.userId === me), [me]);
  const unreadIn = (c: Audience) => (notes ?? []).filter((n) => n.audience === c && isUnread(n)).length;

  const list = archivedView ? archived : notes;
  const inChannel = useMemo(() => (list ?? []).filter((n) => archivedView || n.audience === channel).slice().reverse(), [list, channel, archivedView]);
  const pinned = archivedView ? [] : inChannel.filter((n) => n.pinned);

  // Le canal ouvert est lu ; ses nouvelles restent marquées « nouvelle » le temps de la visite.
  const unreadHere = useMemo(() => inChannel.filter(isUnread).map((n) => n.id), [inChannel, isUnread]);
  useEffect(() => {
    if (!unreadHere.length || archivedView) return;
    setFresh((s) => new Set([...s, ...unreadHere]));
    const t = window.setTimeout(() => { markNotesRead(unreadHere).then(() => onChanged?.()); }, 1200);
    return () => window.clearTimeout(t);
  }, [unreadHere, archivedView, onChanged]);

  // Le dernier message toujours en vue : à l'ouverture d'un canal et à chaque nouveau message.
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
  const pick = (c: Audience) => { setArchivedView(false); setChannel(c); };
  let lastDay = "";

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + GR_CSS + CSS}</style>
      {err && <div style={{ marginBottom: 14 }}><Notice tone="err">{err}</Notice></div>}

      {/* Téléphone : les canaux en mots soulignés, au-dessus du fil. */}
      <p className="tn-tabs gr-opts" style={{ display: "none", margin: "0 0 10px", fontSize: 15, lineHeight: 2, color: C.t2 }}>
        {channels.map((c) => (
          <button key={c.id} type="button" aria-pressed={!archivedView && channel === c.id} onClick={() => pick(c.id)}>
            {c.label}{unreadIn(c.id) ? ` (${unreadIn(c.id)})` : ""}
          </button>
        ))}
        <button type="button" aria-pressed={archivedView} onClick={() => setArchivedView(true)}>Archivées</button>
      </p>

      <div className="tn-wrap">
        <aside className="tn-side tv-rise">
          <p className="tn-grp" style={{ margin: "0 0 8px" }}>Canaux</p>
          {channels.map((c) => {
            const n = unreadIn(c.id);
            return (
              <button key={c.id} type="button" className="tn-ch" aria-current={!archivedView && channel === c.id} onClick={() => pick(c.id)}>
                <Hash style={{ width: 15, height: 15, color: C.t3, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span className="tn-name" style={n ? { color: C.t1, fontWeight: 500 } : undefined}>{c.label}</span></span>
                {n > 0 && <span className="tv-badge">{n}</span>}
              </button>
            );
          })}
          <button type="button" className="tn-ch" aria-current={archivedView} onClick={() => setArchivedView(true)} style={{ marginTop: 4 }}>
            <Archive style={{ width: 15, height: 15, color: C.t3, flexShrink: 0 }} /><span style={{ flex: 1 }}><span className="tn-name">Archivées</span></span>
          </button>

          {!archivedView && audience.length > 0 && (
            <>
              <p className="tn-grp" style={{ margin: "28px 0 8px" }}>Dans ce canal</p>
              {audience.map((m) => {
                const pending = inChannel.filter((n) => n.authorId !== m.userId && !n.readBy.some((r) => r.userId === m.userId)).length;
                return (
                  <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13.5 }}>
                    <TeamAvatar id={m.userId} name={m.name} size={28} />
                    <span style={{ flex: 1, minWidth: 0, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.userId === me ? "Vous" : m.name.split(" ")[0]}</span>
                    <span style={{ fontSize: 12, color: pending ? C.t1 : C.t3, fontWeight: pending ? 500 : 400 }}>{pending ? `${pending} à lire` : "à jour"}</span>
                  </div>
                );
              })}
            </>
          )}
        </aside>

        <section className="tn-main tv-rise" style={{ animationDelay: "60ms" }}>
          <header style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 14, borderBottom: `1px solid ${C.bd}` }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 26, fontWeight: 600, letterSpacing: "-0.035em", color: C.t1, lineHeight: 1.15 }}>
                {archivedView ? chLabel : <><span style={{ color: C.t3, fontWeight: 400 }}>#</span> {chLabel}</>}
              </span>
              <span style={{ display: "block", marginTop: 4, fontSize: 13, color: C.t2 }}>
                {archivedView ? "Les notes retirées du fil, gardées pour mémoire." : `${audience.length} ${plural(audience.length, "personne")} · ${inChannel.length} ${plural(inChannel.length, "note")}`}
              </span>
            </span>
            {!archivedView && audience.length > 0 && <span className="tv-stack">{audience.slice(0, 6).map((m) => <TeamAvatar key={m.userId} id={m.userId} name={m.name} size={30} />)}</span>}
          </header>

          {pinned.length > 0 && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 14 }}>
              <Pin style={{ width: 14, height: 14, color: C.t2, flexShrink: 0, alignSelf: "center" }} />
              <span style={{ fontSize: 11.5, letterSpacing: ".12em", textTransform: "uppercase", color: C.t3, flexShrink: 0 }}>Épinglé</span>
              <span style={{ flex: 1, minWidth: 0, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pinned[pinned.length - 1].body}
              </span>
              {pinned.length > 1 && <span style={{ fontSize: 12.5, color: C.t3 }}>+{pinned.length - 1}</span>}
            </div>
          )}

          <div className="tn-feed" ref={feed}>
            {!list && <p style={{ fontSize: 13, color: C.t3, marginTop: 20 }}>Chargement…</p>}
            {list && inChannel.length === 0 && (
              <div className="tv-rise" style={{ padding: "60px 0" }}>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.035em", color: C.t1 }}>{archivedView ? "Aucune note archivée." : <>Le canal est <span style={{ color: C.sage }}>calme</span>.</>}</p>
                {!archivedView && <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t2 }}>Écrivez le premier message : tout le canal le verra en ouvrant le back-office.</p>}
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
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ paddingTop: 2 }}><TeamAvatar id={me} name={user?.name ?? "Vous"} size={30} /></span>
                <textarea rows={1} value={body} maxLength={4000} placeholder={`Écrire à # ${chLabel}…`}
                  onChange={(e) => { setBody(e.target.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, paddingLeft: 42 }}>
                <span style={{ flex: 1, fontSize: 12, color: C.t3 }}>Entrée pour envoyer · Maj + Entrée pour aller à la ligne</span>
                {admin && (
                  <span className="gr-opts" style={{ fontSize: 14 }}>
                    <button type="button" aria-pressed={pin} onClick={() => setPin((v) => !v)}>Épingler</button>
                  </span>
                )}
                <button type="button" className="tv-go" disabled={!body.trim() || busy} onClick={send}>{busy ? "Envoi…" : "Envoyer"} <ArrowRight style={{ width: 15, height: 15 }} /></button>
              </div>
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
  const sendReply = async () => { if (!reply.trim()) return; const r = await replyNote(n.id, reply); if (r.error) onError(r.error); else { setReply(""); onChanged(); } };
  return (
    <div className={`tn-msg ${fresh ? "tv-in" : ""}`}>
      <TeamAvatar id={n.authorId} name={n.authorName} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", paddingRight: 90 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: C.t1 }}>{mine ? "Vous" : n.authorName}</span>
          <span style={{ fontSize: 12, color: C.t3 }}>{hhmm(n.at)}</span>
          {n.pinned && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: C.t2 }}><Pin style={{ width: 12, height: 12 }} />épinglée</span>}
          {fresh && <span className="tv-badge" style={{ height: 18, fontSize: 11 }}>nouvelle</span>}
        </div>
        <p className="tn-text">{n.body}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          {audience.length > 0 && (
            <button type="button" className="tv-link" onClick={() => setReaders((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {read.length > 0 && <span className="tv-stack">{read.slice(0, 5).map((m) => <TeamAvatar key={m.userId} id={m.userId} name={m.name} size={20} />)}</span>}
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
          <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: `1px solid ${C.bd}` }}>
            {n.replies.map((r) => (
              <div key={r.id} className="tv-in" style={{ display: "flex", gap: 10, padding: "7px 0" }}>
                <TeamAvatar id={r.authorId} name={r.authorName} size={26} />
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.t1 }}>{r.authorId === me ? "Vous" : r.authorName}</span>
                  <span style={{ fontSize: 11.5, color: C.t3 }}> · {when(r.at)}</span>
                  <p className="tn-text" style={{ fontSize: 14 }}>{r.body}</p>
                </div>
              </div>
            ))}
            {!archivedView && (
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginTop: 4 }}>
                <textarea className="tv-ta" rows={1} value={reply} maxLength={2000} placeholder="Votre réponse…" onChange={(e) => setReply(e.target.value)} style={{ fontSize: 14, minHeight: 0 }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }} />
                <button type="button" className="tv-go" disabled={!reply.trim()} onClick={sendReply}>Répondre <ArrowRight style={{ width: 15, height: 15 }} /></button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="tn-actions">
        {!archivedView && <button type="button" className="tv-icon" title="Répondre" aria-label="Répondre" onClick={() => setThread(true)}><MessageSquare style={{ width: 15, height: 15 }} /></button>}
        {admin && !archivedView && (
          <button type="button" className="tv-icon" title={n.pinned ? "Désépingler" : "Épingler"} aria-label={n.pinned ? "Désépingler" : "Épingler"} onClick={() => act(setNote(n.id, { pinned: !n.pinned }))}>
            {n.pinned ? <PinOff style={{ width: 15, height: 15 }} /> : <Pin style={{ width: 15, height: 15 }} />}
          </button>
        )}
        {(admin || mine) && (
          <button type="button" className="tv-icon" title={n.archived ? "Remettre dans le fil" : "Archiver"} aria-label={n.archived ? "Remettre dans le fil" : "Archiver"} onClick={() => act(setNote(n.id, { archived: !n.archived }))}>
            {n.archived ? <RotateCcw style={{ width: 15, height: 15 }} /> : <Archive style={{ width: 15, height: 15 }} />}
          </button>
        )}
      </div>
    </div>
  );
}
