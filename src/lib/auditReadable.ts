/**
 * Journal d'audit en clair : ce qui a changé (avant → après) et les détails utiles, avec des mots
 * de tous les jours. Le JSON brut reste disponible pour un auditeur, replié sous « Détails techniques ».
 */
import { firstName, memberById } from "@/lib/teamSpace";
import { orderRef } from "@/lib/orders";
import { roleLabel } from "@/lib/roles";

const FIELD: Record<string, string> = {
  status: "Statut", assigned_to: "Pris en charge par", assigned_at: "Pris en charge le", new_status: "Nouveau statut",
  previous_status: "Statut précédent", name: "Nom", recipients: "Destinataires", rows: "Lignes exportées", tables: "Éléments effacés",
  logs: "Journaux effacés", mail: "Courriels effacés", at: "Date", what: "Réglage", note: "Note", reason: "Motif", role: "Rôle",
  roles: "Rôles", email: "Courriel", amount: "Montant", amount_cad: "Montant CAD", cad_amount: "Montant CAD", usdt_amount: "Montant en cryptomonnaie",
  network: "Réseau", asset: "Cryptomonnaie", tx_hash: "Hash de la transaction", wallet_address: "Adresse", scheduled_at: "Prévue le",
  subject: "Objet", audience: "Audience", template: "Modèle", enabled: "Activé", kycCheck: "Analyse des dossiers", trading_enabled: "Achats et ventes",
  buy_margin_pct: "Marge à l'achat", sell_margin_pct: "Marge à la vente", trade_min_cad: "Minimum par commande", trade_daily_max_cad: "Maximum sur 24 h",
  daily_limit_cad: "Limite quotidienne", review_note: "Motif pour le client", kyc_status: "Identité", classification: "Classement", notes: "Notes",
  hidden: "Masquée", is_test: "Commande de test", test_account: "Compte de test", locked_until: "Bloqué jusqu'au", suspended: "Suspendu",
  previous: "Avant", next: "Après", count: "Nombre", period: "Période", from: "Du", to: "Au", kind: "Registre", format: "Format",
  // Tables citées par la remise à zéro.
  orders: "Commandes", interac_receipts: "Virements Interac", usdt_payouts: "Envois de cryptomonnaie", chain_deposits: "Dépôts reçus",
  promo_redemptions: "Codes promo utilisés", payment_confirmations: "Confirmations de paiement", blockchain_transactions: "Transactions blockchain",
  mail_threads: "Conversations", ai_alerts: "Alertes de l'assistant", ai_calls: "Questions à l'assistant", admin_audit_log: "Entrées du journal",
  referrals: "Parrainages", team_tasks: "Tâches", order_events: "Historique des commandes", mail_messages: "Courriels",
};
const VALUE: Record<string, string> = {
  created: "Créée", awaiting_payment: "En attente du paiement", payment_received: "Paiement reçu", settling: "En règlement",
  completed: "Terminée", cancelled: "Annulée", expired: "Expirée", refunded: "Remboursée", pending: "En attente", approved: "Approuvée",
  rejected: "Refusée", not_started: "Non commencée", nouveau: "Nouvelle", en_cours: "En cours", classe: "Classée", declare: "Déclarée",
  sent: "Envoyée", scheduled: "Programmée", draft: "Brouillon", sending: "En cours d'envoi",
  trc20: "Tron", bep20: "BNB Chain", erc20: "Ethereum", polygon: "Polygon", avalanche: "Avalanche", spl: "Solana", usdc: "USDC", usdt: "USDT",
};
/** Champs techniques sans intérêt pour l'équipe. */
const SKIP = new Set(["id", "updated_at", "created_at", "user_agent", "updated_by", "updated_by_name"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const dt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 6 });

export const fieldLabel = (k: string) => FIELD[k] ?? (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ");

export function valueText(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "Aucun";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number") return nf.format(v);
  if (Array.isArray(v)) return v.length ? v.map((x) => valueText(k, x)).join(", ") : "Aucun";
  if (typeof v === "object") {
    // Petit objet (ex. éléments effacés) : « commandes 20, courriels 3 » ; le reste en compte.
    const e = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== 0 && x !== null && x !== false);
    return e.length ? e.slice(0, 8).map(([a, x]) => `${fieldLabel(a).toLowerCase()} ${valueText(a, x)}`).join(", ") + (e.length > 8 ? "…" : "") : "Aucun";
  }
  const s = String(v);
  if (UUID.test(s)) {
    const m = memberById(s);
    if (m) return firstName(m.name);
    return k.includes("order") ? orderRef(s) : `${s.slice(0, 8)}…`;
  }
  if (ISO.test(s)) { const d = new Date(s); if (!Number.isNaN(d.getTime())) return dt.format(d); }
  if (k === "role") return roleLabel(s);
  return VALUE[s] ?? s;
}

/** Ce qui a changé entre l'état d'avant et celui d'après. */
export function changes(before: unknown, after: unknown): { key: string; label: string; from: string; to: string }[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !SKIP.has(k));
  return keys
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({ key: k, label: fieldLabel(k), from: valueText(k, b[k]), to: valueText(k, a[k]) }));
}

/** Détails de l'action (métadonnées), sans le navigateur. */
export function details(meta: Record<string, unknown> | null): [string, string][] {
  return Object.entries(meta ?? {}).filter(([k]) => !SKIP.has(k)).map(([k, v]) => [fieldLabel(k), valueText(k, v)]);
}

/** L'appareil, lu dans l'identifiant du navigateur : « Safari sur Mac ». */
export function device(meta: Record<string, unknown> | null): string | null {
  const ua = typeof meta?.user_agent === "string" ? meta.user_agent : "";
  if (!ua) return null;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  return [br, os].filter(Boolean).join(" sur ") || null;
}

/** L'objet de l'action, lisible : « Commande OOB-6B83DAB2 », « Client », « Réglages »… */
export function objectText(kind: string | null, id: string | null, kindLabel: string): string {
  if (!kind) return "N/D";
  if (kind === "order" && id) return `Commande ${orderRef(id)}`;
  const m = id ? memberById(id) : undefined;
  if (m) return `${kindLabel} · ${firstName(m.name)}`;
  return kindLabel;
}
