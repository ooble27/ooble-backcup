import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Pin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CURRENT_OPERATOR, nfCad, nfUsdt, STATUS_META, type AdminOrder } from "@/lib/adminOrders";
import { roleLabel, sortRoles } from "@/lib/roles";
import { orderRef } from "@/lib/orders";
import {
  ackHandoff, audienceLabel, peekTeam, tasksKey, firstName, isLate, isMine, loadHandoffs, loadPrivateNote, loadRecentNotes, loadTasks, loadUnread, memberById, postHandoff, savePrivateNote,
  setTaskStatus, takeTask, todayToronto, type Handoff, type TeamMember, type TeamNote, type TeamTask, type Unread,
} from "@/lib/teamSpace";
import { C, FONT } from "./adminTheme";
import { Notice } from "./ui";
import { TeamAvatar, TeamFaces, TeamName, TV_CSS, nameColor, plural, presenceText, useMembers, useTeamLive } from "./TeamViews";
import { ProfilePanel } from "./TeamProfile";
import { PersonPicker } from "./TeamViews";
import { GR_CSS, Opts } from "./GrowthPanel";
import { ApprovalsBlock } from "./TeamApprovals";
import { OnCallLine } from "./TeamPlanning";

/**
 * Mon espace : la page d'accueil de chaque membre, dans le style du back-office (grande phrase,
 * chiffres posés sur la page, listes à traits fins). Mes tâches et ma semaine, le fil de l'équipe,
 * mes commandes prises en charge, la passation de fin de journée et mon bloc-notes privé (personne
 * d'autre ne le voit).
 */

const CSS = `
.ms-grp { margin: 0; flex: 1; font-size: 10.5px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3); }
.ms-head { display: flex; align-items: baseline; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--a-bd); }
.ms-grid { display: grid; gap: 48px 56px; margin-top: 44px; grid-template-columns: minmax(0, 1fr); align-items: start; }
@media (min-width: 1100px) { .ms-grid { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); } }
.ms-stats { display: flex; gap: 40px; flex-wrap: wrap; margin-top: 26px; }
.ms-stat { all: unset; cursor: pointer; display: block; }
.ms-stat .ms-n { display: block; margin-top: 4px; font-size: 30px; font-weight: 600; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.ms-stat .ms-l { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1px; padding-bottom: 2px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.ms-stat:hover .ms-l, .ms-stat:focus-visible .ms-l { background-size: 100% 1px; }
.ms-stat:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 4px; }
.ms-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); padding: 14px 0 12px; border-bottom: 1px solid var(--a-bds); }
.ms-row { display: flex; align-items: center; gap: 12px; padding: 12px 6px; margin: 0 -6px; border-bottom: 1px solid var(--a-bds); border-radius: 10px; transition: opacity .4s, transform .4s; -webkit-tap-highlight-color: transparent; }
.ms-row[data-leaving="true"] { opacity: 0; transform: translateX(12px); }
.ms-link { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; }
.ms-link svg { transition: transform .15s; }
@media (hover: hover) { .ms-link:hover svg { transform: translateX(3px); } }
.ms-link:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.ms-paper { width: 100%; box-sizing: border-box; border: none; outline: none; resize: vertical; min-height: 270px; padding: 0; margin-top: 2px; font: inherit; font-size: 15px; line-height: 30px; color: var(--a-t1);
  background: repeating-linear-gradient(transparent 0 29px, var(--a-bds) 29px 30px); background-attachment: local; }
.ms-paper::placeholder { color: var(--a-t3); }
.hp-l { margin: 18px 0 4px; font-size: 12.5px; color: var(--a-t3); }
.hp-ta { display: block; width: 100%; box-sizing: border-box; resize: vertical; min-height: 96px; margin: 0; padding: 12px 14px; border: 1px solid var(--a-bd); border-radius: 12px; outline: none; background: transparent; font: inherit; font-size: 15px; line-height: 1.55; color: var(--a-t1); transition: border-color .15s; }
.hp-ta:focus { border-color: var(--a-t2); }
.hp-ta::placeholder { color: var(--a-t3); }
.ms-due-in { display: none; }
@media (max-width: 600px) { .ms-due { display: none; } .ms-due-in { display: inline; } }
@media (prefers-reduced-motion: reduce) { .ms-row { transition: none; } }
`;

const hello = () => { const h = Number(new Date().toLocaleString("en-CA", { hour: "numeric", hour12: false, timeZone: "America/Toronto" })); return h < 5 || h >= 18 ? "Bonsoir" : "Bonjour"; };
const shortDue = (d: string) => (d === todayToronto() ? "aujourd'hui" : new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" }));
const ago = (mins: number) => (mins < 60 ? `il y a ${Math.max(1, Math.round(mins))} min` : mins < 60 * 24 ? `il y a ${Math.round(mins / 60)} h` : `il y a ${Math.round(mins / 1440)} j`);
const agoIso = (iso: string) => ago((Date.now() - new Date(iso).getTime()) / 60000);

function Head({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="ms-head"><p className="ms-grp">{title}</p>{action}</div>;
}

export function MySpace({ orders, onGo, onOpenOrder, canOrders, onChanged }: {
  orders: AdminOrder[]; onGo: (tab: "tasks" | "notes" | "queue") => void; onOpenOrder: (o: AdminOrder) => void; canOrders: boolean; onChanged?: () => void;
}) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
  const members = useMembers();
  // Déjà en mémoire : la page s'affiche tout de suite, puis se met à jour.
  const [tasks, setTasks] = useState<TeamTask[] | null>(() => peekTeam<TeamTask[]>(tasksKey()) ?? null);
  const [notes, setNotes] = useState<TeamNote[] | null>(() => peekTeam<TeamNote[]>("notes:5") ?? null);
  const [unreadInfo, setUnreadInfo] = useState<Unread | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState(false);
  const [handoffs, setHandoffs] = useState<Handoff[]>(() => peekTeam<Handoff[]>("handoffs") ?? []);

  const load = useCallback(() => {
    loadHandoffs().then(setHandoffs).catch(() => undefined);
    loadTasks(false).then(setTasks).catch((e: Error) => setErr(e.message));
    loadRecentNotes(5).then(setNotes).catch((e: Error) => setErr(e.message));
    loadUnread().then(setUnreadInfo).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_notes", "team_note_replies", "team_handoffs", "team_handoff_reads"]);

  const mine = (tasks ?? []).filter((t) => isMine(t, me, roles) && t.status !== "done")
    .sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || b.at.localeCompare(a.at));
  const late = mine.filter(isLate).length;
  const today = todayToronto();
  const unread = (notes ?? []).filter((n) => n.authorId !== me && !n.readBy.some((r) => r.userId === me));
  const unreadCount = unreadInfo ? Object.values(unreadInfo.channels).reduce((a, b) => a + (b ?? 0), 0) : unread.length;
  const feed = notes ?? [];
  const myself = memberById(me);
  // Les commandes que je traite (la liste marque les miennes « Vous », pas par mon identifiant).
  const myOrders = canOrders ? orders.filter((o) => o.assignedTo === CURRENT_OPERATOR && (o.status === "recu" || o.status === "cours")) : [];
  const first = (user?.name ?? "").split(/\s+/)[0];
  // Passations des autres que je n'ai pas encore lues, et ce que je peux rattacher à la mienne.
  // Une passation dont tout est réglé (commandes terminées, tâches faites) disparaît d'elle-même, pour tout le monde.
  // Réglé = fini, ou repris par quelqu'un.
  // À toute l'équipe : réglé quand tout est repris ou fini. À une personne : quand tout est fini.
  const openOrder = (id: string, direct: boolean) => orders.some((o) => o.id === id && (direct || !o.assignedTo) && (o.status === "recu" || o.status === "cours" || o.status === "attente"));
  const openTask = (id: string, direct: boolean) => (tasks ?? []).some((t) => t.id === id && t.status !== "done" && (direct || !t.assigneeId));
  const settled = (h: Handoff) => !!tasks && (h.orderIds.length + h.taskIds.length) > 0
    && !h.orderIds.some((id) => openOrder(id, !!h.toUser)) && !h.taskIds.some((id) => openTask(id, !!h.toUser));
  // Une même tâche ou commande peut passer de main en main : elle n'appartient qu'à la passation la plus récente
  // qui la contient. Les anciennes passations ne la montrent plus (pas de doublon, pas de double « La prendre »).
  const latestOf = new Map<string, string>();
  for (const h of handoffs) for (const id of [...h.orderIds, ...h.taskIds]) if (!latestOf.has(id)) latestOf.set(id, h.id);
  const own = (h: Handoff): Handoff => ({ ...h, orderIds: h.orderIds.filter((id) => latestOf.get(id) === h.id), taskIds: h.taskIds.filter((id) => latestOf.get(id) === h.id) });
  const superseded = (h: Handoff) => (h.orderIds.length + h.taskIds.length) > 0 && own(h).orderIds.length + own(h).taskIds.length === 0;
  // Une passation à une personne précise ne s'affiche que chez elle.
  const incoming = handoffs.filter((h) => h.authorId !== me && (!h.toUser || h.toUser === me) && !h.reads.some((r) => r.userId === me) && !superseded(h) && !settled(own(h))).map(own).slice(0, 3);
  const myLast = handoffs.find((h) => h.authorId === me) ?? null;
  const myDoing = (tasks ?? []).filter((t) => t.assigneeId === me && t.status === "doing");
  const handoffOrders = orders.filter((o) => o.assignedTo === CURRENT_OPERATOR && (o.status === "recu" || o.status === "cours" || o.status === "attente"));
  const ready = !!tasks && !!notes;
  const dateText = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Toronto" }).replace(/^./, (c) => c.toUpperCase());

  const finish = async (t: TeamTask) => {
    setLeaving((s) => new Set(s).add(t.id));
    const r = await setTaskStatus(t.id, "done");
    if (r.error) { setErr(r.error); setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; }); return; }
    window.setTimeout(() => { load(); onChanged?.(); }, 450);
  };

  // Les sept prochains jours, avec les échéances de chacun.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString("en-CA");
    return { key, wd: i === 0 ? "Auj." : d.toLocaleDateString("fr-CA", { weekday: "short" }).replace(".", ""), n: d.getDate(), items: mine.filter((t) => t.dueOn === key) };
  });

  // L'équipe aujourd'hui : chacun avec ce qu'il a en cours.
  const faces = members.map((m) => {
    const n = (tasks ?? []).filter((t) => t.status !== "done" && isMine(t, m.userId, m.roles)).length;
    return { id: m.userId, name: m.name, you: m.userId === me, text: presenceText(m, n ? `${n} ${plural(n, "tâche")}` : "rien en attente"), strong: false, n };
  }).sort((a, b) => Number(b.you) - Number(a.you) || b.n - a.n).slice(0, 6);

  const stats = [
    { label: "Mes tâches", n: mine.length, color: mine.length ? C.t1 : C.t3, note: late ? `${late} en retard` : "à jour", go: "tasks" as const },
    { label: "Notes à lire", n: unreadCount, color: unreadCount ? C.coral : C.t3, note: unreadInfo?.mentions ? `dont ${unreadInfo.mentions} ${plural(unreadInfo.mentions, "mention")}` : unreadCount ? "de l'équipe" : "tout est lu", go: "notes" as const },
    ...(canOrders ? [{ label: "Mes commandes", n: myOrders.length, color: myOrders.length ? C.sage : C.t3, note: "prises en charge", go: "queue" as const }] : []),
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + GR_CSS + CSS}</style>

      <section className="hz" style={{ marginBottom: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tv-rise" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <button type="button" onClick={() => setProfile(true)} title="Modifier mon profil" aria-label="Modifier mon profil" style={{ all: "unset", cursor: "pointer", borderRadius: 99 }}>
              <TeamAvatar id={me} name={user?.name ?? "Vous"} size={60} presence />
            </button>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, color: C.t1 }}>{dateText}</span>
              <span style={{ display: "block", fontSize: 13, color: C.t3, marginTop: 2 }}>{presenceText(myself, sortRoles(roles).map(roleLabel).join(" · "))}</span>
              <button type="button" className="tv-link" style={{ marginTop: 3 }} onClick={() => setProfile(true)}>Modifier mon profil</button>
            </span>
          </div>
          <h2 className="hz-title tv-rise" style={{ animationDelay: "60ms" }}>
            {hello()}{first ? <>, <span style={{ color: nameColor(myself?.color) }}>{first}</span></> : ""}.{" "}
            {!ready ? <span className="mute">…</span>
              : mine.length ? <><span className="mute">Vous avez</span> <span style={{ color: C.coral }}>{mine.length}</span> <span className="mute">{plural(mine.length, "tâche")}{late ? `, dont ${late} en retard.` : "."}</span></>
                : <span className="mute">Rien ne vous attend aujourd'hui.</span>}
          </h2>
          <div className="ms-stats tv-rise" style={{ animationDelay: "120ms" }}>
            {stats.map((s) => (
              <button key={s.go} type="button" className="ms-stat" onClick={() => onGo(s.go)}>
                <span style={{ fontSize: 12.5, color: C.t3 }}><span className="ms-l">{s.label}</span></span>
                <span className="ms-n" style={{ color: s.color }}>{ready ? s.n : "–"}</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3 }}>{s.note}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="tv-rise" style={{ animationDelay: "160ms" }}>
          {/* En haut à droite : qui est de garde, le planning et l'activité de l'équipe. */}
          <OnCallLine />
          <TeamFaces title="L'équipe" rows={faces} />
        </div>
      </section>

      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
      {profile && <ProfilePanel onClose={() => setProfile(false)} />}

      <div className="ms-grid">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 64, alignContent: "start", minWidth: 0 }}>
          {/* Mes tâches et ma semaine */}
          <section className="tv-rise" style={{ animationDelay: "200ms" }}>
            <Head title="Mes tâches" action={<button type="button" className="ms-link" onClick={() => onGo("tasks")}>Toutes les tâches <ArrowRight style={{ width: 14, height: 14 }} /></button>} />
            <div className="ms-week">
              {week.map((d, i) => (
                <div key={d.key} title={d.items.map((t) => t.title).join("\n") || undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: i === 0 ? C.t1 : C.t3, fontWeight: i === 0 ? 500 : 400, textTransform: "capitalize" }}>{d.wd}</span>
                  <span style={{ fontSize: 17, fontWeight: i === 0 ? 600 : 400, color: C.t1, fontVariantNumeric: "tabular-nums", textDecoration: i === 0 ? "underline" : undefined, textUnderlineOffset: 5, textDecorationThickness: 1.5 }}>{d.n}</span>
                  <span style={{ display: "flex", gap: 3, height: 6 }}>{d.items.slice(0, 4).map((t) => <span key={t.id} style={{ width: 6, height: 6, borderRadius: 99, background: t.status === "doing" ? C.t2 : C.t1 }} />)}</span>
                </div>
              ))}
            </div>
            {tasks && mine.length === 0 && <p style={{ margin: 0, padding: "16px 0", fontSize: 14, color: C.t3 }}>Aucune tâche pour vous.</p>}
            {mine.slice(0, 6).map((t, i) => (
              <div key={t.id} className="ms-row tv-rise" data-leaving={leaving.has(t.id)} style={{ animationDelay: `${240 + i * 40}ms` }}>
                <button type="button" className="tv-check" data-done={leaving.has(t.id)} aria-label="Marquer fait" title="Marquer fait" onClick={() => finish(t)}>
                  <Check style={{ width: 13, height: 13 }} strokeWidth={3} />
                </button>
                <button type="button" onClick={() => onGo("tasks")} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, color: leaving.has(t.id) ? C.t3 : C.t1, textDecoration: leaving.has(t.id) ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>
                    {t.assigneeRole ? `Poste ${roleLabel(t.assigneeRole)}` : !t.assigneeId ? (t.handedOffBy ? `À reprendre · passation de ${firstName(t.handedOffBy)}` : "Toute l'équipe") : t.createdBy !== me ? <>De <TeamName id={t.createdBy} name={t.createdByName} style={{ fontWeight: 500 }} /></> : "Pour moi"}{t.status === "doing" ? " · en cours" : ""}
                    {t.dueOn && <span className="ms-due-in" style={{ color: isLate(t) || t.dueOn === today ? C.t1 : C.t3, fontWeight: isLate(t) ? 600 : 400 }}> · {isLate(t) ? `En retard · ${shortDue(t.dueOn)}` : shortDue(t.dueOn)}</span>}
                  </span>
                </button>
                {t.dueOn && <span className="ms-due" style={{ fontSize: 13, whiteSpace: "nowrap", color: isLate(t) || t.dueOn === today ? C.t1 : C.t3, fontWeight: isLate(t) ? 600 : 400 }}>{isLate(t) ? `En retard · ${shortDue(t.dueOn)}` : shortDue(t.dueOn)}</span>}
                {t.createdBy !== me && <TeamAvatar id={t.createdBy} name={t.createdByName} size={26} />}
              </div>
            ))}
            {mine.length > 6 && <p style={{ margin: "10px 0 0", fontSize: 13, color: C.t3 }}>Et {mine.length - 6} de plus.</p>}
          </section>

          {/* Passations reçues, juste au-dessus de la mienne (colonne de gauche) */}
          {incoming.map((h) => (
            <IncomingHandoff key={h.id} h={h} orders={orders} tasks={tasks ?? []} onOpenOrder={onOpenOrder} onGo={onGo}
              onTake={async (id) => { const r = await takeTask(id); if (r.error) setErr(r.error); load(); onChanged?.(); }}
              onAck={async () => { const r = await ackHandoff(h.id); if (r.error) setErr(r.error); else load(); }} />
          ))}

          {/* Ma passation de fin de journée */}
          <MyHandoff members={members.filter((m) => m.userId !== me)} last={myLast} done={!!myLast && settled(myLast)} orderIds={handoffOrders.map((o) => o.id)} taskIds={myDoing.map((t) => t.id)} onSent={load} onError={setErr} />

          {/* Mes commandes en cours */}
          {canOrders && (
            <section className="tv-rise" style={{ animationDelay: "260ms" }}>
              <Head title="Mes commandes en cours" action={<button type="button" className="ms-link" onClick={() => onGo("queue")}>File d'attente <ArrowRight style={{ width: 14, height: 14 }} /></button>} />
              {myOrders.length === 0 && <p style={{ margin: 0, padding: "16px 0", fontSize: 14, color: C.t3 }}>Aucune commande à votre nom.</p>}
              {myOrders.slice(0, 5).map((o) => (
                <button key={o.id} type="button" className="ms-row" onClick={() => onOpenOrder(o)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "12px 6px", margin: "0 -6px", borderBottom: `1px solid ${C.bds}`, borderRadius: 10, width: "calc(100% + 12px)", boxSizing: "border-box" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, color: C.t1 }}>{o.type === "buy" ? "Achat" : "Vente"} · {o.clientName}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>{o.ref} · {STATUS_META[o.status].label} · {ago(o.createdMinsAgo)}</span>
                  </span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ display: "block", fontSize: 15, color: C.t1 }}>{nfCad.format(o.cad)} $</span>
                    <span style={{ display: "block", fontSize: 12, color: C.t3 }}>{nfUsdt.format(o.usdt)} USDT</span>
                  </span>
                </button>
              ))}
            </section>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 48, alignContent: "start", minWidth: 0 }}>
          {/* Le fil de l'équipe */}
          <section className="tv-rise" style={{ animationDelay: "230ms" }}>
            <Head title="Le fil de l'équipe" action={<button type="button" className="ms-link" onClick={() => onGo("notes")}>{unreadCount ? `Lire (${unreadCount})` : "Ouvrir"} <ArrowRight style={{ width: 14, height: 14 }} /></button>} />
            {notes && feed.length === 0 && <p style={{ margin: 0, padding: "16px 0", fontSize: 14, color: C.t3 }}>Personne n'a encore écrit.</p>}
            {feed.map((n) => {
              const isNew = unread.includes(n);
              return (
                <button key={n.id} type="button" className="ms-row" onClick={() => onGo("notes")}
                  style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 6px", margin: "0 -6px", borderBottom: `1px solid ${C.bds}`, borderRadius: 10, width: "calc(100% + 12px)", boxSizing: "border-box" }}>
                  <TeamAvatar id={n.authorId} name={n.authorName} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", fontSize: 12.5, color: C.t3 }}>
                      <TeamName id={n.authorId} name={n.authorName.split(" ")[0]} you={n.authorId === me} style={{ fontSize: 13.5 }} />
                      <span># {n.audience === "all" ? "Toute l'équipe" : audienceLabel(n.audience)} · {agoIso(n.at)}</span>
                      {n.pinned && <Pin style={{ width: 12, height: 12, color: C.t2, alignSelf: "center" }} />}
                      {n.mentions.includes(me) && isNew && <span className="tv-badge" style={{ height: 18, fontSize: 11 }}>@vous</span>}
                      {isNew && !n.mentions.includes(me) && <span className="tv-badge" style={{ height: 18, fontSize: 11 }}>nouvelle</span>}
                    </span>
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 3, fontSize: 14.5, lineHeight: 1.5, color: isNew ? C.t1 : C.t2, overflowWrap: "anywhere" }}>{n.body}</span>
                  </span>
                </button>
              );
            })}
          </section>

          {/* Demandes d'approbation */}
          <ApprovalsBlock onOpenOrder={(id) => { const o = orders.find((x) => x.id === id); if (o) onOpenOrder(o); }} />

          {/* Mon bloc-notes */}
          <PrivatePad me={me} />
        </div>
      </div>
    </div>
  );
}

function PrivatePad({ me }: { me: string }) {
  const [body, setBody] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const timer = useRef<number | undefined>();
  const latest = useRef("");
  useEffect(() => { loadPrivateNote().then((n) => { setBody(n.body); latest.current = n.body; setSaved(n.updatedAt); }).catch(() => setBody("")); }, []);
  const save = useCallback(async () => {
    if (!me) return;
    setState("saving");
    const r = await savePrivateNote(me, latest.current);
    if (r.error) setState("error"); else { setState("idle"); setSaved(new Date().toISOString()); }
  }, [me]);
  // Enregistrement automatique, une seconde après la dernière frappe (et en quittant la page).
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void save(); } }, [save]);
  const onChange = (v: string) => {
    setBody(v); latest.current = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = undefined; void save(); }, 1000);
  };
  return (
    <section className="tv-rise" style={{ animationDelay: "290ms" }}>
      <Head title="Mon bloc-notes" action={<span style={{ fontSize: 12, color: C.t3 }}>
        {state === "saving" ? "Enregistrement…" : state === "error" ? "Pas enregistré, réessayez" : saved ? `Enregistré à ${new Date(saved).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}` : "Privé"}
      </span>} />
      <textarea className="ms-paper" value={body ?? ""} disabled={body == null} maxLength={20000} onChange={(e) => onChange(e.target.value)}
        placeholder={"Vos notes à vous : rappels, idées, numéros utiles…\nPersonne d'autre ne les voit."} />
    </section>
  );
}

/** La passation d'un collègue : son mot, ses commandes et tâches en cours, et « Bien reçu ». */
function IncomingHandoff({ h, orders, tasks, onOpenOrder, onGo, onAck, onTake }: {
  h: Handoff; orders: AdminOrder[]; tasks: TeamTask[]; onOpenOrder: (o: AdminOrder) => void; onGo: (tab: "tasks" | "notes" | "queue") => void; onAck: () => void;
  onTake: (taskId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  const rowStyle: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "11px 6px", margin: "0 -6px", borderBottom: `1px solid ${C.bds}`, borderRadius: 10, width: "calc(100% + 12px)", boxSizing: "border-box" };
  return (
    <section className="tv-rise">
      <Head title={`Passation de ${firstName(h.authorName)}${h.toUser ? " · pour vous" : ""}`} action={
        <button type="button" className="ms-link" disabled={busy} onClick={async () => { setBusy(true); await onAck(); setBusy(false); }}>Bien reçu <ArrowRight style={{ width: 14, height: 14 }} /></button>
      } />
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 0 6px" }}>
        <TeamAvatar id={h.authorId} name={h.authorName} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}><TeamName id={h.authorId} name={firstName(h.authorName)} style={{ fontSize: 13.5 }} /> · {agoIso(h.at)}</p>
          {h.body && <p style={{ margin: "6px 0 0", fontSize: 15.5, lineHeight: 1.6, color: C.t1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{h.body}</p>}
        </div>
      </div>
      {h.orderIds.map((id) => {
        const o = orders.find((x) => x.id === id);
        return o ? (
          <button key={id} type="button" style={rowStyle} onClick={() => onOpenOrder(o)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14.5, color: C.t1 }}>{o.type === "buy" ? "Achat" : "Vente"} · {o.clientName}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>{o.ref} · {STATUS_META[o.status].label} · {o.assignedTo ? `prise par ${o.assignedTo === "Vous" ? "vous" : o.assignedTo}` : "libre, à prendre dans la commande"}</span>
            </span>
            <span style={{ fontSize: 14.5, color: C.t1, fontVariantNumeric: "tabular-nums" }}>{nfCad.format(o.cad)} $</span>
          </button>
        ) : (
          <p key={id} style={{ margin: 0, padding: "11px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 13.5, color: C.t3 }}>{orderRef(id)} · plus dans la file</p>
        );
      })}
      {h.taskIds.map((id) => {
        const t = tasks.find((x) => x.id === id);
        if (!t) return null;
        return (
          <div key={id} style={{ ...rowStyle, cursor: "default" }}>
            <button type="button" onClick={() => onGo("tasks")} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14.5, color: t.status === "done" ? C.t3 : C.t1, textDecoration: t.status === "done" ? "line-through" : "none", overflowWrap: "anywhere" }}>{t.title}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>
                Tâche · {t.status === "done" ? "faite" : h.toUser && t.assigneeId === h.toUser ? "confiée à vous" : t.assigneeId ? `prise par ${firstName(memberById(t.assigneeId)?.name ?? "un membre")}` : "à reprendre"}{t.steps.length ? ` · ${t.steps.filter((x) => x.done).length} sur ${t.steps.length} étapes` : ""}
              </span>
            </button>
            {!t.assigneeId && t.status !== "done" && (
              <button type="button" className="ms-link" disabled={taking === id} onClick={async () => { setTaking(id); await onTake(id); setTaking(null); }}>La prendre <ArrowRight style={{ width: 14, height: 14 }} /></button>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Ma passation : un mot pour la suite, mes commandes ouvertes et tâches en cours rattachées toutes seules. */
function MyHandoff({ members, last, done, orderIds, taskIds, onSent, onError }: {
  members: TeamMember[]; last: Handoff | null; done: boolean; orderIds: string[]; taskIds: string[]; onSent: () => void; onError: (e: string) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  // À toute l'équipe (le premier qui prend), ou à une personne précise (tout lui est confié directement).
  const [toKind, setToKind] = useState<"team" | "person">("team");
  const [person, setPerson] = useState(members[0]?.userId ?? "");
  useEffect(() => { if (!person && members[0]) setPerson(members[0].userId); }, [members, person]);
  // Ce qui vient d'être remis à l'équipe n'est plus à moi : on ne le propose plus.
  const [released, setReleased] = useState<Set<string>>(new Set());
  const [sentAt, setSentAt] = useState<number | null>(null);
  orderIds = orderIds.filter((id) => !released.has(id));
  taskIds = taskIds.filter((id) => !released.has(id));
  const justSent = !!sentAt && Date.now() - sentAt < 120_000;
  const parts = [orderIds.length ? `${orderIds.length} ${plural(orderIds.length, "commande ouverte", "commandes ouvertes")}` : null, taskIds.length ? `${taskIds.length} ${plural(taskIds.length, "tâche en cours", "tâches en cours")}` : null].filter(Boolean);
  const send = async () => {
    setBusy(true);
    const r = await postHandoff(body, orderIds, taskIds, toKind === "person" ? person || null : null);
    setBusy(false);
    if (r.error) { onError(r.error); return; }
    setReleased((x) => new Set([...x, ...orderIds, ...taskIds]));
    setSentAt(Date.now());
    setBody(""); onSent();
  };
  const readers = last?.reads.map((r) => firstName(r.name)) ?? [];
  const who = firstName(members.find((m) => m.userId === person)?.name ?? "cette personne");
  return (
    <section className="tv-rise" style={{ animationDelay: "240ms" }}>
      <Head title="Ma passation de fin de journée" />
      {/* Deux étapes nettes : pour qui, puis le mot. Une seule zone d'écriture, bien délimitée. */}
      {members.length > 0 && (
        <>
          <p className="hp-l">Pour qui</p>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 2, color: C.t2 }}>
            <Opts value={toKind} onChange={setToKind} options={[{ v: "team", label: "Toute l'équipe" }, { v: "person", label: "Une personne" }]} />
          </p>
          {toKind === "person" && <PersonPicker members={members} value={person} onChange={setPerson} />}
        </>
      )}
      <p className="hp-l">Votre mot pour la suite</p>
      <textarea className="hp-ta" rows={3} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)}
        placeholder="Où j'en suis, ce qui reste à faire, à qui s'adresser…" />
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.t3 }}>{parts.length
        ? (toKind === "person" ? `Confiées directement à ${who} : ${parts.join(" et ")}.` : `Remises à l'équipe : ${parts.join(" et ")}. Le premier qui les prend les a pour lui.`)
        : "Aucune commande ni tâche en cours à remettre."}</p>
      <p style={{ margin: "16px 0 0" }}>
        <button type="button" className="tv-go" disabled={busy || justSent || (!body.trim() && !parts.length) || (toKind === "person" && !person)} onClick={send}>
          {busy ? "Envoi…" : justSent ? "Transmise" : toKind === "person" ? "Transmettre" : "Transmettre à l'équipe"} {!justSent && <ArrowRight style={{ width: 15, height: 15 }} />}
        </button>
      </p>
      {last && (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: C.t3 }}>
          Dernière passation transmise {agoIso(last.at)}{last.toName ? ` à ${firstName(last.toName)}` : ""} · {done ? "tout ce que vous aviez laissé est terminé" : readers.length ? `lue par ${readers.join(", ")}` : "pas encore lue"}.
        </p>
      )}
    </section>
  );
}
