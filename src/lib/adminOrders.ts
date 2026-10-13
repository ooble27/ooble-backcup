/**
 * Données du back-office (démo front-end).
 *
 * Aucune vraie base pour l'instant : on modélise les commandes exactement comme
 * le back-office aura besoin (achat / vente / envoi, statuts, montants CAD+USDT,
 * réseau, Interac, prise en charge par un opérateur) avec un jeu de données
 * factices. Quand Supabase sera branché, seules les fonctions de lecture/écriture
 * changeront — l'UI reste identique.
 */
import type { NetId } from "@/components/app/networks";

export type OrderType = "buy" | "sell" | "transfer";

/**
 * Cycle de vie d'une commande côté Ooble (paiement Interac) :
 *  attente → le client doit envoyer (achat) ou a créé sa vente
 *  recu    → fonds reçus, à traiter (entre dans la file d'attente)
 *  cours   → pris en charge par un opérateur
 *  termine → USDT envoyés / CAD versés
 *  annule  → annulée / expirée
 */
export type OrderStatus = "attente" | "recu" | "cours" | "termine" | "annule" | "rembourse";

export interface AdminOrder {
  id: string;
  ref: string;
  type: OrderType;
  status: OrderStatus;
  /** Identifiant de l'utilisateur client (pour la fiche complète). */
  userId?: string;
  clientName: string;
  clientEmail: string;
  cad: number;
  usdt: number;
  rate: number;
  network?: NetId;
  /** Adresse de réception USDT (achat / envoi). */
  address?: string;
  /** E-mail Interac de réception (vente). */
  interacEmail?: string;
  /** Minutes écoulées depuis la création (pour l'affichage relatif). */
  createdMinsAgo: number;
  assignedTo?: string | null;
  /** Le système envoie les USDT tout seul : personne ne peut la prendre. */
  autoSending?: boolean;
}

/** Statut = texte coloré (sans pastille ni point), façon Terex. */
export const STATUS_META: Record<OrderStatus, { label: string; text: string }> = {
  attente: { label: "En attente", text: "text-muted-foreground" },
  recu:    { label: "À traiter",  text: "text-foreground" },
  cours:   { label: "Envoi en cours", text: "text-foreground" },
  termine: { label: "Terminée",   text: "text-muted-foreground/60" },
  annule:    { label: "Annulée",     text: "text-destructive" },
  rembourse: { label: "Remboursée", text: "text-amber-500" },
};

export const TYPE_META: Record<OrderType, { label: string; verb: string }> = {
  buy:      { label: "Achat",  verb: "Envoyer les USDT" },
  sell:     { label: "Vente",  verb: "Verser les CAD" },
  transfer: { label: "Envoi",  verb: "Exécuter l'envoi" },
};

/** Opérateur connecté au back-office (démo). Sert à « Mes commandes ». */
export const CURRENT_OPERATOR = "Vous";

export const nfCad = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

/** Affichage relatif court : « il y a 5 min », « il y a 2 h », « il y a 3 j ». */
export function timeAgo(mins: number): string {
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

const RATE = 1.43;
const addr = (p: string) => `${p}${Math.random().toString(36).slice(2, 10)}`;

/** Fabrique une commande d'achat (le client paie en CAD, reçoit des USDT). */
const buy = (
  ref: string, status: OrderStatus, name: string, email: string, cad: number,
  network: NetId, mins: number, assignedTo: string | null = null,
): AdminOrder => ({
  id: ref, ref, type: "buy", status, clientName: name, clientEmail: email,
  cad, usdt: cad / RATE, rate: RATE, network, address: addr("T"),
  createdMinsAgo: mins, assignedTo,
});

/** Fabrique une commande de vente (le client envoie des USDT, reçoit des CAD). */
const sell = (
  ref: string, status: OrderStatus, name: string, email: string, usdt: number,
  mins: number, assignedTo: string | null = null,
): AdminOrder => ({
  id: ref, ref, type: "sell", status, clientName: name, clientEmail: email,
  cad: usdt * RATE, usdt, rate: RATE, interacEmail: email,
  createdMinsAgo: mins, assignedTo,
});

/* ------------------------------------------------------------------ */
/*  KYC — vérifications d'identité (démo)                              */
/* ------------------------------------------------------------------ */

export type KycStatus = "attente" | "verifie" | "refuse";

export interface KycRequest {
  id: string;
  userId?: string;
  clientName: string;
  email: string;
  docType: string;
  documentPaths: Record<string, string> | null;
  submittedMinsAgo: number;
  status: KycStatus;
  reviewNote?: string | null;
}

export const KYC_STATUS_META: Record<KycStatus, { label: string; text: string }> = {
  attente: { label: "À vérifier", text: "text-foreground" },
  verifie: { label: "Vérifié",    text: "text-muted-foreground/60" },
  refuse:  { label: "Refusé",     text: "text-destructive" },
};

export const SEED_KYC: KycRequest[] = [
  { id: "K1", clientName: "Amélie Tremblay", email: "amelie.t@gmail.com",     docType: "Permis de conduire", documentPaths: null, submittedMinsAgo: 14,  status: "attente" },
  { id: "K2", clientName: "Marc Gagnon",     email: "marc.gagnon@icloud.com", docType: "Passeport",          documentPaths: null, submittedMinsAgo: 40,  status: "attente" },
  { id: "K3", clientName: "Hugo Bouchard",   email: "hugo.bouchard@gmail.com",docType: "Carte santé",        documentPaths: null, submittedMinsAgo: 95,  status: "attente" },
  { id: "K4", clientName: "Isabelle Girard", email: "i.girard@videotron.ca",  docType: "Permis de conduire", documentPaths: null, submittedMinsAgo: 240, status: "verifie" },
  { id: "K5", clientName: "David Roy",       email: "davidroy88@gmail.com",   docType: "Passeport",          documentPaths: null, submittedMinsAgo: 520, status: "verifie" },
  { id: "K6", clientName: "Vincent Ouellet", email: "vince.o@hotmail.com",    docType: "Carte santé",        documentPaths: null, submittedMinsAgo: 610, status: "refuse" },
];

/* ------------------------------------------------------------------ */
/*  Équipe du back-office (démo)                                       */
/* ------------------------------------------------------------------ */

export type TeamRole = "Opérateur" | "KYC" | "Support" | "Marketing" | "Conformité" | "Admin";

/** Rôles du back-office et ce qu'ils autorisent (façon Terex). */
export const TEAM_ROLES: { role: TeamRole; desc: string }[] = [
  { role: "Opérateur",   desc: "Traite les commandes : achats, ventes, envois." },
  { role: "KYC",         desc: "Vérifications d'identité uniquement." },
  { role: "Support",     desc: "Assistance et messages clients." },
  { role: "Marketing",   desc: "Campagnes email aux clients." },
  { role: "Conformité",  desc: "Alertes CANAFE, déclarations, dossiers et programme de conformité." },
  { role: "Admin",       desc: "Accès complet : opérations, finance, équipe." },
];

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
  handled: number;
}

export const SEED_TEAM: TeamMember[] = [
  { id: "T1", name: "Vous",          email: "admin@ooble.ca",   role: "Admin",     active: true,  handled: 128 },
  { id: "T2", name: "Karim Benali",  email: "karim@ooble.ca",   role: "Opérateur", active: true,  handled: 74 },
  { id: "T3", name: "Awa Diallo",    email: "awa@ooble.ca",     role: "Opérateur", active: true,  handled: 61 },
  { id: "T4", name: "Léa Fontaine",  email: "lea@ooble.ca",     role: "KYC",       active: true,  handled: 39 },
  { id: "T5", name: "Sam Nguyen",    email: "sam@ooble.ca",     role: "Marketing", active: false, handled: 0 },
];

/** Jeu de données de démonstration. */
export const SEED_ORDERS: AdminOrder[] = [
  sell("OOB-7K2P4A", "recu",    "Amélie Tremblay", "amelie.t@gmail.com",   1200, 3),
  buy ("OOB-9QX3M1", "recu",    "Marc Gagnon",     "marc.gagnon@icloud.com", 500, "trx", 8),
  buy ("OOB-3H8L2C", "cours",   "Sophie Bergeron", "s.bergeron@outlook.com", 2500, "eth", 21, "Karim"),
  sell("OOB-5R1N7D", "recu",    "David Roy",       "davidroy88@gmail.com",  800, 34),
  buy ("OOB-2W6T9E", "attente", "Julie Côté",      "julie.cote@gmail.com",  150, "matic", 44),
  sell("OOB-8B4K5F", "cours",   "Nicolas Fortin",  "n.fortin@proton.me",   3400, 52, "Awa"),
  buy ("OOB-1M9P2G", "termine", "Isabelle Girard", "i.girard@videotron.ca", 640, "sol", 190),
  buy ("OOB-6C3V8H", "termine", "Patrick Lévesque","plevesque@gmail.com",  1800, "trx", 260),
  sell("OOB-4F7J1K", "termine", "Mélanie Dubé",    "melanie.dube@gmail.com", 950, 320),
  buy ("OOB-0T5R9L", "attente", "Étienne Caron",   "etienne.caron@gmail.com", 300, "bnb", 380),
  sell("OOB-7Y2Q6M", "annule",  "Vincent Ouellet", "vince.o@hotmail.com",   500, 520),
  buy ("OOB-9D8W3N", "termine", "Catherine Pelletier","cath.p@gmail.com",  4200, "eth", 610),
  buy ("OOB-3G1X7P", "recu",    "Hugo Bouchard",   "hugo.bouchard@gmail.com", 220, "avax", 12),
  sell("OOB-5A6Z2Q", "termine", "Laurence Simard", "l.simard@gmail.com",   1500, 720),
];
