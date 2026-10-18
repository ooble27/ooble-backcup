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
import { GR_CSS } from "./GrowthPanel";
import { TeamAvatar, TV_CSS, useTeamLive } from "./TeamViews";

/**
 * Mon espace : la page d'accueil de chaque membre. Ses tâches, les notes de l'équipe qu'il n'a pas
 * lues, les commandes qu'il a prises en charge, et son bloc-notes privé (personne d'autre ne le voit).
 */

const CSS = `
.ms-h { margin: 0 0 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-t3); }
.ms-pad { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--a-bd); background: transparent; padding: 10px 0; font: inherit; font-size: 15px; line-height: 1.65; color: var(--a-t1); outline: none; resize: vertical; min-height: 220px; }
.ms-pad:focus { border-bottom-color: var(--a-t1); }
.ms-pad::placeholder { color: var(--a-t3); }
.ms-grid { display: grid; gap: 44px 56px; grid-template-columns: minmax(0, 1fr); margin-top: 34px; }
@media (min-width: 1100px) { .ms-grid { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); } }
`;

const hello = () => { const h = Number(new Date().toLocaleString("en-CA", { hour: "numeric", hour12: false, timeZone: "America/Toronto" })); return h < 5 || h >= 18 ? "Bonsoir" : "Bonjour"; };
const shortDue = (d: string) => (d === todayToronto() ? "aujourd'hui" : new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }));
const ago = (mins: number) => (mins < 60 ? `il y a ${Math.max(1, Math.round(mins))} min` : mins < 60 * 24 ? `il y a ${Math.round(mins / 60)} h` : `il y a ${Math.round(mins / 1440)} j`);

const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

/** Ma semaine : les sept prochains jours, une colonne par jour, un rond par échéance (le retard à gauche). */
function WeekStrip({ tasks }: { tasks: TeamTask[] }) {
  const today = todayToronto();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + i); return d.toLocaleDateString("en-CA"); });
  const late = tasks.filter(isLate);
  const cols = [
    ...(late.length ? [{ key: "late", top: "Retard", sub: "", items: late, strong: true }] : []),
    ...days.map((d, i) => {
      const dt = new Date(`${d}T12:00:00`);
      return { key: d, top: i === 0 ? "Auj." : dt.toLocaleDateString("fr-CA", { weekday: "short" }).replace(".", ""), sub: String(dt.getDate()), items: tasks.filter((t) => t.dueOn === d), strong: i === 0 };
    }),
  ];
  const max = Math.max(3, ...cols.map((c) => c.items.length));
  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.t3 }}>Mes échéances, 7 prochains jours</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`, gap: 6 }}>
        {cols.map((c) => (
          <div key={c.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ height: max * 16, display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 4 }}>
              {c.items.map((t) => (
                <span key={t.id} title={t.title} style={{ width: 12, height: 12, borderRadius: 99, background: c.key === "late" ? C.coral : t.status === "doing" ? C.sun : C.t1 }} />
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: c.strong ? C.t1 : C.t3, fontWeight: c.strong ? 600 : 400, textTransform: "capitalize" }}>{c.top}</span>
            <span style={{ fontSize: 15, color: c.strong ? C.t1 : C.t2, fontVariantNumeric: "tabular-nums", height: 18, textDecoration: c.key === today ? "underline" : undefined, textUnderlineOffset: 4 }}>{c.sub}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: C.t3 }}>
        {tasks.filter((t) => !t.dueOn).length ? `${tasks.filter((t) => !t.dueOn).length} sans échéance · ` : ""}un rond par tâche{late.length ? ", à gauche ce qui est en retard" : ""}
      </p>
    </div>
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

  const load = useCallback(() => {
    loadTasks(false).then(setTasks).catch((e: Error) => setErr(e.message));
    loadNotes(false).then(setNotes).catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_notes", "team_note_replies"]);

  const mine = (tasks ?? []).filter((t) => isMine(t, me, roles) && t.status !== "done")
    .sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || b.at.localeCompare(a.at));
  const late = mine.filter(isLate).length;
  const unread = (notes ?? []).filter((n) => n.authorId !== me && !n.readBy.some((r) => r.userId === me));
  const pinned = (notes ?? []).filter((n) => n.pinned && !unread.includes(n)).slice(0, 2);
  const myOrders = canOrders ? orders.filter((o) => o.assignedTo === me && (o.status === "recu" || o.status === "cours")) : [];

  const first = (user?.name ?? "").split(/\s+/)[0];
  const today = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Toronto" }).replace(/^./, (c) => c.toUpperCase());

  const go = (label: string, tab: "tasks" | "notes" | "queue") => (
    <button type="button" className="tv-go" style={{ fontSize: 14 }} onClick={() => onGo(tab)}>{label} <ArrowRight style={{ width: 15, height: 15 }} /></button>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{CSS + TV_CSS + GR_CSS}</style>
      <section className="hz">
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13.5, color: C.t3 }}>{today}</p>
          <h2 className="hz-title">
            {hello()}{first ? <> <span style={{ color: C.sage }}>{first}</span></> : ""}.{" "}
            {!tasks || !notes ? <span className="mute">…</span>
              : mine.length ? <><span className="mute">Vous avez</span> <span style={{ color: C.coral }}>{mine.length}</span> <span className="mute">{plural(mine.length, "tâche")}{late ? `, dont ${late} en retard` : ""}.</span></>
                : <span className="mute">Rien ne vous attend.</span>}
          </h2>
          <p className="hz-sub">
            {[unread.length ? `${unread.length} ${plural(unread.length, "note")} de l'équipe à lire` : "Toutes les notes lues",
              canOrders ? (myOrders.length ? `${myOrders.length} ${plural(myOrders.length, "commande")} en cours à votre nom` : "aucune commande à votre nom") : null]
              .filter(Boolean).join(" · ")}
            <span style={{ color: C.t3 }}> · {sortRoles(roles).map(roleLabel).join(" · ")}</span>
          </p>
        </div>
        <WeekStrip tasks={mine} />
      </section>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}

      <div className="ms-grid">
        <div style={{ display: "grid", gap: 40, alignContent: "start" }}>
          {/* Mes tâches */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><p className="ms-h" style={{ flex: 1 }}>Mes tâches</p>{go(mine.length > 6 ? `Les ${mine.length} tâches` : "Toutes les tâches", "tasks")}</div>
            {tasks && mine.length === 0 && <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t3 }}>Aucune tâche pour vous.</p>}
            {mine.slice(0, 6).map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${C.bds}` }}>
                <button type="button" className="tv-check" aria-label="Marquer fait" title="Marquer fait"
                  onClick={async () => { const r = await setTaskStatus(t.id, "done"); if (r.error) setErr(r.error); else { load(); onChanged?.(); } }}>
                  <Check style={{ width: 13, height: 13 }} strokeWidth={3} />
                </button>
                <button type="button" className="tv-row" onClick={() => onGo("tasks")} style={{ display: "block", padding: 0, borderBottom: "none", flex: 1, minWidth: 0 }}>
                  <span className="tv-title" style={{ display: "block", fontSize: 15, color: C.t1 }}>{t.title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: isLate(t) ? C.t1 : C.t3, marginTop: 2, fontWeight: isLate(t) ? 600 : 400 }}>
                    {t.dueOn ? (isLate(t) ? `En retard · ${shortDue(t.dueOn)}` : `Pour ${shortDue(t.dueOn)}`) : "Sans échéance"}
                    <span style={{ fontWeight: 400, color: C.t3 }}>{t.assigneeRole ? ` · poste ${roleLabel(t.assigneeRole)}` : !t.assigneeId ? " · toute l'équipe" : ""}{t.status === "doing" ? " · en cours" : ""}{t.createdBy !== me ? ` · de ${t.createdByName}` : ""}</span>
                  </span>
                </button>
              </div>
            ))}
          </section>

          {/* Mes commandes prises en charge */}
          {canOrders && (
            <section>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><p className="ms-h" style={{ flex: 1 }}>Mes commandes en cours</p>{go("File d'attente", "queue")}</div>
              {myOrders.length === 0 && <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t3 }}>Aucune commande prise en charge.</p>}
              {myOrders.slice(0, 6).map((o) => (
                <button key={o.id} type="button" className="tv-row" onClick={() => onOpenOrder(o)} style={{ padding: "12px 0" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="tv-title" style={{ display: "block", fontSize: 15, color: C.t1 }}>{o.type === "buy" ? "Achat" : "Vente"} · {o.clientName}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>{o.ref} · {STATUS_META[o.status].label} · {ago(o.createdMinsAgo)}</span>
                  </span>
                  <span style={{ fontSize: 14, color: C.t1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{nfCad.format(o.cad)} $ · {nfUsdt.format(o.usdt)} USDT</span>
                </button>
              ))}
            </section>
          )}

          {/* Notes de l'équipe */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><p className="ms-h" style={{ flex: 1 }}>Notes de l'équipe</p>{go(unread.length ? "Lire les notes" : "Toutes les notes", "notes")}</div>
            {notes && unread.length === 0 && pinned.length === 0 && <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t3 }}>Vous avez tout lu.</p>}
            {[...pinned, ...unread.slice(0, 4)].map((n) => (
              <button key={n.id} type="button" className="tv-row" onClick={() => onGo("notes")} style={{ alignItems: "flex-start", padding: "14px 0" }}>
                <TeamAvatar name={n.authorName} size={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.t3 }}>
                    <span style={{ color: C.t1, fontWeight: 600, fontSize: 13.5 }}>{n.authorName}</span> à {n.audience === "all" ? "toute l'équipe" : audienceLabel(n.audience)}
                    {n.pinned && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.sun, fontWeight: 600 }}><Pin style={{ width: 12, height: 12 }} />épinglée</span>}
                    {unread.includes(n) && <span style={{ color: C.coral, fontWeight: 600 }}>nouvelle</span>}
                  </span>
                  <span className="tv-title" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 4, fontSize: 14.5, lineHeight: 1.5, color: C.t2 }}>{n.body}</span>
                </span>
              </button>
            ))}
          </section>
        </div>

        {/* Bloc-notes privé */}
        <PrivatePad me={me} />
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
    <section style={{ alignSelf: "start" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <p className="ms-h" style={{ flex: 1 }}>Mon bloc-notes</p>
        <span style={{ fontSize: 12.5, color: C.t3 }}>
          {state === "saving" ? "Enregistrement…" : state === "error" ? "Pas enregistré, réessayez" : saved ? `Enregistré à ${new Date(saved).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}` : "Privé · enregistré tout seul"}
        </span>
      </div>
      <textarea className="ms-pad" value={body ?? ""} disabled={body == null} maxLength={20000} onChange={(e) => onChange(e.target.value)}
        placeholder={"Vos notes à vous : rappels, idées, numéros utiles…\nPersonne d'autre ne les voit."} />
    </section>
  );
}
