import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Pin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { nfCad, nfUsdt, STATUS_META, type AdminOrder } from "@/lib/adminOrders";
import { roleLabel, sortRoles } from "@/lib/roles";
import {
  audienceLabel, isLate, isMine, loadNotes, loadPrivateNote, loadTasks, savePrivateNote, setTaskStatus, todayToronto,
  type TeamNote, type TeamTask,
} from "@/lib/teamSpace";
import { C, FONT } from "./adminTheme";
import { Notice } from "./ui";
import { TeamAvatar, TeamFaces, TV_CSS, plural, useMembers, useTeamLive } from "./TeamViews";

/**
 * Mon espace : la page d'accueil de chaque membre, dans le style du back-office (grande phrase,
 * chiffres posés sur la page, listes à traits fins). Mes tâches et ma semaine, le fil de l'équipe,
 * mes commandes prises en charge et mon bloc-notes privé (personne d'autre ne le voit).
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
.ms-row { display: flex; align-items: center; gap: 12px; padding: 12px 6px; margin: 0 -6px; border-bottom: 1px solid var(--a-bds); border-radius: 10px; transition: background .15s, opacity .4s, transform .4s; }
.ms-row:hover { background: var(--a-hover2); }
.ms-row[data-leaving="true"] { opacity: 0; transform: translateX(12px); }
.ms-link { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; }
.ms-link svg { transition: transform .15s; }
@media (hover: hover) { .ms-link:hover svg { transform: translateX(3px); } }
.ms-link:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.ms-paper { width: 100%; box-sizing: border-box; border: none; outline: none; resize: vertical; min-height: 270px; padding: 0; margin-top: 2px; font: inherit; font-size: 15px; line-height: 30px; color: var(--a-t1);
  background: repeating-linear-gradient(transparent 0 29px, var(--a-bds) 29px 30px); background-attachment: local; }
.ms-paper::placeholder { color: var(--a-t3); }
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
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [notes, setNotes] = useState<TeamNote[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    loadTasks(false).then(setTasks).catch((e: Error) => setErr(e.message));
    loadNotes(false).then(setNotes).catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_notes", "team_note_replies"]);

  const mine = (tasks ?? []).filter((t) => isMine(t, me, roles) && t.status !== "done")
    .sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || b.at.localeCompare(a.at));
  const late = mine.filter(isLate).length;
  const today = todayToronto();
  const unread = (notes ?? []).filter((n) => n.authorId !== me && !n.readBy.some((r) => r.userId === me));
  const feed = (notes ?? []).slice(0, 5);
  const myOrders = canOrders ? orders.filter((o) => o.assignedTo === me && (o.status === "recu" || o.status === "cours")) : [];
  const first = (user?.name ?? "").split(/\s+/)[0];
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
    return { id: m.userId, name: m.name, you: m.userId === me, text: n ? `${n} ${plural(n, "tâche")}` : "rien en attente", strong: false, n };
  }).sort((a, b) => Number(b.you) - Number(a.you) || b.n - a.n).slice(0, 6);

  const stats = [
    { label: "Mes tâches", n: mine.length, color: mine.length ? C.t1 : C.t3, note: late ? `${late} en retard` : "à jour", go: "tasks" as const },
    { label: "Notes à lire", n: unread.length, color: unread.length ? C.coral : C.t3, note: unread.length ? "de l'équipe" : "tout est lu", go: "notes" as const },
    ...(canOrders ? [{ label: "Mes commandes", n: myOrders.length, color: myOrders.length ? C.sage : C.t3, note: "prises en charge", go: "queue" as const }] : []),
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + CSS}</style>

      <section className="hz" style={{ marginBottom: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tv-rise" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <TeamAvatar id={me} name={user?.name ?? "Vous"} size={56} />
            <span>
              <span style={{ display: "block", fontSize: 14, color: C.t1 }}>{dateText}</span>
              <span style={{ display: "block", fontSize: 13, color: C.t3, marginTop: 2 }}>{sortRoles(roles).map(roleLabel).join(" · ")}</span>
            </span>
          </div>
          <h2 className="hz-title tv-rise" style={{ animationDelay: "60ms" }}>
            {hello()}{first ? `, ${first}` : ""}.{" "}
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
        <div className="tv-rise" style={{ animationDelay: "160ms" }}><TeamFaces title="L'équipe" rows={faces} /></div>
      </section>

      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}

      <div className="ms-grid">
        <div style={{ display: "grid", gap: 48, alignContent: "start" }}>
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
                    {t.assigneeRole ? `Poste ${roleLabel(t.assigneeRole)}` : !t.assigneeId ? "Toute l'équipe" : t.createdBy !== me ? `De ${t.createdByName}` : "Pour moi"}{t.status === "doing" ? " · en cours" : ""}
                  </span>
                </button>
                {t.dueOn && <span style={{ fontSize: 13, whiteSpace: "nowrap", color: isLate(t) || t.dueOn === today ? C.t1 : C.t3, fontWeight: isLate(t) ? 600 : 400 }}>{isLate(t) ? `En retard · ${shortDue(t.dueOn)}` : shortDue(t.dueOn)}</span>}
                {t.createdBy !== me && <TeamAvatar id={t.createdBy} name={t.createdByName} size={24} />}
              </div>
            ))}
            {mine.length > 6 && <p style={{ margin: "10px 0 0", fontSize: 13, color: C.t3 }}>Et {mine.length - 6} de plus.</p>}
          </section>

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

        <div style={{ display: "grid", gap: 48, alignContent: "start" }}>
          {/* Le fil de l'équipe */}
          <section className="tv-rise" style={{ animationDelay: "230ms" }}>
            <Head title="Le fil de l'équipe" action={<button type="button" className="ms-link" onClick={() => onGo("notes")}>{unread.length ? `Lire (${unread.length})` : "Ouvrir"} <ArrowRight style={{ width: 14, height: 14 }} /></button>} />
            {notes && feed.length === 0 && <p style={{ margin: 0, padding: "16px 0", fontSize: 14, color: C.t3 }}>Personne n'a encore écrit.</p>}
            {feed.map((n) => {
              const isNew = unread.includes(n);
              return (
                <button key={n.id} type="button" className="ms-row" onClick={() => onGo("notes")}
                  style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 6px", margin: "0 -6px", borderBottom: `1px solid ${C.bds}`, borderRadius: 10, width: "calc(100% + 12px)", boxSizing: "border-box" }}>
                  <TeamAvatar id={n.authorId} name={n.authorName} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", fontSize: 12.5, color: C.t3 }}>
                      <span style={{ color: C.t1, fontWeight: 600, fontSize: 13.5 }}>{n.authorId === me ? "Vous" : n.authorName.split(" ")[0]}</span>
                      <span># {n.audience === "all" ? "Toute l'équipe" : audienceLabel(n.audience)} · {agoIso(n.at)}</span>
                      {n.pinned && <Pin style={{ width: 12, height: 12, color: C.t2, alignSelf: "center" }} />}
                      {isNew && <span className="tv-badge" style={{ height: 18, fontSize: 11 }}>nouvelle</span>}
                    </span>
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 3, fontSize: 14.5, lineHeight: 1.5, color: isNew ? C.t1 : C.t2 }}>{n.body}</span>
                  </span>
                </button>
              );
            })}
          </section>

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
