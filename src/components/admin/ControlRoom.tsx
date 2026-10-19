import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { nfCad, nfUsdt, STATUS_META, type AdminOrder } from "@/lib/adminOrders";
import { NET_LOGO, NET_NAME } from "@/lib/accounting";
import { loadTreasury, peekTreasury, type StockRow } from "@/lib/ledger";
import { firstName, hourLabel, loadActivity, peekTeam, type ActivityItem } from "@/lib/teamSpace";
import { C, FONT } from "./adminTheme";
import { TeamAvatar, useMembers, useTeamLive } from "./TeamViews";
import { onCallNow, useShifts } from "./TeamPlanning";

/**
 * Salle de contrôle : ce qui se passe maintenant, d'un coup d'œil, sans rien toucher.
 * Pensée pour rester ouverte au bureau (grand écran, mode plein écran) : commandes en direct,
 * taux, stock par réseau, équipe en ligne et délai du jour. Aucun nom de client ni adresse à l'écran.
 * Tout est lu : rien n'est modifié.
 */

const TZ = "America/Toronto";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const createdAt = (o: AdminOrder, now: number) => now - o.createdMinsAgo * 60_000;
const ACTIVE = new Set(["attente", "recu", "cours"]);
const SIDE: Record<string, string> = { buy: "Achat", sell: "Vente", transfer: "Envoi" };
const nfRate = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const nfInt = new Intl.NumberFormat("fr-CA");
// Les commandes notent le réseau par son logo (trx, matic…) ; la trésorerie par son code (trc20, polygon…).
const NAME_BY_SLUG: Record<string, string> = Object.fromEntries(Object.entries(NET_LOGO).map(([k, slug]) => [slug, NET_NAME[k] ?? k]));
const SOUND_KEY = "ooble.admin.control.sound";

const mins = (ms: number) => Math.max(0, Math.round(ms / 60_000));
const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);

const CR_CSS = `
.cr { font-family: ${FONT}; color: var(--a-t1) }
.cr-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding-bottom: 22px; border-bottom: 1px solid var(--a-bds) }
.cr-title { margin: 0; font-size: 34px; font-weight: 500; letter-spacing: -0.035em; line-height: 1.05 }
.cr-sub { margin: 8px 0 0; font-size: 13.5px; color: var(--a-t3); display: flex; align-items: center; gap: 10px; font-variant-numeric: tabular-nums }
.cr-live { width: 8px; height: 8px; border-radius: 99px; background: var(--a-sage); animation: cr-beat 2s ease-in-out infinite }
.cr-live[data-off="true"] { background: var(--a-t3); animation: none }
@keyframes cr-beat { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: .35; transform: scale(.8) } }
.cr-acts { display: flex; align-items: center; gap: 22px }
.cr-link { border: none; background: none; padding: 0; cursor: pointer; font: inherit; font-size: 14px; color: var(--a-t2); display: inline-flex; align-items: center; gap: 7px }
.cr-link:hover { color: var(--a-t1) }
.cr-go { border: none; background: none; padding: 0; cursor: pointer; font: inherit; font-size: 14.5px; font-weight: 600; color: var(--a-t1); display: inline-flex; align-items: center; gap: 7px; text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px }
.cr-go:hover svg { transform: translateX(3px) }
.cr-go svg { transition: transform .2s }
.cr-link:focus-visible, .cr-go:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 4px }

.cr-kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-bottom: 1px solid var(--a-bds) }
.cr-kpi { padding: 22px 22px 22px 0; min-width: 0 }
.cr-kpi + .cr-kpi { padding-left: 22px; border-left: 1px solid var(--a-bds) }
.cr-lab { margin: 0; font-size: 11px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3) }
.cr-num { margin: 10px 0 0; font-size: 34px; font-weight: 500; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cr-num small { font-size: 16px; color: var(--a-t3); letter-spacing: -0.01em; margin-left: 4px; font-weight: 400 }
.cr-hint { margin: 8px 0 0; font-size: 12.5px; color: var(--a-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums }
.cr-tick { display: inline-block; animation: cr-tick .5s cubic-bezier(.22,1,.36,1) }
@keyframes cr-tick { from { opacity: .2; transform: translateY(6px) } to { opacity: 1; transform: none } }

.cr-main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 48px; padding-top: 26px }
.cr-aside { display: flex; flex-direction: column; gap: 34px; min-width: 0 }
.cr-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 6px }
.cr-h p:last-child { margin: 0; font-size: 12.5px; color: var(--a-t3); font-variant-numeric: tabular-nums }

.cr-row { display: grid; grid-template-columns: 64px 150px 140px 130px minmax(0, 1fr) 110px; align-items: center; gap: 16px; padding: 13px 0; border-bottom: 1px solid var(--a-bds) }
.cr-row[data-done="true"] { color: var(--a-t2) }
.cr-row[data-done="true"] .cr-amt { color: var(--a-t2) }
.cr-new { animation: cr-in .7s cubic-bezier(.22,1,.36,1) both }
@keyframes cr-in { 0% { opacity: 0; transform: translateY(-10px); background: var(--a-hover4) } 60% { opacity: 1; transform: none; background: var(--a-hover4) } 100% { background: transparent } }
.cr-flash { animation: cr-flash 1.6s ease-out }
@keyframes cr-flash { 0% { background: var(--a-hover4) } 100% { background: transparent } }
.cr-side { font-size: 13px; color: var(--a-t2) }
.cr-ref { font-size: 14.5px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cr-amt { font-size: 15.5px; font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap }
.cr-amt span { display: block; font-size: 12px; font-weight: 400; color: var(--a-t3); margin-top: 2px }
.cr-net { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--a-t2); min-width: 0; white-space: nowrap }
.cr-who { display: flex; align-items: center; gap: 9px; font-size: 13.5px; min-width: 0; white-space: nowrap }
.cr-time { font-size: 13px; color: var(--a-t3); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
.cr-st { font-size: 13px; color: var(--a-t2); white-space: nowrap }
.cr-sep { margin: 22px 0 2px; font-size: 11px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3) }
.cr-empty { padding: 28px 0; font-size: 14.5px; color: var(--a-t3); border-bottom: 1px solid var(--a-bds) }

.cr-stock { padding: 13px 0; border-bottom: 1px solid var(--a-bds) }
.cr-stock-top { display: flex; align-items: center; gap: 10px; font-size: 14px }
.cr-stock-top b { margin-left: auto; font-weight: 500; font-variant-numeric: tabular-nums }
.cr-bar { margin-top: 9px; height: 4px; border-radius: 99px; background: var(--a-l3); overflow: hidden }
.cr-bar i { display: block; height: 100%; border-radius: 99px; background: var(--a-t1); transform-origin: left; animation: cr-grow 1s cubic-bezier(.22,1,.36,1) both }
.cr-bar i[data-low="true"] { background: var(--a-t3) }
@keyframes cr-grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.cr-stock-sub { margin: 6px 0 0; font-size: 12px; color: var(--a-t3); font-variant-numeric: tabular-nums }

.cr-mem { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--a-bds) }
.cr-mem p { margin: 0 }
.cr-mem .n { font-size: 14.5px }
.cr-mem .s { font-size: 12.5px; color: var(--a-t3); margin-top: 2px }
.cr-mem b { margin-left: auto; font-size: 20px; font-weight: 500; letter-spacing: -0.03em; font-variant-numeric: tabular-nums }
.cr-mem b small { display: block; font-size: 11px; font-weight: 400; color: var(--a-t3); letter-spacing: 0; text-align: right }

.cr-ticker { margin-top: 34px; border-top: 1px solid var(--a-bds); padding-top: 16px; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent) }
.cr-track { display: flex; gap: 48px; width: max-content; animation: cr-run var(--cr-speed, 80s) linear infinite }
.cr-ticker:hover .cr-track { animation-play-state: paused }
@keyframes cr-run { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.cr-item { display: inline-flex; align-items: center; gap: 9px; font-size: 13.5px; color: var(--a-t2); white-space: nowrap }
.cr-item em { font-style: normal; color: var(--a-t3); font-size: 12.5px }

/* Plein écran : l'écran du bureau, sans barre latérale ni en-tête. */
.cr-tv { position: fixed; inset: 0; z-index: 80; background: var(--a-bg); overflow: auto; padding: calc(28px + env(safe-area-inset-top, 0px)) 44px 28px }
.cr-tv .cr-title { font-size: 40px }
.cr-tv .cr-num { font-size: 42px }

@media (max-width: 1280px) {
  .cr-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)) }
  .cr-kpi:nth-child(4) { padding-left: 0; border-left: none }
  .cr-kpi:nth-child(n+4) { border-top: 1px solid var(--a-bds) }
  .cr-main { grid-template-columns: minmax(0, 1fr) 300px; gap: 36px }
  .cr-row { grid-template-columns: 56px 130px 120px 110px minmax(0, 1fr) 96px }
}
/* Tablette : stock et équipe passent sous les commandes, côte à côte. */
@media (max-width: 1180px) {
  .cr-main { grid-template-columns: minmax(0, 1fr) }
  .cr-aside { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px }
}
@media (max-width: 640px) {
  .cr-title { font-size: 28px }
  .cr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .cr-kpi, .cr-kpi + .cr-kpi { padding: 16px 12px 16px 0; border-left: none }
  .cr-kpi:nth-child(even) { padding-left: 14px; border-left: 1px solid var(--a-bds) }
  .cr-kpi:nth-child(n+3) { border-top: 1px solid var(--a-bds) }
  .cr-num { font-size: 26px }
  .cr-row { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px }
  .cr-row .cr-net, .cr-row .cr-st, .cr-row .cr-side { display: none }
  .cr-row .cr-who { grid-column: 1; font-size: 12.5px }
  .cr-row .cr-time { grid-column: 2 }
  .cr-aside { grid-template-columns: minmax(0, 1fr) }
  .cr-tv { padding: calc(18px + env(safe-area-inset-top, 0px)) 16px 18px }
}
@media (prefers-reduced-motion: reduce) {
  .cr-live, .cr-tick, .cr-new, .cr-flash, .cr-bar i { animation: none }
  .cr-track { animation: none; flex-wrap: wrap; width: auto }
}
`;

/** Taux de la dernière heure (le serveur en relève un toutes les 10 secondes). */
function useRateHistory(current: number) {
  const [pts, setPts] = useState<{ at: number; v: number }[]>([]);
  useEffect(() => {
    let on = true;
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    void supabase.from("exchange_rates").select("market_rate, buy_rate, sell_rate, fetched_at").gte("fetched_at", since)
      .order("fetched_at", { ascending: false }).limit(400)
      .then(({ data }) => {
        if (!on || !data) return;
        setPts((data as { market_rate: number | null; buy_rate: number; sell_rate: number; fetched_at: string }[])
          .map((r) => ({ at: new Date(r.fetched_at).getTime(), v: r.market_rate ? Number(r.market_rate) : (Number(r.buy_rate) + Number(r.sell_rate)) / 2 }))
          .reverse());
      });
    return () => { on = false; };
  }, []);
  useEffect(() => {
    if (!current) return;
    setPts((p) => (p.length && p[p.length - 1].v === current ? p : [...p.filter((x) => x.at > Date.now() - 60 * 60_000), { at: Date.now(), v: current }]));
  }, [current]);
  return pts;
}

function Spark({ pts }: { pts: { at: number; v: number }[] }) {
  if (pts.length < 2) return null;
  const w = 140, h = 30;
  const vs = pts.map((p) => p.v), max = Math.max(...vs), min = Math.min(...vs), t0 = pts[0].at, t1 = pts[pts.length - 1].at;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v: number) => h - 3 - ((v - min) / Math.max(1e-6, max - min)) * (h - 6);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block", marginTop: 10, overflow: "visible" }}>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="var(--a-t1)" opacity={0.05} />
      <path d={d} fill="none" stroke="var(--a-t2)" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.at)} cy={y(last.v)} r={2.6} fill="var(--a-t1)" />
    </svg>
  );
}

/** Un chiffre qui se remet en place quand il change. */
const Tick = ({ v }: { v: string }) => <span key={v} className="cr-tick">{v}</span>;

/** Petit carillon (deux notes douces), seulement si le son est activé. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [[880, 0], [1320, 0.12]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.5);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.55);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch { /* son indisponible */ }
}

export default function ControlRoom({ orders, canStock }: { orders: AdminOrder[]; canStock: boolean }) {
  const rate = useUsdtRate({ live: true });
  const hist = useRateHistory(rate.live ? rate.base : 0);
  const members = useMembers();
  const { shifts } = useShifts();

  // L'heure avance chaque seconde (horloge) ; les délais se recalculent avec elle.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  // Connexion : un mot discret si elle tombe, puis « reconnecté ».
  const [online, setOnline] = useState(() => navigator.onLine);
  const [back, setBack] = useState(false);
  useEffect(() => {
    const up = () => { setOnline(true); setBack(true); window.setTimeout(() => setBack(false), 4000); };
    const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // Stock par réseau, relu chaque minute.
  const [stock, setStock] = useState<StockRow[] | null>(() => (canStock ? peekTreasury() : null));
  useEffect(() => {
    if (!canStock) return;
    const load = () => { loadTreasury().then(setStock).catch(() => undefined); };
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [canStock]);

  // Fil d'activité de l'équipe, en bas de l'écran.
  const [feed, setFeed] = useState<ActivityItem[]>(() => peekTeam<ActivityItem[]>("activity") ?? []);
  const loadFeed = useCallback(() => { loadActivity().then(setFeed).catch(() => undefined); }, []);
  useEffect(loadFeed, [loadFeed]);
  useTeamLive(loadFeed, ["team_tasks", "team_handoffs", "team_approvals"]);
  useEffect(() => { loadFeed(); }, [orders, loadFeed]);

  // Son et plein écran.
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) === "on"; } catch { return false; } });
  const toggleSound = () => setSound((v) => { try { localStorage.setItem(SOUND_KEY, v ? "off" : "on"); } catch { /* stockage indisponible */ } if (!v) chime(); return !v; });
  const [tv, setTv] = useState(() => new URLSearchParams(window.location.search).get("tv") === "1");
  const enterTv = () => {
    setTv(true);
    const url = new URL(window.location.href); url.searchParams.set("tv", "1"); window.history.replaceState(null, "", url);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const exitTv = useCallback(() => {
    setTv(false);
    const url = new URL(window.location.href); url.searchParams.delete("tv"); window.history.replaceState(null, "", url);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!tv) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") exitTv(); };
    const fs = () => { if (!document.fullscreenElement) exitTv(); };
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", fs);
    // L'écran du bureau ne s'endort pas tant que la salle de contrôle est en plein écran.
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const grab = () => { if (document.visibilityState === "visible") void nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => undefined); };
    grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fs);
      document.removeEventListener("visibilitychange", grab);
      void lock?.release().catch(() => undefined);
    };
  }, [tv, exitTv]);

  // Chiffres du jour (heure de Montréal).
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - 86_400_000));
  const stats = useMemo(() => {
    const t = Date.now();
    const of = (k: string) => orders.filter((o) => dayKey(new Date(createdAt(o, t))) === k);
    const todays = of(today).filter((o) => o.status !== "annule");
    const done = (list: AdminOrder[]) => list.filter((o) => o.status === "termine" && o.updatedAt).map((o) => mins(new Date(o.updatedAt!).getTime() - createdAt(o, t)));
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return {
      volume: todays.reduce((a, o) => a + o.cad, 0),
      count: todays.length,
      buys: todays.filter((o) => o.type === "buy").length,
      avg: avg(done(of(today))),
      avgY: avg(done(of(yesterday))),
      waiting: orders.filter((o) => ACTIVE.has(o.status)),
    };
  }, [orders, today, yesterday]);

  // Fil des commandes : en cours d'abord (la plus récente en haut), puis les dernières terminées du jour.
  const active = useMemo(() => orders.filter((o) => ACTIVE.has(o.status)).sort((a, b) => a.createdMinsAgo - b.createdMinsAgo), [orders]);
  const finished = useMemo(() => orders.filter((o) => !ACTIVE.has(o.status) && o.updatedAt && dayKey(new Date(o.updatedAt)) === today)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 6), [orders, today]);

  // Nouvelles commandes et changements d'état : une animation (et le carillon si activé).
  const seen = useRef<Map<string, string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!seen.current) { seen.current = new Map(orders.map((o) => [o.id, o.status])); return; }
    const added: string[] = [], changed: string[] = [];
    for (const o of orders) {
      const was = seen.current.get(o.id);
      if (was === undefined) added.push(o.id); else if (was !== o.status) changed.push(o.id);
      seen.current.set(o.id, o.status);
    }
    if (added.length) { setFresh((s) => new Set([...s, ...added])); if (sound) chime(); }
    if (changed.length) {
      setFlash(new Set(changed));
      const t = window.setTimeout(() => setFlash(new Set()), 1700);
      return () => window.clearTimeout(t);
    }
  }, [orders, sound]);

  // Équipe : qui est là, qui est de garde, combien de commandes chacun a terminées aujourd'hui.
  const onCall = useMemo(() => new Map(onCallNow(shifts ?? [], members).map(({ m, s }) => [m.userId, s])), [shifts, members, now - (now % 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) if (o.status === "termine" && o.assignedId && o.updatedAt && dayKey(new Date(o.updatedAt)) === today) m.set(o.assignedId, (m.get(o.assignedId) ?? 0) + 1);
    return m;
  }, [orders, today]);
  const team = useMemo(() => members.slice().sort((a, b) => {
    const rank = (x: typeof a) => (onCall.has(x.userId) ? 0 : x.status === "away" ? 2 : 1);
    return rank(a) - rank(b) || (doneBy.get(b.userId) ?? 0) - (doneBy.get(a.userId) ?? 0);
  }), [members, onCall, doneBy]);

  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(now));
  const dl = new Date(now).toLocaleDateString("fr-CA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  const dateLabel = dl.charAt(0).toUpperCase() + dl.slice(1);
  const maxStock = Math.max(1, ...(stock ?? []).map((s) => s.available ?? s.usdt ?? 0));

  const who = (o: AdminOrder) => {
    if (o.assignedId) {
      const m = members.find((x) => x.userId === o.assignedId);
      return <><TeamAvatar id={o.assignedId} name={m?.name ?? o.assignedTo ?? ""} size={24} />{firstName(m?.name ?? o.assignedTo ?? "")}</>;
    }
    if (o.autoSending || (o.status === "termine" && !o.assignedId)) return <span style={{ color: C.t2 }}>Système</span>;
    return <span style={{ color: C.t3 }}>Personne encore</span>;
  };
  const row = (o: AdminOrder, done: boolean) => {
    const age = mins(now - createdAt(o, now));
    const took = o.updatedAt ? mins(new Date(o.updatedAt).getTime() - createdAt(o, now)) : null;
    return (
      <div key={o.id} className={`cr-row${fresh.has(o.id) ? " cr-new" : ""}${flash.has(o.id) ? " cr-flash" : ""}`} data-done={done}>
        <span className="cr-side">{SIDE[o.type] ?? o.type}</span>
        <span className="cr-ref">{o.ref}{o.isTest && <span style={{ color: C.t3, fontSize: 12, marginLeft: 8 }}>essai</span>}</span>
        <span className="cr-amt">{nfCad.format(o.cad)} $<span>{nfUsdt.format(o.usdt)} USDT</span></span>
        <span className="cr-net">
          {o.network && <img src={`/coins/${o.network}.svg`} alt="" width={18} height={18} style={{ borderRadius: 99 }} />}
          {o.network ? NAME_BY_SLUG[o.network] ?? o.network : "–"}
        </span>
        <span className="cr-who">{who(o)}</span>
        <span className="cr-time">{done ? (took != null ? `en ${dur(took)}` : "") : `${dur(age)}`}<br /><span className="cr-st">{STATUS_META[o.status]?.label}</span></span>
      </div>
    );
  };

  const ticker = feed.slice(0, 14);
  const body = (
    <div className="cr">
      <style>{CR_CSS}</style>
      <div className="cr-top">
        <div>
          <h1 className="cr-title">Salle de contrôle</h1>
          <p className="cr-sub">
            <span className="cr-live" data-off={!online} aria-hidden />
            {online ? (back ? "Reconnecté" : "En direct") : "Connexion perdue, nouvelle tentative…"}
            <span aria-hidden>·</span><span>{dateLabel}</span><span aria-hidden>·</span>{clock}
          </p>
        </div>
        <div className="cr-acts">
          <button type="button" className="cr-link" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Volume2 style={{ width: 16, height: 16 }} /> : <VolumeX style={{ width: 16, height: 16 }} />}{sound ? "Son activé" : "Son coupé"}
          </button>
          {tv
            ? <button type="button" className="cr-go" onClick={exitTv}>Quitter le plein écran <Minimize2 style={{ width: 15, height: 15 }} /></button>
            : <button type="button" className="cr-go" onClick={enterTv}>Plein écran <Maximize2 style={{ width: 15, height: 15 }} /></button>}
        </div>
      </div>

      <div className="cr-kpis">
        <div className="cr-kpi">
          <p className="cr-lab">Achat · 1 USDT</p>
          <p className="cr-num"><Tick v={nfRate.format(rate.buy)} /><small>$</small></p>
          <Spark pts={hist} />
        </div>
        <div className="cr-kpi">
          <p className="cr-lab">Vente · 1 USDT</p>
          <p className="cr-num"><Tick v={nfRate.format(rate.sell)} /><small>$</small></p>
          <p className="cr-hint">Marché {nfRate.format(rate.base)} $</p>
        </div>
        <div className="cr-kpi">
          <p className="cr-lab">Volume du jour</p>
          <p className="cr-num"><Tick v={nfInt.format(Math.round(stats.volume))} /><small>$</small></p>
          <p className="cr-hint">{stats.count ? `${stats.buys} achat${stats.buys > 1 ? "s" : ""}, ${stats.count - stats.buys} vente${stats.count - stats.buys > 1 ? "s" : ""}` : "Pas encore de commande"}</p>
        </div>
        <div className="cr-kpi">
          <p className="cr-lab">Commandes du jour</p>
          <p className="cr-num"><Tick v={String(stats.count)} /></p>
          <p className="cr-hint">{finished.filter((o) => o.status === "termine").length} terminée{finished.filter((o) => o.status === "termine").length > 1 ? "s" : ""} récemment</p>
        </div>
        <div className="cr-kpi">
          <p className="cr-lab">Délai moyen</p>
          <p className="cr-num">{stats.avg != null ? <Tick v={dur(stats.avg)} /> : "–"}</p>
          <p className="cr-hint">{stats.avgY != null ? `Hier : ${dur(stats.avgY)}` : "De la commande à l'envoi"}</p>
        </div>
        <div className="cr-kpi">
          <p className="cr-lab">En cours</p>
          <p className="cr-num"><Tick v={String(stats.waiting.length)} /></p>
          <p className="cr-hint">{(() => { const n = stats.waiting.filter((o) => !o.assignedId && !o.autoSending).length; return n ? `${n} à prendre` : "Toutes prises en charge"; })()}</p>
        </div>
      </div>

      <div className="cr-main">
        <section aria-label="Commandes en direct">
          <div className="cr-h"><p className="cr-lab">Commandes en direct</p><p>{active.length} en cours</p></div>
          {active.length === 0 && <p className="cr-empty">Aucune commande en cours. Les nouvelles apparaîtront ici dès leur arrivée.</p>}
          {active.map((o) => row(o, false))}
          {finished.length > 0 && <>
            <p className="cr-sep">Terminées aujourd'hui</p>
            {finished.map((o) => row(o, true))}
          </>}
        </section>

        <aside className="cr-aside">
          {canStock && (
            <section aria-label="Stock par réseau">
              <div className="cr-h"><p className="cr-lab">Stock disponible</p><p>{stock?.[0]?.takenAt ? `relevé ${new Date(stock[0].takenAt).toLocaleTimeString("fr-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}` : ""}</p></div>
              {!stock && <p className="cr-empty">Lecture du stock…</p>}
              {stock?.map((s) => {
                const v = s.available ?? s.usdt ?? 0;
                const low = s.threshold > 0 && v < s.threshold;
                return (
                  <div key={s.network} className="cr-stock">
                    <div className="cr-stock-top">
                      {NET_LOGO[s.network] && <img src={`/coins/${NET_LOGO[s.network]}.svg`} alt="" width={18} height={18} style={{ borderRadius: 99 }} />}
                      {NET_NAME[s.network] ?? s.network}
                      <b>{nfUsdt.format(Math.round(v))} <span style={{ color: C.t3, fontWeight: 400, fontSize: 12 }}>USDT</span></b>
                    </div>
                    <div className="cr-bar"><i data-low={low} style={{ width: `${Math.max(2, (v / maxStock) * 100)}%` }} /></div>
                    <p className="cr-stock-sub">{s.reserved > 0 ? `${nfUsdt.format(s.reserved)} réservés par ${s.reservedN} achat${s.reservedN > 1 ? "s" : ""}` : "Rien de réservé"}{low ? " · sous le seuil" : ""}</p>
                  </div>
                );
              })}
            </section>
          )}
          <section aria-label="L'équipe">
            <div className="cr-h"><p className="cr-lab">L'équipe</p><p>{members.filter((m) => m.status !== "away").length} en ligne</p></div>
            {team.map((m) => {
              const s = onCall.get(m.userId);
              const n = doneBy.get(m.userId) ?? 0;
              return (
                <div key={m.userId} className="cr-mem" style={{ opacity: m.status === "away" ? 0.55 : 1 }}>
                  <TeamAvatar id={m.userId} name={m.name} size={34} presence />
                  <div style={{ minWidth: 0 }}>
                    <p className="n">{firstName(m.name)}</p>
                    <p className="s">{s ? `De garde jusqu'à ${hourLabel(s.ends)}` : m.status === "away" ? "Absent" : m.status === "busy" ? "Occupé" : "Disponible"}</p>
                  </div>
                  <b>{n}<small>{n > 1 ? "terminées" : "terminée"}</small></b>
                </div>
              );
            })}
          </section>
        </aside>
      </div>

      {ticker.length > 0 && (
        <div className="cr-ticker" aria-label="Activité de l'équipe">
          <div className="cr-track" style={{ ["--cr-speed" as string]: `${Math.max(40, ticker.length * 9)}s` }}>
            {[...ticker, ...ticker].map((f, i) => (
              <span key={`${f.at}-${i}`} className="cr-item" aria-hidden={i >= ticker.length}>
                {f.actorId ? <TeamAvatar id={f.actorId} name={f.actorName} size={20} /> : null}
                <span style={{ color: C.t1 }}>{f.actorId ? firstName(f.actorName) : f.actorName}</span>{f.text}
                <em>{new Date(f.at).toLocaleTimeString("fr-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}</em>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  // Plein écran : posé directement sur la page (hors de la mise en page et de ses animations).
  return tv ? createPortal(<div className="cr-tv admin-scope" style={{ fontFamily: FONT, colorScheme: "inherit" }}>{body}</div>, document.body) : body;
}

