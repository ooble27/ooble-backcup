/**
 * Messagerie › Vue d'ensemble, dans l'identité de l'app (variante F) : fond neutre, gros trait noir, cartes, mascotte.
 *  • En haut : combien de clients attendent, depuis quand, et les conversations des 14 derniers jours.
 *  • Les chiffres sur 30 jours : délai de première réponse (médiane), conversations ouvertes, réglées, réponses.
 *  • Ceux qui attendent le plus longtemps (un clic ouvre la conversation dans la Réception).
 *  • Les sujets qui reviennent, et qui répond dans l'équipe (prénom seulement).
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Globe, MessageSquarePlus, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { MailThread } from "@/lib/mailThreads";
import { WholeMascot } from "@/components/launch/PlayLogin";
import { isAppChat } from "./SupportChat";
import { F_CSS, initials, queueOf, threadTitle, tintOf } from "./SupportDesk";

interface Msg { thread_id: string; direction: string; created_at: string; from_name: string | null; staff_id: string | null }

const first = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";
function duration(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} j`;
}
const since = (iso: string | null) => duration(iso ? (Date.now() - new Date(iso).getTime()) / 60000 : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Le sujet sans la commande : « Une commande », « Un virement Interac »… ; pour le site, « Formulaire du site » ou « Desk OTC ». */
const topicKey = (t: MailThread) => (isAppChat(t) ? threadTitle(t).split(" · ")[0] : t.mailbox === "otc" ? "Desk OTC (site)" : "Formulaire du site");

const OV_CSS = `
.ov-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 380px); gap: 18px; align-items: stretch; }
@media (max-width: 900px) { .ov-top { grid-template-columns: minmax(0, 1fr); } }
.ov-title { margin: 0; font-size: clamp(32px, 4vw, 48px); font-weight: 600; letter-spacing: -0.045em; line-height: 1.02; }
.ov-title span { color: #8a8a86; }
.ov-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) { .ov-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ov-kpi { background: #fff; border: 3px solid #111; border-radius: 24px; padding: 16px; }
.ov-kpi b { display: block; font-size: 30px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.ov-kpi span { display: block; font-size: 12.5px; font-weight: 500; }
.ov-kpi small { display: block; font-size: 11.5px; color: #5f5f5b; margin-top: 2px; }
.ov-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 1100px) { .ov-grid { grid-template-columns: minmax(0, 1fr); } }
.ov-bar { display: grid; grid-template-columns: minmax(0, 150px) minmax(0, 1fr) 30px; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
.ov-bar i { display: block; height: 14px; border: 2px solid #111; border-radius: 99px; background: #fff; overflow: hidden; }
.ov-bar i em { display: block; height: 100%; }
.ov-days { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 4px; align-items: end; }
.ov-days span { display: flex; flex-direction: column-reverse; align-items: center; gap: 4px; }
.ov-days i { width: 12px; height: 12px; border-radius: 99px; border: 2px solid #111; }
`;

export function SupportOverview({ threads, loading, onOpen, onCompose }: {
  threads: MailThread[]; loading: boolean; onOpen: (id: string) => void; onCompose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  useEffect(() => {
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    supabase.from("mail_messages").select("thread_id, direction, created_at, from_name, staff_id")
      .gte("created_at", since30).order("created_at", { ascending: true }).range(0, 4999)
      .then(({ data }) => setMsgs((data ?? []) as Msg[]));
  }, [threads.length]);

  const stats = useMemo(() => {
    const ids = new Set(threads.map((t) => t.id));
    const byThread = new Map<string, Msg[]>();
    for (const m of msgs ?? []) if (ids.has(m.thread_id)) (byThread.get(m.thread_id) ?? byThread.set(m.thread_id, []).get(m.thread_id)!).push(m);
    // Délai de première réponse : du premier message du client à la première réponse de l'équipe qui suit.
    const firsts: number[] = [];
    for (const list of byThread.values()) {
      const inb = list.find((m) => m.direction === "inbound");
      const out = inb && list.find((m) => m.direction === "outbound" && m.created_at > inb.created_at);
      if (inb && out) firsts.push((new Date(out.created_at).getTime() - new Date(inb.created_at).getTime()) / 60000);
    }
    const replies = (msgs ?? []).filter((m) => m.direction === "outbound" && ids.has(m.thread_id));
    const byAgent = new Map<string, number>();
    for (const m of replies) { const n = first(m.from_name); if (n && n !== "Ooble") byAgent.set(n, (byAgent.get(n) ?? 0) + 1); }
    const d30 = Date.now() - 30 * 86_400_000;
    const recent = threads.filter((t) => new Date(t.createdAt).getTime() > d30);
    const topics = new Map<string, { n: number; app: boolean }>();
    for (const t of recent) { const k = topicKey(t); const cur = topics.get(k) ?? { n: 0, app: isAppChat(t) }; cur.n += 1; topics.set(k, cur); }
    return {
      firstReply: median(firsts),
      opened: recent.length,
      resolved: recent.filter((t) => queueOf(t) === "resolved").length,
      replies: replies.length,
      agents: [...byAgent.entries()].sort((a, b) => b[1] - a[1]),
      topics: [...topics.entries()].sort((a, b) => b[1].n - a[1].n),
    };
  }, [threads, msgs]);

  // Les 14 derniers jours : une pastille par conversation ouverte ce jour-là (corail : à répondre, noir : réglée).
  const days = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const out = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() - 13 + i);
      return { t: d.getTime(), label: i === 13 ? "auj." : d.toLocaleDateString("fr-CA", { weekday: "narrow" }), long: d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }), items: [] as MailThread[] };
    });
    for (const t of threads) { const c = new Date(t.createdAt); c.setHours(0, 0, 0, 0); out.find((d) => d.t === c.getTime())?.items.push(t); }
    return out;
  }, [threads]);

  const todo = threads.filter((t) => queueOf(t) === "todo");
  const waiting = [...todo].sort((a, b) => (a.lastInboundAt ?? a.lastMessageAt).localeCompare(b.lastInboundAt ?? b.lastMessageAt)).slice(0, 6);
  const oldest = waiting[0]?.lastInboundAt ?? null;
  const maxTopic = Math.max(1, ...stats.topics.map(([, v]) => v.n));
  const maxAgent = Math.max(1, ...stats.agents.map(([, n]) => n));
  const total14 = days.reduce((s, d) => s + d.items.length, 0);

  return (
    <div style={{ marginTop: 10 }}>
      <style>{F_CSS + OV_CSS}</style>
      <div className="of" style={{ display: "grid", gap: 16 }}>
        <div className="ov-top">
          <div className="of-box" style={{ padding: "22px 22px 20px" }}>
            <h4>Messagerie · vue d'ensemble</h4>
            <h2 className="ov-title">
              {loading ? "…" : todo.length ? <>{todo.length} {todo.length > 1 ? "clients" : "client"} <span>{todo.length > 1 ? "attendent" : "attend"} une réponse.</span></> : <>Tout est <span>répondu.</span></>}
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "#5f5f5b", maxWidth: 560 }}>
              {todo.length && oldest ? `Le plus ancien attend depuis ${since(oldest)}. ` : ""}Ici arrivent les discussions ouvertes dans l'app (Support) et les messages laissés sur les pages Contact et OTC du site.
            </p>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
              <button type="button" className="of-btn dk" onClick={onCompose}><MessageSquarePlus style={{ width: 16, height: 16 }} />Nouveau message</button>
              <WholeMascot size={74} />
            </div>
          </div>
          <div className="of-box">
            <h4>Conversations ouvertes · 14 jours · {total14}</h4>
            <div className="ov-days" style={{ height: 120 }}>
              {days.map((d) => (
                <span key={d.t} title={`${d.long} : ${d.items.length} conversation${d.items.length > 1 ? "s" : ""}`}>
                  {d.items.slice(0, 6).map((t, i) => (
                    <i key={i} style={{ background: queueOf(t) === "todo" ? "#ff6a3d" : queueOf(t) === "resolved" ? "#111" : "#fff" }} />
                  ))}
                  {d.items.length > 6 && <small style={{ fontSize: 10, fontWeight: 600 }}>+{d.items.length - 6}</small>}
                </span>
              ))}
            </div>
            <div className="ov-days" style={{ marginTop: 6 }}>
              {days.map((d, i) => <small key={d.t} style={{ textAlign: "center", fontSize: 10.5, fontWeight: i === 13 ? 700 : 500, color: i === 13 ? "#111" : "#77776f", textTransform: "capitalize" }}>{d.label}</small>)}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 12, fontWeight: 500 }}>
              {([["#ff6a3d", "À répondre"], ["#fff", "En attente du client"], ["#111", "Réglée"]] as [string, string][]).map(([c, l]) => (
                <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 11, height: 11, borderRadius: 99, border: "2px solid #111", background: c, display: "inline-block" }} />{l}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="ov-kpis">
          <div className="ov-kpi" style={{ background: "#111", color: "#fff" }}><span>Première réponse</span><b>{msgs ? duration(stats.firstReply) : "…"}</b><small style={{ color: "#bbb" }}>médiane, 30 jours</small></div>
          <div className="ov-kpi" style={{ background: "#dccaff" }}><span>Conversations ouvertes</span><b>{stats.opened}</b><small>30 jours, app et site</small></div>
          <div className="ov-kpi" style={{ background: "#bfe8c8" }}><span>Réglées</span><b>{stats.resolved}</b><small>{stats.opened ? `${Math.round((stats.resolved / stats.opened) * 100)} % des conversations ouvertes` : "30 jours"}</small></div>
          <div className="ov-kpi"><span>Réponses envoyées</span><b>{msgs ? stats.replies : "…"}</b><small>30 jours</small></div>
        </div>

        <div className="ov-grid">
          <div className="of-box">
            <h4>Ils attendent</h4>
            {waiting.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13.5, color: "#5f5f5b" }}><WholeMascot size={44} />Personne n'attend : tout est répondu.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {waiting.map((t) => {
                  const name = t.clientName || t.clientEmail;
                  return (
                    <button key={t.id} type="button" className="of-card" onClick={() => onOpen(t.id)} style={{ padding: "9px 11px", borderRadius: 18 }}>
                      <span className="of-av" style={{ width: 34, height: 34, fontSize: 11.5, background: tintOf(t.clientEmail) }}>{initials(name)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="of-name" style={{ display: "block", fontSize: 13.5 }}>{name}</span>
                        <span className="of-sub">{isAppChat(t) ? <Smartphone style={{ width: 12, height: 12 }} /> : <Globe style={{ width: 12, height: 12 }} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{threadTitle(t)}</span></span>
                      </span>
                      <span className="of-wait">{since(t.lastInboundAt)}</span>
                      <ChevronRight style={{ width: 15, height: 15, flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="of-box">
            <h4>Les sujets · 30 jours</h4>
            {stats.topics.length === 0 ? <p style={{ margin: 0, fontSize: 13.5, color: "#5f5f5b" }}>Aucune conversation ces 30 derniers jours.</p> : stats.topics.map(([k, v]) => (
              <div key={k} className="ov-bar">
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{k}</span>
                <i><em style={{ width: `${(v.n / maxTopic) * 100}%`, background: v.app ? "#dccaff" : "#bfe0ff", borderRight: "2px solid #111" }} /></i>
                <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v.n}</b>
              </div>
            ))}
            {stats.topics.length > 0 && (
              <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11.5, fontWeight: 500 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 11, height: 11, borderRadius: 99, border: "2px solid #111", background: "#dccaff", display: "inline-block" }} />App</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 11, height: 11, borderRadius: 99, border: "2px solid #111", background: "#bfe0ff", display: "inline-block" }} />Site</span>
              </div>
            )}
          </div>

          <div className="of-box">
            <h4>L'équipe · réponses, 30 jours</h4>
            {stats.agents.length === 0 ? <p style={{ margin: 0, fontSize: 13.5, color: "#5f5f5b" }}>{msgs ? "Aucune réponse signée ces 30 derniers jours." : "…"}</p> : stats.agents.map(([name, n]) => (
              <div key={name} className="ov-bar">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                  <span className="of-av" style={{ width: 26, height: 26, fontSize: 10.5, background: tintOf(name) }}>{name[0]}</span>{name}
                </span>
                <i><em style={{ width: `${(n / maxAgent) * 100}%`, background: "#111" }} /></i>
                <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
