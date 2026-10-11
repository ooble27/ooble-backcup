/*
 * Libellés lisibles pour le contenu d'une sauvegarde : tables, colonnes,
 * documents du stockage. Partagés par la carte « Sauvegardes » et par
 * l'explorateur (/admin/sauvegarde).
 */

// Ordre d'affichage : les tables qu'on consulte vraiment d'abord.
export const MAIN_TABLES = [
  "auth_users", "profiles", "orders", "order_events", "kyc_verifications", "business_verifications",
  "saved_recipients", "payment_confirmations", "interac_receipts", "usdt_payouts", "chain_deposits",
  "blockchain_transactions", "compliance_alerts", "compliance_flags", "compliance_declarations",
  "account_closures", "admin_audit_log", "user_roles", "signup_origins",
] as const;

export const TABLE_LABELS: Record<string, string> = {
  auth_users: "Comptes de connexion",
  profiles: "Clients",
  orders: "Commandes",
  order_events: "Historique des commandes",
  kyc_verifications: "Vérifications d'identité",
  business_verifications: "Vérifications d'entreprise",
  saved_recipients: "Portefeuilles enregistrés",
  payment_confirmations: "Confirmations de paiement",
  interac_receipts: "Virements Interac reçus",
  usdt_payouts: "Envois USDT",
  blockchain_transactions: "Transactions blockchain",
  chain_deposits: "Dépôts USDT reçus",
  compliance_alerts: "Alertes de conformité",
  compliance_flags: "Signalements de conformité",
  compliance_declarations: "Déclarations CANAFE",
  compliance_checklist: "Programme de conformité",
  account_closures: "Comptes fermés",
  admin_audit_log: "Journal de l'équipe",
  user_roles: "Rôles de l'équipe",
  signup_origins: "Origine des inscriptions",
  signup_origin_backfill: "Origine des inscriptions (reprise)",
  marketing_optout: "Désabonnements courriels",
  push_subscriptions: "Abonnements aux notifications",
  mail_threads: "Messagerie : conversations",
  mail_messages: "Messagerie : messages",
  exchange_rates: "Historique des taux",
  treasury_addresses: "Adresses de trésorerie",
  treasury_movements: "Mouvements de trésorerie",
  treasury_balance_snapshots: "Soldes de trésorerie",
  treasury_alert_config: "Alertes de trésorerie",
  settlement_settings: "Réglages du règlement",
  announcements: "Annonces",
  maintenance_windows: "Maintenances",
  platform_state: "État de la plateforme",
  blocked_email_domains: "Domaines de courriel bloqués",
  backup_runs: "Journal des sauvegardes",
  chain_scan_state: "Lecture des blockchains",
  payout_locks: "Verrous d'envoi",
  ai_alerts: "Assistant : alertes",
  ai_calls: "Assistant : appels",
};

export const tableLabel = (name: string) => TABLE_LABELS[name] ?? name.replace(/_/g, " ");

const COLUMN_LABELS: Record<string, string> = {
  id: "ID", user_id: "Client (ID)", full_name: "Nom", email: "Courriel", phone: "Téléphone",
  kyc_status: "Identité", status: "Statut", created_at: "Créé le", updated_at: "Modifié le",
  email_confirmed_at: "Courriel confirmé le", last_sign_in_at: "Dernière connexion", banned_until: "Bloqué jusqu'au",
  account_type: "Type de compte", business_name: "Entreprise", business_number: "NEQ / numéro",
  business_address: "Adresse de l'entreprise", business_phone: "Téléphone de l'entreprise", business_status: "Statut entreprise",
  closed_at: "Fermé le", preferred_lang: "Langue", daily_limit_cad: "Limite quotidienne ($)",
  cad_amount: "Montant ($ CAD)", usdt_amount: "Montant (USDT)", network: "Réseau", wallet_address: "Adresse",
  rate: "Taux", pair: "Paire", fee: "Frais", reference: "Référence", note: "Note", reason: "Motif", amount: "Montant",
};

export const columnLabel = (name: string) => COLUMN_LABELS[name] ?? name.replace(/_/g, " ");

// Documents du stockage : kyc/<client>/id_front_<horodatage>.jpg, kyb/registry_….pdf…
const DOC_KINDS: [RegExp, string][] = [
  [/(^|\/)id_front_/, "Pièce d'identité (recto)"],
  [/(^|\/)id_back_/, "Pièce d'identité (verso)"],
  [/(^|\/)selfie_/, "Selfie"],
  [/(^|\/)incorporation_/, "Acte constitutif"],
  [/(^|\/)registry_/, "Extrait du registre des entreprises"],
  [/(^|\/)address_/, "Preuve d'adresse"],
];

export function docInfo(path: string): { kind: string; date: Date | null; owner: string | null } {
  const name = path.split("/").pop() ?? path;
  const kind = DOC_KINDS.find(([re]) => re.test(path))?.[1] ?? name;
  const ts = name.match(/_(\d{12,14})\./);
  const owner = path.match(/^storage\/[^/]+\/([0-9a-f-]{36})\//i)?.[1] ?? null;
  return { kind, date: ts ? new Date(Number(ts[1])) : null, owner };
}

// Lecture CSV (guillemets, virgules et retours à la ligne dans les valeurs).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Valeur brute (texte CSV) → affichage lisible.
export function formatValue(raw: string): string {
  if (raw === "") return "—";
  if (raw === "t" || raw === "true") return "Oui";
  if (raw === "f" || raw === "false") return "Non";
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}(:?\d{2})?|Z)?$/.test(raw)) {
    const d = new Date(raw.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
  }
  return raw;
}
