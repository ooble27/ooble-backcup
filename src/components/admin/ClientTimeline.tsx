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
import { useMemo } from "react";
import {
  Coins, HandCoins, UserPlus, ShieldCheck, ShieldAlert,
  Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { orderRef } from "@/lib/orders";
import { KYC_LABEL, type ClientOrder, type ClientProfile } from "@/lib/adminClient";
import { C, FONT } from "./adminTheme";

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
  /** Montant affiché à droite (commandes). */
  amount?: React.ReactNode;
  /** État, en pastille de la couleur de l'événement. */
  status?: string;
  tone?: "ok" | "warn" | "err" | "off";
  icon: typeof UserPlus;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const nfCad  = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });


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
    title: <>Vérification d'identité</>,
    status: KYC_LABEL[profile.kycStatus],
    tone: kycVerified ? "ok" : kycRefused ? "err" : kycAttente ? "warn" : "off",
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
        <>{buy ? "Achat" : "Vente"} de {nfUsdt.format(o.usdtAmount)} USDT</>
      ),
      amount: <>{nfCad.format(o.cadAmount)} $</>,
      meta: <>{orderRef(o.id)}</>,
      status: statusLabel,
      tone: o.status === "completed" ? "ok" : (o.status === "cancelled" || o.status === "expired") ? "off" : o.status === "refunded" ? "err" : undefined,
    });
  }

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

const monthFmt = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" });
const monShort = new Intl.DateTimeFormat("fr-CA", { month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });

/** Couleur de la pastille d'un événement : on lit le type d'un coup d'œil, sans trait ni légende. */
function toneOf(e: TimelineEvent): { bg: string; fg: string } {
  if (e.kind === "signup") return { bg: "color-mix(in srgb, var(--a-sun) 22%, transparent)", fg: C.t1 };
  if (e.kind === "note") return { bg: C.hover3, fg: C.t2 };
  if (e.tone === "ok") return { bg: C.successBg, fg: C.successText };
  if (e.tone === "warn") return { bg: C.warnBg, fg: C.warnText };
  if (e.tone === "err") return { bg: C.dangerBg, fg: C.dangerText };
  if (e.tone === "off") return { bg: C.hover3, fg: C.t3 };
  return { bg: "color-mix(in srgb, var(--a-coral) 14%, transparent)", fg: C.coral };
}


const ClientTimeline = ({ profile, orders, userId }: Props) => {

  const events = useMemo(() => buildEvents(profile, orders, userId), [profile, orders, userId]);
  // Les grandes étapes seulement : la dernière commande, l'inscription et l'identité
  // (les notes ont leur propre bloc, partagé par l'équipe).
  // Toutes les commandes sont dans « Historique complet », au-dessus.
  const lastOrder = events.find((e) => e.kind === "order");
  const filtered = events.filter((e) => e.kind !== "order" || e === lastOrder);
  const visible = filtered;


  // Rythme des 12 derniers mois : une barre par mois, hauteur = nombre de commandes.
  const rhythm = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, d, n: 0, cad: 0 };
    });
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const o of orders) {
      const d = new Date(o.createdAt);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i !== undefined) { months[i].n++; months[i].cad += o.cadAmount; }
    }
    return months;
  }, [orders]);
  const maxN = Math.max(1, ...rhythm.map((m) => m.n));

  // Regroupement par mois, puis par jour dans le mois.
  const byMonth: { key: string; label: string; days: { day: string; items: TimelineEvent[] }[] }[] = [];
  for (const g of groupByDay(visible)) {
    const d = new Date(g.items[0].at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = byMonth[byMonth.length - 1];
    if (last && last.key === key) last.days.push(g);
    else byMonth.push({ key, label: monthFmt.format(d), days: [g] });
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{`
        .tl-bar { transition: height .5s cubic-bezier(.22,1,.36,1); }
        @media (max-width: 560px) { .tl-amount { display: none } }
      `}</style>

      {/* Rythme de l'année : remplit l'espace avec une information utile. */}
      <div style={{ padding: "16px 18px 12px", borderRadius: 16, background: C.hover2, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <span style={{ flex: 1, fontSize: 12.5, color: C.t2 }}>Activité des 12 derniers mois</span>
          <span style={{ fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums" }}>
            {rhythm.reduce((a, m) => a + m.n, 0)} commande{rhythm.reduce((a, m) => a + m.n, 0) > 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 6, alignItems: "end", height: 64 }}>
          {rhythm.map((m, i) => (
            <div key={m.key} title={`${monthFmt.format(m.d)} : ${m.n} commande${m.n > 1 ? "s" : ""}${m.n ? ` · ${nfCad.format(m.cad)} $` : ""}`}
              style={{ height: "100%", display: "flex", alignItems: "flex-end" }}>
              <div className="tl-bar" style={{
                width: "100%", height: m.n ? `${Math.max(14, (m.n / maxN) * 100)}%` : 4, borderRadius: 6,
                background: m.n ? (i === 11 ? C.coral : C.t1) : C.hover4, opacity: m.n ? (i === 11 ? 1 : 0.82) : 1,
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 6, marginTop: 6 }}>
          {rhythm.map((m) => (
            <span key={m.key} style={{ fontSize: 10.5, color: C.t3, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
              {monShort.format(m.d).replace(".", "").slice(0, 3)}
            </span>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: C.t3, margin: 0, padding: "32px 0", textAlign: "center" }}>Aucun événement pour ce client.</p>
      ) : (
        <div>
          {byMonth.map((m) => (
            <section key={m.key}>
              <p style={{ margin: "22px 0 10px", fontSize: 11, color: C.t3, textTransform: "uppercase", letterSpacing: "0.12em" }}>{m.label}</p>
              <div style={{ display: "grid", gap: 14 }}>
                {m.days.map((g) => {
                  const d = new Date(g.items[0].at);
                  return (
                    <div key={g.day} style={{ display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
                      {/* La date, grande et lisible, à gauche du jour. */}
                      <div style={{ textAlign: "center", paddingTop: 6 }}>
                        <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em", color: C.t1, fontVariantNumeric: "tabular-nums" }}>{d.getDate()}</div>
                        <div style={{ marginTop: 3, fontSize: 11, color: C.t3 }}>{monShort.format(d).replace(".", "")}</div>
                      </div>
                      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                        {g.items.map((e) => {
                          const Icon = e.icon;
                          const t = toneOf(e);
                          return (
                            <div key={e.id} className="tl-item ui-lift-y" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 14, background: C.hover2, minWidth: 0 }}>
                              <span style={{ width: 34, height: 34, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: t.bg, color: t.fg }}>
                                <Icon style={{ width: 15, height: 15 }} strokeWidth={1.9} />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                                  <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, color: C.t1, lineHeight: 1.4 }}>{e.title}</p>
                                  {e.amount && <span className="tl-amount" style={{ fontSize: 14, color: C.t1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.amount}</span>}
                                </div>
                                <p style={{ margin: "3px 0 0", fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums", lineHeight: 1.5 }}>
                                  {timeFmt.format(new Date(e.at))}
                                  {e.meta && <> · {e.meta}</>}
                                </p>
                                {e.status && (
                                  <span style={{ display: "inline-block", marginTop: 8, padding: "3px 9px", borderRadius: 99, fontSize: 11.5, background: t.bg, color: t.fg }}>{e.status}</span>
                                )}
                                {e.detail && (
                                  <p style={{ margin: "8px 0 0", fontSize: 13, color: C.t2, lineHeight: 1.55, whiteSpace: "pre-wrap", padding: "10px 12px", borderRadius: 10, background: C.bg }}>
                                    {e.detail}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientTimeline;
