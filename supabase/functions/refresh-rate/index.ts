// Fonction edge Ooble — rafraîchit les taux USDT/CAD et USDC/CAD dans `exchange_rates` (une ligne par actif).
//
// L'USDC n'est relevé que lorsqu'il est ouvert (Réglages › Cryptomonnaies) : les versions de l'app qui
// ne distinguent pas encore les actifs ne voient ainsi jamais de ligne USDC.
//
// Cours de marché : milieu de l'offre et de la demande USDT/CAD sur Kraken (paire cotée en
// dollars canadiens), CoinGecko en repli. Les marges d'Ooble réglées dans
// Back-office › Réglages › Taux et marge (app_settings) s'appliquent ensuite.
// Taux de secours : si un cours a été figé à la main (Réglages › Taux de secours), il remplace
// le marché jusqu'à ce qu'on revienne au cours automatique.
//
// Planifiée toutes les 10 secondes (pg_cron), et appelée tout de suite quand une marge change.
// Une ligne n'est ajoutée que si le taux a changé, ou toutes les 5 minutes au plus tard : l'app
// affiche un taux vivant sans remplir la table de doublons.
//
// Utilise SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (injectés automatiquement).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caller, refused } from "../_shared/guard.ts";

/** Marge par défaut si les réglages ne peuvent pas être lus. */
const DEFAULT_MARGIN_PCT = 2;
/** Au plus tard, une ligne toutes les 5 minutes (l'app affiche « mis à jour il y a… »). */
const HEARTBEAT_MS = 5 * 60_000;

type Asset = "usdt" | "usdc";
const KRAKEN_PAIR: Record<Asset, string> = { usdt: "USDTCAD", usdc: "USDCCAD" };
const GECKO_ID: Record<Asset, string> = { usdt: "tether", usdc: "usd-coin" };

/** Cours de l'actif en CAD : Kraken (milieu offre/demande), puis CoinGecko. */
async function marketRate(asset: Asset): Promise<{ rate: number; source: string } | null> {
  try {
    const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${KRAKEN_PAIR[asset]}`, { signal: AbortSignal.timeout(4000) });
    // La clé du résultat peut différer du nom demandé : on prend la première paire renvoyée.
    const result = (await res.json())?.result ?? {};
    const t = result[KRAKEN_PAIR[asset]] ?? Object.values(result)[0] as { a?: string[]; b?: string[] } | undefined;
    const ask = Number(t?.a?.[0]), bid = Number(t?.b?.[0]);
    if (ask > 0 && bid > 0 && ask / bid < 1.02) return { rate: (ask + bid) / 2, source: "kraken" };
  } catch { /* repli */ }
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${GECKO_ID[asset]}&vs_currencies=cad`, { signal: AbortSignal.timeout(4000) });
    const v = (await res.json())?.[GECKO_ID[asset]]?.cad;
    if (typeof v === "number" && v > 0) return { rate: v, source: "coingecko" };
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);
  if (!(await caller(req, supabase, key))) return refused();

  const { data: s } = await supabase.from("app_settings").select("buy_margin_pct, sell_margin_pct, manual_market_rate, assets").eq("id", 1).maybeSingle();
  const manual = s?.manual_market_rate != null ? Number(s.manual_market_rate) : null;
  const buyPct = Number(s?.buy_margin_pct ?? DEFAULT_MARGIN_PCT);
  const sellPct = Number(s?.sell_margin_pct ?? DEFAULT_MARGIN_PCT);
  const open = (s?.assets ?? {}) as Partial<Record<Asset, boolean>>;
  // L'USDT est toujours relevé (historique, comptabilité) ; l'USDC seulement s'il est ouvert.
  const assets: Asset[] = open.usdc ? ["usdt", "usdc"] : ["usdt"];

  const results: Record<string, unknown> = {};
  let failed = false;
  for (const asset of assets) {
    const { data: prev } = await supabase.from("exchange_rates").select("buy_rate, sell_rate, fetched_at")
      .eq("asset", asset).order("fetched_at", { ascending: false }).limit(1).maybeSingle();

    // Taux de marché réel, ou le cours figé à la main (les deux actifs valent un dollar américain).
    const market = manual && manual > 0 ? { rate: manual, source: "manual" } : await marketRate(asset);
    if (!market) { results[asset] = { error: "Taux de marché indisponible." }; failed = true; continue; }

    const base = market.rate;
    const buy_rate = Math.round(base * (1 + buyPct / 100) * 1e6) / 1e6;
    const sell_rate = Math.round(base * (1 - sellPct / 100) * 1e6) / 1e6;

    // Rien de neuf : pas de ligne, sauf pour montrer que le taux est encore frais.
    const same = prev && Number(prev.buy_rate) === buy_rate && Number(prev.sell_rate) === sell_rate;
    const fresh = prev && Date.now() - new Date(prev.fetched_at).getTime() < HEARTBEAT_MS;
    if (same && fresh) { results[asset] = { unchanged: true, base, buy_rate, sell_rate }; continue; }

    const { error } = await supabase.from("exchange_rates").insert({ asset, source: market.source, buy_rate, sell_rate, market_rate: base });
    if (error) { results[asset] = { error: error.message }; failed = true; continue; }
    results[asset] = { source: market.source, base, buy_rate, sell_rate };
  }

  return new Response(JSON.stringify({ ok: !failed, ...results }), {
    status: failed && !Object.values(results).some((r) => !(r as { error?: string }).error) ? 502 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
