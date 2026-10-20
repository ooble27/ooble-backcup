import type { AdminOrder } from "./adminOrders";
import { NETWORKS } from "@/components/app/networks";

// ────────────────────────────────────────────────────────────
// Seuils et délais réglementaires — CANAFE / LRPCFAT / RRPCFAT
// (vérifiés sur fintrac-canafe.canada.ca le 2026-10-08)
// ────────────────────────────────────────────────────────────

/** DOIMV : réception de monnaie virtuelle ≥ 10 000 $ (une opération ou 24 h). */
export const DOIMV_THRESHOLD = 10_000;
/** Règle de voyage : renseignements expéditeur / bénéficiaire dès 1 000 $. */
export const TRAVEL_RULE_THRESHOLD = 1_000;
/** DOIMV : dans les 5 jours ouvrables suivant la réception. */
export const DOIMV_DEADLINE_BUSINESS_DAYS = 5;
/** DOT : dès que possible après avoir établi des motifs raisonnables. */
export const DOT_DEADLINE_LABEL = "dès que possible";
/** DBT : immédiatement. */
export const DBT_DEADLINE_LABEL = "immédiatement";
export const RECORD_RETENTION_YEARS = 5;

/** Date ISO (AAAA-MM-JJ) + n jours ouvrables (lundi à vendredi). */
export function addBusinessDays(isoDate: string, n: number): string {
  const d = new Date(isoDate.slice(0, 10) + "T12:00:00");
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Délai légal d'une déclaration, en toutes lettres. */
export function declarationDeadlineText(type: "doimv" | "dot" | "dbt"): string {
  if (type === "doimv") return `${DOIMV_DEADLINE_BUSINESS_DAYS} jours ouvrables après la réception`;
  if (type === "dot") return DOT_DEADLINE_LABEL;
  return DBT_DEADLINE_LABEL;
}

// ────────────────────────────────────────────────────────────
// Alertes de conformité
// ────────────────────────────────────────────────────────────

export type AlertType = "doimv" | "doimv_24h" | "dot" | "voyage" | "ppv" | "sanctions";
export type AlertStatus = "nouveau" | "en_cours" | "declare" | "classe";

export const ALERT_TYPE_META: Record<AlertType, { label: string; critical: boolean; full: string }> = {
  doimv:     { label: "DOIMV",         critical: false, full: "Réception de monnaie virtuelle ≥ 10 000 $" },
  doimv_24h: { label: "DOIMV (24 h)",  critical: false, full: "Réceptions totalisant ≥ 10 000 $ en 24 h" },
  dot:       { label: "Soupçon",       critical: true,  full: "Opération possiblement douteuse (DOT à évaluer)" },
  voyage:    { label: "Règle voyage",  critical: false, full: "Renseignements de transfert ≥ 1 000 $" },
  ppv:       { label: "PPV / DOI",     critical: false, full: "Personne politiquement vulnérable ou dirigeant d'OI" },
  sanctions: { label: "Sanctions",     critical: true,  full: "Correspondance possible avec une liste de sanctions" },
};

/**
 * Que faire devant chaque type d'alerte, en clair : la marche à suivre affichée dans l'alerte.
 * Fondée sur les lignes directrices du CANAFE (DOIMV, DOT, DBT, règle du voyage, PPV).
 */
export const ALERT_GUIDE: Record<AlertType, { why: string; steps: string[] }> = {
  doimv: {
    why: "Ooble a reçu 10 000 $ ou plus en monnaie virtuelle en une opération : la loi oblige à le déclarer au CANAFE, même si rien n'est suspect.",
    steps: [
      "Vérifiez que l'opération est bien une réception d'USDT de 10 000 $ CA ou plus.",
      "Vérifiez que le dossier du client est complet : nom, date de naissance, adresse, profession, pièce d'identité, et si le client agit pour quelqu'un d'autre.",
      "Préparez la DOIMV avec « Déclarer » : Ooble remplit ce qu'il connaît.",
      "Soumettez-la sur le portail du CANAFE avant l'échéance (5 jours ouvrables après la réception), puis saisissez le numéro de confirmation dans la déclaration.",
    ],
  },
  doimv_24h: {
    why: "Plusieurs réceptions d'USDT du même client totalisent 10 000 $ ou plus en 24 heures : la règle des 24 heures les traite comme une seule opération à déclarer.",
    steps: [
      "Vérifiez que les commandes en cause appartiennent bien au même client (ou au même bénéficiaire).",
      "Vérifiez que le dossier du client est complet : nom, date de naissance, adresse, profession, pièce d'identité.",
      "Préparez une seule DOIMV regroupant les commandes, avec « Déclarer ».",
      "Soumettez-la sur le portail du CANAFE dans les 5 jours ouvrables, puis saisissez le numéro de confirmation.",
    ],
  },
  dot: {
    why: "Quelque chose sort de l'ordinaire. Ce n'est pas une accusation : il faut regarder et décider s'il existe des motifs raisonnables de soupçonner un lien avec du blanchiment ou du financement du terrorisme.",
    steps: [
      "Regardez le client et ses commandes : son profil, d'où vient l'argent, à quoi sert l'opération, ce qui a changé.",
      "Ne prévenez jamais le client qu'une déclaration est envisagée : c'est interdit par la loi.",
      "Si vous avez des motifs raisonnables de soupçonner : déclarez (DOT) dès que possible, même si l'opération n'a pas abouti.",
      "Sinon : classez sans suite en écrivant pourquoi. Ce motif est gardé 5 ans et sera lu lors d'un examen.",
    ],
  },
  sanctions: {
    why: "Le nom du client ou une adresse de portefeuille ressemble à une inscription sur une liste de sanctions. Souvent c'est un homonyme, mais il faut le vérifier tout de suite.",
    steps: [
      "Comparez avec la pièce d'identité du client : date de naissance, pays, deuxième prénom.",
      "En attendant, n'envoyez rien et ne traitez aucune commande de ce client. Ne lui dites rien.",
      "Si c'est la même personne (ou son portefeuille) : bloquez ses biens, déclarez (DBT) immédiatement au CANAFE, et prévenez la GRC et le SCRS.",
      "Si c'est un homonyme : classez sans suite en notant ce qui les distingue (date de naissance, pays).",
    ],
  },
  voyage: {
    why: "Pour tout transfert de monnaie virtuelle de 1 000 $ ou plus, Ooble doit recueillir et garder le nom, l'adresse et le numéro de compte ou de portefeuille de l'émetteur et du bénéficiaire.",
    steps: [
      "Vérifiez quelles informations manquent pour ce transfert.",
      "Complétez-les auprès du client, ou expliquez dans la note pourquoi elles ne peuvent pas l'être.",
      "Si les informations ne peuvent pas être obtenues, évaluez s'il faut refuser ou suspendre ce type d'opération, et si elles éveillent un soupçon (DOT).",
    ],
  },
  ppv: {
    why: "Le client est peut-être une personne politiquement vulnérable, un dirigeant d'organisation internationale, ou un proche de l'une d'elles.",
    steps: [
      "Confirmez le statut avec des sources fiables (déclaration du client, recherche publique).",
      "Si c'est confirmé : établissez l'origine des fonds, faites approuver la relation par la direction, et surveillez ses opérations de plus près.",
      "Notez votre décision et ses raisons dans l'alerte.",
    ],
  },
};

export const ALERT_STATUS_META: Record<AlertStatus, { label: string; text: string }> = {
  nouveau:  { label: "Nouveau",  text: "text-foreground" },
  en_cours: { label: "En cours", text: "text-foreground" },
  declare:  { label: "Déclaré",  text: "text-muted-foreground/60" },
  classe:   { label: "Classé",   text: "text-muted-foreground/60" },
};

export interface ComplianceAlert {
  /** uuid en base. */
  id: string;
  /** Numéro lisible : CA-0001. */
  ref: string;
  type: AlertType;
  source: "auto" | "manuel";
  orderId?: string;
  orderRef?: string;
  /** Toutes les commandes en cause (règle des 24 h, fractionnement). */
  orderIds: string[];
  orderRefs: string[];
  userId?: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  reason: string;
  /** Moment de l'opération (réception du paiement). */
  occurredAt: string;
  createdAt: string;
  /** Échéance légale (DOIMV : 5 jours ouvrables après la réception). */
  dueDate?: string;
  status: AlertStatus;
  /** Nom de la personne qui suit l'alerte. */
  assignedTo?: string;
  /** L'alerte est suivie par la personne connectée. */
  mine?: boolean;
  notes?: string;
  classification?: string;
  closedAt?: string;
  closedBy?: string;
}

// ────────────────────────────────────────────────────────────
// Déclarations CANAFE
// ────────────────────────────────────────────────────────────

export type DeclarationType = "doimv" | "dot" | "dbt";
export type DeclarationStatus = "brouillon" | "soumise" | "acceptee" | "rejetee";

export const DECL_TYPE_META: Record<DeclarationType, { label: string; full: string }> = {
  doimv: { label: "DOIMV", full: "Déclaration d'opérations importantes en monnaie virtuelle" },
  dot:   { label: "DOT",   full: "Déclaration d'opérations douteuses" },
  dbt:   { label: "DBT",   full: "Déclaration de biens terroristes" },
};

export const DECL_STATUS_META: Record<DeclarationStatus, { label: string; text: string }> = {
  brouillon: { label: "Brouillon", text: "text-foreground" },
  soumise:   { label: "Soumise",   text: "text-foreground" },
  acceptee:  { label: "Acceptée",  text: "text-muted-foreground/60" },
  rejetee:   { label: "Rejetée",   text: "text-destructive" },
};

export interface ComplianceDeclaration {
  /** uuid en base. */
  id: string;
  /** Numéro lisible : DC-2026-001. */
  ref: string;
  type: DeclarationType;
  alertId?: string;
  alertRef?: string;
  userId?: string;
  clientName: string;
  amount: number;
  createdAt: string;
  /** Absente pour une DOT (« dès que possible »). */
  dueDate?: string;
  submittedAt?: string;
  status: DeclarationStatus;
  canafRef?: string;
  formData?: DeclarationFormData;
}

// ────────────────────────────────────────────────────────────
// Registre (tenue de dossiers) — volumes réels : compliance_register_stats()
// ────────────────────────────────────────────────────────────

export const RECORD_CATEGORIES = [
  { id: "operations",   label: "Opérations",                description: "Achats et ventes payés : client, montants, taux, réseau, adresse, références Interac et blockchain." },
  { id: "identites",    label: "Vérifications d'identité",  description: "Résultats de vérification (fournisseur, référence, document, date)." },
  { id: "interac",      label: "Virements Interac reçus",   description: "Avis Interac lus automatiquement : expéditeur, montant, référence, rapprochement." },
  { id: "envois",       label: "Envois d'USDT",             description: "Transferts de monnaie virtuelle : adresses émettrice et bénéficiaire, montant, hash." },
  { id: "declarations", label: "Déclarations CANAFE",       description: "DOIMV, DOT et DBT préparées ici, avec la référence CANAFE." },
  { id: "alertes",      label: "Alertes et classements",    description: "Alertes de conformité et motif de chaque classement sans suite." },
] as const;

export type RecordCategoryId = (typeof RECORD_CATEGORIES)[number]["id"];

// ────────────────────────────────────────────────────────────
// Programme de conformité — liste de contrôle
// ────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  description: string;
  done: boolean;
  dueDate?: string;
  frequency?: string;
  doneAt?: string;
  /** Preuve ou note (document, date, lien). */
  evidence?: string;
}

export const CHECKLIST_CATEGORIES = [
  "Inscription CANAFE",
  "Agent de conformité",
  "Politiques et procédures",
  "Évaluation des risques",
  "Formation du personnel",
  "Examen indépendant",
  "Contrôles continus",
] as const;

export function daysUntil(dateStr: string): number {
  // Jours calendaires entre aujourd'hui et la date (négatif si dépassée).
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ────────────────────────────────────────────────────────────
// Classification — clôture d'alerte sans déclaration
// ────────────────────────────────────────────────────────────

export const CLASSIFICATION_REASONS = [
  "Faux positif : le client ou l'opération ne présente aucun risque",
  "Information insuffisante pour soumettre une déclaration",
  "Doublon : déjà couvert par une autre alerte",
  "Opération annulée ou non complétée",
  "Vérification effectuée : aucun comportement suspect",
  "Opération de test interne (équipe Ooble)",
] as const;

// ────────────────────────────────────────────────────────────
// Indicateurs de soupçon DOT — CANAFE / GAFI
// ────────────────────────────────────────────────────────────

export const DOT_INDICATORS = [
  "Le client refuse ou hésite à fournir des renseignements d'identification",
  "Le client fournit des documents d'identification douteux ou falsifiés",
  "Structuration apparente pour éviter le seuil de déclaration de 10 000 $",
  "Transactions sans justification économique apparente",
  "Opérations incohérentes avec le profil financier du client",
  "Le client effectue des opérations pour le compte d'un tiers non déclaré",
  "Le client est pressé de compléter l'opération sans se soucier du taux ou des frais",
  "Le client utilise plusieurs comptes, adresses courriel ou identités",
  "Provenance des fonds suspecte ou inexpliquée",
  "Destination des fonds vers une juridiction à haut risque (liste GAFI)",
  "Le client tente d'annuler l'opération après avoir été questionné",
  "Le client est lié à des informations médiatiques négatives (adverse media)",
  "Montant ou fréquence incompatible avec la source de revenus déclarée",
  "Le client refuse d'expliquer l'objet de la transaction",
] as const;

// ────────────────────────────────────────────────────────────
// Référentiels pour le formulaire de déclaration
// ────────────────────────────────────────────────────────────

export const ID_TYPES = [
  "Permis de conduire",
  "Passeport canadien",
  "Passeport étranger",
  "Carte de résident permanent",
  "Carte de citoyenneté",
  "Certificat de statut d'Indien",
  "Carte d'identité provinciale",
] as const;

export const PROVINCES: { code: string; name: string }[] = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "Colombie-Britannique" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "Nouveau-Brunswick" },
  { code: "NL", name: "Terre-Neuve-et-Labrador" },
  { code: "NS", name: "Nouvelle-Écosse" },
  { code: "NT", name: "Territoires du Nord-Ouest" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Île-du-Prince-Édouard" },
  { code: "QC", name: "Québec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

// ────────────────────────────────────────────────────────────
// Données du formulaire de déclaration CANAFE
// ────────────────────────────────────────────────────────────

export interface DeclarationFormData {
  type: DeclarationType;
  clientName: string;
  clientEmail: string;
  clientDob: string;
  clientIdType: string;
  clientIdNumber: string;
  clientAddress: string;
  clientCity: string;
  clientProvince: string;
  clientPostalCode: string;
  clientOccupation: string;
  operationType: string;
  amountCad: string;
  amountUsdt: string;
  /** Monnaie virtuelle de l'opération (USDT si absent : déclarations d'avant l'USDC). */
  asset?: "USDT" | "USDC";
  operationDate: string;
  paymentMethod: string;
  walletAddress: string;
  network: string;
  suspicionIndicators: string[];
  observations: string;
}

/**
 * Formulaire pré-rempli à partir de l'alerte et, si elle en a une, de la
 * commande en cause. Les champs d'identité (naissance, pièce, adresse) se
 * complètent à partir du dossier de vérification du client.
 */
export function initialDeclarationForm(alert: ComplianceAlert, order?: AdminOrder): DeclarationFormData {
  const declType: DeclarationType =
    alert.type === "dot" ? "dot" : alert.type === "sanctions" ? "dbt" : "doimv";
  const net = order?.network ? NETWORKS.find((n) => n.id === order.network) : undefined;
  // DOIMV = réception de monnaie virtuelle, donc une vente du client.
  const side = order?.type === "sell" || alert.type === "doimv" || alert.type === "doimv_24h" ? "sell" : "buy";
  return {
    type: declType,
    clientName: alert.clientName,
    clientEmail: alert.clientEmail,
    clientDob: "",
    clientIdType: "",
    clientIdNumber: "",
    clientAddress: "",
    clientCity: "",
    clientProvince: "",
    clientPostalCode: "",
    clientOccupation: "",
    operationType: side,
    amountCad: String(alert.amount),
    amountUsdt: order && alert.orderRefs.length <= 1 ? String(order.usdt) : "",
    asset: order?.asset === "usdc" ? "USDC" : "USDT",
    operationDate: (alert.occurredAt || alert.createdAt).slice(0, 10),
    paymentMethod: side === "sell" ? `${order?.asset === "usdc" ? "USDC" : "USDT"} reçus, versement Interac` : "Virement Interac",
    walletAddress: order?.address ?? "",
    network: net ? `${net.name} (${net.tag})` : "",
    suspicionIndicators: [],
    observations: alert.orderRefs.length > 1 ? `Commandes en cause : ${alert.orderRefs.join(", ")}.` : "",
  };
}
