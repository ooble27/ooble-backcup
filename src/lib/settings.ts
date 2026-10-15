/**
 * Réglages de la plateforme (Back-office › Réglages), lus par toute l'app.
 *
 * Une seule ligne en base (app_settings), lisible par tout le monde et modifiable par les
 * administrateurs. La base applique elle-même l'ouverture des achats et ventes et les limites :
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
  updatedAt: string | null;
  updatedByName: string | null;
}

/** Tant que rien n'est lu : tout fermé, limites légales par défaut. */
const DEFAULTS: AppSettings = {
  tradingEnabled: false, verificationEnabled: false, otcEnabled: false,
  tradeMinCad: 100, tradeDailyMaxCad: 9999, buyMarginPct: 2, sellMarginPct: 2, updatedAt: null, updatedByName: null,
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

const fromRow = (r: Database["public"]["Tables"]["app_settings"]["Row"]): AppSettings => ({
  tradingEnabled: r.trading_enabled,
  verificationEnabled: r.verification_enabled,
  otcEnabled: r.otc_enabled,
  tradeMinCad: Number(r.trade_min_cad),
  tradeDailyMaxCad: Number(r.trade_daily_max_cad),
  buyMarginPct: Number(r.buy_margin_pct),
  sellMarginPct: Number(r.sell_margin_pct),
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
});

/** Dernière valeur connue, sans attendre le réseau. */
export const getAppSettingsNow = () => current;

/** Réglages à jour (un seul appel à la fois). */
export function getAppSettings(): Promise<AppSettings> {
  inflight ??= (async () => {
    try {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (data) publish(fromRow(data));
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
  const { data, error } = await supabase.from("app_settings").update(row).eq("id", 1).select("*").maybeSingle();
  if (error) return { error: error.message };
  if (data) publish(fromRow(data));
  return {};
}
