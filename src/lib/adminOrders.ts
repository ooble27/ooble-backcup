/**
 * Modèle des commandes du back-office : types, libellés des statuts et formats.
 * Les vraies commandes viennent de la base (adminOrdersLive.ts) et sont converties vers ce modèle.
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
  /** Cryptomonnaie de la commande : USDT ou USDC. */
  asset?: "usdt" | "usdc";
  /** Adresse de réception USDT (achat / envoi). */
  address?: string;
  /** E-mail Interac de réception (vente). */
  interacEmail?: string;
  /** Minutes écoulées depuis la création (pour l'affichage relatif). */
  createdMinsAgo: number;
  assignedTo?: string | null;
  /** Identifiant du membre qui traite la commande. */
  assignedId?: string | null;
  /** Dernière modification (passage à « terminée », prise en charge…), ISO. */
  updatedAt?: string;
  /** Le système envoie les USDT tout seul : personne ne peut la prendre. */
  autoSending?: boolean;
  /** Commande d'un compte de test : un essai, sans vrai envoi ni argent réel. */
  isTest?: boolean;
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
  buy:      { label: "Achat",  verb: "Envoyer les fonds" },
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

/* ─── Vérifications d'identité (forme utilisée par le back-office) ─── */

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
  createdAt?: string;
  /** Membre qui examine le dossier en ce moment. */
  assignedTo?: string | null;
  assignedName?: string | null;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  /** Création du compte client, pour le contexte. */
  accountCreatedAt?: string | null;
  /** Informations déclarées par le client à l'envoi (à comparer aux documents). */
  birthDate?: string | null;
  addressLine?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  occupation?: string | null;
}
