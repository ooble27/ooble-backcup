/**
 * Persistance locale des campagnes marketing.
 *
 * Stocke l'historique dans localStorage sous la clé `ooble.campaigns`.
 * Chaque campagne enregistre : nom interne, modèle et champs saisis, sujet,
 * timestamp d'envoi, décompte succès/échec/désabonnés.
 *
 * Pas de table Supabase pour rester léger — l'historique est visible par
 * l'agent qui a lancé la campagne depuis son navigateur. Un besoin
 * multi-utilisateur justifierait de basculer vers une vraie table.
 */

export type CampaignSegment =
  | "all"
  | "kyc_approved"
  | "kyc_pending"
  | "not_verified"
  | "business"
  | "manual";

export type CampaignDesign = "announcement" | "promotion" | "update";

export interface CampaignRecord {
  id: string;
  name: string;
  segment: CampaignSegment;
  /** Anciens envois : design (« announcement »…). Nouveaux : id du modèle. */
  design: CampaignDesign | string;
  /** Modèle de campaignTemplates.ts et champs saisis (nouveaux envois). */
  templateId?: string;
  values?: Record<string, string>;
  /** Champs saisis par langue (envois bilingues). */
  valuesByLang?: { fr?: Record<string, string>; en?: Record<string, string> };
  subject: string;
  preheader: string;
  body: string;
  sentAt: string;
  sentBy: string;
  stats: { total: number; ok: number; failed: number; skipped?: number; fr?: number; en?: number };
}

const KEY = "ooble.campaigns";
const MAX = 100;

export function loadCampaigns(): CampaignRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CampaignRecord[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveCampaign(record: CampaignRecord): void {
  if (typeof window === "undefined") return;
  const all = loadCampaigns();
  all.unshift(record);
  const trimmed = all.slice(0, MAX);
  try { window.localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch { /* stockage indisponible : la liste reste en mémoire */ }
}

export const SEGMENT_LABEL: Record<CampaignSegment, string> = {
  all: "Tous les clients",
  kyc_approved: "KYC approuvés uniquement",
  kyc_pending: "KYC en attente",
  not_verified: "Identité non vérifiée",
  business: "Comptes entreprise",
  manual: "Sélection manuelle",
};

export const DESIGN_LABEL: Record<CampaignDesign, string> = {
  announcement: "Annonce",
  promotion: "Promotion",
  update: "Newsletter",
};
