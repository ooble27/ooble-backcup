/**
 * Réglages de la plateforme (Back-office › Réglages), lus par toute l'app.
 *
 * Une seule ligne en base (app_settings), lisible par tout le monde (sauf les marges, le cours figé et
 * le nom de qui a changé quoi, réservés à l'équipe) et modifiable par les administrateurs. La base applique elle-même l'ouverture des achats et ventes et les limites :
 * l'app ne fait qu'afficher les bons écrans. La dernière valeur connue est gardée sur l'appareil
 * pour un affichage immédiat, puis relue.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export interface AppSettings {
  tradingEnabled: boolean;
  verificationEnabled: boolean;
  otcEnabled: boolean;
  tradeMinCad: number;
  tradeDailyMaxCad: number;
  /** Marge d'Ooble au-dessus du cours du marché (achats) et en dessous (ventes), en %. */
  buyMarginPct: number;
  sellMarginPct: number;
  /** Réseaux ouverts, par sens (clés de la base : trc20, bep20, erc20, polygon, spl, avalanche). */
  networks: NetworkSwitches;
  signupsIndividual: boolean;
  signupsBusiness: boolean;
  /** Durée du taux garanti à la création d'une commande, en minutes. */
  rateLockMinutes: number;
  /** Une vente jamais envoyée expire après ce délai, en heures. */
  sellExpiryHours: number;
  /** Achat non payé : annulé automatiquement après ce délai (minutes). */
  buyExpiryMinutes: number;
  /** Cours du marché figé à la main (taux de secours), sinon null : cours automatique. */
  manualMarketRate: number | null;
  supportEmail: string;
  interacEmail: string;
  otcEmail: string;
  updatedAt: string | null;
  updatedByName: string | null;
}

export type DbNet = "trc20" | "bep20" | "erc20" | "polygon" | "spl" | "avalanche";
export type NetworkSwitches = Record<DbNet, { buy: boolean; sell: boolean }>;
const NETS_DEFAULT: NetworkSwitches = {
  trc20: { buy: true, sell: true }, bep20: { buy: true, sell: true }, erc20: { buy: false, sell: false },
  polygon: { buy: true, sell: true }, spl: { buy: true, sell: true }, avalanche: { buy: false, sell: false },
};

/** Tant que rien n'est lu : tout fermé, limites légales par défaut. */
const DEFAULTS: AppSettings = {
  tradingEnabled: false, verificationEnabled: false, otcEnabled: false,
  tradeMinCad: 100, tradeDailyMaxCad: 9999, buyMarginPct: 2, sellMarginPct: 2,
  networks: NETS_DEFAULT, signupsIndividual: true, signupsBusiness: true, rateLockMinutes: 15, sellExpiryHours: 48, buyExpiryMinutes: 30,
  manualMarketRate: null, supportEmail: "support@ooble.ca", interacEmail: "interac@ooble.ca", otcEmail: "otc@ooble.ca",
  updatedAt: null, updatedByName: null,
};
/** Seuil de déclaration du CANAFE : les limites restent en dessous. */
export const LEGAL_DAILY_MAX_CAD = 9999;

const KEY = "ooble.settings";
const listeners = new Set<(s: AppSettings) => void>();
let current: AppSettings = (() => {
  try { const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null; return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS; } catch { return DEFAULTS; }
})();
let inflight: Promise<AppSettings> | null = null;

function publish(s: AppSettings) {
  current = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ }
  listeners.forEach((l) => l(s));
}

type Row = Database["public"]["Tables"]["app_settings"]["Row"];
type StaffPart = Pick<Row, "buy_margin_pct" | "sell_margin_pct" | "manual_market_rate" | "updated_by_name">;
/** Colonnes lisibles par tout le monde (clients et visiteurs). */
const PUBLIC_COLS = "id, trading_enabled, verification_enabled, otc_enabled, trade_min_cad, trade_daily_max_cad, updated_at, networks, signups_individual, signups_business, rate_lock_minutes, sell_expiry_hours, buy_expiry_minutes, support_email, interac_email, otc_email";

/** Équipe seulement : marges, cours figé, auteur du dernier changement (rien pour les autres). */
async function staffPart(): Promise<StaffPart | null> {
  const { data, error } = await supabase.rpc("app_settings_staff" as never);
  if (error || !data) return null;
  return (Array.isArray(data) ? data[0] : data) as StaffPart | null;
}

const merge = (pub: Omit<Row, keyof StaffPart | "updated_by">, staff: StaffPart | null): AppSettings => {
  const keep = current;
  return fromRow({
    ...pub, updated_by: null,
    buy_margin_pct: staff ? staff.buy_margin_pct : keep.buyMarginPct,
    sell_margin_pct: staff ? staff.sell_margin_pct : keep.sellMarginPct,
    manual_market_rate: staff ? staff.manual_market_rate : keep.manualMarketRate,
    updated_by_name: staff ? staff.updated_by_name : keep.updatedByName,
  });
};

const fromRow = (r: Row): AppSettings => ({
  tradingEnabled: r.trading_enabled,
  verificationEnabled: r.verification_enabled,
  otcEnabled: r.otc_enabled,
  tradeMinCad: Number(r.trade_min_cad),
  tradeDailyMaxCad: Number(r.trade_daily_max_cad),
  buyMarginPct: Number(r.buy_margin_pct),
  sellMarginPct: Number(r.sell_margin_pct),
  networks: { ...NETS_DEFAULT, ...((r.networks ?? {}) as Partial<NetworkSwitches>) },
  signupsIndividual: r.signups_individual,
  signupsBusiness: r.signups_business,
  rateLockMinutes: r.rate_lock_minutes,
  sellExpiryHours: r.sell_expiry_hours,
  buyExpiryMinutes: r.buy_expiry_minutes ?? 30,
  manualMarketRate: r.manual_market_rate == null ? null : Number(r.manual_market_rate),
  supportEmail: r.support_email,
  interacEmail: r.interac_email,
  otcEmail: r.otc_email,
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
});

/** Dernière valeur connue, sans attendre le réseau. */
export const getAppSettingsNow = () => current;

/** Réglages à jour (un seul appel à la fois). */
export function getAppSettings(): Promise<AppSettings> {
  inflight ??= (async () => {
    try {
      const [{ data }, staff] = await Promise.all([supabase.from("app_settings").select(PUBLIC_COLS).eq("id", 1).maybeSingle(), staffPart()]);
      if (data) publish(merge(data, staff));
      return current;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Dans un composant : la dernière valeur connue tout de suite, puis la valeur à jour. */
export function useAppSettings(): AppSettings {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    void getAppSettings();
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

/** Administrateurs : change un ou plusieurs réglages (la base refuse les autres rôles et les limites hors cadre). */
export type SettingsPatch = Partial<Omit<AppSettings, "updatedAt" | "updatedByName">>;
export async function saveAppSettings(patch: SettingsPatch): Promise<{ error?: string }> {
  const row: Database["public"]["Tables"]["app_settings"]["Update"] = {};
  if (patch.tradingEnabled !== undefined) row.trading_enabled = patch.tradingEnabled;
  if (patch.verificationEnabled !== undefined) row.verification_enabled = patch.verificationEnabled;
  if (patch.otcEnabled !== undefined) row.otc_enabled = patch.otcEnabled;
  if (patch.tradeMinCad !== undefined) row.trade_min_cad = patch.tradeMinCad;
  if (patch.tradeDailyMaxCad !== undefined) row.trade_daily_max_cad = patch.tradeDailyMaxCad;
  if (patch.buyMarginPct !== undefined) row.buy_margin_pct = patch.buyMarginPct;
  if (patch.sellMarginPct !== undefined) row.sell_margin_pct = patch.sellMarginPct;
  if (patch.networks !== undefined) row.networks = patch.networks;
  if (patch.signupsIndividual !== undefined) row.signups_individual = patch.signupsIndividual;
  if (patch.signupsBusiness !== undefined) row.signups_business = patch.signupsBusiness;
  if (patch.rateLockMinutes !== undefined) row.rate_lock_minutes = patch.rateLockMinutes;
  if (patch.sellExpiryHours !== undefined) row.sell_expiry_hours = patch.sellExpiryHours;
  if (patch.buyExpiryMinutes !== undefined) row.buy_expiry_minutes = patch.buyExpiryMinutes;
  if (patch.manualMarketRate !== undefined) row.manual_market_rate = patch.manualMarketRate;
  if (patch.supportEmail !== undefined) row.support_email = patch.supportEmail.trim();
  if (patch.interacEmail !== undefined) row.interac_email = patch.interacEmail.trim();
  if (patch.otcEmail !== undefined) row.otc_email = patch.otcEmail.trim();
  const { data, error } = await supabase.from("app_settings").update(row).eq("id", 1).select(PUBLIC_COLS).maybeSingle();
  if (error) return { error: error.message };
  if (data) publish(merge(data, await staffPart()));
  return {};
}
