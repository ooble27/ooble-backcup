import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAppSettingsNow, type AssetId } from "@/lib/settings";

/** Valeur de repli tant qu'aucun taux n'est chargé (dollar américain numérique en CAD). */
const FALLBACK_BASE = 1.4020;

interface UsdtRate {
  /** Taux de marché réel de l'actif en CAD. */
  base: number;
  /** Ce que le client paie pour 1 unité. */
  buy: number;
  /** Ce que le client reçoit pour 1 unité. */
  sell: number;
  /** true si un taux réel a été chargé. */
  live: boolean;
}

interface Loaded { buy: number; sell: number; base: number; fetchedAt?: number }

/**
 * Dernier taux connu de chaque actif (USDT, USDC), partagé par toutes les pages : il s'affiche tout de
 * suite à chaque navigation (et au prochain lancement, via le stockage local), puis il est relu au plus
 * toutes les 30 secondes. Évite le passage par la valeur de repli puis le saut vers le vrai taux.
 */
const storeKey = (a: AssetId) => (a === "usdt" ? "ooble.rate" : `ooble.rate.${a}`);
const last = new Map<AssetId, Loaded & { at: number }>();
for (const a of ["usdt", "usdc"] as AssetId[]) {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(a)) ?? "null");
    if (v && v.buy > 0 && v.sell > 0) last.set(a, { ...v, at: 0 });
  } catch { /* stockage indisponible */ }
}
const inflight = new Map<AssetId, Promise<Loaded | null>>();

/** Applique les marges réglées (Back-office › Réglages › Taux et marge) à un taux de marché. */
function withMargins(base: number): Loaded {
  const s = getAppSettingsNow();
  return { base, buy: base * (1 + s.buyMarginPct / 100), sell: base * (1 - s.sellMarginPct / 100) };
}

function remember(a: AssetId, v: Loaded) {
  last.set(a, { ...v, at: Date.now() });
  try { localStorage.setItem(storeKey(a), JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

/** Dernière ligne de `exchange_rates` pour l'actif. */
async function readLatest(a: AssetId): Promise<Loaded | null> {
  const { data } = await supabase
    .from("exchange_rates")
    .select("buy_rate, sell_rate, market_rate, fetched_at")
    .eq("asset", a)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const buy = Number(data.buy_rate);
  const sell = Number(data.sell_rate);
  return { buy, sell, base: data.market_rate ? Number(data.market_rate) : (buy + sell) / 2, fetchedAt: new Date(data.fetched_at).getTime() };
}

/**
 * Taux en direct : le serveur le recalcule toutes les 10 secondes (cours Kraken) ; les pages
 * abonnées le relisent toutes les 5 secondes, seulement quand l'onglet est visible. Un seul
 * minuteur par actif pour toute l'app, quel que soit le nombre de pages abonnées.
 */
const liveSubs = new Map<AssetId, Set<(v: Loaded) => void>>();
const liveTimer = new Map<AssetId, number>();
function liveTick(a: AssetId) {
  if (typeof document !== "undefined" && document.hidden) return;
  void readLatest(a).then((v) => {
    if (!v) return;
    remember(a, v);
    liveSubs.get(a)?.forEach((f) => f(v));
  }).catch(() => { /* réseau : on réessaie au prochain passage */ });
}
function subscribeLive(a: AssetId, f: (v: Loaded) => void) {
  const subs = liveSubs.get(a) ?? new Set();
  liveSubs.set(a, subs);
  subs.add(f);
  const onVisible = () => liveTick(a);
  if (!liveTimer.has(a)) {
    liveTimer.set(a, window.setInterval(() => liveTick(a), 5000));
  }
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    subs.delete(f);
    document.removeEventListener("visibilitychange", onVisible);
    if (!subs.size && liveTimer.has(a)) {
      window.clearInterval(liveTimer.get(a));
      liveTimer.delete(a);
    }
  };
}

const GECKO_ID: Record<AssetId, string> = { usdt: "tether", usdc: "usd-coin" };

/**
 * Taux de l'actif (USDT par défaut) en CAD. Source de vérité : la table `exchange_rates` (contrôlée côté
 * serveur, lecture publique, une ligne par actif). Repli : CoinGecko côté client, puis valeur fixe.
 */
export function useUsdtRate(opts?: { live?: boolean; asset?: AssetId }): UsdtRate {
  const asset: AssetId = opts?.asset ?? "usdt";
  const [loaded, setLoaded] = useState<{ a: AssetId; v: Loaded } | null>(() => {
    const v = last.get(asset);
    return v ? { a: asset, v } : null;
  });
  const live = !!opts?.live;
  // En direct (accueil de l'app) : relu toutes les 5 secondes.
  useEffect(() => (live ? subscribeLive(asset, (v) => setLoaded({ a: asset, v })) : undefined), [live, asset]);

  useEffect(() => {
    let alive = true;
    const known = last.get(asset);
    if (known) setLoaded({ a: asset, v: known });
    if (known && Date.now() - known.at < 30_000) return;

    let p = inflight.get(asset);
    if (!p) {
      p = (async (): Promise<Loaded | null> => {
        // 1) Taux officiel Ooble depuis la base.
        const data = await readLatest(asset);
        if (data) return data;
        // 2) Repli marché en direct (CoinGecko).
        try {
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${GECKO_ID[asset]}&vs_currencies=cad`);
          const v = r.ok ? (await r.json())?.[GECKO_ID[asset]]?.cad : null;
          if (typeof v === "number" && v > 0) return withMargins(v);
        } catch { /* on garde le repli fixe */ }
        return null;
      })().finally(() => { inflight.delete(asset); });
      inflight.set(asset, p);
    }

    p.then((v) => {
      if (!v) return;
      remember(asset, v);
      if (alive) setLoaded({ a: asset, v });
    });

    return () => { alive = false; };
  }, [asset]);

  // Un taux chargé pour un autre actif (changement en cours) n'est jamais affiché.
  if (loaded && loaded.a === asset) return { buy: loaded.v.buy, sell: loaded.v.sell, base: loaded.v.base, live: true };
  return {
    ...withMargins(FALLBACK_BASE),
    live: false,
  };
}
