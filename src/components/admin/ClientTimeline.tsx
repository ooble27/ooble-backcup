/**
 * Timeline unifiée dans la fiche client.
 *
 * Fusionne dans un seul fil chronologique inverse (plus récent en haut) :
 *   - l'inscription (à partir de `profile.createdAt`)
 *   - le statut KYC actuel
 *   - chaque commande (création + statut de fin)
 *   - chaque note interne staff (issue du localStorage `ClientNotes`)
 *
 * Filtres par type en haut (Tout / Commandes / KYC / Notes) — utile quand
 * un dossier commence à s'étoffer.
 *
 * Volontairement sans dépendance sur une nouvelle table : toutes les données
 * viennent d'endroits déjà branchés. La version V2 ajoutera les événements
 * de conformité (déclarations, alertes) et les communications envoyées.
 */
import { useMemo, useState } from "react";
import {
  Coins, HandCoins, UserPlus, ShieldCheck, ShieldAlert, StickyNote,
  Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { orderRef } from "@/lib/orders";
import { KYC_LABEL, type ClientOrder, type ClientProfile } from "@/lib/adminClient";
import { C, FONT, pillSmall } from "./adminTheme";

// ────────────────────────────────────────────────────────────
// Modèle interne d'un événement de timeline
// ────────────────────────────────────────────────────────────

type EventKind = "signup" | "kyc" | "order" | "note";

interface TimelineEvent {
  id: string;
  kind: EventKind;
  at: string;            // ISO timestamp
  title: React.ReactNode;
  meta?: React.ReactNode;
  detail?: React.ReactNode;
  icon: typeof UserPlus;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const dateTimeFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "long", year: "numeric",
});
const nfCad  = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

const KIND_LABEL: Record<"all" | EventKind, string> = {
  all:    "Tout",
  order:  "Commandes",
  kyc:    "KYC",
  note:   "Notes",
  signup: "Inscription",
};

/** Groupe les événements par jour (clé = ISO date). Préserve l'ordre reçu. */
function groupByDay(events: TimelineEvent[]): { day: string; items: TimelineEvent[] }[] {
  const groups: { day: string; items: TimelineEvent[] }[] = [];
  for (const e of events) {
    const key = e.at.slice(0, 10);
    const bucket = groups[groups.length - 1];
    if (bucket && bucket.day === key) bucket.items.push(e);
    else groups.push({ day: key, items: [e] });
  }
  return groups;
}

// ────────────────────────────────────────────────────────────
// Construction des événements
// ────────────────────────────────────────────────────────────

function buildEvents(profile: ClientProfile, orders: ClientOrder[], userId: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Inscription — événement pivot
  events.push({
    id: `signup-${userId}`,
    kind: "signup",
    at: profile.createdAt,
    icon: UserPlus,
    title: <>Inscription sur Ooble</>,
    meta: <>{profile.accountType === "business" ? "Compte entreprise" : "Compte individuel"}</>,
  });

  // KYC — statut actuel présenté comme événement (V1 : pas d'historique
  // détaillé disponible ; V2 branchera la vraie table d'événements KYC)
  const kycVerified = profile.kycStatus === "approved";
  const kycRefused  = profile.kycStatus === "rejected";
  const kycAttente  = profile.kycStatus === "pending";
  // KYC : le champ `updated_at` n'est pas encore exposé au niveau profil,
  // on ancre l'événement à la date d'inscription (V1). V2 branchera un
  // vrai historique KYC avec les transitions et leur horodatage.
  events.push({
    id: `kyc-${userId}`,
    kind: "kyc",
    at: profile.createdAt,
    icon: kycVerified ? ShieldCheck : (kycRefused ? ShieldAlert : Clock),
    title: <>KYC : {KYC_LABEL[profile.kycStatus]}</>,
    meta: kycAttente ? "En attente de vérification" : undefined,
  });

  // Commandes — un événement par commande, ancré à sa création. Statuts
  // finaux (terminée / annulée / expirée) : signalés en méta plutôt qu'en
  // deuxième événement, tant qu'on n'a pas l'horodatage du changement.
  for (const o of orders) {
    const buy = o.side === "buy";
    const Icon =
      o.status === "completed" ? CheckCircle2 :
      (o.status === "cancelled" || o.status === "expired") ? XCircle :
      (buy ? Coins : HandCoins);
    const statusLabel =
      o.status === "completed" ? "Terminée" :
      o.status === "cancelled" ? "Annulée" :
      o.status === "expired"   ? "Expirée" :
      o.status === "settling"  ? "En traitement" :
      o.status === "payment_received" ? "Paiement reçu" :
      o.status === "awaiting_payment" ? "En attente de paiement" :
      "Créée";
    events.push({
      id: `order-${o.id}`,
      kind: "order",
      at: o.createdAt,
      icon: Icon,
      title: (
        <>{buy ? "Achat" : "Vente"} · {nfUsdt.format(o.usdtAmount)} USDT</>
      ),
      meta: (
        <>{orderRef(o.id)} · {nfCad.format(o.cadAmount)} CAD · {statusLabel}</>
      ),
    });
  }

  // Notes internes (localStorage — même clé que ClientNotes)
  try {
    const raw = localStorage.getItem(`ooble.admin.notes.${userId}`);
    if (raw) {
      const arr = JSON.parse(raw) as Array<{ id: string; body: string; author: string; createdAt: string }>;
      for (const n of arr) {
        events.push({
          id: `note-${n.id}`,
          kind: "note",
          at: n.createdAt,
          icon: StickyNote,
          title: <>Note interne</>,
          meta: <>{n.author}</>,
          detail: n.body,
        });
      }
    }
  } catch { /* incognito / JSON invalide : on ignore silencieusement */ }

  // Tri décroissant (plus récent en haut).
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}

// ────────────────────────────────────────────────────────────
// Composant
// ────────────────────────────────────────────────────────────

interface Props {
  profile: ClientProfile;
  orders: ClientOrder[];
  userId: string;
}

const ClientTimeline = ({ profile, orders, userId }: Props) => {
  const [filter, setFilter] = useState<"all" | EventKind>("all");

  const events = useMemo(() => buildEvents(profile, orders, userId), [profile, orders, userId]);
  const filtered = filter === "all" ? events : events.filter((e) => e.kind === filter);
  const groups = groupByDay(filtered);

  const availableFilters: Array<"all" | EventKind> = ["all", "order", "kyc", "note", "signup"];

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{
        padding: "0 0 10px", borderBottom: `1px solid ${C.bds}`,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {availableFilters.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={pillSmall(filter === k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 12.5, color: C.t3, margin: 0 }}>
            Aucun événement pour ce filtre.
          </p>
        </div>
      ) : (
        <div style={{ padding: "14px 0 0" }}>
          {groups.map((g) => (
            <div key={g.day} style={{ marginBottom: 12 }}>
              <p style={{
                margin: "6px 0 10px", fontSize: 10.5, color: C.t3,
                textTransform: "uppercase", letterSpacing: "0.14em",
              }}>
                {dateFmt.format(new Date(g.day))}
              </p>
              <div style={{ position: "relative", paddingLeft: 22 }}>
                {/* Ligne verticale de la timeline. */}
                <div style={{
                  position: "absolute", left: 10, top: 4, bottom: 4,
                  width: 1, background: C.bds,
                }} />
                {g.items.map((e) => {
                  const Icon = e.icon;
                  return (
                    <div key={e.id} style={{
                      position: "relative", padding: "8px 0 8px 16px",
                    }}>
                      {/* Point + icône. */}
                      <div style={{
                        position: "absolute", left: -12, top: 8,
                        width: 22, height: 22, borderRadius: "50%",
                        background: C.l1, border: `1px solid ${C.bds}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: C.t2,
                      }}>
                        <Icon style={{ width: 11, height: 11 }} strokeWidth={1.8} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, color: C.t1, lineHeight: 1.4 }}>
                          {e.title}
                        </p>
                        <p style={{
                          margin: "2px 0 0", fontSize: 11.5, color: C.t3,
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {dateTimeFmt.format(new Date(e.at))}
                          {e.meta && <> · {e.meta}</>}
                        </p>
                        {e.detail && (
                          <p style={{
                            margin: "6px 0 0", fontSize: 12.5, color: C.t2,
                            lineHeight: 1.5, whiteSpace: "pre-wrap",
                            padding: "8px 10px", borderRadius: 8,
                            background: "var(--a-hover2)",
                            border: `1px solid ${C.bds}`,
                          }}>
                            {e.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientTimeline;
