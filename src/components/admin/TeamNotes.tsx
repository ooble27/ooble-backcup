import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDown, ArrowRight, Hash, MessageSquare, Pencil, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import {
  NOTE_PAGE, audienceLabel, audienceMembers, editNote, editReply, loadChannel, loadChannelReaders, loadPinned, loadUnread, markNotesRead, postNote,
  removeNote, removeReply, replyNote, setNote, type Audience, type NoteReply, type TeamMember, type TeamNote, type Unread,
} from "@/lib/teamSpace";
import { C, FONT } from "./adminTheme";
import { Notice } from "./ui";
import { GR_CSS } from "./GrowthPanel";
import { TeamAvatar, TeamName, TV_CSS, nameColor, plural, useMembers, useTeamLive, when } from "./TeamViews";

/**
 * Équipe › Notes : la messagerie de l'équipe. Canaux par poste avec leurs non lus et mentions ;
 * le fil se charge par pages de 50 messages (« Messages précédents »), les longs messages se plient,
 * et un nouveau message ne fait pas sauter la lecture : « Nouveaux messages » apparaît. Chacun
 * modifie ou retire ses messages ; un administrateur peut retirer n'importe quel message.
 */

const CSS = `
.tn-wrap { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px; }
@media (max-width: 860px) { .tn-wrap { grid-template-columns: minmax(0, 1fr); gap: 16px; } .tn-side { display: none; } .tn-tabs { display: block !important; } }
.tn-grp { font-size: 10.5px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3); }
.tn-ch { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 10px; height: 36px; font-size: 14.5px; color: var(--a-t2); transition: color .15s; }
.tn-ch:hover { color: var(--a-t1); }
.tn-ch .tn-name { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.tn-ch:hover .tn-name, .tn-ch[aria-current="true"] .tn-name { background-size: 100% 1.5px; }
.tn-ch[aria-current="true"] { color: var(--a-t1); font-weight: 500; }
.tn-ch:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 6px; }
.tn-main { position: relative; display: flex; flex-direction: column; min-width: 0; height: max(540px, calc(100dvh - 260px)); }
@media (max-width: 860px) { .tn-main { height: calc(100dvh - 200px); min-height: 480px; } }
.tn-feed { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 4px 16px 0; overscroll-behavior: contain; }
.tn-day { display: flex; align-items: center; gap: 14px; margin: 22px 0 6px; font-size: 11.5px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3); }
.tn-day::after { content: ""; flex: 1; height: 1px; background: var(--a-bds); }
.tn-msg { position: relative; display: flex; gap: 14px; padding: 10px 8px; margin: 0 -8px; border-radius: 10px; transition: background .15s; }
.tn-msg:hover { background: var(--a-hover2); }
.tn-head { display: flex; align-items: baseline; gap: 4px 8px; flex-wrap: wrap; padding-right: 150px; }
.tn-who { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tn-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; padding: 2px; border-radius: 99px; background: var(--a-bg); opacity: 0; transition: opacity .15s; }
.tn-msg:hover .tn-actions, .tn-msg:focus-within .tn-actions { opacity: 1; }
.tn-msg:focus { outline: none; }
/* Écran tactile : les actions apparaissent sous le message touché. */
@media (hover: none) {
  .tn-msg { flex-wrap: wrap; }
  .tn-actions { position: static; display: none; opacity: 1; box-sizing: border-box; flex-basis: 100%; margin-top: -10px; padding-left: 50px; background: transparent; }
  .tn-msg:focus-within .tn-actions { display: flex; }
  .tn-head { padding-right: 0; }
}
@media (max-width: 600px) { .tn-tip { display: none; } .tn-hint { min-width: 0 !important; } }
.tn-text { margin: 3px 0 0; font-size: 15px; line-height: 1.6; color: var(--a-t1); white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.tn-text[data-folded="true"] { display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
.tn-text a { color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--a-t3); }
.tn-text a:hover { text-decoration-color: currentColor; }
.tn-compose { position: relative; padding-top: 14px; border-top: 1px solid var(--a-bd); }
.tn-input { width: 100%; box-sizing: border-box; border: none; background: transparent; resize: none; outline: none; font: inherit; font-size: 15.5px; line-height: 1.55; color: var(--a-t1); padding: 4px 0 10px; max-height: 200px; overflow-y: auto; }
.tn-input::placeholder { color: var(--a-t3); }
.tn-suggest { position: absolute; left: 42px; bottom: calc(100% - 6px); z-index: 5; min-width: 240px; max-width: 320px; padding: 6px; border-radius: 14px; background: var(--a-l1); box-shadow: 0 0 0 1px var(--a-bd), 0 18px 40px -16px rgba(0,0,0,.45); }
.tn-sg { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; font-size: 14px; }
.tn-sg[aria-selected="true"], .tn-sg:hover { background: var(--a-hover3); }
.tn-more { all: unset; cursor: pointer; display: block; margin: 8px auto 4px; font-size: 13px; color: var(--a-t2); text-decoration: underline; text-underline-offset: 3px; }
.tn-more:hover { color: var(--a-t1); }
.tn-new { all: unset; cursor: pointer; position: absolute; left: 50%; bottom: 112px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 99px; background: var(--a-t1); color: var(--a-bg); font-size: 13px; font-weight: 600; box-shadow: 0 10px 24px -10px rgba(0,0,0,.5); }
.tn-edit { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--a-t2); background: transparent; resize: vertical; outline: none; font: inherit; font-size: 15px; line-height: 1.55; color: var(--a-t1); padding: 4px 0 8px; min-height: 60px; }
`;

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const dayTitle = (key: string) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
  if (key === today) return "Aujourd'hui";
  if (key === y.toLocaleDateString("en-CA")) return "Hier";
  return new Date(`${key}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: key.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isLong = (s: string) => s.length > 700 || s.split("\n").length > 9;

/** Texte d'un message : liens cliquables, @mentions dans la couleur de la personne. */
function RichText({ text, mentions, members, folded }: { text: string; mentions: string[]; members: TeamMember[]; folded?: boolean }) {
  const parts = useMemo(() => {
    const who = members.filter((m) => mentions.includes(m.userId));
    const names = who.flatMap((m) => [m.name, firstName(m.name)].map((n) => ({ n, m }))).sort((a, b) => b.n.length - a.n.length);
    const alts = [`https?://[^\\s<]+[^\\s<.,;:!?)\\]]`, ...names.map((x) => `@${escRe(x.n)}`)];
    const re = new RegExp(`(${alts.join("|")})`, "gi");
    return text.split(re).map((p, i) => {
      if (!p) return null;
      if (/^https?:\/\//i.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>;
      if (p.startsWith("@")) {
        const hit = names.find((x) => fold(`@${x.n}`) === fold(p));
        if (hit) return <span key={i} className="tv-mention" style={{ color: nameColor(hit.m.color), background: "var(--a-hover3)" }}>{p}</span>;
      }
      return <Fragment key={i}>{p}</Fragment>;
    });
  }, [text, mentions, members]);
  return <p className="tn-text" data-folded={!!folded}>{parts}</p>;
}

export function TeamNotesView({ onChanged }: { onChanged?: () => void }) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const admin = roles.includes("admin");
  const members = useMembers();
  const [channel, setChannel] = useState<Audience>("all");
  const [archivedView, setArchivedView] = useState(false);
  const [msgs, setMsgs] = useState<TeamNote[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [older, setOlder] = useState(false);
  const [pinned, setPinned] = useState<TeamNote[]>([]);
  const [unread, setUnread] = useState<Unread>({ channels: {}, mentions: 0, mentionChannels: {} });
  const [readers, setReaders] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [newBelow, setNewBelow] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastSeen = useRef<string | undefined>(undefined);
  const keepScroll = useRef<number | null>(null);
  const key = archivedView ? "archives" : channel;
  const keyRef = useRef(key);
  keyRef.current = key;

  // Dernière page du canal, fusionnée avec les messages plus anciens déjà chargés.
  const loadLatest = useCallback(async (reset = false) => {
    const k = keyRef.current;
    try {
      const page = await loadChannel(archivedView ? null : channel, { archived: archivedView });
      if (keyRef.current !== k) return;
      const asc = page.slice().reverse();
      setMsgs((prev) => {
        if (reset || !prev) return asc;
        const oldest = asc[0]?.at;
        const keep = oldest ? prev.filter((m) => m.at < oldest) : [];
        return [...keep, ...asc];
      });
      if (reset) setHasMore(page.length === NOTE_PAGE);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [channel, archivedView]);

  const loadSide = useCallback(() => {
    loadUnread().then(setUnread).catch(() => undefined);
    if (!archivedView) {
      loadPinned(channel).then(setPinned).catch(() => undefined);
      loadChannelReaders(channel).then(setReaders).catch(() => undefined);
    }
  }, [channel, archivedView]);

  useEffect(() => {
    setMsgs(null); setPinned([]); setNewBelow(false); lastSeen.current = undefined; atBottom.current = true;
    loadLatest(true); loadSide();
  }, [loadLatest, loadSide]);
  useTeamLive(() => { loadLatest(); loadSide(); }, ["team_notes", "team_note_replies"]);

  const loadOlder = async () => {
    if (!msgs?.length || older) return;
    setOlder(true);
    try {
      const page = await loadChannel(archivedView ? null : channel, { archived: archivedView, before: msgs[0].at });
      keepScroll.current = feed.current ? feed.current.scrollHeight - feed.current.scrollTop : null;
      setMsgs((prev) => [...page.slice().reverse(), ...(prev ?? [])]);
      setHasMore(page.length === NOTE_PAGE);
    } catch (e) { setErr((e as Error).message); }
    setOlder(false);
  };

  // Défilement : en bas à l'ouverture et quand on y est déjà ; sinon « Nouveaux messages ».
  useLayoutEffect(() => {
    const el = feed.current;
    if (!el || !msgs) return;
    if (keepScroll.current != null) { el.scrollTop = el.scrollHeight - keepScroll.current; keepScroll.current = null; return; }
    const last = msgs[msgs.length - 1];
    if (!last || last.id === lastSeen.current) return;
    const first = lastSeen.current === undefined;
    lastSeen.current = last.id;
    if (first || atBottom.current || last.authorId === me) { el.scrollTop = el.scrollHeight; setNewBelow(false); }
    else setNewBelow(true);
  }, [msgs, me]);
  const onScroll = () => {
    const el = feed.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setNewBelow(false);
  };
  const toBottom = () => { const el = feed.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setNewBelow(false); };

  // Lu : les messages affichés du canal ouvert ; ils restent marqués « nouvelle » le temps de la visite.
  const unreadHere = useMemo(() => (msgs ?? []).filter((n) => n.authorId !== me && !n.readBy.some((r) => r.userId === me)).map((n) => n.id), [msgs, me]);
  useEffect(() => {
    if (!unreadHere.length || archivedView) return;
    setFresh((s) => new Set([...s, ...unreadHere]));
    const t = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      markNotesRead(unreadHere).then(() => { loadSide(); onChanged?.(); });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [unreadHere, archivedView, onChanged, loadSide]);

  const channels = useMemo(() => [
    { id: "all" as Audience, label: "Toute l'équipe" },
    ...ROLES.filter((r) => r.id !== "admin" && (roles.includes(r.id) || (admin && members.some((m) => m.roles.includes(r.id)))))
      .map((r) => ({ id: r.id as Audience, label: r.label })),
  ], [admin, roles, members]);
  const audience = audienceMembers(members, channel);
  const chLabel = archivedView ? "Notes archivées" : audienceLabel(channel);
  const pick = (c: Audience) => { setArchivedView(false); setChannel(c); };
  const refresh = () => { loadLatest(); loadSide(); onChanged?.(); };
  let lastDay = "";

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + GR_CSS + CSS}</style>
      {err && <div style={{ marginBottom: 14 }}><Notice tone="err">{err}</Notice></div>}

      {/* Téléphone : les canaux en mots soulignés, au-dessus du fil. */}
      <p className="tn-tabs gr-opts" style={{ display: "none", margin: "0 0 10px", fontSize: 15, lineHeight: 2, color: C.t2 }}>
        {channels.map((c) => (
          <button key={c.id} type="button" aria-pressed={!archivedView && channel === c.id} onClick={() => pick(c.id)}>
            {c.label}{unread.channels[c.id] ? ` (${unread.channels[c.id]})` : ""}
          </button>
        ))}
        <button type="button" aria-pressed={archivedView} onClick={() => setArchivedView(true)}>Archivées</button>
      </p>

      <div className="tn-wrap">
        <aside className="tn-side tv-rise">
          <p className="tn-grp" style={{ margin: "0 0 8px" }}>Canaux</p>
          {channels.map((c) => {
            const n = unread.channels[c.id] ?? 0, at = unread.mentionChannels[c.id] ?? 0;
            return (
              <button key={c.id} type="button" className="tn-ch" aria-current={!archivedView && channel === c.id} onClick={() => pick(c.id)}>
                <Hash style={{ width: 15, height: 15, color: C.t3, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span className="tn-name" style={n ? { color: C.t1, fontWeight: 500 } : undefined}>{c.label}</span></span>
                {at > 0 && <span className="tv-badge" title="Vous êtes mentionné">@</span>}
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
                const pending = readers[m.userId] ?? 0;
                return (
                  <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13.5 }}>
                    <TeamAvatar id={m.userId} name={m.name} size={28} presence />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <TeamName id={m.userId} name={firstName(m.name)} you={m.userId === me} style={{ fontWeight: 500 }} />
                    </span>
                    <span style={{ fontSize: 12, color: pending ? C.t1 : C.t3, fontWeight: pending ? 500 : 400, whiteSpace: "nowrap" }}>{pending ? `${pending} à lire` : "à jour"}</span>
                  </div>
                );
              })}
            </>
          )}
        </aside>

        <section className="tn-main tv-rise" style={{ animationDelay: "60ms" }}>
          <header style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 14, borderBottom: `1px solid ${C.bd}` }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 26, fontWeight: 600, letterSpacing: "-0.035em", color: C.t1, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {archivedView ? chLabel : <><span style={{ color: C.t3, fontWeight: 400 }}>#</span> {chLabel}</>}
              </span>
              <span style={{ display: "block", marginTop: 4, fontSize: 13, color: C.t2 }}>
                {archivedView ? "Les notes retirées du fil, gardées pour mémoire." : `${audience.length} ${plural(audience.length, "personne")}${unread.mentions ? ` · vous êtes mentionné ${unread.mentions} fois` : ""}`}
              </span>
            </span>
            {!archivedView && audience.length > 0 && <span className="tv-stack">{audience.slice(0, 6).map((m) => <TeamAvatar key={m.userId} id={m.userId} name={m.name} size={30} />)}</span>}
          </header>

          {pinned.length > 0 && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 14, minWidth: 0 }}>
              <Pin style={{ width: 14, height: 14, color: C.t2, flexShrink: 0, alignSelf: "center" }} />
              <span className="tn-grp" style={{ flexShrink: 0 }}>Épinglé</span>
              <TeamName id={pinned[0].authorId} name={firstName(pinned[0].authorName)} you={pinned[0].authorId === me} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pinned[0].body}</span>
              {pinned.length > 1 && <span style={{ fontSize: 12.5, color: C.t3, flexShrink: 0 }}>+{pinned.length - 1}</span>}
            </div>
          )}

          <div className="tn-feed" ref={feed} onScroll={onScroll}>
            {!msgs && <p style={{ fontSize: 13, color: C.t3, marginTop: 20 }}>Chargement…</p>}
            {msgs && hasMore && <button type="button" className="tn-more" disabled={older} onClick={loadOlder}>{older ? "Chargement…" : "Voir les messages précédents"}</button>}
            {msgs && !hasMore && msgs.length > 0 && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.t3, textAlign: "center" }}>Début {archivedView ? "des archives" : "du canal"}</p>}
            {msgs && msgs.length === 0 && (
              <div className="tv-rise" style={{ padding: "60px 0" }}>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.035em", color: C.t1 }}>{archivedView ? "Aucune note archivée." : <>Le canal est <span style={{ color: C.sage }}>calme</span>.</>}</p>
                {!archivedView && <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t2 }}>Écrivez le premier message : tout le canal le verra en ouvrant le back-office.</p>}
              </div>
            )}
            {msgs?.map((n) => {
              const k = dayKey(n.at);
              const sep = k !== lastDay ? <div className="tn-day">{dayTitle(k)}</div> : null;
              lastDay = k;
              return (
                <div key={n.id}>
                  {sep}
                  <Message note={n} me={me} admin={admin} members={members} fresh={fresh.has(n.id)} archivedView={archivedView} onChanged={refresh} onError={setErr} />
                </div>
              );
            })}
          </div>

          {newBelow && <button type="button" className="tn-new tv-in" onClick={toBottom}>Nouveaux messages <ArrowDown style={{ width: 14, height: 14 }} /></button>}

          {!archivedView && <Composer channel={channel} chLabel={chLabel} me={me} meName={user?.name ?? "Vous"} admin={admin} audience={audience} onSent={() => { atBottom.current = true; refresh(); }} onError={setErr} />}
        </section>
      </div>
    </div>
  );
}

/* ─── Zone d'écriture, avec @mentions ─── */
function Composer({ channel, chLabel, me, meName, admin, audience, onSent, onError }: {
  channel: Audience; chLabel: string; me: string; meName: string; admin: boolean; audience: TeamMember[]; onSent: () => void; onError: (e: string) => void;
}) {
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setBody(""); setPicked([]); setPin(false); setQuery(null); }, [channel]);

  const others = audience.filter((m) => m.userId !== me);
  const suggestions = query == null ? [] : others.filter((m) => fold(m.name).split(/\s+/).some((w) => w.startsWith(fold(query))) || fold(m.name).startsWith(fold(query))).slice(0, 6);
  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; };
  const onChange = (el: HTMLTextAreaElement) => {
    setBody(el.value); grow(el);
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = before.match(/(?:^|\s)@([\p{L}\p{N}_-]{0,30})$/u);
    setQuery(m ? m[1] : null); setSel(0);
  };
  const insert = (m: TeamMember) => {
    const el = ta.current;
    if (!el) return;
    const caret = el.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\p{L}\p{N}_-]{0,30})$/u, `@${firstName(m.name)} `);
    const next = before + body.slice(caret);
    setBody(next); setPicked((p) => (p.includes(m.userId) ? p : [...p, m.userId])); setQuery(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); grow(el); });
  };
  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    // Une mention compte seulement si son @Prénom est encore dans le texte.
    const mentions = picked.filter((id) => { const m = others.find((x) => x.userId === id); return m && fold(text).includes(fold(`@${firstName(m.name)}`)); });
    setBusy(true);
    const r = await postNote(text, channel, admin && pin, mentions);
    setBusy(false);
    if (r.error) { onError(r.error); return; }
    setBody(""); setPicked([]); setPin(false);
    if (ta.current) ta.current.style.height = "auto";
    onSent();
  };

  return (
    <div className="tn-compose">
      {suggestions.length > 0 && (
        <div className="tn-suggest tv-in" role="listbox" aria-label="Mentionner">
          {suggestions.map((m, i) => (
            <button key={m.userId} type="button" role="option" aria-selected={i === sel} className="tn-sg" onMouseDown={(e) => { e.preventDefault(); insert(m); }}>
              <TeamAvatar id={m.userId} name={m.name} size={26} presence />
              <TeamName id={m.userId} name={m.name} />
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ paddingTop: 2 }}><TeamAvatar id={me} name={meName} size={30} /></span>
        <textarea ref={ta} className="tn-input" rows={1} value={body} maxLength={4000} placeholder={`Écrire à # ${chLabel}…`}
          onChange={(e) => onChange(e.currentTarget)}
          onBlur={() => window.setTimeout(() => setQuery(null), 150)}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % suggestions.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + suggestions.length) % suggestions.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(suggestions[sel]); return; }
              if (e.key === "Escape") { setQuery(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, paddingLeft: 42, flexWrap: "wrap" }}>
        <span className="tn-hint" style={{ flex: 1, fontSize: 12, color: C.t3, minWidth: 180 }}>
          {body.length > 3500 ? `${4000 - body.length} caractères restants` : <span className="tn-tip">Entrée pour envoyer · Maj + Entrée pour aller à la ligne · @ pour mentionner</span>}
        </span>
        {admin && <span className="gr-opts" style={{ fontSize: 14 }}><button type="button" aria-pressed={pin} onClick={() => setPin((v) => !v)}>Épingler</button></span>}
        <button type="button" className="tv-go" disabled={!body.trim() || busy} onClick={send}>{busy ? "Envoi…" : "Envoyer"} <ArrowRight style={{ width: 15, height: 15 }} /></button>
      </div>
    </div>
  );
}

/* ─── Un message et son fil de réponses ─── */
function Message({ note: n, me, admin, members, fresh, archivedView, onChanged, onError }: {
  note: TeamNote; me: string; admin: boolean; members: TeamMember[]; fresh: boolean; archivedView: boolean; onChanged: () => void; onError: (e: string) => void;
}) {
  const [thread, setThread] = useState(false);
  const [readers, setReaders] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const mine = n.authorId === me;
  const audience = audienceMembers(members, n.audience).filter((m) => m.userId !== n.authorId);
  const readIds = new Set(n.readBy.map((r) => r.userId));
  const read = audience.filter((m) => readIds.has(m.userId));
  const mentionsMe = n.mentions.includes(me);
  const act = async (p: Promise<{ error?: string }>, after?: () => void) => { const r = await p; if (r.error) onError(r.error); else { after?.(); onChanged(); } };
  const sendReply = () => { if (reply.trim()) act(replyNote(n.id, reply), () => setReply("")); };
  const long = isLong(n.body);

  return (
    <div className={`tn-msg ${fresh ? "tv-in" : ""}`} tabIndex={-1}>
      <TeamAvatar id={n.authorId} name={n.authorName} size={38} presence />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tn-head">
          <span className="tn-who" title={n.authorName}><TeamName id={n.authorId} name={n.authorName} you={mine} style={{ fontSize: 14.5 }} /></span>
          <span style={{ fontSize: 12, color: C.t3 }}>{hhmm(n.at)}{n.editedAt ? " · modifié" : ""}</span>
          {n.pinned && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: C.t2 }}><Pin style={{ width: 12, height: 12 }} />épinglée</span>}
          {mentionsMe && <span className="tv-badge" style={{ height: 18, fontSize: 11 }}>@vous</span>}
          {fresh && !mentionsMe && <span className="tv-badge" style={{ height: 18, fontSize: 11 }}>nouvelle</span>}
        </div>
        {editing != null ? (
          <div style={{ marginTop: 4 }}>
            <textarea className="tn-edit" value={editing} maxLength={4000} autoFocus onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (editing.trim()) act(editNote(n.id, editing), () => setEditing(null)); } }} />
            <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
              <button type="button" className="tv-go" style={{ fontSize: 13.5 }} disabled={!editing.trim()} onClick={() => act(editNote(n.id, editing), () => setEditing(null))}>Enregistrer <ArrowRight style={{ width: 14, height: 14 }} /></button>
              <button type="button" className="tv-link" style={{ fontSize: 13.5 }} onClick={() => setEditing(null)}>Annuler</button>
            </div>
          </div>
        ) : (
          <>
            <RichText text={n.body} mentions={n.mentions} members={members} folded={long && !open} />
            {long && <button type="button" className="tv-link" style={{ marginTop: 4 }} onClick={() => setOpen((v) => !v)}>{open ? "Réduire" : "Afficher la suite"}</button>}
          </>
        )}
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
          <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.8, color: C.t3 }}>
            {audience.map((m, i) => <span key={m.userId}>{i ? " · " : ""}{readIds.has(m.userId) ? <><TeamName id={m.userId} name={m.name} style={{ fontWeight: 500 }} /> ✓</> : m.name}</span>)}
          </p>
        )}
        {thread && (
          <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: `1px solid ${C.bd}` }}>
            {n.replies.map((r) => <Reply key={r.id} reply={r} me={me} admin={admin} archived={archivedView} onChanged={onChanged} onError={onError} />)}
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
      {editing == null && (
        <div className="tn-actions">
          {!archivedView && <button type="button" className="tv-icon" title="Répondre" aria-label="Répondre" onClick={() => setThread(true)}><MessageSquare style={{ width: 15, height: 15 }} /></button>}
          {mine && !archivedView && <button type="button" className="tv-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditing(n.body)}><Pencil style={{ width: 15, height: 15 }} /></button>}
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
          {(admin || mine) && (
            <button type="button" className="tv-icon" title="Retirer le message" aria-label="Retirer le message"
              onClick={() => { if (window.confirm("Retirer ce message ? Il disparaîtra pour toute l'équipe.")) act(removeNote(n.id)); }}>
              <Trash2 style={{ width: 15, height: 15 }} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Reply({ reply: r, me, admin, archived, onChanged, onError }: { reply: NoteReply; me: string; admin: boolean; archived: boolean; onChanged: () => void; onError: (e: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const mine = r.authorId === me;
  const act = async (p: Promise<{ error?: string }>, after?: () => void) => { const x = await p; if (x.error) onError(x.error); else { after?.(); onChanged(); } };
  return (
    <div className="tv-in" style={{ display: "flex", gap: 10, padding: "7px 0" }}>
      <TeamAvatar id={r.authorId} name={r.authorName} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span className="tn-who" title={r.authorName}><TeamName id={r.authorId} name={r.authorName} you={mine} style={{ fontSize: 13.5 }} /></span>
          <span style={{ fontSize: 11.5, color: C.t3 }}>{when(r.at)}{r.editedAt ? " · modifié" : ""}</span>
          {!archived && editing == null && (
            <span style={{ display: "inline-flex", gap: 12, marginLeft: 4 }}>
              {mine && <button type="button" className="tv-link" style={{ fontSize: 12 }} onClick={() => setEditing(r.body)}>Modifier</button>}
              {(mine || admin) && <button type="button" className="tv-link" style={{ fontSize: 12 }} onClick={() => { if (window.confirm("Retirer cette réponse ?")) act(removeReply(r.id)); }}>Retirer</button>}
            </span>
          )}
        </div>
        {editing != null ? (
          <div style={{ marginTop: 4 }}>
            <textarea className="tn-edit" style={{ minHeight: 44, fontSize: 14 }} value={editing} maxLength={2000} autoFocus onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (editing.trim()) act(editReply(r.id, editing), () => setEditing(null)); } }} />
            <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
              <button type="button" className="tv-go" style={{ fontSize: 13 }} disabled={!editing.trim()} onClick={() => act(editReply(r.id, editing), () => setEditing(null))}>Enregistrer <ArrowRight style={{ width: 13, height: 13 }} /></button>
              <button type="button" className="tv-link" style={{ fontSize: 13 }} onClick={() => setEditing(null)}>Annuler</button>
            </div>
          </div>
        ) : <p className="tn-text" style={{ fontSize: 14 }}>{r.body}</p>}
      </div>
    </div>
  );
}
