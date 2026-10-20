/**
 * Oli : le nom de la plateforme quand elle agit seule (lit les virements Interac, envoie les USDC,
 * repère les dépôts des ventes, annule les ordres expirés, termine les commandes, prépare les dossiers).
 * Son nom, son avatar et ses couleurs se règlent dans Réglages › Oli (table oli_settings).
 */
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AvatarBg, NameColor } from "@/lib/teamSpace";

/** Avatars dessinés pour Oli. `seed:…` désigne en plus un dessin illustré, comme ceux de l'équipe. */
export const OLI_GALLERY: { id: string; label: string }[] = [
  { id: "robot", label: "Robot" }, { id: "robot-rond", label: "Robot rond" }, { id: "casque", label: "Robot au casque" },
  { id: "boule", label: "Petite boule" }, { id: "sourire", label: "Sourire" }, { id: "cercle", label: "Le O d'Oli" },
  { id: "renard", label: "Renard" }, { id: "chat", label: "Chat" }, { id: "hibou", label: "Hibou" },
  { id: "colibri", label: "Colibri" }, { id: "abeille", label: "Abeille" }, { id: "tortue", label: "Tortue" },
  { id: "baleine", label: "Baleine" }, { id: "pousse", label: "Pousse" }, { id: "erable", label: "Feuille d'érable" },
  { id: "soleil", label: "Soleil" }, { id: "nuage", label: "Nuage" }, { id: "avion", label: "Avion en papier" },
  { id: "loupe", label: "Loupe" }, { id: "boussole", label: "Boussole" }, { id: "montgolfiere", label: "Montgolfière" },
];

export interface OliLook { name: string; avatar: string; bg: AvatarBg; color: NameColor }
export interface OliSettings extends OliLook {
  kycCheck: boolean;
  /** Pièce signalée « expire bientôt » à moins de ce nombre de jours. */
  expiryWarnDays: number;
  /** Âge minimum lu sur la pièce. */
  minAge: number;
  /** Ancienneté maximale de la preuve d'adresse, en jours. */
  addressMaxDays: number;
}
export const OLI_DEFAULTS: OliSettings = {
  name: "Oli", avatar: "robot", bg: "sage", color: "sage", kycCheck: true, expiryWarnDays: 30, minAge: 18, addressMaxDays: 92,
};

// Ce que tout le back-office affiche : lu une fois, puis mis à jour après chaque enregistrement.
let look: OliLook = { name: OLI_DEFAULTS.name, avatar: OLI_DEFAULTS.avatar, bg: OLI_DEFAULTS.bg, color: OLI_DEFAULTS.color };
const subs = new Set<() => void>();
const setLook = (next: OliLook) => { look = next; subs.forEach((f) => f()); };
export const oliName = () => look.name;
export const useOli = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => look);
export const oliGalleryUrl = (id: string) => `/illustrations/oli/${id}.svg`;

// oli_settings n'est pas encore dans les types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase.from as any)("oli_settings");
const COLS = "kyc_check, name, avatar, avatar_bg, name_color, expiry_warn_days, min_age, address_max_days";

export async function fetchOli(): Promise<OliSettings> {
  const { data } = await table().select(COLS).eq("id", 1).maybeSingle();
  const s: OliSettings = data ? {
    kycCheck: data.kyc_check ?? OLI_DEFAULTS.kycCheck,
    name: data.name || OLI_DEFAULTS.name, avatar: data.avatar || OLI_DEFAULTS.avatar,
    bg: data.avatar_bg || OLI_DEFAULTS.bg, color: data.name_color || OLI_DEFAULTS.color,
    expiryWarnDays: data.expiry_warn_days ?? OLI_DEFAULTS.expiryWarnDays, minAge: data.min_age ?? OLI_DEFAULTS.minAge,
    addressMaxDays: data.address_max_days ?? OLI_DEFAULTS.addressMaxDays,
  } : OLI_DEFAULTS;
  setLook({ name: s.name, avatar: s.avatar, bg: s.bg, color: s.color });
  return s;
}

let loading: Promise<unknown> | null = null;
/** À l'ouverture du back-office : le nom et l'avatar choisis remplacent ceux d'origine. */
export const loadOli = () => (loading ??= fetchOli().catch(() => null));

export async function saveOli(patch: Partial<OliSettings>): Promise<{ error?: string }> {
  const { data: s } = await supabase.auth.getSession();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: s.session?.user?.id ?? null };
  if (patch.kycCheck !== undefined) row.kyc_check = patch.kycCheck;
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.avatar !== undefined) row.avatar = patch.avatar;
  if (patch.bg !== undefined) row.avatar_bg = patch.bg;
  if (patch.color !== undefined) row.name_color = patch.color;
  if (patch.expiryWarnDays !== undefined) row.expiry_warn_days = patch.expiryWarnDays;
  if (patch.minAge !== undefined) row.min_age = patch.minAge;
  if (patch.addressMaxDays !== undefined) row.address_max_days = patch.addressMaxDays;
  const { data, error } = await table().update(row).eq("id", 1).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Réservé aux administrateurs." };
  setLook({ name: patch.name?.trim() || look.name, avatar: patch.avatar ?? look.avatar, bg: patch.bg ?? look.bg, color: patch.color ?? look.color });
  return {};
}

/** Auteurs automatiques écrits dans l'historique des commandes. */
const AUTO_ACTORS = new Set(["system", "auto", "cron", "sell-watch", "interac", "interac_etransfer", "interac_receipts", "expire-unpaid-buys", "expired"]);
export const isAutoActor = (actor: string | null | undefined) => !actor || AUTO_ACTORS.has(actor);
