/**
 * Messagerie › Vue d'ensemble : où en est le support, d'un coup d'œil (comme Marketing › Vue d'ensemble).
 *  • Le bandeau : combien de clients attendent, depuis quand, et les conversations des 14 derniers jours.
 *  • Les chiffres sur 30 jours : délai de première réponse (médiane), conversations réglées, ouvertes, réponses.
 *  • Ceux qui attendent le plus longtemps (un clic ouvre la conversation dans la Réception).
 *  • Les sujets qui reviennent, et qui répond dans l'équipe (prénom seulement).
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Send, Smartphone, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { MailThread } from "@/lib/mailThreads";
import { C, FONT } from "./adminTheme";
import { Button } from "./ui";
import { MailboxHero } from "./heroes";
import { isAppChat } from "./SupportChat";
import { queueOf, threadTitle } from "./SupportDesk";

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
/** Le sujet sans la commande : « Une commande », « Virement Interac »… ; pour le site, « Formulaire du site » ou « Desk OTC ». */
const topicKey = (t: MailThread) => (isAppChat(t) ? threadTitle(t).split(" · ")[0] : t.mailbox === "otc" ? "Desk OTC (site)" : "Formulaire du site");

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

  const support = useMemo(() => threads.filter((t) => isAppChat(t) || t.mailbox === "support" || t.mailbox === "otc"), [threads]);
  const stats = useMemo(() => {
    const ids = new Set(support.map((t) => t.id));
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
    const recent = support.filter((t) => new Date(t.createdAt).getTime() > d30);
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
  }, [support, msgs]);

  const waiting = support.filter((t) => queueOf(t) === "todo")
    .sort((a, b) => (a.lastInboundAt ?? a.lastMessageAt).localeCompare(b.lastInboundAt ?? b.lastMessageAt))
    .slice(0, 6);
  const maxTopic = Math.max(1, ...stats.topics.map(([, v]) => v.n));
  const maxAgent = Math.max(1, ...stats.agents.map(([, n]) => n));

  const kpi = (label: string, value: string, hint: string) => (
    <div style={{ padding: "4px 0" }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>{label}</p>
      <p style={{ margin: "4px 0 2px", fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em", color: C.t1, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p style={{ margin: 0, fontSize: 12, color: C.t3 }}>{hint}</p>
    </div>
  );
  const section = (title: string, sub: string) => (
    <>
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: C.t1 }}>{title}</h3>
      <p style={{ margin: "4px 0 12px", fontSize: 13, color: C.t3 }}>{sub}</p>
    </>
  );

  return (
    <div style={{ fontFamily: FONT, marginTop: 22 }}>
      <p style={{ margin: "0 0 10px", fontSize: 14, color: C.coral }}>Messagerie · vue d'ensemble</p>
      <MailboxHero threads={support} loading={loading}
        action={<Button variant="primary" icon={<Send style={{ width: 15, height: 15 }} />} onClick={onCompose}>Nouveau message</Button>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "18px 28px", padding: "18px 0", borderTop: `1px solid ${C.bd}`, borderBottom: `1px solid ${C.bd}` }}>
        {kpi("Première réponse", msgs ? duration(stats.firstReply) : "…", "médiane, 30 jours")}
        {kpi("Conversations ouvertes", String(stats.opened), "30 jours, app et site")}
        {kpi("Réglées", String(stats.resolved), stats.opened ? `${Math.round((stats.resolved / stats.opened) * 100)} % des conversations ouvertes` : "30 jours")}
        {kpi("Réponses envoyées", msgs ? String(stats.replies) : "…", "30 jours")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: "32px 48px", marginTop: 28 }}>
        <section>
          {section("Ils attendent", "Les clients qui attendent depuis le plus longtemps.")}
          {waiting.length === 0 ? <p style={{ margin: 0, fontSize: 13.5, color: C.t3 }}>Personne n'attend : tout est répondu.</p> : waiting.map((t) => (
            <button key={t.id} type="button" className="ui-row" onClick={() => onOpen(t.id)}
              style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0", borderTop: `1px solid ${C.bd}` }}>
              {isAppChat(t) ? <Smartphone style={{ width: 14, height: 14, color: C.t3 }} aria-label="App" /> : <Globe style={{ width: 14, height: 14, color: C.t3 }} aria-label="Site" />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.clientName || t.clientEmail}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{threadTitle(t)}</span>
              </span>
              <span style={{ fontSize: 12.5, color: C.coral, fontVariantNumeric: "tabular-nums" }}>{since(t.lastInboundAt)}</span>
              <ChevronRight style={{ width: 15, height: 15, color: C.t3 }} />
            </button>
          ))}
        </section>

        <section>
          {section("Les sujets", "De quoi parlent les conversations des 30 derniers jours.")}
          {stats.topics.length === 0 ? <p style={{ margin: 0, fontSize: 13.5, color: C.t3 }}>Aucune conversation ces 30 derniers jours.</p> : stats.topics.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0, 170px) minmax(0, 1fr) 36px", alignItems: "center", gap: 12, padding: "7px 0" }}>
              <span style={{ fontSize: 13, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
              <span style={{ height: 8, background: C.hover2, borderRadius: 99, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(v.n / maxTopic) * 100}%`, background: v.app ? C.t1 : C.t3, borderRadius: 99 }} />
              </span>
              <span style={{ fontSize: 13, color: C.t1, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v.n}</span>
            </div>
          ))}
        </section>

        <section>
          {section("L'équipe", "Réponses envoyées ces 30 derniers jours.")}
          {stats.agents.length === 0 ? <p style={{ margin: 0, fontSize: 13.5, color: C.t3 }}>{msgs ? "Aucune réponse signée ces 30 derniers jours." : "…"}</p> : stats.agents.map(([name, n]) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 170px) minmax(0, 1fr) 36px", alignItems: "center", gap: 12, padding: "7px 0" }}>
              <span style={{ fontSize: 13, color: C.t2 }}>{name}</span>
              <span style={{ height: 8, background: C.hover2, borderRadius: 99, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(n / maxAgent) * 100}%`, background: C.t1, borderRadius: 99 }} />
              </span>
              <span style={{ fontSize: 13, color: C.t1, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
