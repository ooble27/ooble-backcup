import { useEffect, useState } from "react";

export interface RateHistory {
  /** Série de prix USDT/CAD (récent → ancien gauche→droite). */
  points: number[];
  /** Variation sur la période, en %. null si non chargée en direct. */
  changePct: number | null;
  /** true si l'historique en direct a été chargé. */
  live: boolean;
}

/** Courbe de repli douce (illustrative) tant que le direct n'est pas chargé. */
const FALLBACK: number[] = [
  1.401, 1.399, 1.403, 1.406, 1.404, 1.408, 1.407, 1.41, 1.409, 1.412, 1.414,
  1.411, 1.415, 1.417, 1.416, 1.419, 1.418, 1.421, 1.423, 1.422, 1.425, 1.427,
  1.426, 1.429,
];

/** Échantillonne `n` valeurs réparties uniformément dans un tableau. */
function sample(arr: number[], n: number): number[] {
  if (arr.length <= n) return arr;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  }
  return out;
}

/**
 * Récupère l'historique 7 jours du taux USDC/CAD (CoinGecko), côté client.
 * Comme l'USDC est un stablecoin, la courbe reflète surtout le change USD/CAD.
 * Repli sur une courbe douce si l'appel échoue.
 */
/** Historique déjà chargé : réaffiché tout de suite, relu au plus toutes les 10 minutes. */
let historyCache: (RateHistory & { at: number }) | null = null;

export function useUsdtHistory(): RateHistory {
  const [state, setState] = useState<RateHistory>(() => historyCache ?? {
    points: FALLBACK,
    changePct: null,
    live: false,
  });

  useEffect(() => {
    let alive = true;
    if (historyCache && Date.now() - historyCache.at < 10 * 60_000) return;
    fetch("https://api.coingecko.com/api/v3/coins/usd-coin/market_chart?vs_currency=cad&days=7&interval=hourly")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const raw: number[] = (d?.prices ?? []).map((p: [number, number]) => p[1]).filter((v: number) => v > 0);
        if (!alive || raw.length < 4) return;
        const points = sample(raw, 32);
        const changePct = ((points[points.length - 1] - points[0]) / points[0]) * 100;
        historyCache = { points, changePct, live: true, at: Date.now() };
        setState({ points, changePct, live: true });
      })
      .catch(() => {
        /* on garde le repli */
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
