// Fonction edge Ooble — rafraîchit le taux USDT/CAD dans `exchange_rates`.
//
// Récupère le taux de marché (CoinGecko), applique les marges d'Ooble réglées dans
// Back-office › Réglages › Taux et marge (app_settings), et insère une nouvelle ligne.
// Taux de secours : si un cours a été figé à la main (Réglages › Taux de secours), il remplace
// CoinGecko jusqu'à ce qu'on revienne au cours automatique.
// Planifiée toutes les 10 minutes (cron), et appelée tout de suite quand une marge change.
//
// Utilise SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (injectés automatiquement).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Marge par défaut si les réglages ne peuvent pas être lus. */
const DEFAULT_MARGIN_PCT = 2;

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);

  const { data: s } = await supabase.from("app_settings").select("buy_margin_pct, sell_margin_pct, manual_market_rate").eq("id", 1).maybeSingle();
  const manual = s?.manual_market_rate != null ? Number(s.manual_market_rate) : null;

  // Taux de marché réel, ou le cours figé à la main.
  let base: number | null = manual && manual > 0 ? manual : null;
  if (!base) try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cad");
    const data = await res.json();
    const v = data?.tether?.cad;
    if (typeof v === "number" && v > 0) base = v;
  } catch { /* ignore */ }

  if (!base) {
    return new Response(JSON.stringify({ error: "Taux de marché indisponible." }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  const buyPct = Number(s?.buy_margin_pct ?? DEFAULT_MARGIN_PCT);
  const sellPct = Number(s?.sell_margin_pct ?? DEFAULT_MARGIN_PCT);
  const buy_rate = Math.round(base * (1 + buyPct / 100) * 1e6) / 1e6;
  const sell_rate = Math.round(base * (1 - sellPct / 100) * 1e6) / 1e6;

  const { error } = await supabase
    .from("exchange_rates")
    .insert({ source: manual ? "manual" : "coingecko", buy_rate, sell_rate, market_rate: base });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, base, buy_rate, sell_rate }), {
    headers: { "Content-Type": "application/json" },
  });
});
