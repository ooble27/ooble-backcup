// Fonction edge Ooble — rafraîchit le taux USDT/CAD dans `exchange_rates`.
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

/** Marge par défaut si les réglages ne peuvent pas être lus. */
const DEFAULT_MARGIN_PCT = 2;
/** Au plus tard, une ligne toutes les 5 minutes (l'app affiche « mis à jour il y a… »). */
const HEARTBEAT_MS = 5 * 60_000;

/** Cours USDT/CAD : Kraken (milieu offre/demande), puis CoinGecko. */
async function marketRate(): Promise<{ rate: number; source: string } | null> {
  try {
    const res = await fetch("https://api.kraken.com/0/public/Ticker?pair=USDTCAD", { signal: AbortSignal.timeout(4000) });
    const t = (await res.json())?.result?.USDTCAD;
    const ask = Number(t?.a?.[0]), bid = Number(t?.b?.[0]);
    if (ask > 0 && bid > 0 && ask / bid < 1.02) return { rate: (ask + bid) / 2, source: "kraken" };
  } catch { /* repli */ }
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cad", { signal: AbortSignal.timeout(4000) });
    const v = (await res.json())?.tether?.cad;
    if (typeof v === "number" && v > 0) return { rate: v, source: "coingecko" };
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);

  const [{ data: s }, { data: prev }] = await Promise.all([
    supabase.from("app_settings").select("buy_margin_pct, sell_margin_pct, manual_market_rate").eq("id", 1).maybeSingle(),
    supabase.from("exchange_rates").select("buy_rate, sell_rate, fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const manual = s?.manual_market_rate != null ? Number(s.manual_market_rate) : null;

  // Taux de marché réel, ou le cours figé à la main.
  const market = manual && manual > 0 ? { rate: manual, source: "manual" } : await marketRate();
  if (!market) {
    return new Response(JSON.stringify({ error: "Taux de marché indisponible." }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  const base = market.rate;
  const buyPct = Number(s?.buy_margin_pct ?? DEFAULT_MARGIN_PCT);
  const sellPct = Number(s?.sell_margin_pct ?? DEFAULT_MARGIN_PCT);
  const buy_rate = Math.round(base * (1 + buyPct / 100) * 1e6) / 1e6;
  const sell_rate = Math.round(base * (1 - sellPct / 100) * 1e6) / 1e6;

  // Rien de neuf : pas de ligne, sauf pour montrer que le taux est encore frais.
  const same = prev && Number(prev.buy_rate) === buy_rate && Number(prev.sell_rate) === sell_rate;
  const fresh = prev && Date.now() - new Date(prev.fetched_at).getTime() < HEARTBEAT_MS;
  if (same && fresh) {
    return new Response(JSON.stringify({ ok: true, unchanged: true, base, buy_rate, sell_rate }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("exchange_rates")
    .insert({ source: market.source, buy_rate, sell_rate, market_rate: base });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, source: market.source, base, buy_rate, sell_rate }), {
    headers: { "Content-Type": "application/json" },
  });
});
