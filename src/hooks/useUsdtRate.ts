import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAppSettingsNow } from "@/lib/settings";

/** Valeur de repli tant qu'aucun taux n'est chargé (USDT/CAD). */
const FALLBACK_BASE = 1.4020;

interface UsdtRate {
  /** Taux de marché réel USDT/CAD. */
  base: number;
  /** Ce que le client paie pour 1 USDT. */
  buy: number;
  /** Ce que le client reçoit pour 1 USDT. */
  sell: number;
  /** true si un taux réel a été chargé. */
  live: boolean;
  /** Heure du taux affiché (ms), si connue. */
  at?: number;
}

interface Loaded { buy: number; sell: number; base: number; fetchedAt?: number }

/**
 * Dernier taux connu, partagé par toutes les pages : il s'affiche tout de
 * suite à chaque navigation (et au prochain lancement, via le stockage local),
 * puis il est relu au plus toutes les 30 secondes. Évite le passage par la
 * valeur de repli puis le saut vers le vrai taux.
 */
const STORE_KEY = "ooble.rate";
let last: (Loaded & { at: number }) | null = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    return v && v.buy > 0 && v.sell > 0 ? { ...v, at: 0 } : null;
  } catch { return null; }
})();
let inflight: Promise<Loaded | null> | null = null;

/** Applique les marges réglées (Back-office › Réglages › Taux et marge) à un taux de marché. */
function withMargins(base: number): Loaded {
  const s = getAppSettingsNow();
  return { base, buy: base * (1 + s.buyMarginPct / 100), sell: base * (1 - s.sellMarginPct / 100) };
}

function remember(v: Loaded) {
  last = { ...v, at: Date.now() };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

/** Dernière ligne de `exchange_rates`. */
async function readLatest(): Promise<Loaded | null> {
  const { data } = await supabase
    .from("exchange_rates")
    .select("buy_rate, sell_rate, market_rate, fetched_at")
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
 * minuteur pour toute l'app, quel que soit le nombre de pages abonnées.
 */
const liveSubs = new Set<(v: Loaded) => void>();
let liveTimer: number | null = null;
function liveTick() {
  if (typeof document !== "undefined" && document.hidden) return;
  void readLatest().then((v) => {
    if (!v) return;
    remember(v);
    liveSubs.forEach((f) => f(v));
  }).catch(() => { /* réseau : on réessaie au prochain passage */ });
}
function subscribeLive(f: (v: Loaded) => void) {
  liveSubs.add(f);
  if (liveTimer == null) {
    liveTimer = window.setInterval(liveTick, 5000);
    document.addEventListener("visibilitychange", liveTick);
  }
  return () => {
    liveSubs.delete(f);
    if (!liveSubs.size && liveTimer != null) {
      window.clearInterval(liveTimer); liveTimer = null;
      document.removeEventListener("visibilitychange", liveTick);
    }
  };
}

/**
 * Taux USDT/CAD. Source de vérité : la table `exchange_rates` (contrôlée côté
 * serveur, lecture publique). Repli : CoinGecko côté client, puis valeur fixe.
 */
export function useUsdtRate(opts?: { live?: boolean }): UsdtRate {
  const [loaded, setLoaded] = useState<Loaded | null>(() => last);
  const live = !!opts?.live;
  // En direct (accueil de l'app) : relu toutes les 5 secondes.
  useEffect(() => (live ? subscribeLive(setLoaded) : undefined), [live]);

  useEffect(() => {
    let alive = true;
    if (last && Date.now() - last.at < 30_000) return;

    inflight ??= (async (): Promise<Loaded | null> => {
      // 1) Taux officiel Ooble depuis la base.
      const data = await readLatest();
      if (data) return data;
      // 2) Repli marché en direct (CoinGecko).
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cad");
        const v = r.ok ? (await r.json())?.tether?.cad : null;
        if (typeof v === "number" && v > 0) return withMargins(v);
      } catch { /* on garde le repli fixe */ }
      return null;
    })().finally(() => { inflight = null; });

    inflight.then((v) => {
      if (!v) return;
      remember(v);
      if (alive) setLoaded(v);
    });

    return () => { alive = false; };
  }, []);

  if (loaded) return { buy: loaded.buy, sell: loaded.sell, base: loaded.base, live: true, at: loaded.fetchedAt };
  return {
    ...withMargins(FALLBACK_BASE),
    live: false,
  };
}
