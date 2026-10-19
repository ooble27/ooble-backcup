import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { orderRef } from "@/lib/orders";
import { roleLabel, sortRoles } from "@/lib/roles";
import {
  PRESENCE_LABEL, STATUS_LABEL, firstName, loadMemberBundle, onOpenActivity, peekMemberBundle, shiftSummary, isLate, memberById, onOpenMember,
  type Handoff, type MemberCard, type TeamTask,
} from "@/lib/teamSpace";
import { C } from "./adminTheme";
import { SidePanel } from "./ui";
import { TaskForm, TeamAvatar, TV_CSS, dueLabel, nameColor, plural, useMembers, useTeamLive, when } from "./TeamViews";
import { ProfilePanel } from "./TeamProfile";
import { useShifts } from "./TeamPlanning";
import { ActivityPanel } from "./TeamFeed";

/**
 * Fiche d'un membre de l'équipe, ouverte en touchant son avatar (L'équipe, Qui a quoi, Dans ce canal, une commande) :
 * qui il est, son statut, depuis quand il est là, ce qu'il traite en ce moment, ce qu'il a terminé sur 30 jours,
 * ses dernières passations. Pour soi : « Modifier mon profil » ; pour un collègue : « Lui confier une tâche ».
 */

const OPEN = ["created", "awaiting_payment", "payment_received", "settling"];
const ORDER_STATE: Record<string, string> = { created: "Attend le paiement", awaiting_payment: "Attend le paiement", payment_received: "Payée · à traiter", settling: "Envoi en cours" };
const money = (n: number) => `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

/** Monté une seule fois dans le back-office : ouvre la fiche demandée par openMember(id). */
export function MemberSheetHost({ onOpenOrder, onGoTasks, onGoMe }: { onOpenOrder?: (id: string) => void; onGoTasks?: () => void; onGoMe?: () => void }) {
  const [id, setId] = useState<string | null>(null);
  const [feed, setFeed] = useState(false);
  useEffect(() => onOpenMember(setId), []);
  useEffect(() => onOpenActivity(() => setFeed(true)), []);
  if (feed) {
    return <ActivityPanel onClose={() => setFeed(false)}
      onOpenOrder={onOpenOrder && ((o) => { setFeed(false); onOpenOrder(o); })}
      onGoTasks={onGoTasks && (() => { setFeed(false); onGoTasks(); })}
      onGoMe={onGoMe && (() => { setFeed(false); onGoMe(); })} />;
  }
  if (!id) return null;
  return <MemberSheet userId={id} onClose={() => setId(null)}
    onOpenOrder={onOpenOrder && ((o) => { setId(null); onOpenOrder(o); })}
    onGoTasks={onGoTasks && (() => { setId(null); onGoTasks(); })} />;
}

function MemberSheet({ userId, onClose, onOpenOrder, onGoTasks }: { userId: string; onClose: () => void; onOpenOrder?: (id: string) => void; onGoTasks?: () => void }) {
  const { user } = useAuth();
  const me = user?.id ?? "";
  const members = useMembers();
  const m = members.find((x) => x.userId === userId) ?? memberById(userId);
  // Déjà en mémoire (préchargée au survol ou au toucher de l'avatar) : la fiche s'ouvre remplie, puis se met à jour.
  const cached = peekMemberBundle(userId);
  const [card, setCard] = useState<MemberCard | null | undefined>(cached ? cached.card : undefined);
  const [tasks, setTasks] = useState<TeamTask[] | null>(cached?.tasks ?? null);
  const [handoffs, setHandoffs] = useState<Handoff[]>(cached?.handoffs ?? []);
  const [profile, setProfile] = useState(false);
  const [giving, setGiving] = useState(false);
  const { shifts } = useShifts();

  const load = useCallback(() => {
    loadMemberBundle(userId).then((b) => { setCard(b.card); setTasks(b.tasks); setHandoffs(b.handoffs); });
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  useTeamLive(load, ["team_tasks", "team_handoffs", "team_profiles"]);

  if (!m) {
    return (
      <SidePanel title="Membre de l'équipe" onClose={onClose} width={520}>
        <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Cette personne ne fait plus partie de l'équipe.</p>
      </SidePanel>
    );
  }
  const self = userId === me;
  const roles = sortRoles(m.roles).map(roleLabel).join(" · ");
  const presence = m.status === "available" ? "Disponible"
    : `${PRESENCE_LABEL[m.status]}${m.status === "away" && m.statusUntil ? ` jusqu'au ${new Date(`${m.statusUntil}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}` : ""}`;
  const openOrders = (card?.ordersOpen ?? []).filter((o) => OPEN.includes(o.status));
  const stats = [
    { n: openOrders.length, label: plural(openOrders.length, "commande en cours", "commandes en cours") },
    { n: tasks?.length ?? 0, label: plural(tasks?.length ?? 0, "tâche ouverte", "tâches ouvertes") },
    { n: card?.ordersDone ?? 0, label: plural(card?.ordersDone ?? 0, "commande terminée", "commandes terminées") + " · 30 j" },
    { n: card?.tasksDone ?? 0, label: plural(card?.tasksDone ?? 0, "tâche faite", "tâches faites") + " · 30 j" },
  ];
  const row: React.CSSProperties = { all: "unset", boxSizing: "border-box", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 0", borderBottom: `1px solid ${C.bds}` };
  const head = (t: string) => <p style={{ margin: "26px 0 4px", fontSize: 10.5, fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", color: C.t3 }}>{t}</p>;

  return (
    <SidePanel title={self ? "Ma fiche" : `Fiche de ${firstName(m.name)}`} subtitle={roles || "Membre de l'équipe"} onClose={onClose} width={540}>
      <style>{TV_CSS + `
.mb-sk { display: block; border-radius: 6px; background: var(--a-hover3); animation: mb-pulse 1.2s ease-in-out infinite; }
@keyframes mb-pulse { 50% { opacity: .5; } }
.mb-in { animation: mb-fade .25s ease-out; }
@keyframes mb-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mb-sk, .mb-in { animation: none; } }
`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <TeamAvatar id={m.userId} name={m.name} size={84} presence />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.03em", color: nameColor(m.color), overflowWrap: "anywhere" }}>{m.name}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: C.t2 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, marginRight: 7, background: m.status === "available" ? "var(--a-sage)" : m.status === "busy" ? "var(--a-sun)" : "var(--a-t3)" }} />
            {presence}{m.status !== "available" && m.statusNote ? ` · ${m.statusNote}` : ""}
          </p>
          {shifts && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.t3 }}>{shiftSummary(shifts, m.userId) ? `De garde : ${shiftSummary(shifts, m.userId)}` : "Aucune heure de garde"}</p>}
          {card?.joined && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.t3 }}>Dans l'équipe depuis le {new Date(card.joined).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}</p>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px 24px", marginTop: 24 }}>
        {stats.map((s) => (
          <div key={s.label}>
            <span style={{ display: "block", fontSize: 26, fontWeight: 600, letterSpacing: "-0.035em", color: s.n ? C.t1 : C.t3, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{card === undefined ? "–" : s.n}</span>
            <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {head("En ce moment")}
      {card === undefined && (
        <div aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} style={{ padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
              <span className="mb-sk" style={{ width: "62%", height: 14 }} />
              <span className="mb-sk" style={{ width: "38%", height: 11, marginTop: 7 }} />
            </div>
          ))}
        </div>
      )}
      {card !== undefined && openOrders.length === 0 && (tasks?.length ?? 0) === 0 && <p style={{ margin: 0, padding: "10px 0", fontSize: 14, color: C.t3 }}>Rien en cours.</p>}
      {openOrders.map((o) => (
        <button key={o.id} type="button" style={row} disabled={!onOpenOrder} onClick={() => onOpenOrder?.(o.id)}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, color: C.t1 }}>{o.side === "buy" ? "Achat" : "Vente"} · {o.client}</span>
            <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3 }}>{orderRef(o.id)} · {ORDER_STATE[o.status] ?? o.status}</span>
          </span>
          <span style={{ fontSize: 14.5, color: C.t1, fontVariantNumeric: "tabular-nums" }}>{money(o.cad)}</span>
        </button>
      ))}
      {(tasks ?? []).slice(0, 6).map((t) => (
        <button key={t.id} type="button" style={row} disabled={!onGoTasks} onClick={() => onGoTasks?.()}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, color: C.t1, overflowWrap: "anywhere" }}>{t.title}</span>
            <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: C.t3 }}>
              Tâche · {STATUS_LABEL[t.status].toLowerCase()}{t.steps.length ? ` · ${t.steps.filter((x) => x.done).length} sur ${t.steps.length} étapes` : ""}{t.dueOn ? ` · ${dueLabel(t.dueOn)}${isLate(t) ? " · en retard" : ""}` : ""}
            </span>
          </span>
        </button>
      ))}

      {handoffs.length > 0 && head("Dernières passations")}
      {handoffs.map((h) => (
        <div key={h.id} style={{ padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>{when(h.at)}{h.toName ? ` · à ${firstName(h.toName)}` : " · à toute l'équipe"}{h.orderIds.length + h.taskIds.length ? ` · ${h.orderIds.length + h.taskIds.length} ${plural(h.orderIds.length + h.taskIds.length, "élément")} remis` : ""}</p>
          {h.body && <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.55, color: C.t2, whiteSpace: "pre-line", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.body}</p>}
        </div>
      ))}

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 28 }}>
        {self
          ? <button type="button" className="tv-go" onClick={() => setProfile(true)}>Modifier mon profil <ArrowRight style={{ width: 15, height: 15 }} /></button>
          : <button type="button" className="tv-go" onClick={() => setGiving(true)}>Lui confier une tâche <ArrowRight style={{ width: 15, height: 15 }} /></button>}
      </div>

      {profile && <ProfilePanel onClose={() => setProfile(false)} />}
      {giving && <TaskForm task={null} members={members} me={me} preset={{ person: userId }} onClose={() => setGiving(false)} onSaved={() => { setGiving(false); load(); }} />}
    </SidePanel>
  );
}
