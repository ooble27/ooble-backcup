import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarCheck2, Check, MessagesSquare, NotebookPen, Pin, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { nfCad, nfUsdt, STATUS_META, type AdminOrder } from "@/lib/adminOrders";
import { roleLabel, sortRoles } from "@/lib/roles";
import {
  audienceLabel, isLate, isMine, loadNotes, loadPrivateNote, loadTasks, savePrivateNote, setTaskStatus, todayToronto,
  type TeamNote, type TeamTask,
} from "@/lib/teamSpace";
import { C, FONT } from "./adminTheme";
import { Notice } from "./ui";
import { TeamAvatar, TV_CSS, hueOf, plural, useTeamLive } from "./TeamViews";

/**
 * Mon espace : la page d'accueil de chaque membre. Un en-tête illustré avec l'essentiel en chiffres,
 * puis quatre blocs : mes tâches (et ma semaine), le fil de l'équipe, mes commandes prises en
 * charge et mon bloc-notes privé (personne d'autre ne le voit).
 */

const CSS = `
.ms-hero { position: relative; overflow: hidden; border-radius: 28px; padding: 34px 36px; display: grid; gap: 24px; align-items: center;
  background: radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--a-sage) 22%, transparent) 0%, transparent 55%),
              radial-gradient(90% 120% at 0% 100%, color-mix(in srgb, var(--a-sun) 16%, transparent) 0%, transparent 60%),
              color-mix(in srgb, var(--a-t1) 3%, var(--a-bg)); }
@media (min-width: 1000px) { .ms-hero { grid-template-columns: minmax(0, 1fr) 400px; } }
@media (max-width: 640px) { .ms-hero { padding: 24px 20px; border-radius: 22px; } .ms-art { display: none; } }
.ms-hello { margin: 0; font-size: clamp(32px, 4vw, 52px); line-height: 1.04; font-weight: 600; letter-spacing: -0.045em; color: var(--a-t1); text-wrap: balance; }
.ms-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 26px; max-width: 620px; }
.ms-stat { all: unset; box-sizing: border-box; cursor: pointer; padding: 14px 16px; border-radius: 18px; background: var(--a-bg); box-shadow: 0 0 0 1px var(--a-bds);
  transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s; }
@media (hover: hover) { .ms-stat:hover { transform: translateY(-3px); box-shadow: 0 0 0 1px var(--a-bd), 0 12px 24px -12px rgba(0,0,0,.3); } }
.ms-stat:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.ms-grid { display: grid; gap: 18px; margin-top: 20px; grid-template-columns: minmax(0, 1fr); align-items: start; }
@media (min-width: 1100px) { .ms-grid { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); } }
.ms-card { padding: 22px 22px 18px; border-radius: 24px; }
.ms-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.ms-ic { width: 34px; height: 34px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ms-day { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 0 7px; border-radius: 14px; font-variant-numeric: tabular-nums; }
.ms-task { display: flex; align-items: center; gap: 12px; padding: 11px 10px; margin: 0 -10px; border-radius: 14px; transition: background .15s, opacity .4s, transform .4s; }
.ms-task:hover { background: color-mix(in srgb, var(--a-t1) 4%, transparent); }
.ms-task[data-leaving="true"] { opacity: 0; transform: translateX(14px); }
.ms-paper { width: 100%; box-sizing: border-box; border: none; outline: none; resize: vertical; min-height: 300px; padding: 4px 2px; font: inherit; font-size: 15px; line-height: 30px; color: var(--a-t1);
  background: repeating-linear-gradient(transparent 0 29px, color-mix(in srgb, var(--a-t1) 10%, transparent) 29px 30px); background-attachment: local; }
.ms-paper::placeholder { color: var(--a-t3); }
.ms-link { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; }
.ms-link svg { transition: transform .15s; }
@media (hover: hover) { .ms-link:hover svg { transform: translateX(3px); } }
.ms-link:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.ms-spark { animation: tv-glow 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .ms-spark { animation: none; } .ms-stat, .ms-task { transition: none; } }
`;

const hello = () => { const h = Number(new Date().toLocaleString("en-CA", { hour: "numeric", hour12: false, timeZone: "America/Toronto" })); return h < 5 || h >= 18 ? "Bonsoir" : "Bonjour"; };
const shortDue = (d: string) => (d === todayToronto() ? "aujourd'hui" : new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" }));
const ago = (mins: number) => (mins < 60 ? `il y a ${Math.max(1, Math.round(mins))} min` : mins < 60 * 24 ? `il y a ${Math.round(mins / 60)} h` : `il y a ${Math.round(mins / 1440)} j`);
const agoIso = (iso: string) => ago((Date.now() - new Date(iso).getTime()) / 60000);

/** Illustration de l'en-tête : un bureau, des notes et un calendrier qui flottent doucement. */
function DeskScene() {
  const f = (v: string) => ({ fill: v });
  return (
    <svg className="ms-art" viewBox="0 0 420 300" role="img" aria-label="Votre espace de travail" style={{ width: "100%", height: "auto", display: "block" }}>
      <circle cx="215" cy="160" r="122" style={f("color-mix(in srgb, var(--a-sage) 20%, transparent)")} />
      <circle cx="320" cy="70" r="40" style={f("color-mix(in srgb, var(--a-sun) 18%, transparent)")} />
      {/* Ordinateur avec la liste des tâches */}
      <g>
        <rect x="118" y="112" width="200" height="128" rx="12" style={f("var(--a-t1)")} />
        <rect x="126" y="120" width="184" height="112" rx="6" style={f("var(--a-bg)")} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <circle cx="142" cy={140 + i * 24} r="7" style={{ fill: i < 2 ? "var(--a-sage)" : "transparent", stroke: i < 2 ? "none" : "var(--a-bd)", strokeWidth: 2 }} />
            {i < 2 && <path d={`M138.5 ${140 + i * 24} l2.6 2.6 4.6 -5`} style={{ fill: "none", stroke: "var(--a-bg)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }} />}
            <rect x="156" y={136 + i * 24} width={[110, 84, 124, 70][i]} height="8" rx="4" style={f(`color-mix(in srgb, var(--a-t1) ${i < 2 ? 14 : 26}%, transparent)`)} />
          </g>
        ))}
        <path d="M96 240 h244 a6 6 0 0 1 -6 10 h-232 a6 6 0 0 1 -6 -10z" style={f("color-mix(in srgb, var(--a-t1) 70%, var(--a-bg))")} />
      </g>
      {/* Note jaune */}
      <g className="tv-float" style={{ animationDelay: "-1s" }}>
        <g transform="rotate(-8 70 92)">
          <rect x="30" y="52" width="86" height="82" rx="8" style={f("var(--a-sun)")} />
          <rect x="42" y="70" width="58" height="6" rx="3" style={f("rgba(20,17,15,.35)")} />
          <rect x="42" y="84" width="44" height="6" rx="3" style={f("rgba(20,17,15,.25)")} />
          <rect x="42" y="98" width="52" height="6" rx="3" style={f("rgba(20,17,15,.25)")} />
        </g>
      </g>
      {/* Calendrier */}
      <g className="tv-float" style={{ animationDelay: "-3s" }}>
        <rect x="318" y="118" width="84" height="86" rx="12" style={{ fill: "var(--a-bg)", stroke: "var(--a-bds)", strokeWidth: 1.5 }} />
        <path d="M318 130 a12 12 0 0 1 12 -12 h60 a12 12 0 0 1 12 12 v10 h-84z" style={f("var(--a-coral)")} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <circle key={i} cx={334 + (i % 3) * 26} cy={156 + Math.floor(i / 3) * 16} r="4.5" style={f(i === 4 ? "var(--a-coral)" : "color-mix(in srgb, var(--a-t1) 18%, transparent)")} />
        ))}
      </g>
      {/* Bulle de l'équipe */}
      <g className="tv-float" style={{ animationDelay: "-2s" }}>
        <path d="M222 26 h86 a16 16 0 0 1 16 16 v22 a16 16 0 0 1 -16 16 h-62 l-16 14 v-14 h-8 a16 16 0 0 1 -16 -16 v-22 a16 16 0 0 1 16 -16z" style={f("var(--a-vzIndigo)")} />
        {[0, 1, 2].map((i) => <circle key={i} className="ms-spark" cx={246 + i * 18} cy="53" r="4.5" style={{ fill: "#fff", animationDelay: `${i * 0.35}s` }} />)}
      </g>
      {/* Coche */}
      <g className="tv-float" style={{ animationDelay: "-4.5s" }}>
        <circle cx="86" cy="208" r="22" style={f("var(--a-sage)")} />
        <path d="M76 208 l7 7 13 -14" style={{ fill: "none", stroke: "#fff", strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round" }} />
      </g>
      {/* Étincelles */}
      {[[176, 44, 0], [390, 236, 1.1], [30, 160, 2]].map(([x, y, d], i) => (
        <path key={i} className="ms-spark" style={{ fill: "var(--a-sun)", animationDelay: `${d}s` }} d={`M${x} ${y - 8} l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z`} />
      ))}
    </svg>
  );
}

export function MySpace({ orders, onGo, onOpenOrder, canOrders, onChanged }: {
  orders: AdminOrder[]; onGo: (tab: "tasks" | "notes" | "queue") => void; onOpenOrder: (o: AdminOrder) => void; canOrders: boolean; onChanged?: () => void;
}) {
  const { user, roles } = useAuth();
  const me = user?.id ?? "";
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
  const dueToday = mine.filter((t) => t.dueOn === today).length;
  const unread = (notes ?? []).filter((n) => n.authorId !== me && !n.readBy.some((r) => r.userId === me));
  const feed = (notes ?? []).slice(0, 5);
  const myOrders = canOrders ? orders.filter((o) => o.assignedTo === me && (o.status === "recu" || o.status === "cours")) : [];
  const first = (user?.name ?? "").split(/\s+/)[0];
  const dateText = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Toronto" }).replace(/^./, (c) => c.toUpperCase());

  const finish = async (t: TeamTask) => {
    setLeaving((s) => new Set(s).add(t.id));
    const r = await setTaskStatus(t.id, "done");
    if (r.error) { setErr(r.error); setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; }); return; }
    window.setTimeout(() => { load(); onChanged?.(); }, 450);
  };

  // Les sept prochains jours, avec le nombre d'échéances de chacun.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString("en-CA");
    return { key, wd: i === 0 ? "auj." : d.toLocaleDateString("fr-CA", { weekday: "short" }).replace(".", ""), n: d.getDate(), count: mine.filter((t) => t.dueOn === key).length };
  });

  const stats = [
    { n: mine.length, label: plural(mine.length, "tâche"), sub: late ? `${late} en retard` : dueToday ? `${dueToday} pour aujourd'hui` : "à jour", hue: "var(--a-vzIndigo)", go: "tasks" as const },
    { n: unread.length, label: plural(unread.length, "note à lire", "notes à lire"), sub: unread.length ? "de l'équipe" : "tout est lu", hue: "var(--a-coral)", go: "notes" as const },
    ...(canOrders ? [{ n: myOrders.length, label: plural(myOrders.length, "commande"), sub: "à votre nom", hue: "var(--a-sage)", go: "queue" as const }] : []),
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{TV_CSS + CSS}</style>

      <section className="ms-hero tv-rise">
        <div style={{ minWidth: 0 }}>
          <p className="tv-rise" style={{ margin: "0 0 12px", fontSize: 13.5, color: C.t2, animationDelay: "60ms" }}>{dateText} · {sortRoles(roles).map(roleLabel).join(" · ")}</p>
          <h1 className="ms-hello tv-rise" style={{ animationDelay: "100ms" }}>
            {hello()}{first ? <>, <span style={{ color: C.sage }}>{first}</span></> : ""}.
            <br /><span style={{ color: C.t3 }}>
              {!tasks || !notes ? "…" : late ? `${late} ${plural(late, "tâche")} en retard à rattraper.` : mine.length ? "Voici votre journée." : "Rien ne vous attend : belle journée."}
            </span>
          </h1>
          <div className="ms-stats">
            {stats.map((s, i) => (
              <button key={s.go} type="button" className="ms-stat tv-rise" style={{ animationDelay: `${160 + i * 60}ms` }} onClick={() => onGo(s.go)}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.04em", color: s.n ? s.hue : C.t3, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{tasks && notes ? s.n : "–"}</span>
                  <span style={{ fontSize: 13.5, color: C.t1, fontWeight: 500 }}>{s.label}</span>
                </span>
                <span style={{ display: "block", marginTop: 6, fontSize: 12.5, color: C.t3 }}>{s.sub}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="tv-rise" style={{ animationDelay: "140ms" }}><DeskScene /></div>
      </section>

      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}

      <div className="ms-grid">
        {/* Mes tâches et ma semaine */}
        <section className="tv-card ms-card tv-rise" style={{ animationDelay: "220ms" }}>
          <div className="ms-head">
            <span className="ms-ic" style={{ background: "color-mix(in srgb, var(--a-vzIndigo) 16%, transparent)", color: "var(--a-vzIndigo)" }}><CalendarCheck2 style={{ width: 17, height: 17 }} /></span>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.t1 }}>Mes tâches</span>
            <button type="button" className="ms-link" onClick={() => onGo("tasks")}>Tableau des tâches <ArrowRight style={{ width: 14, height: 14 }} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
            {week.map((d, i) => (
              <div key={d.key} className="ms-day" title={d.count ? `${d.count} ${plural(d.count, "échéance")}` : undefined}
                style={{ background: i === 0 ? "var(--a-t1)" : d.count ? "color-mix(in srgb, var(--a-vzIndigo) 12%, transparent)" : "color-mix(in srgb, var(--a-t1) 3.5%, transparent)", color: i === 0 ? "var(--a-bg)" : C.t1 }}>
                <span style={{ fontSize: 11, opacity: 0.75, textTransform: "capitalize" }}>{d.wd}</span>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{d.n}</span>
                <span style={{ display: "flex", gap: 3, height: 6 }}>{Array.from({ length: Math.min(d.count, 4) }, (_, k) => <span key={k} style={{ width: 6, height: 6, borderRadius: 99, background: i === 0 ? "var(--a-bg)" : "var(--a-vzIndigo)" }} />)}</span>
              </div>
            ))}
          </div>
          {tasks && mine.length === 0 && (
            <div style={{ textAlign: "center", padding: "26px 10px 14px" }}>
              <span style={{ width: 52, height: 52, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--a-sage) 18%, transparent)", color: "var(--a-sage)" }}><Check style={{ width: 24, height: 24 }} strokeWidth={2.6} /></span>
              <p style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 600, color: C.t1 }}>Aucune tâche pour vous</p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: C.t3 }}>Profitez-en, ou donnez un coup de main à l'équipe.</p>
            </div>
          )}
          {mine.slice(0, 6).map((t, i) => (
            <div key={t.id} className="ms-task tv-rise" data-leaving={leaving.has(t.id)} style={{ animationDelay: `${260 + i * 40}ms` }}>
              <button type="button" className="tv-check" data-done={leaving.has(t.id)} aria-label="Marquer fait" title="Marquer fait" onClick={() => finish(t)}>
                <Check style={{ width: 13, height: 13 }} strokeWidth={3} />
              </button>
              <button type="button" onClick={() => onGo("tasks")} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, color: leaving.has(t.id) ? C.t3 : C.t1, textDecoration: leaving.has(t.id) ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>
                  {t.assigneeRole ? `Poste ${roleLabel(t.assigneeRole)}` : !t.assigneeId ? "Toute l'équipe" : t.createdBy !== me ? `De ${t.createdByName}` : "Pour moi"}{t.status === "doing" ? " · en cours" : ""}
                </span>
              </button>
              {t.dueOn && (
                <span className="tv-chip" style={isLate(t) ? { background: "color-mix(in srgb, var(--a-coral) 16%, transparent)", color: C.t1, fontWeight: 600 } : t.dueOn === today ? { background: "color-mix(in srgb, var(--a-sun) 22%, transparent)", color: C.t1 } : undefined}>
                  {isLate(t) ? "En retard" : shortDue(t.dueOn)}
                </span>
              )}
            </div>
          ))}
          {mine.length > 6 && <p style={{ margin: "8px 0 0", fontSize: 13, color: C.t3 }}>Et {mine.length - 6} de plus dans le tableau.</p>}
        </section>

        {/* Le fil de l'équipe */}
        <section className="tv-card ms-card tv-rise" style={{ animationDelay: "280ms" }}>
          <div className="ms-head">
            <span className="ms-ic" style={{ background: "color-mix(in srgb, var(--a-coral) 16%, transparent)", color: "var(--a-coral)" }}><MessagesSquare style={{ width: 17, height: 17 }} /></span>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.t1 }}>Le fil de l'équipe</span>
            <button type="button" className="ms-link" onClick={() => onGo("notes")}>Ouvrir <ArrowRight style={{ width: 14, height: 14 }} /></button>
          </div>
          {notes && feed.length === 0 && <p style={{ margin: "18px 0 6px", fontSize: 14, color: C.t3, textAlign: "center" }}>Personne n'a encore écrit. Lancez la conversation.</p>}
          {feed.map((n, i) => {
            const isNew = unread.includes(n);
            return (
              <button key={n.id} type="button" className="tv-rise" onClick={() => onGo("notes")}
                style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, padding: "9px 0", width: "100%", boxSizing: "border-box", animationDelay: `${320 + i * 50}ms` }}>
                <TeamAvatar name={n.authorName} size={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.t3, flexWrap: "wrap" }}>
                    <span style={{ color: C.t1, fontWeight: 600, fontSize: 13.5 }}>{n.authorId === me ? "Vous" : n.authorName.split(" ")[0]}</span>
                    # {n.audience === "all" ? "Toute l'équipe" : audienceLabel(n.audience)} · {agoIso(n.at)}
                    {n.pinned && <Pin style={{ width: 12, height: 12, color: C.sun }} />}
                    {isNew && <span style={{ color: C.coral, fontWeight: 600 }}>nouvelle</span>}
                  </span>
                  <span style={{
                    maxWidth: "100%", marginTop: 4, padding: "8px 12px", borderRadius: "4px 16px 16px 16px", fontSize: 14, lineHeight: 1.5, color: C.t1,
                    background: `color-mix(in srgb, ${hueOf(n.authorName)} ${isNew ? 16 : 8}%, color-mix(in srgb, var(--a-t1) 3%, transparent))`,
                    overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", width: "fit-content",
                  }}>
                    {n.body}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        {/* Mes commandes en cours */}
        {canOrders && (
          <section className="tv-card ms-card tv-rise" style={{ animationDelay: "340ms" }}>
            <div className="ms-head">
              <span className="ms-ic" style={{ background: "color-mix(in srgb, var(--a-sage) 18%, transparent)", color: "var(--a-sage)" }}><ShoppingCart style={{ width: 17, height: 17 }} /></span>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.t1 }}>Mes commandes en cours</span>
              <button type="button" className="ms-link" onClick={() => onGo("queue")}>File d'attente <ArrowRight style={{ width: 14, height: 14 }} /></button>
            </div>
            {myOrders.length === 0 && <p style={{ margin: "14px 0 6px", fontSize: 14, color: C.t3 }}>Aucune commande à votre nom. Prenez-en une dans la file d'attente.</p>}
            {myOrders.slice(0, 5).map((o) => (
              <button key={o.id} type="button" className="ms-task" onClick={() => onOpenOrder(o)}
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "11px 10px", margin: "0 -10px", borderRadius: 14, width: "calc(100% + 20px)", boxSizing: "border-box" }}>
                <TeamAvatar name={o.clientName} size={34} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, color: C.t1 }}>{o.type === "buy" ? "Achat" : "Vente"} · {o.clientName}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>{o.ref} · {STATUS_META[o.status].label} · {ago(o.createdMinsAgo)}</span>
                </span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: C.t1 }}>{nfCad.format(o.cad)} $</span>
                  <span style={{ display: "block", fontSize: 12, color: C.t3 }}>{nfUsdt.format(o.usdt)} USDT</span>
                </span>
              </button>
            ))}
          </section>
        )}

        {/* Mon bloc-notes */}
        <PrivatePad me={me} delay={canOrders ? 400 : 340} />
      </div>
    </div>
  );
}

function PrivatePad({ me, delay }: { me: string; delay: number }) {
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
    <section className="tv-card ms-card tv-rise" style={{ animationDelay: `${delay}ms`, background: "color-mix(in srgb, var(--a-sun) 9%, var(--a-bg))" }}>
      <div className="ms-head">
        <span className="ms-ic" style={{ background: "color-mix(in srgb, var(--a-sun) 26%, transparent)", color: C.t1 }}><NotebookPen style={{ width: 17, height: 17 }} /></span>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.t1 }}>Mon bloc-notes</span>
        <span style={{ fontSize: 12, color: C.t3 }}>
          {state === "saving" ? "Enregistrement…" : state === "error" ? "Pas enregistré, réessayez" : saved ? `Enregistré à ${new Date(saved).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}` : "Privé"}
        </span>
      </div>
      <textarea className="ms-paper" value={body ?? ""} disabled={body == null} maxLength={20000} onChange={(e) => onChange(e.target.value)}
        placeholder={"Vos notes à vous : rappels, idées, numéros utiles…\nPersonne d'autre ne les voit."} />
    </section>
  );
}
